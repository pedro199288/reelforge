# Pipeline de Edicion de Video

## Resumen

El pipeline de ReelForge automatiza la edicion de video raw eliminando silencios, generando captions y aplicando efectos automaticos. El flujo tiene **8 fases** (1 entrada + 7 ejecutables), con una **bifurcacion paralela** que converge antes de generar los captions finales:

```
Raw (+ script opcional)
    |
    +---------------------------+
    |                           |
    v                           v
Silences                   Full-Captions
    |                      (Whisper sobre original)
    v                           |
Segments (+ preseleccion)       |
    |                           |
    v                           |
Cut (+ cut-map)                 |
    |                           |
    +---------------------------+
    |
    v
Captions (derivacion matematica + auto-reapply preselection)
    |
    v
Effects-Analysis (opcional)
    |
    v
Rendered
```

Cada fase genera archivos intermedios que alimentan las siguientes fases, permitiendo reanudar el proceso desde cualquier punto.

---

## Fases del Pipeline

### Fase 1: Raw

**Proposito:** Video original importado al sistema, junto con el script opcional.

**Que hace:**
- Valida el formato del archivo (mp4, webm, mov, etc.)
- Copia el video al directorio de trabajo
- Genera metadatos basicos (duracion, resolucion, codec)
- Registra el video en el manifest del proyecto
- **Permite importar el script/guion** que se usara como prompt de Whisper y para scoring de preseleccion

**Input:**
- Archivo de video en formato soportado
- Script/guion (opcional, texto)

**Output:**
- Video disponible en el sistema
- Entrada en el manifest con metadatos

**Archivos generados:**
```
public/videos/{filename}          # Video original
videos.manifest.json              # Registro de videos importados
```

---

### Fase 2: Full-Captions (paralela, sin dependencias)

**Proposito:** Transcribir el video **original completo** una unica vez con Whisper.

**Que hace:**
- Ejecuta `node sub.mjs --raw [--script X] {videoOriginal}` sobre el video original (no el cortado)
- `--raw` aplica `fixTimingOnly()` (cap de duracion + prevencion de overlap) pero NO filtra palabras
- Si hay script disponible, se pasa como `--prompt` a Whisper para mejorar el vocabulario reconocido
- Genera un array completo de `Caption[]` con timestamps del video original
- **Puede ejecutarse en paralelo** con Silences/Segments/Cut (no depende de ninguna otra fase)

**Input:**
- Video original
- Script (opcional, de la fase Raw)

**Output:**
- Array de Caption con texto y timestamps del video original completo

**Archivos generados:**
```
public/subs/{videoId}.json        # Full captions del video original
```

**Estructura del archivo:**
```json
[
  {
    "text": " estás",
    "startMs": 14420,
    "endMs": 14770,
    "timestampMs": 14420,
    "confidence": 0.965
  },
  {
    "text": " empezando",
    "startMs": 15840,
    "endMs": 16120,
    "timestampMs": 15840,
    "confidence": 0.992
  }
]
```

**Nota:** Este archivo es la **fuente de verdad** para toda derivacion posterior. No se modifica nunca — los captions del video cortado se derivan matematicamente a partir de el.

---

### Fase 3: Silences

**Proposito:** Detectar pausas y silencios en el audio del video.

**Que hace:**
- Utiliza FFmpeg `silencedetect` para analizar el track de audio
- Identifica rangos de tiempo donde el audio esta por debajo del umbral
- Genera un mapa temporal de silencios

**Input:**
- Video importado
- `thresholdDb`: Umbral de silencio en dB (default: -35)
- `minDurationSec`: Duracion minima para considerar silencio (default: 0.5s)

**Output:**
- Array de rangos de silencio con timestamps de inicio y fin

**Archivos generados:**
```
public/pipeline/{videoId}/silences.json
```

**Estructura del archivo:**
```json
{
  "silences": [
    { "startMs": 0, "endMs": 1500 },
    { "startMs": 45000, "endMs": 47200 }
  ],
  "config": {
    "thresholdDb": -35,
    "minDurationSec": 0.5
  }
}
```

---

### Fase 4: Segments

**Proposito:** Generar segmentos editables a partir de los silencios detectados, con preseleccion automatica inicial.

**Que hace:**

1. **Inversion de silencios:** Convierte los rangos de silencio en segmentos de contenido
2. **Aplicacion de padding:** Anade margen al inicio/fin de cada segmento (default 0.15s) para evitar cortes abruptos
3. **Preseleccion automatica (si hay script disponible):**
   - **Deteccion de repeticiones:** Identifica cuando el presentador repite una frase (tomas)
   - **Scoring ponderado:** Evalua cada segmento con:
     - Script alignment (30%): Coincidencia con el guion
     - Whisper confidence (25%): Confianza de la transcripcion (placeholder en esta fase, datos reales tras Captions)
     - Take order (20%): Preferencia por tomas posteriores (mejor rendimiento)
     - Completeness (15%): Frases completas vs fragmentos
     - Duration (10%): Duracion adecuada del segmento
   - **Analisis con AI (opcional):** Claude, GPT-4, LM Studio u Ollama analizan calidad de contenido

**Nota:** En esta fase los captions aun no estan disponibles, por lo que el scoring de `whisperConfidence` usa un valor placeholder. El scoring real con datos de Whisper se aplica automaticamente en la fase Captions (auto-reapply preselection).

**Input:**
- Silencios detectados
- Script (opcional, de la fase Raw)

**Output:**
- Segmentos con estado enabled/disabled
- Score de 0-100 para cada segmento
- Razon de la seleccion/descarte

**Archivos generados:**
```
public/pipeline/{videoId}/segments.json
```

**Estructura del archivo:**
```json
{
  "segments": [
    {
      "id": "seg-001",
      "startMs": 1500,
      "endMs": 8200,
      "enabled": true,
      "score": 85,
      "reason": "Best take for intro section"
    }
  ],
  "preselection": {
    "mode": "auto",
    "totalSegments": 45,
    "enabledSegments": 32
  }
}
```

---

### Fase 5: Cut

**Proposito:** Ejecutar el corte del video eliminando silencios y generar el cut-map.

**Que hace:**
- Extrae los segmentos seleccionados del video original
- Concatena los segmentos en orden
- Genera el video cortado sin silencios
- **Genera el cut-map**: Tabla de traduccion que mapea timestamps originales a timestamps del video cortado
- Preserva la calidad original (re-encoding minimo)

**Input:**
- Segmentos seleccionados (enabled: true)
- Video original

**Output:**
- Video cortado sin silencios
- Cut-map para mapear timestamps

**Archivos generados:**
```
public/videos/{videoId}-cut.mp4
public/pipeline/{videoId}/cut.json
```

**Estructura del cut-map:**
```json
{
  "outputPath": "public/videos/video-cut.mp4",
  "originalDuration": 120.5,
  "editedDuration": 85.2,
  "segmentsCount": 12,
  "cutMap": [
    {
      "segmentIndex": 0,
      "originalStartMs": 1500,
      "originalEndMs": 8200,
      "finalStartMs": 0,
      "finalEndMs": 6700
    },
    {
      "segmentIndex": 1,
      "originalStartMs": 12000,
      "originalEndMs": 25000,
      "finalStartMs": 6700,
      "finalEndMs": 19700
    }
  ],
  "createdAt": "2024-01-15T10:30:00Z"
}
```

El **cut-map** es crucial para:
- Derivar captions del video cortado a partir de los full captions originales
- Mapear efectos/zooms del video original al video cortado
- Mantener la referencia entre captions y posiciones originales
- Permitir edicion no-destructiva

---

### Fase 6: Captions (Post-Cuts)

**Proposito:** Derivar captions del video cortado a partir de los full captions originales, sin ejecutar Whisper de nuevo.

**Dependencias:** `full-captions` + `cut` (ambas deben estar completadas)

**Que hace:**

1. **Carga de datos:**
   - Lee full captions: `public/subs/{videoId}.json` (timestamps del video original)
   - Lee cut result: `pipeline/{videoId}/cut.json` (contiene el cutMap)

2. **Derivacion via forward remapping** (`deriveCutCaptions(fullCaptions, cutMap)`):
   - Para cada entrada del cutMap, filtra los full captions cuyo `startMs` caiga en el rango `[originalStartMs, originalEndMs)`
   - Calcula el offset: `caption.startMs - entry.originalStartMs`
   - Remapea: `newStartMs = entry.finalStartMs + offset`
   - Cap de `endMs` al limite del segmento: `Math.min(finalStartMs + endOffset, finalEndMs)`
   - Captions que caian en silencios (no incluidos en ningun segmento del cutMap) se descartan automaticamente

3. **Guardado:** Escribe `public/subs/{videoId}-cut.json` con timestamps del video cortado

4. **Auto-reapply preselection (side-effect no-fatal):**
   - Ahora que hay captions reales de Whisper, re-puntua los segmentos con datos reales
   - Usa `remapCaptionsToOriginal()` para mapear captions del cortado de vuelta al original
   - Re-calcula scores con datos reales (confidence, texto transcrito)
   - Actualiza `segments.json` con el nuevo scoring
   - Actualiza `preselection-logs.json`
   - Si este paso falla, los captions derivados ya estan guardados — no bloquea el pipeline

**Input:**
- Full captions del video original (`public/subs/{videoId}.json`)
- Cut result con cutMap (`public/pipeline/{videoId}/cut.json`)

**Output:**
- Array de Caption con texto y timestamps del video cortado
- Segmentos re-puntuados con datos reales de Whisper (side-effect)

**Archivos generados:**
```
public/subs/{videoId}-cut.json                    # Captions del video cortado
public/pipeline/{videoId}/segments.json           # Actualizado con scoring real (side-effect)
public/pipeline/{videoId}/preselection-logs.json  # Log de re-evaluacion (side-effect)
```

**Estructura del archivo de captions:**
```json
[
  {
    "text": " estás",
    "startMs": 0,
    "endMs": 350,
    "timestampMs": 0,
    "confidence": 0.998
  }
]
```

---

### Fase 7: Effects-Analysis (Opcional)

**Proposito:** Detectar automaticamente donde aplicar efectos visuales.

**Que hace:**
- Analiza los captions **del video cortado** con IA para identificar momentos clave
- Sugiere zooms automaticos en puntos de enfasis
- Detecta highlights para resaltar palabras importantes
- Genera marcadores de efectos con timestamps (ya corresponden al video cortado)

**Input:**
- Captions del video cortado

**Output:**
- Lista de efectos sugeridos con timestamps y configuracion

**Archivos generados:**
```
public/pipeline/{videoId}/effects-analysis.json
```

**Nota importante:** Como esta fase usa captions del video cortado, los timestamps de los efectos corresponden directamente al video final, sin necesidad de conversion.

---

### Fase 8: Rendered

**Proposito:** Generar el video final con subtitulos y efectos.

**Que hace:**
- Renderiza subtitulos sobre el video
- Aplica efectos detectados (zooms, highlights)
- Genera el video final listo para publicar

**Input:**
- Video cortado
- Captions para subtitulos
- Efectos (opcional)

**Output:**
- Video final renderizado con subtitulos

**Archivos generados:**
```
public/videos/{videoId}-rendered.mp4
```

---

## Dependencias entre Fases

```
STEP_DEPENDENCIES = {
  silences: [],
  "full-captions": [],
  segments: [silences],
  cut: [segments],
  captions: ["full-captions", cut],
  "effects-analysis": [captions],
  rendered: ["effects-analysis"],
  "preselection-logs": [segments],
}
```

| Fase | Depende de |
|------|------------|
| Raw | - |
| Full-Captions | Raw |
| Silences | Raw |
| Segments | Silences |
| Cut | Segments |
| Captions | **Full-Captions + Cut** |
| Effects-Analysis | Captions |
| Rendered | Effects-Analysis |

**Flujo bifurcado:** El pipeline tiene dos ramas paralelas que convergen en la fase Captions:
- **Rama izquierda:** Silences → Segments → Cut (edicion de video)
- **Rama derecha:** Full-Captions (transcripcion Whisper del original)

Ambas ramas se ejecutan independientemente y convergen cuando Captions necesita los resultados de ambas.

---

## Flujo de Datos Visual

```
+------------------+
|       Raw        |
|   (+ script)     |
+--------+---------+
         |
    +----+----+
    |         |
    v         v
+--------+  +----------------+
|Silences|  | Full-Captions  |
+---+----+  | (Whisper orig) |
    |       +-------+--------+
    v               |
+----------+        |
| Segments |        |
|(preselec) |       |
+----+-----+        |
     |               |
     v               |
+---------+          |
|   Cut   |          |
|(cut-map)|          |
+----+----+          |
     |               |
     +-------+-------+
             |
             v
    +----------------+
    |    Captions    |
    | (derivacion +  |
    |  auto-reapply) |
    +-------+--------+
            |
            v
  +------------------+
  | Effects-Analysis |
  |   (opcional)     |
  +--------+---------+
           |
           v
  +------------------+
  |    Rendered      |
  +------------------+
```

---

## Flujo de Subtitulos

```
Video ORIGINAL (ej. 120s, con silencios)
    |
    +--[Full-Captions]--> public/subs/{id}.json
    |                     5000 palabras, timestamps 0-120000ms
    |                     (todas las palabras, incluyendo las de silencios)
    |                     <-- Este archivo NO se modifica nunca
    |                     <-- Fuente de verdad para toda derivacion
    |
    +--[Silences -> Segments -> Cut]--> video-cut.mp4 + cutMap
    |                                   cutMap: [{orig: 1500-8200, final: 0-6700}, ...]
    |
    +--[Captions]--> deriveCutCaptions(fullCaptions, cutMap)
                     |
                     +--> public/subs/{id}-cut.json
                     |    3500 palabras, timestamps 0-85000ms (video cortado)
                     |    Palabras en silencios eliminadas automaticamente
                     |
                     +--> Auto-reapply preselection (side-effect)
                     |    remapCaptionsToOriginal(cutCaptions, cutMap)
                     |    -> re-scoring de segmentos con datos reales de Whisper
                     |
                     +--> [Effects-Analysis] -> Claude analiza {id}-cut.json
                          -> enrichedCaptions con efectos
```

---

## Configuracion por Tipo de Contenido

Diferentes tipos de contenido requieren diferentes configuraciones de deteccion de silencios:

| Tipo | thresholdDb | minDuration | Notas |
|------|-------------|-------------|-------|
| Podcast/Entrevista | -40 dB | 0.8s | Mas sensible, pausas naturales mas largas |
| Tutorial/Educativo | -35 dB | 0.5s | Balance estandar |
| Presentacion | -30 dB | 1.0s | Menos sensible, pausas dramaticas permitidas |
| Vlog/Dinamico | -35 dB | 0.3s | Cortes mas agresivos |

---

## Ubicacion de Archivos

```
public/
+-- videos/
|   +-- {videoId}.mp4              # Video original (raw)
|   +-- {videoId}-cut.mp4          # Video cortado
|   +-- {videoId}-rendered.mp4     # Video final con subtitulos
+-- pipeline/
|   +-- {videoId}/
|       +-- status.json            # Estado del pipeline
|       +-- silences.json          # Deteccion de silencios
|       +-- segments.json          # Segmentos generados (+ scoring actualizado tras Captions)
|       +-- cut.json               # Resultado del corte + cut-map
|       +-- captions.json          # Metadatos de captions
|       +-- effects-analysis.json  # Efectos detectados
|       +-- preselection-logs.json # Logs de preseleccion (inicial + reapply)
|       +-- rendered.json          # Metadatos del render
+-- subs/
|   +-- {videoId}.json             # Full captions del video original (Whisper)
|   +-- {videoId}-cut.json         # Captions derivados del video cortado
+-- videos.manifest.json           # Registro de videos
```

---

## Fases Requeridas vs Opcionales

| Fase | Requerida | Proposito |
|------|-----------|-----------|
| Raw | Si | Punto de entrada + script |
| Full-Captions | Si | Transcripcion unica del video original |
| Silences | Si | Detectar pausas |
| Segments | Si | Definir segmentos de contenido |
| Cut | Si | Generar video cortado |
| Captions | Si | Derivar subtitulos del video cortado |
| Effects-Analysis | No | Auto-detectar efectos |
| Rendered | No | Video final con efectos |

**Flujo minimo:** Raw -> (Full-Captions + Silences -> Segments -> Cut) -> Captions

**Flujo completo:** Todas las fases para maxima automatizacion y calidad.

---

## Cambios respecto al Pipeline Anterior

### Fases Eliminadas o Reemplazadas

| Fase Anterior | Estado Actual |
|---------------|--------------|
| Captions-Raw | Reemplazada por **Full-Captions** — ahora transcribe el original completo una vez y los captions del cortado se derivan matematicamente |
| Semantic | Ya integrado opcionalmente en Segments |
| Script | El script ahora se importa en la fase Raw |
| Take-Selection | La preseleccion en Segments ya elige segmentos |

### Beneficios del Flujo Actual

1. **Eficiencia:** Whisper corre una sola vez sobre el video original; los captions del cortado se derivan matematicamente sin segundo run de Whisper
2. **Paralelismo:** Full-Captions se ejecuta en paralelo con la rama Silences → Segments → Cut, reduciendo el tiempo total del pipeline
3. **Coherencia:** Los timestamps de effects-analysis corresponden al video final directamente
4. **Cut-map bidireccional:** Permite mapear captions original → cortado (forward) y cortado → original (reverse) para re-scoring
5. **Scoring real:** Auto-reapply preselection usa datos reales de Whisper (confidence, texto) en vez de placeholders

---

## Recuperacion y Reanudacion

El pipeline esta disenado para ser resiliente:

- **Archivos intermedios:** Cada fase genera archivos que permiten reanudar desde ese punto
- **Idempotencia:** Re-ejecutar una fase con los mismos inputs genera los mismos outputs
- **Edicion manual:** Los archivos JSON pueden editarse manualmente para ajustes finos
- **Dependencias:** El sistema verifica automaticamente que las dependencias esten completas antes de ejecutar una fase

---

## Compatibilidad con Videos Existentes

Los videos procesados con el pipeline anterior seguiran funcionando:

- Los archivos existentes (`semantic.json`, `captions-raw.json`, etc.) se preservan pero se ignoran
- Videos en proceso pueden continuar con el flujo antiguo
- Nuevos procesamientos usan el flujo actual
- No se requiere migracion forzada
