import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// import { Progress } from "@/components/ui/progress"; // Commented - keep for potential future use
import { cn } from "@/lib/utils";
import {
  Play,
  Pause,
  Clock,
  Scissors,
  Crosshair,
  Sparkles,
  X,
  ToggleLeft,
  ToggleRight,
  Maximize2,
  FileText,
} from "lucide-react";
import type { PreselectedSegment, PreselectionStats, PreselectionLog } from "@/core/preselection";
import { PreselectionLogs } from "./PreselectionLogs";
import { AIPreselectionPanel } from "./AIPreselectionPanel";
import {
  useVideoSegments,
  useTimelineActions,
  useTimelineSelection,
  type TimelineSegment,
} from "@/store/timeline";
import { SegmentTimeline } from "./SegmentTimeline";
import { usePlayheadSync } from "@/hooks/usePlayheadSync";
import { useSegmentEditorShortcuts } from "@/hooks/useSegmentEditorShortcuts";
import { FullscreenWrapper } from "./FullscreenWrapper";

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
  /** Preselection data from the pipeline */
  preselection?: {
    segments: PreselectedSegment[];
    stats: PreselectionStats;
  };
  /** Detailed preselection logs for debugging */
  preselectionLog?: PreselectionLog;
  /** Script text for AI preselection */
  script?: string;
  /** Whether captions are available (for AI preselection) */
  hasCaptions?: boolean;
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
  preselection,
  preselectionLog,
  script,
  hasCaptions = false,
}: SegmentEditorPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const segmentRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(true);

  // Smooth playhead sync using RAF during playback
  const { currentTimeMs, isTransitioning } = usePlayheadSync({
    videoElement: videoEl,
    isPlaying,
  });
  const currentTime = currentTimeMs / 1000;

  // State and refs for jump control (prevents race conditions in preview mode)
  const [isJumping, setIsJumping] = useState(false);
  const lastJumpTargetRef = useRef<number | null>(null);

  // Get segments from timeline store (these are the editable ones with enabled state)
  const timelineSegments = useVideoSegments(videoId);
  const { importSemanticSegments, importPreselectedSegments, toggleSegment, clearSelection } = useTimelineActions();
  const selection = useTimelineSelection();

  // Keyboard shortcuts (CapCut-style)
  useSegmentEditorShortcuts({
    videoId,
    videoRef,
    totalDurationMs: totalDuration * 1000,
  });

  // Find the selected segment
  const selectedSegment = useMemo(() => {
    if (selection?.type !== "segment") return null;
    return timelineSegments.find(s => s.id === selection.id) ?? null;
  }, [selection, timelineSegments]);

  // Get the index of the selected segment (1-based for display)
  const selectedSegmentIndex = useMemo(() => {
    if (!selectedSegment) return null;
    const index = timelineSegments.findIndex(s => s.id === selectedSegment.id);
    return index >= 0 ? index + 1 : null;
  }, [selectedSegment, timelineSegments]);

  // Track if we've already imported for this video/preselection combination
  const lastImportRef = useRef<{ videoId: string; hasPreselection: boolean } | null>(null);

  // Initialize timeline segments from prop segments
  // Re-import if preselection data is available but current segments don't have it
  useEffect(() => {
    if (segments.length === 0) return;

    const hasPreselectionData = preselection && preselection.segments.length > 0;
    const importKey = { videoId, hasPreselection: !!hasPreselectionData };

    // Check if we've already imported with these parameters
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

    // Import if no segments yet, or if preselection available but not applied
    const shouldImport =
      timelineSegments.length === 0 ||
      (hasPreselectionData && !currentSegmentsHavePreselection);

    if (shouldImport) {
      lastImportRef.current = importKey;
      if (hasPreselectionData) {
        importPreselectedSegments(videoId, preselection.segments, []);
      } else {
        // Fallback to basic import (all enabled)
        const segmentsForStore = segments.map((s) => ({
          startMs: s.startTime * 1000,
          endMs: s.endTime * 1000,
        }));
        importSemanticSegments(videoId, segmentsForStore, []);
      }
    }
  }, [videoId, segments, timelineSegments, importSemanticSegments, importPreselectedSegments, preselection]);

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

  // Ref for jump debounce (needs stable reference across renders)
  const isJumpingRef = useRef(isJumping);
  useEffect(() => {
    isJumpingRef.current = isJumping;
  }, [isJumping]);

  // Perform jump with position-based deduplication and seeked event handling
  const performJump = useCallback((targetTime: number) => {
    const video = videoRef.current;
    if (!video || isJumpingRef.current) return;

    // Avoid redundant jump to the SAME destination (within 50ms tolerance)
    if (
      lastJumpTargetRef.current !== null &&
      Math.abs(targetTime - lastJumpTargetRef.current) < 0.05
    ) {
      return;
    }

    setIsJumping(true);
    lastJumpTargetRef.current = targetTime;

    video.currentTime = targetTime;

    // Wait for the video to confirm the seek
    const handleSeeked = () => {
      setIsJumping(false);
      video.removeEventListener("seeked", handleSeeked);
    };
    video.addEventListener("seeked", handleSeeked, { once: true });

    // Safety timeout in case seeked event doesn't fire
    setTimeout(() => setIsJumping(false), 200);
  }, []);

  // Preview playback: proactive edge detection with lookahead
  // Always skips disabled segments during playback
  useEffect(() => {
    if (!isPlaying || isJumping) return;

    const video = videoRef.current;
    if (!video) return;

    // Find the current segment we're in
    const currentSegment = enabledSegments.find(
      (s) => currentTimeMs >= s.startMs && currentTimeMs <= s.endMs
    );

    if (currentSegment) {
      // We're inside a segment - check if we're approaching the end
      const msToEnd = currentSegment.endMs - currentTimeMs;
      const LOOKAHEAD_MS = 17; // ~1 frame at 60fps - jump just before hitting the gap

      if (msToEnd <= LOOKAHEAD_MS && msToEnd > 0) {
        // About to exit this segment - find and jump to next
        const nextSegment = enabledSegments.find(
          (s) => s.startMs > currentSegment.endMs
        );
        if (nextSegment) {
          performJump(nextSegment.startMs / 1000);
        } else {
          // No more segments - pause at end
          video.pause();
        }
      }
      return;
    }

    // Fallback: we're already in a gap (shouldn't happen often with lookahead)
    const nextSegment = enabledSegments.find((s) => s.startMs > currentTimeMs);
    if (nextSegment) {
      performJump(nextSegment.startMs / 1000);
    } else {
      // No more segments - end of video
      video.pause();
    }
  }, [currentTimeMs, isPlaying, isJumping, enabledSegments, performJump]);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      // If starting from a cut/disabled region, jump to next enabled segment
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
      video.play();
    }
  }, [isPlaying, enabledSegments, mapTimeToEdited]);

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

  // Find which segment (if any) the current time is in
  const currentSegmentIndex = useMemo(() => {
    const currentMs = currentTime * 1000;
    return timelineSegments.findIndex(
      (s) => currentMs >= s.startMs && currentMs <= s.endMs
    );
  }, [currentTime, timelineSegments]);

  // Scroll to the current segment in the list
  const scrollToCurrentSegment = useCallback(() => {
    if (currentSegmentIndex < 0) return;
    const segment = timelineSegments[currentSegmentIndex];
    if (!segment) return;
    const element = segmentRefs.current.get(segment.id);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentSegmentIndex, timelineSegments]);

  return (
    <FullscreenWrapper
      isFullscreen={isFullscreen}
      onClose={() => setIsFullscreen(false)}
      title="Editor de Segmentos"
    >
      <div className={cn(
        "flex flex-col gap-4",
        isFullscreen ? "h-full" : "h-full"
      )}>
      {/* Video Player Section */}
      <Card className={cn("flex-shrink-0", isFullscreen && "flex-1 min-h-0 flex flex-col")}>
        <CardContent className={cn("p-0", isFullscreen && "flex-1 flex flex-col min-h-0")}>
          <div className={cn(
            "relative bg-black",
            isFullscreen ? "flex-1 min-h-0" : "aspect-video"
          )}>
            {/* eslint-disable-next-line @remotion/warn-native-media-tag -- Not a Remotion composition */}
            <video
              ref={(el) => { videoRef.current = el; setVideoEl(el); }}
              src={videoPath}
              className="w-full h-full object-contain"
              onClick={togglePlayback}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
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
              {hasCaptions && (
                <Button
                  variant={showAIPanel ? "default" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setShowAIPanel(!showAIPanel);
                    if (!showAIPanel) setShowLogs(false);
                  }}
                  title="Abrir panel de preseleccion AI"
                  className="gap-1"
                >
                  <Sparkles className="w-4 h-4" />
                  IA
                </Button>
              )}
              {preselectionLog && (
                <Button
                  variant={showLogs ? "default" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setShowLogs(!showLogs);
                    if (!showLogs) setShowAIPanel(false);
                  }}
                  title="Ver logs de preseleccion"
                  className="gap-1"
                >
                  <FileText className="w-4 h-4" />
                  Logs
                </Button>
              )}
              {!isFullscreen && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsFullscreen(true)}
                  title="Pantalla completa"
                >
                  <Maximize2 className="w-4 h-4" />
                </Button>
              )}
            </div>

          </div>

          {/* Timeline integrated with video (no separate Card) */}
          <div className="border-t">
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

          {/* AI Preselection Panel - directly below timeline */}
          {showAIPanel && (
            <div className="border-t max-h-[400px] overflow-y-auto">
              <AIPreselectionPanel
                videoId={videoId}
                script={script}
                hasCaptions={hasCaptions}
                currentSegments={preselection?.segments || []}
                onSegmentsUpdate={(newSegments) => {
                  importPreselectedSegments(videoId, newSegments, []);
                }}
                onSegmentClick={(segmentId) => {
                  const segment = timelineSegments.find(s => s.id === segmentId);
                  if (segment) {
                    handleSeekTo(segment.startMs / 1000);
                  }
                }}
              />
            </div>
          )}

          {/* Selected segment info panel */}
          {selectedSegment && selectedSegmentIndex && (
            <div className="border-t bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="default" className="text-sm">
                      Segmento #{selectedSegmentIndex}
                    </Badge>
                    <Badge
                      variant={selectedSegment.enabled ? "default" : "secondary"}
                      className={cn(
                        "text-xs",
                        selectedSegment.enabled
                          ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700"
                          : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700"
                      )}
                    >
                      {selectedSegment.enabled ? "Habilitado" : "Deshabilitado"}
                    </Badge>
                    {selectedSegment.preselectionScore !== undefined && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          selectedSegment.preselectionScore >= 85
                            ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400"
                            : selectedSegment.preselectionScore >= 60
                              ? "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400"
                              : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400"
                        )}
                      >
                        {selectedSegment.preselectionScore}%
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground block text-xs">Inicio</span>
                      <span className="font-mono font-medium">
                        {formatTime(selectedSegment.startMs / 1000)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">Fin</span>
                      <span className="font-mono font-medium">
                        {formatTime(selectedSegment.endMs / 1000)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">Duracion</span>
                      <span className="font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        {formatDuration((selectedSegment.endMs - selectedSegment.startMs) / 1000)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">ID</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {selectedSegment.id}
                      </span>
                    </div>
                  </div>

                  {selectedSegment.preselectionReason && (
                    <div className="mt-3 p-2 bg-background/50 rounded border text-xs">
                      <span className="text-muted-foreground">Razon: </span>
                      <span>{selectedSegment.preselectionReason}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSeekTo(selectedSegment.startMs / 1000)}
                    title="Ir al inicio del segmento"
                  >
                    <Play className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={selectedSegment.enabled ? "outline" : "default"}
                    size="sm"
                    onClick={() => toggleSegment(videoId, selectedSegment.id)}
                    title={selectedSegment.enabled ? "Deshabilitar segmento" : "Habilitar segmento"}
                  >
                    {selectedSegment.enabled ? (
                      <ToggleRight className="w-4 h-4" />
                    ) : (
                      <ToggleLeft className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                    title="Cerrar panel"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Segments Review Section - Hidden in fullscreen mode */}
      {!isFullscreen && (
      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Scissors className="w-5 h-5" />
              Segmentos
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={scrollToCurrentSegment}
                disabled={currentSegmentIndex < 0}
                title="Ir al segmento actual"
              >
                <Crosshair className="w-4 h-4" />
              </Button>
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

          {/* Preselection stats (if available) */}
          {preselection && (
            <div className="flex flex-col gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 flex-shrink-0">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    Preseleccion automatica
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-blue-600 dark:text-blue-400">
                  {preselection.stats.scriptCoverage < 100 && (
                    <span>
                      Cobertura guion: {preselection.stats.scriptCoverage.toFixed(0)}%
                    </span>
                  )}
                  {preselection.stats.repetitionsRemoved > 0 && (
                    <span>
                      Repeticiones eliminadas: {preselection.stats.repetitionsRemoved}
                    </span>
                  )}
                  <span>
                    Puntuacion promedio: {preselection.stats.averageScore.toFixed(0)}%
                  </span>
                </div>
              </div>
              {/* Note when no script is available */}
              {preselection.stats.scriptCoverage === 100 &&
                preselection.stats.repetitionsRemoved === 0 && (
                  <p className="text-xs text-blue-500 dark:text-blue-400 italic">
                    Sin guion ni repeticiones detectadas. Agrega un guion en la fase Raw para mejor discriminacion.
                  </p>
                )}
            </div>
          )}

          {/* Progress bar - commented out, keep for potential future use
          <div className="space-y-1 flex-shrink-0">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Contenido seleccionado</span>
              <span>{stats.percentKept.toFixed(1)}%</span>
            </div>
            <Progress value={stats.percentKept} className="h-2" />
          </div>
          */}

{/* Segment list - COMMENTED: Info moved to timeline markers
          <TooltipProvider>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-subtle">
            {timelineSegments.map((segment, index) => {
              const selected = segment.enabled;
              const isCurrent = currentSegmentIndex === index;
              const startTime = segment.startMs / 1000;
              const endTime = segment.endMs / 1000;
              const duration = endTime - startTime;
              const hasPreselection = segment.preselectionScore !== undefined;

              return (
                <div
                  key={segment.id}
                  ref={(el) => {
                    if (el) {
                      segmentRefs.current.set(segment.id, el);
                    } else {
                      segmentRefs.current.delete(segment.id);
                    }
                  }}
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
                      {hasPreselection && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] h-5 cursor-help",
                                segment.preselectionScore! >= 85
                                  ? "bg-green-100 text-green-700 border-green-300"
                                  : segment.preselectionScore! >= 60
                                    ? "bg-yellow-100 text-yellow-700 border-yellow-300"
                                    : "bg-red-100 text-red-700 border-red-300"
                              )}
                            >
                              {segment.preselectionScore}%
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-sm">{segment.preselectionReason}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
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
          </TooltipProvider>
          */}
        </CardContent>
      </Card>
      )}

      {/* Preselection Logs Panel */}
      {!isFullscreen && showLogs && preselectionLog && (
        <div className="flex-1 min-h-0">
          <PreselectionLogs
            log={preselectionLog}
            onSeekTo={handleSeekTo}
          />
        </div>
      )}
    </div>
    </FullscreenWrapper>
  );
}
