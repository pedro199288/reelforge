/**
 * Align script sentences with transcription to get sentence boundaries
 */
import type { Caption } from "../script/align";
import { normalize, similarity } from "../script/align";
import { splitIntoSentences } from "../script/takes";
import type { AlignedSentence } from "./types";

interface CaptionWord {
  word: string;
  normalized: string;
  startMs: number;
  endMs: number;
  captionIndex: number;
}

/**
 * Build word array from captions with timestamps
 */
function buildCaptionWords(captions: Caption[]): CaptionWord[] {
  const captionWords: CaptionWord[] = [];

  for (let ci = 0; ci < captions.length; ci++) {
    const cap = captions[ci];
    const words = cap.text.split(/\s+/).filter(Boolean);
    const wordDuration = (cap.endMs - cap.startMs) / Math.max(words.length, 1);

    for (let wi = 0; wi < words.length; wi++) {
      captionWords.push({
        word: words[wi],
        normalized: normalize(words[wi]),
        startMs: cap.startMs + wi * wordDuration,
        endMs: cap.startMs + (wi + 1) * wordDuration,
        captionIndex: ci,
      });
    }
  }

  return captionWords;
}

/**
 * Find the best match for a sentence in the caption words
 */
function findSentenceBoundary(
  sentenceWords: string[],
  captionWords: CaptionWord[],
  searchStartIndex: number
): { startIdx: number; endIdx: number; confidence: number } | null {
  if (sentenceWords.length === 0 || captionWords.length === 0) {
    return null;
  }

  const minMatch = Math.max(2, Math.floor(sentenceWords.length * 0.4));
  let bestMatch: { startIdx: number; endIdx: number; confidence: number } | null = null;

  // Search from the given start index
  for (let i = searchStartIndex; i <= captionWords.length - minMatch; i++) {
    let matchedWords = 0;
    let totalSimilarity = 0;
    let lastMatchedIdx = i;

    for (let sw = 0; sw < sentenceWords.length && i + sw < captionWords.length; sw++) {
      const sim = similarity(sentenceWords[sw], captionWords[i + sw].normalized);
      totalSimilarity += sim;
      if (sim > 0.6) {
        matchedWords++;
        lastMatchedIdx = i + sw;
      }
    }

    const avgSimilarity = totalSimilarity / sentenceWords.length;
    const matchRatio = matchedWords / sentenceWords.length;

    // Require reasonable match
    if (matchRatio >= 0.4 && avgSimilarity >= 0.35) {
      const endIdx = Math.min(i + sentenceWords.length - 1, lastMatchedIdx);

      if (!bestMatch || avgSimilarity > bestMatch.confidence) {
        bestMatch = {
          startIdx: i,
          endIdx,
          confidence: avgSimilarity,
        };
      }

      // If we found a good match, don't search too far ahead
      if (avgSimilarity >= 0.7) {
        break;
      }
    }
  }

  return bestMatch;
}

/**
 * Align script sentences with captions to get sentence boundaries with timestamps
 *
 * @param scriptText - The script text to split into sentences
 * @param captions - Transcription captions with timestamps
 * @returns Array of aligned sentences with timestamps
 */
export function alignSentences(
  scriptText: string,
  captions: Caption[]
): AlignedSentence[] {
  const sentences = splitIntoSentences(scriptText);
  const captionWords = buildCaptionWords(captions);
  const alignedSentences: AlignedSentence[] = [];

  if (sentences.length === 0 || captionWords.length === 0) {
    return alignedSentences;
  }

  let searchStartIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentenceText = sentences[i];
    const sentenceWords = normalize(sentenceText).split(/\s+/).filter(Boolean);

    if (sentenceWords.length === 0) continue;

    const match = findSentenceBoundary(sentenceWords, captionWords, searchStartIndex);

    if (match) {
      alignedSentences.push({
        index: i,
        text: sentenceText,
        startMs: captionWords[match.startIdx].startMs,
        endMs: captionWords[match.endIdx].endMs,
        confidence: match.confidence,
      });

      // Move search start to after this match for the next sentence
      searchStartIndex = match.endIdx + 1;
    }
  }

  return alignedSentences;
}

/**
 * Get sentence boundaries as time ranges
 */
export function getSentenceBoundaries(
  sentences: AlignedSentence[]
): Array<{ startMs: number; endMs: number }> {
  return sentences.map((s) => ({
    startMs: s.startMs,
    endMs: s.endMs,
  }));
}
