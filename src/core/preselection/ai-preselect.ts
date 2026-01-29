/**
 * AI-First Preselection using Vercel AI SDK
 *
 * Analyzes transcribed captions against the original script to:
 * - Detect which script lines each segment covers
 * - Identify the best take when multiple attempts exist
 * - Detect false starts and aborted attempts
 * - Evaluate off-script content for value
 */
import { generateObject } from "ai";
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { nanoid } from "nanoid";
import type { Caption } from "../script/align";
import type {
  AIPreselectionConfig,
  PreselectedSegment,
  PreselectionResult,
  PreselectionStats,
  InputSegment,
  AIPreselectionTrace,
  AIPreselectionResult,
  AIPreselectionSummary,
  AIPreselectionWarning,
  ContentType,
} from "./types";
import { logAITrace, type LogCollector } from "./logger";
import {
  AIPreselectionResponseSchema,
  type SegmentDecision,
} from "./ai-preselection-schema";
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildUserPromptNoScript,
  formatSegmentsForAI,
  parseScriptLines,
} from "./ai-preselection-prompt";

// Re-export for backwards compatibility
export { AIPreselectionResponseSchema } from "./ai-preselection-schema";

/**
 * Get the AI model based on configuration
 */
function getModel(config: AIPreselectionConfig) {
  if (config.provider === "anthropic") {
    if (config.apiKey) {
      const customAnthropic = createAnthropic({ apiKey: config.apiKey });
      return customAnthropic(config.modelId);
    }
    return anthropic(config.modelId);
  } else if (config.provider === "openai-compatible") {
    const openai = createOpenAI({
      baseURL: config.baseUrl || "http://localhost:1234/v1",
      apiKey: config.apiKey || "not-needed",
    });
    return openai(config.modelId);
  } else {
    const openai = createOpenAI({ apiKey: config.apiKey });
    return openai(config.modelId);
  }
}

/**
 * Convert AI decision to PreselectedSegment
 */
function decisionToSegment(
  decision: SegmentDecision,
  originalSegment: { id: string; startMs: number; endMs: number }
): PreselectedSegment {
  return {
    id: decision.segmentId,
    startMs: originalSegment.startMs,
    endMs: originalSegment.endMs,
    enabled: decision.enabled,
    score: decision.score,
    reason: decision.reason,
    contentType: decision.contentType as ContentType,
    coversScriptLines: decision.coversScriptLines,
    bestTakeSegmentId: decision.bestTakeSegmentId,
    proposedSplits: decision.proposedSplits,
  };
}

/**
 * Calculate statistics from AI preselection result
 */
function calculateStats(
  segments: PreselectedSegment[],
  summary: AIPreselectionSummary
): PreselectionStats {
  const selected = segments.filter((s) => s.enabled);
  const originalDurationMs = segments.reduce(
    (sum, s) => sum + (s.endMs - s.startMs),
    0
  );
  const selectedDurationMs = selected.reduce(
    (sum, s) => sum + (s.endMs - s.startMs),
    0
  );

  const totalLines = new Set([
    ...summary.coveredScriptLines,
    ...summary.missingScriptLines,
  ]).size;
  const scriptCoverage =
    totalLines > 0
      ? (summary.coveredScriptLines.length / totalLines) * 100
      : 100;

  return {
    totalSegments: segments.length,
    selectedSegments: selected.length,
    originalDurationMs,
    selectedDurationMs,
    scriptCoverage,
    repetitionsRemoved: summary.repetitionsDetected,
    averageScore:
      selected.length > 0
        ? selected.reduce((sum, s) => sum + s.score, 0) / selected.length
        : 0,
    ambiguousSegments: segments.filter((s) => s.score >= 40 && s.score <= 60)
      .length,
    falseStartsDetected: summary.falseStartsDetected,
    coveredScriptLines: summary.coveredScriptLines,
    missingScriptLines: summary.missingScriptLines,
  };
}

/**
 * AI-First preselection - main function
 *
 * Analyzes segments against script using AI to make intelligent
 * selection decisions based on content quality and coverage.
 */
export async function aiPreselectSegments(
  inputSegments: InputSegment[],
  options: {
    captions: Caption[];
    script?: string;
    videoDurationMs: number;
    aiConfig: AIPreselectionConfig;
    collector?: LogCollector;
  }
): Promise<PreselectionResult> {
  const { captions, script, aiConfig, collector } = options;

  // Assign IDs to segments
  const segmentsWithIds = inputSegments.map((seg) => ({
    ...seg,
    id: nanoid(8),
  }));

  // Format segments for AI
  const aiSegments = formatSegmentsForAI(segmentsWithIds, captions);

  // Parse script if provided
  const scriptLines = script ? parseScriptLines(script) : [];

  // Build prompts
  const systemPrompt = buildSystemPrompt();
  const userPrompt =
    scriptLines.length > 0
      ? buildUserPrompt(aiSegments, scriptLines)
      : buildUserPromptNoScript(aiSegments);

  const model = getModel(aiConfig);
  const startTime = Date.now();

  try {
    const { object: result, usage } = await generateObject({
      model,
      schema: AIPreselectionResponseSchema,
      system: systemPrompt,
      prompt: userPrompt,
    });

    const latencyMs = Date.now() - startTime;

    // Log AI trace if collector is provided
    if (collector) {
      const trace: AIPreselectionTrace = {
        provider: aiConfig.provider,
        modelId: aiConfig.modelId,
        systemPrompt,
        userPrompt,
        rawResponse: result,
        parsedSelections: result.decisions.map((d) => ({
          segmentIndex: aiSegments.findIndex((s) => s.id === d.segmentId),
          enabled: d.enabled,
          score: d.score,
          reason: d.reason,
        })),
        meta: {
          promptTokens: usage?.inputTokens,
          completionTokens: usage?.outputTokens,
          latencyMs,
        },
      };
      logAITrace(collector, trace);
    }

    // Convert decisions to segments
    const segments: PreselectedSegment[] = segmentsWithIds.map((seg) => {
      const decision = result.decisions.find((d) => d.segmentId === seg.id);
      if (decision) {
        return decisionToSegment(decision, seg);
      }
      // Fallback if AI didn't include this segment
      return {
        id: seg.id,
        startMs: seg.startMs,
        endMs: seg.endMs,
        enabled: true,
        score: 50,
        reason: "Sin análisis AI",
        contentType: "off_script" as ContentType,
        coversScriptLines: [],
      };
    });

    const stats = calculateStats(segments, result.summary);

    return { segments, stats };
  } catch (error) {
    console.error("[ai-preselect] Error calling AI:", error);
    throw error;
  }
}

/**
 * AI-First preselection with full result (including warnings)
 *
 * Same as aiPreselectSegments but returns the complete result
 * with warnings and detailed summary.
 */
export async function aiPreselectSegmentsFull(
  inputSegments: InputSegment[],
  options: {
    captions: Caption[];
    script?: string;
    videoDurationMs: number;
    aiConfig: AIPreselectionConfig;
    collector?: LogCollector;
  }
): Promise<AIPreselectionResult> {
  const { captions, script, aiConfig, collector } = options;

  // Assign IDs to segments
  const segmentsWithIds = inputSegments.map((seg) => ({
    ...seg,
    id: nanoid(8),
  }));

  // Format segments for AI
  const aiSegments = formatSegmentsForAI(segmentsWithIds, captions);

  // Parse script if provided
  const scriptLines = script ? parseScriptLines(script) : [];

  // Build prompts
  const systemPrompt = buildSystemPrompt();
  const userPrompt =
    scriptLines.length > 0
      ? buildUserPrompt(aiSegments, scriptLines)
      : buildUserPromptNoScript(aiSegments);

  const model = getModel(aiConfig);
  const startTime = Date.now();

  try {
    const { object: result, usage } = await generateObject({
      model,
      schema: AIPreselectionResponseSchema,
      system: systemPrompt,
      prompt: userPrompt,
    });

    const latencyMs = Date.now() - startTime;

    // Log AI trace if collector is provided
    if (collector) {
      const trace: AIPreselectionTrace = {
        provider: aiConfig.provider,
        modelId: aiConfig.modelId,
        systemPrompt,
        userPrompt,
        rawResponse: result,
        parsedSelections: result.decisions.map((d) => ({
          segmentIndex: aiSegments.findIndex((s) => s.id === d.segmentId),
          enabled: d.enabled,
          score: d.score,
          reason: d.reason,
        })),
        meta: {
          promptTokens: usage?.inputTokens,
          completionTokens: usage?.outputTokens,
          latencyMs,
        },
      };
      logAITrace(collector, trace);
    }

    // Convert decisions to segments
    const segments: PreselectedSegment[] = segmentsWithIds.map((seg) => {
      const decision = result.decisions.find((d) => d.segmentId === seg.id);
      if (decision) {
        return decisionToSegment(decision, seg);
      }
      return {
        id: seg.id,
        startMs: seg.startMs,
        endMs: seg.endMs,
        enabled: true,
        score: 50,
        reason: "Sin análisis AI",
        contentType: "off_script" as ContentType,
        coversScriptLines: [],
      };
    });

    const stats = calculateStats(segments, result.summary);

    // Convert warnings to our type
    const warnings: AIPreselectionWarning[] = result.warnings.map((w) => ({
      type: w.type,
      message: w.message,
      affectedScriptLines: w.affectedScriptLines,
      affectedSegmentIds: w.affectedSegmentIds,
    }));

    return {
      segments,
      summary: result.summary,
      warnings,
      stats,
    };
  } catch (error) {
    console.error("[ai-preselect] Error calling AI:", error);
    throw error;
  }
}

/**
 * Re-run AI preselection on existing segments
 *
 * Used when segments already have IDs and we want to
 * re-analyze with updated captions or script.
 */
export async function rerunAIPreselection(
  existingSegments: Array<{ id: string; startMs: number; endMs: number }>,
  options: {
    captions: Caption[];
    script?: string;
    videoDurationMs: number;
    aiConfig: AIPreselectionConfig;
    collector?: LogCollector;
  }
): Promise<AIPreselectionResult> {
  const { captions, script, aiConfig, collector } = options;

  // Format segments for AI (keeping existing IDs)
  const aiSegments = formatSegmentsForAI(existingSegments, captions);

  // Parse script if provided
  const scriptLines = script ? parseScriptLines(script) : [];

  // Build prompts
  const systemPrompt = buildSystemPrompt();
  const userPrompt =
    scriptLines.length > 0
      ? buildUserPrompt(aiSegments, scriptLines)
      : buildUserPromptNoScript(aiSegments);

  const model = getModel(aiConfig);
  const startTime = Date.now();

  try {
    const { object: result, usage } = await generateObject({
      model,
      schema: AIPreselectionResponseSchema,
      system: systemPrompt,
      prompt: userPrompt,
    });

    const latencyMs = Date.now() - startTime;

    // Log AI trace
    if (collector) {
      const trace: AIPreselectionTrace = {
        provider: aiConfig.provider,
        modelId: aiConfig.modelId,
        systemPrompt,
        userPrompt,
        rawResponse: result,
        parsedSelections: result.decisions.map((d) => ({
          segmentIndex: aiSegments.findIndex((s) => s.id === d.segmentId),
          enabled: d.enabled,
          score: d.score,
          reason: d.reason,
        })),
        meta: {
          promptTokens: usage?.inputTokens,
          completionTokens: usage?.outputTokens,
          latencyMs,
        },
      };
      logAITrace(collector, trace);
    }

    // Convert decisions to segments
    const segments: PreselectedSegment[] = existingSegments.map((seg) => {
      const decision = result.decisions.find((d) => d.segmentId === seg.id);
      if (decision) {
        return decisionToSegment(decision, seg);
      }
      return {
        id: seg.id,
        startMs: seg.startMs,
        endMs: seg.endMs,
        enabled: true,
        score: 50,
        reason: "Sin análisis AI",
        contentType: "off_script" as ContentType,
        coversScriptLines: [],
      };
    });

    const stats = calculateStats(segments, result.summary);

    const warnings: AIPreselectionWarning[] = result.warnings.map((w) => ({
      type: w.type,
      message: w.message,
      affectedScriptLines: w.affectedScriptLines,
      affectedSegmentIds: w.affectedSegmentIds,
    }));

    return {
      segments,
      summary: result.summary,
      warnings,
      stats,
    };
  } catch (error) {
    console.error("[ai-preselect] Error calling AI:", error);
    throw error;
  }
}
