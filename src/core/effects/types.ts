/**
 * Types for AI-powered effects analysis and rule-based effects application
 */

/**
 * Word-level semantic scores from AI analysis
 */
export interface WordSemanticScores {
  /** How relevant this word is to the main topic (0-1) */
  topicRelevance: number;
  /** How much emphasis this word should receive (0-1) */
  emphasisScore: number;
  /** Emotional intensity of this word (0-1) */
  emotionalIntensity: number;
  /** Whether this word is a key concept */
  isKeyword: boolean;
  /** Category of word for styling purposes */
  category: "action" | "concept" | "emotion" | "connector" | "filler";
}

/**
 * A caption word enriched with AI semantic analysis
 */
export interface EnrichedCaption {
  /** Original word text */
  text: string;
  /** Start time in milliseconds */
  startMs: number;
  /** End time in milliseconds */
  endMs: number;
  /** Whisper confidence score (0-1) */
  whisperConfidence: number;
  /** AI-generated semantic scores */
  semantic: WordSemanticScores;
  /** Index of the sentence this word belongs to */
  sentenceIndex?: number;
  /** Position within the sentence */
  sentencePosition?: "start" | "middle" | "end";
}

/**
 * Metadata about the analyzed content
 */
export interface AnalysisMetadata {
  /** Main topic/theme of the content */
  mainTopic: string;
  /** Keywords related to the main topic */
  topicKeywords: string[];
  /** Overall tone of the content */
  overallTone: "educational" | "entertaining" | "emotional" | "promotional" | "conversational";
  /** Detected language */
  language: string;
  /** Total word count */
  wordCount: number;
  /** Analysis timestamp */
  analyzedAt: string;
  /** Hash of input captions for cache validation */
  captionsHash: string;
}

/**
 * Result of AI analysis step (cached per video)
 */
export interface EffectsAnalysisResult {
  /** Metadata about the analysis */
  metadata: AnalysisMetadata;
  /** Enriched captions with semantic scores */
  enrichedCaptions: EnrichedCaption[];
  /** Analysis model used */
  model: string;
  /** Processing time in ms */
  processingTimeMs: number;
}

// --------------------
// Rule Engine Types
// --------------------

/**
 * Comparison operators for rule conditions
 */
export type ComparisonOperator =
  | "equals"
  | "notEquals"
  | "greaterThan"
  | "greaterThanOrEqual"
  | "lessThan"
  | "lessThanOrEqual";

/**
 * A single condition in a rule
 */
export interface RuleCondition {
  /** Field to check (supports dot notation for nested fields) */
  field: string;
  /** Comparison operator */
  operator: ComparisonOperator;
  /** Value to compare against */
  value: string | number | boolean;
}

/**
 * Effect types that can be applied
 */
export type EffectType = "zoom" | "highlight";

/**
 * Zoom effect styles
 */
export type ZoomStyle = "punch" | "slow";

/**
 * Effect configuration
 */
export interface EffectConfig {
  type: EffectType;
  /** For zoom effects */
  style?: ZoomStyle;
  /** Duration in ms (for zoom effects) */
  durationMs?: number;
}

/**
 * A rule for automatically applying effects
 */
export interface EffectRule {
  /** Unique rule identifier */
  id: string;
  /** Human-readable rule name */
  name: string;
  /** Whether the rule is active */
  enabled: boolean;
  /** Priority (higher = evaluated first) */
  priority: number;
  /** Conditions that must be met */
  conditions: RuleCondition[];
  /** How to combine conditions */
  conditionLogic: "AND" | "OR";
  /** Effect to apply when conditions are met */
  effect: EffectConfig;
}

/**
 * Preset configuration names
 */
export type PresetName = "balanced" | "minimal" | "aggressive" | "custom";

/**
 * A preset is a named collection of rules
 */
export interface EffectsPreset {
  name: PresetName;
  displayName: string;
  description: string;
  rules: EffectRule[];
}

/**
 * Configuration for the effects system
 */
export interface EffectsConfig {
  /** Currently selected preset */
  activePreset: PresetName;
  /** Custom rules (used when preset is "custom") */
  customRules: EffectRule[];
  /** Global threshold multiplier (0.5 = stricter, 2 = more lenient) */
  thresholdMultiplier: number;
  /** Maximum effects per minute (0 = unlimited) */
  maxEffectsPerMinute: number;
}

/**
 * An effect to be applied to the timeline
 */
export interface AppliedEffect {
  /** Effect type */
  type: EffectType;
  /** For zoom effects */
  style?: ZoomStyle;
  /** Start time in ms */
  startMs: number;
  /** End time in ms (for highlights) */
  endMs?: number;
  /** Duration in ms (for zooms) */
  durationMs?: number;
  /** The word/caption that triggered this effect */
  word: string;
  /** Which rule triggered this effect */
  ruleId: string;
  /** Confidence score (based on semantic scores) */
  confidence: number;
}

/**
 * Result of applying rules to enriched captions
 */
export interface EffectsApplicationResult {
  /** Effects to apply */
  effects: AppliedEffect[];
  /** Statistics about the application */
  stats: {
    totalCaptions: number;
    captionsWithEffects: number;
    zoomCount: number;
    highlightCount: number;
    rulesTriggered: Record<string, number>;
  };
}
