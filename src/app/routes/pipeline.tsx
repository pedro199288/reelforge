import { createFileRoute, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Video } from "@/components/VideoList";
import { useWorkspaceStore } from "@/store/workspace";
import { useTimelineStore } from "@/store/timeline";
import { VideoSidebarSkeleton } from "@/components/VideoSidebarSkeleton";
import {
  ProcessingStatusInline,
  type ProcessingStepInfo,
  type ProcessingStatus,
} from "@/components/ProcessingStatusPanel";

const API_URL = "http://localhost:3012";

type PipelineStep =
  | "raw"
  | "silences"
  | "captions-raw"
  | "segments"
  | "semantic"
  | "effects-analysis"
  | "cut"
  | "captions"
  | "script"
  | "take-selection"
  | "rendered";

interface PipelineState {
  raw: boolean;
  silences: boolean;
  "captions-raw": boolean;
  segments: boolean;
  semantic: boolean;
  "effects-analysis": boolean;
  cut: boolean;
  captions: boolean;
  script: boolean;
  "take-selection": boolean;
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
  { key: "captions-raw", label: "Transcripcion (Raw)" },
  { key: "segments", label: "Segmentos" },
  { key: "semantic", label: "Semantico" },
  { key: "effects-analysis", label: "Auto-Efectos" },
  { key: "cut", label: "Cortado" },
  { key: "captions", label: "Captions" },
  { key: "script", label: "Script" },
  { key: "take-selection", label: "Tomas" },
  { key: "rendered", label: "Renderizado" },
];

export const Route = createFileRoute("/pipeline")({
  component: PipelineLayout,
});

function getVideoPipelineState(
  video: Video,
  hasTakeSelections?: boolean,
  hasScriptEvents?: boolean,
  backendStatus?: BackendPipelineStatus | null
): PipelineState {
  if (backendStatus) {
    return {
      raw: true,
      silences: backendStatus.steps.silences?.status === "completed",
      "captions-raw": backendStatus.steps["captions-raw"]?.status === "completed",
      segments: backendStatus.steps.segments?.status === "completed",
      semantic: backendStatus.steps.semantic?.status === "completed",
      "effects-analysis": backendStatus.steps["effects-analysis"]?.status === "completed",
      cut: backendStatus.steps.cut?.status === "completed",
      captions: backendStatus.steps.captions?.status === "completed" || video.hasCaptions,
      script: hasScriptEvents ?? false,
      "take-selection": hasTakeSelections ?? false,
      rendered: false,
    };
  }

  return {
    raw: true,
    silences: false,
    "captions-raw": false,
    segments: false,
    semantic: false,
    "effects-analysis": false,
    cut: false,
    captions: false,
    script: hasScriptEvents ?? false,
    "take-selection": hasTakeSelections ?? false,
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

  const takeSelections = useWorkspaceStore((state) => state.takeSelections);
  const timelines = useTimelineStore((state) => state.timelines);

  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const selectedVideoId = params.videoId as string | undefined;

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
  const loadAllVideoStatuses = useCallback(async (videoList: Video[]) => {
    for (const video of videoList) {
      try {
        const res = await fetch(
          `${API_URL}/api/pipeline/status?videoId=${encodeURIComponent(video.id)}&filename=${encodeURIComponent(video.filename)}`
        );
        if (res.ok) {
          const status = await res.json() as BackendPipelineStatus;
          setAllVideoStatuses(prev => ({ ...prev, [video.id]: status }));
        }
      } catch (err) {
        console.error("Error loading pipeline status:", err);
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
      const hasTakes = video.id in takeSelections &&
        Object.keys(takeSelections[video.id]?.selections || {}).length > 0;
      const videoTimeline = timelines[video.id];
      const hasScriptEvts = videoTimeline &&
        (videoTimeline.zooms.length > 0 || videoTimeline.highlights.length > 0);
      const videoBackendStatus = allVideoStatuses[video.id] ?? null;
      const state = getVideoPipelineState(video, hasTakes, hasScriptEvts, videoBackendStatus);
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
  }, [videos, loading, takeSelections, timelines, allVideoStatuses, selectedVideoId, handleSelectVideo]);

  return (
    <div className="p-6 max-w-6xl mx-auto h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-6 flex-none">
        <h1 className="text-2xl font-bold">Pipeline Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
        {/* Video Sidebar */}
        <Card className="lg:col-span-1 min-h-0 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Videos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 overflow-y-auto">
            {sidebarContent}
          </CardContent>
        </Card>

        {/* Main Content Area */}
        <div className="lg:col-span-3 flex flex-col min-h-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
