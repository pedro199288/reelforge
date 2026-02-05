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
  detectTakeGroups,
} from "./script-matcher";
import type { ScoringLogData, LogCollector } from "./logger";
import { logSegmentScoring, generateCriterionReasons } from "./logger";

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
 * Extended boundary analysis result for logging
 */
interface BoundaryAnalysis {
  startScore: number;
  endScore: number;
  startAlignedWithCaption: boolean;
  endHasPunctuation: boolean;
}

/**
 * Checks if segment boundaries align with natural speech pauses
 * (looks for punctuation near the boundaries in the transcription)
 */
function hasNaturalBoundaries(
  segment: InputSegment,
  captions: Caption[]
): BoundaryAnalysis {
  // Find captions at boundaries
  const startCap = captions.find(
    (cap) => cap.startMs <= segment.startMs && cap.endMs >= segment.startMs
  );
  const endCap = captions.find(
    (cap) => cap.startMs <= segment.endMs && cap.endMs >= segment.endMs
  );

  let startScore = 50; // Default neutral score
  let endScore = 50;
  let startAlignedWithCaption = false;
  let endHasPunctuation = false;

  // Check if start is at beginning of a caption (natural pause)
  if (startCap) {
    const diff = Math.abs(segment.startMs - startCap.startMs);
    if (diff < 100) {
      startScore = 100; // Very close to caption start
      startAlignedWithCaption = true;
    } else if (diff < 300) {
      startScore = 75;
      startAlignedWithCaption = true;
    }
  }

  // Check if end aligns with sentence-ending punctuation
  if (endCap) {
    endHasPunctuation = /[.!?,;]$/.test(endCap.text.trim());
    const diff = Math.abs(segment.endMs - endCap.endMs);
    if (endHasPunctuation && diff < 100) endScore = 100;
    else if (endHasPunctuation) endScore = 80;
    else if (diff < 100) endScore = 70;
  }

  return { startScore, endScore, startAlignedWithCaption, endHasPunctuation };
}

/**
 * Duration analysis result
 */
interface DurationAnalysisResult {
  score: number;
  status: "too_short" | "ideal" | "too_long";
}

/**
 * Analyzes duration with detailed status for logging
 */
function analyzeDuration(
  durationMs: number,
  config: PreselectionConfig
): DurationAnalysisResult {
  const { minMs, maxMs } = config.idealDuration;

  // Perfect score if within ideal range
  if (durationMs >= minMs && durationMs <= maxMs) {
    return { score: 100, status: "ideal" };
  }

  // Too short
  if (durationMs < minMs) {
    // Score drops as duration gets further from minimum
    // Very short segments (<1s) get low score
    if (durationMs < 1000) return { score: 30, status: "too_short" };
    const ratio = durationMs / minMs;
    return { score: Math.round(30 + ratio * 70), status: "too_short" };
  }

  // Too long
  // Score drops gradually for longer segments
  if (durationMs > maxMs * 2) return { score: 50, status: "too_long" };
  const ratio = maxMs / durationMs;
  return { score: Math.round(50 + ratio * 50), status: "too_long" };
}

/**
 * Calculates Whisper transcription confidence score for a segment.
 * Averages the confidence of overlapping captions.
 *
 * @param segment - The segment to evaluate
 * @param captions - All transcription captions
 * @returns Score 0-100 based on average confidence
 */
function calculateWhisperConfidence(
  segment: InputSegment,
  captions: Caption[]
): number {
  const overlapping = captions.filter(
    (cap) => cap.startMs < segment.endMs && cap.endMs > segment.startMs
  );

  if (overlapping.length === 0) return 50; // Neutral if no captions overlap

  let totalConfidence = 0;
  for (const cap of overlapping) {
    totalConfidence += cap.confidence ?? 1.0;
  }

  const avgConfidence = totalConfidence / overlapping.length;
  return Math.round(avgConfidence * 100);
}

/**
 * Calculates take order score with recency preference.
 * Last take (most recent) gets highest score.
 *
 * @param takeNumber - 1-based take number for this segment
 * @param totalTakes - Total number of takes in the group
 * @returns Score 0-100 favoring the last take
 */
function calculateTakeOrderScore(takeNumber: number, totalTakes: number): number {
  if (totalTakes <= 1) return 100; // Single take → full score

  const positionFromEnd = totalTakes - takeNumber;
  if (positionFromEnd === 0) return 100; // Last take
  if (positionFromEnd === 1) return 70;  // Penultimate
  return 40;                              // Earlier takes
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

  // Whisper confidence
  if (config.weights.whisperConfidence > 0 && breakdown.whisperConfidence < 50) {
    reasons.push("baja confianza de transcripcion");
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
 * Options for scoreSegment with logging support
 */
interface ScoreSegmentOptions {
  collector?: LogCollector;
  takeDetectionMethod?: "script" | "similarity" | "none";
  takeGroupId?: string;
  relatedSegmentIds?: string[];
  totalTakes?: number;
}

/**
 * Scores a single segment
 */
function scoreSegment(
  segment: InputSegment & { id: string },
  captions: Caption[],
  scriptMatch: SegmentScriptMatch | undefined,
  config: PreselectionConfig,
  takeNumber: number,
  options?: ScoreSegmentOptions
): SegmentScore {
  const durationMs = segment.endMs - segment.startMs;
  const transcribedText = getSegmentTranscription(segment, captions);

  // Calculate individual scores
  const durationAnalysis = analyzeDuration(durationMs, config);
  const totalTakes = options?.totalTakes ?? 1;
  const breakdown: SegmentScoreBreakdown = {
    scriptMatch: scriptMatch?.coverageScore ?? 0,
    whisperConfidence: calculateWhisperConfidence(segment, captions),
    takeOrder: calculateTakeOrderScore(takeNumber, totalTakes),
    completeness: 50, // Default
    duration: durationAnalysis.score,
  };

  // Calculate completeness
  let isComplete = false;
  let boundaries: BoundaryAnalysis = {
    startScore: 50,
    endScore: 50,
    startAlignedWithCaption: false,
    endHasPunctuation: false,
  };

  if (transcribedText) {
    isComplete = isCompleteSentence(transcribedText);
    boundaries = hasNaturalBoundaries(segment, captions);
    breakdown.completeness = isComplete
      ? 100
      : Math.round((boundaries.startScore + boundaries.endScore) / 2);
  }

  // Calculate weighted scores for logging
  const weightedScores = {
    scriptMatch: breakdown.scriptMatch * config.weights.scriptMatch,
    whisperConfidence: breakdown.whisperConfidence * config.weights.whisperConfidence,
    takeOrder: breakdown.takeOrder * config.weights.takeOrder,
    completeness: breakdown.completeness * config.weights.completeness,
    duration: breakdown.duration * config.weights.duration,
  };

  // Calculate weighted total
  const totalScore =
    weightedScores.scriptMatch +
    weightedScores.whisperConfidence +
    weightedScores.takeOrder +
    weightedScores.completeness +
    weightedScores.duration;

  // Check if ambiguous (score between 40-60)
  const isAmbiguous = totalScore >= 40 && totalScore <= 60;

  const reason = generateScoreReason(
    breakdown,
    totalScore,
    config,
    scriptMatch?.isRepetition ?? false,
    takeNumber
  );

  // Log detailed scoring data if collector is provided
  if (options?.collector) {
    const criterionReasons = generateCriterionReasons(
      breakdown,
      config,
      scriptMatch,
      takeNumber,
      isComplete,
      durationAnalysis.status
    );

    const loggingData: ScoringLogData = {
      segmentId: segment.id,
      timing: {
        startMs: segment.startMs,
        endMs: segment.endMs,
        durationMs,
      },
      scores: {
        total: totalScore,
        breakdown,
        weighted: weightedScores,
      },
      scriptMatch: scriptMatch
        ? {
            matchedSentenceIndices: scriptMatch.matchedSentenceIndices,
            coverageScore: scriptMatch.coverageScore,
            isRepetition: scriptMatch.isRepetition,
            transcribedText: scriptMatch.transcribedText,
          }
        : undefined,
      takeInfo: {
        takeNumber,
        detectionMethod: options.takeDetectionMethod ?? "none",
        groupId: options.takeGroupId,
        relatedSegmentIds: options.relatedSegmentIds,
      },
      completeness: {
        score: breakdown.completeness,
        isCompleteSentence: isComplete,
        boundaries,
      },
      durationAnalysis: {
        score: durationAnalysis.score,
        status: durationAnalysis.status,
        idealRange: config.idealDuration,
      },
      criterionReasons,
    };

    logSegmentScoring(options.collector, loggingData);
  }

  return {
    segmentId: segment.id,
    totalScore,
    breakdown,
    reason,
    isAmbiguous,
  };
}

/**
 * Options for scoreSegments
 */
export interface ScoreSegmentsOptions {
  /** Optional map of segment ID → take number (for no-script repetition detection) */
  takeGroups?: Map<string, number>;
  /** Optional map of segment ID → total takes in its group */
  totalTakesMap?: Map<string, number>;
  /** Optional log collector for detailed logging */
  collector?: LogCollector;
}

/**
 * Scores all segments
 *
 * @param segments - Array of segments to score
 * @param captions - Transcription captions
 * @param script - Optional script text for matching
 * @param config - Preselection configuration
 * @param options - Optional scoring options including takeGroups and collector
 * @returns Array of segment scores
 */
export function scoreSegments(
  segments: Array<InputSegment & { id: string }>,
  captions: Caption[],
  script: string | undefined,
  config: PreselectionConfig,
  options?: ScoreSegmentsOptions | Map<string, number>
): SegmentScore[] {
  // Handle backward compatibility: options can be a Map (old API) or object (new API)
  const takeGroups = options instanceof Map ? options : options?.takeGroups;
  const totalTakesMap = options instanceof Map ? undefined : options?.totalTakesMap;
  const collector = options instanceof Map ? undefined : options?.collector;

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

  // Build totalTakes map from script matches if not provided
  let effectiveTotalTakesMap = totalTakesMap;
  if (!effectiveTotalTakesMap && scriptMatches) {
    effectiveTotalTakesMap = new Map<string, number>();
    const takeGroupsByScript = detectTakeGroups(scriptMatches);
    for (const [, segmentIds] of takeGroupsByScript) {
      for (const segId of segmentIds) {
        const current = effectiveTotalTakesMap.get(segId) ?? 1;
        if (segmentIds.length > current) {
          effectiveTotalTakesMap.set(segId, segmentIds.length);
        }
      }
    }
  }

  // Score each segment
  const scores: SegmentScore[] = [];

  for (const segment of segments) {
    const match = matchMap.get(segment.id);

    // Determine take number: from script matches OR from similarity-based takeGroups
    let takeNumber = 1;
    let takeDetectionMethod: "script" | "similarity" | "none" = "none";

    if (scriptMatches) {
      takeNumber = getSegmentTakeNumber(segment.id, scriptMatches);
      takeDetectionMethod = "script";
    } else if (takeGroups) {
      takeNumber = takeGroups.get(segment.id) ?? 1;
      if (takeNumber > 1) {
        takeDetectionMethod = "similarity";
      }
    }

    const totalTakes = effectiveTotalTakesMap?.get(segment.id) ?? 1;

    const score = scoreSegment(segment, captions, match, config, takeNumber, {
      collector,
      takeDetectionMethod,
      totalTakes,
    });
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

/**
 * Selects the best take per group, ensuring only one segment per take-group is enabled.
 * Segments not belonging to any group use the standard minScore threshold.
 *
 * @param scores - All segment scores
 * @param config - Configuration with threshold
 * @param scriptMatches - Script matching results (for detecting take groups)
 * @param takeGroups - Similarity-based take groups (for no-script mode)
 * @returns Set of segment IDs that should be enabled
 */
export function selectBestPerGroup(
  scores: SegmentScore[],
  config: PreselectionConfig,
  scriptMatches?: SegmentScriptMatch[],
  takeGroups?: Map<string, number>
): Set<string> {
  const selected = new Set<string>();
  const scoreMap = new Map<string, SegmentScore>();
  for (const s of scores) {
    scoreMap.set(s.segmentId, s);
  }

  // Track which segments have been assigned to a group
  const assignedToGroup = new Set<string>();

  if (scriptMatches) {
    // Build groups from script matching: group by shared sentence coverage
    const sentenceGroups = detectTakeGroups(scriptMatches);

    // For each sentence that has multiple takes, pick the best one
    for (const [, segmentIds] of sentenceGroups) {
      if (segmentIds.length <= 1) continue;

      // Find the best scoring segment in this group
      let bestId: string | null = null;
      let bestScore = -1;

      for (const segId of segmentIds) {
        assignedToGroup.add(segId);
        const score = scoreMap.get(segId);
        if (score && score.totalScore > bestScore) {
          bestScore = score.totalScore;
          bestId = segId;
        }
      }

      if (bestId && bestScore >= config.minScore) {
        selected.add(bestId);
      }
    }
  } else if (takeGroups) {
    // Build groups from similarity-based detection
    // takeGroups maps segmentId → takeNumber; group segments that share the same group
    // We need to reconstruct groups: segments with takeNumber > 1 are part of a repetition group
    // But we don't have group IDs directly. Use a heuristic: segments with takeNumber > 1
    // near each other temporally are in the same group.

    // For similarity mode, segments with takeNumber > 1 have been already identified as repeats.
    // The simplest approach: for all segments with takeNumber > 1, only keep the highest scorer.
    const repeatedSegments: string[] = [];
    for (const [segId, takeNum] of takeGroups) {
      if (takeNum > 1) {
        repeatedSegments.push(segId);
        assignedToGroup.add(segId);
      }
    }

    // Also add takeNumber=1 segments that are the "first" of a repeated group
    // These are implicitly part of the group
    // For simplicity, among all segments with takeGroups entries, pick the best
    if (repeatedSegments.length > 0) {
      let bestId: string | null = null;
      let bestScore = -1;
      for (const segId of repeatedSegments) {
        const score = scoreMap.get(segId);
        if (score && score.totalScore > bestScore) {
          bestScore = score.totalScore;
          bestId = segId;
        }
      }
      if (bestId && bestScore >= config.minScore) {
        selected.add(bestId);
      }
    }
  }

  // For segments not assigned to any group, use standard threshold
  for (const score of scores) {
    if (!assignedToGroup.has(score.segmentId) && score.totalScore >= config.minScore) {
      selected.add(score.segmentId);
    }
  }

  return selected;
}
