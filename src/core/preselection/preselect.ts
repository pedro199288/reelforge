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
  AIPreselectionConfig,
  PreselectionLog,
} from "./types";
import {
  DEFAULT_PRESELECTION_CONFIG,
  DEFAULT_PRESELECTION_CONFIG_NO_SCRIPT,
} from "./types";
import { aiPreselectSegments } from "./ai-preselect";
import {
  matchSegmentsToScript,
  calculateScriptCoverage,
} from "./script-matcher";
import { scoreSegments, selectByScore } from "./scorer";
import { groupSimilarPhrases, mergeCaptions, type PhraseGroup } from "../takes/similarity";
import {
  createLogCollector,
  logSegmentScoring,
  logSegmentDecision,
  finalizeLog,
  type LogCollector,
} from "./logger";

/**
 * Builds a map of segment ID → take number from phrase groups
 *
 * When no script is available, this function uses similarity-based phrase grouping
 * to detect repetitions. Each group represents a distinct phrase, and takes within
 * that group are numbered by time order (first occurrence = take 1, second = take 2, etc.)
 */
function buildTakeGroupsFromPhrases(
  phraseGroups: PhraseGroup[],
  segments: Array<{ id: string; startMs: number; endMs: number }>,
  captions: Caption[]
): Map<string, number> {
  const takeGroups = new Map<string, number>();

  for (const group of phraseGroups) {
    // Skip groups with only one take (no repetition)
    if (group.takes.length <= 1) continue;

    // Sort takes by time (they should already be sorted, but ensure it)
    const sortedTakes = [...group.takes].sort((a, b) => a.startMs - b.startMs);

    // Assign takeNumber to each segment that contains this take
    for (let i = 0; i < sortedTakes.length; i++) {
      const take = sortedTakes[i];
      const takeNumber = i + 1;

      // Find the segment that contains this take
      const segment = segments.find(
        (s) => s.startMs <= take.startMs && s.endMs >= take.endMs
      );

      if (segment) {
        // Only update if this takeNumber is higher (worse) than existing
        // This handles cases where a segment might contain multiple takes
        const existing = takeGroups.get(segment.id) ?? 1;
        if (takeNumber > existing) {
          takeGroups.set(segment.id, takeNumber);
        }
      }
    }
  }

  return takeGroups;
}

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
  config?: Partial<PreselectionConfig> & {
    ai?: AIPreselectionConfig;
  };
  /** Video ID for logging (optional - only needed if you want logs) */
  videoId?: string;
  /** Whether to collect detailed logs */
  collectLogs?: boolean;
}

/**
 * Extended result type that includes logs
 */
export interface PreselectionResultWithLog extends PreselectionResult {
  /** Detailed preselection log (if collectLogs was true) */
  log?: PreselectionLog;
}

/**
 * Calculates preselection statistics
 *
 * @param segments - All preselected segments
 * @param script - Optional script text
 * @param scriptMatches - Script matching results (if script was provided)
 * @param similarityRepetitions - Number of repetitions detected via similarity (when no script)
 */
function calculateStats(
  segments: PreselectedSegment[],
  script: string | undefined,
  scriptMatches: ReturnType<typeof matchSegmentsToScript> | undefined,
  similarityRepetitions = 0
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

  // Count repetitions removed (from script matches OR from similarity detection)
  const scriptRepetitions = scriptMatches
    ? scriptMatches.filter((m) => m.isRepetition && !selectedIds.has(m.segmentId))
        .length
    : 0;
  const repetitionsRemoved = scriptRepetitions + similarityRepetitions;

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
 * @returns Preselection result with segments and statistics (optionally includes logs)
 *
 * @example
 * ```ts
 * const result = await preselectSegments(segments, {
 *   captions: captionsRaw,
 *   script: workspaceScript,
 *   videoDurationMs: 120000,
 *   videoId: "my-video",
 *   collectLogs: true,
 * });
 *
 * // Import preselected segments to timeline
 * for (const segment of result.segments) {
 *   timelineStore.importSegment(videoId, segment);
 * }
 *
 * // Access detailed logs if collected
 * if (result.log) {
 *   console.log("Processing time:", result.log.processingTimeMs);
 * }
 * ```
 */
export async function preselectSegments(
  inputSegments: InputSegment[],
  options: PreselectOptions
): Promise<PreselectionResultWithLog> {
  const {
    captions,
    script,
    videoDurationMs,
    config: configOverrides,
    videoId = "unknown",
    collectLogs = false,
  } = options;

  // Determine config early for logging
  const hasScript = !!(script && script.trim().length > 0);
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

  // Create log collector if logging is enabled
  const collector: LogCollector | undefined = collectLogs
    ? createLogCollector(
        inputSegments.length,
        hasScript,
        hasScript ? splitIntoSentences(script!).length : undefined,
        captions?.length ?? 0
      )
    : undefined;

  // AI preselection mode
  // For cloud providers (anthropic, openai) require apiKey
  // For local providers (openai-compatible) apiKey is optional
  const aiConfig = configOverrides?.ai;
  const canUseAI = aiConfig?.enabled && (
    aiConfig.provider === "openai-compatible" || aiConfig.apiKey
  );

  if (canUseAI && aiConfig) {
    try {
      const aiResult = await aiPreselectSegments(inputSegments, {
        captions,
        script,
        videoDurationMs,
        aiConfig,
        collector,
      });

      // Finalize log for AI mode
      if (collector) {
        const log = finalizeLog(collector, videoId, config, aiResult.stats, "ai");
        return { ...aiResult, log };
      }

      return aiResult;
    } catch (error) {
      console.error("AI preselection failed, falling back to traditional:", error);
      // Fall through to traditional algorithm
    }
  }

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

    const stats = calculateStats(segments, undefined, undefined);

    // Finalize log for no-captions case
    if (collector) {
      // Create basic log entries for each segment (no detailed scoring without captions)
      for (const seg of segments) {
        const durationMs = seg.endMs - seg.startMs;
        logSegmentScoring(collector, {
          segmentId: seg.id,
          timing: { startMs: seg.startMs, endMs: seg.endMs, durationMs },
          scores: {
            total: 100,
            breakdown: { scriptMatch: 0, takeOrder: 100, completeness: 100, duration: 100 },
            weighted: { scriptMatch: 0, takeOrder: 100, completeness: 100, duration: 100 },
          },
          takeInfo: { takeNumber: 1, detectionMethod: "none" },
          completeness: {
            score: 100,
            isCompleteSentence: false,
            boundaries: { startScore: 100, endScore: 100, startAlignedWithCaption: false, endHasPunctuation: false },
          },
          durationAnalysis: {
            score: 100,
            status: "ideal",
            idealRange: config.idealDuration,
          },
          criterionReasons: {
            scriptMatch: "Sin captions para evaluar",
            takeOrder: "Sin captions para detectar tomas",
            completeness: "Sin captions para evaluar",
            duration: "Duracion asumida como ideal",
          },
        });
        logSegmentDecision(collector, seg.id, true, seg.reason, false, 100);
      }
      const log = finalizeLog(collector, videoId, config, stats, "traditional");
      return { segments, stats, log };
    }

    return { segments, stats };
  }

  // Get script matches if script is provided
  const scriptMatches = hasScript
    ? matchSegmentsToScript(segmentsWithIds, captions, script!)
    : undefined;

  // Build take groups from similarity-based phrase detection when no script is available
  let takeGroups: Map<string, number> | undefined;
  let repetitionsFromSimilarity = 0;

  if (!hasScript && captions.length > 0) {
    // Merge captions to form longer phrases for better similarity matching
    const mergedCaptions = mergeCaptions(captions, 500);

    // Detect repeated phrases using similarity matching (lower threshold to catch more variations)
    const phraseGroups = groupSimilarPhrases(mergedCaptions, {
      threshold: 0.65, // Lowered from 0.8 to catch more natural variations
      minPhraseLength: 10,
    });

    // Build map of segment ID → take number
    takeGroups = buildTakeGroupsFromPhrases(phraseGroups, segmentsWithIds, captions);

    // Count repetitions for stats
    repetitionsFromSimilarity = Array.from(takeGroups.values()).filter((t) => t > 1).length;
  }

  // Score all segments (passing takeGroups for no-script repetition detection)
  const scores = scoreSegments(segmentsWithIds, captions, script, config, {
    takeGroups,
    collector,
  });

  // Select segments based on scores
  const selectedIds = selectByScore(scores, config);

  // Build result segments
  const segments: PreselectedSegment[] = segmentsWithIds.map((seg, index) => {
    const score = scores[index];
    const enabled = selectedIds.has(seg.id);

    // Log the decision
    if (collector) {
      logSegmentDecision(
        collector,
        seg.id,
        enabled,
        score.reason,
        score.isAmbiguous,
        score.totalScore
      );
    }

    return {
      id: seg.id,
      startMs: seg.startMs,
      endMs: seg.endMs,
      enabled,
      score: Math.round(score.totalScore),
      reason: score.reason,
    };
  });

  // Calculate stats (passing similarity-based repetitions for no-script case)
  const stats = calculateStats(segments, script, scriptMatches, repetitionsFromSimilarity);

  // Finalize log
  if (collector) {
    const log = finalizeLog(collector, videoId, config, stats, "traditional");
    return { segments, stats, log };
  }

  return { segments, stats };
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

  // Build take groups from similarity-based phrase detection when no script is available
  let takeGroups: Map<string, number> | undefined;
  let repetitionsFromSimilarity = 0;

  if (!hasScript && captions.length > 0) {
    const mergedCaptions = mergeCaptions(captions, 500);
    const phraseGroups = groupSimilarPhrases(mergedCaptions, {
      threshold: 0.65,
      minPhraseLength: 10,
    });
    takeGroups = buildTakeGroupsFromPhrases(phraseGroups, existingSegments, captions);
    repetitionsFromSimilarity = Array.from(takeGroups.values()).filter((t) => t > 1).length;
  }

  // Score segments (passing takeGroups for no-script repetition detection)
  const scores = scoreSegments(existingSegments, captions, script, config, takeGroups);

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

  const stats = calculateStats(segments, script, scriptMatches, repetitionsFromSimilarity);

  return {
    segments,
    stats,
  };
}
