/**
 * Types for semantic cut detection based on script sentences
 */

/**
 * A sentence with aligned timestamps from transcription
 */
export interface AlignedSentence {
  /** Sentence index in script */
  index: number;
  /** Original sentence text */
  text: string;
  /** Start time in milliseconds */
  startMs: number;
  /** End time in milliseconds */
  endMs: number;
  /** Confidence of alignment (0-1) */
  confidence: number;
}

/**
 * A silence that falls between sentences (candidate for cutting)
 */
export interface SemanticSilence {
  /** Start time in milliseconds */
  startMs: number;
  /** End time in milliseconds */
  endMs: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Index of sentence before this silence */
  sentenceBefore: number;
  /** Index of sentence after this silence */
  sentenceAfter: number;
}

/**
 * Result of semantic analysis
 */
export interface SemanticAnalysisResult {
  /** All aligned sentences with timestamps */
  sentences: AlignedSentence[];
  /** Silences that fall between sentences (cut candidates) */
  semanticSilences: SemanticSilence[];
  /** Silences that fall within sentences (natural pauses - keep) */
  intrasentenceSilences: SemanticSilence[];
  /** Overall confidence of alignment */
  overallConfidence: number;
}

/**
 * Configuration for semantic segment generation
 */
export interface SemanticSegmentConfig {
  /** Padding in milliseconds around cuts (default: 50) */
  paddingMs: number;
  /** Minimum segment duration in milliseconds (default: 100) */
  minSegmentMs: number;
  /** Minimum silence duration to consider for cuts (default: 300) */
  minSilenceDurationMs: number;
}

export const DEFAULT_SEMANTIC_CONFIG: SemanticSegmentConfig = {
  paddingMs: 50,
  minSegmentMs: 100,
  minSilenceDurationMs: 300,
};
