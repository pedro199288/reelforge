# ReelForge - Especificaciones del Proyecto (v2)

> Herramienta para automatizar la edición de reels, shorts y TikToks.
> **Basado en el template TikTok de Remotion**.

---

## Visión General

ReelForge extiende el [template TikTok de Remotion](https://github.com/remotion-dev/template-tiktok) añadiendo:
- **Cortes automáticos** de silencios
- **Zooms dinámicos** basados en marcadores del guión
- **Highlights** de palabras clave
- **CLI** para automatizar el flujo completo

### Lo que ya nos da el template

| Feature | Estado | Notas |
|---------|--------|-------|
| Transcripción con Whisper | ✅ Ya incluido | Whisper.cpp local, gratis |
| Subtítulos animados | ✅ Ya incluido | Estilo TikTok con highlight |
| Preview en Remotion Studio | ✅ Ya incluido | `npm run dev` |
| Exportación a MP4 | ✅ Ya incluido | `npx remotion render` |

### Lo que añadimos nosotros

| Feature | Estado | Prioridad |
|---------|--------|-----------|
| Parser de guión con marcadores | 🔨 Por hacer | MVP |
| Detección de silencios | 🔨 Por hacer | MVP |
| Corte automático de silencios | 🔨 Por hacer | MVP |
| Zooms en marcadores `[zoom]` | 🔨 Por hacer | MVP |
| Highlights `{palabra}` con zoom | 🔨 Por hacer | MVP |
| CLI unificada | 🔨 Por hacer | MVP |
| B-roll automático | 📋 Futuro | Post-MVP |

---

## Stack Tecnológico

| Componente | Tecnología | Origen |
|------------|------------|--------|
| Runtime | Bun | Nuevo |
| Motor de video | Remotion | Template |
| Transcripción | Whisper.cpp | Template |
| Subtítulos | @remotion/captions | Template |
| Detección silencios | FFmpeg | Nuevo |
| CLI | Commander.js | Nuevo |

---

## Sintaxis del Guión

```markdown
# Mi Reel (título ignorado)

Hoy vamos a hablar de periodización. [zoom]

La mayoría de gente entrena sin un plan. [zoom:slow]

Y esto es {clave} para progresar.
```

### Marcadores

| Marcador | Efecto |
|----------|--------|
| `[zoom]` | Zoom rápido (punch) al final de la frase |
| `[zoom:slow]` | Zoom lento durante la frase |
| `{palabra}` | Highlight en subtítulo + zoom rápido |

---

## Estructura del Proyecto

```
reelforge/
├── public/
│   └── (videos de entrada aquí)
│
├── src/
│   ├── cli/                      # 🆕 CLI personalizada
│   │   ├── index.ts
│   │   └── commands/
│   │       └── forge.ts          # Comando principal
│   │
│   ├── core/                     # 🆕 Lógica de negocio
│   │   ├── parser/               # Parser del guión
│   │   │   ├── index.ts
│   │   │   ├── markers.ts
│   │   │   └── highlights.ts
│   │   ├── silence/              # Detección de silencios
│   │   │   ├── detect.ts
│   │   │   └── segments.ts
│   │   └── project.ts            # Orquestación
│   │
│   ├── remotion/                 # Modificaciones al template
│   │   ├── Composition.tsx       # (modificado) Añadir zooms
│   │   ├── CaptionedVideo.tsx    # (modificado) Integrar silencios
│   │   ├── Captions.tsx          # (modificado) Soportar highlights
│   │   └── Zoom.tsx              # 🆕 Componente de zoom
│   │
│   └── types/                    # 🆕 Tipos TypeScript
│       └── index.ts
│
├── sub.mjs                       # (del template) Script de transcripción
├── whisper-config.mjs            # (del template) Config de Whisper
├── remotion.config.ts            # (del template)
└── package.json
```

---

## Epics e Issues

### 🎯 EPIC 0: Setup del Proyecto

**Objetivo**: Tener el template funcionando con Bun y adaptado a nuestra estructura.

---

#### Issue 0.1: Clonar y adaptar template TikTok

**Prioridad**: 🔴 Alta | **Dependencias**: Ninguna | **MVP**: ✅

**Tareas**:
```bash
# 1. Crear proyecto desde template
bunx create-video@latest --template tiktok reelforge
cd reelforge

# 2. Verificar que funciona
bun install
bun run dev

# 3. Probar con un video real
# Copiar un video tuyo a public/
node sub.mjs public/mi-video.mp4
```

**Verificaciones**:
- [ ] `bun run dev` abre Remotion Studio
- [ ] El video de ejemplo se ve con subtítulos
- [ ] `node sub.mjs` genera captions para tu video

**Criterios de aceptación**:
- [ ] Proyecto funciona con Bun
- [ ] Puedes ver preview de un video tuyo con subtítulos generados

---

#### Issue 0.2: Añadir estructura de carpetas y tipos

**Prioridad**: 🔴 Alta | **Dependencias**: 0.1 | **MVP**: ✅

**Tareas**:
- [ ] Crear carpetas `src/cli`, `src/core`, `src/types`
- [ ] Configurar path aliases en `tsconfig.json`
- [ ] Instalar dependencias: `bun add commander chalk zod fluent-ffmpeg`
- [ ] Instalar tipos: `bun add -d @types/fluent-ffmpeg`

**Archivo `src/types/index.ts`**:
```typescript
// Marcadores del guión
export type MarkerType = "zoom" | "zoom:slow";

export interface Marker {
  type: MarkerType;
  charIndex: number;
}

export interface Highlight {
  word: string;
  startIndex: number;
  endIndex: number;
}

export interface ScriptLine {
  text: string;
  raw: string;
  lineNumber: number;
  markers: Marker[];
  highlights: Highlight[];
}

export interface ParsedScript {
  lines: ScriptLine[];
  sourcePath: string;
}

// Segmentos de video (entre silencios)
export interface Segment {
  startTime: number;
  endTime: number;
  duration: number;
  index: number;
}

// Zoom events para Remotion
export interface ZoomEvent {
  time: number;           // En segundos (video editado)
  type: "fast" | "slow";
  word?: string;          // Palabra asociada (para highlights)
}

// Proyecto procesado
export interface ReelProject {
  videoPath: string;
  scriptPath: string;
  segments: Segment[];
  zoomEvents: ZoomEvent[];
  highlightWords: string[];
  totalDuration: number;  // Duración después de cortes
}
```

**Criterios de aceptación**:
- [ ] Estructura de carpetas creada
- [ ] Tipos definidos y exportados
- [ ] Path aliases funcionan (`@/core/...`)

---

### 🎯 EPIC 1: Parser de Guión

**Objetivo**: Extraer marcadores y highlights del guión Markdown.

---

#### Issue 1.1: Implementar parser de guión

**Prioridad**: 🔴 Alta | **Dependencias**: 0.2 | **MVP**: ✅

**Archivo `src/core/parser/index.ts`**:
```typescript
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import type { ParsedScript, ScriptLine } from "@/types";
import { extractMarkers } from "./markers";
import { extractHighlights } from "./highlights";

export async function parseScript(filePath: string): Promise<ParsedScript> {
  if (!existsSync(filePath)) {
    throw new Error(`Script not found: ${filePath}`);
  }
  
  const content = await readFile(filePath, "utf-8");
  const rawLines = content.split("\n");
  
  const lines: ScriptLine[] = [];
  
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const lineNumber = i + 1;
    
    // Ignorar líneas vacías y headers
    if (raw.trim() === "" || raw.trim().startsWith("#")) continue;
    
    // Ignorar líneas que son solo marcadores
    const textOnly = raw.replace(/\[[\w:]+\]/g, "").replace(/\{[^}]+\}/g, "").trim();
    if (textOnly === "") continue;
    
    lines.push({
      raw,
      text: cleanText(raw),
      lineNumber,
      markers: extractMarkers(raw),
      highlights: extractHighlights(raw),
    });
  }
  
  return { lines, sourcePath: filePath };
}

function cleanText(text: string): string {
  return text
    .replace(/\[[\w:]+\]/g, "")      // Quitar [zoom], [zoom:slow]
    .replace(/\{([^}]+)\}/g, "$1")   // {palabra} → palabra
    .trim()
    .replace(/\s+/g, " ");
}
```

**Archivo `src/core/parser/markers.ts`**:
```typescript
import type { Marker, MarkerType } from "@/types";

const MARKER_REGEX = /\[(zoom|zoom:slow)\]/g;

export function extractMarkers(text: string): Marker[] {
  const markers: Marker[] = [];
  let match: RegExpExecArray | null;
  
  MARKER_REGEX.lastIndex = 0;
  
  while ((match = MARKER_REGEX.exec(text)) !== null) {
    markers.push({
      type: match[1] as MarkerType,
      charIndex: match.index,
    });
  }
  
  return markers;
}

export function hasZoom(markers: Marker[]): boolean {
  return markers.length > 0;
}

export function getZoomType(markers: Marker[]): "fast" | "slow" | null {
  const zoom = markers.find(m => m.type === "zoom" || m.type === "zoom:slow");
  if (!zoom) return null;
  return zoom.type === "zoom:slow" ? "slow" : "fast";
}
```

**Archivo `src/core/parser/highlights.ts`**:
```typescript
import type { Highlight } from "@/types";

const HIGHLIGHT_REGEX = /\{([^}]+)\}/g;

export function extractHighlights(text: string): Highlight[] {
  const highlights: Highlight[] = [];
  let match: RegExpExecArray | null;
  
  HIGHLIGHT_REGEX.lastIndex = 0;
  
  while ((match = HIGHLIGHT_REGEX.exec(text)) !== null) {
    const word = match[1].trim();
    if (word) {
      highlights.push({
        word,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
  }
  
  return highlights;
}

export function getHighlightWords(highlights: Highlight[]): string[] {
  return highlights.flatMap(h => h.word.toLowerCase().split(/\s+/));
}
```

**Tests manuales**:
```typescript
// Probar con:
const script = await parseScript("./test-guion.md");
console.log(JSON.stringify(script, null, 2));
```

**Criterios de aceptación**:
- [ ] Parsea correctamente `[zoom]` y `[zoom:slow]`
- [ ] Parsea correctamente `{highlights}`
- [ ] Ignora líneas vacías y headers
- [ ] El texto limpio no contiene marcadores

---

### 🎯 EPIC 2: Detección y Corte de Silencios

**Objetivo**: Detectar silencios y generar segmentos de video a mantener.

---

#### Issue 2.1: Detectar silencios con FFmpeg

**Prioridad**: 🔴 Alta | **Dependencias**: 0.2 | **MVP**: ✅

**Archivo `src/core/silence/detect.ts`**:
```typescript
import ffmpeg from "fluent-ffmpeg";
import { existsSync } from "fs";

export interface SilenceRange {
  start: number;
  end: number;
  duration: number;
}

export interface SilenceConfig {
  thresholdDb: number;      // Default: -35
  minDurationSec: number;   // Default: 0.5
}

const DEFAULT_CONFIG: SilenceConfig = {
  thresholdDb: -35,
  minDurationSec: 0.5,
};

export async function detectSilences(
  videoPath: string,
  config: Partial<SilenceConfig> = {}
): Promise<SilenceRange[]> {
  const { thresholdDb, minDurationSec } = { ...DEFAULT_CONFIG, ...config };
  
  if (!existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }
  
  return new Promise((resolve, reject) => {
    const silences: SilenceRange[] = [];
    let currentStart: number | null = null;
    
    ffmpeg(videoPath)
      .audioFilters(`silencedetect=noise=${thresholdDb}dB:d=${minDurationSec}`)
      .format("null")
      .output("-")
      .on("stderr", (line: string) => {
        // silence_start: 1.234
        const startMatch = line.match(/silence_start:\s*([\d.]+)/);
        if (startMatch) {
          currentStart = parseFloat(startMatch[1]);
        }
        
        // silence_end: 2.567 | silence_duration: 1.333
        const endMatch = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);
        if (endMatch && currentStart !== null) {
          silences.push({
            start: currentStart,
            end: parseFloat(endMatch[1]),
            duration: parseFloat(endMatch[2]),
          });
          currentStart = null;
        }
      })
      .on("error", reject)
      .on("end", () => resolve(silences))
      .run();
  });
}
```

**Criterios de aceptación**:
- [ ] Detecta silencios en un video real
- [ ] Respeta thresholdDb configurable
- [ ] Respeta minDurationSec configurable

---

#### Issue 2.2: Generar segmentos de corte

**Prioridad**: 🔴 Alta | **Dependencias**: 2.1 | **MVP**: ✅

**Archivo `src/core/silence/segments.ts`**:
```typescript
import type { Segment } from "@/types";
import type { SilenceRange } from "./detect";

export interface SegmentConfig {
  paddingSec: number;  // Default: 0.05 (50ms)
}

const DEFAULT_CONFIG: SegmentConfig = {
  paddingSec: 0.05,
};

export function silencesToSegments(
  silences: SilenceRange[],
  videoDuration: number,
  config: Partial<SegmentConfig> = {}
): Segment[] {
  const { paddingSec } = { ...DEFAULT_CONFIG, ...config };
  
  if (silences.length === 0) {
    return [{
      startTime: 0,
      endTime: videoDuration,
      duration: videoDuration,
      index: 0,
    }];
  }
  
  const sorted = [...silences].sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  let cursor = 0;
  
  for (const silence of sorted) {
    const segmentEnd = Math.max(cursor, silence.start - paddingSec);
    
    if (segmentEnd > cursor + 0.1) { // Mínimo 100ms de contenido
      segments.push({
        startTime: cursor,
        endTime: segmentEnd,
        duration: segmentEnd - cursor,
        index: segments.length,
      });
    }
    
    cursor = silence.end + paddingSec;
  }
  
  // Segmento final
  if (cursor < videoDuration - 0.1) {
    segments.push({
      startTime: cursor,
      endTime: videoDuration,
      duration: videoDuration - cursor,
      index: segments.length,
    });
  }
  
  return segments;
}

export function getTotalDuration(segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + s.duration, 0);
}

export function mapTimeToEdited(originalTime: number, segments: Segment[]): number | null {
  let editedTime = 0;
  
  for (const segment of segments) {
    if (originalTime >= segment.startTime && originalTime <= segment.endTime) {
      return editedTime + (originalTime - segment.startTime);
    }
    editedTime += segment.duration;
  }
  
  return null; // Tiempo cae en un silencio cortado
}
```

**Criterios de aceptación**:
- [ ] Genera segmentos correctamente
- [ ] `mapTimeToEdited` mapea tiempos del original al editado
- [ ] `getTotalDuration` calcula duración total correcta

---

### 🎯 EPIC 3: Integración de Zooms

**Objetivo**: Añadir zooms al video basados en los marcadores del guión.

---

#### Issue 3.1: Crear componente de Zoom

**Prioridad**: 🔴 Alta | **Dependencias**: 1.1 | **MVP**: ✅

**Archivo `src/remotion/Zoom.tsx`**:
```tsx
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import type { ZoomEvent } from "@/types";

interface UseZoomProps {
  events: ZoomEvent[];
  maxScale?: number;
  fastDurationFrames?: number;
  slowDurationFrames?: number;
}

export function useZoom({
  events,
  maxScale = 1.3,
  fastDurationFrames = 10,
  slowDurationFrames = 45,
}: UseZoomProps): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;
  
  // Buscar zoom activo
  for (const event of events) {
    const durationSec = event.type === "slow" 
      ? slowDurationFrames / fps 
      : fastDurationFrames / fps;
    
    if (currentTime >= event.time && currentTime <= event.time + durationSec) {
      const progress = (currentTime - event.time) / durationSec;
      
      if (event.type === "slow") {
        // Zoom suave: ease in-out
        const eased = Math.sin(progress * Math.PI);
        return 1 + (maxScale - 1) * eased;
      } else {
        // Zoom punch: rápido in, suave out
        const eased = progress < 0.3
          ? (progress / 0.3) ** 0.5           // Fast in
          : 1 - ((progress - 0.3) / 0.7) ** 2; // Ease out
        return 1 + (maxScale - 1) * eased;
      }
    }
  }
  
  return 1; // Sin zoom
}
```

**Criterios de aceptación**:
- [ ] `useZoom` devuelve escala correcta
- [ ] Zoom "fast" es punchy
- [ ] Zoom "slow" es suave

---

#### Issue 3.2: Integrar zoom en la composición

**Prioridad**: 🔴 Alta | **Dependencias**: 3.1 | **MVP**: ✅

**Modificar el componente principal del template** para usar el zoom:

```tsx
// En src/remotion/CaptionedVideo.tsx (o equivalente del template)
import { useZoom } from "./Zoom";
import type { ZoomEvent } from "@/types";

interface Props {
  // ... props existentes del template
  zoomEvents?: ZoomEvent[];
}

export const CaptionedVideo: React.FC<Props> = ({ zoomEvents = [], ...props }) => {
  const scale = useZoom({ events: zoomEvents });
  
  return (
    <AbsoluteFill>
      <div style={{
        transform: `scale(${scale})`,
        transformOrigin: "center center",
        width: "100%",
        height: "100%",
      }}>
        {/* Video original del template */}
      </div>
      
      {/* Captions del template */}
    </AbsoluteFill>
  );
};
```

**Criterios de aceptación**:
- [ ] El video hace zoom en los momentos correctos
- [ ] Los subtítulos NO se ven afectados por el zoom
- [ ] El zoom es visualmente agradable

---

### 🎯 EPIC 4: Integración de Cortes de Silencio

**Objetivo**: Reproducir solo los segmentos sin silencio.

---

#### Issue 4.1: Modificar reproducción de video para cortar silencios

**Prioridad**: 🔴 Alta | **Dependencias**: 2.2 | **MVP**: ✅

**Concepto**: En lugar de renderizar el video completo, saltamos entre segmentos.

```tsx
// Componente para reproducir solo segmentos
import { useCurrentFrame, useVideoConfig, OffthreadVideo } from "remotion";
import type { Segment } from "@/types";

interface SegmentedVideoProps {
  src: string;
  segments: Segment[];
}

export const SegmentedVideo: React.FC<SegmentedVideoProps> = ({ src, segments }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Encontrar en qué segmento estamos (tiempo editado)
  let accumulatedFrames = 0;
  
  for (const segment of segments) {
    const segmentFrames = Math.round(segment.duration * fps);
    
    if (frame < accumulatedFrames + segmentFrames) {
      // Estamos en este segmento
      const frameInSegment = frame - accumulatedFrames;
      const originalFrame = Math.round(segment.startTime * fps) + frameInSegment;
      
      return (
        <OffthreadVideo
          src={src}
          startFrom={originalFrame}
          endAt={originalFrame + 1}
          style={{ width: "100%", height: "100%" }}
        />
      );
    }
    
    accumulatedFrames += segmentFrames;
  }
  
  return null;
};
```

**Nota**: Esta implementación puede necesitar ajustes según cómo el template maneje el video. La idea es que en cada frame, calculamos qué parte del video original mostrar.

**Criterios de aceptación**:
- [ ] Los silencios no aparecen en el video final
- [ ] Las transiciones entre segmentos son seamless
- [ ] El audio está sincronizado

---

### 🎯 EPIC 5: CLI y Orquestación

**Objetivo**: Un comando que haga todo automáticamente.

---

#### Issue 5.1: Crear comando `reelforge`

**Prioridad**: 🔴 Alta | **Dependencias**: Todos los anteriores | **MVP**: ✅

**Archivo `src/cli/index.ts`**:
```typescript
#!/usr/bin/env bun
import { Command } from "commander";
import { forgeCommand } from "./commands/forge";

const program = new Command();

program
  .name("reelforge")
  .description("Automatiza la edición de tus reels")
  .version("0.1.0");

program
  .command("forge")
  .description("Procesa un video con guión y abre preview")
  .requiredOption("-v, --video <path>", "Path al video")
  .requiredOption("-s, --script <path>", "Path al guión (.md)")
  .option("--no-silence", "No cortar silencios")
  .option("--threshold <db>", "Umbral de silencio en dB", "-35")
  .action(forgeCommand);

program
  .command("render")
  .description("Renderiza el video final")
  .requiredOption("-p, --project <path>", "Path al proyecto procesado")
  .option("-o, --output <path>", "Path de salida", "./output.mp4")
  .action(async (options) => {
    console.log("Render not implemented yet");
    // TODO: Llamar a remotion render
  });

program.parse();
```

**Archivo `src/cli/commands/forge.ts`**:
```typescript
import chalk from "chalk";
import ora from "ora";
import path from "path";
import { parseScript } from "@/core/parser";
import { detectSilences } from "@/core/silence/detect";
import { silencesToSegments, getTotalDuration } from "@/core/silence/segments";
import { getHighlightWords } from "@/core/parser/highlights";
import { getZoomType } from "@/core/parser/markers";
import type { ReelProject, ZoomEvent } from "@/types";
import { spawn } from "child_process";
import { writeFile } from "fs/promises";

interface ForgeOptions {
  video: string;
  script: string;
  silence: boolean;
  threshold: string;
}

export async function forgeCommand(options: ForgeOptions) {
  console.log(chalk.bold("\n🎬 ReelForge\n"));
  
  const videoPath = path.resolve(options.video);
  const scriptPath = path.resolve(options.script);
  
  console.log(chalk.gray(`  Video:  ${videoPath}`));
  console.log(chalk.gray(`  Guión:  ${scriptPath}\n`));
  
  // 1. Parsear guión
  const spinner = ora("Parseando guión...").start();
  const script = await parseScript(scriptPath);
  spinner.succeed(`Guión parseado: ${script.lines.length} líneas`);
  
  // 2. Extraer highlights y zoom events del guión
  const highlightWords = script.lines.flatMap(l => getHighlightWords(l.highlights));
  
  // 3. Detectar silencios (si está habilitado)
  let segments: ReelProject["segments"] = [];
  
  if (options.silence) {
    spinner.start("Detectando silencios...");
    const silences = await detectSilences(videoPath, {
      thresholdDb: parseInt(options.threshold),
    });
    spinner.succeed(`${silences.length} silencios detectados`);
    
    // TODO: Obtener duración del video con ffprobe
    const videoDuration = 60; // Placeholder
    segments = silencesToSegments(silences, videoDuration);
    
    const saved = videoDuration - getTotalDuration(segments);
    console.log(chalk.green(`  → Ahorro: ${saved.toFixed(1)}s de silencios`));
  }
  
  // 4. Generar zoom events
  spinner.start("Procesando marcadores...");
  const zoomEvents: ZoomEvent[] = [];
  
  // Por ahora, zooms basados en el guión (sin alinear con timestamps exactos)
  // TODO: Integrar con captions generadas por Whisper para timestamps exactos
  script.lines.forEach((line, i) => {
    const zoomType = getZoomType(line.markers);
    if (zoomType) {
      // Placeholder: asignar tiempo basado en posición relativa
      // En realidad, esto debería venir de la transcripción
      zoomEvents.push({
        time: i * 5, // Placeholder
        type: zoomType === "slow" ? "slow" : "fast",
      });
    }
    
    // Highlights también generan zoom
    line.highlights.forEach(h => {
      zoomEvents.push({
        time: i * 5, // Placeholder
        type: "fast",
        word: h.word,
      });
    });
  });
  spinner.succeed(`${zoomEvents.length} zooms configurados`);
  
  // 5. Guardar proyecto
  const project: ReelProject = {
    videoPath,
    scriptPath,
    segments,
    zoomEvents,
    highlightWords,
    totalDuration: segments.length > 0 ? getTotalDuration(segments) : 60,
  };
  
  const projectPath = path.join(process.cwd(), ".reelforge-project.json");
  await writeFile(projectPath, JSON.stringify(project, null, 2));
  console.log(chalk.gray(`\n  Proyecto: ${projectPath}`));
  
  // 6. Abrir Remotion Studio
  console.log(chalk.blue("\n  Abriendo Remotion Studio...\n"));
  
  const studio = spawn("bunx", ["remotion", "studio"], {
    stdio: "inherit",
    env: {
      ...process.env,
      REELFORGE_PROJECT: projectPath,
    },
  });
  
  studio.on("error", (err) => {
    console.error(chalk.red(`Error: ${err.message}`));
  });
}
```

**Actualizar `package.json`**:
```json
{
  "bin": {
    "reelforge": "./src/cli/index.ts"
  },
  "scripts": {
    "forge": "bun run src/cli/index.ts forge",
    "dev": "remotion studio",
    "render": "remotion render"
  }
}
```

**Uso**:
```bash
# Procesar video y abrir preview
bun run forge -v ./public/mi-video.mp4 -s ./guion.md

# O con el bin instalado
reelforge forge -v ./public/mi-video.mp4 -s ./guion.md
```

**Criterios de aceptación**:
- [ ] `reelforge forge` ejecuta el pipeline completo
- [ ] Muestra progreso con spinners
- [ ] Abre Remotion Studio con el proyecto cargado
- [ ] El video tiene cortes de silencios (si no se usa `--no-silence`)
- [ ] Los zooms aparecen en los momentos marcados

---

## 🚀 Definición del MVP

### Issues del MVP

```
EPIC 0: 0.1, 0.2
EPIC 1: 1.1
EPIC 2: 2.1, 2.2
EPIC 3: 3.1, 3.2
EPIC 4: 4.1
EPIC 5: 5.1
```

**Total: 8 issues para MVP** (vs 27 en la versión anterior)

### Flujo MVP

```
Usuario:
1. Escribe guión.md con marcadores
2. Graba video
3. Ejecuta: reelforge forge -v video.mp4 -s guion.md

ReelForge:
4. Parsea guión → extrae [zoom] y {highlights}
5. Detecta silencios → genera segmentos
6. Genera proyecto JSON
7. Abre Remotion Studio

Usuario:
8. Ve preview con cortes + subtítulos + zooms
9. Exporta desde Remotion Studio
```

### Criterios de Aceptación MVP

- [ ] Un comando procesa video + guión y abre preview
- [ ] Los silencios se eliminan automáticamente
- [ ] Los subtítulos aparecen (del template)
- [ ] Los marcadores `[zoom]` generan zoom
- [ ] Los `{highlights}` destacan y hacen zoom

---

## Orden de Implementación

### Semana 1: Setup y Parser
- [ ] Issue 0.1: Clonar y probar template
- [ ] Issue 0.2: Estructura y tipos
- [ ] Issue 1.1: Parser de guión

### Semana 2: Silencios y Zooms
- [ ] Issue 2.1: Detectar silencios
- [ ] Issue 2.2: Generar segmentos
- [ ] Issue 3.1: Componente zoom
- [ ] Issue 3.2: Integrar zoom

### Semana 3: Integración
- [ ] Issue 4.1: Video segmentado
- [ ] Issue 5.1: CLI forge
- [ ] Testing con videos reales
- [ ] Pulir UX

---

## Trabajo Pendiente Post-MVP

### Alineación precisa de zooms

Actualmente los zooms usan timestamps placeholder. Para precisión real:

1. Ejecutar transcripción de Whisper (ya lo hace el template)
2. Alinear palabras del guión con timestamps de Whisper
3. Asignar zoom events a los timestamps correctos

**Issue futura**: Alinear transcripción con guión para zooms precisos

### Highlights en subtítulos

El template ya tiene subtítulos. Para que `{highlights}` tengan estilo especial:

1. Pasar lista de `highlightWords` al componente de captions
2. Modificar el renderizado para cambiar color/estilo de esas palabras

**Issue futura**: Modificar componente de captions para soportar highlights

### B-Roll automático

Para insertar b-roll en marcadores `[broll:tag]`:

1. Crear biblioteca de clips indexados por tag
2. Parsear marcadores `[broll:tag]`
3. Insertar clips en los momentos marcados

**Issue futura**: Sistema de b-roll automático

---

## Recursos

### Skills de Claude

```bash
# Instalar skill de Remotion
npx skills add https://github.com/remotion-dev/skills --skill remotion-best-practices
```

**Reglas más útiles**:
- `display-captions.md` — Subtítulos estilo TikTok
- `animations.md` — Cómo animar correctamente
- `timing.md` — Springs y easing
- `videos.md` — Manejo de video

### Links

- [Template TikTok](https://github.com/remotion-dev/template-tiktok)
- [Documentación Remotion](https://www.remotion.dev/docs)
- [@remotion/captions](https://www.remotion.dev/docs/captions)
- [Whisper.cpp](https://github.com/ggerganov/whisper.cpp)

---

## Decisiones Tomadas

- [x] **Base**: Usar template TikTok de Remotion en lugar de empezar de cero
- [x] **Transcripción**: Whisper.cpp (incluido en template, gratis, local)
- [x] **Runtime**: Bun
- [x] **Detección silencios**: FFmpeg silencedetect
- [ ] **Nombre**: ReelForge (provisional)
- [ ] **Estilos de subtítulos**: Por definir (heredamos del template inicialmente)

---

*Documento creado: Enero 2025*
*Última actualización: Enero 2025*
*Versión: 2.0 (basado en template TikTok)*
