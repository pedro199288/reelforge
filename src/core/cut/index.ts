import { spawn } from "bun";
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import type { Segment } from "../silence/segments";

/** Progress callback for FFmpeg operations */
export type ProgressCallback = (progress: { percent: number; time: string; speed: string }) => void;

/**
 * Parse FFmpeg progress from stderr line
 * FFmpeg outputs lines like: frame= 123 fps= 45 q=28.0 size= 1234kB time=00:00:05.12 bitrate= 123.4kbits/s speed=1.23x
 */
function parseFfmpegProgress(line: string, totalDurationSec: number): { percent: number; time: string; speed: string } | null {
  const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
  const speedMatch = line.match(/speed=\s*([\d.]+)x/);

  if (!timeMatch) return null;

  const hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const seconds = parseInt(timeMatch[3], 10);
  const centiseconds = parseInt(timeMatch[4], 10);

  const currentTimeSec = hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
  const percent = totalDurationSec > 0 ? Math.min(99, Math.round((currentTimeSec / totalDurationSec) * 100)) : 0;
  const time = `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`;
  const speed = speedMatch ? `${speedMatch[1]}x` : "...";

  return { percent, time, speed };
}

/**
 * Execute a shell command asynchronously using Bun's spawn
 * This prevents blocking the event loop during long FFmpeg operations
 */
async function execAsync(
  cmd: string,
  options?: { onProgress?: ProgressCallback; totalDurationSec?: number }
): Promise<void> {
  const proc = spawn(["sh", "-c", cmd], {
    stdout: "pipe",
    stderr: "pipe",
  });

  // Must consume stderr while process runs (FFmpeg writes progress to stderr)
  // If we don't read it, the buffer fills up and the process hangs
  const stderrChunks: string[] = [];
  const decoder = new TextDecoder();
  let lastProgressUpdate = 0;

  const stderrPromise = (async () => {
    const reader = proc.stderr.getReader();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        stderrChunks.push(text);

        // Parse FFmpeg progress if callback provided
        if (options?.onProgress && options?.totalDurationSec) {
          buffer += text;
          // FFmpeg uses \r for progress updates
          const lines = buffer.split(/[\r\n]/);
          buffer = lines.pop() || "";

          for (const line of lines) {
            const progress = parseFfmpegProgress(line, options.totalDurationSec);
            if (progress) {
              // Throttle updates to avoid overwhelming SSE
              const now = Date.now();
              if (now - lastProgressUpdate > 500) {
                lastProgressUpdate = now;
                options.onProgress(progress);
              }
            }
          }
        }
      }
    } catch {
      // Ignore read errors
    }
  })();

  // Also consume stdout to prevent buffer issues
  const stdoutPromise = (async () => {
    const reader = proc.stdout.getReader();
    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      // Ignore read errors
    }
  })();

  // Wait for process and stream consumption
  const [exitCode] = await Promise.all([proc.exited, stderrPromise, stdoutPromise]);

  if (exitCode !== 0) {
    const stderr = stderrChunks.join("");
    throw new Error(`Command failed with exit code ${exitCode}: ${stderr.slice(0, 500)}`);
  }
}

export interface CutConfig {
  /** Use codec copy for faster processing (may be less precise at cut points) */
  codecCopy: boolean;
  /** Video codec: "auto" detects hardware encoder, or force "libx264" / "h264_videotoolbox" */
  videoCodec: string;
  /** Audio codec for re-encoding (default: aac) */
  audioCodec: string;
  /** CRF value for quality (lower = better, default: 18) */
  crf: number;
  /** Callback for progress updates during FFmpeg processing */
  onProgress?: ProgressCallback;
  /** Total duration of the output video in seconds (needed for progress calculation) */
  totalDurationSec?: number;
}

const DEFAULT_CONFIG: CutConfig = {
  codecCopy: false,
  videoCodec: "auto",
  audioCodec: "aac",
  crf: 18,
};

let cachedFfmpegPath: string | null = null;

/**
 * Get the ffmpeg command to use.
 * Prefers system ffmpeg for better filter support, falls back to Remotion's bundled version.
 */
async function getFfmpegCommand(): Promise<string> {
  if (cachedFfmpegPath !== null) {
    return cachedFfmpegPath;
  }

  try {
    const proc = spawn(["ffmpeg", "-version"], { stdout: "pipe", stderr: "pipe" });
    const exitCode = await proc.exited;
    if (exitCode === 0) {
      cachedFfmpegPath = "ffmpeg";
      return cachedFfmpegPath;
    }
  } catch {
    // Ignore and fall through to fallback
  }

  cachedFfmpegPath = "npx remotion ffmpeg";
  return cachedFfmpegPath;
}

interface HardwareEncoderInfo {
  codec: string;
  isHardware: boolean;
  qualityArgs: string[];
}

let cachedEncoder: HardwareEncoderInfo | null = null;

/**
 * Map CRF (0-51) to videotoolbox quality (1-100).
 * CRF 0 (lossless) → 100, CRF 51 (worst) → 1, CRF 18 → ~65
 */
function mapCrfToQuality(crf: number): number {
  return Math.max(1, Math.min(100, Math.round(100 - crf * 1.96)));
}

/**
 * Build FFmpeg video encoder arguments from encoder info.
 */
function buildVideoEncoderArgs(encoder: HardwareEncoderInfo): string {
  return `-c:v ${encoder.codec} ${encoder.qualityArgs.join(" ")}`;
}

/**
 * Detect if h264_videotoolbox (macOS GPU encoder) is available.
 * Falls back to libx264 software encoding.
 * Result is cached for the process lifetime.
 */
async function detectHardwareEncoder(crf: number): Promise<HardwareEncoderInfo> {
  if (cachedEncoder) return cachedEncoder;

  const ffmpeg = await getFfmpegCommand();
  try {
    const proc = spawn(
      ["sh", "-c", `${ffmpeg} -f lavfi -i nullsrc=s=64x64:d=0.1 -c:v h264_videotoolbox -q:v 65 -f null -`],
      { stdout: "pipe", stderr: "pipe" },
    );

    // Consume streams to prevent buffer hang
    const consumeStream = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
      try {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      } catch {}
    };

    await Promise.all([
      consumeStream(proc.stdout.getReader()),
      consumeStream(proc.stderr.getReader()),
    ]);

    const exitCode = await proc.exited;
    if (exitCode === 0) {
      cachedEncoder = {
        codec: "h264_videotoolbox",
        isHardware: true,
        qualityArgs: ["-q:v", String(mapCrfToQuality(crf))],
      };
      return cachedEncoder;
    }
  } catch {
    // Fall through to software fallback
  }

  cachedEncoder = {
    codec: "libx264",
    isHardware: false,
    qualityArgs: ["-crf", String(crf), "-preset", "fast"],
  };
  return cachedEncoder;
}

/**
 * Cut and concatenate video segments using FFmpeg
 * Removes silences by keeping only the specified segments
 */
export async function cutVideo(
  input: string,
  segments: Segment[],
  output: string,
  config: Partial<CutConfig> = {},
): Promise<void> {
  const { codecCopy, videoCodec, audioCodec, crf } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  if (!existsSync(input)) {
    throw new Error(`Input video not found: ${input}`);
  }

  if (segments.length === 0) {
    throw new Error("No segments provided");
  }

  // Ensure output directory exists
  const outputDir = dirname(output);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Calculate total output duration for progress tracking
  const totalDurationSec = config.totalDurationSec ?? segments.reduce((sum, s) => sum + s.duration, 0);

  if (codecCopy) {
    // Stream copy: very fast but cuts only at keyframes
    await cutWithInputSeeking(input, segments, output, {
      codecCopy: true,
      audioCodec,
      crf,
      onProgress: config.onProgress,
      totalDurationSec,
    });
  } else {
    // Re-encode with hardware acceleration when available
    const encoder = videoCodec === "auto"
      ? await detectHardwareEncoder(crf)
      : {
          codec: videoCodec,
          isHardware: videoCodec === "h264_videotoolbox",
          qualityArgs: videoCodec === "h264_videotoolbox"
            ? ["-q:v", String(mapCrfToQuality(crf))]
            : ["-crf", String(crf), "-preset", "fast"],
        };

    await cutWithInputSeeking(input, segments, output, {
      codecCopy: false,
      encoder,
      audioCodec,
      crf,
      onProgress: config.onProgress,
      totalDurationSec,
    });
  }
}

/**
 * Cut using input seeking (-ss before -i) for each segment
 * This is MUCH faster than filter_complex because FFmpeg seeks directly to each point
 * instead of decoding the entire input video from the beginning
 */
async function cutWithInputSeeking(
  input: string,
  segments: Segment[],
  output: string,
  opts: {
    codecCopy: boolean;
    encoder?: HardwareEncoderInfo;
    audioCodec: string;
    crf: number;
    onProgress?: ProgressCallback;
    totalDurationSec?: number;
  },
): Promise<void> {
  const { codecCopy, encoder, audioCodec, crf, onProgress, totalDurationSec } = opts;
  const tempDir = join(tmpdir(), `reelforge-cut-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
  const ffmpeg = await getFfmpegCommand();

  let processedDuration = 0;

  try {
    const segmentFiles: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const segmentFile = join(tempDir, `segment_${i.toString().padStart(4, "0")}.mp4`);
      segmentFiles.push(segmentFile);

      const duration = seg.endTime - seg.startTime;

      let cmd: string;
      if (codecCopy) {
        cmd = [
          `${ffmpeg} -y`,
          `-ss ${seg.startTime}`,
          `-i "${input}"`,
          `-t ${duration}`,
          `-c copy`,
          `-avoid_negative_ts make_zero`,
          `"${segmentFile}"`,
        ].join(" ");
      } else {
        const encoderArgs = encoder ? buildVideoEncoderArgs(encoder) : `-c:v libx264 -crf ${crf} -preset fast`;
        cmd = [
          `${ffmpeg} -y`,
          `-ss ${seg.startTime}`,
          `-i "${input}"`,
          `-t ${duration}`,
          encoderArgs,
          `-c:a ${audioCodec}`,
          `-avoid_negative_ts make_zero`,
          `"${segmentFile}"`,
        ].join(" ");
      }

      // Progress callback for this segment
      const segmentProgress = onProgress && totalDurationSec
        ? (p: { percent: number; time: string; speed: string }) => {
            const basePercent = (processedDuration / totalDurationSec) * 100;
            const segmentContribution = (seg.duration / totalDurationSec) * p.percent;
            onProgress({
              percent: Math.min(99, Math.round(basePercent + segmentContribution)),
              time: `Segmento ${i + 1}/${segments.length}`,
              speed: p.speed,
            });
          }
        : undefined;

      try {
        await execAsync(cmd, { onProgress: segmentProgress, totalDurationSec: duration });
      } catch (err) {
        // If hardware encoder fails on this segment, retry with software fallback
        if (!codecCopy && encoder?.isHardware) {
          const fallbackArgs = `-c:v libx264 -crf ${crf} -preset fast`;
          const fallbackCmd = cmd.replace(buildVideoEncoderArgs(encoder), fallbackArgs);
          await execAsync(fallbackCmd, { onProgress: segmentProgress, totalDurationSec: duration });
        } else {
          throw err;
        }
      }

      processedDuration += seg.duration;

      // Report segment completion
      if (onProgress && totalDurationSec) {
        onProgress({
          percent: Math.min(98, Math.round((processedDuration / totalDurationSec) * 100)),
          time: `Segmento ${i + 1}/${segments.length} completado`,
          speed: "...",
        });
      }
    }

    // Create concat file list
    const concatFile = join(tempDir, "concat.txt");
    const concatContent = segmentFiles.map((f) => `file '${f}'`).join("\n");
    writeFileSync(concatFile, concatContent);

    if (onProgress) {
      onProgress({ percent: 99, time: "Concatenando...", speed: "..." });
    }

    // Concatenate all segments - always use codec copy here since segments are already processed
    const concatCmd = [
      `${ffmpeg} -y`,
      `-f concat -safe 0`,
      `-i "${concatFile}"`,
      `-c copy`,
      `"${output}"`,
    ].join(" ");

    await execAsync(concatCmd);
  } finally {
    // Cleanup temp files
    rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * Selection data exported from the UI segment selector
 */
export interface SelectionData {
  videoSrc: string;
  segments: Segment[];
  selectedIndices: number[];
  createdAt: string;
}

/**
 * Export video with only the selected segments from the UI
 * Takes selection data (from JSON file or UI) and generates the final cut
 */
export async function exportSelection(
  selection: SelectionData,
  output: string,
  config: Partial<CutConfig> = {},
): Promise<void> {
  const { videoSrc, segments, selectedIndices } = selection;

  if (!existsSync(videoSrc)) {
    throw new Error(`Input video not found: ${videoSrc}`);
  }

  if (selectedIndices.length === 0) {
    throw new Error("No segments selected");
  }

  // Filter and sort segments by their original index to maintain order
  const selectedSet = new Set(selectedIndices);
  const selectedSegments = segments
    .filter((s) => selectedSet.has(s.index))
    .sort((a, b) => a.index - b.index);

  if (selectedSegments.length === 0) {
    throw new Error("No valid segments found for the selected indices");
  }

  await cutVideo(videoSrc, selectedSegments, output, config);
}

/**
 * Load selection data from a JSON file
 */
export function loadSelection(selectionPath: string): SelectionData {
  if (!existsSync(selectionPath)) {
    throw new Error(`Selection file not found: ${selectionPath}`);
  }

  const content = readFileSync(selectionPath, "utf-8");
  const data = JSON.parse(content) as SelectionData;

  // Validate required fields
  if (!data.videoSrc || !Array.isArray(data.segments) || !Array.isArray(data.selectedIndices)) {
    throw new Error("Invalid selection file format");
  }

  return data;
}

export type { Segment };
