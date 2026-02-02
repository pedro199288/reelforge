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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { Video } from "@/components/VideoList";
import {
  useVideoSegments,
  useTimelineActions,
  useTimelineStore,
} from "@/store/timeline";
import { useSubtitleStore } from "@/store/subtitles";
import {
  useEditorUIStore,
  type VideoSource,
} from "@/store/editor-ui";
import { SegmentTimeline } from "@/components/SegmentTimeline";
import { PropertiesPanel } from "@/components/editor/PropertiesPanel";
import { usePlayheadSync } from "@/hooks/usePlayheadSync";
import { useSegmentEditorShortcuts, isEditableElement } from "@/hooks/useSegmentEditorShortcuts";
import type { PreselectedSegment, PreselectionLog } from "@/core/preselection";
import {
  ArrowLeft,
  Play,
  Film,
  Undo2,
  Redo2,
  Eye,
  Scissors,
  SkipForward,
  Zap,
  Subtitles,
  Gauge,
  PanelRightOpen,
  PanelRightClose,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { ShortcutTooltipContent } from "@/components/ui/shortcut-tooltip";
import { useHotkeys } from "react-hotkeys-hook";
import { EditorPipelinePanel } from "@/components/EditorPipelinePanel";
import type { Caption } from "@/core/script/align";
import type { CutMapEntry } from "@/core/preselection/types";
import { useOriginalCaptions } from "@/hooks/useOriginalCaptions";
import { useFullCaptions } from "@/hooks/useFullCaptions";
import { useCutCaptions } from "@/hooks/useCutCaptions";
import { VideoSubtitleOverlay } from "@/components/VideoSubtitleOverlay";
import { groupIntoPages } from "@/core/captions/group-into-pages";

const API_URL = "http://localhost:3012";
const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 2.5, 3] as const;

export const Route = createFileRoute("/edit/$videoId")({
  component: EditorPage,
});

// --- Types ---

interface VideoManifest {
  videos: Video[];
}

type PipelineStep =
  | "raw"
  | "full-captions"
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
  return Object.entries(status.steps).filter(
    ([key, s]) => key !== "raw" && s.status === "completed"
  ).length;
}

const TOTAL_STEPS = 6;

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
  const [cutMap, setCutMap] = useState<CutMapEntry[] | null>(null);

  // --- UI state (EditorUIStore) ---
  const videoSource = useEditorUIStore((s) => s.videoSource);
  const setVideoSource = useEditorUIStore((s) => s.setVideoSource);
  const propertiesPanelOpen = useEditorUIStore((s) => s.propertiesPanelOpen);
  const setPropertiesPanelOpen = useEditorUIStore((s) => s.setPropertiesPanelOpen);
  const pipelineDrawerOpen = useEditorUIStore((s) => s.pipelineDrawerOpen);
  const setPipelineDrawerOpen = useEditorUIStore((s) => s.setPipelineDrawerOpen);

  // --- Local UI state ---
  const [isPlaying, setIsPlaying] = useState(false);
  const [continuousPlay, setContinuousPlay] = useState(() => {
    try { return localStorage.getItem("editor:continuousPlay") === "true"; } catch { return false; }
  });
  const [cutVideoDuration, setCutVideoDuration] = useState<number | null>(null);
  const [selectedCaptionPageIndex, setSelectedCaptionPageIndex] = useState<number | null>(null);
  const [editedCaptions, setEditedCaptions] = useState<Caption[] | null>(null);
  const [nativeVideoDuration, setNativeVideoDuration] = useState<number | null>(null);
  const [showCaptions, setShowCaptions] = useState(() => {
    try { return localStorage.getItem("editor:showCaptions") === "true"; } catch { return false; }
  });
  const [playbackRate, setPlaybackRate] = useState(1);

  // --- Persist footer toggle preferences ---
  useEffect(() => { try { localStorage.setItem("editor:continuousPlay", String(continuousPlay)); } catch {} }, [continuousPlay]);
  useEffect(() => { try { localStorage.setItem("editor:showCaptions", String(showCaptions)); } catch {} }, [showCaptions]);

  // --- Video refs ---
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const cutVideoRef = useRef<HTMLVideoElement | null>(null);
  const [cutVideoEl, setCutVideoEl] = useState<HTMLVideoElement | null>(null);
  const playerRef = useRef<PlayerRef>(null);

  // --- Store data ---
  const timelineSegments = useVideoSegments(videoId);
  const { importSemanticSegments, importPreselectedSegments, clearTimeline } =
    useTimelineActions();
  const { highlightColor, fontFamily } = useSubtitleStore();

  // --- Active video element (depends on source) ---
  const activeVideoEl = videoSource === "cut" ? cutVideoEl : videoEl;
  const activeVideoRef = videoSource === "cut" ? cutVideoRef : videoRef;

  // --- Playhead sync ---
  const { currentTimeMs, isTransitioning } = usePlayheadSync({
    videoElement: videoSource === "preview" ? null : activeVideoEl,
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
    if (videoSource === "preview") return;
    setShowCaptions(v => !v);
  }, [videoSource]);

  useHotkeys("j", () => {
    if (isEditableElement()) return;
    if (videoSource !== "original") return;
    setContinuousPlay(v => !v);
  }, [videoSource]);

  useHotkeys("r", () => {
    if (isEditableElement()) return;
    if (videoSource === "preview") return;
    setPlaybackRate(prev => {
      const idx = PLAYBACK_RATES.indexOf(prev as typeof PLAYBACK_RATES[number]);
      return PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
    });
  }, [videoSource]);

  useHotkeys("p", () => {
    if (isEditableElement()) return;
    setPropertiesPanelOpen(!propertiesPanelOpen);
  }, [propertiesPanelOpen, setPropertiesPanelOpen]);

  // Apply playback rate to video elements
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
    if (cutVideoRef.current) cutVideoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    if (videoEl && playbackRate !== 1) videoEl.playbackRate = playbackRate;
  }, [videoEl, playbackRate]);

  useEffect(() => {
    if (cutVideoEl && playbackRate !== 1) cutVideoEl.playbackRate = playbackRate;
  }, [cutVideoEl, playbackRate]);

  // --- Cut mode ---
  const cutCompleted = pipelineStatus?.steps.cut?.status === "completed";
  const canViewCut = cutCompleted === true;
  const cutFilename = video ? video.filename.replace(/(\.[^.]+)$/, "-cut$1") : "";
  const cutVideoStreamUrl = cutFilename ? `${API_URL}/api/stream/videos/${cutFilename}` : "";

  // --- Captions for overlay ---
  const captionsCompleted = pipelineStatus?.steps.captions?.status === "completed";
  const { captions: postCutCaptions } = useOriginalCaptions(videoId, captionsCompleted ?? false);
  const { captions: rawCutCaptions } = useCutCaptions(videoId, captionsCompleted ?? false);

  const fullCaptionsCompleted = pipelineStatus?.steps["full-captions"]?.status === "completed";
  const { captions: fullCaptions } = useFullCaptions(videoId, fullCaptionsCompleted ?? false);

  const activeCaptions = postCutCaptions ?? fullCaptions;
  const captionSource: "post-cut" | "full" | null = postCutCaptions
    ? "post-cut"
    : fullCaptions
      ? "full"
      : null;

  // --- Effective captions (with local edits) ---
  const effectiveCaptions = editedCaptions ?? activeCaptions;
  const captionPages = useMemo(
    () => effectiveCaptions ? groupIntoPages(effectiveCaptions) : [],
    [effectiveCaptions]
  );

  // Initialize edited captions when active captions first arrive
  useEffect(() => {
    if (activeCaptions && !editedCaptions) {
      setEditedCaptions([...activeCaptions]);
    }
  }, [activeCaptions]);

  const handleEditCaption = useCallback((captionIndex: number, newText: string) => {
    setEditedCaptions(prev => {
      if (!prev) return prev;
      const updated = [...prev];
      updated[captionIndex] = { ...updated[captionIndex], text: newText };
      return updated;
    });
  }, []);

  const handleEditCaptionTime = useCallback(
    (captionIndex: number, newStartMs: number, newEndMs: number) => {
      setEditedCaptions(prev => {
        if (!prev) return prev;
        const updated = [...prev];
        updated[captionIndex] = {
          ...updated[captionIndex],
          startMs: newStartMs,
          endMs: newEndMs,
        };
        return updated;
      });
    },
    []
  );

  // --- Derived data ---
  const totalDuration = segmentsResult?.totalDuration ?? nativeVideoDuration ?? 0;
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
  const cutVideoSrc = cutFilename ? `/videos/${cutFilename}` : "";
  const durationInFrames = cutVideoDuration ? Math.floor(cutVideoDuration * FPS) : 0;

  const completedSteps = useMemo(() => {
    if (!pipelineStatus) return 0;
    return getCompletedCount(pipelineStatus);
  }, [pipelineStatus]);

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

  // --- "Cut desactualizado" detection ---
  const isCutOutdated = useMemo(() => {
    if (!cutMap || enabledSegments.length === 0) return false;
    if (cutMap.length !== enabledSegments.length) return true;
    const TOLERANCE_MS = 50;
    return cutMap.some((entry, i) => {
      const seg = enabledSegments[i];
      if (!seg) return true;
      return (
        Math.abs(entry.originalStartMs - seg.startMs) > TOLERANCE_MS ||
        Math.abs(entry.originalEndMs - seg.endMs) > TOLERANCE_MS
      );
    });
  }, [cutMap, enabledSegments]);

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

          if (status.steps.segments?.status === "completed") {
            const segRes = await fetch(
              `${API_URL}/api/pipeline/result?videoId=${encodeURIComponent(vid.id)}&step=segments`
            );
            if (segRes.ok) {
              const result = (await segRes.json()) as SegmentsResult;
              setSegmentsResult(result);
            }
          } else {
            setSegmentsResult(null);
          }

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
          } else {
            setPreselectionLog(null);
          }

          if (status.steps.cut?.status === "completed") {
            try {
              const cutRes = await fetch(
                `${API_URL}/api/pipeline/result?videoId=${encodeURIComponent(vid.id)}&step=cut`
              );
              if (cutRes.ok) {
                const cutResult = (await cutRes.json()) as { cutMap: CutMapEntry[] };
                setCutMap(cutResult.cutMap);
              }
            } catch {
              // cutMap is optional
            }
          } else {
            setCutMap(null);
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

  // Reset video source if current source becomes unavailable
  useEffect(() => {
    if (videoSource === "cut" && !canViewCut) setVideoSource("original");
    if (videoSource === "preview" && !canPreview) setVideoSource(canViewCut ? "cut" : "original");
  }, [canViewCut, canPreview, videoSource, setVideoSource]);

  // Pause all videos when switching sources
  useEffect(() => {
    videoRef.current?.pause();
    cutVideoRef.current?.pause();
    setIsPlaying(false);
  }, [videoSource]);

  // --- Clear stale persisted segments when pipeline hasn't produced them ---
  useEffect(() => {
    const segmentsCompleted = pipelineStatus?.steps.segments?.status === "completed";
    if (pipelineStatus && !segmentsCompleted && timelineSegments.length > 0) {
      clearTimeline(videoId);
    }
  }, [pipelineStatus, videoId, timelineSegments.length, clearTimeline]);

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

  // --- Skip disabled segments (original mode only) ---
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
    if (videoSource !== "original") return;
    if (!isPlaying || isJumpingRef.current || continuousPlay) return;
    if (enabledSegments.length === 0) return;
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
  }, [currentTimeMs, isPlaying, enabledSegments, performJump, continuousPlay, videoSource]);

  const togglePlayback = useCallback(() => {
    const v = activeVideoRef.current;
    if (!v) return;

    if (isPlaying) {
      v.pause();
    } else {
      if (videoSource === "original" && !continuousPlay) {
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
  }, [isPlaying, enabledSegments, mapTimeToEdited, continuousPlay, videoSource, activeVideoRef]);

  const handleSeekTo = useCallback((ms: number) => {
    if (activeVideoRef.current) {
      activeVideoRef.current.currentTime = ms / 1000;
    }
  }, [activeVideoRef]);

  const handleStepCompleted = useCallback(() => {
    if (video) {
      loadPipelineStatus(video);
    }
  }, [video, loadPipelineStatus]);

  // --- Show preselection log for a segment ---
  const handleShowLog = useCallback((_segmentId: string) => {
    // Open properties panel and switch to logs tab
    useEditorUIStore.getState().setPropertiesPanelOpen(true);
    useEditorUIStore.getState().setPropertiesPanelTab("logs");
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

  // --- Auto-switch to cut video as default when available ---
  const hasAutoSwitchedRef = useRef(false);
  useEffect(() => {
    if (canViewCut && videoSource === "original" && !hasAutoSwitchedRef.current) {
      // Only auto-switch once, and only if the user hasn't manually picked a source
      hasAutoSwitchedRef.current = true;
      setVideoSource("cut");
    }
  }, [canViewCut, videoSource, setVideoSource]);

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

  const showTimeline = totalDuration > 0 && videoPath;

  // Determine which captions to show on overlay
  const overlayCaptions =
    videoSource === "cut" ? rawCutCaptions :
    videoSource === "original" ? effectiveCaptions :
    null; // preview uses Remotion's own captions

  const hasCaptions = overlayCaptions !== null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ===== HEADER ===== */}
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
          {/* Pipeline drawer trigger */}
          <Button
            variant={pipelineDrawerOpen ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 gap-1.5"
            onClick={() => setPipelineDrawerOpen(!pipelineDrawerOpen)}
            title="Abrir pipeline"
          >
            <Zap className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* Source Toggle */}
          <SourceToggle
            videoSource={videoSource}
            canViewCut={canViewCut}
            canPreview={canPreview}
            isCutOutdated={isCutOutdated}
            onChangeSource={setVideoSource}
          />

          {/* Properties panel toggle */}
          <Button
            variant={propertiesPanelOpen ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 gap-1.5 hidden md:inline-flex"
            onClick={() => setPropertiesPanelOpen(!propertiesPanelOpen)}
            title={propertiesPanelOpen ? "Cerrar propiedades" : "Abrir propiedades"}
          >
            {propertiesPanelOpen ? (
              <PanelRightClose className="w-4 h-4" />
            ) : (
              <PanelRightOpen className="w-4 h-4" />
            )}
          </Button>
        </div>
      </header>

      {/* ===== PIPELINE DRAWER (Sheet) ===== */}
      <Sheet open={pipelineDrawerOpen} onOpenChange={setPipelineDrawerOpen}>
        <SheetContent side="left" className="w-[480px] sm:max-w-[480px] p-0" showCloseButton={false}>
          <SheetHeader className="sr-only">
            <SheetTitle>Pipeline</SheetTitle>
            <SheetDescription>Ejecutar y configurar pasos del pipeline</SheetDescription>
          </SheetHeader>
          {video && (
            <EditorPipelinePanel
              video={video}
              segmentsResult={segmentsResult}
              onStepCompleted={handleStepCompleted}
              onOpenLogs={preselectionLog ? () => {
                setPipelineDrawerOpen(false);
                setPropertiesPanelOpen(true);
                useEditorUIStore.getState().setPropertiesPanelTab("logs");
              } : undefined}
              onSeekTo={handleSeekTo}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* ===== MAIN BODY: Video + Properties Panel ===== */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Video player area */}
        <div className="flex-1 flex items-center justify-center bg-black min-h-0 overflow-hidden relative">
          {videoSource === "preview" && canPreview && durationInFrames > 0 ? (
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
          ) : videoSource === "cut" && canViewCut ? (
            <>
              {/* eslint-disable-next-line @remotion/warn-native-media-tag */}
              <video
                ref={(el) => { cutVideoRef.current = el; setCutVideoEl(el); }}
                src={cutVideoStreamUrl}
                className="max-h-full max-w-full object-contain"
                controls
                onClick={togglePlayback}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onError={() => {
                  toast.error("Error al cargar video cortado, volviendo a original");
                  setVideoSource("original");
                }}
              />

              {showCaptions && rawCutCaptions && (
                <VideoSubtitleOverlay captions={rawCutCaptions} currentTimeMs={currentTimeMs} />
              )}

              <TimeIndicator currentTime={currentTime} currentTimeMs={currentTimeMs} />
            </>
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
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration;
                  if (d && isFinite(d)) setNativeVideoDuration(d);
                }}
              />

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

              {showCaptions && effectiveCaptions && (
                <VideoSubtitleOverlay captions={effectiveCaptions} currentTimeMs={currentTimeMs} />
              )}

              <TimeIndicator
                currentTime={currentTime}
                totalDuration={totalDuration}
                currentTimeMs={currentTimeMs}
              />
            </>
          ) : (
            <div className="text-muted-foreground">Sin video</div>
          )}
        </div>

        {/* Properties Panel (right side) */}
        {propertiesPanelOpen && (
          <PropertiesPanel
            videoId={videoId}
            preselectionLog={preselectionLog}
            captionPages={captionPages}
            captions={effectiveCaptions ?? []}
            onSeekTo={handleSeekTo}
            onEditCaption={handleEditCaption}
            onEditCaptionTime={handleEditCaptionTime}
            onShowLog={preselectionLog ? handleShowLog : undefined}
          />
        )}
      </div>

      {/* ===== TIMELINE — ALWAYS VISIBLE ===== */}
      {showTimeline && (
        <div className="flex-shrink-0 border-t">
          <SegmentTimeline
            videoId={videoId}
            videoPath={videoPath}
            durationMs={totalDuration * 1000}
            currentTimeMs={currentTimeMs}
            onSeek={(ms) => {
              if (videoSource === "original" && videoRef.current) {
                videoRef.current.currentTime = ms / 1000;
              } else if (videoSource === "cut" && cutVideoRef.current) {
                // In cut mode, timeline shows original-space coordinates
                // but we need to seek the cut video. For now, use the original video seek.
                // TODO: map through coordinate space when timeline supports cut-space
                cutVideoRef.current.currentTime = ms / 1000;
              } else if (videoRef.current) {
                videoRef.current.currentTime = ms / 1000;
              }
            }}
            enablePlayheadTransition={isTransitioning}
            continuousPlay={continuousPlay}
            onShowLog={preselectionLog ? handleShowLog : undefined}
            captionPages={captionPages}
            selectedCaptionPageIndex={selectedCaptionPageIndex}
            onSelectCaptionPage={(idx) => {
              setSelectedCaptionPageIndex(idx);
              // Open properties panel with caption selected
              useEditorUIStore.getState().setSelection({
                type: "caption",
                index: idx,
                pageIndex: idx,
              });
            }}
          />
        </div>
      )}

      {/* ===== STATUS BAR ===== */}
      <footer className="flex items-center justify-between px-4 h-8 border-t bg-muted/30 text-xs flex-shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            {stats.selectedCount}/{stats.totalSegments} segmentos |{" "}
            {formatDuration(stats.selectedDuration)}
          </span>
          {videoSource !== "original" && (
            <span className="text-muted-foreground flex items-center gap-1.5">
              {videoSource === "preview" ? (
                <><Eye className="w-3 h-3" /> Preview</>
              ) : (
                <><Scissors className="w-3 h-3" /> Cut</>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* CC button */}
          {hasCaptions && videoSource !== "preview" && (
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
              <ShortcutTooltipContent shortcut="C">{showCaptions ? "Ocultar subtitulos" : "Mostrar subtitulos"}</ShortcutTooltipContent>
            </Tooltip>
          )}
          {showCaptions && captionSource && videoSource === "original" && (
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded",
              captionSource === "post-cut"
                ? "bg-emerald-600/20 text-emerald-400"
                : "bg-amber-600/20 text-amber-400"
            )}>
              {captionSource === "post-cut" ? "Post-Cuts" : "Full"}
            </span>
          )}
          {showCaptions && rawCutCaptions && videoSource === "cut" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-600/20 text-cyan-400">
              Cut-Subs
            </span>
          )}
          {videoSource === "original" && (
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
              <ShortcutTooltipContent shortcut="J">{continuousPlay ? "Reproduccion continua activa" : "Saltar segmentos deshabilitados"}</ShortcutTooltipContent>
            </Tooltip>
          )}
          {videoSource !== "preview" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={playbackRate !== 1 ? "default" : "ghost"}
                  size="sm"
                  className={cn("h-6 px-2 text-xs gap-1", playbackRate !== 1 && "bg-violet-600 hover:bg-violet-700 text-white")}
                  onClick={() => setPlaybackRate(prev => {
                    const idx = PLAYBACK_RATES.indexOf(prev as typeof PLAYBACK_RATES[number]);
                    return PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
                  })}
                >
                  <Gauge className="w-3.5 h-3.5" />
                  {playbackRate}x
                </Button>
              </TooltipTrigger>
              <ShortcutTooltipContent shortcut="R">Velocidad de reproduccion</ShortcutTooltipContent>
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

function SourceToggle({
  videoSource,
  canViewCut,
  canPreview,
  isCutOutdated,
  onChangeSource,
}: {
  videoSource: VideoSource;
  canViewCut: boolean;
  canPreview: boolean;
  isCutOutdated: boolean;
  onChangeSource: (s: VideoSource) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5">
      <SourceButton
        active={videoSource === "original"}
        onClick={() => onChangeSource("original")}
        icon={<Film className="w-3.5 h-3.5" />}
        label="Original"
      />
      <SourceButton
        active={videoSource === "cut"}
        onClick={() => onChangeSource("cut")}
        disabled={!canViewCut}
        icon={<Scissors className="w-3.5 h-3.5" />}
        label="Cut"
        badge={canViewCut && isCutOutdated ? "!" : undefined}
      />
      <SourceButton
        active={videoSource === "preview"}
        onClick={() => onChangeSource("preview")}
        disabled={!canPreview}
        icon={<Eye className="w-3.5 h-3.5" />}
        label="Preview"
      />
    </div>
  );
}

function SourceButton({
  active,
  onClick,
  disabled,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors",
        active
          ? "bg-background shadow-sm text-foreground font-medium"
          : "text-muted-foreground hover:text-foreground",
        disabled && "opacity-40 pointer-events-none"
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {badge && (
        <span className="w-3.5 h-3.5 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center font-bold">
          {badge}
        </span>
      )}
    </button>
  );
}

function TimeIndicator({
  currentTime,
  totalDuration,
  currentTimeMs,
}: {
  currentTime: number;
  totalDuration?: number;
  currentTimeMs: number;
}) {
  return (
    <div className="absolute bottom-3 right-3 bg-black/70 px-2 py-1 rounded text-white font-mono text-right">
      <div className="text-sm">
        {formatTime(currentTime)}
        {totalDuration !== undefined && ` / ${formatTime(totalDuration)}`}
      </div>
      <button
        type="button"
        className="text-[9px] text-white/50 hover:text-white cursor-pointer"
        onClick={() => {
          const ms = String(Math.round(currentTimeMs));
          navigator.clipboard.writeText(ms).then(() => toast.success(`Copiado: ${ms}ms`));
        }}
        title="Copiar ms"
      >
        {Math.round(currentTimeMs)}ms
      </button>
    </div>
  );
}
