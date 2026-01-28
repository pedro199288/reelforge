/**
 * Preselection Orchestrator
 *
 * Main entry point for the preselection system.
 * Coordinates script matching, scoring, and selection.
 */

import { nanoid } from "nanoid";
import type { Caption } from "../script/align";
import { splitIntoSentences } from "../script/takes";
import type {
  PreselectionConfig,
  PreselectionResult,
  PreselectedSegment,
  PreselectionStats,
  InputSegment,
} from "./types";
import {
  DEFAULT_PRESELECTION_CONFIG,
  DEFAULT_PRESELECTION_CONFIG_NO_SCRIPT,
} from "./types";
import {
  matchSegmentsToScript,
  calculateScriptCoverage,
} from "./script-matcher";
import { scoreSegments, selectByScore } from "./scorer";

/**
 * Options for the preselection process
 */
export interface PreselectOptions {
  /** Transcription captions with timestamps */
  captions: Caption[];
  /** Optional script text for improved accuracy */
  script?: string;
  /** Total video duration in milliseconds */
  videoDurationMs: number;
  /** Configuration overrides */
  config?: Partial<PreselectionConfig>;
}

/**
 * Calculates preselection statistics
 */
function calculateStats(
  segments: PreselectedSegment[],
  script: string | undefined,
  scriptMatches: ReturnType<typeof matchSegmentsToScript> | undefined
): PreselectionStats {
  const selected = segments.filter((s) => s.enabled);
  const selectedIds = new Set(selected.map((s) => s.id));

  // Calculate durations
  const originalDurationMs = segments.reduce(
    (sum, s) => sum + (s.endMs - s.startMs),
    0
  );
  const selectedDurationMs = selected.reduce(
    (sum, s) => sum + (s.endMs - s.startMs),
    0
  );

  // Calculate script coverage
  let scriptCoverage = 100;
  if (script && scriptMatches) {
    const totalSentences = splitIntoSentences(script).length;
    scriptCoverage = calculateScriptCoverage(
      scriptMatches,
      selectedIds,
      totalSentences
    );
  }

  // Count repetitions removed
  const repetitionsRemoved = scriptMatches
    ? scriptMatches.filter((m) => m.isRepetition && !selectedIds.has(m.segmentId))
        .length
    : 0;

  // Calculate average score
  const averageScore =
    selected.length > 0
      ? selected.reduce((sum, s) => sum + s.score, 0) / selected.length
      : 0;

  // Count ambiguous segments
  const ambiguousSegments = segments.filter(
    (s) => s.score >= 40 && s.score <= 60
  ).length;

  return {
    totalSegments: segments.length,
    selectedSegments: selected.length,
    originalDurationMs,
    selectedDurationMs,
    scriptCoverage,
    repetitionsRemoved,
    averageScore,
    ambiguousSegments,
  };
}

/**
 * Performs automatic preselection of segments
 *
 * This function analyzes segments and determines which ones should be
 * enabled based on script coverage, take detection, and quality metrics.
 *
 * @param inputSegments - Raw segments to analyze (from silence detection)
 * @param options - Preselection options including captions and optional script
 * @returns Preselection result with segments and statistics
 *
 * @example
 * ```ts
 * const result = await preselectSegments(segments, {
 *   captions: captionsRaw,
 *   script: workspaceScript,
 *   videoDurationMs: 120000,
 * });
 *
 * // Import preselected segments to timeline
 * for (const segment of result.segments) {
 *   timelineStore.importSegment(videoId, segment);
 * }
 * ```
 */
export async function preselectSegments(
  inputSegments: InputSegment[],
  options: PreselectOptions
): Promise<PreselectionResult> {
  const { captions, script, config: configOverrides } = options;

  // Determine config based on whether script is provided
  const hasScript = script && script.trim().length > 0;
  const baseConfig = hasScript
    ? DEFAULT_PRESELECTION_CONFIG
    : DEFAULT_PRESELECTION_CONFIG_NO_SCRIPT;

  const config: PreselectionConfig = {
    ...baseConfig,
    ...configOverrides,
    weights: {
      ...baseConfig.weights,
      ...configOverrides?.weights,
    },
    idealDuration: {
      ...baseConfig.idealDuration,
      ...configOverrides?.idealDuration,
    },
  };

  // Add IDs to segments
  const segmentsWithIds = inputSegments.map((seg) => ({
    ...seg,
    id: nanoid(8),
  }));

  // If no captions, return all segments enabled (can't do preselection)
  if (!captions || captions.length === 0) {
    const segments: PreselectedSegment[] = segmentsWithIds.map((seg) => ({
      id: seg.id,
      startMs: seg.startMs,
      endMs: seg.endMs,
      enabled: true,
      score: 100,
      reason: "Sin transcripcion disponible - todos los segmentos habilitados",
    }));

    return {
      segments,
      stats: calculateStats(segments, undefined, undefined),
    };
  }

  // Get script matches if script is provided
  const scriptMatches = hasScript
    ? matchSegmentsToScript(segmentsWithIds, captions, script!)
    : undefined;

  // Score all segments
  const scores = scoreSegments(segmentsWithIds, captions, script, config);

  // Select segments based on scores
  const selectedIds = selectByScore(scores, config);

  // Build result segments
  const segments: PreselectedSegment[] = segmentsWithIds.map((seg, index) => {
    const score = scores[index];
    return {
      id: seg.id,
      startMs: seg.startMs,
      endMs: seg.endMs,
      enabled: selectedIds.has(seg.id),
      score: Math.round(score.totalScore),
      reason: score.reason,
    };
  });

  // Calculate stats
  const stats = calculateStats(segments, script, scriptMatches);

  return {
    segments,
    stats,
  };
}

/**
 * Re-applies preselection to existing segments (preserving IDs)
 *
 * Useful when the script changes and you want to re-evaluate
 * without losing segment references.
 */
export async function reapplyPreselection(
  existingSegments: Array<{ id: string; startMs: number; endMs: number }>,
  options: PreselectOptions
): Promise<PreselectionResult> {
  const { captions, script, config: configOverrides } = options;

  const hasScript = script && script.trim().length > 0;
  const baseConfig = hasScript
    ? DEFAULT_PRESELECTION_CONFIG
    : DEFAULT_PRESELECTION_CONFIG_NO_SCRIPT;

  const config: PreselectionConfig = {
    ...baseConfig,
    ...configOverrides,
    weights: {
      ...baseConfig.weights,
      ...configOverrides?.weights,
    },
    idealDuration: {
      ...baseConfig.idealDuration,
      ...configOverrides?.idealDuration,
    },
  };

  // If no captions, return all enabled
  if (!captions || captions.length === 0) {
    const segments: PreselectedSegment[] = existingSegments.map((seg) => ({
      ...seg,
      enabled: true,
      score: 100,
      reason: "Sin transcripcion disponible",
    }));

    return {
      segments,
      stats: calculateStats(segments, undefined, undefined),
    };
  }

  // Get script matches
  const scriptMatches = hasScript
    ? matchSegmentsToScript(existingSegments, captions, script!)
    : undefined;

  // Score segments
  const scores = scoreSegments(existingSegments, captions, script, config);

  // Select based on scores
  const selectedIds = selectByScore(scores, config);

  // Build result
  const segments: PreselectedSegment[] = existingSegments.map((seg, index) => {
    const score = scores[index];
    return {
      id: seg.id,
      startMs: seg.startMs,
      endMs: seg.endMs,
      enabled: selectedIds.has(seg.id),
      score: Math.round(score.totalScore),
      reason: score.reason,
    };
  });

  const stats = calculateStats(segments, script, scriptMatches);

  return {
    segments,
    stats,
  };
}
