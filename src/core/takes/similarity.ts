/**
 * Phrase similarity detection for take selection
 *
 * Detects repeated phrases in video transcription and groups them
 * for comparison and best-take selection.
 */

import { similarity, normalize } from "../script/align";
import type { Caption } from "../script/align";

/**
 * A single take of a phrase (one occurrence)
 */
export interface Take {
  /** Index in original caption array */
  index: number;
  /** Start timestamp in milliseconds */
  startMs: number;
  /** End timestamp in milliseconds */
  endMs: number;
  /** Original text of this take */
  text: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Similarity score to the canonical phrase (0-1) */
  similarity: number;
  /** Whisper transcription confidence (0-1), average of captions that form this take */
  whisperConfidence: number;
}

/**
 * A group of similar phrases (represents all takes of "the same" phrase)
 */
export interface PhraseGroup {
  /** Unique identifier for this group */
  id: string;
  /** Normalized canonical text (for comparison) */
  normalizedText: string;
  /** Display text (from the best/first take) */
  displayText: string;
  /** All takes of this phrase */
  takes: Take[];
  /** Number of takes */
  takeCount: number;
  /** Whether this phrase was repeated (more than one take) */
  hasMultipleTakes: boolean;
}

/**
 * Options for phrase grouping
 */
export interface GroupingOptions {
  /** Minimum similarity threshold (0-1), default 0.8 (80%) */
  threshold?: number;
  /** Minimum phrase length in characters to consider, default 10 */
  minPhraseLength?: number;
  /** Maximum time gap between takes to consider them part of the same "session", default 30000ms */
  maxGapMs?: number;
}

const DEFAULT_OPTIONS: Required<GroupingOptions> = {
  threshold: 0.8,
  minPhraseLength: 10,
  maxGapMs: 30000,
};

/**
 * Generate a unique ID for a phrase group
 */
function generateGroupId(index: number): string {
  return `phrase-${index}-${Date.now().toString(36)}`;
}

/**
 * Group captions by text similarity to detect repeated phrases
 *
 * @param captions - Array of captions from Whisper transcription
 * @param options - Grouping options
 * @returns Array of phrase groups, sorted by first occurrence
 */
export function groupSimilarPhrases(
  captions: Caption[],
  options: GroupingOptions = {}
): PhraseGroup[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const groups: PhraseGroup[] = [];

  // Track which captions have been assigned to a group
  const assigned = new Set<number>();

  for (let i = 0; i < captions.length; i++) {
    // Skip if already assigned or too short
    if (assigned.has(i)) continue;

    const caption = captions[i];
    const normalizedText = normalize(caption.text);

    if (normalizedText.length < opts.minPhraseLength) {
      continue;
    }

    // Start a new group with this caption as the first take
    const takes: Take[] = [
      {
        index: i,
        startMs: caption.startMs,
        endMs: caption.endMs,
        text: caption.text,
        durationMs: caption.endMs - caption.startMs,
        similarity: 1, // First take is the canonical reference
        whisperConfidence: caption.confidence ?? 1, // Use Whisper confidence, default to 1 if not available
      },
    ];
    assigned.add(i);

    // Find similar captions that could be takes of the same phrase
    for (let j = i + 1; j < captions.length; j++) {
      if (assigned.has(j)) continue;

      const otherCaption = captions[j];
      const otherNormalized = normalize(otherCaption.text);

      // Skip if too short
      if (otherNormalized.length < opts.minPhraseLength) {
        continue;
      }

      // Check similarity
      const sim = similarity(caption.text, otherCaption.text);

      if (sim >= opts.threshold) {
        takes.push({
          index: j,
          startMs: otherCaption.startMs,
          endMs: otherCaption.endMs,
          text: otherCaption.text,
          durationMs: otherCaption.endMs - otherCaption.startMs,
          similarity: sim,
          whisperConfidence: otherCaption.confidence ?? 1,
        });
        assigned.add(j);
      }
    }

    // Create the group
    groups.push({
      id: generateGroupId(groups.length),
      normalizedText,
      displayText: caption.text,
      takes,
      takeCount: takes.length,
      hasMultipleTakes: takes.length > 1,
    });
  }

  // Sort by first occurrence (first take's start time)
  groups.sort((a, b) => a.takes[0].startMs - b.takes[0].startMs);

  return groups;
}

/**
 * Filter groups to only those with multiple takes (repeated phrases)
 *
 * @param groups - Array of phrase groups
 * @returns Groups that have more than one take
 */
export function getRepeatedPhrases(groups: PhraseGroup[]): PhraseGroup[] {
  return groups.filter((g) => g.hasMultipleTakes);
}

/**
 * Get statistics about phrase repetition in a video
 */
export interface RepetitionStats {
  /** Total number of distinct phrases */
  totalPhrases: number;
  /** Number of phrases that were repeated */
  repeatedPhrases: number;
  /** Total number of takes across all repeated phrases */
  totalTakes: number;
  /** Average number of takes per repeated phrase */
  averageTakes: number;
  /** Maximum number of takes for a single phrase */
  maxTakes: number;
  /** Phrase with most takes */
  mostRepeatedPhrase: PhraseGroup | null;
}

/**
 * Calculate statistics about phrase repetition
 */
export function getRepetitionStats(groups: PhraseGroup[]): RepetitionStats {
  const repeated = getRepeatedPhrases(groups);

  const totalTakes = repeated.reduce((sum, g) => sum + g.takeCount, 0);
  const maxTakes = Math.max(0, ...repeated.map((g) => g.takeCount));

  return {
    totalPhrases: groups.length,
    repeatedPhrases: repeated.length,
    totalTakes,
    averageTakes: repeated.length > 0 ? totalTakes / repeated.length : 0,
    maxTakes,
    mostRepeatedPhrase: repeated.find((g) => g.takeCount === maxTakes) || null,
  };
}

/**
 * Merge consecutive captions into longer phrases before grouping
 * This helps detect multi-caption phrases that were repeated
 *
 * @param captions - Array of captions
 * @param maxGapMs - Maximum gap between captions to merge
 * @returns Merged captions
 */
export function mergeCaptions(captions: Caption[], maxGapMs = 500): Caption[] {
  if (captions.length === 0) return [];

  const merged: Caption[] = [];
  let current: Caption = { ...captions[0] };

  for (let i = 1; i < captions.length; i++) {
    const caption = captions[i];
    const gap = caption.startMs - current.endMs;

    if (gap <= maxGapMs) {
      // Merge with current
      current = {
        text: `${current.text} ${caption.text}`,
        startMs: current.startMs,
        endMs: caption.endMs,
        confidence: Math.min(current.confidence ?? 1, caption.confidence ?? 1),
      };
    } else {
      // Start new phrase
      merged.push(current);
      current = { ...caption };
    }
  }

  merged.push(current);
  return merged;
}

/**
 * Find the best take in a group based on simple heuristics
 * (For now, just picks the shortest complete take - more scoring will be added later)
 *
 * @param group - Phrase group with takes
 * @returns Index of the best take in the group
 */
export function findBestTake(group: PhraseGroup): number {
  if (group.takes.length === 0) return -1;
  if (group.takes.length === 1) return 0;

  // For now, prefer shorter takes with high similarity
  // This is a simple heuristic - real scoring will be more sophisticated
  let bestIndex = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < group.takes.length; i++) {
    const take = group.takes[i];

    // Score: higher similarity is better, shorter duration is better
    // Normalize duration to 0-1 range (1 = shortest)
    const maxDuration = Math.max(...group.takes.map((t) => t.durationMs));
    const minDuration = Math.min(...group.takes.map((t) => t.durationMs));
    const durationRange = maxDuration - minDuration || 1;

    const normalizedDuration = 1 - (take.durationMs - minDuration) / durationRange;

    // Weight: 60% similarity, 40% brevity
    const score = take.similarity * 0.6 + normalizedDuration * 0.4;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}
