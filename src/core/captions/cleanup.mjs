/**
 * Caption cleanup utilities for Whisper output
 * Fixes common issues: duplicates, long durations, low confidence words
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
 * Cleans up captions by removing duplicates and fixing timing issues
 * @param {Caption[]} captions - Raw captions from Whisper
 * @param {Object} options - Cleanup options
 * @param {number} [options.minConfidence=0.25] - Minimum confidence threshold
 * @param {number} [options.maxWordDurationMs=800] - Maximum duration for a single word
 * @param {number} [options.duplicateWindowMs=5000] - Window to detect duplicate phrases
 * @returns {Caption[]} Cleaned captions
 */
export function cleanupCaptions(captions, options = {}) {
  const {
    minConfidence = 0.25,
    maxWordDurationMs = 800,
    duplicateWindowMs = 5000,
  } = options;

  if (captions.length === 0) return [];

  const cleaned = [];
  const recentTexts = []; // Track recent texts to detect duplicates

  for (let i = 0; i < captions.length; i++) {
    const caption = captions[i];
    const text = caption.text.trim().toLowerCase();

    // 1. Skip very low confidence words (likely hallucinations)
    if (caption.confidence < minConfidence) {
      continue;
    }

    // 2. Skip sound effects/annotations like [Sonido del agua]
    if (caption.text.includes("[") || caption.text.includes("]")) {
      continue;
    }

    // 3. Detect and skip duplicate phrases within window
    const isDuplicate = recentTexts.some(
      (recent) =>
        recent.text === text &&
        caption.startMs - recent.startMs < duplicateWindowMs,
    );

    if (isDuplicate && text.length > 2) {
      // Allow short words like "si", "o", "y" to repeat
      continue;
    }

    // 4. Fix absurdly long durations (cap at maxWordDurationMs)
    const duration = caption.endMs - caption.startMs;
    const correctedEndMs =
      duration > maxWordDurationMs
        ? caption.startMs + maxWordDurationMs
        : caption.endMs;

    // 5. Ensure no overlap with previous caption
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

    // Track for duplicate detection
    recentTexts.push({ text, startMs: caption.startMs });

    // Keep only recent entries in the window
    while (
      recentTexts.length > 0 &&
      caption.startMs - recentTexts[0].startMs > duplicateWindowMs
    ) {
      recentTexts.shift();
    }
  }

  return cleaned;
}

/**
 * Removes repeated phrase patterns (e.g., when someone records multiple takes)
 * @param {Caption[]} captions
 * @returns {Caption[]}
 */
export function removeRepeatedPhrases(captions) {
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
 * @param {Caption[]} captions
 * @returns {Caption[]}
 */
export function removeFalseStarts(captions) {
  if (captions.length < 3) return captions;

  const result = [];
  let skipUntil = -1;

  for (let i = 0; i < captions.length; i++) {
    if (i < skipUntil) continue;

    const current = captions[i];
    const text = current.text.trim().toLowerCase();

    // Check if any word in the next few ends with ... (false start indicator)
    let falseStartEnd = -1;
    for (let j = i; j < Math.min(i + 4, captions.length); j++) {
      const t = captions[j].text.trim();
      if (t.endsWith("...") || t.endsWith("…")) {
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
          .replace(/\.{2,}|…/g, "");
        if (w) falseStartWords.push(w);
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
 * Check if two phrases are similar (90% word match)
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
 * @returns {Caption[]}
 */
export function fullCleanup(captions, options = {}) {
  let result = cleanupCaptions(captions, options);
  result = removeFalseStarts(result);
  result = removeRepeatedPhrases(result);
  return result;
}
