import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Play,
  Pause,
  Clock,
  Scissors,
  CheckCircle2,
  XCircle,
  Eye,
  Film,
} from "lucide-react";
import {
  useVideoSegments,
  useTimelineActions,
  type TimelineSegment,
} from "@/store/timeline";

interface Segment {
  startTime: number;
  endTime: number;
  duration: number;
  index: number;
}

interface SegmentEditorPanelProps {
  videoId: string;
  videoPath: string;
  segments: Segment[];
  totalDuration: number;
  onSegmentsChange?: (segments: TimelineSegment[]) => void;
}

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

export function SegmentEditorPanel({
  videoId,
  videoPath,
  segments,
  totalDuration,
  onSegmentsChange,
}: SegmentEditorPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mode, setMode] = useState<"full" | "preview">("full");

  // Get segments from timeline store (these are the editable ones with enabled state)
  const timelineSegments = useVideoSegments(videoId);
  const { importSemanticSegments, toggleSegment } = useTimelineActions();

  // Initialize timeline segments from prop segments if empty
  useEffect(() => {
    if (timelineSegments.length === 0 && segments.length > 0) {
      const segmentsForStore = segments.map((s) => ({
        startMs: s.startTime * 1000,
        endMs: s.endTime * 1000,
      }));
      importSemanticSegments(videoId, segmentsForStore, []);
    }
  }, [videoId, segments, timelineSegments.length, importSemanticSegments]);

  // Notify parent when segments change
  useEffect(() => {
    if (timelineSegments.length > 0) {
      onSegmentsChange?.(timelineSegments);
    }
  }, [timelineSegments, onSegmentsChange]);

  // Get enabled segments sorted by time
  const enabledSegments = useMemo(
    () =>
      timelineSegments
        .filter((s) => s.enabled)
        .sort((a, b) => a.startMs - b.startMs),
    [timelineSegments]
  );

  // Calculate statistics
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

  // Map original time to edited time (for preview mode)
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

  // Handle video time update
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const currentMs = video.currentTime * 1000;
      setCurrentTime(video.currentTime);

      // In preview mode, skip silences
      if (mode === "preview" && isPlaying) {
        const editedMs = mapTimeToEdited(currentMs);
        const isInSilence = editedMs === null;

        if (isInSilence) {
          // Find next enabled segment
          const nextSegment = enabledSegments.find((s) => s.startMs > currentMs);
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

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
    };
  }, [mode, isPlaying, enabledSegments, mapTimeToEdited]);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      // In preview mode, if starting from a cut region, jump to next segment
      if (mode === "preview") {
        const currentMs = video.currentTime * 1000;
        const editedMs = mapTimeToEdited(currentMs);
        if (editedMs === null) {
          const nextSegment = enabledSegments.find((s) => s.startMs > currentMs);
          if (nextSegment) {
            video.currentTime = nextSegment.startMs / 1000;
          } else if (enabledSegments.length > 0) {
            video.currentTime = enabledSegments[0].startMs / 1000;
          }
        }
      }
      video.play();
    }
  }, [isPlaying, mode, enabledSegments, mapTimeToEdited]);

  const handleSeekTo = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
  }, []);

  const handleSelectAll = useCallback(() => {
    // Enable all segments
    for (const segment of timelineSegments) {
      if (!segment.enabled) {
        toggleSegment(videoId, segment.id);
      }
    }
  }, [videoId, timelineSegments, toggleSegment]);

  const handleSelectNone = useCallback(() => {
    // Disable all segments
    for (const segment of timelineSegments) {
      if (segment.enabled) {
        toggleSegment(videoId, segment.id);
      }
    }
  }, [videoId, timelineSegments, toggleSegment]);

  const handleToggle = useCallback(
    (segmentId: string) => {
      toggleSegment(videoId, segmentId);
    },
    [videoId, toggleSegment]
  );

  // Find which segment (if any) the current time is in
  const currentSegmentIndex = useMemo(() => {
    const currentMs = currentTime * 1000;
    return timelineSegments.findIndex(
      (s) => currentMs >= s.startMs && currentMs <= s.endMs
    );
  }, [currentTime, timelineSegments]);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Video Player Section */}
      <Card className="flex-shrink-0">
        <CardContent className="p-0">
          <div className="relative aspect-video bg-black">
            {/* eslint-disable-next-line @remotion/warn-native-media-tag -- Not a Remotion composition */}
            <video
              ref={videoRef}
              src={videoPath}
              className="w-full h-full object-contain"
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
                  <Play className="w-8 h-8 text-black ml-1" />
                </div>
              </button>
            )}

            {/* Mode indicator */}
            <div className="absolute top-2 left-2">
              <Badge
                variant={mode === "preview" ? "default" : "secondary"}
                className="text-xs"
              >
                {mode === "preview" ? "Preview" : "Completo"}
              </Badge>
            </div>

            {/* Time indicator */}
            <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 rounded text-white text-sm font-mono">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between p-3 border-t bg-muted/30">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={togglePlayback}
                className="gap-1"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {isPlaying ? "Pausa" : "Play"}
              </Button>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant={mode === "full" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("full")}
                className="gap-1"
              >
                <Film className="w-4 h-4" />
                Completo
              </Button>
              <Button
                variant={mode === "preview" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("preview")}
                className="gap-1"
              >
                <Eye className="w-4 h-4" />
                Preview
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Segments Review Section */}
      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Scissors className="w-5 h-5" />
              Segmentos
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                Todos
              </Button>
              <Button variant="outline" size="sm" onClick={handleSelectNone}>
                Ninguno
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 min-h-0 overflow-hidden flex flex-col gap-4">
          {/* Statistics summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg flex-shrink-0">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {stats.selectedCount}/{stats.totalSegments}
              </div>
              <div className="text-xs text-muted-foreground">Segmentos</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {formatDuration(stats.selectedDuration)}
              </div>
              <div className="text-xs text-muted-foreground">Duracion final</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {formatDuration(stats.removedDuration)}
              </div>
              <div className="text-xs text-muted-foreground">
                Tiempo eliminado
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {stats.percentKept.toFixed(0)}%
              </div>
              <div className="text-xs text-muted-foreground">Contenido</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1 flex-shrink-0">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Contenido seleccionado</span>
              <span>{stats.percentKept.toFixed(1)}%</span>
            </div>
            <Progress value={stats.percentKept} className="h-2" />
          </div>

          {/* Segment list */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-subtle">
            {timelineSegments.map((segment, index) => {
              const selected = segment.enabled;
              const isCurrent = currentSegmentIndex === index;
              const startTime = segment.startMs / 1000;
              const endTime = segment.endMs / 1000;
              const duration = endTime - startTime;

              return (
                <div
                  key={segment.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                    selected
                      ? "bg-primary/5 border-primary/20"
                      : "bg-muted/30 border-transparent opacity-60",
                    isCurrent && "ring-2 ring-blue-500"
                  )}
                >
                  <Checkbox
                    id={`segment-${segment.id}`}
                    checked={selected}
                    onCheckedChange={() => handleToggle(segment.id)}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={selected ? "default" : "secondary"}
                        className="text-xs"
                      >
                        #{index + 1}
                      </Badge>
                      <span className="text-sm font-mono text-muted-foreground">
                        {formatTime(startTime)} → {formatTime(endTime)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-sm">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-medium">{formatDuration(duration)}</span>
                    </div>

                    {selected ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleSeekTo(startTime)}
                    >
                      <Play className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}

            {timelineSegments.length === 0 && segments.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No hay segmentos disponibles. Ejecuta la fase de "Segmentos"
                primero.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
