import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Player, type PlayerRef } from "@remotion/player";
import { CaptionedVideoForPlayer } from "@/remotion-compositions/CaptionedVideo/ForPlayer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Video } from "@/components/VideoList";
import {
  useSubtitleStore,
  HIGHLIGHT_COLORS,
  AVAILABLE_FONTS,
} from "@/store/subtitles";
import {
  useTimelineShortcuts,
  TIMELINE_SHORTCUTS,
} from "@/hooks/useTimelineShortcuts";
import { useHotkeys } from "react-hotkeys-hook";
import { Timeline } from "@/components/Timeline";
import {
  useTimelineStore,
  useVideoTimeline,
  usePlayhead,
  useIsPlaying,
} from "@/store/timeline";
import type {
  AlignedEvent,
  ZoomEvent,
  HighlightEvent,
  Caption,
} from "@/core/script/align";

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
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [captions, setCaptions] = useState<Caption[]>([]);

  // Refs to prevent sync loops
  const isSyncingFromPlayer = useRef(false);
  const isSyncingToPlayer = useRef(false);

  const { highlightColor, setHighlightColor, fontFamily, setFontFamily } =
    useSubtitleStore();

  // Timeline store integration - use store as single source of truth for playback
  const {
    setPlayhead,
    play: timelinePlay,
    pause: timelinePause,
  } = useTimelineStore();
  const timelinePlayhead = usePlayhead();
  const isPlaying = useIsPlaying(); // Single source of truth for play state
  const timeline = useVideoTimeline(selectedVideo?.id ?? "");

  // Convert timeline store data to AlignedEvent[] for player
  const timelineEvents = useMemo<AlignedEvent[]>(() => {
    if (!selectedVideo) return [];
    const events: AlignedEvent[] = [];

    for (const zoom of timeline.zooms) {
      events.push({
        type: "zoom",
        style: zoom.type,
        timestampMs: zoom.startMs,
        durationMs: zoom.durationMs,
        confidence: 1,
      } satisfies ZoomEvent);
    }

    for (const highlight of timeline.highlights) {
      events.push({
        type: "highlight",
        word: highlight.word,
        startMs: highlight.startMs,
        endMs: highlight.endMs,
        confidence: 1,
      } satisfies HighlightEvent);
    }

    return events;
  }, [selectedVideo, timeline.zooms, timeline.highlights]);

  const fps = 30;
  const durationInFrames = videoDuration ? Math.floor(videoDuration * fps) : 0;

  // Timeline keyboard shortcuts
  useTimelineShortcuts({
    playerRef,
    durationInFrames,
    fps,
    enabled: !!selectedVideo && !!videoDuration && !showShortcuts,
  });

  // Show shortcuts help with '?'
  useHotkeys("shift+/", () => setShowShortcuts((prev) => !prev), {
    enabled: !!selectedVideo,
  });

  // Close shortcuts modal with Escape
  useHotkeys("escape", () => setShowShortcuts(false), {
    enabled: showShortcuts,
  });

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

  // Load captions when video changes
  useEffect(() => {
    if (!selectedVideo) {
      setCaptions([]);
      return;
    }

    const captionsFile = selectedVideo.filename
      .replace(/.mp4$/, ".json")
      .replace(/.mkv$/, ".json")
      .replace(/.mov$/, ".json")
      .replace(/.webm$/, ".json");

    fetch(`/${captionsFile}`)
      .then((res) => {
        if (!res.ok) return [];
        return res.json() as Promise<Caption[]>;
      })
      .then(setCaptions)
      .catch(() => setCaptions([]));
  }, [selectedVideo]);

  // Sync timeline playhead changes to player (only when NOT playing)
  // During playback, the player is the source of truth and updates the store
  // This effect only handles manual seeks from timeline UI
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !videoDuration) return;

    // Skip sync during playback - player is source of truth
    if (isPlaying) return;

    // Skip if this change came from the player itself
    if (isSyncingFromPlayer.current) {
      isSyncingFromPlayer.current = false;
      return;
    }

    const targetFrame = Math.round((timelinePlayhead / 1000) * fps);
    const currentFrame = player.getCurrentFrame();

    // Only seek if difference is significant (avoid feedback loops)
    if (Math.abs(targetFrame - currentFrame) > 1) {
      isSyncingToPlayer.current = true;
      player.seekTo(targetFrame);
    }
  }, [timelinePlayhead, videoDuration, fps, isPlaying]);

  // Sync store play/pause state to player
  // Ref to track if we initiated the play/pause to avoid loops
  const isSyncingPlayState = useRef(false);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    // Skip if we're responding to a player event
    if (isSyncingPlayState.current) {
      isSyncingPlayState.current = false;
      return;
    }

    // Sync store state to player
    if (isPlaying && !player.isPlaying()) {
      player.play();
    } else if (!isPlaying && player.isPlaying()) {
      player.pause();
    }
  }, [isPlaying]);

  // Sync player frame updates to timeline (during playback only)
  // Track last synced value to avoid unnecessary store updates
  const lastSyncedMs = useRef<number>(-1);

  useEffect(() => {
    const player = playerRef.current;
    // Only run RAF loop when playing
    if (!player || !isPlaying) return;

    let rafId: number;
    const updateLoop = () => {
      const currentFrame = player.getCurrentFrame();
      const currentMs = (currentFrame / fps) * 1000;

      // Only update store if value changed significantly (avoid excessive updates)
      if (Math.abs(currentMs - lastSyncedMs.current) > 16) {
        lastSyncedMs.current = currentMs;
        isSyncingFromPlayer.current = true;
        setPlayhead(currentMs);
      }

      rafId = requestAnimationFrame(updateLoop);
    };

    rafId = requestAnimationFrame(updateLoop);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [isPlaying, fps, setPlayhead]);

  const handleVideoSelect = useCallback(
    (video: Video) => {
      setSelectedVideo(video);
      timelinePause(); // Use store action instead of local state
      navigate({
        to: "/studio",
        search: { videoId: video.id },
        replace: true,
      });
    },
    [navigate, timelinePause],
  );

  // Listen to player events and sync with timeline store
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onPlay = () => {
      isSyncingPlayState.current = true;
      timelinePlay();
    };
    const onPause = () => {
      isSyncingPlayState.current = true;
      timelinePause();
    };
    const onSeeked = () => {
      // Skip if this seek was initiated from the store
      if (isSyncingToPlayer.current) {
        isSyncingToPlayer.current = false;
        return;
      }
      const frame = player.getCurrentFrame();
      const ms = (frame / fps) * 1000;
      isSyncingFromPlayer.current = true;
      setPlayhead(ms);
    };

    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("seeked", onSeeked);

    return () => {
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("seeked", onSeeked);
    };
  }, [
    selectedVideo,
    videoDuration,
    fps,
    timelinePlay,
    timelinePause,
    setPlayhead,
  ]);

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
                  fontFamily,
                  timelineEvents:
                    timelineEvents.length > 0 ? timelineEvents : undefined,
                }}
                durationInFrames={durationInFrames}
                compositionWidth={1080}
                compositionHeight={1920}
                fps={fps}
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

        {/* Timeline editor */}
        {selectedVideo && videoDuration && captions.length > 0 && (
          <div className="border-t border-white/10 p-2 bg-background max-h-[300px] overflow-auto">
            <Timeline
              videoId={selectedVideo.id}
              durationMs={videoDuration * 1000}
              captions={captions}
            />
          </div>
        )}

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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowShortcuts(true)}
              title="Keyboard shortcuts (?)"
              className="text-white/60 hover:text-white"
            >
              <KeyboardIcon />
            </Button>
          </div>
        )}

        {/* Keyboard shortcuts modal */}
        {showShortcuts && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowShortcuts(false)}
          >
            <div
              className="bg-background rounded-lg p-6 max-w-sm w-full mx-4 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowShortcuts(false)}
                  className="h-8 w-8 p-0"
                >
                  <CloseIcon />
                </Button>
              </div>
              <div className="space-y-2">
                {TIMELINE_SHORTCUTS.map((shortcut) => (
                  <div
                    key={shortcut.key}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm text-muted-foreground">
                      {shortcut.description}
                    </span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                      {shortcut.key}
                    </kbd>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Press <kbd className="px-1 bg-muted rounded">?</kbd> to toggle
                this panel or <kbd className="px-1 bg-muted rounded">Esc</kbd>{" "}
                to close
              </p>
            </div>
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

        {/* Font selector */}
        <div className="border-t border-border p-4 space-y-3">
          <h3 className="text-sm font-medium">Font</h3>
          <div className="flex flex-col gap-1">
            {AVAILABLE_FONTS.map((font) => (
              <button
                key={font.id}
                type="button"
                className={`px-3 py-2 text-left rounded-md transition-all ${
                  fontFamily === font.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent"
                }`}
                style={{ fontFamily: font.id }}
                onClick={() => setFontFamily(font.id)}
              >
                {font.name}
              </button>
            ))}
          </div>
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

function KeyboardIcon() {
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
      <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
      <line x1="6" y1="8" x2="6" y2="8" />
      <line x1="10" y1="8" x2="10" y2="8" />
      <line x1="14" y1="8" x2="14" y2="8" />
      <line x1="18" y1="8" x2="18" y2="8" />
      <line x1="6" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="18" y2="12" />
      <line x1="8" y1="16" x2="16" y2="16" />
    </svg>
  );
}

function CloseIcon() {
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
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
