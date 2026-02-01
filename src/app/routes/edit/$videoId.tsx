import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { toast } from "sonner";
import { Player, type PlayerRef } from "@remotion/player";
import { CaptionedVideoForPlayer } from "@/remotion-compositions/CaptionedVideo/ForPlayer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Video } from "@/components/VideoList";
import { useScript, useWorkspaceStore } from "@/store/workspace";
import { parseScript } from "@/core/script/parser";
import {
  useVideoSegments,
  useTimelineActions,
  useTimelineSelection,
  useTimelineStore,
} from "@/store/timeline";
import { useSubtitleStore } from "@/store/subtitles";
import { SegmentTimeline } from "@/components/SegmentTimeline";
import { PreselectionLogs } from "@/components/PreselectionLogs";
import { usePlayheadSync } from "@/hooks/usePlayheadSync";
import { useSegmentEditorShortcuts, isEditableElement } from "@/hooks/useSegmentEditorShortcuts";
import type { PreselectedSegment, PreselectionLog } from "@/core/preselection";
import {
  ArrowLeft,
  Play,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Undo2,
  Redo2,
  Eye,
  Pencil,
  SkipForward,
  Zap,
  CheckCircle2,
  AlertTriangle,
  PanelRightClose,
  ScrollText,
  Subtitles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { ShortcutTooltipContent } from "@/components/ui/shortcut-tooltip";
import { useHotkeys } from "react-hotkeys-hook";
import { Textarea } from "@/components/ui/textarea";
import { EditorPipelinePanel } from "@/components/EditorPipelinePanel";
import { useOriginalCaptions } from "@/hooks/useOriginalCaptions";
import { VideoSubtitleOverlay } from "@/components/VideoSubtitleOverlay";

const API_URL = "http://localhost:3012";

export const Route = createFileRoute("/edit/$videoId")({
  component: EditorPage,
});

// --- Types ---

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

interface StepState {
  status: "pending" | "running" | "completed" | "error";
}

interface BackendPipelineStatus {
  videoId: string;
  filename: string;
  videoDuration?: number;
  steps: Record<PipelineStep, StepState>;
  updatedAt: string;
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
    segments: PreselectedSegment[];
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

// --- Helpers ---

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return mins > 0 ? `${mins}:${secs.padStart(4, "0")}` : `${secs}s`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function getCompletedCount(status: BackendPipelineStatus): number {
  // Exclude "raw" from the count (always completed, not shown in UI)
  return Object.entries(status.steps).filter(
    ([key, s]) => key !== "raw" && s.status === "completed"
  ).length;
}

const TOTAL_STEPS = 6;

// --- Side panel tabs ---
type SidePanelTab = "pipeline" | "script";

// --- Component ---

function EditorPage() {
  const { videoId } = Route.useParams();

  // --- Data loading state ---
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [pipelineStatus, setPipelineStatus] =
    useState<BackendPipelineStatus | null>(null);
  const [segmentsResult, setSegmentsResult] =
    useState<SegmentsResult | null>(null);
  const [preselectionLog, setPreselectionLog] =
    useState<PreselectionLog | null>(null);

  // --- UI state ---
  const [sidePanelOpen, setSidePanelOpen] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 768
  );
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>("pipeline");
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewMode, setPreviewMode] = useState<"edit" | "preview">("edit");
  const [continuousPlay, setContinuousPlay] = useState(false);
  const [cutVideoDuration, setCutVideoDuration] = useState<number | null>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [highlightedLogSegmentId, setHighlightedLogSegmentId] = useState<string | null>(null);
  const [showCaptions, setShowCaptions] = useState(false);

  // --- Video ref ---
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const playerRef = useRef<PlayerRef>(null);

  // --- Store data ---
  const scriptState = useScript(videoId);
  const setScript = useWorkspaceStore((state) => state.setScript);
  const clearScript = useWorkspaceStore((state) => state.clearScript);
  const timelineSegments = useVideoSegments(videoId);
  const { importSemanticSegments, importPreselectedSegments } =
    useTimelineActions();
  const selection = useTimelineSelection();
  const { highlightColor, fontFamily } = useSubtitleStore();

  // --- Playhead sync ---
  const { currentTimeMs, isTransitioning } = usePlayheadSync({
    videoElement: videoEl,
    isPlaying,
  });
  const currentTime = currentTimeMs / 1000;

  // --- Keyboard shortcuts ---
  useSegmentEditorShortcuts({
    videoId,
    videoRef,
    totalDurationMs: (segmentsResult?.totalDuration ?? 0) * 1000,
  });

  // --- Footer keyboard shortcuts ---
  useHotkeys("c", () => {
    if (isEditableElement()) return;
    setShowCaptions(v => !v);
  }, []);

  useHotkeys("j", () => {
    if (isEditableElement()) return;
    setContinuousPlay(v => !v);
  }, []);

  // --- Original captions for overlay ---
  const captionsCompleted = pipelineStatus?.steps.captions?.status === "completed";
  const { captions: originalCaptions } = useOriginalCaptions(videoId, captionsCompleted ?? false);

  // --- Derived data ---
  const totalDuration = segmentsResult?.totalDuration ?? 0;
  const videoPath = video
    ? `${API_URL}/api/stream/videos/${video.filename}`
    : "";

  const canPreview = useMemo(() => {
    if (!pipelineStatus) return false;
    return (
      pipelineStatus.steps.cut?.status === "completed" &&
      pipelineStatus.steps.captions?.status === "completed"
    );
  }, [pipelineStatus]);

  const FPS = 30;
  const cutVideoSrc = `/videos/${videoId}-cut.mp4`;
  const durationInFrames = cutVideoDuration ? Math.floor(cutVideoDuration * FPS) : 0;

  const completedSteps = useMemo(() => {
    if (!pipelineStatus) return 0;
    return getCompletedCount(pipelineStatus);
  }, [pipelineStatus]);

  // --- Selected segment ---
  const selectedSegment = useMemo(() => {
    if (selection?.type !== "segment") return null;
    return timelineSegments.find((s) => s.id === selection.id) ?? null;
  }, [selection, timelineSegments]);

  const selectedSegmentIndex = useMemo(() => {
    if (!selectedSegment) return null;
    const index = timelineSegments.findIndex(
      (s) => s.id === selectedSegment.id
    );
    return index >= 0 ? index + 1 : null;
  }, [selectedSegment, timelineSegments]);

  // --- Statistics ---
  const enabledSegments = useMemo(
    () =>
      timelineSegments
        .filter((s) => s.enabled)
        .sort((a, b) => a.startMs - b.startMs),
    [timelineSegments]
  );

  const stats = useMemo(() => {
    const selectedDuration = enabledSegments.reduce(
      (sum, s) => sum + (s.endMs - s.startMs) / 1000,
      0
    );
    const removedDuration = totalDuration - selectedDuration;
    const percentKept =
      totalDuration > 0 ? (selectedDuration / totalDuration) * 100 : 0;

    return {
      totalSegments: timelineSegments.length,
      selectedCount: enabledSegments.length,
      selectedDuration,
      removedDuration,
      percentKept,
    };
  }, [timelineSegments, enabledSegments, totalDuration]);

  // --- Load video from manifest ---
  useEffect(() => {
    fetch(`/videos.manifest.json?t=${Date.now()}`)
      .then((res) => res.json() as Promise<VideoManifest>)
      .then((data) => {
        const found = data.videos.find((v) => v.id === videoId) ?? null;
        setVideo(found);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [videoId]);

  // --- Load pipeline status ---
  const loadPipelineStatus = useCallback(
    async (vid: Video) => {
      try {
        const res = await fetch(
          `${API_URL}/api/pipeline/status?videoId=${encodeURIComponent(vid.id)}&filename=${encodeURIComponent(vid.filename)}`
        );
        if (res.ok) {
          const status = (await res.json()) as BackendPipelineStatus;
          setPipelineStatus(status);

          // Load segments result if completed
          if (status.steps.segments?.status === "completed") {
            const segRes = await fetch(
              `${API_URL}/api/pipeline/result?videoId=${encodeURIComponent(vid.id)}&step=segments`
            );
            if (segRes.ok) {
              const result = (await segRes.json()) as SegmentsResult;
              setSegmentsResult(result);
            }
          }

          // Load preselection logs
          if (status.steps.segments?.status === "completed") {
            try {
              const logRes = await fetch(
                `${API_URL}/api/pipeline/${encodeURIComponent(vid.id)}/preselection-logs`
              );
              if (logRes.ok) {
                const logData = await logRes.json();
                setPreselectionLog(logData.log ?? null);
              }
            } catch {
              // Logs are optional
            }
          }
        }
      } catch (err) {
        console.error("Error loading pipeline status:", err);
        toast.error("Error al cargar estado del pipeline");
      }
    },
    []
  );

  useEffect(() => {
    if (video) {
      loadPipelineStatus(video);
    }
  }, [video, loadPipelineStatus]);

  // --- Probe cut video duration for Remotion preview ---
  useEffect(() => {
    if (!canPreview) {
      setCutVideoDuration(null);
      return;
    }
    const probe = document.createElement("video");
    probe.src = cutVideoSrc;
    probe.onloadedmetadata = () => {
      setCutVideoDuration(probe.duration);
    };
    probe.onerror = () => {
      setCutVideoDuration(null);
    };
  }, [canPreview, cutVideoSrc]);

  // Reset preview mode if preview becomes unavailable
  useEffect(() => {
    if (!canPreview && previewMode === "preview") {
      setPreviewMode("edit");
    }
  }, [canPreview, previewMode]);

  // Close right panel if preselection logs disappear (e.g. video change)
  useEffect(() => {
    if (!preselectionLog) setRightPanelOpen(false);
  }, [preselectionLog]);

  // Clear highlight when right panel closes
  useEffect(() => {
    if (!rightPanelOpen) setHighlightedLogSegmentId(null);
  }, [rightPanelOpen]);

  // --- Import segments to timeline store ---
  const lastImportRef = useRef<string | null>(null);

  useEffect(() => {
    if (!segmentsResult || segmentsResult.segments.length === 0) return;

    const hasPreselectionData =
      segmentsResult.preselection &&
      segmentsResult.preselection.segments.length > 0;

    const fingerprint = hasPreselectionData
      ? `${videoId}:pre:${segmentsResult.preselection!.segments.length}:${segmentsResult.preselection!.stats.averageScore.toFixed(1)}`
      : `${videoId}:basic:${segmentsResult.segments.length}`;

    if (lastImportRef.current === fingerprint && timelineSegments.length > 0) {
      return;
    }

    lastImportRef.current = fingerprint;
    if (hasPreselectionData) {
      importPreselectedSegments(
        videoId,
        segmentsResult.preselection!.segments,
        []
      );
    } else {
      const segmentsForStore = segmentsResult.segments.map((s) => ({
        startMs: s.startTime * 1000,
        endMs: s.endTime * 1000,
      }));
      importSemanticSegments(videoId, segmentsForStore, []);
    }
  }, [
    videoId,
    segmentsResult,
    timelineSegments,
    importSemanticSegments,
    importPreselectedSegments,
  ]);

  // --- Preview playback: skip disabled segments ---
  const mapTimeToEdited = useCallback(
    (originalMs: number): number | null => {
      let editedMs = 0;
      for (const segment of enabledSegments) {
        if (originalMs >= segment.startMs && originalMs <= segment.endMs) {
          return editedMs + (originalMs - segment.startMs);
        }
        if (originalMs > segment.endMs) {
          editedMs += segment.endMs - segment.startMs;
        }
      }
      return null;
    },
    [enabledSegments]
  );

  const isJumpingRef = useRef(false);
  const lastJumpTargetRef = useRef<number | null>(null);

  const performJump = useCallback((targetTime: number) => {
    const v = videoRef.current;
    if (!v || isJumpingRef.current) return;
    if (
      lastJumpTargetRef.current !== null &&
      Math.abs(targetTime - lastJumpTargetRef.current) < 0.05
    ) {
      return;
    }

    isJumpingRef.current = true;
    lastJumpTargetRef.current = targetTime;
    v.currentTime = targetTime;

    const handleSeeked = () => {
      isJumpingRef.current = false;
      v.removeEventListener("seeked", handleSeeked);
    };
    v.addEventListener("seeked", handleSeeked, { once: true });
    setTimeout(() => {
      isJumpingRef.current = false;
    }, 200);
  }, []);

  useEffect(() => {
    if (!isPlaying || isJumpingRef.current || continuousPlay) return;
    const v = videoRef.current;
    if (!v) return;

    const currentSegment = enabledSegments.find(
      (s) => currentTimeMs >= s.startMs && currentTimeMs <= s.endMs
    );

    if (currentSegment) {
      const msToEnd = currentSegment.endMs - currentTimeMs;
      const LOOKAHEAD_MS = 17;

      if (msToEnd <= LOOKAHEAD_MS && msToEnd > 0) {
        const nextSegment = enabledSegments.find(
          (s) => s.startMs > currentSegment.endMs
        );
        if (nextSegment) {
          performJump(nextSegment.startMs / 1000);
        } else {
          v.pause();
        }
      }
      return;
    }

    const nextSegment = enabledSegments.find((s) => s.startMs > currentTimeMs);
    if (nextSegment) {
      performJump(nextSegment.startMs / 1000);
    } else {
      v.pause();
    }
  }, [currentTimeMs, isPlaying, enabledSegments, performJump, continuousPlay]);

  const togglePlayback = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;

    if (isPlaying) {
      v.pause();
    } else {
      if (!continuousPlay) {
        const currentMs = v.currentTime * 1000;
        const editedMs = mapTimeToEdited(currentMs);
        if (editedMs === null) {
          const nextSegment = enabledSegments.find(
            (s) => s.startMs > currentMs
          );
          if (nextSegment) {
            v.currentTime = nextSegment.startMs / 1000;
          } else if (enabledSegments.length > 0) {
            v.currentTime = enabledSegments[0].startMs / 1000;
          }
        }
      }
      v.play();
    }
  }, [isPlaying, enabledSegments, mapTimeToEdited, continuousPlay]);

  const handleSeekTo = useCallback((ms: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = ms / 1000;
    }
  }, []);

  const handleStepCompleted = useCallback(() => {
    if (video) {
      loadPipelineStatus(video);
    }
  }, [video, loadPipelineStatus]);

  // --- Show preselection log for a segment ---
  const handleShowLog = useCallback((segmentId: string) => {
    setRightPanelOpen(true);
    setHighlightedLogSegmentId(segmentId);
  }, []);

  // --- Undo/Redo ---
  const canUndo =
    useTimelineStore.temporal.getState().pastStates.length > 0;
  const canRedo =
    useTimelineStore.temporal.getState().futureStates.length > 0;

  const handleUndo = useCallback(() => {
    useTimelineStore.temporal.getState().undo();
  }, []);

  const handleRedo = useCallback(() => {
    useTimelineStore.temporal.getState().redo();
  }, []);

  // --- Loading state ---
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <div className="text-muted-foreground">Video no encontrado</div>
        <Link to="/pipeline">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver al Pipeline
          </Button>
        </Link>
      </div>
    );
  }

  const hasSegments = segmentsResult && segmentsResult.segments.length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 h-11 border-b bg-muted/30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 hidden md:inline-flex"
            onClick={() => setSidePanelOpen(!sidePanelOpen)}
            title={sidePanelOpen ? "Cerrar panel lateral" : "Abrir panel lateral"}
          >
            {sidePanelOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
          </Button>
          <Link to="/pipeline/$videoId/$tab" params={{ videoId, tab: "segments" }}>
            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1">
              <ArrowLeft className="w-4 h-4" />
              Pipeline
            </Button>
          </Link>
          <span className="text-sm font-medium truncate max-w-[300px]">
            {video.title}
          </span>
          {pipelineStatus && (
            <Badge variant="outline" className="text-xs">
              {completedSteps}/{TOTAL_STEPS}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {preselectionLog && (
            <Button
              variant={rightPanelOpen ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 gap-1.5 hidden md:inline-flex"
              onClick={() => setRightPanelOpen(!rightPanelOpen)}
              title={rightPanelOpen ? "Cerrar logs" : "Ver logs de preseleccion"}
            >
              {rightPanelOpen ? (
                <PanelRightClose className="w-4 h-4" />
              ) : (
                <ScrollText className="w-4 h-4" />
              )}
            </Button>
          )}
          {canPreview && (
            <Button
              variant={previewMode === "preview" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 gap-1.5"
              onClick={() => setPreviewMode(previewMode === "edit" ? "preview" : "edit")}
              title={previewMode === "edit" ? "Vista previa con efectos" : "Volver a edición"}
            >
              {previewMode === "edit" ? (
                <>
                  <Eye className="w-4 h-4" />
                  <span className="text-xs">Preview</span>
                </>
              ) : (
                <>
                  <Pencil className="w-4 h-4" />
                  <span className="text-xs">Editar</span>
                </>
              )}
            </Button>
          )}
        </div>
      </header>

      {/* Main area: Side panel + Video */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Side panel - mobile: fullscreen overlay, desktop: inline */}
        {sidePanelOpen && (
          <aside className={cn(
            "flex flex-col min-h-0 overflow-hidden bg-background z-30",
            // Mobile: fullscreen overlay
            "fixed inset-0 md:static md:inset-auto",
            // Desktop: 480px inline panel
            "md:w-[480px] md:flex-shrink-0 md:border-r"
          )}>
            {/* Mobile close button */}
            <div className="flex items-center justify-between px-3 py-2 border-b md:hidden">
              <span className="text-sm font-medium">Panel</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setSidePanelOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            {/* Side panel tabs */}
            <div className="flex border-b bg-muted/20 flex-shrink-0">
              <SidePanelTabButton
                active={sidePanelTab === "pipeline"}
                onClick={() => setSidePanelTab("pipeline")}
              >
                <Zap className="w-3.5 h-3.5" />
                Pipeline
              </SidePanelTabButton>
              <SidePanelTabButton
                active={sidePanelTab === "script"}
                onClick={() => setSidePanelTab("script")}
              >
                <FileText className="w-3.5 h-3.5" />
                Script
                {scriptState?.rawScript ? (
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                ) : (
                  <AlertTriangle className="w-3 h-3 text-yellow-500" />
                )}
              </SidePanelTabButton>
            </div>

            {/* Side panel content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {sidePanelTab === "pipeline" && video && (
                <EditorPipelinePanel
                  video={video}
                  segmentsResult={segmentsResult}
                  onStepCompleted={handleStepCompleted}
                  onOpenLogs={preselectionLog ? () => setRightPanelOpen(true) : undefined}
                  onSeekTo={handleSeekTo}
                />
              )}

              {sidePanelTab === "script" && (
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Guion original</h3>
                    {scriptState?.rawScript && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => clearScript(videoId)}
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Limpiar
                      </Button>
                    )}
                  </div>
                  <Textarea
                    placeholder="Pega aqui tu guion original..."
                    value={scriptState?.rawScript ?? ""}
                    onChange={(e) => setScript(videoId, e.target.value)}
                    className="min-h-[200px] text-xs font-mono resize-y"
                  />
                  {scriptState?.rawScript && (() => {
                    const parsed = parseScript(scriptState.rawScript);
                    const zoomCount = parsed.markers.filter((m) => m.type === "zoom").length;
                    const highlightCount = parsed.markers.filter((m) => m.type === "highlight").length;
                    return (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{scriptState.rawScript.length} chars</span>
                        {zoomCount > 0 && (
                          <Badge variant="secondary" className="text-xs h-4 px-1.5">
                            {zoomCount} zoom{zoomCount !== 1 ? "s" : ""}
                          </Badge>
                        )}
                        {highlightCount > 0 && (
                          <Badge variant="secondary" className="text-xs h-4 px-1.5">
                            {highlightCount} highlight{highlightCount !== 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

            </div>
          </aside>
        )}

        {/* Mobile floating button to open side panel */}
        {!sidePanelOpen && (
          <button
            type="button"
            className="absolute top-2 left-2 z-20 md:hidden bg-background/80 backdrop-blur-sm border rounded-full p-2 shadow-md"
            onClick={() => setSidePanelOpen(true)}
            title="Abrir panel"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}

        {/* Video player area */}
        <div className="flex-1 flex items-center justify-center bg-black min-h-0 overflow-hidden relative">
          {previewMode === "preview" && canPreview && durationInFrames > 0 ? (
            <div
              style={{
                width: "100%",
                maxWidth: 400,
                aspectRatio: "9/16",
              }}
            >
              <Player
                ref={playerRef}
                component={CaptionedVideoForPlayer}
                inputProps={{
                  src: cutVideoSrc,
                  highlightColor,
                  fontFamily,
                }}
                durationInFrames={durationInFrames}
                compositionWidth={1080}
                compositionHeight={1920}
                fps={FPS}
                controls
                loop
                style={{
                  width: "100%",
                  height: "100%",
                }}
                clickToPlay
                doubleClickToFullscreen
                spaceKeyToPlayOrPause
              />
            </div>
          ) : videoPath ? (
            <>
              {/* eslint-disable-next-line @remotion/warn-native-media-tag */}
              <video
                ref={(el) => { videoRef.current = el; setVideoEl(el); }}
                src={videoPath}
                className="max-h-full max-w-full object-contain"
                onClick={togglePlayback}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />

              {/* Play overlay */}
              {!isPlaying && (
                <button
                  type="button"
                  className="absolute inset-0 flex items-center justify-center cursor-pointer"
                  onClick={togglePlayback}
                >
                  <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                    <Play className="w-8 h-8 text-black ml-1" />
                  </div>
                </button>
              )}

              {/* Subtitle overlay */}
              {showCaptions && originalCaptions && (
                <VideoSubtitleOverlay captions={originalCaptions} currentTimeMs={currentTimeMs} />
              )}

              {/* Time indicator */}
              <div className="absolute bottom-3 right-3 bg-black/70 px-2 py-1 rounded text-white text-sm font-mono">
                {formatTime(currentTime)} / {formatTime(totalDuration)}
              </div>
            </>
          ) : (
            <div className="text-muted-foreground">Sin video</div>
          )}
        </div>

        {/* Right panel - Preselection Logs */}
        {rightPanelOpen && preselectionLog && (
          <aside className="hidden md:flex md:flex-col md:w-[420px] md:flex-shrink-0 border-l bg-background min-h-0">
            <div className="flex items-center justify-end px-2 py-1 border-b flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setRightPanelOpen(false)}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex-1 min-h-0 p-3">
              <PreselectionLogs
                log={preselectionLog}
                onSeekTo={(seconds) => handleSeekTo(seconds * 1000)}
                highlightSegmentId={highlightedLogSegmentId}
              />
            </div>
          </aside>
        )}
      </div>

      {/* Timeline - FULL WIDTH */}
      {hasSegments && (
        <div className="flex-shrink-0 border-t">
          <SegmentTimeline
            videoId={videoId}
            videoPath={videoPath}
            durationMs={totalDuration * 1000}
            currentTimeMs={currentTimeMs}
            onSeek={(ms) => {
              if (videoRef.current) {
                videoRef.current.currentTime = ms / 1000;
              }
            }}
            enablePlayheadTransition={isTransitioning}
            continuousPlay={continuousPlay}
            onShowLog={preselectionLog ? handleShowLog : undefined}
          />
        </div>
      )}

      {/* Status bar */}
      <footer className="flex items-center justify-between px-4 h-8 border-t bg-muted/30 text-xs flex-shrink-0">
        <div className="flex items-center gap-4">
          {previewMode === "preview" ? (
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Eye className="w-3 h-3" />
              Vista previa — {formatDuration(cutVideoDuration ?? 0)}
            </span>
          ) : selectedSegment && selectedSegmentIndex ? (
            <span className="text-muted-foreground">
              Seg #{selectedSegmentIndex}: {selectedSegment.preselectionScore ?? "—"}% |{" "}
              {formatDuration(
                (selectedSegment.endMs - selectedSegment.startMs) / 1000
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {stats.selectedCount}/{stats.totalSegments} segmentos |{" "}
              {formatDuration(stats.selectedDuration)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {previewMode === "edit" && originalCaptions && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showCaptions ? "default" : "ghost"}
                  size="sm"
                  className={cn("h-6 px-2 text-xs gap-1", showCaptions && "bg-blue-600 hover:bg-blue-700 text-white")}
                  onClick={() => setShowCaptions(!showCaptions)}
                >
                  <Subtitles className="w-3.5 h-3.5" />
                  CC
                </Button>
              </TooltipTrigger>
              <ShortcutTooltipContent shortcut="C">{showCaptions ? "Ocultar subtítulos" : "Mostrar subtítulos"}</ShortcutTooltipContent>
            </Tooltip>
          )}
          {previewMode === "edit" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={continuousPlay ? "default" : "ghost"}
                  size="sm"
                  className={cn("h-6 px-2 text-xs gap-1", continuousPlay && "bg-amber-600 hover:bg-amber-700 text-white")}
                  onClick={() => setContinuousPlay(!continuousPlay)}
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  {continuousPlay ? "Continuo" : "Skip"}
                </Button>
              </TooltipTrigger>
              <ShortcutTooltipContent shortcut="J">{continuousPlay ? "Reproducción continua activa" : "Saltar segmentos deshabilitados"}</ShortcutTooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={handleUndo}
                disabled={!canUndo}
              >
                <Undo2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <ShortcutTooltipContent shortcut="Mod+Z">Deshacer</ShortcutTooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={handleRedo}
                disabled={!canRedo}
              >
                <Redo2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <ShortcutTooltipContent shortcut="Mod+Shift+Z">Rehacer</ShortcutTooltipContent>
          </Tooltip>
        </div>
      </footer>
    </div>
  );
}

// --- Sub-components ---

function SidePanelTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors",
        active
          ? "border-b-2 border-primary text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
