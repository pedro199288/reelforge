/**
 * Caption cleanup utilities for Whisper output (TypeScript port of cleanup.mjs)
 * Fixes common issues: long durations, low confidence words, false starts, repeated phrases
 */

import type { Caption } from "@/core/script/align";
import {
  splitAtSilenceGaps,
  DEFAULT_SILENCE_GAP_MS,
} from "./split-at-silence";

export interface CleanupLogEntry {
  reason:
    | "low_confidence"
    | "sound_effect"
    | "repeated_phrase"
    | "false_start"
    | "phantom_echo";
  text: string;
  startMs: number;
  confidence?: number;
  skippedUntilMs?: number;
}

export interface CleanupOptions {
  minConfidence?: number;
  maxWordDurationMs?: number;
  _log?: CleanupLogEntry[];
}

/**
 * Applies timing-only fixes: caps word durations and prevents overlaps.
 * Does NOT remove any words — useful for raw mode where all words must be preserved.
 */
export function fixTimingOnly(
  captions: Caption[],
  options: { maxWordDurationMs?: number } = {},
): Caption[] {
  const { maxWordDurationMs = 800 } = options;

  if (captions.length === 0) return [];

  const fixed: Caption[] = [];

  for (let i = 0; i < captions.length; i++) {
    const caption = captions[i];

    // 1. Cap absurdly long durations at maxWordDurationMs
    const duration = caption.endMs - caption.startMs;
    const correctedEndMs =
      duration > maxWordDurationMs
        ? caption.startMs + maxWordDurationMs
        : caption.endMs;

    // 2. Ensure no overlap with previous caption
    if (fixed.length > 0) {
      const prev = fixed[fixed.length - 1];
      if (prev.endMs > caption.startMs) {
        prev.endMs = Math.max(prev.startMs + 50, caption.startMs - 10);
      }
    }

    fixed.push({
      ...caption,
      endMs: correctedEndMs,
    });
  }

  return fixed;
}

/**
 * Cleans up captions by filtering low confidence words and fixing timing issues
 */
export function cleanupCaptions(
  captions: Caption[],
  options: CleanupOptions = {},
): Caption[] {
  const { minConfidence = 0.15, maxWordDurationMs = 800, _log } = options;

  if (captions.length === 0) return [];

  // First pass: filter out unwanted words
  const filtered: Caption[] = [];

  for (let i = 0; i < captions.length; i++) {
    const caption = captions[i];

    // 1. Skip very low confidence words (likely hallucinations)
    if (caption.confidence != null && caption.confidence < minConfidence) {
      if (_log) {
        _log.push({
          reason: "low_confidence",
          text: caption.text.trim(),
          confidence: caption.confidence,
          startMs: caption.startMs,
        });
      }
      continue;
    }

    // 2. Skip sound effects/annotations like [Sonido del agua]
    if (caption.text.includes("[") || caption.text.includes("]")) {
      if (_log) {
        _log.push({
          reason: "sound_effect",
          text: caption.text.trim(),
          startMs: caption.startMs,
        });
      }
      continue;
    }

    filtered.push(caption);
  }

  // Second pass: fix timing on the filtered set
  return fixTimingOnly(filtered, { maxWordDurationMs });
}

/**
 * Removes repeated phrase patterns (e.g., when someone records multiple takes)
 */
export function removeRepeatedPhrases(
  captions: Caption[],
  log?: CleanupLogEntry[],
): Caption[] {
  if (captions.length < 5) return captions;

  const result: Caption[] = [];
  let i = 0;

  while (i < captions.length) {
    // Look ahead to find potential phrase repetitions
    const phraseLength = findRepeatedPhraseLength(captions, i);

    if (phraseLength > 0) {
      // Keep only the last occurrence of the repeated phrase
      const repeatCount = countPhraseRepetitions(captions, i, phraseLength);
      const skipCount = (repeatCount - 1) * phraseLength;

      if (log && skipCount > 0) {
        const skippedText = captions
          .slice(i, i + skipCount)
          .map((c) => c.text.trim())
          .join(" ");
        log.push({
          reason: "repeated_phrase",
          text: skippedText,
          startMs: captions[i].startMs,
        });
      }

      // Skip all but the last repetition
      i += skipCount;
    }

    if (i < captions.length) {
      result.push(captions[i]);
      i++;
    }
  }

  return result;
}

/**
 * Removes false starts and stutters (e.g., "Si estás... Si estás empezando")
 * Detects patterns like: word1 word2... word1 word2 word3
 * Requires at least 2 words before the "..." to consider it a false start.
 */
export function removeFalseStarts(
  captions: Caption[],
  log?: CleanupLogEntry[],
): Caption[] {
  if (captions.length < 3) return captions;

  const result: Caption[] = [];
  let skipUntil = -1;

  for (let i = 0; i < captions.length; i++) {
    if (i < skipUntil) continue;

    const current = captions[i];

    // Check if any word in the next few ends with ... (false start indicator)
    // Reduced look-ahead from 4 to 3 to reduce false positives
    let falseStartEnd = -1;
    for (let j = i; j < Math.min(i + 3, captions.length); j++) {
      const t = captions[j].text.trim();
      if (t.endsWith("...") || t.endsWith("\u2026")) {
        falseStartEnd = j;
        break;
      }
    }

    if (falseStartEnd > -1) {
      // Get the false start phrase (from i to falseStartEnd)
      const falseStartWords: string[] = [];
      for (let j = i; j <= falseStartEnd; j++) {
        const w = captions[j].text
          .trim()
          .toLowerCase()
          .replace(/\.{2,}|\u2026/g, "");
        if (w) falseStartWords.push(w);
      }

      // Require at least 2 words — a single word with "..." is not enough evidence
      if (falseStartWords.length < 2) {
        result.push(current);
        continue;
      }

      const falseStartPhrase = falseStartWords.join(" ");

      // Look at the next few words to see if they repeat this phrase
      const nextWords: string[] = [];
      for (
        let j = falseStartEnd + 1;
        j < Math.min(falseStartEnd + 8, captions.length);
        j++
      ) {
        nextWords.push(
          captions[j].text
            .trim()
            .toLowerCase()
            .replace(/[.,!?]/g, ""),
        );
      }
      const nextPhrase = nextWords.join(" ");

      // If the next phrase contains the false start words, skip the false start
      if (
        falseStartPhrase.length > 2 &&
        nextPhrase.includes(falseStartPhrase)
      ) {
        if (log) {
          const skippedText = captions
            .slice(i, falseStartEnd + 1)
            .map((c) => c.text.trim())
            .join(" ");
          log.push({
            reason: "false_start",
            text: skippedText,
            startMs: captions[i].startMs,
            skippedUntilMs: captions[falseStartEnd + 1]?.startMs,
          });
        }
        skipUntil = falseStartEnd + 1;
        continue;
      }
    }

    result.push(current);
  }

  return result;
}

/**
 * Removes phantom echo words — single words isolated between silence gaps
 * that match the start of the following speech chunk.
 *
 * Pattern: [silence] "si" [940ms gap] "si estás empezando..."
 * Whisper sometimes detects a breath or pre-articulation as the upcoming word.
 */
export function removePhantomEchoes(
  captions: Caption[],
  options?: { silenceGapMs?: number; log?: CleanupLogEntry[] },
): Caption[] {
  if (captions.length < 2) return captions;

  const silenceGapMs = options?.silenceGapMs ?? DEFAULT_SILENCE_GAP_MS;
  const chunks = splitAtSilenceGaps(captions, silenceGapMs);

  const result: Caption[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (chunk.length === 1) {
      const word = normalize(chunk[0].text);
      const nextChunk = chunks[i + 1];

      if (word.length > 0 && nextChunk && nextChunk.length > 0) {
        const nextWord = normalize(nextChunk[0].text);

        if (word === nextWord) {
          options?.log?.push({
            reason: "phantom_echo",
            text: chunk[0].text.trim(),
            startMs: chunk[0].startMs,
            confidence: chunk[0].confidence,
          });
          continue; // skip this phantom word
        }
      }
    }

    result.push(...chunk);
  }

  return result;
}

/**
 * Full cleanup pipeline — applies all cleanup steps in order:
 * 1. cleanupCaptions (confidence filter + sound effects + timing)
 * 2. removePhantomEchoes
 * 3. removeFalseStarts
 * 4. removeRepeatedPhrases
 */
export function fullCleanup(
  captions: Caption[],
  options: { log?: CleanupLogEntry[]; silenceGapMs?: number } & CleanupOptions = {},
): Caption[] {
  const log = options.log ?? [];
  let result = cleanupCaptions(captions, { ...options, _log: log });
  result = removePhantomEchoes(result, {
    silenceGapMs: options.silenceGapMs,
    log,
  });
  result = removeFalseStarts(result, log);
  result = removeRepeatedPhrases(result, log);
  return result;
}

// --- Internal helpers ---

/**
 * Find if there's a repeated phrase starting at index
 * Returns length of repeated phrase (0 if none)
 */
function findRepeatedPhraseLength(captions: Caption[], startIndex: number): number {
  // Try phrase lengths from 3 to 10 words
  for (let len = 3; len <= Math.min(10, captions.length - startIndex); len++) {
    if (startIndex + len * 2 > captions.length) continue;

    const phrase1 = captions
      .slice(startIndex, startIndex + len)
      .map((c) => c.text.trim().toLowerCase())
      .join(" ");

    const phrase2 = captions
      .slice(startIndex + len, startIndex + len * 2)
      .map((c) => c.text.trim().toLowerCase())
      .join(" ");

    // Check if phrases are similar (allowing for minor differences)
    if (arePhrasesSimilar(phrase1, phrase2)) {
      return len;
    }
  }

  return 0;
}

/**
 * Count how many times a phrase repeats
 */
function countPhraseRepetitions(
  captions: Caption[],
  startIndex: number,
  phraseLength: number,
): number {
  const basePhrase = captions
    .slice(startIndex, startIndex + phraseLength)
    .map((c) => c.text.trim().toLowerCase())
    .join(" ");

  let count = 1;
  let checkIndex = startIndex + phraseLength;

  while (checkIndex + phraseLength <= captions.length) {
    const nextPhrase = captions
      .slice(checkIndex, checkIndex + phraseLength)
      .map((c) => c.text.trim().toLowerCase())
      .join(" ");

    if (arePhrasesSimilar(basePhrase, nextPhrase)) {
      count++;
      checkIndex += phraseLength;
    } else {
      break;
    }
  }

  return count;
}

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.,!?…\u2026]/g, "");
}

/**
 * Check if two phrases are similar (80% word match)
 */
function arePhrasesSimilar(phrase1: string, phrase2: string): boolean {
  const words1 = phrase1.split(/\s+/);
  const words2 = phrase2.split(/\s+/);

  if (words1.length !== words2.length) return false;

  let matches = 0;
  for (let i = 0; i < words1.length; i++) {
    if (words1[i] === words2[i]) matches++;
  }

  return matches / words1.length >= 0.8;
}
