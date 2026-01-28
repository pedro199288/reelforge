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
} from "./types";

export {
  DEFAULT_PRESELECTION_CONFIG,
  DEFAULT_PRESELECTION_CONFIG_NO_SCRIPT,
} from "./types";

// Main functions
export { preselectSegments, reapplyPreselection } from "./preselect";
export type { PreselectOptions } from "./preselect";

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
