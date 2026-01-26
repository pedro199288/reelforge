/**
 * Take detection - Compare script with transcription to detect repeated takes
 */
import { normalize, similarity } from "./align";
import type { Caption } from "./align";

/**
 * A sentence from the script
 */
export interface ScriptSentence {
  /** Sentence index in script */
  index: number;
  /** Original text */
  text: string;
  /** Normalized text for matching */
  normalized: string;
}

/**
 * A detected take (occurrence of a sentence in the transcription)
 */
export interface Take {
  /** Unique identifier for this take */
  id: string;
  /** Which script sentence this take belongs to */
  sentenceIndex: number;
  /** Start time in milliseconds */
  startMs: number;
  /** End time in milliseconds */
  endMs: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** The transcribed text for this take */
  transcribedText: string;
  /** Confidence score (0-1) based on similarity with script sentence */
  confidence: number;
  /** Whether this take is currently selected as the "best" */
  selected: boolean;
  /** Caption indices that make up this take */
  captionIndices: number[];
}

/**
 * A group of takes for a single script sentence
 */
export interface TakeGroup {
  /** The script sentence */
  sentence: ScriptSentence;
  /** All detected takes for this sentence */
  takes: Take[];
  /** Number of takes detected */
  count: number;
  /** Whether this sentence has multiple takes (repetitions) */
  hasRepetitions: boolean;
}

/**
 * Result of take detection
 */
export interface TakeDetectionResult {
  /** All sentence groups with their takes */
  groups: TakeGroup[];
  /** Total number of sentences in script */
  totalSentences: number;
  /** Total number of takes detected */
  totalTakes: number;
  /** Number of sentences with multiple takes */
  sentencesWithRepetitions: number;
  /** Overall confidence of detection */
  overallConfidence: number;
}

/**
 * Split text into sentences
 */
export function splitIntoSentences(text: string): string[] {
  // Split by sentence-ending punctuation, keeping reasonable chunks
  const sentences = text
    .split(/(?<=[.!?])\s+|(?<=\n)\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // If no sentence breaks found, split by clauses or chunks
  if (sentences.length <= 1 && text.length > 50) {
    return text
      .split(/(?<=[,;:])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  return sentences;
}

/**
 * Find where a sentence appears in the captions
 */
function findSentenceInCaptions(
  sentence: ScriptSentence,
  captions: Caption[],
  usedRanges: Array<{ start: number; end: number }>
): Take[] {
  const takes: Take[] = [];
  const sentenceWords = sentence.normalized.split(/\s+/).filter(Boolean);

  if (sentenceWords.length === 0) return takes;

  // Build word array from captions with timestamps
  const captionWords: {
    word: string;
    normalized: string;
    startMs: number;
    endMs: number;
    captionIndex: number;
  }[] = [];

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

  if (captionWords.length === 0) return takes;

  // Sliding window to find matches
  const minMatch = Math.max(2, Math.floor(sentenceWords.length * 0.5));
  const windowSize = Math.max(sentenceWords.length, 3);

  for (let i = 0; i <= captionWords.length - minMatch; i++) {
    // Check if this range overlaps with already used ranges
    const windowEnd = Math.min(i + windowSize + 2, captionWords.length);
    const potentialStart = captionWords[i].startMs;
    const potentialEnd = captionWords[windowEnd - 1].endMs;

    const overlaps = usedRanges.some(
      (r) => potentialStart < r.end && potentialEnd > r.start
    );
    if (overlaps) continue;

    // Calculate similarity for this window
    let matchedWords = 0;
    let totalSimilarity = 0;
    const matchedIndices: number[] = [];

    for (let sw = 0; sw < sentenceWords.length && i + sw < captionWords.length; sw++) {
      const sim = similarity(sentenceWords[sw], captionWords[i + sw].normalized);
      if (sim > 0.6) {
        matchedWords++;
        matchedIndices.push(i + sw);
      }
      totalSimilarity += sim;
    }

    const avgSimilarity = totalSimilarity / sentenceWords.length;
    const matchRatio = matchedWords / sentenceWords.length;

    // Require reasonable match
    if (matchRatio >= 0.5 && avgSimilarity >= 0.4) {
      const startIdx = i;
      const endIdx = Math.min(i + sentenceWords.length - 1, captionWords.length - 1);

      // Get unique caption indices
      const captionIndices = [
        ...new Set(
          captionWords
            .slice(startIdx, endIdx + 1)
            .map((cw) => cw.captionIndex)
        ),
      ];

      const take: Take = {
        id: `take-${sentence.index}-${takes.length}`,
        sentenceIndex: sentence.index,
        startMs: captionWords[startIdx].startMs,
        endMs: captionWords[endIdx].endMs,
        durationMs: captionWords[endIdx].endMs - captionWords[startIdx].startMs,
        transcribedText: captionWords
          .slice(startIdx, endIdx + 1)
          .map((cw) => cw.word)
          .join(" "),
        confidence: avgSimilarity,
        selected: takes.length === 0, // First take is selected by default
        captionIndices,
      };

      takes.push(take);

      // Mark this range as used to avoid overlapping matches
      usedRanges.push({ start: take.startMs, end: take.endMs });

      // Skip past this match
      i = endIdx;
    }
  }

  return takes;
}

/**
 * Detect all takes of each sentence in the script
 */
export function detectTakes(
  scriptText: string,
  captions: Caption[]
): TakeDetectionResult {
  const sentences = splitIntoSentences(scriptText);
  const groups: TakeGroup[] = [];

  let totalTakes = 0;
  let sentencesWithRepetitions = 0;
  let totalConfidence = 0;
  let confidenceCount = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence: ScriptSentence = {
      index: i,
      text: sentences[i],
      normalized: normalize(sentences[i]),
    };

    // Clear used ranges for each sentence to allow same caption regions
    // to match different sentences (they're independent)
    const sentenceUsedRanges: Array<{ start: number; end: number }> = [];
    const takes = findSentenceInCaptions(sentence, captions, sentenceUsedRanges);

    // Sort takes by start time
    takes.sort((a, b) => a.startMs - b.startMs);

    // Re-select first take after sorting
    if (takes.length > 0) {
      takes.forEach((t, idx) => (t.selected = idx === 0));
    }

    const group: TakeGroup = {
      sentence,
      takes,
      count: takes.length,
      hasRepetitions: takes.length > 1,
    };

    groups.push(group);

    totalTakes += takes.length;
    if (takes.length > 1) {
      sentencesWithRepetitions++;
    }

    for (const take of takes) {
      totalConfidence += take.confidence;
      confidenceCount++;
    }
  }

  return {
    groups,
    totalSentences: sentences.length,
    totalTakes,
    sentencesWithRepetitions,
    overallConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
  };
}

/**
 * Get selected takes only
 */
export function getSelectedTakes(result: TakeDetectionResult): Take[] {
  return result.groups
    .flatMap((g) => g.takes.filter((t) => t.selected))
    .sort((a, b) => a.startMs - b.startMs);
}

/**
 * Calculate total duration of selected takes
 */
export function getSelectedDuration(result: TakeDetectionResult): number {
  return getSelectedTakes(result).reduce((sum, t) => sum + t.durationMs, 0);
}
