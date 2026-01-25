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
import { VideoSidebarSkeleton } from "@/components/VideoSidebarSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { PipelineResetActions } from "@/components/PipelineResetActions";
import {
  ProcessingStatusPanel,
  ProcessingStatusInline,
  type ProcessingStepInfo,
  type ProcessingStatus,
} from "@/components/ProcessingStatusPanel";

const API_URL = "http://localhost:3003";

interface ProcessProgress {
  step: string;
  progress: number;
  message: string;
}

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
  | "take-selection"
  | "rendered";

interface PipelineState {
  raw: boolean;
  silences: boolean;
  segments: boolean;
  cut: boolean;
  captions: boolean;
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

function getVideoPipelineState(video: Video, hasTakeSelections?: boolean): PipelineState {
  // In a real implementation, this would check actual files on disk
  // For now, we derive state from available metadata
  return {
    raw: true, // Video exists if it's in the manifest
    silences: video.hasCaptions, // Assume silences were detected if captions exist
    segments: video.hasCaptions,
    cut: false, // Would check for _cut.mp4 file
    captions: video.hasCaptions,
    "take-selection": hasTakeSelections ?? false, // Has user made take selections
    rendered: false, // Would check for _final.mp4 file
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

  // Pipeline config from persistent store
  const config = useWorkspaceStore((state) => state.pipelineConfig);
  const setPipelineConfig = useWorkspaceStore((state) => state.setPipelineConfig);
  const takeSelections = useWorkspaceStore((state) => state.takeSelections);

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

  useEffect(() => {
    fetch("/videos.manifest.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load video manifest");
        return res.json() as Promise<VideoManifest>;
      })
      .then((data) => {
        setVideos(data.videos);
        if (data.videos.length > 0) {
          setSelectedVideo(data.videos[0]);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
        toast.error("Error loading videos", {
          description: err.message,
        });
      });
  }, []);

  const pipelineState = useMemo(() => {
    if (!selectedVideo) return null;
    const hasTakeSelections = selectedVideo.id in takeSelections &&
      Object.keys(takeSelections[selectedVideo.id]?.selections || {}).length > 0;
    return getVideoPipelineState(selectedVideo, hasTakeSelections);
  }, [selectedVideo, takeSelections]);

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
              <PipelineResetActions videoId={selectedVideo.id} disabled={isProcessing} />
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
              const state = getVideoPipelineState(video, hasTakes);
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

                {STEPS.map((step) => (
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
                            </CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                              {step.description}
                            </p>
                          </div>
                          {step.key !== "raw" && !pipelineState[step.key] && (
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
                      </CardHeader>
                      <CardContent>
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
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                  Espacio adicional antes/después de cada
                                  segmento
                                </p>
                              </div>
                            )}

                            {/* Command preview */}
                            <div>
                              <label className="text-sm font-medium">
                                Comando
                              </label>
                              <pre className="mt-2 p-4 bg-muted rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                                {getStepCommand(step.key)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                ))}
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
