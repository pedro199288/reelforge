import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import type { Segment } from "../silence/segments";

export interface CutConfig {
  /** Use codec copy for faster processing (may be less precise at cut points) */
  codecCopy: boolean;
  /** Video codec for re-encoding (default: libx264) */
  videoCodec: string;
  /** Audio codec for re-encoding (default: aac) */
  audioCodec: string;
  /** CRF value for quality (lower = better, default: 18) */
  crf: number;
}

const DEFAULT_CONFIG: CutConfig = {
  codecCopy: false,
  videoCodec: "libx264",
  audioCodec: "aac",
  crf: 18,
};

let cachedFfmpegPath: string | null = null;

/**
 * Get the ffmpeg command to use.
 * Prefers system ffmpeg for better filter support, falls back to Remotion's bundled version.
 */
function getFfmpegCommand(): string {
  if (cachedFfmpegPath !== null) {
    return cachedFfmpegPath;
  }

  try {
    execSync("ffmpeg -version", { stdio: "pipe", encoding: "utf-8" });
    cachedFfmpegPath = "ffmpeg";
    return cachedFfmpegPath;
  } catch {
    cachedFfmpegPath = "npx remotion ffmpeg";
    return cachedFfmpegPath;
  }
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

  if (codecCopy) {
    await cutWithConcatDemuxer(input, segments, output);
  } else {
    await cutWithFilterComplex(input, segments, output, {
      videoCodec,
      audioCodec,
      crf,
    });
  }
}

/**
 * Cut using filter_complex with trim/concat filters
 * More precise cuts but requires re-encoding
 */
async function cutWithFilterComplex(
  input: string,
  segments: Segment[],
  output: string,
  opts: { videoCodec: string; audioCodec: string; crf: number },
): Promise<void> {
  const { videoCodec, audioCodec, crf } = opts;

  // Build filter_complex string
  const videoFilters: string[] = [];
  const audioFilters: string[] = [];
  const streamLabels: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    videoFilters.push(
      `[0:v]trim=start=${seg.startTime}:end=${seg.endTime},setpts=PTS-STARTPTS[v${i}]`,
    );
    audioFilters.push(
      `[0:a]atrim=start=${seg.startTime}:end=${seg.endTime},asetpts=PTS-STARTPTS[a${i}]`,
    );
    streamLabels.push(`[v${i}][a${i}]`);
  }

  const filterComplex = [
    ...videoFilters,
    ...audioFilters,
    `${streamLabels.join("")}concat=n=${segments.length}:v=1:a=1[outv][outa]`,
  ].join(";");

  const ffmpeg = getFfmpegCommand();
  const cmd = [
    `${ffmpeg} -y`,
    `-i "${input}"`,
    `-filter_complex "${filterComplex}"`,
    `-map "[outv]" -map "[outa]"`,
    `-c:v ${videoCodec} -crf ${crf}`,
    `-c:a ${audioCodec}`,
    `-preset fast`,
    `"${output}"`,
  ].join(" ");

  execSync(cmd, {
    encoding: "utf-8",
    stdio: "pipe",
    maxBuffer: 50 * 1024 * 1024,
  });
}

/**
 * Cut using concat demuxer with re-encoding for frame-accurate cuts
 * Each segment is re-encoded to ensure precise cut points without audio/video desync
 */
async function cutWithConcatDemuxer(
  input: string,
  segments: Segment[],
  output: string,
): Promise<void> {
  const tempDir = join(tmpdir(), `reelforge-cut-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
  const ffmpeg = getFfmpegCommand();

  try {
    const segmentFiles: string[] = [];

    // Extract each segment with re-encoding for precise cuts
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const segmentFile = join(tempDir, `segment_${i.toString().padStart(4, "0")}.mp4`);
      segmentFiles.push(segmentFile);

      // Use -ss after -i (input seeking) with trim filter for frame-accurate cuts
      // Re-encode to avoid keyframe alignment issues
      const cmd = [
        `${ffmpeg} -y`,
        `-i "${input}"`,
        `-vf "trim=start=${seg.startTime}:end=${seg.endTime},setpts=PTS-STARTPTS"`,
        `-af "atrim=start=${seg.startTime}:end=${seg.endTime},asetpts=PTS-STARTPTS"`,
        `-c:v libx264 -crf 18 -preset fast`,
        `-c:a aac`,
        `"${segmentFile}"`,
      ].join(" ");

      execSync(cmd, {
        encoding: "utf-8",
        stdio: "pipe",
        maxBuffer: 50 * 1024 * 1024,
      });
    }

    // Create concat file list
    const concatFile = join(tempDir, "concat.txt");
    const concatContent = segmentFiles
      .map((f) => `file '${f}'`)
      .join("\n");
    writeFileSync(concatFile, concatContent);

    // Concatenate segments - can use codec copy now since segments are already re-encoded
    const concatCmd = [
      `${ffmpeg} -y`,
      `-f concat -safe 0`,
      `-i "${concatFile}"`,
      `-c copy`,
      `"${output}"`,
    ].join(" ");

    execSync(concatCmd, {
      encoding: "utf-8",
      stdio: "pipe",
      maxBuffer: 50 * 1024 * 1024,
    });
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
