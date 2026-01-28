/**
 * Script-Segment Matcher
 *
 * Aligns video segments with script sentences to determine coverage
 * and detect repetitions (multiple takes of the same content).
 */

import type { Caption } from "../script/align";
import { normalize, similarity } from "../script/align";
import { splitIntoSentences } from "../script/takes";
import type { SegmentScriptMatch, InputSegment } from "./types";

/**
 * Represents a sentence from the script with its metadata
 */
interface ScriptSentence {
  index: number;
  text: string;
  normalizedText: string;
  wordCount: number;
}

/**
 * Extracts the transcribed text for a segment from captions
 */
export function getSegmentTranscription(
  segment: InputSegment,
  captions: Caption[]
): string {
  const overlapping = captions.filter(
    (cap) => cap.startMs < segment.endMs && cap.endMs > segment.startMs
  );

  return overlapping.map((cap) => cap.text).join(" ").trim();
}

/**
 * Calculates word-level coverage of a sentence by the segment text
 */
function calculateSentenceCoverage(
  segmentText: string,
  sentenceText: string
): number {
  const segmentNorm = normalize(segmentText);
  const sentenceNorm = normalize(sentenceText);

  if (!sentenceNorm) return 0;

  const sentenceWords = sentenceNorm.split(/\s+/).filter(Boolean);
  const segmentWords = new Set(segmentNorm.split(/\s+/).filter(Boolean));

  if (sentenceWords.length === 0) return 0;

  let matchedWords = 0;
  for (const word of sentenceWords) {
    // Check for exact match or high similarity
    for (const segWord of segmentWords) {
      if (similarity(word, segWord) > 0.8) {
        matchedWords++;
        break;
      }
    }
  }

  return (matchedWords / sentenceWords.length) * 100;
}

/**
 * Matches segments to script sentences and detects repetitions
 *
 * @param segments - Array of segments to analyze
 * @param captions - Transcription captions with timestamps
 * @param script - The script text
 * @returns Array of segment-script matches
 */
export function matchSegmentsToScript(
  segments: Array<InputSegment & { id: string }>,
  captions: Caption[],
  script: string
): SegmentScriptMatch[] {
  // Parse script into sentences
  const sentences = splitIntoSentences(script);
  const scriptSentences: ScriptSentence[] = sentences.map((text, index) => ({
    index,
    text,
    normalizedText: normalize(text),
    wordCount: text.split(/\s+/).filter(Boolean).length,
  }));

  // Track which sentences have been covered by previous segments
  const coveredSentences = new Set<number>();

  // Match each segment to sentences
  const matches: SegmentScriptMatch[] = [];

  for (const segment of segments) {
    const transcribedText = getSegmentTranscription(segment, captions);
    const matchedSentenceIndices: number[] = [];
    let totalCoverage = 0;
    let isRepetition = false;

    // Find sentences that this segment covers
    for (const sentence of scriptSentences) {
      const coverage = calculateSentenceCoverage(transcribedText, sentence.text);

      // Consider a sentence "matched" if coverage is above 50%
      if (coverage >= 50) {
        matchedSentenceIndices.push(sentence.index);
        totalCoverage += coverage;

        // Check if this sentence was already covered
        if (coveredSentences.has(sentence.index)) {
          isRepetition = true;
        }
      }
    }

    // Mark matched sentences as covered
    for (const idx of matchedSentenceIndices) {
      coveredSentences.add(idx);
    }

    // Calculate average coverage score
    const coverageScore =
      matchedSentenceIndices.length > 0
        ? totalCoverage / matchedSentenceIndices.length
        : 0;

    matches.push({
      segmentId: segment.id,
      matchedSentenceIndices,
      coverageScore,
      isRepetition,
      transcribedText,
    });
  }

  return matches;
}

/**
 * Calculates overall script coverage from preselected segments
 *
 * @param matches - Segment-script matches
 * @param selectedSegmentIds - IDs of selected segments
 * @param totalSentences - Total number of sentences in script
 * @returns Coverage percentage (0-100)
 */
export function calculateScriptCoverage(
  matches: SegmentScriptMatch[],
  selectedSegmentIds: Set<string>,
  totalSentences: number
): number {
  if (totalSentences === 0) return 100;

  const coveredSentences = new Set<number>();

  for (const match of matches) {
    if (selectedSegmentIds.has(match.segmentId)) {
      for (const idx of match.matchedSentenceIndices) {
        coveredSentences.add(idx);
      }
    }
  }

  return (coveredSentences.size / totalSentences) * 100;
}

/**
 * Detects take groups (segments that cover the same script content)
 *
 * @param matches - Segment-script matches
 * @returns Map of sentence index to segment IDs covering it
 */
export function detectTakeGroups(
  matches: SegmentScriptMatch[]
): Map<number, string[]> {
  const groups = new Map<number, string[]>();

  for (const match of matches) {
    for (const sentenceIdx of match.matchedSentenceIndices) {
      const existing = groups.get(sentenceIdx) || [];
      existing.push(match.segmentId);
      groups.set(sentenceIdx, existing);
    }
  }

  return groups;
}

/**
 * Gets the take number for a segment within its take group
 *
 * @param segmentId - The segment ID
 * @param matches - All segment matches
 * @returns Take number (1 = first take, 2 = second, etc.) or 1 if no takes
 */
export function getSegmentTakeNumber(
  segmentId: string,
  matches: SegmentScriptMatch[]
): number {
  const segmentMatch = matches.find((m) => m.segmentId === segmentId);
  if (!segmentMatch || segmentMatch.matchedSentenceIndices.length === 0) {
    return 1;
  }

  // Get all segments covering the same sentences (sorted by time/order)
  const takeGroups = detectTakeGroups(matches);
  const primarySentence = segmentMatch.matchedSentenceIndices[0];
  const takesForSentence = takeGroups.get(primarySentence) || [];

  const position = takesForSentence.indexOf(segmentId);
  return position >= 0 ? position + 1 : 1;
}
