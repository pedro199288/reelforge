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
import {
  useWorkspaceStore,
  useScript,
  SILENCE_DEFAULTS,
} from "@/store/workspace";
import {
  useVideoSegments,
  useTimelineActions,
  useTimelineSelection,
  useTimelineStore,
} from "@/store/timeline";
import { useSubtitleStore } from "@/store/subtitles";
import { SegmentTimeline } from "@/components/SegmentTimeline";
import { AIPreselectionPanel } from "@/components/AIPreselectionPanel";
import { PreselectionLogs } from "@/components/PreselectionLogs";
import { usePlayheadSync } from "@/hooks/usePlayheadSync";
import { useSegmentEditorShortcuts } from "@/hooks/useSegmentEditorShortcuts";
import type { PreselectedSegment, PreselectionLog } from "@/core/preselection";
import {
  ArrowLeft,
  Play,
  Pause,
  Sparkles,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  Clock,
  ToggleLeft,
  ToggleRight,
  X,
  Scissors,
  Undo2,
  Redo2,
  Eye,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  return Object.values(status.steps).filter(
    (s) => s.status === "completed"
  ).length;
}

const TOTAL_STEPS = 7;

// --- Side panel tabs ---
type SidePanelTab = "ai" | "script" | "details" | "logs";

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
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>("details");
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewMode, setPreviewMode] = useState<"edit" | "preview">("edit");
  const [cutVideoDuration, setCutVideoDuration] = useState<number | null>(null);

  // --- Video ref ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<PlayerRef>(null);

  // --- Store data ---
  const scriptState = useScript(videoId);
  const config = useWorkspaceStore((s) => s.pipelineConfig);
  const timelineSegments = useVideoSegments(videoId);
  const { importSemanticSegments, importPreselectedSegments, toggleSegment, clearSelection } =
    useTimelineActions();
  const selection = useTimelineSelection();
  const { highlightColor, fontFamily } = useSubtitleStore();

  // --- Playhead sync ---
  const { currentTimeMs, isTransitioning } = usePlayheadSync({
    videoRef,
    isPlaying,
  });
  const currentTime = currentTimeMs / 1000;

  // --- Keyboard shortcuts ---
  useSegmentEditorShortcuts({
    videoId,
    videoRef,
    totalDurationMs: (segmentsResult?.totalDuration ?? 0) * 1000,
  });

  // --- Derived data ---
  const totalDuration = segmentsResult?.totalDuration ?? 0;
  const videoPath = video
    ? `${API_URL}/api/stream/videos/${video.filename}`
    : "";

  const hasCaptions = useMemo(() => {
    if (video?.hasCaptions) return true;
    return (pipelineStatus?.steps.captions?.status === "completed") || false;
  }, [video, pipelineStatus]);

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

  // --- Import segments to timeline store ---
  const lastImportRef = useRef<{
    videoId: string;
    hasPreselection: boolean;
  } | null>(null);

  useEffect(() => {
    if (!segmentsResult || segmentsResult.segments.length === 0) return;

    const hasPreselectionData =
      segmentsResult.preselection &&
      segmentsResult.preselection.segments.length > 0;
    const importKey = { videoId, hasPreselection: !!hasPreselectionData };

    if (
      lastImportRef.current?.videoId === importKey.videoId &&
      lastImportRef.current?.hasPreselection === importKey.hasPreselection &&
      timelineSegments.length > 0
    ) {
      return;
    }

    const currentSegmentsHavePreselection =
      timelineSegments.length > 0 &&
      timelineSegments.some((s) => s.preselectionScore !== undefined);

    const shouldImport =
      timelineSegments.length === 0 ||
      (hasPreselectionData && !currentSegmentsHavePreselection);

    if (shouldImport) {
      lastImportRef.current = importKey;
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
    }
  }, [
    videoId,
    segmentsResult,
    timelineSegments,
    importSemanticSegments,
    importPreselectedSegments,
  ]);

  // --- Video playback ---
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    v.addEventListener("play", handlePlay);
    v.addEventListener("pause", handlePause);
    v.addEventListener("ended", handleEnded);

    return () => {
      v.removeEventListener("play", handlePlay);
      v.removeEventListener("pause", handlePause);
      v.removeEventListener("ended", handleEnded);
    };
  }, []);

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
    if (!isPlaying || isJumpingRef.current) return;
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
  }, [currentTimeMs, isPlaying, enabledSegments, performJump]);

  const togglePlayback = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;

    if (isPlaying) {
      v.pause();
    } else {
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
      v.play();
    }
  }, [isPlaying, enabledSegments, mapTimeToEdited]);

  const handleSeekTo = useCallback((ms: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = ms / 1000;
    }
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
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => setSidePanelOpen(!sidePanelOpen)}
            title={sidePanelOpen ? "Cerrar panel lateral" : "Abrir panel lateral"}
          >
            {sidePanelOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
          </Button>
        </div>
      </header>

      {/* Main area: Side panel + Video */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Side panel */}
        {sidePanelOpen && (
          <aside className="w-[380px] flex-shrink-0 border-r flex flex-col min-h-0 overflow-hidden">
            {/* Side panel tabs */}
            <div className="flex border-b bg-muted/20 flex-shrink-0">
              <SidePanelTabButton
                active={sidePanelTab === "details"}
                onClick={() => setSidePanelTab("details")}
              >
                <Scissors className="w-3.5 h-3.5" />
                Segmentos
              </SidePanelTabButton>
              {hasCaptions && (
                <SidePanelTabButton
                  active={sidePanelTab === "ai"}
                  onClick={() => setSidePanelTab("ai")}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  IA
                </SidePanelTabButton>
              )}
              {scriptState?.rawScript && (
                <SidePanelTabButton
                  active={sidePanelTab === "script"}
                  onClick={() => setSidePanelTab("script")}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Script
                </SidePanelTabButton>
              )}
              {preselectionLog && (
                <SidePanelTabButton
                  active={sidePanelTab === "logs"}
                  onClick={() => setSidePanelTab("logs")}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Logs
                </SidePanelTabButton>
              )}
            </div>

            {/* Side panel content */}
            <div className="flex-1 overflow-y-auto scrollbar-subtle">
              {sidePanelTab === "details" && (
                <div className="p-4 space-y-4">
                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard
                      label="Segmentos"
                      value={`${stats.selectedCount}/${stats.totalSegments}`}
                      color="text-primary"
                    />
                    <StatCard
                      label="Duracion final"
                      value={formatDuration(stats.selectedDuration)}
                      color="text-green-600"
                    />
                    <StatCard
                      label="Eliminado"
                      value={formatDuration(stats.removedDuration)}
                      color="text-red-600"
                    />
                    <StatCard
                      label="Contenido"
                      value={`${stats.percentKept.toFixed(0)}%`}
                      color="text-foreground"
                    />
                  </div>

                  {/* Preselection stats */}
                  {segmentsResult?.preselection && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                          Preseleccion IA
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-blue-600 dark:text-blue-400">
                        {segmentsResult.preselection.stats.scriptCoverage <
                          100 && (
                          <span>
                            Cobertura:{" "}
                            {segmentsResult.preselection.stats.scriptCoverage.toFixed(
                              0
                            )}
                            %
                          </span>
                        )}
                        {segmentsResult.preselection.stats
                          .repetitionsRemoved > 0 && (
                          <span>
                            Repeticiones:{" "}
                            {
                              segmentsResult.preselection.stats
                                .repetitionsRemoved
                            }
                          </span>
                        )}
                        <span>
                          Score:{" "}
                          {segmentsResult.preselection.stats.averageScore.toFixed(
                            0
                          )}
                          %
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Selected segment details */}
                  {selectedSegment && selectedSegmentIndex && (
                    <div className="border rounded-lg p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="default" className="text-xs">
                            #{selectedSegmentIndex}
                          </Badge>
                          <Badge
                            variant={
                              selectedSegment.enabled ? "default" : "secondary"
                            }
                            className={cn(
                              "text-xs",
                              selectedSegment.enabled
                                ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400"
                            )}
                          >
                            {selectedSegment.enabled
                              ? "Habilitado"
                              : "Deshabilitado"}
                          </Badge>
                          {selectedSegment.preselectionScore !== undefined && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                selectedSegment.preselectionScore >= 85
                                  ? "bg-green-100 text-green-700 border-green-300"
                                  : selectedSegment.preselectionScore >= 60
                                    ? "bg-yellow-100 text-yellow-700 border-yellow-300"
                                    : "bg-red-100 text-red-700 border-red-300"
                              )}
                            >
                              {selectedSegment.preselectionScore}%
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearSelection}
                          className="h-6 w-6 p-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground block text-xs">
                            Inicio
                          </span>
                          <span className="font-mono font-medium">
                            {formatTime(selectedSegment.startMs / 1000)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-xs">
                            Fin
                          </span>
                          <span className="font-mono font-medium">
                            {formatTime(selectedSegment.endMs / 1000)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-xs">
                            Duracion
                          </span>
                          <span className="font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            {formatDuration(
                              (selectedSegment.endMs -
                                selectedSegment.startMs) /
                                1000
                            )}
                          </span>
                        </div>
                      </div>

                      {selectedSegment.preselectionReason && (
                        <div className="p-2 bg-muted/50 rounded border text-xs">
                          <span className="text-muted-foreground">Razon: </span>
                          <span>{selectedSegment.preselectionReason}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleSeekTo(selectedSegment.startMs)
                          }
                          className="flex-1"
                        >
                          <Play className="w-3.5 h-3.5 mr-1" />
                          Ir
                        </Button>
                        <Button
                          variant={
                            selectedSegment.enabled ? "outline" : "default"
                          }
                          size="sm"
                          onClick={() =>
                            toggleSegment(videoId, selectedSegment.id)
                          }
                          className="flex-1"
                        >
                          {selectedSegment.enabled ? (
                            <>
                              <ToggleRight className="w-3.5 h-3.5 mr-1" />
                              Deshab.
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="w-3.5 h-3.5 mr-1" />
                              Habilitar
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* No segments message */}
                  {!hasSegments && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No hay segmentos. Ejecuta el pipeline primero.
                      <div className="mt-3">
                        <Link
                          to="/pipeline/$videoId/$tab"
                          params={{ videoId, tab: "segments" }}
                        >
                          <Button variant="outline" size="sm">
                            Ir al Pipeline
                          </Button>
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {sidePanelTab === "ai" && (
                <AIPreselectionPanel
                  videoId={videoId}
                  script={scriptState?.rawScript}
                  hasCaptions={hasCaptions}
                  currentSegments={
                    segmentsResult?.preselection?.segments || []
                  }
                  onSegmentsUpdate={(newSegments) => {
                    importPreselectedSegments(videoId, newSegments, []);
                  }}
                  onSegmentClick={(segmentId) => {
                    const segment = timelineSegments.find(
                      (s) => s.id === segmentId
                    );
                    if (segment) {
                      handleSeekTo(segment.startMs);
                    }
                  }}
                />
              )}

              {sidePanelTab === "script" && scriptState?.rawScript && (
                <div className="p-4">
                  <h3 className="text-sm font-medium mb-3">Guion original</h3>
                  <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/50 rounded-lg p-3 border max-h-[600px] overflow-y-auto">
                    {scriptState.rawScript}
                  </pre>
                </div>
              )}

              {sidePanelTab === "logs" && preselectionLog && (
                <div className="p-4">
                  <PreselectionLogs
                    log={preselectionLog}
                    onSeekTo={(seconds) => handleSeekTo(seconds * 1000)}
                  />
                </div>
              )}
            </div>
          </aside>
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
                ref={videoRef}
                src={videoPath}
                className="max-h-full max-w-full object-contain"
                onClick={togglePlayback}
              />

              {/* Play overlay */}
              {!isPlaying && (
                <button
                  type="button"
                  className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer"
                  onClick={togglePlayback}
                >
                  <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                    <Play className="w-8 h-8 text-black ml-1" />
                  </div>
                </button>
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
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Deshacer (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={handleRedo}
            disabled={!canRedo}
            title="Rehacer (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </Button>
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

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="text-center p-3 bg-muted/50 rounded-lg">
      <div className={cn("text-lg font-bold", color)}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
