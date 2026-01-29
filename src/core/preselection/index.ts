/**
 * Preselection Module
 *
 * Automatic segment selection based on script coverage,
 * take detection, and quality metrics.
 */

// Types
export type {
  PreselectionConfig,
  SegmentScore,
  SegmentScoreBreakdown,
  PreselectedSegment,
  PreselectionStats,
  PreselectionResult,
  SegmentScriptMatch,
  InputSegment,
  CutMapEntry,
} from "./types";

export {
  DEFAULT_PRESELECTION_CONFIG,
  DEFAULT_PRESELECTION_CONFIG_NO_SCRIPT,
  AI_PRESELECTION_MODELS,
  DEFAULT_AI_PRESELECTION_CONFIG,
} from "./types";

export type {
  AIPreselectionConfig,
  AIProvider,
  AIModelOption,
  // Logging types
  SegmentPreselectionLog,
  AIPreselectionTrace,
  PreselectionLog,
} from "./types";

// Main functions
export {
  preselectSegments,
  reapplyPreselection,
  reapplyPreselectionWithCaptions,
  remapCaptionsToOriginal,
} from "./preselect";
export type {
  PreselectOptions,
  PreselectionResultWithLog,
  ReapplyWithCaptionsOptions,
} from "./preselect";

// Logger utilities
export {
  createLogCollector,
  logSegmentScoring,
  logSegmentDecision,
  logAITrace,
  finalizeLog,
} from "./logger";
export type { LogCollector, ScoringLogData } from "./logger";

// Script matching utilities
export {
  matchSegmentsToScript,
  calculateScriptCoverage,
  detectTakeGroups,
  getSegmentTakeNumber,
  getSegmentTranscription,
} from "./script-matcher";

// Scoring utilities
export { scoreSegments, selectByScore } from "./scorer";
export type { ScoreSegmentsOptions } from "./scorer";
