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
  /** Smart cut: re-encode only segment boundaries, stream-copy the rest (default: true) */
  smartCut: boolean;
  /** Video codec for re-encoding (default: libx264) */
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
  smartCut: true,
  videoCodec: "libx264",
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

let cachedFfprobePath: string | null = null;

/**
 * Get the ffprobe command to use.
 * Prefers system ffprobe, falls back to Remotion's bundled version.
 */
async function getFfprobeCommand(): Promise<string> {
  if (cachedFfprobePath !== null) {
    return cachedFfprobePath;
  }

  try {
    const proc = spawn(["ffprobe", "-version"], { stdout: "pipe", stderr: "pipe" });
    const exitCode = await proc.exited;
    if (exitCode === 0) {
      cachedFfprobePath = "ffprobe";
      return cachedFfprobePath;
    }
  } catch {
    // Ignore and fall through to fallback
  }

  cachedFfprobePath = "npx remotion ffprobe";
  return cachedFfprobePath;
}

/**
 * Get keyframe timestamps from a video file using ffprobe.
 * Uses -skip_frame nokey to only decode keyframes (much faster than full decode).
 * Returns sorted array of keyframe timestamps in seconds.
 */
async function getKeyframeTimes(input: string): Promise<number[]> {
  const ffprobe = await getFfprobeCommand();
  const cmd = [
    ffprobe,
    `-select_streams v:0`,
    `-skip_frame nokey`,
    `-show_entries frame=pkt_pts_time`,
    `-of csv=p=0`,
    `"${input}"`,
  ].join(" ");

  const proc = spawn(["sh", "-c", cmd], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutChunks: string[] = [];
  const decoder = new TextDecoder();

  const stdoutPromise = (async () => {
    const reader = proc.stdout.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        stdoutChunks.push(decoder.decode(value, { stream: true }));
      }
    } catch {
      // Ignore read errors
    }
  })();

  // Consume stderr to prevent buffer hang
  const stderrPromise = (async () => {
    const reader = proc.stderr.getReader();
    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      // Ignore read errors
    }
  })();

  const [exitCode] = await Promise.all([proc.exited, stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(`ffprobe keyframe scan failed with exit code ${exitCode}`);
  }

  const output = stdoutChunks.join("");
  const keyframes = output
    .trim()
    .split("\n")
    .map((line) => parseFloat(line.trim()))
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);

  return keyframes;
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
  const { codecCopy, smartCut, videoCodec, audioCodec, crf } = {
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

  if (!codecCopy && smartCut) {
    // Smart cut: re-encode only edges, stream-copy the bulk (fast + frame-accurate)
    await cutWithSmartSeeking(input, segments, output, {
      videoCodec,
      audioCodec,
      crf,
      onProgress: config.onProgress,
      totalDurationSec,
    });
  } else {
    // codecCopy=true → stream copy (fast, keyframe-imprecise)
    // codecCopy=false + smartCut=false → full re-encode (slow, frame-accurate)
    await cutWithInputSeeking(input, segments, output, {
      codecCopy,
      videoCodec,
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
    videoCodec: string;
    audioCodec: string;
    crf: number;
    onProgress?: ProgressCallback;
    totalDurationSec?: number;
  },
): Promise<void> {
  const { codecCopy, videoCodec, audioCodec, crf, onProgress, totalDurationSec } = opts;
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

      // Use -ss BEFORE -i for fast input seeking (seeks at demuxer level)
      // Then use -t for duration (more reliable than -to with input seeking)
      const duration = seg.endTime - seg.startTime;

      let cmd: string;
      if (codecCopy) {
        // Codec copy: very fast but cuts only at keyframes
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
        // Re-encode: slower but frame-accurate cuts
        cmd = [
          `${ffmpeg} -y`,
          `-ss ${seg.startTime}`,
          `-i "${input}"`,
          `-t ${duration}`,
          `-c:v ${videoCodec} -crf ${crf} -preset fast`,
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

      await execAsync(cmd, { onProgress: segmentProgress, totalDurationSec: duration });
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
 * Smart cut: re-encode only the frames at segment boundaries (where there's no keyframe),
 * and stream-copy the bulk of each segment (~95% of the video).
 * This achieves frame-accurate cuts with near stream-copy speed.
 */
async function cutWithSmartSeeking(
  input: string,
  segments: Segment[],
  output: string,
  opts: {
    videoCodec: string;
    audioCodec: string;
    crf: number;
    onProgress?: ProgressCallback;
    totalDurationSec?: number;
  },
): Promise<void> {
  const { videoCodec, audioCodec, crf, onProgress, totalDurationSec } = opts;
  const tempDir = join(tmpdir(), `reelforge-smartcut-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
  const ffmpeg = await getFfmpegCommand();

  try {
    // Step 1: Scan keyframes
    if (onProgress) {
      onProgress({ percent: 0, time: "Analizando keyframes...", speed: "..." });
    }
    const keyframes = await getKeyframeTimes(input);

    if (onProgress) {
      onProgress({ percent: 2, time: `${keyframes.length} keyframes encontrados`, speed: "..." });
    }

    const allPartFiles: string[] = [];
    let partIndex = 0;
    let processedDuration = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];

      // Find first keyframe >= seg.startTime
      const kfStartIdx = keyframes.findIndex((kf) => kf >= seg.startTime);
      const kfStart = kfStartIdx !== -1 ? keyframes[kfStartIdx] : undefined;

      // Find last keyframe <= seg.endTime
      let kfEndIdx = -1;
      for (let k = keyframes.length - 1; k >= 0; k--) {
        if (keyframes[k] <= seg.endTime) {
          kfEndIdx = k;
          break;
        }
      }
      const kfEnd = kfEndIdx !== -1 ? keyframes[kfEndIdx] : undefined;

      // Check if we have usable keyframes within the segment
      const hasUsableKeyframes =
        kfStart !== undefined &&
        kfEnd !== undefined &&
        kfStart < seg.endTime &&
        kfStart <= kfEnd;

      if (!hasUsableKeyframes) {
        // No keyframes in segment — re-encode the whole thing (it's short)
        const partFile = join(tempDir, `part_${(partIndex++).toString().padStart(5, "0")}.mp4`);
        allPartFiles.push(partFile);
        const duration = seg.endTime - seg.startTime;

        const cmd = [
          `${ffmpeg} -y`,
          `-ss ${seg.startTime}`,
          `-i "${input}"`,
          `-t ${duration}`,
          `-c:v ${videoCodec} -crf ${crf} -preset fast`,
          `-c:a ${audioCodec}`,
          `-avoid_negative_ts make_zero`,
          `"${partFile}"`,
        ].join(" ");

        const segProgress = onProgress && totalDurationSec
          ? (p: { percent: number; time: string; speed: string }) => {
              const base = ((processedDuration / totalDurationSec) * 98) + 2;
              const contrib = (duration / totalDurationSec) * 98 * (p.percent / 100);
              onProgress({
                percent: Math.min(98, Math.round(base + contrib)),
                time: `Seg ${i + 1}/${segments.length} (re-encode)`,
                speed: p.speed,
              });
            }
          : undefined;

        await execAsync(cmd, { onProgress: segProgress, totalDurationSec: duration });
        processedDuration += duration;
        continue;
      }

      // Part A: re-encode [startTime, kfStart) if start is not on a keyframe
      if (seg.startTime < kfStart) {
        const partFile = join(tempDir, `part_${(partIndex++).toString().padStart(5, "0")}.mp4`);
        allPartFiles.push(partFile);
        const duration = kfStart - seg.startTime;

        const cmd = [
          `${ffmpeg} -y`,
          `-ss ${seg.startTime}`,
          `-i "${input}"`,
          `-t ${duration}`,
          `-c:v ${videoCodec} -crf ${crf} -preset fast`,
          `-c:a ${audioCodec}`,
          `-avoid_negative_ts make_zero`,
          `"${partFile}"`,
        ].join(" ");

        const partProgress = onProgress && totalDurationSec
          ? (p: { percent: number; time: string; speed: string }) => {
              const base = ((processedDuration / totalDurationSec) * 98) + 2;
              const contrib = (duration / totalDurationSec) * 98 * (p.percent / 100);
              onProgress({
                percent: Math.min(98, Math.round(base + contrib)),
                time: `Seg ${i + 1}/${segments.length} (borde inicio)`,
                speed: p.speed,
              });
            }
          : undefined;

        await execAsync(cmd, { onProgress: partProgress, totalDurationSec: duration });
        processedDuration += duration;
      }

      // Part B: stream copy [kfStart, kfEnd) — the bulk
      if (kfStart < kfEnd) {
        const partFile = join(tempDir, `part_${(partIndex++).toString().padStart(5, "0")}.mp4`);
        allPartFiles.push(partFile);
        const duration = kfEnd - kfStart;

        const cmd = [
          `${ffmpeg} -y`,
          `-ss ${kfStart}`,
          `-i "${input}"`,
          `-t ${duration}`,
          `-c copy`,
          `-avoid_negative_ts make_zero`,
          `"${partFile}"`,
        ].join(" ");

        await execAsync(cmd);
        processedDuration += duration;

        // Stream copy is nearly instant — report progress immediately
        if (onProgress && totalDurationSec) {
          onProgress({
            percent: Math.min(98, Math.round(((processedDuration / totalDurationSec) * 98) + 2)),
            time: `Seg ${i + 1}/${segments.length} (copy)`,
            speed: "instant",
          });
        }
      }

      // Part C: re-encode [kfEnd, endTime] if end is not on a keyframe
      if (kfEnd < seg.endTime) {
        const partFile = join(tempDir, `part_${(partIndex++).toString().padStart(5, "0")}.mp4`);
        allPartFiles.push(partFile);
        const duration = seg.endTime - kfEnd;

        const cmd = [
          `${ffmpeg} -y`,
          `-ss ${kfEnd}`,
          `-i "${input}"`,
          `-t ${duration}`,
          `-c:v ${videoCodec} -crf ${crf} -preset fast`,
          `-c:a ${audioCodec}`,
          `-avoid_negative_ts make_zero`,
          `"${partFile}"`,
        ].join(" ");

        const partProgress = onProgress && totalDurationSec
          ? (p: { percent: number; time: string; speed: string }) => {
              const base = ((processedDuration / totalDurationSec) * 98) + 2;
              const contrib = (duration / totalDurationSec) * 98 * (p.percent / 100);
              onProgress({
                percent: Math.min(98, Math.round(base + contrib)),
                time: `Seg ${i + 1}/${segments.length} (borde fin)`,
                speed: p.speed,
              });
            }
          : undefined;

        await execAsync(cmd, { onProgress: partProgress, totalDurationSec: duration });
        processedDuration += duration;
      }
    }

    // Concatenate all parts
    const concatFile = join(tempDir, "concat.txt");
    const concatContent = allPartFiles.map((f) => `file '${f}'`).join("\n");
    writeFileSync(concatFile, concatContent);

    if (onProgress) {
      onProgress({ percent: 99, time: "Concatenando...", speed: "..." });
    }

    const concatCmd = [
      `${ffmpeg} -y`,
      `-f concat -safe 0`,
      `-i "${concatFile}"`,
      `-c copy`,
      `"${output}"`,
    ].join(" ");

    await execAsync(concatCmd);
  } finally {
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
