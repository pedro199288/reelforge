/**
 * CLI de procesamiento completo de video
 * Ejecuta: detectSilences → silencesToSegments → cutVideo → sub.mjs → metadata
 *
 * Uso: bun process-video.ts <video-path>
 * Ejemplo: bun process-video.ts public/mi-video.mp4
 * Output: public/mi-video-cut.mp4 + public/subs/mi-video-cut.json
 */

import { execSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

import {
  detectSilences,
  getVideoDuration,
  silencesToSegments,
  getTotalDuration,
  type Segment,
} from "./src/core/silence";
import { cutVideo } from "./src/core/cut";

interface ProcessingConfig {
  thresholdDb: number;
  minDurationSec: number;
  paddingSec: number;
  codecCopy: boolean;
  crf: number;
}

interface ProcessingMetadata {
  originalVideo: string;
  outputVideo: string;
  subtitlesPath: string;
  originalDuration: number;
  editedDuration: number;
  timeSaved: number;
  percentSaved: number;
  segmentsCount: number;
  segments: Segment[];
  config: ProcessingConfig;
  processedAt: string;
}

const DEFAULT_CONFIG: ProcessingConfig = {
  thresholdDb: -35,
  minDurationSec: 0.5,
  paddingSec: 0.05,
  codecCopy: false,
  crf: 18,
};

function generateOutputPath(inputPath: string): string {
  const dir = dirname(inputPath);
  const ext = extname(inputPath);
  const name = basename(inputPath, ext);
  return join(dir, `${name}-cut${ext}`);
}

function generateMetadataPath(outputPath: string): string {
  const dir = dirname(outputPath);
  const ext = extname(outputPath);
  const name = basename(outputPath, ext);
  return join(dir, "metadata", `${name}.json`);
}

async function processVideo(
  videoPath: string,
  config: Partial<ProcessingConfig> = {},
): Promise<ProcessingMetadata> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Validate input
  if (!existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  const outputPath = generateOutputPath(videoPath);
  const metadataPath = generateMetadataPath(outputPath);

  console.log(`\n📹 Processing: ${videoPath}\n`);

  // Step 1: Get video duration
  console.log("1️⃣  Getting video duration...");
  const originalDuration = await getVideoDuration(videoPath);
  console.log(`   Duration: ${originalDuration.toFixed(2)}s\n`);

  // Step 2: Detect silences
  console.log(
    `2️⃣  Detecting silences (threshold: ${cfg.thresholdDb}dB, min: ${cfg.minDurationSec}s)...`,
  );
  const silences = await detectSilences(videoPath, {
    thresholdDb: cfg.thresholdDb,
    minDurationSec: cfg.minDurationSec,
  });
  console.log(`   Found ${silences.length} silences\n`);

  // Step 3: Convert to segments
  console.log("3️⃣  Converting silences to segments...");
  const segments = silencesToSegments(silences, originalDuration, {
    paddingSec: cfg.paddingSec,
  });
  console.log(`   Generated ${segments.length} segments to keep\n`);

  // Step 4: Cut video
  console.log(`4️⃣  Cutting video → ${outputPath}`);
  console.log(`   Mode: ${cfg.codecCopy ? "fast (codec copy)" : "precise (re-encode)"}`);
  await cutVideo(videoPath, segments, outputPath, {
    codecCopy: cfg.codecCopy,
    crf: cfg.crf,
  });
  console.log("   ✓ Video cut complete\n");

  // Step 5: Generate subtitles
  console.log("5️⃣  Generating subtitles with Whisper...");
  const subsPath = join("public", "subs", `${basename(outputPath, extname(outputPath))}.json`);
  try {
    execSync(`node sub.mjs "${outputPath}"`, {
      encoding: "utf-8",
      stdio: "inherit",
      cwd: process.cwd(),
    });
    console.log(`   ✓ Subtitles saved to ${subsPath}\n`);
  } catch (error) {
    console.error("   ⚠️  Subtitle generation failed, continuing...\n");
  }

  // Step 6: Save metadata
  console.log("6️⃣  Saving metadata...");
  const editedDuration = getTotalDuration(segments);
  const timeSaved = originalDuration - editedDuration;
  const percentSaved = (timeSaved / originalDuration) * 100;

  const metadata: ProcessingMetadata = {
    originalVideo: videoPath,
    outputVideo: outputPath,
    subtitlesPath: subsPath,
    originalDuration,
    editedDuration,
    timeSaved,
    percentSaved,
    segmentsCount: segments.length,
    segments,
    config: cfg,
    processedAt: new Date().toISOString(),
  };

  const metadataDir = dirname(metadataPath);
  if (!existsSync(metadataDir)) {
    mkdirSync(metadataDir, { recursive: true });
  }
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`   ✓ Metadata saved to ${metadataPath}\n`);

  // Summary
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 Summary");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`   Original:  ${originalDuration.toFixed(2)}s`);
  console.log(`   Edited:    ${editedDuration.toFixed(2)}s`);
  console.log(`   Saved:     ${timeSaved.toFixed(2)}s (${percentSaved.toFixed(1)}%)`);
  console.log(`   Output:    ${outputPath}`);
  console.log(`   Subtitles: ${subsPath}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  return metadata;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
📹 ReelForge Video Processor

Usage:
  bun process-video.ts <video-path> [options]

Options:
  --threshold <dB>     Silence threshold in dB (default: -35)
  --min-silence <sec>  Minimum silence duration (default: 0.5)
  --padding <sec>      Padding around cuts (default: 0.05)
  --fast               Use codec copy (faster, less precise)
  --crf <value>        Quality for re-encode (default: 18, lower=better)

Examples:
  bun process-video.ts public/mi-video.mp4
  bun process-video.ts public/mi-video.mp4 --fast
  bun process-video.ts public/mi-video.mp4 --threshold -40 --min-silence 0.3
`);
    process.exit(0);
  }

  const videoPath = args[0];
  const config: Partial<ProcessingConfig> = {};

  // Parse CLI options
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--threshold":
        config.thresholdDb = parseFloat(args[++i]);
        break;
      case "--min-silence":
        config.minDurationSec = parseFloat(args[++i]);
        break;
      case "--padding":
        config.paddingSec = parseFloat(args[++i]);
        break;
      case "--fast":
        config.codecCopy = true;
        break;
      case "--crf":
        config.crf = parseInt(args[++i], 10);
        break;
    }
  }

  try {
    await processVideo(videoPath, config);
    console.log("✅ Processing complete!\n");
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}

main();
