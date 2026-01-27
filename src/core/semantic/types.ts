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
  /** Transcribed text that matched this sentence (for deviation detection) */
  transcribedText?: string;
  /** Whether there's a significant deviation from the script */
  hasDeviation?: boolean;
}

/**
 * A detected deviation from the script
 */
export interface ScriptDeviation {
  /** Sentence index where deviation occurred */
  sentenceIndex: number;
  /** Expected text from script */
  expectedText: string;
  /** Actual transcribed text */
  transcribedText: string;
  /** Start time of the deviation */
  startMs: number;
  /** End time of the deviation */
  endMs: number;
  /** Type of deviation */
  type: "missing" | "modified" | "extra";
  /** Similarity score between expected and transcribed (0-1) */
  similarity: number;
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
  /** Whether script was used as authoritative source */
  usedScriptBoundaries: boolean;
  /** Detected deviations from the script (when script is provided) */
  deviations?: ScriptDeviation[];
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
  /**
   * Use script sentence boundaries as authoritative (default: false).
   * When true, sentence boundaries from the script are definitive and
   * silences are classified strictly based on script structure.
   */
  useScriptBoundaries?: boolean;
  /**
   * Detect deviations between script and transcription (default: false).
   * When true, records where the speaker deviated from the script.
   */
  detectDeviations?: boolean;
  /**
   * Similarity threshold for deviation detection (default: 0.7).
   * Lower values mean more deviations will be flagged.
   */
  deviationThreshold?: number;
}

export const DEFAULT_SEMANTIC_CONFIG: SemanticSegmentConfig = {
  paddingMs: 50,
  minSegmentMs: 100,
  minSilenceDurationMs: 300,
  useScriptBoundaries: false,
  detectDeviations: false,
  deviationThreshold: 0.7,
};
