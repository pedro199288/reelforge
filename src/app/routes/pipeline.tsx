import { createFileRoute, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback, createContext, useContext, type ReactNode } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import type { Video } from "@/components/VideoList";
import { VideoSidebarSkeleton } from "@/components/VideoSidebarSkeleton";
import { PipelineProgressColumn } from "@/components/PipelineProgressColumn";
import {
  ProcessingStatusInline,
  type ProcessingStepInfo,
  type ProcessingStatus,
} from "@/components/ProcessingStatusPanel";

const API_URL = "http://localhost:3012";

// Types for progress state shared between layout and child routes
interface ProcessProgress {
  step: string;
  progress: number;
  message: string;
}

// Context for header actions - allows child routes to render controls in the header
interface PipelineHeaderContextValue {
  setHeaderActions: (actions: ReactNode) => void;
  setProgressState: (state: ProgressState | null) => void;
}

interface ProgressState {
  stepInfoList: ProcessingStepInfo[];
  progressPercent: number;
  isProcessing: boolean;
  processProgress: ProcessProgress | null;
}

const PipelineHeaderContext = createContext<PipelineHeaderContextValue | null>(null);

export function usePipelineHeader() {
  const context = useContext(PipelineHeaderContext);
  if (!context) {
    throw new Error("usePipelineHeader must be used within PipelineLayout");
  }
  return context;
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

type StepStatus = "pending" | "running" | "completed" | "error";

interface StepState {
  status: StepStatus;
}

interface BackendPipelineStatus {
  videoId: string;
  filename: string;
  steps: Record<PipelineStep, StepState>;
}

interface VideoManifest {
  videos: Video[];
}

const STEPS: { key: PipelineStep; label: string }[] = [
  { key: "raw", label: "Raw" },
  { key: "silences", label: "Silencios" },
  { key: "segments", label: "Segmentos" },
  { key: "cut", label: "Cortado" },
  { key: "captions", label: "Captions" },
  { key: "effects-analysis", label: "Auto-Efectos" },
  { key: "rendered", label: "Renderizado" },
];

export const Route = createFileRoute("/pipeline")({
  component: PipelineLayout,
});

function getVideoPipelineState(
  video: Video,
  backendStatus?: BackendPipelineStatus | null
): PipelineState {
  if (backendStatus) {
    return {
      raw: true,
      silences: backendStatus.steps.silences?.status === "completed",
      segments: backendStatus.steps.segments?.status === "completed",
      cut: backendStatus.steps.cut?.status === "completed",
      captions: backendStatus.steps.captions?.status === "completed" || video.hasCaptions,
      "effects-analysis": backendStatus.steps["effects-analysis"]?.status === "completed",
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

function pipelineStateToStepInfo(state: PipelineState): ProcessingStepInfo[] {
  return STEPS.map((step) => {
    const status: ProcessingStatus = state[step.key] ? "completed" : "pending";
    return {
      key: step.key,
      label: step.label,
      status,
    };
  });
}

function PipelineLayout() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [allVideoStatuses, setAllVideoStatuses] = useState<Record<string, BackendPipelineStatus>>({});
  const [headerActions, setHeaderActions] = useState<ReactNode>(null);
  const [progressState, setProgressState] = useState<ProgressState | null>(null);

  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const selectedVideoId = params.videoId as string | undefined;
  const activeTab = (params.tab as string) || "raw";

  // Load videos from manifest
  useEffect(() => {
    fetch(`/videos.manifest.json?t=${Date.now()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load video manifest");
        return res.json() as Promise<VideoManifest>;
      })
      .then((data) => {
        setVideos(data.videos);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading videos:", err);
        setLoading(false);
      });
  }, []);

  // Load pipeline status for all videos
  const [apiError, setApiError] = useState<string | null>(null);

  const loadAllVideoStatuses = useCallback(async (videoList: Video[]) => {
    setApiError(null);
    for (const video of videoList) {
      try {
        const res = await fetch(
          `${API_URL}/api/pipeline/status?videoId=${encodeURIComponent(video.id)}&filename=${encodeURIComponent(video.filename)}`
        );
        if (res.ok) {
          const status = await res.json() as BackendPipelineStatus;
          setAllVideoStatuses(prev => ({ ...prev, [video.id]: status }));
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        console.error("Error loading pipeline status for", video.id, ":", err);
        setApiError(`Servidor API no disponible: ${message}`);
        break; // Stop trying other videos if server is down
      }
    }
  }, []);

  useEffect(() => {
    if (videos.length > 0) {
      loadAllVideoStatuses(videos);
    }
  }, [videos, loadAllVideoStatuses]);

  // Navigate to video
  const handleSelectVideo = useCallback((video: Video) => {
    navigate({
      to: "/pipeline/$videoId/$tab",
      params: { videoId: video.id, tab: "raw" },
    });
  }, [navigate]);

  const sidebarContent = useMemo(() => {
    if (loading) {
      return <VideoSidebarSkeleton count={3} />;
    }

    return videos.map((video) => {
      const videoBackendStatus = allVideoStatuses[video.id] ?? null;
      const state = getVideoPipelineState(video, videoBackendStatus);
      const completed = getCompletedSteps(state);
      const videoStepInfo = pipelineStateToStepInfo(state);

      return (
        <button
          key={video.id}
          onClick={() => handleSelectVideo(video)}
          className={`w-full text-left p-3 rounded-lg border transition-colors ${
            selectedVideoId === video.id
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
    });
  }, [videos, loading, allVideoStatuses, selectedVideoId, handleSelectVideo]);

  // Get selected video
  const selectedVideo = useMemo(() => {
    return videos.find((v) => v.id === selectedVideoId) ?? null;
  }, [videos, selectedVideoId]);

  // Handle step click navigation
  const handleStepClick = useCallback((step: string) => {
    if (selectedVideoId) {
      navigate({
        to: "/pipeline/$videoId/$tab",
        params: { videoId: selectedVideoId, tab: step },
      });
    }
  }, [navigate, selectedVideoId]);

  const headerContextValue = useMemo(
    () => ({ setHeaderActions, setProgressState }),
    [setHeaderActions, setProgressState]
  );

  return (
    <PipelineHeaderContext.Provider value={headerContextValue}>
      <div className="px-4 py-4 h-full flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-4 flex-none">
          <h1 className="text-2xl font-bold">Pipeline Dashboard</h1>
          {headerActions && (
            <div className="flex items-center gap-3">
              {headerActions}
            </div>
          )}
        </div>

        {/* API Server Error */}
        {apiError && (
          <Alert variant="destructive" className="mb-4 flex-none">
            <AlertTitle>Error de conexión al servidor</AlertTitle>
            <AlertDescription>
              {apiError}. Ejecuta <code className="bg-destructive/20 px-1 rounded">bun run server</code> para iniciar el servidor API.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
          {/* Video Sidebar */}
          <Card className="lg:col-span-2 min-h-0 overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Videos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 overflow-y-auto">
              {sidebarContent}
            </CardContent>
          </Card>

          {/* Progress Column */}
          <div className="lg:col-span-2 min-h-0">
            <PipelineProgressColumn
              videoTitle={selectedVideo?.title ?? null}
              progressPercent={progressState?.progressPercent ?? 0}
              stepInfoList={progressState?.stepInfoList ?? []}
              activeTab={activeTab}
              onStepClick={handleStepClick}
              isProcessing={progressState?.isProcessing}
              processProgress={progressState?.processProgress}
            />
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-8 flex flex-col min-h-0">
            <Outlet />
          </div>
        </div>
      </div>
    </PipelineHeaderContext.Provider>
  );
}
