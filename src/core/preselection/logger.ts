/**
 * Preselection Logger Module
 *
 * Provides utilities for collecting and formatting detailed logs
 * during the preselection process for debugging and analysis.
 */

import type {
  PreselectionConfig,
  PreselectionStats,
  PreselectionLog,
  SegmentPreselectionLog,
  AIPreselectionTrace,
  SegmentScoreBreakdown,
  SegmentScriptMatch,
} from "./types";

/**
 * Log collector that accumulates data during preselection
 */
export interface LogCollector {
  startTime: number;
  segmentLogs: Map<string, Partial<SegmentPreselectionLog>>;
  context: PreselectionLog["context"];
  aiTrace?: AIPreselectionTrace;
  timeline: PreselectionLog["timeline"];
}

/**
 * Extended scoring data returned from scoreSegment for logging
 */
export interface ScoringLogData {
  segmentId: string;
  timing: SegmentPreselectionLog["timing"];
  scores: SegmentPreselectionLog["scores"];
  scriptMatch?: SegmentPreselectionLog["scriptMatch"];
  takeInfo: SegmentPreselectionLog["takeInfo"];
  completeness: SegmentPreselectionLog["completeness"];
  durationAnalysis: SegmentPreselectionLog["durationAnalysis"];
  criterionReasons: SegmentPreselectionLog["decision"]["criterionReasons"];
}

/**
 * Creates a new log collector for a preselection run
 */
export function createLogCollector(
  totalSegments: number,
  hasScript: boolean,
  scriptSentenceCount: number | undefined,
  captionsCount: number
): LogCollector {
  return {
    startTime: Date.now(),
    segmentLogs: new Map(),
    context: {
      totalSegments,
      hasScript,
      scriptSentenceCount,
      captionsCount,
    },
    timeline: [],
  };
}

/**
 * Logs detailed scoring data for a segment
 */
export function logSegmentScoring(
  collector: LogCollector,
  data: ScoringLogData
): void {
  const existing = collector.segmentLogs.get(data.segmentId) ?? {};

  collector.segmentLogs.set(data.segmentId, {
    ...existing,
    segmentId: data.segmentId,
    timing: data.timing,
    scores: data.scores,
    scriptMatch: data.scriptMatch,
    takeInfo: data.takeInfo,
    completeness: data.completeness,
    durationAnalysis: data.durationAnalysis,
    decision: {
      ...(existing.decision ?? {
        enabled: false,
        reason: "",
        isAmbiguous: false,
        criterionReasons: {},
      }),
      criterionReasons: data.criterionReasons,
    },
  });
}

/**
 * Logs the final decision for a segment
 */
export function logSegmentDecision(
  collector: LogCollector,
  segmentId: string,
  enabled: boolean,
  reason: string,
  isAmbiguous: boolean,
  score: number
): void {
  const existing = collector.segmentLogs.get(segmentId);
  if (!existing) return;

  existing.decision = {
    ...(existing.decision ?? { criterionReasons: {} }),
    enabled,
    reason,
    isAmbiguous,
  };

  // Add to timeline
  collector.timeline.push({
    timestampMs: existing.timing?.startMs ?? 0,
    segmentId,
    event: isAmbiguous ? "ambiguous" : enabled ? "selected" : "rejected",
    score,
  });
}

/**
 * Logs AI trace data
 */
export function logAITrace(
  collector: LogCollector,
  trace: AIPreselectionTrace
): void {
  collector.aiTrace = trace;
}

/**
 * Finalizes the log and produces the complete PreselectionLog
 */
export function finalizeLog(
  collector: LogCollector,
  videoId: string,
  config: PreselectionConfig,
  stats: PreselectionStats,
  mode: "traditional" | "ai"
): PreselectionLog {
  const processingTimeMs = Date.now() - collector.startTime;

  // Convert map to array and sort by start time
  const segmentLogs = Array.from(collector.segmentLogs.values())
    .filter((log): log is SegmentPreselectionLog => {
      // Ensure all required fields are present
      return !!(
        log.segmentId &&
        log.timing &&
        log.scores &&
        log.takeInfo &&
        log.completeness &&
        log.durationAnalysis &&
        log.decision
      );
    })
    .sort((a, b) => a.timing.startMs - b.timing.startMs);

  // Sort timeline by timestamp
  const timeline = [...collector.timeline].sort(
    (a, b) => a.timestampMs - b.timestampMs
  );

  return {
    videoId,
    createdAt: new Date().toISOString(),
    processingTimeMs,
    config: {
      mode,
      weights: config.weights,
      minScore: config.minScore,
    },
    context: collector.context,
    segmentLogs,
    aiTrace: collector.aiTrace,
    stats,
    timeline,
  };
}

/**
 * Helper to generate criterion-specific reasons
 */
export function generateCriterionReasons(
  breakdown: SegmentScoreBreakdown,
  config: PreselectionConfig,
  scriptMatch: SegmentScriptMatch | undefined,
  takeNumber: number,
  isCompleteSentence: boolean,
  durationStatus: "too_short" | "ideal" | "too_long"
): SegmentPreselectionLog["decision"]["criterionReasons"] {
  const reasons: SegmentPreselectionLog["decision"]["criterionReasons"] = {};

  // Script match reason
  if (config.weights.scriptMatch > 0) {
    if (breakdown.scriptMatch >= 80) {
      reasons.scriptMatch = `Alta cobertura del guion (${breakdown.scriptMatch}%)`;
    } else if (breakdown.scriptMatch >= 50) {
      reasons.scriptMatch = `Cobertura parcial del guion (${breakdown.scriptMatch}%)`;
    } else if (breakdown.scriptMatch > 0) {
      reasons.scriptMatch = `Baja cobertura del guion (${breakdown.scriptMatch}%)`;
    } else {
      reasons.scriptMatch = "Sin coincidencia con el guion";
    }

    if (scriptMatch?.isRepetition) {
      reasons.scriptMatch += " - Es repeticion";
    }
  }

  // Whisper confidence reason
  if (config.weights.whisperConfidence > 0) {
    if (breakdown.whisperConfidence >= 80) {
      reasons.whisperConfidence = `Alta confianza de transcripcion (${breakdown.whisperConfidence}%)`;
    } else if (breakdown.whisperConfidence >= 50) {
      reasons.whisperConfidence = `Confianza media de transcripcion (${breakdown.whisperConfidence}%)`;
    } else {
      reasons.whisperConfidence = `Baja confianza de transcripcion (${breakdown.whisperConfidence}%)`;
    }
  }

  // Take order reason (recency: last take preferred)
  if (takeNumber === 1) {
    reasons.takeOrder = "Primera toma (preferida)";
  } else if (takeNumber === 2) {
    reasons.takeOrder = `Segunda toma (${breakdown.takeOrder}%)`;
  } else {
    reasons.takeOrder = `Toma ${takeNumber} (${breakdown.takeOrder}%)`;
  }

  // Completeness reason
  if (isCompleteSentence) {
    reasons.completeness = "Oracion completa";
  } else if (breakdown.completeness >= 75) {
    reasons.completeness = `Buenos limites naturales (${breakdown.completeness}%)`;
  } else if (breakdown.completeness >= 50) {
    reasons.completeness = `Limites aceptables (${breakdown.completeness}%)`;
  } else {
    reasons.completeness = `Fragmento incompleto (${breakdown.completeness}%)`;
  }

  // Duration reason
  if (durationStatus === "ideal") {
    reasons.duration = "Duracion ideal";
  } else if (durationStatus === "too_short") {
    reasons.duration = `Demasiado corto (${breakdown.duration}%)`;
  } else {
    reasons.duration = `Demasiado largo (${breakdown.duration}%)`;
  }

  return reasons;
}
