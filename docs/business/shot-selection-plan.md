# Plan: Mejora de selección de tomas en el Editor

## 1. Situación actual

### Qué hay hoy en `/editor`

El editor (`src/app/routes/editor.tsx`) tiene dos modos de corte:

- **Modo silence**: corta todos los silencios detectados por FFmpeg. Sin inteligencia.
- **Modo semantic**: usa el guión + captions (Whisper) para clasificar silencios como _inter-oración_ (cortar) o _intra-oración_ (pausa natural, conservar). Decide **dónde** cortar, pero no **qué toma elegir**.

Después del corte semántico, todos los segmentos quedan `enabled: true`. Si el presentador repitió una frase 3 veces, las 3 quedan en el vídeo. No hay selección automática.

### Qué hay en el pipeline (referencia, no se usa en editor)

En `src/core/preselection/` existe un sistema completo de scoring que:

- Detecta repeticiones (tomas de la misma frase)
- Puntúa cada segmento con 4 criterios (script match 45%, take order 25%, completeness 20%, duration 10%)
- Selecciona/descarta segmentos por umbral (score >= 50)
- Opcionalmente usa IA (Claude/GPT) para evaluar

**Este sistema no se invoca desde el editor.** Está desconectado.

### Piezas existentes relevantes

| Pieza                                   | Ubicación                                                    | Estado                                          |
| --------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| Corte semántico (dónde cortar)          | `src/core/semantic/segments.ts`                              | Funciona en editor                              |
| Alineamiento guión↔captions            | `src/core/semantic/sentence-boundaries.ts`                   | Funciona en editor                              |
| Needleman-Wunsch (alineamiento por DP)  | `src/core/script/align.ts:229-282`                           | Existe, solo se usa para zoom/highlight markers |
| Matching segmento↔guión                | `src/core/preselection/script-matcher.ts`                    | Solo pipeline, usa bag-of-words (débil)         |
| Scoring de segmentos                    | `src/core/preselection/scorer.ts`                            | Solo pipeline                                   |
| Detección de repeticiones por similitud | `src/core/takes/similarity.ts`                               | Solo pipeline                                   |
| Confidence de Whisper                   | `src/core/script/align.ts` (campo `confidence` en `Caption`) | Dato disponible, **nunca se usa en scoring**    |
| IA (Claude/GPT/LM Studio)               | `src/core/preselection/ai-preselect.ts`                      | Solo pipeline, opcional                         |

### Problemas identificados

1. **No hay detección de repeticiones en el editor.** Si dijiste "bienvenidos" 3 veces, las 3 quedan.

2. **No hay selección automática de la mejor toma.** Ni siquiera manualmente se muestran métricas de calidad por segmento.

3. **El matching guión↔captions del pipeline es bag-of-words** (`script-matcher.ts:40-66`): convierte palabras a un `Set` y cuenta coincidencias individuales. No respeta orden. "Fui al mercado ayer" matchea igual que "ayer mercado al fui". Genera falsos positivos.

4. **Take order invertido.** El scorer del pipeline prefiere la primera toma (100 puntos) sobre la última (30 puntos). En la práctica, la última repetición suele ser la mejor.

5. **Confidence de Whisper ignorada.** Es un proxy gratuito de claridad de audio: alta confianza = pronunciación clara, baja = muletillas, dudas o ruido. El dato existe pero no se usa.

6. **Sin métricas de audio.** No hay análisis de volumen (RMS/loudness) ni SNR por segmento.

---

## 2. Qué se quiere

Un sistema integrado en la ruta `/editor` que, después del corte semántico:

1. **Detecte repeticiones**: agrupe segmentos que cubren la misma oración del guión.
2. **Seleccione la mejor toma** de cada grupo, usando criterios de calidad:
   - Cobertura del guión (qué tan fielmente se dijo la frase)
   - Claridad del audio (confidence de Whisper como proxy principal)
   - Completitud de la frase (no cortada a mitad)
   - Preferencia por la última toma (el presentador mejora con repeticiones)
   - Duración adecuada
3. **Descarte automáticamente** las tomas inferiores (marcar como `enabled: false`).
4. **Permita ajuste manual**: el usuario puede revertir decisiones con doble-click (ya funciona).
5. **Muestre información de scoring** en la UI para que el usuario entienda las decisiones.

### Restricciones

- Ejecución local (puede usar FFmpeg, puede ser computacionalmente intensivo).
- Evitar IA como componente principal. Solo para casos ambiguos si es necesario.
- LM Studio disponible como opción, no como dependencia obligatoria.
- El guión se sigue bastante fielmente (poca improvisación).

---

## 3. Plan de implementación

### Fase 1: Matching mejorado guión↔segmentos

**Objetivo**: Reemplazar el bag-of-words de `calculateSentenceCoverage` por un matching que respete el orden de las palabras.

**Enfoque**: Reutilizar el algoritmo Needleman-Wunsch que ya existe en `align.ts:229-282` (`alignWords`). Actualmente solo se usa para alinear markers de zoom/highlight, pero es exactamente lo que se necesita para calcular cobertura de guión con respeto al orden.

**Qué hacer**:

- Extraer `alignWords` a una utilidad compartida (o importarlo directamente).
- Crear una nueva función `calculateOrderedCoverage(segmentText, sentenceText)` que:
  1. Normalice ambos textos.
  2. Use el alineamiento por DP para mapear palabras.
  3. Cuente solo las palabras alineadas con similarity > 0.6.
  4. Devuelva cobertura como ratio de palabras alineadas / total de palabras del guión.
- Reemplazar `calculateSentenceCoverage` en el flujo de preselección.

**Alternativa más simple**: LCS (Longest Common Subsequence) a nivel de palabras. Menos sofisticado que Needleman-Wunsch pero más rápido y captura lo esencial: "cuántas palabras en el mismo orden coinciden". Valorar si la velocidad importa dado que corre en local con vídeos típicos de pocos minutos.

**Archivos afectados**:

- `src/core/preselection/script-matcher.ts` (reemplazar `calculateSentenceCoverage`)
- `src/core/script/align.ts` (posible extracción de `alignWords`)

---

### Fase 2: Detección de repeticiones en el editor

**Objetivo**: Después del corte semántico, agrupar segmentos que cubren la misma oración del guión.

**Enfoque**: Usar el guión como ancla. Dado que se improvisa poco, cada segmento debería mapear a una o varias oraciones del guión. Los segmentos que mapean a la misma oración son tomas del mismo contenido.

**Qué hacer**:

- Después de `analyzeSemanticCuts` y `semanticToSegments`, ejecutar el matching mejorado (Fase 1) para asignar a cada segmento su(s) oración(es) del guión.
- Agrupar segmentos por oración del guión: todos los segmentos que cubren la oración N forman un "take group".
- Segmentos que no mapean a ninguna oración (contenido improvisado) quedan como grupo de una sola toma → siempre habilitados.

**Lógica de agrupación**:

```
Para cada oración del guión:
  - Encontrar todos los segmentos con cobertura >= umbral (ej: 40%)
  - Si hay más de uno → grupo de repeticiones
  - Si hay exactamente uno → toma única, se conserva
  - Si hay cero → oración no dicha (marcada como "missing" en deviations)
```

**Archivos afectados**:

- Nuevo módulo o extensión de `src/core/preselection/script-matcher.ts`
- `src/app/routes/editor.tsx` (invocar agrupación después del corte)

---

### Fase 3: Scoring y selección de la mejor toma

**Objetivo**: Para cada grupo de repeticiones, puntuar las tomas y elegir la mejor.

**Criterios de scoring y pesos propuestos**:

| Criterio              | Peso | Lógica                                                                                                                                      |
| --------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Cobertura del guión   | 30%  | Matching ordenado de Fase 1. 0-100.                                                                                                         |
| Confidence de Whisper | 25%  | Promedio de `caption.confidence` de los captions que caen dentro del segmento. 0-100 (confidence × 100).                                    |
| Recency               | 20%  | Última toma del grupo = 100, penúltima = 70, anteriores = 40. **Invertido respecto al pipeline actual.**                                    |
| Completitud           | 15%  | Empieza en boundary de caption + termina con puntuación = 100. Reutilizar lógica de `scorer.ts` con mejoras para detectar falsos comienzos. |
| Duración              | 10%  | Dentro de rango ideal = 100. Demasiado corto o largo penaliza. Reutilizar `analyzeDuration` de `scorer.ts`.                                 |

**Score total**: media ponderada, escala 0-100.

**Selección**:

- En cada grupo de repeticiones: la toma con mayor score queda `enabled: true`, las demás `enabled: false`.
- Grupos de una sola toma: siempre `enabled: true`.
- Umbral mínimo global: si la mejor toma tiene score < 30, marcar como ambigua (para revisión manual).

**Información almacenada por segmento** (para mostrar en UI):

```typescript
interface SegmentScore {
  total: number; // Score final 0-100
  breakdown: {
    scriptMatch: number; // 0-100
    whisperConfidence: number; // 0-100
    recency: number; // 0-100
    completeness: number; // 0-100
    duration: number; // 0-100
  };
  takeGroup: string; // ID del grupo de tomas
  takeNumber: number; // Posición en el grupo (1, 2, 3...)
  totalTakes: number; // Total de tomas en el grupo
  isSelected: boolean; // Es la mejor del grupo
  isAmbiguous: boolean; // Score entre 30-60
}
```

**Archivos afectados**:

- Adaptar `src/core/preselection/scorer.ts` (cambiar pesos, añadir whisper confidence, invertir recency)
- `src/store/timeline.ts` (extender `TimelineSegment` con datos de scoring)
- `src/app/routes/editor.tsx` (invocar scoring después de agrupación)

---

### Fase 4: Integración en el flujo del editor

**Objetivo**: Conectar las fases anteriores en el flujo de `handleDetectSilences` del editor.

**Flujo propuesto para modo semántico**:

```
1. FFmpeg detecta silencios                    [ya existe]
2. analyzeSemanticCuts → clasificar silencios   [ya existe]
3. semanticToSegments → generar segmentos       [ya existe]
   --- NUEVO A PARTIR DE AQUÍ ---
4. matchSegmentsToScript → asignar oraciones a cada segmento
5. groupByScriptSentence → agrupar repeticiones
6. scoreAndSelect → puntuar tomas, elegir la mejor de cada grupo
7. Importar segmentos con scores y enabled/disabled al timeline store
```

**Qué hacer**:

- Extender `handleDetectSilences` en `editor.tsx` (o extraer a un hook `useSmartCut`) para ejecutar los pasos 4-7 después del paso 3.
- Crear una función orquestadora `smartSelectSegments(segments, captions, script)` que encapsule los pasos 4-6 y devuelva segmentos con scoring.
- Usar `importPreselectedSegments` del timeline store (ya existe, línea 462-486) en vez de `importSemanticSegments`.

**Archivos afectados**:

- `src/app/routes/editor.tsx` (flujo principal)
- Posible nuevo hook `src/hooks/useSmartCut.ts`
- `src/store/timeline.ts` (verificar que `importPreselectedSegments` cubre las necesidades)

---

### Fase 5: UI — Visualización de scores y tomas

**Objetivo**: Que el usuario vea por qué cada segmento fue seleccionado o descartado.

**Qué mostrar**:

- En `SegmentMarker`: color por score (verde/amarillo/rojo), número de toma ("T2/3"), badge si es la seleccionada.
- En sidebar stats: resumen de repeticiones detectadas y eliminadas.
- Tooltip o panel al hacer click en un segmento: desglose de score (cobertura, confidence, recency, etc.).
- Indicador de segmentos ambiguos que necesitan revisión manual.

**Archivos afectados**:

- `src/components/Timeline/SegmentMarker.tsx` (ya muestra `preselectionScore`, extender)
- `src/app/routes/editor.tsx` (sección de estadísticas, líneas 797-835)
- Posible nuevo componente `SegmentScoreTooltip`

---

### Fase 6 (opcional): Audio features con FFmpeg

**Objetivo**: Añadir métricas de audio reales si la confidence de Whisper no es suficiente proxy.

**Solo implementar si**: tras probar con vídeos reales, la confidence de Whisper no discrimina bien entre tomas buenas y malas.

**Qué hacer**:

- Endpoint en `server/api.ts` que ejecute `ffmpeg -i video -af loudnorm=print_format=json` por rango de tiempo.
- Extraer RMS, loudness integrada (LUFS) y rango dinámico por segmento.
- Añadir como criterio adicional en el scoring (reemplazaría o complementaría Whisper confidence).

**Archivos afectados**:

- `server/api.ts` (nuevo endpoint)
- `src/core/preselection/scorer.ts` (nuevo criterio)

---

### Fase 7 (opcional): IA para desempate de ambiguos

**Objetivo**: Usar LM Studio solo para los segmentos con score entre 30-60 donde el algoritmo no tiene confianza.

**Solo implementar si**: hay un número significativo de segmentos ambiguos en vídeos típicos.

**Qué hacer**:

- Tras el scoring, recoger segmentos con `isAmbiguous: true`.
- Enviar solo esos segmentos a LM Studio con contexto: texto del guión, texto transcrito, scores parciales.
- El modelo decide: enable/disable + razón.
- Reutilizar infraestructura de `ai-preselect.ts` adaptada para pocos segmentos en vez de todos.

**Archivos afectados**:

- Adaptar `src/core/preselection/ai-preselect.ts`
- `src/app/routes/editor.tsx` (paso adicional tras scoring)

---

## 4. Orden de implementación recomendado

```
Fase 1 → Fase 2 → Fase 3 → Fase 4 → Fase 5
                                        ↓
                              Probar con vídeos reales
                                        ↓
                            ¿Whisper confidence suficiente?
                              Sí → Fin     No → Fase 6
                                        ↓
                            ¿Muchos ambiguos?
                              No → Fin    Sí → Fase 7
```

Las fases 1-5 son el core. Las fases 6 y 7 son optimizaciones que solo valen la pena si los resultados con vídeos reales lo justifican.

---

## 5. Decisiones de diseño clave

### ¿Por qué no usar embeddings semánticos para el matching?

Dado que se improvisa poco, el matching por alineamiento de palabras (Needleman-Wunsch / LCS) es suficiente y no requiere dependencias externas ni modelo de ML. Los embeddings semánticos serían superiores para detectar reformulaciones ("lo dije con otras palabras"), pero ese caso es raro aquí.

### ¿Por qué invertir recency en vez de mantener el pipeline?

El pipeline fue diseñado con la asunción de que la primera toma es la mejor (común en locución profesional con teleprompter). Para presentadores de contenido que repiten para mejorar, la última toma suele ser la definitiva. El peso configurable permite ajustar según el caso.

### ¿Por qué Whisper confidence como proxy de claridad?

La confianza de Whisper correlaciona directamente con la calidad del audio desde el punto de vista de la transcripción: pronunciación clara, bajo ruido, buen volumen → alta confianza. Es un dato que ya tenemos sin coste adicional. Solo si no discrimina bien entre tomas se justifica el análisis de audio con FFmpeg.

### ¿Por qué no todo con IA?

- Latencia: un LLM local tarda segundos por evaluación, multiplicado por N segmentos.
- Recursos: "el ordenador se pone a fuego".
- Determinismo: el algoritmo da resultados consistentes y reproducibles.
- La IA brilla en juicios cualitativos complejos, no en comparar strings y números.
