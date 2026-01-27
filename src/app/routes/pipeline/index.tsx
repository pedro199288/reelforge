import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Video } from "@/components/VideoList";
import { useWorkspaceStore } from "@/store/workspace";
import { useTimelineStore } from "@/store/timeline";
import { VideoSidebarSkeleton } from "@/components/VideoSidebarSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
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
  { key: "captions-raw", label: "Transcripción (Raw)" },
  { key: "segments", label: "Segmentos" },
  { key: "semantic", label: "Semántico" },
  { key: "cut", label: "Cortado" },
  { key: "captions", label: "Captions" },
  { key: "script", label: "Script" },
  { key: "take-selection", label: "Tomas" },
  { key: "rendered", label: "Renderizado" },
];

export const Route = createFileRoute("/pipeline/")({
  component: PipelineIndexPage,
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

function PipelineIndexPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allVideoStatuses, setAllVideoStatuses] = useState<Record<string, BackendPipelineStatus>>({});

  const takeSelections = useWorkspaceStore((state) => state.takeSelections);
  const timelines = useTimelineStore((state) => state.timelines);

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
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (videos.length === 0) return;

    const loadStatuses = async () => {
      for (const video of videos) {
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
    };

    loadStatuses();
  }, [videos]);

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-48" />
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
              <CardContent className="py-8 text-center text-muted-foreground">
                <Skeleton className="h-4 w-48 mx-auto" />
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
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-6 flex-none">
        <h1 className="text-2xl font-bold">Pipeline Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
        {/* Video Selector */}
        <Card className="lg:col-span-1 min-h-0 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Videos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 overflow-y-auto">
            {videos.map((video) => {
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
                <Link
                  key={video.id}
                  to="/pipeline/$videoId/$tab"
                  params={{ videoId: video.id, tab: "raw" }}
                  className="block w-full text-left p-3 rounded-lg border border-transparent hover:bg-muted transition-colors"
                >
                  <div className="font-medium text-sm truncate">
                    {video.title}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <Progress value={(completed / STEPS.length) * 100} className="h-1 flex-1" />
                    <ProcessingStatusInline steps={videoStepInfo} />
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        {/* Empty state */}
        <div className="lg:col-span-3 flex flex-col min-h-0">
          <Card className="flex-1 flex items-center justify-center">
            <CardContent className="py-12 text-center">
              <div className="text-muted-foreground mb-2">
                Selecciona un video para ver su pipeline
              </div>
              <p className="text-sm text-muted-foreground/70">
                Haz clic en un video de la lista para ver y ejecutar los pasos del pipeline
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
