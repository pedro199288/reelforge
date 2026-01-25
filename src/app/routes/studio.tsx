import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Player, type PlayerRef } from "@remotion/player";
import { CaptionedVideoForPlayer } from "@/CaptionedVideo/ForPlayer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Video } from "@/components/VideoList";
import { useSubtitleStore, HIGHLIGHT_COLORS } from "@/store/subtitles";

interface VideoManifest {
  videos: Video[];
}

export const Route = createFileRoute("/studio")({
  component: StudioPage,
  validateSearch: (search: Record<string, unknown>) => ({
    videoId: (search.videoId as string) || undefined,
  }),
});

function StudioPage() {
  const { videoId } = Route.useSearch();
  const navigate = useNavigate();
  const playerRef = useRef<PlayerRef>(null);

  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);

  const { highlightColor, setHighlightColor } = useSubtitleStore();

  // Load video manifest
  useEffect(() => {
    fetch("/videos.manifest.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load video manifest");
        return res.json() as Promise<VideoManifest>;
      })
      .then((data) => {
        // Only show videos with captions for the studio
        const videosWithCaptions = data.videos.filter((v) => v.hasCaptions);
        setVideos(videosWithCaptions);

        // Auto-select video from URL or first available
        if (videoId) {
          const found = videosWithCaptions.find((v) => v.id === videoId);
          if (found) setSelectedVideo(found);
        } else if (videosWithCaptions.length > 0) {
          setSelectedVideo(videosWithCaptions[0]);
        }

        setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        toast.error("Error loading videos", {
          description: err.message || "Failed to load video manifest",
        });
      });
  }, [videoId]);

  // Load video duration when video changes
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
      // Fallback duration if we can't load metadata
      setVideoDuration(60);
    };
  }, [selectedVideo]);

  const handleVideoSelect = useCallback(
    (video: Video) => {
      setSelectedVideo(video);
      setIsPlaying(false);
      navigate({
        to: "/studio",
        search: { videoId: video.id },
        replace: true,
      });
    },
    [navigate],
  );

  // Listen to player events
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);

    return () => {
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
    };
  }, [selectedVideo, videoDuration]);

  const handleToggle = () => playerRef.current?.toggle();
  const handleSeekStart = () => playerRef.current?.seekTo(0);

  if (loading) {
    return (
      <div className="h-full flex">
        <div className="flex-1 flex flex-col bg-black/90">
          <div className="flex-1 flex items-center justify-center p-4">
            <div
              style={{
                width: "100%",
                maxWidth: 400,
                aspectRatio: "9/16",
              }}
            >
              <Skeleton className="w-full h-full rounded-lg" />
            </div>
          </div>
          <div className="border-t border-white/10 p-4 flex items-center justify-center gap-3">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </div>
        <div className="w-80 border-l border-border flex flex-col bg-background">
          <div className="p-4 border-b border-border">
            <Skeleton className="h-6 w-16 mb-1" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <Skeleton className="h-3 w-16 mb-2" />
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader className="p-3 pb-1">
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Studio</h1>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground mb-4">
              No videos with captions available.
            </p>
            <p className="text-sm text-muted-foreground">
              Process videos through the Pipeline to generate captions first.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Main player area */}
      <div className="flex-1 flex flex-col bg-black/90">
        {/* Player container */}
        <div className="flex-1 flex items-center justify-center p-4">
          {selectedVideo && videoDuration ? (
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
                  src: `/${selectedVideo.filename}`,
                  highlightColor,
                }}
                durationInFrames={Math.floor(videoDuration * 30)}
                compositionWidth={1080}
                compositionHeight={1920}
                fps={30}
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
          ) : (
            <div className="text-white/50">Select a video to preview</div>
          )}
        </div>

        {/* Controls bar */}
        {selectedVideo && (
          <div className="border-t border-white/10 p-4 flex items-center justify-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSeekStart}
              title="Go to start"
            >
              <SkipBackIcon />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleToggle}
              className="w-24"
            >
              {isPlaying ? (
                <>
                  <PauseIcon className="mr-2" /> Pause
                </>
              ) : (
                <>
                  <PlayIcon className="mr-2" /> Play
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="w-80 border-l border-border flex flex-col bg-background">
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-semibold">Studio</h1>
          <p className="text-sm text-muted-foreground">
            Preview compositions with captions
          </p>
        </div>

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
                  <span className="truncate max-w-[120px]">
                    {video.filename}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    Captions
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Highlight color selector */}
        <div className="border-t border-border p-4 space-y-3">
          <h3 className="text-sm font-medium">Highlight Color</h3>
          <div className="flex flex-wrap gap-2">
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  highlightColor === color.value
                    ? "border-white ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : "border-transparent hover:border-white/50"
                }`}
                style={{ backgroundColor: color.value }}
                onClick={() => setHighlightColor(color.value)}
                title={color.name}
              />
            ))}
          </div>
        </div>

        {/* Info panel */}
        {selectedVideo && (
          <div className="border-t border-border p-4 space-y-2">
            <h3 className="text-sm font-medium">Current Video</h3>
            <p className="text-sm truncate">{selectedVideo.title}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(selectedVideo.size)}
              {videoDuration && ` \u2022 ${formatDuration(videoDuration)}`}
            </p>
          </div>
        )}
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

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function PlayIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function PauseIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

function SkipBackIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="19 20 9 12 19 4 19 20" />
      <line x1="5" y1="19" x2="5" y2="5" />
    </svg>
  );
}
