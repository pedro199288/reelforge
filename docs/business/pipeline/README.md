# Pipeline de Edición de Video

## Resumen

El pipeline de ReelForge automatiza la edición de video raw eliminando silencios, seleccionando las mejores tomas y generando el video final con subtítulos. El flujo completo tiene 11 fases:

```
Raw → Silences ──────────────────┬→ Segments → Cut → Captions → Script → Take-Selection → Rendered
         ↓                       │
    Captions-Raw → Semantic ─────┘
         ↓
    Effects-Analysis
```

Cada fase genera archivos intermedios que alimentan las siguientes fases, permitiendo reanudar el proceso desde cualquier punto.

---

## Fases del Pipeline

### Fase 1: Raw

**Propósito:** Video original importado al sistema.

**Qué hace:**
- Valida el formato del archivo (mp4, webm, mov, etc.)
- Copia el video al directorio de trabajo
- Genera metadatos básicos (duración, resolución, codec)
- Registra el video en el manifest del proyecto

**Input:**
- Archivo de video en formato soportado

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

**Propósito:** Detectar pausas y silencios en el audio del video.

**Qué hace:**
- Utiliza FFmpeg `silencedetect` para analizar el track de audio
- Identifica rangos de tiempo donde el audio está por debajo del umbral
- Genera un mapa temporal de silencios

**Input:**
- Video importado
- `thresholdDb`: Umbral de silencio en dB (default: -35)
- `minDurationSec`: Duración mínima para considerar silencio (default: 0.5s)

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

### Fase 3: Captions-Raw (Opcional)

**Propósito:** Transcribir el audio del video original (antes del corte).

**Qué hace:**
- Procesa el audio mediante Whisper CPP
- Genera transcripción palabra por palabra con timestamps
- Necesaria para el análisis semántico posterior

**Input:**
- Video original (raw)

**Output:**
- Array de Caption con texto y timestamps del video sin cortar

**Archivos generados:**
```
public/subs/{videoId}-raw.json
```

**Estructura del archivo:**
```json
{
  "captions": [
    {
      "text": "Hola, bienvenidos",
      "startMs": 1500,
      "endMs": 2800,
      "confidence": 0.95
    }
  ]
}
```

---

### Fase 4: Segments

**Propósito:** Generar segmentos editables a partir de los silencios detectados.

**Qué hace:**

1. **Inversión de silencios:** Convierte los rangos de silencio en segmentos de contenido
2. **Aplicación de padding:** Añade margen al inicio/fin de cada segmento para evitar cortes abruptos
3. **Preselección automática:**
   - **Detección de repeticiones:** Identifica cuando el presentador repite una frase (tomas)
   - **Scoring ponderado:** Evalúa cada segmento con:
     - Script alignment (45%): Coincidencia con el guión
     - Take order (25%): Preferencia por tomas posteriores (mejor rendimiento)
     - Completeness (20%): Frases completas vs fragmentos
     - Duration (10%): Duración adecuada del segmento
   - **Análisis con AI (opcional):** Claude, GPT-4, LM Studio u Ollama analizan calidad de contenido

**Input:**
- Silencios detectados

**Output:**
- Segmentos con estado enabled/disabled
- Score de 0-100 para cada segmento
- Razón de la selección/descarte

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
      "reason": "Best take for intro section",
      "transcript": "Hola, bienvenidos al tutorial..."
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

### Fase 5: Semantic (Opcional)

**Propósito:** Clasificar silencios por contexto semántico.

**Qué hace:**
- Analiza los captions del video raw junto con los silencios
- Clasifica cada silencio como:
  - **Inter-oración:** Pausa entre oraciones completas (se puede cortar)
  - **Intra-oración:** Pausa dentro de una oración (mejor preservar para naturalidad)
- Mejora la calidad del corte final al preservar pausas naturales

**Input:**
- Captions del video raw
- Silencios detectados

**Output:**
- Silencios clasificados con tipo semántico

**Archivos generados:**
```
public/pipeline/{videoId}/semantic.json
```

---

### Fase 6: Effects-Analysis (Opcional)

**Propósito:** Detectar automáticamente dónde aplicar efectos visuales.

**Qué hace:**
- Analiza los captions con IA para identificar momentos clave
- Sugiere zooms automáticos en puntos de énfasis
- Detecta highlights para resaltar palabras importantes
- Genera marcadores de efectos con timestamps

**Input:**
- Captions del video raw

**Output:**
- Lista de efectos sugeridos con timestamps y configuración

**Archivos generados:**
```
public/pipeline/{videoId}/effects-analysis.json
```

---

### Fase 7: Cut

**Propósito:** Ejecutar el corte del video eliminando silencios.

**Qué hace:**
- Extrae los segmentos seleccionados del video original
- Concatena los segmentos en orden
- Genera el video cortado sin silencios
- Preserva la calidad original (re-encoding mínimo)

**Input:**
- Segmentos seleccionados (enabled: true)
- Video original

**Output:**
- Video cortado sin silencios

**Archivos generados:**
```
public/videos/{videoId}-cut.mp4
```

---

### Fase 8: Captions

**Propósito:** Transcribir el audio del video cortado.

**Qué hace:**
- Procesa el audio del video cortado mediante Whisper CPP
- Genera transcripción con timestamps ajustados al video final
- Esta transcripción se usa para los subtítulos finales

**Input:**
- Video cortado

**Output:**
- Array de Caption con texto y timestamps del video cortado

**Archivos generados:**
```
public/subs/{videoId}-cut.json
```

---

### Fase 9: Script

**Propósito:** Importar guion y alinear con la transcripción.

**Qué hace:**
- Permite importar el guion original del video
- Alinea el guion con la transcripción generada
- Identifica discrepancias entre guion y lo que se dijo
- Facilita la detección de tomas repetidas

**Input:**
- Captions del video cortado
- Archivo de guion (texto)

**Output:**
- Guion alineado con timestamps
- Mapeo guion ↔ transcripción

**Archivos generados:**
```
public/pipeline/{videoId}/script.json
```

---

### Fase 10: Take-Selection

**Propósito:** Seleccionar las mejores tomas de frases repetidas.

**Qué hace:**
- Detecta cuando el presentador repitió frases (múltiples tomas)
- Agrupa tomas por frase/sección del guion
- Permite seleccionar manualmente o automáticamente la mejor toma
- Genera el orden final de clips para el render

**Input:**
- Captions alineados con el script

**Output:**
- Selección de tomas con orden de clips

**Archivos generados:**
```
public/pipeline/{videoId}/take-selection.json
```

---

### Fase 11: Rendered

**Propósito:** Generar el video final con subtítulos y efectos.

**Qué hace:**
- Aplica la selección de tomas
- Renderiza subtítulos sobre el video
- Aplica efectos detectados (zooms, highlights)
- Genera el video final listo para publicar

**Input:**
- Video cortado
- Selección de tomas
- Captions para subtítulos
- Efectos (opcional)

**Output:**
- Video final renderizado con subtítulos

**Archivos generados:**
```
public/videos/{videoId}-rendered.mp4
```

---

## Dependencias entre Fases

```
STEP_DEPENDENCIES = {
  raw: [],
  silences: [],
  captions-raw: [],
  segments: [silences],
  semantic: [captions-raw, silences],
  effects-analysis: [captions-raw],
  cut: [segments],
  captions: [cut],
  script: [captions],
  take-selection: [captions],
  rendered: [take-selection],
}
```

| Fase | Depende de | Puede ejecutarse en paralelo con |
|------|------------|----------------------------------|
| Raw | - | - |
| Silences | Raw | Captions-raw |
| Captions-raw | Raw | Silences |
| Segments | Silences | - |
| Semantic | Captions-raw, Silences | Effects-analysis |
| Effects-analysis | Captions-raw | Semantic |
| Cut | Segments | - |
| Captions | Cut | - |
| Script | Captions | Take-selection |
| Take-selection | Captions | Script |
| Rendered | Take-selection | - |

**Optimización:** `Silences` y `Captions-raw` pueden ejecutarse en paralelo después del import, reduciendo el tiempo total del pipeline.

---

## Flujo de Datos Visual

```
┌───────┐
│  Raw  │
└───┬───┘
    │
    ├─────────────────────────────┐
    │                             │
    ▼                             ▼
┌──────────┐               ┌──────────────┐
│ Silences │               │ Captions-Raw │ (opcional)
└────┬─────┘               └──────┬───────┘
     │                            │
     │    ┌───────────────────────┼───────────────────┐
     │    │                       │                   │
     │    │                       ▼                   ▼
     │    │              ┌──────────────┐    ┌─────────────────┐
     │    │              │   Semantic   │    │ Effects-Analysis│
     │    │              │  (opcional)  │    │    (opcional)   │
     │    │              └──────────────┘    └─────────────────┘
     │    │
     ▼    ▼
┌──────────┐
│ Segments │
└────┬─────┘
     │
     ▼
┌─────────┐
│   Cut   │
└────┬────┘
     │
     ▼
┌──────────┐
│ Captions │
└────┬─────┘
     │
     ├─────────────────┐
     │                 │
     ▼                 ▼
┌─────────┐    ┌────────────────┐
│ Script  │    │ Take-Selection │
└─────────┘    └───────┬────────┘
                       │
                       ▼
               ┌──────────┐
               │ Rendered │
               └──────────┘
```

---

## Configuración por Tipo de Contenido

Diferentes tipos de contenido requieren diferentes configuraciones de detección de silencios:

| Tipo | thresholdDb | minDuration | Notas |
|------|-------------|-------------|-------|
| Podcast/Entrevista | -40 dB | 0.8s | Más sensible, pausas naturales más largas |
| Tutorial/Educativo | -35 dB | 0.5s | Balance estándar |
| Presentación | -30 dB | 1.0s | Menos sensible, pausas dramáticas permitidas |
| Vlog/Dinámico | -35 dB | 0.3s | Cortes más agresivos |

---

## Ubicación de Archivos

```
public/
├── videos/
│   ├── {videoId}.mp4              # Video original (raw)
│   ├── {videoId}-cut.mp4          # Video cortado
│   └── {videoId}-rendered.mp4     # Video final con subtítulos
├── pipeline/
│   └── {videoId}/
│       ├── silences.json          # Detección de silencios
│       ├── segments.json          # Segmentos generados
│       ├── semantic.json          # Análisis semántico
│       ├── effects-analysis.json  # Efectos detectados
│       ├── script.json            # Guion alineado
│       └── take-selection.json    # Selección de tomas
├── subs/
│   ├── {videoId}-raw.json         # Captions del video original
│   └── {videoId}-cut.json         # Captions del video cortado
└── videos.manifest.json           # Registro de videos
```

---

## Fases Opcionales vs Requeridas

| Fase | Requerida | Propósito |
|------|-----------|-----------|
| Raw | Sí | Punto de entrada |
| Silences | Sí | Detectar pausas |
| Captions-Raw | No | Para análisis semántico |
| Segments | Sí | Definir segmentos de contenido |
| Semantic | No | Clasificar silencios |
| Effects-Analysis | No | Auto-detectar efectos |
| Cut | Sí | Generar video cortado |
| Captions | Sí | Subtítulos finales |
| Script | No | Alinear con guion |
| Take-Selection | No | Seleccionar mejores tomas |
| Rendered | No | Video final con efectos |

**Flujo mínimo:** Raw → Silences → Segments → Cut → Captions

**Flujo completo:** Todas las fases para máxima automatización y calidad.

---

## Recuperación y Reanudación

El pipeline está diseñado para ser resiliente:

- **Archivos intermedios:** Cada fase genera archivos que permiten reanudar desde ese punto
- **Idempotencia:** Re-ejecutar una fase con los mismos inputs genera los mismos outputs
- **Edición manual:** Los archivos JSON pueden editarse manualmente para ajustes finos
- **Dependencias:** El sistema verifica automáticamente que las dependencias estén completas antes de ejecutar una fase
