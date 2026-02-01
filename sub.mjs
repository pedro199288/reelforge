import { execSync } from "node:child_process";
import {
  existsSync,
  rmSync,
  writeFileSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import path from "path";
import {
  WHISPER_LANG,
  WHISPER_MODEL,
  WHISPER_PATH,
  WHISPER_VERSION,
} from "./whisper-config.mjs";
import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
  toCaptions,
} from "@remotion/install-whisper-cpp";
import { fullCleanup } from "./src/core/captions/cleanup.mjs";

/**
 * Clean script text by removing markers [zoom], [zoom:slow], {highlight}
 * and normalizing whitespace
 */
const cleanScriptForPrompt = (script) => {
  return script
    .replace(/\[zoom(?::\w+)?\]/g, "") // Remove [zoom] and [zoom:slow]
    .replace(/\{([^}]+)\}/g, "$1") // Replace {word} with just word
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
};

/**
 * Extract initial prompt from script for Whisper.
 * Whisper prompt is limited to ~224 tokens, so we take the first ~500 chars
 * which is enough to help with vocabulary, names, and context.
 */
const extractPromptFromScript = (script) => {
  const cleaned = cleanScriptForPrompt(script);
  // Take first ~500 characters (roughly 100-150 tokens)
  // This helps Whisper with vocabulary and proper nouns
  const maxLength = 500;
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  // Cut at word boundary
  const truncated = cleaned.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
};

const extractToTempAudioFile = (fileToTranscribe, tempOutFile) => {
  // Extracting audio from mp4 and save it as 16khz wav file
  // Added audio preprocessing:
  // - loudnorm: normalizes volume to -16 LUFS for consistent levels (helps Whisper accuracy)
  // Note: silenceremove filter is not available in Remotion's FFmpeg build
  execSync(
    `npx remotion ffmpeg -i "${fileToTranscribe}" -af "loudnorm=I=-16:LRA=11:TP=-1.5" -ar 16000 "${tempOutFile}" -y`,
    { stdio: ["ignore", "inherit"] },
  );
};

const subFile = async (filePath, fileName, folder, promptText = null) => {
  // Always save subtitles to public/subs/ directory
  const subsDir = path.join(process.cwd(), "public", "subs");
  if (!existsSync(subsDir)) {
    mkdirSync(subsDir, { recursive: true });
  }
  const outPath = path.join(subsDir, fileName.replace(".wav", ".json"));

  // Build additional args, optionally including prompt from script
  const additionalArgs = [
    ["--max-len", "1"], // Max 1 token per segment for better granularity
  ];

  if (promptText) {
    console.log(`  Using script prompt (${promptText.length} chars)`);
    additionalArgs.push(["--prompt", promptText]);
  }

  const whisperCppOutput = await transcribe({
    inputPath: filePath,
    model: WHISPER_MODEL,
    tokenLevelTimestamps: true,
    whisperPath: WHISPER_PATH,
    whisperCppVersion: WHISPER_VERSION,
    printOutput: false,
    translateToEnglish: false,
    language: WHISPER_LANG,
    splitOnWord: true,
    // Optimization parameters for better accuracy
    flashAttention: true,
    additionalArgs,
  });

  const { captions } = toCaptions({
    whisperCppOutput,
  });

  // Clean up captions: fix timing issues, filter low confidence, remove false starts/repeated phrases
  const log = [];
  const cleanedCaptions = fullCleanup(captions, {
    minConfidence: 0.15,
    maxWordDurationMs: 800,
    log,
  });

  console.log(
    `  Cleaned: ${captions.length} -> ${cleanedCaptions.length} captions`,
  );

  writeFileSync(outPath, JSON.stringify(cleanedCaptions, null, 2));

  // Save cleanup log alongside captions for debugging
  if (log.length > 0) {
    const logPath = outPath.replace(".json", ".cleanup-log.json");
    writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`  Cleanup log: ${log.length} items removed (${logPath})`);
  }
};

const processVideo = async (fullPath, entry, directory, promptText = null) => {
  if (
    !fullPath.endsWith(".mp4") &&
    !fullPath.endsWith(".webm") &&
    !fullPath.endsWith(".mkv") &&
    !fullPath.endsWith(".mov")
  ) {
    return;
  }

  const isTranscribed = existsSync(
    fullPath
      .replace(/.mp4$/, ".json")
      .replace(/.mkv$/, ".json")
      .replace(/.mov$/, ".json")
      .replace(/.webm$/, ".json")
      .replace("webcam", "subs"),
  );
  if (isTranscribed) {
    return;
  }
  let shouldRemoveTempDirectory = false;
  if (!existsSync(path.join(process.cwd(), "temp"))) {
    mkdirSync(`temp`);
    shouldRemoveTempDirectory = true;
  }
  console.log("Extracting audio from file", entry);

  const tempWavFileName = entry.split(".")[0] + ".wav";
  const tempOutFilePath = path.join(process.cwd(), `temp/${tempWavFileName}`);

  extractToTempAudioFile(fullPath, tempOutFilePath);
  await subFile(
    tempOutFilePath,
    tempWavFileName,
    path.relative("public", directory),
    promptText,
  );
  if (shouldRemoveTempDirectory) {
    rmSync(path.join(process.cwd(), "temp"), { recursive: true });
  }
};

const processDirectory = async (directory) => {
  const entries = readdirSync(directory).filter((f) => f !== ".DS_Store");

  for (const entry of entries) {
    const fullPath = path.join(directory, entry);
    const stat = lstatSync(fullPath);

    if (stat.isDirectory()) {
      await processDirectory(fullPath); // Recurse into subdirectories
    } else {
      await processVideo(fullPath, entry, directory);
    }
  }
};

await installWhisperCpp({ to: WHISPER_PATH, version: WHISPER_VERSION });
await downloadWhisperModel({ folder: WHISPER_PATH, model: WHISPER_MODEL });

// Parse arguments: node sub.mjs [--script <file>] <video-files...>
const args = process.argv.slice(2);
let scriptPath = null;
let promptText = null;
const videoArgs = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--script" && i + 1 < args.length) {
    scriptPath = args[i + 1];
    i++; // Skip next arg
  } else {
    videoArgs.push(args[i]);
  }
}

// Load and extract prompt from script if provided
if (scriptPath) {
  const fullScriptPath = path.isAbsolute(scriptPath)
    ? scriptPath
    : path.join(process.cwd(), scriptPath);
  if (existsSync(fullScriptPath)) {
    const rawScript = readFileSync(fullScriptPath, "utf-8");
    promptText = extractPromptFromScript(rawScript);
    console.log(`Loaded script from ${scriptPath}`);
  } else {
    console.warn(`Warning: Script file not found: ${scriptPath}`);
  }
}

const hasArgs = videoArgs.length > 0;

if (!hasArgs) {
  await processDirectory(path.join(process.cwd(), "public"));
  process.exit(0);
}

for (const arg of videoArgs) {
  const fullPath = path.isAbsolute(arg) ? arg : path.join(process.cwd(), arg);
  const stat = lstatSync(fullPath);

  if (stat.isDirectory()) {
    await processDirectory(fullPath);
    continue;
  }

  console.log(`Processing file ${fullPath}`);
  const directory = path.dirname(fullPath);
  const fileName = path.basename(fullPath);
  await processVideo(fullPath, fileName, directory, promptText);
}
