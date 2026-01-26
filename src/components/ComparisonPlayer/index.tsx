import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TimelineSegment } from "@/store/timeline";

interface ComparisonPlayerProps {
  videoSrc: string;
  durationMs: number;
  segments: TimelineSegment[];
  mode: "original" | "edited";
  onModeChange: (mode: "original" | "edited") => void;
  onTimeUpdate?: (originalMs: number, editedMs: number | null) => void;
  className?: string;
}

export function ComparisonPlayer({
  videoSrc,
  durationMs,
  segments,
  mode,
  onModeChange,
  onTimeUpdate,
  className,
}: ComparisonPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Get only enabled segments
  const enabledSegments = useMemo(
    () => segments.filter((s) => s.enabled).sort((a, b) => a.startMs - b.startMs),
    [segments]
  );

  // Calculate edited duration
  const editedDurationMs = useMemo(
    () => enabledSegments.reduce((sum, s) => sum + (s.endMs - s.startMs), 0),
    [enabledSegments]
  );

  // Map original time to edited time
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

      // Time is in a silence/cut region
      return null;
    },
    [enabledSegments]
  );

  // Map edited time back to original time
  const mapTimeToOriginal = useCallback(
    (editedMs: number): number => {
      let accumulatedEdited = 0;

      for (const segment of enabledSegments) {
        const segmentDuration = segment.endMs - segment.startMs;
        if (editedMs < accumulatedEdited + segmentDuration) {
          return segment.startMs + (editedMs - accumulatedEdited);
        }
        accumulatedEdited += segmentDuration;
      }

      // Beyond end, return last segment end
      const lastSegment = enabledSegments[enabledSegments.length - 1];
      return lastSegment ? lastSegment.endMs : 0;
    },
    [enabledSegments]
  );

  // Handle video time update
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const originalMs = video.currentTime * 1000;
      setCurrentTimeMs(originalMs);

      const editedMs = mapTimeToEdited(originalMs);
      onTimeUpdate?.(originalMs, editedMs);

      // In edited mode, skip silences
      if (mode === "edited" && isPlaying) {
        const isInSilence = editedMs === null;
        if (isInSilence) {
          // Find next segment start
          const nextSegment = enabledSegments.find((s) => s.startMs > originalMs);
          if (nextSegment) {
            video.currentTime = nextSegment.startMs / 1000;
          } else {
            // End of video
            video.pause();
            setIsPlaying(false);
          }
        }
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [mode, isPlaying, enabledSegments, mapTimeToEdited, onTimeUpdate]);

  // Handle play/pause
  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  // Handle seek
  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const video = videoRef.current;
      if (!video) return;

      if (mode === "original") {
        video.currentTime = parseFloat(e.target.value) / 1000;
      } else {
        // In edited mode, map the slider position to original time
        const editedMs = parseFloat(e.target.value);
        const originalMs = mapTimeToOriginal(editedMs);
        video.currentTime = originalMs / 1000;
      }
    },
    [mode, mapTimeToOriginal]
  );

  // Calculate displayed time
  const displayedTimeMs =
    mode === "original" ? currentTimeMs : (mapTimeToEdited(currentTimeMs) ?? 0);
  const displayedDurationMs = mode === "original" ? durationMs : editedDurationMs;

  // Calculate time savings
  const timeSavedMs = durationMs - editedDurationMs;
  const savingsPercent = durationMs > 0 ? Math.round((timeSavedMs / durationMs) * 100) : 0;

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Mode toggle */}
      <div className="flex items-center justify-between p-2 bg-muted/30 border-b">
        <div className="flex items-center gap-2">
          <Button
            variant={mode === "original" ? "default" : "outline"}
            size="sm"
            onClick={() => onModeChange("original")}
          >
            Original
          </Button>
          <Button
            variant={mode === "edited" ? "default" : "outline"}
            size="sm"
            onClick={() => onModeChange("edited")}
          >
            Sin silencios
          </Button>
        </div>

        {segments.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {savingsPercent > 0 && `${savingsPercent}% shorter`}
          </Badge>
        )}
      </div>

      {/* Video player */}
      <div className="relative flex-1 bg-black flex items-center justify-center">
        {/* eslint-disable-next-line @remotion/warn-native-media-tag -- Not a Remotion composition */}
        <video
          ref={videoRef}
          src={videoSrc}
          className="max-w-full max-h-full object-contain"
          onClick={togglePlayback}
        />

        {/* Play/Pause overlay */}
        {!isPlaying && (
          <button
            type="button"
            className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer"
            onClick={togglePlayback}
          >
            <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-8 h-8 text-black ml-1"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
          </button>
        )}
      </div>

      {/* Time indicator */}
      <div className="p-3 bg-muted/20 border-t space-y-2">
        {/* Dual time display */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="font-mono">
              {formatTime(displayedTimeMs)} / {formatTime(displayedDurationMs)}
            </span>
            {mode === "edited" && segments.length > 0 && (
              <span className="text-muted-foreground text-xs">
                (original: {formatTime(currentTimeMs)})
              </span>
            )}
          </div>
          {segments.length > 0 && (
            <span className="text-xs text-muted-foreground">
              Ahorro: {formatTime(timeSavedMs)}
            </span>
          )}
        </div>

        {/* Seek slider */}
        <input
          type="range"
          min={0}
          max={displayedDurationMs}
          value={displayedTimeMs}
          onChange={handleSeek}
          className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
        />

        {/* Playback controls */}
        <div className="flex items-center justify-center gap-2">
          <Button variant="ghost" size="sm" onClick={togglePlayback}>
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </Button>
        </div>
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

export default ComparisonPlayer;
