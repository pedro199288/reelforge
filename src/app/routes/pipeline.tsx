import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import type { Video } from "@/components/VideoList";

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
  | "rendered";

interface PipelineState {
  raw: boolean;
  silences: boolean;
  segments: boolean;
  cut: boolean;
  captions: boolean;
  rendered: boolean;
}

interface PipelineConfig {
  thresholdDb: number;
  minDurationSec: number;
  paddingSec: number;
}

const DEFAULT_CONFIG: PipelineConfig = {
  thresholdDb: -40,
  minDurationSec: 0.5,
  paddingSec: 0.05,
};

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
    key: "rendered",
    label: "Renderizado",
    description: "Video final con subtítulos",
  },
];

function getVideoPipelineState(video: Video): PipelineState {
  // In a real implementation, this would check actual files on disk
  // For now, we derive state from available metadata
  return {
    raw: true, // Video exists if it's in the manifest
    silences: video.hasCaptions, // Assume silences were detected if captions exist
    segments: video.hasCaptions,
    cut: false, // Would check for _cut.mp4 file
    captions: video.hasCaptions,
    rendered: false, // Would check for _final.mp4 file
  };
}

function getCompletedSteps(state: PipelineState): number {
  return Object.values(state).filter(Boolean).length;
}

function PipelinePage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [config, setConfig] = useState<PipelineConfig>(DEFAULT_CONFIG);
  const [activeStep, setActiveStep] = useState<PipelineStep>("raw");

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
      });
  }, []);

  const pipelineState = useMemo(() => {
    if (!selectedVideo) return null;
    return getVideoPipelineState(selectedVideo);
  }, [selectedVideo]);

  const progressPercent = useMemo(() => {
    if (!pipelineState) return 0;
    return Math.round((getCompletedSteps(pipelineState) / STEPS.length) * 100);
  }, [pipelineState]);

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
      <div className="p-6">
        <p className="text-muted-foreground">Cargando videos...</p>
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
        {selectedVideo && (
          <Badge variant="outline" className="text-sm">
            {progressPercent}% completado
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Video Selector */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Videos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {videos.map((video) => {
              const state = getVideoPipelineState(video);
              const completed = getCompletedSteps(state);
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
                  <div className="flex items-center gap-2 mt-1">
                    <Progress value={(completed / STEPS.length) * 100} className="h-1 flex-1" />
                    <span className="text-xs text-muted-foreground">
                      {completed}/{STEPS.length}
                    </span>
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
                  <div className="flex gap-2 flex-wrap">
                    {STEPS.map((step) => (
                      <Badge
                        key={step.key}
                        variant={
                          pipelineState[step.key] ? "default" : "outline"
                        }
                        className={
                          pipelineState[step.key]
                            ? "bg-green-600"
                            : "text-muted-foreground"
                        }
                      >
                        {pipelineState[step.key] ? (
                          <CheckIcon className="w-3 h-3 mr-1" />
                        ) : (
                          <CircleIcon className="w-3 h-3 mr-1" />
                        )}
                        {step.label}
                      </Badge>
                    ))}
                  </div>
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
                                      setConfig((c) => ({
                                        ...c,
                                        thresholdDb: Number(e.target.value),
                                      }))
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
                                      setConfig((c) => ({
                                        ...c,
                                        minDurationSec: Number(e.target.value),
                                      }))
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
                                    setConfig((c) => ({
                                      ...c,
                                      paddingSec: Number(e.target.value),
                                    }))
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
