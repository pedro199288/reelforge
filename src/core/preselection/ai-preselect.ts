/**
 * AI-Powered Preselection using Vercel AI SDK
 */
import { generateObject } from "ai";
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { Caption } from "../script/align";
import type {
  AIPreselectionConfig,
  PreselectedSegment,
  PreselectionResult,
  PreselectionStats,
  InputSegment,
  AIPreselectionTrace,
} from "./types";
import { logAITrace, type LogCollector } from "./logger";

// Schema para respuesta estructurada
const AIResponseSchema = z.object({
  selections: z.array(
    z.object({
      segmentIndex: z.number(),
      enabled: z.boolean(),
      score: z.number().min(0).max(100),
      reason: z.string(),
    })
  ),
  summary: z.object({
    repetitionsDetected: z.number(),
  }),
});

const SYSTEM_PROMPT = `Eres un editor de video IA que selecciona los mejores segmentos de una grabacion.

Tu tarea es analizar segmentos transcritos y determinar cuales deben HABILITARSE (incluir) o DESHABILITARSE (cortar).

Criterios de seleccion:
1. **Repeticiones**: Si el hablante dice lo mismo varias veces (tomas), selecciona SOLO la MEJOR toma. Deshabilita las otras.
2. **Calidad**: Prefiere segmentos con oraciones completas y claras.
3. **Relevancia**: Si hay guion, prioriza segmentos que cubran el contenido del guion.
4. **Flujo**: Los segmentos seleccionados deben crear una narrativa coherente.
5. **Duracion**: Segmentos muy cortos (<1s) o muy largos (>20s) necesitan justificacion.

Para cada segmento provee:
- enabled: true si debe incluirse, false si se corta
- score: 0-100 (100 = perfecto, 0 = definitivamente cortar)
- reason: Explicacion breve en espanol

Se agresivo cortando repeticiones y falsos comienzos. Una buena edicion elimina 30-70% del material.`;

function buildUserPrompt(
  segments: Array<{ id: string; startMs: number; endMs: number }>,
  captions: Caption[],
  script?: string
): string {
  const segmentTexts = segments.map((seg, index) => {
    const segCaptions = captions.filter(
      (c) => c.startMs >= seg.startMs && c.endMs <= seg.endMs
    );
    const text =
      segCaptions
        .map((c) => c.text)
        .join(" ")
        .trim() || "[sin audio]";
    const duration = ((seg.endMs - seg.startMs) / 1000).toFixed(1);
    return `[${index}] ${duration}s: "${text}"`;
  });

  let prompt = `Analiza estos ${segments.length} segmentos:\n\n${segmentTexts.join("\n")}`;

  if (script) {
    prompt += `\n\n--- GUION ---\n${script}\n---\n\nSelecciona segmentos que mejor cubran el guion.`;
  }

  return prompt;
}

function getModel(config: AIPreselectionConfig) {
  if (config.provider === "anthropic") {
    // Anthropic provider uses environment variable ANTHROPIC_API_KEY by default
    // If custom apiKey provided, use createAnthropic to configure it
    if (config.apiKey) {
      const customAnthropic = createAnthropic({ apiKey: config.apiKey });
      return customAnthropic(config.modelId);
    }
    return anthropic(config.modelId);
  } else if (config.provider === "openai-compatible") {
    // LM Studio, Ollama, or other OpenAI-compatible servers
    const openai = createOpenAI({
      baseURL: config.baseUrl || "http://localhost:1234/v1",
      apiKey: config.apiKey || "not-needed", // LM Studio doesn't require API key
    });
    return openai(config.modelId);
  } else {
    // Standard OpenAI
    const openai = createOpenAI({ apiKey: config.apiKey });
    return openai(config.modelId);
  }
}

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

  const segmentsWithIds = inputSegments.map((seg) => ({
    ...seg,
    id: nanoid(8),
  }));

  const model = getModel(aiConfig);
  const userPrompt = buildUserPrompt(segmentsWithIds, captions, script);

  const startTime = Date.now();

  const { object: result, usage } = await generateObject({
    model,
    schema: AIResponseSchema,
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
  });

  const latencyMs = Date.now() - startTime;

  // Log AI trace if collector is provided
  if (collector) {
    const trace: AIPreselectionTrace = {
      provider: aiConfig.provider,
      modelId: aiConfig.modelId,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      rawResponse: result,
      parsedSelections: result.selections.map((s) => ({
        segmentIndex: s.segmentIndex,
        enabled: s.enabled,
        score: s.score,
        reason: s.reason,
      })),
      meta: {
        promptTokens: usage?.inputTokens,
        completionTokens: usage?.outputTokens,
        latencyMs,
      },
    };
    logAITrace(collector, trace);
  }

  const segments: PreselectedSegment[] = segmentsWithIds.map((seg, index) => {
    const selection = result.selections.find((s: { segmentIndex: number }) => s.segmentIndex === index);
    return {
      id: seg.id,
      startMs: seg.startMs,
      endMs: seg.endMs,
      enabled: selection?.enabled ?? true,
      score: selection?.score ?? 50,
      reason: selection?.reason ?? "Sin analisis AI",
    };
  });

  const selected = segments.filter((s) => s.enabled);
  const stats: PreselectionStats = {
    totalSegments: segments.length,
    selectedSegments: selected.length,
    originalDurationMs: segments.reduce(
      (sum, s) => sum + (s.endMs - s.startMs),
      0
    ),
    selectedDurationMs: selected.reduce(
      (sum, s) => sum + (s.endMs - s.startMs),
      0
    ),
    scriptCoverage: 100,
    repetitionsRemoved: result.summary.repetitionsDetected,
    averageScore:
      selected.length > 0
        ? selected.reduce((sum, s) => sum + s.score, 0) / selected.length
        : 0,
    ambiguousSegments: 0,
  };

  return { segments, stats };
}
