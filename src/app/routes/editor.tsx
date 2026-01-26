import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Wand2,
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  Crosshair,
  RotateCcw,
  Eye,
  Scissors,
} from "lucide-react";
import type { Video } from "@/components/VideoList";
import { TimelineTrack } from "@/components/Timeline/TimelineTrack";
import { TimelineRuler } from "@/components/Timeline/TimelineRuler";
import { TimelinePlayhead } from "@/components/Timeline/TimelinePlayhead";
import { SegmentTrack } from "@/components/Timeline/SegmentTrack";
import { Waveform, WaveformPlaceholder } from "@/components/Timeline/Waveform";
import { useWaveform } from "@/hooks/useWaveform";
import { downsampleWaveform } from "@/core/audio/waveform";
import {
  useTimelineStore,
  usePlayhead,
  useIsPlaying,
  useTimelineZoomLevel,
  useViewportStart,
  useTimelineSelection,
  useVideoSegments,
  useVideoSilences,
} from "@/store/timeline";
import { useScript } from "@/store/workspace";
import { analyzeSemanticCuts, semanticToSegments, getSemanticStats } from "@/core/semantic";
import type { Caption } from "@/core/script/align";

interface VideoManifest {
  videos: Video[];
}

interface SilenceDetectionParams {
  thresholdDb: number;
  minDurationSec: number;
}

type CutMode = "silence" | "semantic";

export const Route = createFileRoute("/editor")({
  component: EditorPage,
  validateSearch: (search: Record<string, unknown>) => ({
    videoId: (search.videoId as string) || undefined,
  }),
});

function EditorPage() {
  const { videoId } = Route.useSearch();
  const navigate = useNavigate();

  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [viewMode, setViewMode] = useState<"original" | "edited">("original");
  const [detectionParams, setDetectionParams] = useState<SilenceDetectionParams>({
    thresholdDb: -40,
    minDurationSec: 0.5,
  });
  const [cutMode, setCutMode] = useState<CutMode>("silence");
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [semanticStats, setSemanticStats] = useState<{
    sentenceCount: number;
    semanticCutCount: number;
    naturalPauseCount: number;
  } | null>(null);

  // Refs
  const contentRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Refs to prevent sync loops
  const isSyncingFromVideo = useRef(false);
  const isSyncingToVideo = useRef(false);

  // Waveform data
  const videoPath = selectedVideo ? `public/${selectedVideo.filename}` : null;
  const { data: waveformData, loading: waveformLoading } = useWaveform(videoPath, {
    samplesPerSecond: 200,
  });

  // Store state
  const playheadMs = usePlayhead();
  const isPlaying = useIsPlaying();
  const zoomLevel = useTimelineZoomLevel();
  const viewportStartMs = useViewportStart();
  const selection = useTimelineSelection();
  const segments = useVideoSegments(selectedVideo?.id ?? "");
  const silences = useVideoSilences(selectedVideo?.id ?? "");
  const scriptState = useScript(selectedVideo?.id ?? "");

  // Store actions
  const {
    setPlayhead,
    togglePlayback,
    setZoomLevel,
    scrollTo,
    zoomIn,
    zoomOut,
    fitToView,
    setActiveVideo,
    select,
    importSilences,
    importSemanticSegments,
    toggleSegment,
    resizeSegment,
    clearSegments,
  } = useTimelineStore();

  // Set active video on mount
  useEffect(() => {
    if (selectedVideo) {
      setActiveVideo(selectedVideo.id);
    }
    return () => setActiveVideo(null);
  }, [selectedVideo, setActiveVideo]);

  // Load captions for selected video
  useEffect(() => {
    if (!selectedVideo) {
      setCaptions([]);
      return;
    }

    const basename = selectedVideo.filename.replace(/\.[^/.]+$/, "");
    fetch(`/videos/${basename}.json`)
      .then((res) => {
        if (!res.ok) throw new Error("No captions found");
        return res.json() as Promise<Caption[]>;
      })
      .then((data) => {
        setCaptions(data);
      })
      .catch(() => {
        setCaptions([]);
      });
  }, [selectedVideo]);

  // Load video manifest
  useEffect(() => {
    fetch("/videos.manifest.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load video manifest");
        return res.json() as Promise<VideoManifest>;
      })
      .then((data) => {
        setVideos(data.videos);

        if (videoId) {
          const found = data.videos.find((v) => v.id === videoId);
          if (found) setSelectedVideo(found);
        } else if (data.videos.length > 0) {
          setSelectedVideo(data.videos[0]);
        }

        setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        toast.error("Error cargando videos", {
          description: err.message,
        });
      });
  }, [videoId]);

  // Load video duration
  useEffect(() => {
    if (!selectedVideo) {
      setVideoDuration(null);
      return;
    }

    const video = document.createElement("video");
    video.src = `/${selectedVideo.filename}`;
    video.onloadedmetadata = () => {
      setVideoDuration(video.duration);
    };
    video.onerror = () => {
      setVideoDuration(60);
    };
  }, [selectedVideo]);

  // Sync video playback with timeline
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoDuration) return;

    const handleTimeUpdate = () => {
      // Mark that this update is coming from the video
      isSyncingFromVideo.current = true;
      const ms = video.currentTime * 1000;
      setPlayhead(ms);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [videoDuration, setPlayhead]);

  // Sync timeline playhead to video (only when NOT playing)
  // During playback, the video is the source of truth and updates the store
  // This effect only handles manual seeks from timeline UI
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoDuration) return;

    // Skip sync during playback - video is source of truth
    if (isPlaying) return;

    // Skip if this change came from the video itself
    if (isSyncingFromVideo.current) {
      isSyncingFromVideo.current = false;
      return;
    }

    const targetTime = playheadMs / 1000;
    if (Math.abs(video.currentTime - targetTime) > 0.1) {
      isSyncingToVideo.current = true;
      video.currentTime = targetTime;
    }
  }, [playheadMs, videoDuration, isPlaying]);

  // Play/pause sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying]);

  // Handle video select
  const handleVideoSelect = useCallback(
    (video: Video) => {
      setSelectedVideo(video);
      navigate({
        to: "/editor",
        search: { videoId: video.id },
        replace: true,
      });
    },
    [navigate]
  );

  // Handle silence detection
  const handleDetectSilences = useCallback(async () => {
    if (!selectedVideo || !videoDuration) return;

    // Validate semantic mode requirements
    if (cutMode === "semantic") {
      if (!scriptState?.rawScript) {
        toast.error("Modo semántico requiere guión", {
          description: "Importa un guión en el panel de Script Alignment primero",
        });
        return;
      }
      if (captions.length === 0) {
        toast.error("Modo semántico requiere transcripción", {
          description: "Genera los captions primero con Whisper",
        });
        return;
      }
    }

    setDetecting(true);
    setSemanticStats(null);

    try {
      const response = await fetch("/api/detect-silences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoPath: selectedVideo.filename,
          thresholdDb: detectionParams.thresholdDb,
          minDurationSec: detectionParams.minDurationSec,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to detect silences");
      }

      const data = await response.json();
      const durationMs = videoDuration * 1000;

      if (cutMode === "semantic" && scriptState?.rawScript && captions.length > 0) {
        // Semantic mode: only cut between sentences
        const analysis = analyzeSemanticCuts(
          scriptState.rawScript,
          captions,
          data.silences,
          { minSilenceDurationMs: detectionParams.minDurationSec * 1000 }
        );

        const semanticSegs = semanticToSegments(analysis, durationMs);
        const stats = getSemanticStats(analysis);

        importSemanticSegments(selectedVideo.id, semanticSegs, data.silences);
        setSemanticStats(stats);

        toast.success("Cortes semánticos generados", {
          description: `${stats.semanticCutCount} cortes entre oraciones, ${stats.naturalPauseCount} pausas naturales conservadas`,
        });
      } else {
        // Standard silence mode: cut all silences
        importSilences(selectedVideo.id, data.silences, durationMs);

        toast.success("Silencios detectados", {
          description: `${data.silences.length} silencios encontrados`,
        });
      }
    } catch (error) {
      toast.error("Error detectando silencios", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setDetecting(false);
    }
  }, [selectedVideo, videoDuration, detectionParams, cutMode, scriptState, captions, importSilences, importSemanticSegments]);

  // Handle scroll
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const pxPerMs = (100 * zoomLevel) / 1000;
      const scrollLeft = e.currentTarget.scrollLeft;
      scrollTo(scrollLeft / pxPerMs);
    },
    [zoomLevel, scrollTo]
  );

  // Handle wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.8 : 1.25;
        setZoomLevel(zoomLevel * delta);
      }
    },
    [zoomLevel, setZoomLevel]
  );

  // Handle seek from ruler
  const handleSeek = useCallback(
    (ms: number) => {
      setPlayhead(ms);
    },
    [setPlayhead]
  );

  // Get viewport width
  const getViewportWidth = useCallback(() => {
    if (!contentRef.current) return 800;
    return contentRef.current.clientWidth - 80;
  }, []);

  // Calculate content dimensions
  const pxPerMs = (100 * zoomLevel) / 1000;
  const durationMs = (videoDuration ?? 0) * 1000;
  const contentWidth = durationMs * pxPerMs;

  // Calculate statistics
  const stats = useMemo(() => {
    const enabledSegments = segments.filter((s) => s.enabled);
    const keptDuration = enabledSegments.reduce((sum, s) => sum + (s.endMs - s.startMs), 0);
    const cutDuration = durationMs - keptDuration;
    const savingsPercent = durationMs > 0 ? Math.round((cutDuration / durationMs) * 100) : 0;

    return {
      segmentCount: segments.length,
      enabledCount: enabledSegments.length,
      keptDuration,
      cutDuration,
      savingsPercent,
    };
  }, [segments, durationMs]);

  if (loading) {
    return (
      <div className="h-full flex">
        <div className="flex-1 flex flex-col">
          <Skeleton className="h-12 m-4" />
          <div className="flex-1 flex items-center justify-center">
            <Skeleton className="w-80 h-[450px]" />
          </div>
          <Skeleton className="h-48 m-4" />
        </div>
        <div className="w-72 border-l">
          <Skeleton className="h-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Main editor area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 p-2 border-b bg-muted/30">
          <TooltipProvider delayDuration={300}>
            {/* Silence detection */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDetectSilences}
                  disabled={detecting || !selectedVideo}
                  className="text-purple-600 border-purple-300"
                >
                  {detecting ? (
                    <span className="animate-spin mr-2">
                      <Wand2 className="h-4 w-4" />
                    </span>
                  ) : (
                    <Wand2 className="h-4 w-4 mr-2" />
                  )}
                  Detectar Silencios
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Detectar silencios automáticamente con FFmpeg
              </TooltipContent>
            </Tooltip>

            {segments.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => selectedVideo && clearSegments(selectedVideo.id)}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Limpiar
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Limpiar segmentos detectados</TooltipContent>
              </Tooltip>
            )}

            <div className="h-4 w-px bg-border" />

            {/* View mode toggle */}
            <div className="flex items-center gap-1 bg-muted rounded-md p-1">
              <Button
                variant={viewMode === "original" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("original")}
                className="h-7 px-2"
              >
                <Eye className="h-3.5 w-3.5 mr-1" />
                Original
              </Button>
              <Button
                variant={viewMode === "edited" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("edited")}
                className="h-7 px-2"
              >
                <Scissors className="h-3.5 w-3.5 mr-1" />
                Editado
              </Button>
            </div>

            <div className="flex-1" />

            {/* Playback controls */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={togglePlayback}>
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isPlaying ? "Pausar" : "Reproducir"} (Space)
              </TooltipContent>
            </Tooltip>

            <div className="h-4 w-px bg-border" />

            {/* Zoom controls */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={zoomIn}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Acercar</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={zoomOut}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Alejar</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fitToView(durationMs)}
                >
                  <Crosshair className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ajustar a vista</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Video player area */}
        <div className="flex-1 flex items-center justify-center bg-black/90 p-4 min-h-0">
          {selectedVideo && videoDuration ? (
            <div className="relative max-w-md w-full" style={{ aspectRatio: "9/16" }}>
              {/* eslint-disable-next-line @remotion/warn-native-media-tag -- Not a Remotion composition */}
              <video
                ref={videoRef}
                src={`/${selectedVideo.filename}`}
                className="w-full h-full object-contain rounded-lg"
                onClick={togglePlayback}
              />

              {/* Mode badge */}
              <Badge
                variant="secondary"
                className="absolute top-2 left-2 text-xs"
              >
                {viewMode === "original" ? "Original" : "Editado"}
              </Badge>

              {/* Time display */}
              <div className="absolute bottom-2 left-2 right-2 flex justify-between text-xs text-white bg-black/60 px-2 py-1 rounded">
                <span>{formatTime(playheadMs)}</span>
                {viewMode === "edited" && segments.length > 0 && (
                  <span className="text-green-400">
                    → {formatTime(stats.keptDuration > 0 ? playheadMs * (stats.keptDuration / durationMs) : 0)}
                  </span>
                )}
                <span>/ {formatTime(durationMs)}</span>
              </div>
            </div>
          ) : (
            <div className="text-white/50">Selecciona un video</div>
          )}
        </div>

        {/* Timeline */}
        {selectedVideo && videoDuration && (
          <div className="border-t bg-background">
            <div
              ref={contentRef}
              className="relative overflow-x-auto overflow-y-hidden"
              onScroll={handleScroll}
              onWheel={handleWheel}
            >
              <div style={{ width: contentWidth + 80, minWidth: "100%" }}>
                {/* Ruler */}
                <TimelineRuler
                  durationMs={durationMs}
                  zoomLevel={zoomLevel}
                  viewportStartMs={viewportStartMs}
                  viewportWidthPx={getViewportWidth()}
                  onSeek={handleSeek}
                />

                {/* Waveform track */}
                <TimelineTrack name="Audio" height={48}>
                  {waveformLoading ? (
                    <WaveformPlaceholder
                      width={contentWidth}
                      height={40}
                      className="ml-[80px]"
                    />
                  ) : waveformData ? (
                    <div className="ml-[80px]">
                      <Waveform
                        data={downsampleWaveform(
                          {
                            samples: waveformData,
                            sampleRate: 200,
                            duration: durationMs / 1000,
                          },
                          Math.min(waveformData.length, Math.floor(contentWidth / 2))
                        )}
                        width={contentWidth}
                        height={40}
                        color="rgb(74, 222, 128)"
                        style="mirror"
                      />
                    </div>
                  ) : null}
                </TimelineTrack>

                {/* Segments track */}
                <SegmentTrack
                  segments={segments}
                  silences={silences}
                  zoomLevel={zoomLevel}
                  viewportStartMs={viewportStartMs}
                  durationMs={durationMs}
                  selection={selection}
                  onSelect={select}
                  onResizeSegment={(id, field, value) =>
                    resizeSegment(selectedVideo.id, id, field, value)
                  }
                  onToggleSegment={(id) => toggleSegment(selectedVideo.id, id)}
                />

                {/* Playhead */}
                <TimelinePlayhead
                  playheadMs={playheadMs}
                  zoomLevel={zoomLevel}
                  viewportStartMs={viewportStartMs}
                />
              </div>
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-t bg-muted/20 text-xs text-muted-foreground">
              <span>
                {formatTime(playheadMs)} / {formatTime(durationMs)}
              </span>
              {segments.length > 0 && (
                <span>
                  {stats.segmentCount} segmentos |{" "}
                  <span className="text-green-600">{formatTime(stats.keptDuration)} conservados</span> |{" "}
                  <span className="text-red-600">{formatTime(stats.cutDuration)} cortados</span> |{" "}
                  <span className="font-medium">{stats.savingsPercent}% ahorro</span>
                </span>
              )}
              <span>Zoom: {Math.round(zoomLevel * 100)}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="w-72 border-l flex flex-col bg-background">
        <div className="p-4 border-b">
          <h1 className="text-lg font-semibold">Editor de Silencios</h1>
          <p className="text-sm text-muted-foreground">
            Detecta y ajusta cortes de silencios
          </p>
        </div>

        {/* Video list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Videos
          </h2>
          {videos.map((video) => (
            <Card
              key={video.id}
              className={`cursor-pointer transition-colors hover:bg-accent ${
                selectedVideo?.id === video.id ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => handleVideoSelect(video)}
            >
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-sm font-medium truncate">
                  {video.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate max-w-[120px]">{video.filename}</span>
                  <Badge variant="secondary" className="text-xs">
                    {formatFileSize(video.size)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Detection settings */}
        <div className="border-t p-4 space-y-3">
          <h3 className="text-sm font-medium">Configuracion</h3>
          <div className="space-y-3">
            {/* Cut mode selector */}
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Modo de corte</span>
              <div className="flex gap-1">
                <Button
                  variant={cutMode === "silence" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setCutMode("silence")}
                  className="flex-1 h-7 text-xs"
                >
                  Silencios
                </Button>
                <Button
                  variant={cutMode === "semantic" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setCutMode("semantic")}
                  className="flex-1 h-7 text-xs"
                  disabled={!scriptState?.rawScript || captions.length === 0}
                  title={
                    !scriptState?.rawScript
                      ? "Requiere guión"
                      : captions.length === 0
                        ? "Requiere transcripción"
                        : "Cortar solo entre oraciones"
                  }
                >
                  Semántico
                </Button>
              </div>
              {cutMode === "semantic" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Solo corta entre oraciones del guión
                </p>
              )}
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                Umbral (dB): {detectionParams.thresholdDb}
              </span>
              <input
                type="range"
                min="-60"
                max="-20"
                value={detectionParams.thresholdDb}
                onChange={(e) =>
                  setDetectionParams((p) => ({
                    ...p,
                    thresholdDb: parseInt(e.target.value),
                  }))
                }
                className="w-full"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                Duracion min (s): {detectionParams.minDurationSec}
              </span>
              <input
                type="range"
                min="0.1"
                max="2"
                step="0.1"
                value={detectionParams.minDurationSec}
                onChange={(e) =>
                  setDetectionParams((p) => ({
                    ...p,
                    minDurationSec: parseFloat(e.target.value),
                  }))
                }
                className="w-full"
              />
            </label>
          </div>
        </div>

        {/* Stats */}
        {selectedVideo && segments.length > 0 && (
          <div className="border-t p-4 space-y-2">
            <h3 className="text-sm font-medium">Estadisticas</h3>
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Segmentos:</span>
                <span>{stats.enabledCount} / {stats.segmentCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Conservado:</span>
                <span className="text-green-600">{formatTime(stats.keptDuration)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cortado:</span>
                <span className="text-red-600">{formatTime(stats.cutDuration)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Ahorro:</span>
                <span className="text-primary">{stats.savingsPercent}%</span>
              </div>
              {semanticStats && (
                <>
                  <div className="border-t my-2" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Oraciones:</span>
                    <span>{semanticStats.sentenceCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cortes entre oraciones:</span>
                    <span className="text-red-600">{semanticStats.semanticCutCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pausas conservadas:</span>
                    <span className="text-green-600">{semanticStats.naturalPauseCount}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
