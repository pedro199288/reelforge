# Pipeline de Edición de Video

## Resumen

El pipeline de ReelForge automatiza la edición de video raw eliminando silencios y seleccionando las mejores tomas. El flujo completo es:

```
Import → Silences → Captions → Segments → Cut
```

Cada fase genera archivos intermedios que alimentan las siguientes fases, permitiendo reanudar el proceso desde cualquier punto.

---

## Fases del Pipeline

### Fase 1: Import

**Propósito:** Cargar un video al sistema para su procesamiento.

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

### Fase 3: Captions

**Propósito:** Transcribir el audio a texto con timestamps precisos.

**Qué hace:**
- Procesa el audio mediante Whisper CPP
- Genera transcripción palabra por palabra con timestamps
- Calcula nivel de confianza para cada segmento

**Variantes:**
- `captions-raw`: Procesa el video original (antes del corte)
- `captions`: Procesa el video ya cortado (para subtítulos finales)

**Input:**
- Video a procesar
- Script opcional (mejora el reconocimiento de términos específicos)

**Output:**
- Array de Caption con texto y timestamps

**Archivos generados:**
```
public/subs/{videoId}.json
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

**Propósito:** Generar segmentos editables y preseleccionar automáticamente los mejores.

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
   - **Análisis con AI (opcional):** Claude, GPT-4, o Ollama analizan calidad de contenido

**Input:**
- Silencios detectados
- Captions generados
- Script opcional
- Configuración de preselección (manual/auto/AI)

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

### Fase 5: Cut

**Propósito:** Ejecutar el corte final del video.

**Qué hace:**
- Extrae los segmentos seleccionados del video original
- Concatena los segmentos en orden
- Genera el video final sin silencios ni repeticiones
- Preserva la calidad original (re-encoding mínimo)

**Input:**
- Segmentos seleccionados (enabled: true)
- Video original

**Output:**
- Video cortado listo para publicar

**Archivos generados:**
```
public/videos/{videoId}-cut.mp4
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

## Flujo de Datos

```
┌─────────┐
│ Import  │
└────┬────┘
     │ video
     ▼
┌─────────┐     ┌──────────────┐
│Silences │     │ Captions-raw │
└────┬────┘     └──────┬───────┘
     │                 │
     │ silences.json   │ captions.json
     │                 │
     └────────┬────────┘
              ▼
        ┌──────────┐
        │ Segments │ ← script (opcional)
        └────┬─────┘
             │ segments.json
             ▼
        ┌─────────┐
        │   Cut   │
        └────┬────┘
             │
             ▼
      video-cut.mp4
```

---

## Dependencias entre Fases

| Fase | Depende de | Puede ejecutarse en paralelo con |
|------|------------|----------------------------------|
| Import | - | - |
| Silences | Import | Captions-raw |
| Captions-raw | Import | Silences |
| Segments | Silences, Captions-raw | - |
| Cut | Segments | - |

**Optimización:** `Silences` y `Captions-raw` pueden ejecutarse en paralelo después del import, reduciendo el tiempo total del pipeline.

---

## Ubicación de Archivos

```
public/
├── videos/
│   ├── {videoId}.mp4           # Video original
│   └── {videoId}-cut.mp4       # Video cortado
├── pipeline/
│   └── {videoId}/
│       ├── silences.json       # Detección de silencios
│       └── segments.json       # Segmentos generados
├── subs/
│   └── {videoId}.json          # Captions/transcripción
└── videos.manifest.json        # Registro de videos
```

---

## Recuperación y Reanudación

El pipeline está diseñado para ser resiliente:

- **Archivos intermedios:** Cada fase genera archivos que permiten reanudar desde ese punto
- **Idempotencia:** Re-ejecutar una fase con los mismos inputs genera los mismos outputs
- **Edición manual:** Los archivos JSON pueden editarse manualmente para ajustes finos
