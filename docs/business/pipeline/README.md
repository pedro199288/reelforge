# Pipeline de Edicion de Video

## Resumen

El pipeline de ReelForge automatiza la edicion de video raw eliminando silencios, generando captions y aplicando efectos automaticos. El flujo simplificado tiene **7 fases** (1 entrada + 6 ejecutables):

```
Raw (+ script opcional)
    |
    v
Silences
    |
    v
Segments (+ preseleccion)
    |
    v
Cut (+ genera cut-map.json)
    |
    v
Captions (video cortado)
    |
    v
Effects-Analysis (opcional, sobre video cortado)
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
- **Permite importar el script/guion** que se usara para preseleccion de segmentos

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

### Fase 2: Silences

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

### Fase 3: Segments

**Proposito:** Generar segmentos editables a partir de los silencios detectados, con preseleccion automatica.

**Que hace:**

1. **Inversion de silencios:** Convierte los rangos de silencio en segmentos de contenido
2. **Aplicacion de padding:** Anade margen al inicio/fin de cada segmento para evitar cortes abruptos
3. **Preseleccion automatica (si hay script disponible):**
   - **Deteccion de repeticiones:** Identifica cuando el presentador repite una frase (tomas)
   - **Scoring ponderado:** Evalua cada segmento con:
     - Script alignment (45%): Coincidencia con el guion
     - Take order (25%): Preferencia por tomas posteriores (mejor rendimiento)
     - Completeness (20%): Frases completas vs fragmentos
     - Duration (10%): Duracion adecuada del segmento
   - **Analisis con AI (opcional):** Claude, GPT-4, LM Studio u Ollama analizan calidad de contenido

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

### Fase 4: Cut

**Proposito:** Ejecutar el corte del video eliminando silencios y generar el cut-map.

**Que hace:**
- Extrae los segmentos seleccionados del video original
- Concatena los segmentos en orden
- Genera el video cortado sin silencios
- **Genera `cut-map.json`**: Mapea timestamps originales a timestamps finales
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
- Mapear efectos/zooms del video original al video cortado
- Mantener la referencia entre captions y posiciones originales
- Permitir edicion no-destructiva

---

### Fase 5: Captions

**Proposito:** Transcribir el audio del video cortado.

**Que hace:**
- Procesa el audio del video cortado mediante Whisper CPP
- Genera transcripcion con timestamps ajustados al video final
- Esta transcripcion se usa para los subtitulos finales y effects-analysis

**Input:**
- Video cortado

**Output:**
- Array de Caption con texto y timestamps del video cortado

**Archivos generados:**
```
public/subs/{videoId}-cut.json
```

**Estructura del archivo:**
```json
[
  {
    "text": "Hola, bienvenidos",
    "startMs": 0,
    "endMs": 1300,
    "confidence": 0.95
  }
]
```

---

### Fase 6: Effects-Analysis (Opcional)

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

**Nota importante:** Como esta fase ahora usa captions del video cortado, los timestamps de los efectos corresponden directamente al video final, sin necesidad de conversion.

---

### Fase 7: Rendered

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
  segments: [silences],
  cut: [segments],
  captions: [cut],
  effects-analysis: [captions],
  rendered: [effects-analysis],
}
```

| Fase | Depende de |
|------|------------|
| Raw | - |
| Silences | Raw |
| Segments | Silences |
| Cut | Segments |
| Captions | Cut |
| Effects-Analysis | Captions |
| Rendered | Effects-Analysis |

**Flujo lineal simplificado:** El nuevo pipeline es completamente lineal, lo que simplifica la ejecucion y reduce la complejidad.

---

## Flujo de Datos Visual

```
+---------------+
|      Raw      |
| (+ script)    |
+-------+-------+
        |
        v
+---------------+
|   Silences    |
+-------+-------+
        |
        v
+---------------+
|   Segments    |
| (preseleccion)|
+-------+-------+
        |
        v
+---------------+
|     Cut       |
| (cut-map)     |
+-------+-------+
        |
        v
+---------------+
|   Captions    |
+-------+-------+
        |
        v
+------------------+
| Effects-Analysis |
|   (opcional)     |
+--------+---------+
         |
         v
+---------------+
|   Rendered    |
+---------------+
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
|       +-- segments.json          # Segmentos generados
|       +-- cut.json               # Resultado del corte + cut-map
|       +-- captions.json          # Metadatos de captions
|       +-- effects-analysis.json  # Efectos detectados
|       +-- rendered.json          # Metadatos del render
+-- subs/
|   +-- {videoId}-cut.json         # Captions del video cortado
+-- videos.manifest.json           # Registro de videos
```

---

## Fases Requeridas vs Opcionales

| Fase | Requerida | Proposito |
|------|-----------|-----------|
| Raw | Si | Punto de entrada + script |
| Silences | Si | Detectar pausas |
| Segments | Si | Definir segmentos de contenido |
| Cut | Si | Generar video cortado |
| Captions | Si | Subtitulos finales |
| Effects-Analysis | No | Auto-detectar efectos |
| Rendered | No | Video final con efectos |

**Flujo minimo:** Raw -> Silences -> Segments -> Cut -> Captions

**Flujo completo:** Todas las fases para maxima automatizacion y calidad.

---

## Cambios respecto al Pipeline Anterior

### Fases Eliminadas

| Fase Anterior | Razon de Eliminacion |
|---------------|---------------------|
| Captions-Raw | Ineficiente transcribir todo para luego descartar partes |
| Semantic | Ya integrado opcionalmente en Segments |
| Script | El script ahora se importa en la fase Raw |
| Take-Selection | La preseleccion en Segments ya elige segmentos |

### Beneficios del Nuevo Flujo

1. **Eficiencia:** Transcripcion solo del video cortado (menos tiempo de proceso)
2. **Simplicidad:** Flujo lineal sin bifurcaciones
3. **Coherencia:** Los timestamps de effects-analysis corresponden al video final
4. **Cut-map:** Permite mapear efectos del video original si es necesario

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
- Nuevos procesamientos usan el flujo simplificado
- No se requiere migracion forzada
