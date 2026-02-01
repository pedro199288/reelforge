/**
 * Caption cleanup utilities for Whisper output
 * Fixes common issues: long durations, low confidence words, false starts, repeated phrases
 */

/**
 * @typedef {Object} Caption
 * @property {string} text
 * @property {number} startMs
 * @property {number} endMs
 * @property {number|null} timestampMs
 * @property {number} confidence
 */

/**
 * Cleans up captions by fixing timing issues and filtering low confidence words
 * @param {Caption[]} captions - Raw captions from Whisper
 * @param {Object} options - Cleanup options
 * @param {number} [options.minConfidence=0.15] - Minimum confidence threshold
 * @param {number} [options.maxWordDurationMs=800] - Maximum duration for a single word
 * @param {Array} [options._log] - Internal log array for tracking removed words
 * @returns {Caption[]} Cleaned captions
 */
export function cleanupCaptions(captions, options = {}) {
  const {
    minConfidence = 0.15,
    maxWordDurationMs = 800,
    _log,
  } = options;

  if (captions.length === 0) return [];

  const cleaned = [];

  for (let i = 0; i < captions.length; i++) {
    const caption = captions[i];

    // 1. Skip very low confidence words (likely hallucinations)
    if (caption.confidence < minConfidence) {
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

    // 3. Fix absurdly long durations (cap at maxWordDurationMs)
    const duration = caption.endMs - caption.startMs;
    const correctedEndMs =
      duration > maxWordDurationMs
        ? caption.startMs + maxWordDurationMs
        : caption.endMs;

    // 4. Ensure no overlap with previous caption
    if (cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];
      if (prev.endMs > caption.startMs) {
        prev.endMs = Math.max(prev.startMs + 50, caption.startMs - 10);
      }
    }

    cleaned.push({
      ...caption,
      endMs: correctedEndMs,
    });
  }

  return cleaned;
}

/**
 * Removes repeated phrase patterns (e.g., when someone records multiple takes)
 * @param {Caption[]} captions
 * @param {Array} [log] - Optional log array for tracking removed phrases
 * @returns {Caption[]}
 */
export function removeRepeatedPhrases(captions, log) {
  if (captions.length < 5) return captions;

  const result = [];
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
 * @param {Caption[]} captions
 * @param {Array} [log] - Optional log array for tracking removed false starts
 * @returns {Caption[]}
 */
export function removeFalseStarts(captions, log) {
  if (captions.length < 3) return captions;

  const result = [];
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
      const falseStartWords = [];
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
      const nextWords = [];
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
 * Find if there's a repeated phrase starting at index
 * @param {Caption[]} captions
 * @param {number} startIndex
 * @returns {number} Length of repeated phrase (0 if none)
 */
function findRepeatedPhraseLength(captions, startIndex) {
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
 * @param {Caption[]} captions
 * @param {number} startIndex
 * @param {number} phraseLength
 * @returns {number}
 */
function countPhraseRepetitions(captions, startIndex, phraseLength) {
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

/**
 * Check if two phrases are similar (80% word match)
 * @param {string} phrase1
 * @param {string} phrase2
 * @returns {boolean}
 */
function arePhrasesSimilar(phrase1, phrase2) {
  const words1 = phrase1.split(/\s+/);
  const words2 = phrase2.split(/\s+/);

  if (words1.length !== words2.length) return false;

  let matches = 0;
  for (let i = 0; i < words1.length; i++) {
    if (words1[i] === words2[i]) matches++;
  }

  return matches / words1.length >= 0.8;
}

/**
 * Full cleanup pipeline
 * @param {Caption[]} captions
 * @param {Object} options
 * @param {Array} [options.log] - Optional array that will be filled with removal reasons
 * @returns {Caption[]}
 */
export function fullCleanup(captions, options = {}) {
  const log = options.log ?? [];
  let result = cleanupCaptions(captions, { ...options, _log: log });
  result = removeFalseStarts(result, log);
  result = removeRepeatedPhrases(result, log);
  return result;
}
