/**
 * Audio analysis for take scoring
 *
 * Uses ffmpeg to extract audio metrics for quality assessment
 */

import { spawn } from "node:child_process";

/**
 * Audio analysis results
 */
export interface AudioAnalysis {
  /** Signal-to-noise ratio estimate (dB) - higher is better */
  snr: number;
  /** Average volume (dB) */
  avgVolume: number;
  /** Volume variance - lower means more consistent */
  volumeVariance: number;
  /** Number of detected pauses */
  pauseCount: number;
  /** Total duration of pauses (ms) */
  pauseDurationMs: number;
  /** Peak volume (dB) */
  peakVolume: number;
  /** Duration analyzed (ms) */
  durationMs: number;
}

/**
 * Run ffmpeg command and capture output
 */
async function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);

    let stderr = "";

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stderr); // ffmpeg outputs to stderr
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Parse volumedetect output from ffmpeg
 */
function parseVolumeDetect(output: string): { mean: number; max: number } {
  const meanMatch = output.match(/mean_volume:\s*([-\d.]+)\s*dB/);
  const maxMatch = output.match(/max_volume:\s*([-\d.]+)\s*dB/);

  return {
    mean: meanMatch ? parseFloat(meanMatch[1]) : -30,
    max: maxMatch ? parseFloat(maxMatch[1]) : 0,
  };
}

/**
 * Parse astats output from ffmpeg for detailed statistics
 */
export function parseAstats(output: string): {
  rmsLevel: number;
  peakLevel: number;
  dcOffset: number;
  dynamicRange: number;
} {
  const rmsMatch = output.match(/RMS level dB:\s*([-\d.]+)/);
  const peakMatch = output.match(/Peak level dB:\s*([-\d.]+)/);
  const dcMatch = output.match(/DC offset:\s*([-\d.]+)/);
  const dynamicMatch = output.match(/Dynamic range:\s*([-\d.]+)/);

  return {
    rmsLevel: rmsMatch ? parseFloat(rmsMatch[1]) : -30,
    peakLevel: peakMatch ? parseFloat(peakMatch[1]) : 0,
    dcOffset: dcMatch ? parseFloat(dcMatch[1]) : 0,
    dynamicRange: dynamicMatch ? parseFloat(dynamicMatch[1]) : 60,
  };
}

/**
 * Parse silencedetect output to count pauses
 */
function parseSilenceDetect(output: string): {
  pauseCount: number;
  totalSilenceDuration: number;
} {
  const silenceMatches = output.matchAll(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g);

  let pauseCount = 0;
  let totalSilenceDuration = 0;

  for (const match of silenceMatches) {
    pauseCount++;
    totalSilenceDuration += parseFloat(match[2]);
  }

  return { pauseCount, totalSilenceDuration };
}

/**
 * Analyze audio quality for a segment of video
 *
 * @param videoPath - Path to the video file
 * @param startMs - Start time in milliseconds
 * @param endMs - End time in milliseconds
 * @returns Audio analysis results
 */
export async function analyzeAudio(
  videoPath: string,
  startMs: number,
  endMs: number
): Promise<AudioAnalysis> {
  const startSec = startMs / 1000;
  const durationSec = (endMs - startMs) / 1000;
  const durationMs = endMs - startMs;

  // Common args for seeking and duration
  const seekArgs = ["-ss", startSec.toFixed(3), "-t", durationSec.toFixed(3)];

  try {
    // Run volume detection
    const volumeOutput = await runFfmpeg([
      "-i",
      videoPath,
      ...seekArgs,
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-",
    ]);

    const volume = parseVolumeDetect(volumeOutput);

    // Run silence detection for pause counting
    const silenceOutput = await runFfmpeg([
      "-i",
      videoPath,
      ...seekArgs,
      "-af",
      "silencedetect=n=-40dB:d=0.3",
      "-f",
      "null",
      "-",
    ]);

    const silence = parseSilenceDetect(silenceOutput);

    // Estimate SNR (rough approximation)
    // SNR ≈ peak - noise floor, where noise floor is estimated from mean
    const noiseFloorEstimate = Math.min(volume.mean + 6, -50); // Assume noise floor is at least -50dB
    const snr = volume.max - noiseFloorEstimate;

    // Estimate variance from dynamic range (difference between peak and mean)
    const volumeVariance = Math.abs(volume.max - volume.mean);

    return {
      snr,
      avgVolume: volume.mean,
      volumeVariance,
      pauseCount: silence.pauseCount,
      pauseDurationMs: silence.totalSilenceDuration * 1000,
      peakVolume: volume.max,
      durationMs,
    };
  } catch (error) {
    // Return default values if ffmpeg fails
    console.error("Audio analysis failed:", error);
    return {
      snr: 20, // Reasonable default
      avgVolume: -20,
      volumeVariance: 10,
      pauseCount: 0,
      pauseDurationMs: 0,
      peakVolume: -6,
      durationMs,
    };
  }
}

/**
 * Batch analyze multiple segments for efficiency
 *
 * @param videoPath - Path to the video file
 * @param segments - Array of [startMs, endMs] tuples
 * @returns Array of analysis results
 */
export async function analyzeMultipleSegments(
  videoPath: string,
  segments: Array<[number, number]>
): Promise<AudioAnalysis[]> {
  // Process sequentially to avoid overwhelming ffmpeg
  const results: AudioAnalysis[] = [];

  for (const [startMs, endMs] of segments) {
    const analysis = await analyzeAudio(videoPath, startMs, endMs);
    results.push(analysis);
  }

  return results;
}
