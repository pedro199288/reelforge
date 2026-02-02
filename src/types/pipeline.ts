import type { Video } from "@/components/VideoList";

// --- Pipeline step types ---

export type PipelineStep =
  | "raw"
  | "full-captions"
  | "silences"
  | "segments"
  | "cut"
  | "captions"
  | "effects-analysis"
  | "rendered";

export type StepStatus = "pending" | "running" | "completed" | "error";

export interface StepState {
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  resultFile?: string;
}

export interface BackendPipelineStatus {
  videoId: string;
  filename: string;
  videoDuration?: number;
  steps: Record<PipelineStep, StepState>;
  updatedAt: string;
}

export interface ProcessProgress {
  step: string;
  progress: number;
  message: string;
}

// --- Result types ---

export interface SilencesResult {
  silences: Array<{ start: number; end: number; duration: number }>;
  videoDuration: number;
  config: {
    method?: "ffmpeg" | "envelope";
    thresholdDb: number;
    minDurationSec: number;
    amplitudeThreshold?: number;
  };
  createdAt: string;
}

export interface SegmentsResult {
  segments: Array<{
    startTime: number;
    endTime: number;
    duration: number;
    index: number;
  }>;
  totalDuration: number;
  editedDuration: number;
  timeSaved: number;
  percentSaved: number;
  config: { paddingSec: number; usedSemanticAnalysis?: boolean };
  preselection?: {
    segments: Array<{
      id: string;
      startMs: number;
      endMs: number;
      enabled: boolean;
      score: number;
      reason: string;
    }>;
    stats: {
      totalSegments: number;
      selectedSegments: number;
      originalDurationMs: number;
      selectedDurationMs: number;
      scriptCoverage: number;
      repetitionsRemoved: number;
      averageScore: number;
      ambiguousSegments: number;
    };
  };
  createdAt: string;
}

export interface CutResult {
  outputPath: string;
  originalDuration: number;
  editedDuration: number;
  segmentsCount: number;
  createdAt: string;
}

export interface CaptionsResult {
  captionsPath: string;
  captionsCount: number;
  createdAt: string;
}

export interface EffectsAnalysisResultMeta {
  mainTopic: string;
  topicKeywords: string[];
  overallTone: string;
  language: string;
  wordCount: number;
  enrichedCaptionsCount: number;
  captionsHash: string;
  model: string;
  processingTimeMs: number;
  createdAt: string;
}

export type StepResult =
  | SilencesResult
  | SegmentsResult
  | CutResult
  | CaptionsResult
  | EffectsAnalysisResultMeta;

// --- Pipeline state ---

export interface PipelineState {
  raw: boolean;
  "full-captions": boolean;
  silences: boolean;
  segments: boolean;
  cut: boolean;
  captions: boolean;
  "effects-analysis": boolean;
  rendered: boolean;
}

// --- Constants ---

export const STEP_DEPENDENCIES: Record<PipelineStep, PipelineStep[]> = {
  raw: [],
  "full-captions": [],
  silences: [],
  segments: ["silences", "full-captions"],
  cut: ["segments"],
  captions: ["full-captions", "cut"],
  "effects-analysis": ["captions"],
  rendered: ["effects-analysis"],
};

export const STEPS: {
  key: PipelineStep;
  label: string;
  description: string;
  optional?: boolean;
}[] = [
  { key: "raw", label: "Raw", description: "Video original importado (incluye script opcional)" },
  {
    key: "full-captions",
    label: "Full Captions",
    description: "Transcripción completa del video original con Whisper",
  },
  {
    key: "silences",
    label: "Silencios",
    description: "Detectar silencios con FFmpeg",
  },
  {
    key: "segments",
    label: "Segmentos",
    description: "Generar segmentos de contenido con preseleccion",
  },
  { key: "cut", label: "Cortado", description: "Cortar video sin silencios (genera cut-map)" },
  {
    key: "captions",
    label: "Captions Post-Cuts",
    description: "Captions derivados de full-captions + cut-map (sin segundo Whisper)",
  },
  {
    key: "effects-analysis",
    label: "Auto-Efectos",
    description: "Analisis con IA para detectar zooms y highlights automaticos",
    optional: true,
  },
  {
    key: "rendered",
    label: "Renderizado",
    description: "Video final con subtitulos y efectos",
  },
];

// --- Helpers ---

/**
 * Get all steps that transitively depend on the given step (BFS).
 * E.g. getDownstreamSteps("segments") → ["cut", "captions", "effects-analysis", "rendered"]
 */
export function getDownstreamSteps(step: PipelineStep): PipelineStep[] {
  const downstream = new Set<PipelineStep>();
  const queue: PipelineStep[] = [step];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [s, deps] of Object.entries(STEP_DEPENDENCIES) as [PipelineStep, PipelineStep[]][]) {
      if (deps.includes(current) && !downstream.has(s) && s !== step) {
        downstream.add(s);
        queue.push(s);
      }
    }
  }

  return Array.from(downstream);
}

export function getVideoPipelineState(
  video: Video,
  backendStatus?: BackendPipelineStatus | null,
): PipelineState {
  if (backendStatus) {
    return {
      raw: true,
      "full-captions": backendStatus.steps["full-captions"]?.status === "completed",
      silences: backendStatus.steps.silences?.status === "completed",
      segments: backendStatus.steps.segments?.status === "completed",
      cut: backendStatus.steps.cut?.status === "completed",
      captions:
        backendStatus.steps.captions?.status === "completed" ||
        video.hasCaptions,
      "effects-analysis":
        backendStatus.steps["effects-analysis"]?.status === "completed",
      rendered: backendStatus.steps.rendered?.status === "completed",
    };
  }

  return {
    raw: true,
    "full-captions": false,
    silences: false,
    segments: false,
    cut: false,
    captions: false,
    "effects-analysis": false,
    rendered: false,
  };
}

export function getCompletedSteps(state: PipelineState): number {
  return Object.values(state).filter(Boolean).length;
}
