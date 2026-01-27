/**
 * Align script sentences with transcription to get sentence boundaries
 */
import type { Caption } from "../script/align";
import { normalize, similarity } from "../script/align";
import { splitIntoSentences } from "../script/takes";
import type { AlignedSentence, ScriptDeviation } from "./types";

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

interface SentenceMatch {
  startIdx: number;
  endIdx: number;
  confidence: number;
  transcribedText: string;
}

/**
 * Find the best match for a sentence in the caption words
 */
function findSentenceBoundary(
  sentenceWords: string[],
  captionWords: CaptionWord[],
  searchStartIndex: number
): SentenceMatch | null {
  if (sentenceWords.length === 0 || captionWords.length === 0) {
    return null;
  }

  const minMatch = Math.max(2, Math.floor(sentenceWords.length * 0.4));
  let bestMatch: SentenceMatch | null = null;

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
        // Extract the transcribed text for this match
        const transcribedText = captionWords
          .slice(i, endIdx + 1)
          .map((cw) => cw.word)
          .join(" ");

        bestMatch = {
          startIdx: i,
          endIdx,
          confidence: avgSimilarity,
          transcribedText,
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

export interface AlignSentencesOptions {
  /** Mark deviations when similarity is below this threshold (default: 0.7) */
  deviationThreshold?: number;
}

/**
 * Align script sentences with captions to get sentence boundaries with timestamps
 *
 * @param scriptText - The script text to split into sentences
 * @param captions - Transcription captions with timestamps
 * @param options - Alignment options
 * @returns Array of aligned sentences with timestamps
 */
export function alignSentences(
  scriptText: string,
  captions: Caption[],
  options: AlignSentencesOptions = {}
): AlignedSentence[] {
  const { deviationThreshold = 0.7 } = options;
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
        transcribedText: match.transcribedText,
        hasDeviation: match.confidence < deviationThreshold,
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

/**
 * Extract deviations from aligned sentences
 *
 * @param sentences - Aligned sentences with deviation info
 * @param scriptSentences - Original script sentences (for unmatched detection)
 * @returns Array of detected deviations
 */
export function extractDeviations(
  sentences: AlignedSentence[],
  scriptSentences: string[]
): ScriptDeviation[] {
  const deviations: ScriptDeviation[] = [];
  const matchedIndices = new Set(sentences.map((s) => s.index));

  // Find sentences with deviations
  for (const sentence of sentences) {
    if (sentence.hasDeviation && sentence.transcribedText) {
      deviations.push({
        sentenceIndex: sentence.index,
        expectedText: sentence.text,
        transcribedText: sentence.transcribedText,
        startMs: sentence.startMs,
        endMs: sentence.endMs,
        type: "modified",
        similarity: sentence.confidence,
      });
    }
  }

  // Find missing sentences (not matched at all)
  for (let i = 0; i < scriptSentences.length; i++) {
    if (!matchedIndices.has(i)) {
      // Find approximate position based on surrounding sentences
      const prevMatched = sentences.find(
        (s, idx) => s.index < i && sentences[idx + 1]?.index > i
      );
      const nextMatched = sentences.find((s) => s.index > i);

      const startMs = prevMatched?.endMs ?? 0;
      const endMs = nextMatched?.startMs ?? startMs;

      deviations.push({
        sentenceIndex: i,
        expectedText: scriptSentences[i],
        transcribedText: "",
        startMs,
        endMs,
        type: "missing",
        similarity: 0,
      });
    }
  }

  // Sort by sentence index
  deviations.sort((a, b) => a.sentenceIndex - b.sentenceIndex);

  return deviations;
}
