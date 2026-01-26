import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import type { Video } from "@/components/VideoList";
import { useWorkspaceStore } from "@/store/workspace";
import { useTimelineStore } from "@/store/timeline";
import { ScriptAlignmentPanel } from "@/components/ScriptAlignmentPanel";
import { TakeDetectionPanel } from "@/components/TakeDetectionPanel";
import type { Caption } from "@/core/script/align";
import { VideoSidebarSkeleton } from "@/components/VideoSidebarSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { PipelineResetActions } from "@/components/PipelineResetActions";
import {
  ProcessingStatusPanel,
  ProcessingStatusInline,
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
  segments: Array<{ startTime: number; endTime: number; duration: number; index: number }>;
  totalDuration: number;
  editedDuration: number;
  timeSaved: number;
  percentSaved: number;
  config: { paddingSec: number };
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

type StepResult = SilencesResult | SegmentsResult | CutResult | CaptionsResult;

// Step dependencies
const STEP_DEPENDENCIES: Record<PipelineStep, PipelineStep[]> = {
  raw: [],
  silences: [],
  segments: ["silences"],
  cut: ["segments"],
  captions: ["cut"],
  script: ["captions"],
  "take-selection": ["captions"],
  rendered: ["take-selection"],
};

export const Route = createFileRoute("/pipeline")({
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
  | "script"
  | "take-selection"
  | "rendered";

interface PipelineState {
  raw: boolean;
  silences: boolean;
  segments: boolean;
  cut: boolean;
  captions: boolean;
  script: boolean;
  "take-selection": boolean;
  rendered: boolean;
}


const STEPS: { key: PipelineStep; label: string; description: string }[] = [
  { key: "raw", label: "Raw", description: "Video original importado" },
  {
    key: "silences",
    label: "Silencios",
    description: "Detectar silencios con FFmpeg",
  },
  {
    key: "segments",
    label: "Segmentos",
    description: "Generar segmentos de contenido",
  },
  { key: "cut", label: "Cortado", description: "Cortar video sin silencios" },
  {
    key: "captions",
    label: "Captions",
    description: "Transcripción con Whisper",
  },
  {
    key: "script",
    label: "Script",
    description: "Importar guión y alinear con transcripción",
  },
  {
    key: "take-selection",
    label: "Tomas",
    description: "Seleccionar mejores tomas de frases repetidas",
  },
  {
    key: "rendered",
    label: "Renderizado",
    description: "Video final con subtítulos",
  },
];

function getVideoPipelineState(
  video: Video,
  hasTakeSelections?: boolean,
  hasScriptEvents?: boolean,
  backendStatus?: BackendPipelineStatus | null
): PipelineState {
  // Use backend status if available, otherwise derive from video metadata
  if (backendStatus) {
    return {
      raw: true,
      silences: backendStatus.steps.silences?.status === "completed",
      segments: backendStatus.steps.segments?.status === "completed",
      cut: backendStatus.steps.cut?.status === "completed",
      captions: backendStatus.steps.captions?.status === "completed" || video.hasCaptions,
      script: hasScriptEvents ?? false,
      "take-selection": hasTakeSelections ?? false,
      rendered: false,
    };
  }

  // Fallback: derive state from available metadata
  return {
    raw: true,
    silences: video.hasCaptions,
    segments: video.hasCaptions,
    cut: false,
    captions: video.hasCaptions,
    script: hasScriptEvents ?? false,
    "take-selection": hasTakeSelections ?? false,
    rendered: false,
  };
}

function getCompletedSteps(state: PipelineState): number {
  return Object.values(state).filter(Boolean).length;
}

function pipelineStateToStepInfo(
  state: PipelineState,
  currentProcessingStep?: string
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
      // In the future, timestamps can be added when the backend provides them
      completedAt: state[step.key] ? new Date() : undefined,
    };
  });
}

function PipelinePage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [activeStep, setActiveStep] = useState<PipelineStep>("raw");

  // Auto-process state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState<ProcessProgress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Individual step execution state
  const [backendStatus, setBackendStatus] = useState<BackendPipelineStatus | null>(null);
  const [stepProcessing, setStepProcessing] = useState<PipelineStep | null>(null);
  const [stepProgress, setStepProgress] = useState<ProcessProgress | null>(null);
  const [stepResults, setStepResults] = useState<Record<string, StepResult>>({});

  // Pipeline config from persistent store
  const config = useWorkspaceStore((state) => state.pipelineConfig);
  const setPipelineConfig = useWorkspaceStore((state) => state.setPipelineConfig);
  const takeSelections = useWorkspaceStore((state) => state.takeSelections);
  const timelines = useTimelineStore((state) => state.timelines);

  // Captions state for script alignment
  const [captions, setCaptions] = useState<Caption[]>([]);

  // Load result of a specific step
  const loadStepResult = useCallback(async (videoId: string, step: PipelineStep) => {
    try {
      const res = await fetch(
        `${API_URL}/api/pipeline/result?videoId=${encodeURIComponent(videoId)}&step=${step}`
      );
      if (res.ok) {
        const result = await res.json() as StepResult;
        setStepResults((prev) => ({ ...prev, [step]: result }));
      }
    } catch (err) {
      console.error(`Error loading ${step} result:`, err);
    }
  }, []);

  // Load backend pipeline status
  const loadPipelineStatus = useCallback(async (videoId: string, filename: string) => {
    try {
      const res = await fetch(
        `${API_URL}/api/pipeline/status?videoId=${encodeURIComponent(videoId)}&filename=${encodeURIComponent(filename)}`
      );
      if (res.ok) {
        const status = await res.json() as BackendPipelineStatus;
        setBackendStatus(status);

        // Load results for completed steps
        const completedSteps = Object.entries(status.steps)
          .filter(([, state]) => state.status === "completed")
          .map(([step]) => step as PipelineStep);

        for (const step of completedSteps) {
          loadStepResult(videoId, step);
        }
      }
    } catch (err) {
      console.error("Error loading pipeline status:", err);
    }
  }, [loadStepResult]);

  // Check if a step can be executed
  const canExecuteStepCheck = useCallback((step: PipelineStep, state: PipelineState): { canExecute: boolean; missingDeps: PipelineStep[] } => {
    const deps = STEP_DEPENDENCIES[step];
    const missingDeps = deps.filter((dep) => !state[dep]);
    return { canExecute: missingDeps.length === 0, missingDeps };
  }, []);

  // Execute a single pipeline step
  const executeStep = useCallback(async (step: PipelineStep) => {
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
            thresholdDb: config.thresholdDb,
            minDurationSec: config.minDurationSec,
            paddingSec: config.paddingSec,
          },
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
                // Reload pipeline status
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
  }, [selectedVideo, stepProcessing, config, loadPipelineStatus]);

  // Execute all steps up to and including the target step
  const executeUntilStep = useCallback(async (targetStep: PipelineStep) => {
    if (!selectedVideo || stepProcessing) return;

    const videoId = selectedVideo.id;
    const filename = selectedVideo.filename;

    // Define the order of executable steps
    const executableSteps: PipelineStep[] = ["silences", "segments", "cut", "captions"];
    const targetIndex = executableSteps.indexOf(targetStep);

    if (targetIndex === -1) return;

    // Get current status to check which steps need execution
    const currentStatus = backendStatus;

    // Get steps to execute (from beginning up to and including target)
    const stepsToExecute = executableSteps.slice(0, targetIndex + 1).filter((step) => {
      const stepState = currentStatus?.steps[step];
      return stepState?.status !== "completed";
    });

    if (stepsToExecute.length === 0) {
      toast.info("Todos los pasos ya están completados");
      return;
    }

    // Execute each step sequentially
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
              thresholdDb: config.thresholdDb,
              minDurationSec: config.minDurationSec,
              paddingSec: config.paddingSec,
            },
          }),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || `Error al ejecutar ${step}`);
        }

        // Read SSE stream
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
                  setStepResults((prev) => ({ ...prev, [step]: data.result }));
                  stepCompleted = true;
                  break;
                case "error":
                  throw new Error(data.error);
              }
            }
          }
        }

        if (!stepCompleted) {
          throw new Error(`Paso ${step} no se completó correctamente`);
        }

        // Reload pipeline status after each step
        await loadPipelineStatus(videoId, filename);

      } catch (err) {
        toast.error(`Error en ${step}`, {
          description: err instanceof Error ? err.message : "Error desconocido",
        });
        setStepProcessing(null);
        setStepProgress(null);
        return; // Stop execution on error
      }
    }

    toast.success("Ejecución completada", {
      description: `Se ejecutaron ${stepsToExecute.length} paso(s) correctamente`,
    });
    setStepProcessing(null);
    setStepProgress(null);
  }, [selectedVideo, stepProcessing, config, loadPipelineStatus, backendStatus]);

  // Load pipeline status when video changes
  useEffect(() => {
    if (selectedVideo) {
      setBackendStatus(null);
      setStepResults({});
      loadPipelineStatus(selectedVideo.id, selectedVideo.filename);
    }
  }, [selectedVideo, loadPipelineStatus]);

  // Load captions when video changes (for script alignment)
  useEffect(() => {
    if (!selectedVideo) {
      setCaptions([]);
      return;
    }

    const loadCaptions = async () => {
      try {
        const captionsPath = `/subs/${selectedVideo.id}-cut.json`;
        const res = await fetch(captionsPath);
        if (res.ok) {
          const data = await res.json();
          setCaptions(data);
        } else {
          setCaptions([]);
        }
      } catch {
        setCaptions([]);
      }
    };

    loadCaptions();
  }, [selectedVideo]);

  // Start auto-processing
  const startAutoProcess = useCallback(async () => {
    if (!selectedVideo || isProcessing) return;

    setIsProcessing(true);
    setProcessProgress({ step: "starting", progress: 0, message: "Iniciando..." });

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

  // Load videos from manifest - extracted to allow refresh after reset
  const loadVideos = useCallback(async (isInitialLoad = false) => {
    try {
      // Add cache-busting timestamp to ensure fresh data after resets
      const res = await fetch(`/videos.manifest.json?t=${Date.now()}`);
      if (!res.ok) throw new Error("Failed to load video manifest");
      const data = (await res.json()) as VideoManifest;

      setVideos(data.videos);

      // On initial load, select first video; on refresh, update selected video data
      if (isInitialLoad && data.videos.length > 0) {
        setSelectedVideo(data.videos[0]);
      } else if (selectedVideo) {
        // Update selectedVideo with fresh data from manifest
        const updated = data.videos.find((v) => v.id === selectedVideo.id);
        if (updated) {
          setSelectedVideo(updated);
        }
      }

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
  }, [selectedVideo]);

  // Refresh callback for reset actions
  const handleRefresh = useCallback(() => {
    loadVideos(false);
  }, [loadVideos]);

  useEffect(() => {
    loadVideos(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pipelineState = useMemo(() => {
    if (!selectedVideo) return null;
    const hasTakeSelections = selectedVideo.id in takeSelections &&
      Object.keys(takeSelections[selectedVideo.id]?.selections || {}).length > 0;
    const timeline = timelines[selectedVideo.id];
    const hasScriptEvents = timeline &&
      (timeline.zooms.length > 0 || timeline.highlights.length > 0);
    return getVideoPipelineState(selectedVideo, hasTakeSelections, hasScriptEvents, backendStatus);
  }, [selectedVideo, takeSelections, timelines, backendStatus]);

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

  const getStepCommand = (step: PipelineStep): string => {
    if (!selectedVideo) return "";
    const videoPath = `public/videos/${selectedVideo.filename}`;

    switch (step) {
      case "silences":
        return `# Detectar silencios en el video
bun run src/core/silence/detect.ts "${videoPath}" \\
  --threshold ${config.thresholdDb} \\
  --min-duration ${config.minDurationSec}`;
      case "segments":
        return `# Generar segmentos de contenido
bun run src/core/silence/segments.ts "${videoPath}" \\
  --padding ${config.paddingSec}`;
      case "cut":
        return `# Cortar video (remover silencios)
bun run src/core/cut/index.ts "${videoPath}" \\
  --output "public/videos/${selectedVideo.id}_cut.mp4"`;
      case "captions":
        return `# Generar captions con Whisper
bun run create-subtitles "${videoPath}"`;
      case "rendered":
        return `# Renderizar video final con Remotion
bunx remotion render src/index.ts CaptionedVideo \\
  --props='{"videoSrc":"${selectedVideo.filename}"}' \\
  out/${selectedVideo.id}_final.mp4`;
      default:
        return "# Video ya importado";
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <Skeleton className="h-4 w-16" />
            </CardHeader>
            <CardContent>
              <VideoSidebarSkeleton count={3} />
            </CardContent>
          </Card>
          <div className="lg:col-span-3">
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
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Pipeline Dashboard</h1>
        <div className="flex items-center gap-3">
          {selectedVideo && (
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
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Video Selector */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Videos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {videos.map((video) => {
              const hasTakes = video.id in takeSelections &&
                Object.keys(takeSelections[video.id]?.selections || {}).length > 0;
              const videoTimeline = timelines[video.id];
              const hasScriptEvts = videoTimeline &&
                (videoTimeline.zooms.length > 0 || videoTimeline.highlights.length > 0);
              // Use backendStatus for the selected video
              const videoBackendStatus = selectedVideo?.id === video.id ? backendStatus : null;
              const state = getVideoPipelineState(video, hasTakes, hasScriptEvts, videoBackendStatus);
              const completed = getCompletedSteps(state);
              const videoStepInfo = pipelineStateToStepInfo(state);
              return (
                <button
                  key={video.id}
                  onClick={() => setSelectedVideo(video)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedVideo?.id === video.id
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:bg-muted"
                  }`}
                >
                  <div className="font-medium text-sm truncate">
                    {video.title}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <Progress value={(completed / STEPS.length) * 100} className="h-1 flex-1" />
                    <ProcessingStatusInline steps={videoStepInfo} />
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Pipeline Steps */}
        <div className="lg:col-span-3 space-y-6">
          {selectedVideo && pipelineState && (
            <>
              {/* Auto-Process Progress */}
              {isProcessing && processProgress && (
                <Card className="border-green-500/50 bg-green-500/5">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3 mb-3">
                      <LoaderIcon className="w-5 h-5 animate-spin text-green-600" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-green-700">
                          Procesando automáticamente...
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {processProgress.message}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-green-600 border-green-500">
                        {processProgress.progress}%
                      </Badge>
                    </div>
                    <Progress value={processProgress.progress} className="h-2" />
                  </CardContent>
                </Card>
              )}

              {/* Progress Overview */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex-1">
                      <div className="text-sm font-medium mb-2">
                        {selectedVideo.title}
                      </div>
                      <Progress value={progressPercent} />
                    </div>
                  </div>
                  {/* Visual Processing Status Indicators */}
                  <ProcessingStatusPanel steps={stepInfoList} />
                </CardContent>
              </Card>

              {/* Pipeline Tabs */}
              <Tabs
                value={activeStep}
                onValueChange={(v) => setActiveStep(v as PipelineStep)}
              >
                <TabsList className="w-full justify-start">
                  {STEPS.map((step) => (
                    <TabsTrigger
                      key={step.key}
                      value={step.key}
                      className="flex items-center gap-1"
                    >
                      {pipelineState[step.key] ? (
                        <CheckIcon className="w-3 h-3 text-green-600" />
                      ) : (
                        <CircleIcon className="w-3 h-3" />
                      )}
                      {step.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {STEPS.map((step) => {
                  const isExecutableStep = ["silences", "segments", "cut", "captions"].includes(step.key);
                  const { canExecute, missingDeps } = canExecuteStepCheck(step.key, pipelineState);
                  const isStepRunning = stepProcessing === step.key;
                  const stepResult = stepResults[step.key];

                  return (
                  <TabsContent key={step.key} value={step.key}>
                    <Card>
                      <CardHeader>
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
                              {backendStatus?.steps[step.key as keyof typeof backendStatus.steps]?.status === "error" && (
                                <Badge variant="destructive">Error</Badge>
                              )}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                              {step.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Execute buttons for executable steps */}
                            {isExecutableStep && (
                              <>
                                {!canExecute && missingDeps.length > 0 && !stepProcessing && (
                                  <span className="text-xs text-muted-foreground">
                                    Requiere: {missingDeps.join(", ")}
                                  </span>
                                )}
                                {/* Execute until here button - show if there are previous steps */}
                                {step.key !== "silences" && (
                                  <Button
                                    onClick={() => executeUntilStep(step.key)}
                                    disabled={isStepRunning || isProcessing || !!stepProcessing}
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
                                        Ejecutar hasta aquí
                                      </>
                                    )}
                                  </Button>
                                )}
                                {/* Single step execute button */}
                                <Button
                                  onClick={() => executeStep(step.key)}
                                  disabled={!canExecute || isStepRunning || isProcessing || !!stepProcessing}
                                  variant={pipelineState[step.key] ? "outline" : "default"}
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
                            {step.key !== "raw" && !pipelineState[step.key] && !isExecutableStep && (
                              <Button
                                onClick={() => {
                                  navigator.clipboard.writeText(
                                    getStepCommand(step.key)
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
                      <CardContent>
                        {/* Step progress indicator */}
                        {isStepRunning && stepProgress && (
                          <div className="mb-4 p-4 border rounded-lg bg-blue-50 border-blue-200">
                            <div className="flex items-center gap-3 mb-2">
                              <LoaderIcon className="w-4 h-4 animate-spin text-blue-600" />
                              <span className="text-sm font-medium text-blue-700">
                                {stepProgress.message}
                              </span>
                              <Badge variant="outline" className="ml-auto text-blue-600 border-blue-300">
                                {stepProgress.progress}%
                              </Badge>
                            </div>
                            <Progress value={stepProgress.progress} className="h-2" />
                          </div>
                        )}

                        {step.key === "raw" ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-4 text-sm">
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
                                  Tamaño:
                                </span>
                                <span className="ml-2">
                                  {formatFileSize(selectedVideo.size)}
                                </span>
                              </div>
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
                                  <Input
                                    type="number"
                                    value={config.thresholdDb}
                                    onChange={(e) =>
                                      setPipelineConfig({
                                        thresholdDb: Number(e.target.value),
                                      })
                                    }
                                    className="mt-1"
                                    disabled={isStepRunning}
                                  />
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Nivel de ruido para detectar silencio
                                    (-60 a -20)
                                  </p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">
                                    Duración mínima (seg)
                                  </label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    value={config.minDurationSec}
                                    onChange={(e) =>
                                      setPipelineConfig({
                                        minDurationSec: Number(e.target.value),
                                      })
                                    }
                                    className="mt-1"
                                    disabled={isStepRunning}
                                  />
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Mínimo de segundos para considerar silencio
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
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={config.paddingSec}
                                  onChange={(e) =>
                                    setPipelineConfig({
                                      paddingSec: Number(e.target.value),
                                    })
                                  }
                                  className="mt-1"
                                  disabled={isStepRunning}
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                  Espacio adicional antes/después de cada
                                  segmento
                                </p>
                              </div>
                            )}

                            {/* Script alignment panel */}
                            {step.key === "script" && (
                              <ScriptAlignmentPanel
                                videoId={selectedVideo.id}
                                captions={captions}
                                cutFilename={(() => {
                                  // Extract base name from cut video output path
                                  const cutResult = stepResults.cut as CutResult | undefined;
                                  if (cutResult?.outputPath) {
                                    // outputPath is like "public/videos/name-cut.mp4"
                                    const match = cutResult.outputPath.match(/([^/]+)\.(mp4|mkv|mov|webm)$/i);
                                    return match ? match[1] : undefined;
                                  }
                                  return undefined;
                                })()}
                              />
                            )}

                            {/* Take detection panel */}
                            {step.key === "take-selection" && (
                              <TakeDetectionPanel
                                videoId={selectedVideo.id}
                                captions={captions}
                              />
                            )}

                            {/* Step results display */}
                            {stepResult && (
                              <StepResultDisplay step={step.key} result={stepResult} />
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
            </>
          )}

          {!selectedVideo && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Selecciona un video para ver su pipeline
              </CardContent>
            </Card>
          )}
        </div>
      </div>
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

function CheckIcon({ className }: { className?: string }) {
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
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CircleIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
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

function StepResultDisplay({ step, result }: { step: PipelineStep; result: StepResult }) {
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
              <span className="ml-2 font-medium">{r.videoDuration.toFixed(2)}s</span>
            </div>
            <div>
              <span className="text-muted-foreground">Threshold:</span>
              <span className="ml-2 font-medium">{r.config.thresholdDb}dB</span>
            </div>
            <div>
              <span className="text-muted-foreground">Min duracion:</span>
              <span className="ml-2 font-medium">{r.config.minDurationSec}s</span>
            </div>
          </div>
        );
      }
      case "segments": {
        const r = result as SegmentsResult;
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Segmentos:</span>
              <span className="ml-2 font-medium">{r.segments.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Original:</span>
              <span className="ml-2 font-medium">{r.totalDuration.toFixed(2)}s</span>
            </div>
            <div>
              <span className="text-muted-foreground">Editado:</span>
              <span className="ml-2 font-medium">{r.editedDuration.toFixed(2)}s</span>
            </div>
            <div>
              <span className="text-muted-foreground">Ahorro:</span>
              <span className="ml-2 font-medium text-green-600">{r.percentSaved.toFixed(1)}%</span>
            </div>
          </div>
        );
      }
      case "cut": {
        const r = result as CutResult;
        // Remove "public/" prefix from outputPath for the URL
        const videoUrl = r.outputPath ? `/${r.outputPath.replace(/^public\//, "")}` : null;
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Segmentos:</span>
                <span className="ml-2 font-medium">{r.segmentsCount ?? "N/A"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Duracion original:</span>
                <span className="ml-2 font-medium">{r.originalDuration?.toFixed(2) ?? "N/A"}s</span>
              </div>
              <div>
                <span className="text-muted-foreground">Duracion final:</span>
                <span className="ml-2 font-medium">{r.editedDuration?.toFixed(2) ?? "N/A"}s</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm">
                <span className="text-muted-foreground">Output:</span>
                <span className="ml-2 font-mono text-xs">{r.outputPath ?? "N/A"}</span>
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
