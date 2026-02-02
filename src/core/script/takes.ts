/**
 * Take detection - Compare script with transcription to detect repeated takes
 */
import { normalize, similarity, alignWords } from "./align";
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

interface CaptionWord {
  word: string;
  normalized: string;
  startMs: number;
  endMs: number;
  captionIndex: number;
}

/**
 * Build a flat word array from captions with interpolated timestamps
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
 * Find candidate start positions where the sentence might begin.
 * Looks for positions where at least one of the first 2 sentence words
 * matches a caption word (similarity > 0.6).
 */
function findCandidatePositions(
  sentenceWords: string[],
  captionWords: CaptionWord[]
): number[] {
  const anchors = sentenceWords.slice(0, Math.min(2, sentenceWords.length));
  const candidates: number[] = [];

  for (let i = 0; i < captionWords.length; i++) {
    for (const anchor of anchors) {
      if (similarity(anchor, captionWords[i].normalized) > 0.6) {
        candidates.push(i);
        break;
      }
    }
  }

  return candidates;
}

const TAKE_START_PADDING_MS = 100;
const TAKE_END_PADDING_MS = 150;

interface ScoredCandidate {
  startIdx: number;
  endIdx: number;
  alignedRatio: number;
  avgSimilarity: number;
  score: number;
  /** Indices into captionWords that were aligned */
  alignedCaptionIndices: number[];
}

/**
 * Find where a sentence appears in the captions using Needleman-Wunsch alignment.
 * Collects all candidates first, then selects greedily by score avoiding overlaps.
 */
function findSentenceInCaptions(
  sentence: ScriptSentence,
  captions: Caption[]
): Take[] {
  const sentenceWords = sentence.normalized.split(/\s+/).filter(Boolean);

  if (sentenceWords.length === 0) return [];

  const captionWords = buildCaptionWords(captions);

  if (captionWords.length === 0) return [];

  const candidatePositions = findCandidatePositions(sentenceWords, captionWords);
  const windowLen = Math.ceil(sentenceWords.length * 1.5) + 4;

  // --- Phase 1: Score all candidates ---
  const scored: ScoredCandidate[] = [];

  for (const pos of candidatePositions) {
    const sliceEnd = Math.min(pos + windowLen, captionWords.length);
    const windowSlice = captionWords.slice(pos, sliceEnd);

    if (windowSlice.length === 0) continue;

    // Run NW alignment: maps each sentenceWord index → windowSlice index (or -1)
    const alignment = alignWords(
      sentenceWords,
      windowSlice.map((cw) => cw.word)
    );

    // Evaluate alignment quality
    let alignedCount = 0;
    let totalSim = 0;
    let firstAligned = -1;
    let lastAligned = -1;
    const alignedCaptionIndices: number[] = [];

    for (let si = 0; si < alignment.length; si++) {
      const wi = alignment[si];
      if (wi === -1) continue;

      const sim = similarity(sentenceWords[si], windowSlice[wi].normalized);
      if (sim > 0.6) {
        alignedCount++;
        totalSim += sim;
        alignedCaptionIndices.push(pos + wi);
        if (firstAligned === -1) firstAligned = pos + wi;
        lastAligned = pos + wi;
      }
    }

    if (alignedCount === 0) continue;

    const alignedRatio = alignedCount / sentenceWords.length;
    const avgSimilarity = totalSim / alignedCount;

    if (alignedRatio >= 0.6 && avgSimilarity >= 0.5) {
      scored.push({
        startIdx: firstAligned,
        endIdx: lastAligned,
        alignedRatio,
        avgSimilarity,
        score: alignedRatio * 0.6 + avgSimilarity * 0.4,
        alignedCaptionIndices,
      });
    }
  }

  if (scored.length === 0) return [];

  // --- Phase 2: Collect-then-select (greedy by score, no temporal overlap) ---
  scored.sort((a, b) => b.score - a.score);

  const selected: ScoredCandidate[] = [];

  for (const candidate of scored) {
    const candStart = captionWords[candidate.startIdx].startMs - TAKE_START_PADDING_MS;
    const candEnd = captionWords[candidate.endIdx].endMs + TAKE_END_PADDING_MS;

    const overlaps = selected.some((s) => {
      const sStart = captionWords[s.startIdx].startMs - TAKE_START_PADDING_MS;
      const sEnd = captionWords[s.endIdx].endMs + TAKE_END_PADDING_MS;
      return candStart < sEnd && candEnd > sStart;
    });

    if (!overlaps) {
      selected.push(candidate);
    }
  }

  // --- Phase 3: Build Take[] ---
  const takes: Take[] = selected.map((cand, idx) => {
    const captionIndices = [
      ...new Set(
        captionWords
          .slice(cand.startIdx, cand.endIdx + 1)
          .map((cw) => cw.captionIndex)
      ),
    ];

    return {
      id: `take-${sentence.index}-${idx}`,
      sentenceIndex: sentence.index,
      startMs: Math.max(0, captionWords[cand.startIdx].startMs - TAKE_START_PADDING_MS),
      endMs: captionWords[cand.endIdx].endMs + TAKE_END_PADDING_MS,
      durationMs:
        (captionWords[cand.endIdx].endMs + TAKE_END_PADDING_MS) -
        Math.max(0, captionWords[cand.startIdx].startMs - TAKE_START_PADDING_MS),
      transcribedText: captionWords
        .slice(cand.startIdx, cand.endIdx + 1)
        .map((cw) => cw.word)
        .join(" "),
      confidence: cand.score,
      selected: false,
      captionIndices,
    };
  });

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

    const takes = findSentenceInCaptions(sentence, captions);

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
