import { spawn } from "bun";
import { existsSync } from "node:fs";
import type { SilenceRange } from "./detect";

export interface EnvelopeSilenceConfig {
  amplitudeThreshold: number; // 0-1, default 0.05
  minDurationSec: number; // default 0.3
  internalRate?: number; // default 8000
  samplesPerSecond?: number; // default 200
}

const DEFAULTS: EnvelopeSilenceConfig = {
  amplitudeThreshold: 0.05,
  minDurationSec: 0.3,
  internalRate: 8000,
  samplesPerSecond: 200,
};

/**
 * Detect silences using amplitude envelope analysis.
 *
 * Same technique used for waveform rendering:
 * 1. Extract mono audio at 8kHz as raw f32le via FFmpeg
 * 2. Peak-detection per block → normalized envelope 0-1
 * 3. Samples below amplitudeThreshold → silence
 * 4. Group consecutive silent samples into SilenceRange[]
 * 5. Filter ranges shorter than minDurationSec
 */
export async function detectSilencesEnvelope(
  videoPath: string,
  config: Partial<EnvelopeSilenceConfig> = {},
): Promise<SilenceRange[]> {
  const {
    amplitudeThreshold,
    minDurationSec,
    internalRate,
    samplesPerSecond,
  } = { ...DEFAULTS, ...config };

  if (!existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  // Extract mono audio at internalRate as raw f32le samples
  const proc = spawn({
    cmd: [
      "ffmpeg",
      "-i",
      videoPath,
      "-ac",
      "1",
      "-ar",
      String(internalRate!),
      "-f",
      "f32le",
      "-",
    ],
    stdout: "pipe",
    stderr: "ignore",
  });

  const chunks: Uint8Array[] = [];
  const reader = proc.stdout.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  await proc.exited;

  // Combine chunks into a single Float32Array
  const totalBytes = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const samples = new Float32Array(
    combined.buffer,
    combined.byteOffset,
    Math.floor(combined.byteLength / 4),
  );

  if (samples.length === 0) {
    return [];
  }

  // Peak-detection: divide into blocks, take max absolute value per block
  const blockSize = Math.max(1, Math.floor(internalRate! / samplesPerSecond!));
  const envelopeLength = Math.ceil(samples.length / blockSize);
  const envelope = new Float32Array(envelopeLength);

  let globalMax = 0;
  for (let i = 0; i < envelopeLength; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, samples.length);
    let peak = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(samples[j]);
      if (abs > peak) peak = abs;
    }
    envelope[i] = peak;
    if (peak > globalMax) globalMax = peak;
  }

  // Normalize to 0-1
  if (globalMax > 0) {
    for (let i = 0; i < envelopeLength; i++) {
      envelope[i] /= globalMax;
    }
  }

  // Identify silence regions: consecutive samples below threshold
  const secondsPerSample = 1 / samplesPerSecond!;
  const silences: SilenceRange[] = [];
  let silenceStart: number | null = null;

  for (let i = 0; i < envelopeLength; i++) {
    const isSilent = envelope[i] < amplitudeThreshold;

    if (isSilent && silenceStart === null) {
      silenceStart = i * secondsPerSample;
    } else if (!isSilent && silenceStart !== null) {
      const silenceEnd = i * secondsPerSample;
      const duration = silenceEnd - silenceStart;
      if (duration >= minDurationSec) {
        silences.push({ start: silenceStart, end: silenceEnd, duration });
      }
      silenceStart = null;
    }
  }

  // Handle trailing silence
  if (silenceStart !== null) {
    const silenceEnd = envelopeLength * secondsPerSample;
    const duration = silenceEnd - silenceStart;
    if (duration >= minDurationSec) {
      silences.push({ start: silenceStart, end: silenceEnd, duration });
    }
  }

  return silences;
}
