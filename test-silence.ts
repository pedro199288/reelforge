/**
 * Test script for silence detection
 * Run with: bun test-silence.ts <video-path>
 */

import {
  detectSilences,
  getVideoDuration,
  silencesToSegments,
  getTotalDuration,
} from "./src/core/silence";

async function main() {
  const videoPath = process.argv[2];

  if (!videoPath) {
    console.log("Usage: bun test-silence.ts <video-path>");
    console.log("Example: bun test-silence.ts public/sample-video.mp4");
    process.exit(1);
  }

  console.log(`\nAnalyzing: ${videoPath}\n`);

  // Get video duration
  console.log("Getting video duration...");
  const duration = await getVideoDuration(videoPath);
  console.log(`  Duration: ${duration.toFixed(2)}s\n`);

  // Detect silences
  console.log("Detecting silences (threshold: -50dB, min: 0.5s)...");
  const silences = await detectSilences(videoPath, {
    thresholdDb: -35,
    minDurationSec: 0.5,
  });

  console.log(`  Found ${silences.length} silences:\n`);
  silences.forEach((s, i) => {
    console.log(
      `    ${i + 1}. ${s.start.toFixed(2)}s - ${s.end.toFixed(2)}s (${s.duration.toFixed(2)}s)`,
    );
  });

  // Generate segments
  console.log("\nGenerating segments (content to keep)...");
  const segments = silencesToSegments(silences, duration);

  console.log(`  ${segments.length} segments:\n`);
  segments.forEach((s) => {
    console.log(
      `    ${s.index + 1}. ${s.startTime.toFixed(2)}s - ${s.endTime.toFixed(2)}s (${s.duration.toFixed(2)}s)`,
    );
  });

  // Summary
  const totalKept = getTotalDuration(segments);
  const totalCut = duration - totalKept;
  const percentSaved = ((totalCut / duration) * 100).toFixed(1);

  console.log("\n--- Summary ---");
  console.log(`  Original duration: ${duration.toFixed(2)}s`);
  console.log(`  After cuts:        ${totalKept.toFixed(2)}s`);
  console.log(
    `  Time saved:        ${totalCut.toFixed(2)}s (${percentSaved}%)`,
  );
}

main().catch(console.error);
