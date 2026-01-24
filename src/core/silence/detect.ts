import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

export interface SilenceRange {
  start: number;
  end: number;
  duration: number;
}

export interface SilenceConfig {
  thresholdDb: number; // Default: -35
  minDurationSec: number; // Default: 0.5
}

const DEFAULT_CONFIG: SilenceConfig = {
  thresholdDb: -40, // Moderate threshold - adjust based on your recording setup
  minDurationSec: 0.5, // Minimum silence duration to cut
};

/**
 * Get video duration using ffprobe
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
  const result = execSync(
    `npx remotion ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
    { encoding: "utf-8" },
  );
  const duration = parseFloat(result.trim());
  if (isNaN(duration)) {
    throw new Error(`Could not parse duration from: ${result}`);
  }
  return duration;
}

/**
 * Detect silences in a video file using FFmpeg's silencedetect filter
 */
export async function detectSilences(
  videoPath: string,
  config: Partial<SilenceConfig> = {},
): Promise<SilenceRange[]> {
  const { thresholdDb, minDurationSec } = { ...DEFAULT_CONFIG, ...config };

  if (!existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  let output: string;
  try {
    // Run ffmpeg and capture stderr (where silencedetect outputs)
    // -y to overwrite /dev/null without prompting
    // Redirect stderr to stdout with 2>&1 so we can capture it
    output = execSync(
      `npx remotion ffmpeg -y -i "${videoPath}" -af "silencedetect=noise=${thresholdDb}dB:d=${minDurationSec}" -vn -f wav /dev/null 2>&1`,
      { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 },
    );
  } catch (error: unknown) {
    // execSync throws on non-zero exit, but we can still parse the output
    // The error object contains stdout which has our silence info
    const err = error as { stdout?: string; stderr?: string };
    output = err.stdout || err.stderr || "";
  }

  return parseSilenceOutput(output);
}

/**
 * Parse FFmpeg silencedetect output to extract silence ranges
 */
function parseSilenceOutput(output: string): SilenceRange[] {
  const silences: SilenceRange[] = [];
  let currentStart: number | null = null;

  const lines = output.split("\n");
  for (const line of lines) {
    // Parse silence_start: 1.234
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    if (startMatch) {
      currentStart = parseFloat(startMatch[1]);
    }

    // Parse silence_end: 2.567 | silence_duration: 1.333
    const endMatch = line.match(
      /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/,
    );
    if (endMatch && currentStart !== null) {
      silences.push({
        start: currentStart,
        end: parseFloat(endMatch[1]),
        duration: parseFloat(endMatch[2]),
      });
      currentStart = null;
    }
  }

  return silences;
}
