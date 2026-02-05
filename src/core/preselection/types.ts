/**
 * Preselection types for automatic segment selection
 */

/**
 * Configuration for the preselection algorithm
 */
export interface PreselectionConfig {
  /** Minimum score threshold (0-100) to enable a segment. Default: 50 */
  minScore: number;
  /** Weights for scoring criteria (must sum to 1.0) */
  weights: {
    /** Priority: script coverage. Default: 0.30 */
    scriptMatch: number;
    /** Whisper transcription confidence. Default: 0.25 */
    whisperConfidence: number;
    /** Last take preferred (recency). Default: 0.20 */
    takeOrder: number;
    /** Complete sentences preferred. Default: 0.15 */
    completeness: number;
    /** Appropriate duration. Default: 0.10 */
    duration: number;
  };
  /** Ideal segment duration range in ms */
  idealDuration: {
    minMs: number;
    maxMs: number;
  };
  /** Use AI for ambiguous cases (score 40-60) */
  useAIForAmbiguous: boolean;
}

/**
 * Default preselection configuration
 */
export const DEFAULT_PRESELECTION_CONFIG: PreselectionConfig = {
  minScore: 50,
  weights: {
    scriptMatch: 0.30,
    whisperConfidence: 0.25,
    takeOrder: 0.20,
    completeness: 0.15,
    duration: 0.10,
  },
  idealDuration: {
    minMs: 2000,
    maxMs: 15000,
  },
  useAIForAmbiguous: false,
};

/**
 * Default config when no script is provided (different weights)
 */
export const DEFAULT_PRESELECTION_CONFIG_NO_SCRIPT: PreselectionConfig = {
  minScore: 50,
  weights: {
    scriptMatch: 0, // No script to match
    whisperConfidence: 0.30,
    takeOrder: 0.35,
    completeness: 0.20,
    duration: 0.15,
  },
  idealDuration: {
    minMs: 2000,
    maxMs: 15000,
  },
  useAIForAmbiguous: false,
};

/**
 * Score breakdown for a single segment
 */
export interface SegmentScoreBreakdown {
  /** Script coverage score (0-100) */
  scriptMatch: number;
  /** Whisper transcription confidence score (0-100) */
  whisperConfidence: number;
  /** Take order score (0-100) - last take gets highest (recency) */
  takeOrder: number;
  /** Completeness score (0-100) - complete sentences */
  completeness: number;
  /** Duration score (0-100) - ideal duration range */
  duration: number;
}

/**
 * Scoring result for a single segment
 */
export interface SegmentScore {
  /** Segment identifier */
  segmentId: string;
  /** Total weighted score (0-100) */
  totalScore: number;
  /** Individual criterion scores */
  breakdown: SegmentScoreBreakdown;
  /** Human-readable reason for the score */
  reason: string;
  /** Whether this segment is in the ambiguous zone (40-60) */
  isAmbiguous: boolean;
}

/**
 * Content type classification for AI preselection
 */
export type ContentType =
  | "best_take" // Best take of a script line
  | "alternative_take" // Alternative/backup take
  | "false_start" // Aborted attempt / false start
  | "off_script" // Content not in script (improvisation)
  | "transition"; // Natural transition between content

/**
 * Proposed split within a segment (from AI analysis)
 */
export interface ProposedSplit {
  /** Timestamp in ms where to split (relative to segment start) */
  splitAtMs: number;
  /** Reason for the split */
  reason: string;
  /** Whether to enable the first part (before split) */
  enableFirst: boolean;
  /** Whether to enable the second part (after split) */
  enableSecond: boolean;
}

/**
 * A segment with preselection metadata
 */
export interface PreselectedSegment {
  /** Unique identifier */
  id: string;
  /** Start time in milliseconds */
  startMs: number;
  /** End time in milliseconds */
  endMs: number;
  /** Whether the segment should be enabled */
  enabled: boolean;
  /** Preselection score (0-100) */
  score: number;
  /** Human-readable reason for selection/rejection */
  reason: string;
  /** Content type classification (AI preselection) */
  contentType?: ContentType;
  /** Script lines covered by this segment (1-indexed, AI preselection) */
  coversScriptLines?: number[];
  /** If alternative_take, reference to the best take segment ID */
  bestTakeSegmentId?: string;
  /** Proposed splits if segment contains mixed content */
  proposedSplits?: ProposedSplit[];
  /** Take group identifier (segments covering the same script content) */
  takeGroupId?: string;
  /** Take number within the group (1-based) */
  takeNumber?: number;
  /** Total number of takes in the group */
  totalTakes?: number;
  /** Score breakdown per criterion */
  scoreBreakdown?: SegmentScoreBreakdown;
}

/**
 * Statistics about the preselection process
 */
export interface PreselectionStats {
  /** Total number of segments analyzed */
  totalSegments: number;
  /** Number of segments selected (enabled) */
  selectedSegments: number;
  /** Original total duration in ms */
  originalDurationMs: number;
  /** Duration of selected segments in ms */
  selectedDurationMs: number;
  /** Percentage of script covered by selected segments (0-100) */
  scriptCoverage: number;
  /** Number of repetitions/takes removed */
  repetitionsRemoved: number;
  /** Average score of selected segments */
  averageScore: number;
  /** Number of ambiguous segments */
  ambiguousSegments: number;
  /** Number of false starts detected (AI preselection) */
  falseStartsDetected?: number;
  /** Script lines covered (1-indexed, AI preselection) */
  coveredScriptLines?: number[];
  /** Script lines NOT covered (1-indexed, AI preselection) */
  missingScriptLines?: number[];
}

/**
 * Result of the preselection process
 */
export interface PreselectionResult {
  /** Segments with preselection metadata */
  segments: PreselectedSegment[];
  /** Statistics about the preselection */
  stats: PreselectionStats;
}

/**
 * Match information between a segment and script sentences
 */
export interface SegmentScriptMatch {
  /** Segment identifier */
  segmentId: string;
  /** Indices of script sentences covered by this segment */
  matchedSentenceIndices: number[];
  /** Coverage score (0-100) based on text overlap */
  coverageScore: number;
  /** Whether this segment covers content already covered by a previous segment */
  isRepetition: boolean;
  /** The transcribed text within this segment */
  transcribedText: string;
}

/**
 * Input segment for preselection (minimal interface)
 */
export interface InputSegment {
  /** Start time in milliseconds */
  startMs: number;
  /** End time in milliseconds */
  endMs: number;
}

/**
 * Entry in the cut-map that maps original timestamps to final video timestamps
 * Used for re-mapping captions from cut video back to original video
 */
export interface CutMapEntry {
  /** Index of the segment in the cut video */
  segmentIndex: number;
  /** Start time in original video (ms) */
  originalStartMs: number;
  /** End time in original video (ms) */
  originalEndMs: number;
  /** Start time in cut/final video (ms) */
  finalStartMs: number;
  /** End time in cut/final video (ms) */
  finalEndMs: number;
}

/** AI Provider for preselection */
export type AIProvider = "anthropic" | "openai" | "openai-compatible";

/** AI Model options per provider */
export interface AIModelOption {
  provider: AIProvider;
  modelId: string;
  displayName: string;
  requiresApiKey?: boolean;
}

/** Available AI models for preselection */
export const AI_PRESELECTION_MODELS: AIModelOption[] = [
  { provider: "anthropic", modelId: "claude-sonnet-4-20250514", displayName: "Claude Sonnet 4", requiresApiKey: true },
  { provider: "anthropic", modelId: "claude-3-haiku-20240307", displayName: "Claude 3 Haiku (Rapido)", requiresApiKey: true },
  { provider: "openai", modelId: "gpt-4o", displayName: "GPT-4o", requiresApiKey: true },
  { provider: "openai", modelId: "gpt-4o-mini", displayName: "GPT-4o Mini (Rapido)", requiresApiKey: true },
  { provider: "openai-compatible", modelId: "qwen/qwen2.5-vl-7b", displayName: "Qwen 2.5 VL 7B", requiresApiKey: false },
];

/** Configuration for AI-powered preselection */
export interface AIPreselectionConfig {
  enabled: boolean;
  provider: AIProvider;
  modelId: string;
  apiKey?: string; // Opcional - usa env vars si no se provee
  baseUrl?: string; // Para servidores compatibles con OpenAI (LM Studio, Ollama, etc.)
}

/** Default AI preselection config */
export const DEFAULT_AI_PRESELECTION_CONFIG: AIPreselectionConfig = {
  enabled: false,
  provider: "anthropic",
  modelId: "claude-sonnet-4-20250514",
};

// =============================================================================
// LOGGING TYPES
// =============================================================================

/**
 * Detailed log for a single segment during preselection
 */
export interface SegmentPreselectionLog {
  segmentId: string;
  timing: {
    startMs: number;
    endMs: number;
    durationMs: number;
  };

  scores: {
    total: number;
    breakdown: SegmentScoreBreakdown;
    weighted: {
      scriptMatch: number;
      whisperConfidence: number;
      takeOrder: number;
      completeness: number;
      duration: number;
    };
  };

  scriptMatch?: {
    matchedSentenceIndices: number[];
    coverageScore: number;
    isRepetition: boolean;
    transcribedText: string;
    sentenceDetails?: Array<{
      sentenceIndex: number;
      sentenceText: string;
      coverage: number;
    }>;
  };

  takeInfo: {
    takeNumber: number;
    detectionMethod: "script" | "similarity" | "none";
    groupId?: string;
    relatedSegmentIds?: string[];
  };

  completeness: {
    score: number;
    isCompleteSentence: boolean;
    boundaries: {
      startScore: number;
      endScore: number;
      startAlignedWithCaption: boolean;
      endHasPunctuation: boolean;
    };
  };

  durationAnalysis: {
    score: number;
    status: "too_short" | "ideal" | "too_long";
    idealRange: {
      minMs: number;
      maxMs: number;
    };
  };

  decision: {
    enabled: boolean;
    reason: string;
    isAmbiguous: boolean;
    criterionReasons: {
      scriptMatch?: string;
      whisperConfidence?: string;
      takeOrder?: string;
      completeness?: string;
      duration?: string;
    };
  };
}

/**
 * AI trace when using AI-powered preselection
 */
export interface AIPreselectionTrace {
  provider: AIProvider;
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  rawResponse: unknown;
  parsedSelections: Array<{
    segmentIndex: number;
    enabled: boolean;
    score: number;
    reason: string;
  }>;
  meta: {
    promptTokens?: number;
    completionTokens?: number;
    latencyMs: number;
  };
}

/**
 * Complete preselection log for a video
 */
export interface PreselectionLog {
  videoId: string;
  createdAt: string;
  processingTimeMs: number;
  config: {
    mode: "traditional" | "ai";
    weights: PreselectionConfig["weights"];
    minScore: number;
  };
  context: {
    totalSegments: number;
    hasScript: boolean;
    scriptSentenceCount?: number;
    captionsCount: number;
  };
  segmentLogs: SegmentPreselectionLog[];
  aiTrace?: AIPreselectionTrace;
  stats: PreselectionStats;
  timeline: Array<{
    timestampMs: number;
    segmentId: string;
    event: "selected" | "rejected" | "ambiguous";
    score: number;
  }>;
}

// =============================================================================
// TAKE-BASED SCORING TYPES
// =============================================================================

/**
 * Score breakdown for a single take (used in take-based preselection)
 */
export interface TakeScoreBreakdown {
  scriptCoverage: number;
  fluency: number;
  whisperConfidence: number;
  completeness: number;
  duration: number;
}

/**
 * Score result for a single take
 */
export interface TakeScore {
  takeId: string;
  sentenceIdx: number;
  totalScore: number;
  breakdown: TakeScoreBreakdown;
  reason: string;
}

// =============================================================================
// AI PRESELECTION TYPES
// =============================================================================

/**
 * Warning types for AI preselection issues
 */
export type AIPreselectionWarningType =
  | "missing_script_line" // A script line has no coverage
  | "multiple_takes" // Multiple takes detected
  | "audio_quality" // Potential audio quality issues
  | "long_gap" // Long gap in coverage
  | "out_of_order"; // Content appears out of script order

/**
 * Warning from AI preselection analysis
 */
export interface AIPreselectionWarning {
  type: AIPreselectionWarningType;
  message: string;
  affectedScriptLines?: number[];
  affectedSegmentIds?: string[];
}

/**
 * Summary from AI preselection analysis
 */
export interface AIPreselectionSummary {
  totalSegments: number;
  selectedSegments: number;
  falseStartsDetected: number;
  repetitionsDetected: number;
  coveredScriptLines: number[];
  missingScriptLines: number[];
  estimatedFinalDurationMs: number;
}

/**
 * Complete result from AI-first preselection
 */
export interface AIPreselectionResult {
  segments: PreselectedSegment[];
  summary: AIPreselectionSummary;
  warnings: AIPreselectionWarning[];
  stats: PreselectionStats;
}
