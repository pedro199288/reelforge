/**
 * Take selection and phrase similarity module
 */

export {
  groupSimilarPhrases,
  getRepeatedPhrases,
  getRepetitionStats,
  mergeCaptions,
  findBestTake,
  type Take,
  type PhraseGroup,
  type GroupingOptions,
  type RepetitionStats,
} from "./similarity";

export {
  analyzeAudio,
  analyzeMultipleSegments,
  type AudioAnalysis,
} from "./audio-analysis";

export {
  scoreTake,
  scoreGroup,
  scoreGroupSimple,
  DEFAULT_SCORING_CONFIG,
  type TakeScore,
  type ScoreBreakdown,
  type ScoringConfig,
} from "./scoring";
