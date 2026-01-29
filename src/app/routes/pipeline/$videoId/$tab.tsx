import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import type { Video } from "@/components/VideoList";
import {
  useWorkspaceStore,
  useSelection,
  useScript,
  SILENCE_DEFAULTS,
} from "@/store/workspace";
import { Textarea } from "@/components/ui/textarea";
import { parseScript } from "@/core/script/parser";
import { X } from "lucide-react";
import { usePipelineHeader } from "../../pipeline";
import { EffectsAnalysisPanel } from "@/components/EffectsAnalysisPanel";
import { SegmentEditorPanel } from "@/components/SegmentEditorPanel";
import type { PreselectionLog } from "@/core/preselection";
import { Skeleton } from "@/components/ui/skeleton";
import { PipelineResetActions } from "@/components/PipelineResetActions";
import {
  type ProcessingStepInfo,
  type ProcessingStatus,
} from "@/components/ProcessingStatusPanel";

const API_URL = "http://localhost:3012";

interface ProcessProgress {
  step: string;
  progress: number;
  message: string;
}

// Pipeline step execution types
type StepStatus = "pending" | "running" | "completed" | "error";

interface StepState {
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  resultFile?: string;
}

interface BackendPipelineStatus {
  videoId: string;
  filename: string;
  videoDuration?: number;
  steps: Record<PipelineStep, StepState>;
  updatedAt: string;
}

interface SilencesResult {
  silences: Array<{ start: number; end: number; duration: number }>;
  videoDuration: number;
  config: { thresholdDb: number; minDurationSec: number };
  createdAt: string;
}

interface SegmentsResult {
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

interface CutResult {
  outputPath: string;
  originalDuration: number;
  editedDuration: number;
  segmentsCount: number;
  createdAt: string;
}

interface CaptionsResult {
  captionsPath: string;
  captionsCount: number;
  createdAt: string;
}


interface EffectsAnalysisResultMeta {
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

type StepResult =
  | SilencesResult
  | SegmentsResult
  | CutResult
  | CaptionsResult
  | EffectsAnalysisResultMeta;

// Step dependencies - simplified 6-phase pipeline
const STEP_DEPENDENCIES: Record<PipelineStep, PipelineStep[]> = {
  raw: [],
  silences: [],
  segments: ["silences"],
  cut: ["segments"],
  captions: ["cut"],
  "effects-analysis": ["captions"],
  rendered: ["effects-analysis"],
};

export const Route = createFileRoute("/pipeline/$videoId/$tab")({
  component: PipelinePage,
});

interface VideoManifest {
  videos: Video[];
}

type PipelineStep =
  | "raw"
  | "silences"
  | "segments"
  | "cut"
  | "captions"
  | "effects-analysis"
  | "rendered";

interface PipelineState {
  raw: boolean;
  silences: boolean;
  segments: boolean;
  cut: boolean;
  captions: boolean;
  "effects-analysis": boolean;
  rendered: boolean;
}

const STEPS: {
  key: PipelineStep;
  label: string;
  description: string;
  optional?: boolean;
}[] = [
  { key: "raw", label: "Raw", description: "Video original importado (incluye script opcional)" },
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
    label: "Captions",
    description: "Transcripcion del video cortado con Whisper",
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

function getVideoPipelineState(
  video: Video,
  backendStatus?: BackendPipelineStatus | null,
): PipelineState {
  if (backendStatus) {
    return {
      raw: true,
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
    silences: false,
    segments: false,
    cut: false,
    captions: false,
    "effects-analysis": false,
    rendered: false,
  };
}

function getCompletedSteps(state: PipelineState): number {
  return Object.values(state).filter(Boolean).length;
}

function pipelineStateToStepInfo(
  state: PipelineState,
  currentProcessingStep?: string,
): ProcessingStepInfo[] {
  return STEPS.map((step) => {
    let status: ProcessingStatus = "pending";

    if (state[step.key]) {
      status = "completed";
    } else if (currentProcessingStep === step.key) {
      status = "processing";
    }

    return {
      key: step.key,
      label: step.label,
      status,
      completedAt: state[step.key] ? new Date() : undefined,
    };
  });
}

function PipelinePage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get params from URL
  const { videoId, tab } = Route.useParams();
  const navigate = useNavigate();

  // Derive selected video from params
  const selectedVideo = useMemo(() => {
    return videos.find((v) => v.id === videoId) ?? null;
  }, [videos, videoId]);

  // Validate and use tab from params
  const validTabs: PipelineStep[] = [
    "raw",
    "silences",
    "segments",
    "cut",
    "captions",
    "effects-analysis",
    "rendered",
  ];
  const activeStep: PipelineStep = validTabs.includes(tab as PipelineStep)
    ? (tab as PipelineStep)
    : "raw";

  // Auto-process state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] =
    useState<ProcessProgress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Individual step execution state
  const [backendStatus, setBackendStatus] =
    useState<BackendPipelineStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [stepProcessing, setStepProcessing] = useState<PipelineStep | null>(
    null,
  );
  const [stepProgress, setStepProgress] = useState<ProcessProgress | null>(
    null,
  );
  const [stepResults, setStepResults] = useState<Record<string, StepResult>>(
    {},
  );
  const [preselectionLog, setPreselectionLog] = useState<PreselectionLog | null>(null);

  // Pipeline config from persistent store
  const config = useWorkspaceStore((state) => state.pipelineConfig);
  const setPipelineConfig = useWorkspaceStore(
    (state) => state.setPipelineConfig,
  );

  // Script state for raw phase
  const scriptState = useScript(selectedVideo?.id ?? "");
  const setScript = useWorkspaceStore((state) => state.setScript);
  const clearScript = useWorkspaceStore((state) => state.clearScript);

  // Segment selections for the current video
  const segmentSelection = useSelection(selectedVideo?.id ?? "");

  // Load result of a specific step
  const loadStepResult = useCallback(
    async (videoId: string, step: PipelineStep) => {
      try {
        const res = await fetch(
          `${API_URL}/api/pipeline/result?videoId=${encodeURIComponent(videoId)}&step=${step}`,
        );
        if (res.ok) {
          const result = (await res.json()) as StepResult;
          setStepResults((prev) => ({ ...prev, [step]: result }));
        }
      } catch (err) {
        console.error(`Error loading ${step} result:`, err);
      }
    },
    [],
  );

  // Load preselection logs
  const loadPreselectionLogs = useCallback(
    async (videoId: string) => {
      try {
        const res = await fetch(
          `${API_URL}/api/pipeline/${encodeURIComponent(videoId)}/preselection-logs`,
        );
        if (res.ok) {
          const result = await res.json();
          setPreselectionLog(result.log ?? null);
        }
      } catch (err) {
        // Logs are optional, don't show error
        console.debug("Preselection logs not available:", err);
      }
    },
    [],
  );

  // Load backend pipeline status
  const loadPipelineStatus = useCallback(
    async (videoId: string, filename: string) => {
      setStatusError(null);
      try {
        const res = await fetch(
          `${API_URL}/api/pipeline/status?videoId=${encodeURIComponent(videoId)}&filename=${encodeURIComponent(filename)}`,
        );
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        const status = (await res.json()) as BackendPipelineStatus;
        setBackendStatus(status);

        // Load results for completed steps
        const completedSteps = Object.entries(status.steps)
          .filter(([, state]) => state.status === "completed")
          .map(([step]) => step as PipelineStep);

        for (const step of completedSteps) {
          loadStepResult(videoId, step);
        }

        // Load preselection logs if segments step is completed
        if (completedSteps.includes("segments")) {
          loadPreselectionLogs(videoId);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        console.error("Error loading pipeline status:", err);
        setStatusError(`No se pudo conectar al servidor API: ${message}`);
        toast.error("Servidor API no disponible", {
          description: "Asegúrate de que el servidor esté corriendo en el puerto 3012",
        });
      }
    },
    [loadStepResult, loadPreselectionLogs],
  );

  // Check if a step can be executed
  const canExecuteStepCheck = useCallback(
    (
      step: PipelineStep,
      state: PipelineState,
    ): { canExecute: boolean; missingDeps: PipelineStep[] } => {
      const deps = STEP_DEPENDENCIES[step];
      const missingDeps = deps.filter((dep) => !state[dep]);
      return { canExecute: missingDeps.length === 0, missingDeps };
    },
    [],
  );

  // Execute a single pipeline step
  const executeStep = useCallback(
    async (step: PipelineStep) => {
      if (!selectedVideo || stepProcessing) return;

      const videoId = selectedVideo.id;
      const filename = selectedVideo.filename;

      setStepProcessing(step);
      setStepProgress({ step, progress: 0, message: "Iniciando..." });

      try {
        const response = await fetch(`${API_URL}/api/pipeline/step`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId,
            filename,
            step,
            config: {
              thresholdDb:
                config.silence.thresholdDb ?? SILENCE_DEFAULTS.thresholdDb,
              minDurationSec:
                config.silence.minDurationSec ??
                SILENCE_DEFAULTS.minDurationSec,
              paddingSec:
                config.silence.paddingSec ?? SILENCE_DEFAULTS.paddingSec,
            },
            selectedSegments:
              step === "cut" && segmentSelection.length > 0
                ? segmentSelection
                : undefined,
            script: scriptState?.rawScript || undefined,
            preselection: config.preselection,
          }),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || "Error al ejecutar el paso");
        }

        // Read SSE stream
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const chunk of lines) {
            if (!chunk.trim()) continue;

            const eventMatch = chunk.match(/event: (\w+)/);
            const dataMatch = chunk.match(/data: (.+)/);

            if (eventMatch && dataMatch) {
              const eventType = eventMatch[1];
              const data = JSON.parse(dataMatch[1]);

              switch (eventType) {
                case "progress":
                  setStepProgress(data);
                  break;
                case "complete":
                  toast.success(`${step} completado`, {
                    description: `Paso "${step}" ejecutado correctamente`,
                  });
                  setStepResults((prev) => ({ ...prev, [step]: data.result }));
                  await loadPipelineStatus(videoId, filename);
                  break;
                case "error":
                  throw new Error(data.error);
              }
            }
          }
        }
      } catch (err) {
        toast.error(`Error en ${step}`, {
          description: err instanceof Error ? err.message : "Error desconocido",
        });
      } finally {
        setStepProcessing(null);
        setStepProgress(null);
      }
    },
    [
      selectedVideo,
      stepProcessing,
      config,
      loadPipelineStatus,
      scriptState,
      segmentSelection,
    ],
  );

  // Execute all steps up to and including the target step
  const executeUntilStep = useCallback(
    async (targetStep: PipelineStep) => {
      if (!selectedVideo || stepProcessing) return;

      const videoId = selectedVideo.id;
      const filename = selectedVideo.filename;

      const executableSteps: PipelineStep[] = [
        "silences",
        "segments",
        "cut",
        "captions",
        "effects-analysis",
      ];
      const targetIndex = executableSteps.indexOf(targetStep);

      if (targetIndex === -1) return;

      const currentStatus = backendStatus;

      const stepsToExecute = executableSteps
        .slice(0, targetIndex + 1)
        .filter((step) => {
          const stepState = currentStatus?.steps[step];
          return stepState?.status !== "completed";
        });

      if (stepsToExecute.length === 0) {
        toast.info("Todos los pasos ya estan completados");
        return;
      }

      for (const step of stepsToExecute) {
        setStepProcessing(step);
        setStepProgress({ step, progress: 0, message: `Iniciando ${step}...` });

        try {
          const response = await fetch(`${API_URL}/api/pipeline/step`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              videoId,
              filename,
              step,
              config: {
                thresholdDb:
                  config.silence.thresholdDb ?? SILENCE_DEFAULTS.thresholdDb,
                minDurationSec:
                  config.silence.minDurationSec ??
                  SILENCE_DEFAULTS.minDurationSec,
                paddingSec:
                  config.silence.paddingSec ?? SILENCE_DEFAULTS.paddingSec,
              },
              script: scriptState?.rawScript || undefined,
              preselection: config.preselection,
            }),
          });

          if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || `Error al ejecutar ${step}`);
          }

          const reader = response.body?.getReader();
          if (!reader) throw new Error("No response body");

          const decoder = new TextDecoder();
          let buffer = "";
          let stepCompleted = false;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const chunk of lines) {
              if (!chunk.trim()) continue;

              const eventMatch = chunk.match(/event: (\w+)/);
              const dataMatch = chunk.match(/data: (.+)/);

              if (eventMatch && dataMatch) {
                const eventType = eventMatch[1];
                const data = JSON.parse(dataMatch[1]);

                switch (eventType) {
                  case "progress":
                    setStepProgress(data);
                    break;
                  case "complete":
                    setStepResults((prev) => ({
                      ...prev,
                      [step]: data.result,
                    }));
                    stepCompleted = true;
                    break;
                  case "error":
                    throw new Error(data.error);
                }
              }
            }
          }

          if (!stepCompleted) {
            throw new Error(`Paso ${step} no se completo correctamente`);
          }

          await loadPipelineStatus(videoId, filename);
        } catch (err) {
          toast.error(`Error en ${step}`, {
            description:
              err instanceof Error ? err.message : "Error desconocido",
          });
          setStepProcessing(null);
          setStepProgress(null);
          return;
        }
      }

      toast.success("Ejecucion completada", {
        description: `Se ejecutaron ${stepsToExecute.length} paso(s) correctamente`,
      });
      setStepProcessing(null);
      setStepProgress(null);
    },
    [
      selectedVideo,
      stepProcessing,
      config,
      loadPipelineStatus,
      backendStatus,
      scriptState,
    ],
  );

  // Load pipeline status when video changes
  useEffect(() => {
    if (selectedVideo) {
      setBackendStatus(null);
      setStepResults({});
      loadPipelineStatus(selectedVideo.id, selectedVideo.filename);
    }
  }, [selectedVideo, loadPipelineStatus]);

  // Start auto-processing
  const startAutoProcess = useCallback(async () => {
    if (!selectedVideo || isProcessing) return;

    setIsProcessing(true);
    setProcessProgress({
      step: "starting",
      progress: 0,
      message: "Iniciando...",
    });

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(`${API_URL}/api/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video: selectedVideo.filename,
          config: {
            thresholdDb: config.thresholdDb,
            minDurationSec: config.minDurationSec,
            paddingSec: config.paddingSec,
          },
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Error connecting to server");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const chunk of lines) {
          if (!chunk.trim()) continue;

          const eventMatch = chunk.match(/event: (\w+)/);
          const dataMatch = chunk.match(/data: (.+)/);

          if (eventMatch && dataMatch) {
            const eventType = eventMatch[1];
            const data = JSON.parse(dataMatch[1]);

            switch (eventType) {
              case "progress":
                setProcessProgress(data);
                break;
              case "complete":
                toast.success("Procesamiento completado", {
                  description: `Video guardado en ${data.outputPath}`,
                });
                setIsProcessing(false);
                setProcessProgress(null);
                break;
              case "error":
                throw new Error(data.message);
              case "log":
                console.log("[Process]", data.message);
                break;
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        toast.info("Procesamiento cancelado");
      } else {
        toast.error("Error en el procesamiento", {
          description: err instanceof Error ? err.message : "Error desconocido",
        });
      }
      setIsProcessing(false);
      setProcessProgress(null);
    }
  }, [selectedVideo, isProcessing, config]);

  // Cancel processing
  const cancelProcess = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Load videos from manifest
  const loadVideos = useCallback(async (isInitialLoad = false) => {
    try {
      const res = await fetch(`/videos.manifest.json?t=${Date.now()}`);
      if (!res.ok) throw new Error("Failed to load video manifest");
      const data = (await res.json()) as VideoManifest;

      setVideos(data.videos);

      if (isInitialLoad) {
        setLoading(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (isInitialLoad) {
        setError(message);
        setLoading(false);
      }
      toast.error("Error loading videos", { description: message });
    }
  }, []);

  // Refresh callback for reset actions
  const handleRefresh = useCallback(() => {
    loadVideos(false);
    setBackendStatus(null);
    if (selectedVideo) {
      loadPipelineStatus(selectedVideo.id, selectedVideo.filename);
    }
  }, [loadVideos, selectedVideo, loadPipelineStatus]);

  useEffect(() => {
    loadVideos(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigate to different tab
  const handleSetActiveStep = useCallback(
    (step: PipelineStep) => {
      navigate({
        to: "/pipeline/$videoId/$tab",
        params: { videoId, tab: step },
      });
    },
    [navigate, videoId],
  );

  const pipelineState = useMemo(() => {
    if (!selectedVideo) return null;
    return getVideoPipelineState(selectedVideo, backendStatus);
  }, [selectedVideo, backendStatus]);

  const progressPercent = useMemo(() => {
    if (!pipelineState) return 0;
    return Math.round((getCompletedSteps(pipelineState) / STEPS.length) * 100);
  }, [pipelineState]);

  // Convert pipeline state to step info for visual indicators
  const stepInfoList = useMemo(() => {
    if (!pipelineState) return [];
    const currentStep = processProgress?.step;
    return pipelineStateToStepInfo(pipelineState, currentStep);
  }, [pipelineState, processProgress?.step]);

  // Access parent context
  const { setHeaderActions, setProgressState } = usePipelineHeader();

  // Register header actions in the parent layout
  useEffect(() => {
    if (!selectedVideo) {
      setHeaderActions(null);
      return;
    }

    setHeaderActions(
      <>
        <Badge variant="outline" className="text-sm">
          {progressPercent}% completado
        </Badge>
        <PipelineResetActions
          videoId={selectedVideo.id}
          disabled={isProcessing}
          hasCaptions={selectedVideo.hasCaptions}
          onReset={handleRefresh}
        />
        {isProcessing ? (
          <Button
            variant="destructive"
            onClick={cancelProcess}
            className="gap-2"
          >
            <StopIcon className="w-4 h-4" />
            Cancelar
          </Button>
        ) : (
          <Button
            onClick={startAutoProcess}
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            <ZapIcon className="w-4 h-4" />
            Procesar Todo
          </Button>
        )}
      </>,
    );

    return () => setHeaderActions(null);
  }, [
    selectedVideo,
    progressPercent,
    isProcessing,
    handleRefresh,
    cancelProcess,
    startAutoProcess,
    setHeaderActions,
  ]);

  // Sync progress state to parent layout for the progress column
  useEffect(() => {
    setProgressState({
      stepInfoList,
      progressPercent,
      isProcessing,
      processProgress,
    });

    return () => setProgressState(null);
  }, [
    stepInfoList,
    progressPercent,
    isProcessing,
    processProgress,
    setProgressState,
  ]);

  const getStepCommand = (step: PipelineStep): string => {
    if (!selectedVideo) return "";
    const videoPath = `public/videos/${selectedVideo.filename}`;

    switch (step) {
      case "raw":
        return `# Video importado desde\n${videoPath}\n# El script se importa aquí si está disponible`;
      case "silences":
        return `# Detectar silencios en el video
bun run src/core/silence/detect.ts "${videoPath}" \\
  --threshold ${config.silence.thresholdDb ?? SILENCE_DEFAULTS.thresholdDb} \\
  --min-duration ${config.silence.minDurationSec ?? SILENCE_DEFAULTS.minDurationSec}`;
      case "segments":
        return `# Generar segmentos de contenido con preselección
bun run src/core/silence/segments.ts "${videoPath}" \\
  --padding ${config.silence.paddingSec ?? SILENCE_DEFAULTS.paddingSec}`;
      case "cut":
        return `# Cortar video (remover silencios) + genera cut-map.json
bun run src/core/cut/index.ts "${videoPath}" \\
  --output "public/videos/${selectedVideo.id}-cut.mp4"`;
      case "captions":
        return `# Generar captions del video cortado con Whisper
node sub.mjs "public/videos/${selectedVideo.id}-cut.mp4"`;
      case "effects-analysis":
        return `# Análisis con IA para detectar zooms y highlights
# Usa captions del video cortado
# Requiere: ANTHROPIC_API_KEY configurada`;
      case "rendered":
        return `# Renderizar video final con Remotion
bunx remotion render src/index.ts CaptionedVideo \\
  --props='{"videoSrc":"${selectedVideo.id}-cut.mp4"}' \\
  out/${selectedVideo.id}_final.mp4`;
      default:
        return "";
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 flex-1">
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-4 w-48 mb-4" />
            <Skeleton className="h-2 w-full mb-4" />
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-6 w-20 rounded-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!selectedVideo) {
    return (
      <Card className="flex-1 flex items-center justify-center">
        <CardContent className="py-12 text-center">
          <div className="text-muted-foreground mb-2">Video no encontrado</div>
          <p className="text-sm text-muted-foreground/70">
            El video seleccionado no existe o fue eliminado
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* API Server Error */}
      {statusError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Error de conexión</AlertTitle>
          <AlertDescription>
            {statusError}
            <br />
            <span className="text-xs mt-1 block">
              Ejecuta <code className="bg-destructive/20 px-1 rounded">bun run server</code> para iniciar el servidor API.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Pipeline Tabs */}
      {pipelineState && (
        <Tabs
          value={activeStep}
          onValueChange={(v) => handleSetActiveStep(v as PipelineStep)}
          className="flex-1 min-h-0 flex flex-col"
        >
          {STEPS.map((step) => {
            const isExecutableStep = [
              "silences",
              "segments",
              "cut",
              "captions",
              "effects-analysis",
            ].includes(step.key);
            const { canExecute, missingDeps } = canExecuteStepCheck(
              step.key,
              pipelineState,
            );
            const isStepRunning = stepProcessing === step.key;
            const stepResult = stepResults[step.key];

            return (
              <TabsContent
                key={step.key}
                value={step.key}
                className="flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden"
              >
                <Card className="flex-1 min-h-0 flex flex-col">
                  <CardHeader className="flex-none">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {step.label}
                          {pipelineState[step.key] && (
                            <Badge
                              variant="outline"
                              className="bg-green-100 text-green-700 border-green-300"
                            >
                              Completado
                            </Badge>
                          )}
                          {backendStatus?.steps[
                            step.key as keyof typeof backendStatus.steps
                          ]?.status === "error" && (
                            <Badge variant="destructive">Error</Badge>
                          )}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {step.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isExecutableStep && (
                          <>
                            {!canExecute &&
                              missingDeps.length > 0 &&
                              !stepProcessing && (
                                <span className="text-xs text-muted-foreground">
                                  Requiere: {missingDeps.join(", ")}
                                </span>
                              )}
                            {step.key !== "silences" && (
                              <Button
                                onClick={() => executeUntilStep(step.key)}
                                disabled={
                                  isStepRunning ||
                                  isProcessing ||
                                  !!stepProcessing
                                }
                                variant="outline"
                                className="gap-2"
                              >
                                {stepProcessing && !isStepRunning ? (
                                  <>
                                    <LoaderIcon className="w-4 h-4 animate-spin" />
                                    Ejecutando...
                                  </>
                                ) : (
                                  <>
                                    <FastForwardIcon className="w-4 h-4" />
                                    Ejecutar hasta aqui
                                  </>
                                )}
                              </Button>
                            )}
                            <Button
                              onClick={() => executeStep(step.key)}
                              disabled={
                                !canExecute ||
                                isStepRunning ||
                                isProcessing ||
                                !!stepProcessing
                              }
                              variant={
                                pipelineState[step.key] ? "outline" : "default"
                              }
                              className="gap-2"
                            >
                              {isStepRunning ? (
                                <>
                                  <LoaderIcon className="w-4 h-4 animate-spin" />
                                  Ejecutando...
                                </>
                              ) : pipelineState[step.key] ? (
                                <>
                                  <RefreshIcon className="w-4 h-4" />
                                  Re-ejecutar
                                </>
                              ) : (
                                <>
                                  <PlayIcon className="w-4 h-4" />
                                  Ejecutar
                                </>
                              )}
                            </Button>
                          </>
                        )}
                        {step.key !== "raw" &&
                          !pipelineState[step.key] &&
                          !isExecutableStep && (
                            <Button
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  getStepCommand(step.key),
                                );
                                toast.success("Comando copiado", {
                                  description: `Comando para "${step.label}" copiado al portapapeles`,
                                });
                              }}
                            >
                              <CopyIcon className="w-4 h-4 mr-2" />
                              Copiar comando
                            </Button>
                          )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle">
                    {/* Step progress indicator */}
                    {isStepRunning && stepProgress && (
                      <div className="mb-4 p-4 border rounded-lg bg-blue-50 border-blue-200">
                        <div className="flex items-center gap-3 mb-2">
                          <LoaderIcon className="w-4 h-4 animate-spin text-blue-600" />
                          <span className="text-sm font-medium text-blue-700">
                            {stepProgress.message}
                          </span>
                          <Badge
                            variant="outline"
                            className="ml-auto text-blue-600 border-blue-300"
                          >
                            {stepProgress.progress}%
                          </Badge>
                        </div>
                        <Progress
                          value={stepProgress.progress}
                          className="h-2"
                        />
                      </div>
                    )}

                    {step.key === "raw" ? (
                      <div className="space-y-4 flex-col flex h-full">
                        <div className="grid grid-cols-2 gap-4 text-sm min-h-0">
                          <div>
                            <span className="text-muted-foreground">
                              Archivo:
                            </span>
                            <span className="ml-2 font-mono">
                              {selectedVideo.filename}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              Tamano:
                            </span>
                            <span className="ml-2">
                              {formatFileSize(selectedVideo.size)}
                            </span>
                          </div>
                        </div>

                        {/* Script Input Section */}
                        <div className="space-y-2 pt-2 border-t grow min-h-0 flex flex-col">
                          <div className="flex items-center justify-between flex-none">
                            <label className="text-sm font-medium">
                              Guion original (opcional)
                            </label>
                            {scriptState?.rawScript && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => clearScript(selectedVideo.id)}
                                className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                              >
                                <X className="w-3 h-3 mr-1" />
                                Limpiar
                              </Button>
                            )}
                          </div>
                          <Textarea
                            placeholder="Pega aqui tu guion original. Puedes usar marcadores como [zoom], [zoom:slow] o {palabra} para efectos..."
                            value={scriptState?.rawScript ?? ""}
                            onChange={(e) =>
                              setScript(selectedVideo.id, e.target.value)
                            }
                            className="min-h-[260px] text-sm font-mono resize-y grow min-h-0"
                          />
                          {scriptState?.rawScript &&
                            (() => {
                              const parsed = parseScript(scriptState.rawScript);
                              const zoomCount = parsed.markers.filter(
                                (m) => m.type === "zoom",
                              ).length;
                              const highlightCount = parsed.markers.filter(
                                (m) => m.type === "highlight",
                              ).length;
                              const totalMarkers = zoomCount + highlightCount;
                              return (
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span>
                                    {scriptState.rawScript.length} caracteres
                                  </span>
                                  {totalMarkers > 0 && (
                                    <>
                                      <span className="text-muted-foreground/50">
                                        |
                                      </span>
                                      {zoomCount > 0 && (
                                        <Badge
                                          variant="secondary"
                                          className="text-xs h-5"
                                        >
                                          {zoomCount} zoom
                                          {zoomCount !== 1 ? "s" : ""}
                                        </Badge>
                                      )}
                                      {highlightCount > 0 && (
                                        <Badge
                                          variant="secondary"
                                          className="text-xs h-5"
                                        >
                                          {highlightCount} highlight
                                          {highlightCount !== 1 ? "s" : ""}
                                        </Badge>
                                      )}
                                    </>
                                  )}
                                </div>
                              );
                            })()}
                          <p className="text-xs text-muted-foreground">
                            Este guion se usara para mejorar la deteccion de
                            silencios y transcripcion.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Config for silence detection */}
                        {step.key === "silences" && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium">
                                Threshold (dB)
                              </label>
                              <div className="relative mt-1">
                                <Input
                                  type="number"
                                  value={config.silence.thresholdDb ?? ""}
                                  placeholder={`${SILENCE_DEFAULTS.thresholdDb} (default)`}
                                  onChange={(e) =>
                                    setPipelineConfig({
                                      silence: {
                                        ...config.silence,
                                        thresholdDb:
                                          e.target.value === ""
                                            ? undefined
                                            : Number(e.target.value),
                                      },
                                    })
                                  }
                                  className="pr-8"
                                  disabled={isStepRunning}
                                />
                                {config.silence.thresholdDb !== undefined && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPipelineConfig({
                                        silence: {
                                          ...config.silence,
                                          thresholdDb: undefined,
                                        },
                                      })
                                    }
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    disabled={isStepRunning}
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                Nivel de ruido para detectar silencio (-60 a
                                -20)
                              </p>
                            </div>
                            <div>
                              <label className="text-sm font-medium">
                                Duracion minima (seg)
                              </label>
                              <div className="relative mt-1">
                                <Input
                                  type="number"
                                  step="0.1"
                                  value={config.silence.minDurationSec ?? ""}
                                  placeholder={`${SILENCE_DEFAULTS.minDurationSec} (default)`}
                                  onChange={(e) =>
                                    setPipelineConfig({
                                      silence: {
                                        ...config.silence,
                                        minDurationSec:
                                          e.target.value === ""
                                            ? undefined
                                            : Number(e.target.value),
                                      },
                                    })
                                  }
                                  className="pr-8"
                                  disabled={isStepRunning}
                                />
                                {config.silence.minDurationSec !==
                                  undefined && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPipelineConfig({
                                        silence: {
                                          ...config.silence,
                                          minDurationSec: undefined,
                                        },
                                      })
                                    }
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    disabled={isStepRunning}
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                Minimo de segundos para considerar silencio
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Config for segments */}
                        {step.key === "segments" && (
                          <div className="max-w-xs">
                            <label className="text-sm font-medium">
                              Padding (seg)
                            </label>
                            <div className="relative mt-1">
                              <Input
                                type="number"
                                step="0.01"
                                value={config.silence.paddingSec ?? ""}
                                placeholder={`${SILENCE_DEFAULTS.paddingSec} (default)`}
                                onChange={(e) =>
                                  setPipelineConfig({
                                    silence: {
                                      ...config.silence,
                                      paddingSec:
                                        e.target.value === ""
                                          ? undefined
                                          : Number(e.target.value),
                                    },
                                  })
                                }
                                className="pr-8"
                                disabled={isStepRunning}
                              />
                              {config.silence.paddingSec !== undefined && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPipelineConfig({
                                      silence: {
                                        ...config.silence,
                                        paddingSec: undefined,
                                      },
                                    })
                                  }
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                  disabled={isStepRunning}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Espacio adicional antes/despues de cada segmento
                            </p>
                          </div>
                        )}

                        {/* Effects analysis panel */}
                        {step.key === "effects-analysis" &&
                          pipelineState["effects-analysis"] && (
                            <EffectsAnalysisPanel videoId={selectedVideo.id} />
                          )}

                        {/* Step results display */}
                        {stepResult && (
                          <StepResultDisplay
                            step={step.key}
                            result={stepResult}
                            selectedVideo={selectedVideo}
                            preselectionLog={preselectionLog}
                          />
                        )}

                        {/* Command preview (collapsed if result exists) */}
                        {!stepResult && (
                          <div>
                            <label className="text-sm font-medium">
                              Comando equivalente
                            </label>
                            <pre className="mt-2 p-4 bg-muted rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                              {getStepCommand(step.key)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function ZapIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    </svg>
  );
}

function LoaderIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 21h5v-5" />
    </svg>
  );
}

function FastForwardIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polygon points="13 19 22 12 13 5 13 19" />
      <polygon points="2 19 11 12 2 5 2 19" />
    </svg>
  );
}

function StepResultDisplay({
  step,
  result,
  selectedVideo,
  preselectionLog,
}: {
  step: PipelineStep;
  result: StepResult;
  selectedVideo?: Video | null;
  preselectionLog?: PreselectionLog | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const renderSummary = () => {
    switch (step) {
      case "silences": {
        const r = result as SilencesResult;
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Silencios:</span>
              <span className="ml-2 font-medium">{r.silences.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Duracion:</span>
              <span className="ml-2 font-medium">
                {r.videoDuration.toFixed(2)}s
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Threshold:</span>
              <span className="ml-2 font-medium">{r.config.thresholdDb}dB</span>
            </div>
            <div>
              <span className="text-muted-foreground">Min duracion:</span>
              <span className="ml-2 font-medium">
                {r.config.minDurationSec}s
              </span>
            </div>
          </div>
        );
      }
      case "segments": {
        const r = result as SegmentsResult;
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Segmentos:</span>
                <span className="ml-2 font-medium">{r.segments.length}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Original:</span>
                <span className="ml-2 font-medium">
                  {r.totalDuration.toFixed(2)}s
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Editado:</span>
                <span className="ml-2 font-medium">
                  {r.editedDuration.toFixed(2)}s
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Ahorro:</span>
                <span className="ml-2 font-medium text-green-600">
                  {r.percentSaved.toFixed(1)}%
                </span>
              </div>
              {r.config?.usedSemanticAnalysis && (
                <div className="col-span-full">
                  <span className="inline-flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                    <svg
                      className="w-3 h-3"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Cortes respetan limites de oraciones del guion
                  </span>
                </div>
              )}
            </div>
            {selectedVideo && (
              <SegmentEditorPanel
                videoId={selectedVideo.id}
                videoPath={`${API_URL}/api/stream/videos/${selectedVideo.filename}`}
                segments={r.segments}
                totalDuration={r.totalDuration}
                preselection={r.preselection}
                preselectionLog={preselectionLog ?? undefined}
              />
            )}
          </div>
        );
      }
      case "cut": {
        const r = result as CutResult;
        const videoUrl = r.outputPath
          ? `${API_URL}/api/stream/${r.outputPath.replace(/^public\//, "")}`
          : null;
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Segmentos:</span>
                <span className="ml-2 font-medium">
                  {r.segmentsCount ?? "N/A"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">
                  Duracion original:
                </span>
                <span className="ml-2 font-medium">
                  {r.originalDuration?.toFixed(2) ?? "N/A"}s
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Duracion final:</span>
                <span className="ml-2 font-medium">
                  {r.editedDuration?.toFixed(2) ?? "N/A"}s
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm">
                <span className="text-muted-foreground">Output:</span>
                <span className="ml-2 font-mono text-xs">
                  {r.outputPath ?? "N/A"}
                </span>
              </div>
              {videoUrl && (
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <PlayIcon className="w-4 h-4" />
                  Ver video
                </a>
              )}
            </div>
          </div>
        );
      }
      case "captions": {
        const r = result as CaptionsResult;
        return (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Captions:</span>
              <span className="ml-2 font-medium">{r.captionsCount}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Archivo:</span>
              <span className="ml-2 font-mono text-xs">{r.captionsPath}</span>
            </div>
          </div>
        );
      }
      case "effects-analysis": {
        const r = result as EffectsAnalysisResultMeta;
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Tema:</span>
                <span className="ml-2 font-medium">{r.mainTopic}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Tono:</span>
                <span className="ml-2 font-medium">{r.overallTone}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Palabras:</span>
                <span className="ml-2 font-medium">{r.wordCount}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Tiempo:</span>
                <span className="ml-2 font-medium">
                  {(r.processingTimeMs / 1000).toFixed(1)}s
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {r.topicKeywords.slice(0, 8).map((kw, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {kw}
                </Badge>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">
              Modelo: {r.model} | Idioma: {r.language.toUpperCase()}
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-muted/50 border-border">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-primary">Resultado</h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="text-xs"
        >
          {expanded ? "Ocultar JSON" : "Ver JSON"}
        </Button>
      </div>
      {renderSummary()}
      {expanded && (
        <pre className="mt-4 p-3 bg-background rounded border text-xs font-mono overflow-auto max-h-64">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
