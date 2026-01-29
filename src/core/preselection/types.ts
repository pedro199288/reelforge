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
    /** Priority: script coverage. Default: 0.45 */
    scriptMatch: number;
    /** First take preferred. Default: 0.25 */
    takeOrder: number;
    /** Complete sentences preferred. Default: 0.20 */
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
    scriptMatch: 0.45,
    takeOrder: 0.25,
    completeness: 0.20,
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
    takeOrder: 0.50,
    completeness: 0.30,
    duration: 0.20,
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
  /** Take order score (0-100) - first take gets highest */
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
  { provider: "openai-compatible", modelId: "local-model", displayName: "LM Studio / Ollama (Local)", requiresApiKey: false },
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
