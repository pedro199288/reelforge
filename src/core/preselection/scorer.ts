/**
 * Segment Scoring System
 *
 * Calculates scores for segments based on multiple criteria:
 * - Script match (coverage of script content)
 * - Take order (first takes preferred)
 * - Completeness (complete sentences)
 * - Duration (ideal duration range)
 */

import type { Caption } from "../script/align";
import type {
  PreselectionConfig,
  SegmentScore,
  SegmentScoreBreakdown,
  SegmentScriptMatch,
  InputSegment,
} from "./types";
import {
  matchSegmentsToScript,
  getSegmentTakeNumber,
  getSegmentTranscription,
} from "./script-matcher";

/**
 * Checks if text appears to be a complete sentence
 * (starts with capital or after punctuation, ends with punctuation)
 */
function isCompleteSentence(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Check for sentence-ending punctuation
  const endsWithPunctuation = /[.!?]$/.test(trimmed);

  // Check if starts reasonably (capital letter or common start)
  const startsReasonably = /^[A-ZÀ-ÖØ-Ý¡¿]/.test(trimmed) || /^[a-zà-öø-ÿ]/.test(trimmed);

  return endsWithPunctuation && startsReasonably;
}

/**
 * Checks if segment boundaries align with natural speech pauses
 * (looks for punctuation near the boundaries in the transcription)
 */
function hasNaturalBoundaries(
  segment: InputSegment,
  captions: Caption[]
): { startScore: number; endScore: number } {
  // Find captions at boundaries
  const startCap = captions.find(
    (cap) => cap.startMs <= segment.startMs && cap.endMs >= segment.startMs
  );
  const endCap = captions.find(
    (cap) => cap.startMs <= segment.endMs && cap.endMs >= segment.endMs
  );

  let startScore = 50; // Default neutral score
  let endScore = 50;

  // Check if start is at beginning of a caption (natural pause)
  if (startCap) {
    const diff = Math.abs(segment.startMs - startCap.startMs);
    if (diff < 100) startScore = 100; // Very close to caption start
    else if (diff < 300) startScore = 75;
  }

  // Check if end aligns with sentence-ending punctuation
  if (endCap) {
    const hasEndPunctuation = /[.!?,;]$/.test(endCap.text.trim());
    const diff = Math.abs(segment.endMs - endCap.endMs);
    if (hasEndPunctuation && diff < 100) endScore = 100;
    else if (hasEndPunctuation) endScore = 80;
    else if (diff < 100) endScore = 70;
  }

  return { startScore, endScore };
}

/**
 * Calculates duration score based on ideal range
 */
function calculateDurationScore(
  durationMs: number,
  config: PreselectionConfig
): number {
  const { minMs, maxMs } = config.idealDuration;

  // Perfect score if within ideal range
  if (durationMs >= minMs && durationMs <= maxMs) {
    return 100;
  }

  // Too short
  if (durationMs < minMs) {
    // Score drops as duration gets further from minimum
    // Very short segments (<1s) get low score
    if (durationMs < 1000) return 30;
    const ratio = durationMs / minMs;
    return Math.round(30 + ratio * 70);
  }

  // Too long
  // Score drops gradually for longer segments
  if (durationMs > maxMs * 2) return 50; // Very long but not terrible
  const ratio = maxMs / durationMs;
  return Math.round(50 + ratio * 50);
}

/**
 * Calculates take order score
 * First take: 100, Second: 60, Third+: 30
 */
function calculateTakeOrderScore(takeNumber: number): number {
  if (takeNumber === 1) return 100;
  if (takeNumber === 2) return 60;
  return 30;
}

/**
 * Generates a human-readable reason for the score
 */
function generateScoreReason(
  breakdown: SegmentScoreBreakdown,
  totalScore: number,
  config: PreselectionConfig,
  isRepetition: boolean,
  takeNumber: number
): string {
  const reasons: string[] = [];

  // Script match
  if (config.weights.scriptMatch > 0) {
    if (breakdown.scriptMatch >= 80) {
      reasons.push("cubre texto del guion");
    } else if (breakdown.scriptMatch >= 50) {
      reasons.push("cobertura parcial del guion");
    } else if (breakdown.scriptMatch < 30) {
      reasons.push("poca coincidencia con guion");
    }
  }

  // Take order - handle both script-based and similarity-based repetition
  if (takeNumber > 1) {
    // Check if this is from similarity detection (no script) or script matching
    if (config.weights.scriptMatch === 0) {
      // No-script mode: repetition detected via similarity
      reasons.push(`repeticion detectada (toma ${takeNumber})`);
    } else if (isRepetition) {
      // Script mode: repetition detected via script matching
      reasons.push(`toma ${takeNumber} (repeticion)`);
    }
  } else if (isRepetition) {
    // First take but marked as repetition (edge case)
    reasons.push("toma 1");
  }

  // Duration
  if (breakdown.duration < 50) {
    reasons.push("duracion no ideal");
  }

  // Completeness
  if (breakdown.completeness >= 80) {
    reasons.push("oracion completa");
  } else if (breakdown.completeness < 50) {
    reasons.push("fragmento incompleto");
  }

  // Final verdict based on total score
  const prefix = totalScore >= 50 ? "Seleccionado" : "Descartado";
  const reasonText = reasons.length > 0 ? `: ${reasons.join(", ")}` : "";

  return `${prefix} (${Math.round(totalScore)}%)${reasonText}`;
}

/**
 * Scores a single segment
 */
function scoreSegment(
  segment: InputSegment & { id: string },
  captions: Caption[],
  scriptMatch: SegmentScriptMatch | undefined,
  config: PreselectionConfig,
  takeNumber: number
): SegmentScore {
  const durationMs = segment.endMs - segment.startMs;
  const transcribedText = getSegmentTranscription(segment, captions);

  // Calculate individual scores
  const breakdown: SegmentScoreBreakdown = {
    scriptMatch: scriptMatch?.coverageScore ?? 0,
    takeOrder: calculateTakeOrderScore(takeNumber),
    completeness: 50, // Default
    duration: calculateDurationScore(durationMs, config),
  };

  // Calculate completeness
  if (transcribedText) {
    const isComplete = isCompleteSentence(transcribedText);
    const boundaries = hasNaturalBoundaries(segment, captions);
    breakdown.completeness = isComplete
      ? 100
      : Math.round((boundaries.startScore + boundaries.endScore) / 2);
  }

  // Calculate weighted total
  const totalScore =
    breakdown.scriptMatch * config.weights.scriptMatch +
    breakdown.takeOrder * config.weights.takeOrder +
    breakdown.completeness * config.weights.completeness +
    breakdown.duration * config.weights.duration;

  // Check if ambiguous (score between 40-60)
  const isAmbiguous = totalScore >= 40 && totalScore <= 60;

  const reason = generateScoreReason(
    breakdown,
    totalScore,
    config,
    scriptMatch?.isRepetition ?? false,
    takeNumber
  );

  return {
    segmentId: segment.id,
    totalScore,
    breakdown,
    reason,
    isAmbiguous,
  };
}

/**
 * Scores all segments
 *
 * @param segments - Array of segments to score
 * @param captions - Transcription captions
 * @param script - Optional script text for matching
 * @param config - Preselection configuration
 * @param takeGroups - Optional map of segment ID → take number (for no-script repetition detection)
 * @returns Array of segment scores
 */
export function scoreSegments(
  segments: Array<InputSegment & { id: string }>,
  captions: Caption[],
  script: string | undefined,
  config: PreselectionConfig,
  takeGroups?: Map<string, number>
): SegmentScore[] {
  // Match segments to script if available
  const scriptMatches = script
    ? matchSegmentsToScript(segments, captions, script)
    : undefined;

  // Create lookup map for matches
  const matchMap = new Map<string, SegmentScriptMatch>();
  if (scriptMatches) {
    for (const match of scriptMatches) {
      matchMap.set(match.segmentId, match);
    }
  }

  // Score each segment
  const scores: SegmentScore[] = [];

  for (const segment of segments) {
    const match = matchMap.get(segment.id);

    // Determine take number: from script matches OR from similarity-based takeGroups
    let takeNumber = 1;
    if (scriptMatches) {
      takeNumber = getSegmentTakeNumber(segment.id, scriptMatches);
    } else if (takeGroups) {
      takeNumber = takeGroups.get(segment.id) ?? 1;
    }

    const score = scoreSegment(segment, captions, match, config, takeNumber);
    scores.push(score);
  }

  return scores;
}

/**
 * Applies selection based on scores
 *
 * @param scores - Segment scores
 * @param config - Configuration with threshold
 * @returns Set of segment IDs that should be enabled
 */
export function selectByScore(
  scores: SegmentScore[],
  config: PreselectionConfig
): Set<string> {
  const selected = new Set<string>();

  for (const score of scores) {
    if (score.totalScore >= config.minScore) {
      selected.add(score.segmentId);
    }
  }

  return selected;
}
