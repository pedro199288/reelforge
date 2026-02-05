/**
 * Zod schemas for AI-First Preselection responses
 *
 * These schemas define the structured output format expected from the AI
 * when analyzing segments against the script.
 */
import { z } from "zod";

/**
 * Content type classification for a segment
 */
export const ContentTypeSchema = z.enum([
  "best_take", // Best take of a script line
  "alternative_take", // Alternative/backup take
  "false_start", // Aborted attempt / false start
  "off_script", // Content not in script (improvisation)
  "transition", // Natural transition between content
]);

export type ContentType = z.infer<typeof ContentTypeSchema>;

/**
 * Proposed split within a segment
 * Used when a segment contains both good and bad content
 */
export const ProposedSplitSchema = z.object({
  /** Timestamp in ms where to split (relative to segment start) */
  splitAtMs: z.number().min(0),
  /** Reason for the split */
  reason: z.string(),
  /** Whether to enable the first part (before split) */
  enableFirst: z.boolean(),
  /** Whether to enable the second part (after split) */
  enableSecond: z.boolean(),
});

export type ProposedSplit = z.infer<typeof ProposedSplitSchema>;

/**
 * AI decision for a single segment
 */
export const SegmentDecisionSchema = z.object({
  /** Segment ID (matches input segment) */
  segmentId: z.string(),
  /** Whether to include this segment in final cut */
  enabled: z.boolean(),
  /** Quality score 0-100 */
  score: z.number().min(0).max(100),
  /** Human-readable explanation in Spanish */
  reason: z.string(),
  /** Script lines covered by this segment (1-indexed) */
  coversScriptLines: z.array(z.number().min(1)),
  /** Classification of content type */
  contentType: ContentTypeSchema,
  /** If this is an alternative_take, reference the best_take segment ID */
  bestTakeSegmentId: z.string().optional(),
  /** Proposed splits if segment contains mixed content */
  proposedSplits: z.array(ProposedSplitSchema).optional(),
});

export type SegmentDecision = z.infer<typeof SegmentDecisionSchema>;

/**
 * Warning types for issues detected during analysis
 */
export const WarningTypeSchema = z.enum([
  "missing_script_line", // A script line has no coverage
  "multiple_takes", // Multiple takes detected, user should verify selection
  "audio_quality", // Potential audio quality issues detected
  "long_gap", // Long gap in coverage
  "out_of_order", // Content appears out of script order
]);

export type WarningType = z.infer<typeof WarningTypeSchema>;

/**
 * Warning about potential issues
 */
export const AIPreselectionWarningSchema = z.object({
  type: WarningTypeSchema,
  message: z.string(),
  affectedScriptLines: z.array(z.number()).optional(),
  affectedSegmentIds: z.array(z.string()).optional(),
});

export type AIPreselectionWarning = z.infer<typeof AIPreselectionWarningSchema>;

/**
 * Summary statistics from AI analysis
 */
export const AIPreselectionSummarySchema = z.object({
  /** Total segments analyzed */
  totalSegments: z.number().min(0),
  /** Segments selected for final cut */
  selectedSegments: z.number().min(0),
  /** False starts detected and removed */
  falseStartsDetected: z.number().min(0),
  /** Repetitions/takes detected */
  repetitionsDetected: z.number().min(0),
  /** Script lines covered by selected segments (1-indexed) */
  coveredScriptLines: z.array(z.number()),
  /** Script lines NOT covered by any segment (1-indexed) */
  missingScriptLines: z.array(z.number()),
  /** Estimated duration of selected segments in ms */
  estimatedFinalDurationMs: z.number().min(0),
});

export type AIPreselectionSummary = z.infer<typeof AIPreselectionSummarySchema>;

/**
 * Complete AI Preselection response schema
 */
export const AIPreselectionResponseSchema = z.object({
  /** Decision for each segment */
  decisions: z.array(SegmentDecisionSchema),
  /** Summary statistics */
  summary: AIPreselectionSummarySchema,
  /** Warnings about potential issues */
  warnings: z.array(AIPreselectionWarningSchema),
});

export type AIPreselectionResponse = z.infer<
  typeof AIPreselectionResponseSchema
>;

/**
 * Schema for AI input - segment data sent to AI
 */
export const AISegmentInputSchema = z.object({
  id: z.string(),
  index: z.number(),
  startMs: z.number(),
  endMs: z.number(),
  durationSec: z.number(),
  transcription: z.string(),
});

export type AISegmentInput = z.infer<typeof AISegmentInputSchema>;

/**
 * Schema for script line input
 */
export const ScriptLineInputSchema = z.object({
  lineNumber: z.number().min(1),
  text: z.string(),
});

export type ScriptLineInput = z.infer<typeof ScriptLineInputSchema>;
