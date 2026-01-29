/**
 * Prompt builder for AI-First Preselection
 *
 * Constructs structured prompts that help the AI analyze
 * transcribed captions against the original script.
 */
import type { Caption } from "../script/align";
import type { AISegmentInput, ScriptLineInput } from "./ai-preselection-schema";

/**
 * Parse script into numbered lines
 */
export function parseScriptLines(script: string): ScriptLineInput[] {
  return script
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((text, index) => ({
      lineNumber: index + 1,
      text,
    }));
}

/**
 * Get transcription for a segment from captions
 */
export function getSegmentTranscription(
  segment: { startMs: number; endMs: number },
  captions: Caption[]
): string {
  const overlapping = captions.filter((c) => {
    // Caption overlaps if it starts before segment ends AND ends after segment starts
    return c.startMs < segment.endMs && c.endMs > segment.startMs;
  });

  return (
    overlapping
      .map((c) => c.text)
      .join(" ")
      .trim() || "[sin audio]"
  );
}

/**
 * Format segments for AI input
 */
export function formatSegmentsForAI(
  segments: Array<{ id: string; startMs: number; endMs: number }>,
  captions: Caption[]
): AISegmentInput[] {
  return segments.map((seg, index) => ({
    id: seg.id,
    index,
    startMs: seg.startMs,
    endMs: seg.endMs,
    durationSec: Number(((seg.endMs - seg.startMs) / 1000).toFixed(2)),
    transcription: getSegmentTranscription(seg, captions),
  }));
}

/**
 * Build the system prompt for AI preselection
 */
export function buildSystemPrompt(): string {
  return `Eres un editor de video profesional especializado en analizar grabaciones contra guiones.

Tu tarea es comparar la TRANSCRIPCIÓN REAL (captions) de un video con el GUIÓN ORIGINAL para:
1. Detectar qué líneas del guión están cubiertas por cada segmento
2. Identificar la MEJOR TOMA cuando hay múltiples intentos de la misma línea
3. Detectar TOMAS FALSAS (intentos abortados, "eh...", repeticiones de palabras)
4. Evaluar IMPROVISACIONES (contenido fuera del guión que puede aportar valor)

## Tipos de Contenido

Clasifica cada segmento como:
- **best_take**: La mejor versión de una línea del guión (clara, fluida, completa)
- **alternative_take**: Una versión aceptable pero inferior a otra toma
- **false_start**: Toma falsa - "Hoy vamos a-- Hoy vamos a hablar de..."
- **off_script**: Contenido fuera del guión (evalúa si aporta valor)
- **transition**: Transición natural entre contenido

## Criterios de Evaluación

### Para seleccionar la mejor toma:
1. **Fluidez**: Sin tartamudeos, pausas excesivas o correcciones
2. **Completitud**: Cubre toda la línea del guión
3. **Claridad**: Pronunciación clara
4. **Naturalidad**: Tono conversacional, no robótico

### Para detectar tomas falsas:
- Repetición de palabras iniciales: "Hoy... hoy vamos..."
- Frases incompletas seguidas de reinicio
- Muletillas de frustración: "eh", "ah", "espera"
- Duración muy corta (<2s) para una línea larga

### Para evaluar improvisaciones:
- Si añade contexto útil → habilitar con score alto
- Si es divagación sin valor → deshabilitar
- Si es un chiste/comentario relevante → habilitar

## Formato de Respuesta

Para cada segmento incluye:
- segmentId: El ID del segmento
- enabled: true para incluir, false para descartar
- score: 0-100 (calidad del contenido)
- reason: Explicación en español
- coversScriptLines: Array de números de línea [1, 2, 3...]
- contentType: El tipo de contenido
- bestTakeSegmentId: Si es alternative_take, cuál es la mejor toma
- proposedSplits: Si hay contenido mixto, dónde cortar

## Advertencias

Genera warnings para:
- Líneas del guión sin cobertura
- Múltiples tomas donde no está claro cuál es mejor
- Contenido fuera de orden
- Gaps largos en la cobertura

Sé AGRESIVO cortando tomas falsas y repeticiones. Un buen editor elimina 40-70% del material crudo.`;
}

/**
 * Build the user prompt with segments and script
 */
export function buildUserPrompt(
  segments: AISegmentInput[],
  scriptLines: ScriptLineInput[]
): string {
  // Format script lines
  const scriptSection = scriptLines
    .map((line) => `[L${line.lineNumber}] ${line.text}`)
    .join("\n");

  // Format segments
  const segmentsSection = segments
    .map(
      (seg) =>
        `[S${seg.index}] ID: ${seg.id} | ${seg.durationSec}s | ${formatTimestamp(seg.startMs)}-${formatTimestamp(seg.endMs)}\n    "${seg.transcription}"`
    )
    .join("\n\n");

  return `## GUIÓN ORIGINAL (${scriptLines.length} líneas)

${scriptSection}

---

## SEGMENTOS TRANSCRITOS (${segments.length} segmentos)

${segmentsSection}

---

Analiza cada segmento:
1. Identifica qué líneas del guión cubre (puede ser ninguna, una o varias)
2. Detecta si es una toma falsa, la mejor toma, o una alternativa
3. Si hay múltiples tomas de la misma línea, selecciona SOLO la mejor
4. Evalúa contenido fuera del guión por su valor añadido

Responde con el JSON estructurado según el schema.`;
}

/**
 * Build prompt for cases without script (pure AI analysis)
 */
export function buildUserPromptNoScript(segments: AISegmentInput[]): string {
  const segmentsSection = segments
    .map(
      (seg) =>
        `[S${seg.index}] ID: ${seg.id} | ${seg.durationSec}s | ${formatTimestamp(seg.startMs)}-${formatTimestamp(seg.endMs)}\n    "${seg.transcription}"`
    )
    .join("\n\n");

  return `## SEGMENTOS TRANSCRITOS (${segments.length} segmentos)

${segmentsSection}

---

Sin guión disponible. Analiza basándote en:
1. Detección de repeticiones (misma frase dicha varias veces)
2. Detección de tomas falsas (inicios abortados)
3. Calidad del contenido (frases completas, claridad)
4. Flujo narrativo natural

Para coversScriptLines, usa un array vacío ya que no hay guión.
Para contentType, clasifica basándote en la calidad del contenido.

Responde con el JSON estructurado según el schema.`;
}

/**
 * Format milliseconds as MM:SS.mmm
 */
function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}
