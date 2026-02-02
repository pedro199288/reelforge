import { useRef, useEffect, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  Undo2,
  Redo2,
  Crosshair,
  Trash2,
  Wand2,
} from "lucide-react";
import { TimelineTrack } from "./TimelineTrack";
import { TimelineRuler } from "./TimelineRuler";
import { TimelinePlayhead } from "./TimelinePlayhead";
import { ZoomTrack } from "./ZoomTrack";
import { CaptionBlock } from "./CaptionBlock";
import { HighlightMarker } from "./HighlightMarker";
import { Waveform, WaveformPlaceholder } from "./Waveform";
import { AutoDetectDialog } from "./AutoDetectDialog";
import { useWaveform } from "@/hooks/useWaveform";
import { downsampleWaveform } from "@/core/audio/waveform";
import type { KeyMoment } from "@/core/timeline/auto-detect";
import {
  useTimelineStore,
  usePlayhead,
  useIsPlaying,
  useTimelineZoomLevel,
  useViewportStart,
  useTimelineSelection,
  useVideoTimeline,
  useTimelineCanUndo,
  useTimelineCanRedo,
  useTimelineUndo,
  useTimelineRedo,
} from "@/store/timeline";
import type { Caption } from "@/core/script/align";

interface TimelineProps {
  videoId: string;
  videoPath?: string;
  durationMs: number;
  captions: Caption[];
}

export function Timeline({ videoId, videoPath, durationMs, captions }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Waveform data
  const { data: waveformData, rawData: waveformRawData, loading: waveformLoading } = useWaveform(
    videoPath ?? null,
    { samplesPerSecond: 200 }
  );

  // Auto-detect dialog
  const [autoDetectOpen, setAutoDetectOpen] = useState(false);

  // Store state
  const playheadMs = usePlayhead();
  const isPlaying = useIsPlaying();
  const zoomLevel = useTimelineZoomLevel();
  const viewportStartMs = useViewportStart();
  const selection = useTimelineSelection();
  const timeline = useVideoTimeline(videoId);
  const canUndo = useTimelineCanUndo();
  const canRedo = useTimelineCanRedo();
  const undo = useTimelineUndo();
  const redo = useTimelineRedo();

  // Store actions
  const {
    setPlayhead,
    togglePlayback,
    setZoomLevel,
    scrollTo,
    zoomIn,
    zoomOut,
    fitToView,
    setActiveVideo,
    addZoom,
    updateZoom,
    moveZoom,
    deleteSelected,
    select,
    clearSelection,
    addHighlight,
    deleteHighlight,
  } = useTimelineStore();

  // Set active video on mount
  useEffect(() => {
    setActiveVideo(videoId);
    return () => setActiveVideo(null);
  }, [videoId, setActiveVideo]);

  // Get viewport width
  const getViewportWidth = useCallback(() => {
    if (!contentRef.current) return 800;
    return contentRef.current.clientWidth - 80; // Subtract track label width
  }, []);

  // Handle horizontal scroll
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const pxPerMs = (100 * zoomLevel) / 1000;
      const scrollLeft = e.currentTarget.scrollLeft;
      scrollTo(scrollLeft / pxPerMs);
    },
    [zoomLevel, scrollTo]
  );

  // Handle wheel zoom (Ctrl+scroll)
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.8 : 1.25;
        setZoomLevel(zoomLevel * delta);
      }
    },
    [zoomLevel, setZoomLevel]
  );

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if timeline is focused or no input is focused
      const activeElement = document.activeElement;
      if (
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlayback();
          break;
        case "Delete":
        case "Backspace":
          if (selection) {
            e.preventDefault();
            deleteSelected(videoId);
          }
          break;
        case "Escape":
          clearSelection();
          break;
        case "z":
          if ((e.ctrlKey || e.metaKey) && !e.shiftKey && canUndo) {
            e.preventDefault();
            undo();
          } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && canRedo) {
            e.preventDefault();
            redo();
          }
          break;
        case "y":
          if ((e.ctrlKey || e.metaKey) && canRedo) {
            e.preventDefault();
            redo();
          }
          break;
        // Add zoom shortcuts
        case "p":
        case "P":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            addZoom(videoId, "punch", playheadMs);
          }
          break;
        case "s":
        case "S":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            addZoom(videoId, "slow", playheadMs);
          }
          break;
        // Arrow keys to move selected zoom
        case "ArrowLeft":
          if (selection?.type === "zoom") {
            e.preventDefault();
            const selectedZoom = timeline.zooms.find((z) => z.id === selection.id);
            if (selectedZoom) {
              const delta = e.shiftKey ? 1000 : 100; // Shift for larger steps
              moveZoom(videoId, selection.id, Math.max(0, selectedZoom.startMs - delta));
            }
          }
          break;
        case "ArrowRight":
          if (selection?.type === "zoom") {
            e.preventDefault();
            const selectedZoom = timeline.zooms.find((z) => z.id === selection.id);
            if (selectedZoom) {
              const delta = e.shiftKey ? 1000 : 100;
              moveZoom(videoId, selection.id, selectedZoom.startMs + delta);
            }
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selection,
    videoId,
    playheadMs,
    timeline.zooms,
    togglePlayback,
    deleteSelected,
    clearSelection,
    addZoom,
    moveZoom,
    canUndo,
    canRedo,
    undo,
    redo,
  ]);

  // Handle seek from ruler click
  const handleSeek = useCallback(
    (ms: number) => {
      setPlayhead(ms);
    },
    [setPlayhead]
  );

  // Handle adding zoom at playhead position
  const handleAddZoom = useCallback(
    (type: "punch" | "slow") => {
      addZoom(videoId, type, playheadMs);
    },
    [addZoom, videoId, playheadMs]
  );

  // Handle adding zoom at specific position (from track click)
  const handleAddZoomAtPosition = useCallback(
    (type: "punch" | "slow", startMs: number) => {
      addZoom(videoId, type, startMs);
    },
    [addZoom, videoId]
  );

  // Handle moving zoom
  const handleMoveZoom = useCallback(
    (id: string, newStartMs: number) => {
      moveZoom(videoId, id, newStartMs);
    },
    [moveZoom, videoId]
  );

  // Handle resizing zoom
  const handleResizeZoom = useCallback(
    (id: string, newDurationMs: number) => {
      updateZoom(videoId, id, { durationMs: newDurationMs });
    },
    [updateZoom, videoId]
  );

  // Handle toggle zoom type
  const handleToggleZoomType = useCallback(
    (id: string) => {
      const zoom = timeline.zooms.find((z) => z.id === id);
      if (zoom) {
        const newType = zoom.type === "punch" ? "slow" : "punch";
        updateZoom(videoId, id, { type: newType });
      }
    },
    [updateZoom, videoId, timeline.zooms]
  );

  // Handle toggle highlight from caption click
  const handleCaptionClick = useCallback(
    (caption: Caption, index: number) => {
      // Check if a highlight already exists for this caption
      const existingHighlight = timeline.highlights.find(
        (h) => h.startMs === caption.startMs && h.endMs === caption.endMs
      );

      if (existingHighlight) {
        // Remove existing highlight
        deleteHighlight(videoId, existingHighlight.id);
      } else {
        // Add new highlight
        addHighlight(videoId, index, caption.text, caption.startMs, caption.endMs);
      }
    },
    [addHighlight, deleteHighlight, videoId, timeline.highlights]
  );

  // Calculate content width based on duration and zoom
  const pxPerMs = (100 * zoomLevel) / 1000;
  const contentWidth = durationMs * pxPerMs;

  // Handle applying auto-detected moments
  const handleApplyAutoDetect = useCallback(
    (moments: KeyMoment[]) => {
      for (const moment of moments) {
        if (moment.suggestedZoom === "punch" || moment.suggestedZoom === "slow") {
          addZoom(videoId, moment.suggestedZoom, moment.timestampMs);
        } else if (moment.suggestedZoom === "highlight" && moment.endMs) {
          // Find the caption index for this moment
          const captionIndex = captions.findIndex(
            (c) => c.startMs <= moment.timestampMs && c.endMs >= moment.timestampMs
          );
          if (captionIndex >= 0) {
            const caption = captions[captionIndex];
            addHighlight(videoId, captionIndex, caption.text, caption.startMs, caption.endMs);
          }
        }
      }
    },
    [addZoom, addHighlight, videoId, captions]
  );

  return (
    <div
      ref={containerRef}
      className="flex flex-col border rounded-lg bg-background overflow-hidden"
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b bg-muted/30">
        <TooltipProvider delayDuration={300}>
          {/* Playback controls */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={togglePlayback}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isPlaying ? "Pausar (Space)" : "Reproducir (Space)"}
            </TooltipContent>
          </Tooltip>

          <div className="h-4 w-px bg-border" />

          {/* Zoom controls */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={zoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Acercar</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={zoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Alejar</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fitToView(durationMs)}
              >
                <Crosshair className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ajustar a vista</TooltipContent>
          </Tooltip>

          <div className="h-4 w-px bg-border" />

          {/* Undo/Redo */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => undo()}
                disabled={!canUndo}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Deshacer (Ctrl+Z)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => redo()}
                disabled={!canRedo}
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Rehacer (Ctrl+Y)</TooltipContent>
          </Tooltip>

          <div className="flex-1" />

          {/* Add zoom buttons */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAddZoom("punch")}
                className="text-orange-600 border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950"
              >
                + Punch
              </Button>
            </TooltipTrigger>
            <TooltipContent>Agregar zoom punch en playhead (P)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAddZoom("slow")}
                className="text-blue-600 border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950"
              >
                + Slow
              </Button>
            </TooltipTrigger>
            <TooltipContent>Agregar zoom lento en playhead (S)</TooltipContent>
          </Tooltip>

          <div className="h-4 w-px bg-border" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoDetectOpen(true)}
                className="text-purple-600 border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950"
              >
                <Wand2 className="h-4 w-4 mr-1" />
                Auto
              </Button>
            </TooltipTrigger>
            <TooltipContent>Auto-detectar momentos clave</TooltipContent>
          </Tooltip>

          {selection && (
            <>
              <div className="h-4 w-px bg-border" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteSelected(videoId)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Eliminar seleccionado (Delete)</TooltipContent>
              </Tooltip>
            </>
          )}
        </TooltipProvider>
      </div>

      {/* Timeline content */}
      <div
        ref={contentRef}
        className="relative overflow-x-auto overflow-y-hidden"
        onScroll={handleScroll}
        onWheel={handleWheel}
      >
        <div style={{ width: contentWidth + 80, minWidth: "100%" }}>
          {/* Ruler */}
          <TimelineRuler
            durationMs={durationMs}
            zoomLevel={zoomLevel}
            viewportStartMs={viewportStartMs}
            viewportWidthPx={getViewportWidth()}
            onSeek={handleSeek}
          />

          {/* Waveform track */}
          <TimelineTrack name="Audio" height={48}>
            {waveformLoading ? (
              <WaveformPlaceholder
                width={contentWidth}
                height={40}
                className="ml-[80px]"
              />
            ) : waveformData ? (
              <div className="ml-[80px]">
                <Waveform
                  data={downsampleWaveform(
                    { samples: waveformData, sampleRate: 200, duration: durationMs / 1000 },
                    Math.min(waveformData.length, Math.floor(contentWidth / 2))
                  )}
                  width={contentWidth}
                  height={40}
                  color="rgb(74, 222, 128)"
                  style="mirror"
                />
              </div>
            ) : null}
          </TimelineTrack>

          {/* Zooms track */}
          <ZoomTrack
            zooms={timeline.zooms}
            zoomLevel={zoomLevel}
            viewportStartMs={viewportStartMs}
            durationMs={durationMs}
            selection={selection}
            onSelect={select}
            onAddZoom={handleAddZoomAtPosition}
            onMoveZoom={handleMoveZoom}
            onResizeZoom={handleResizeZoom}
            onToggleZoomType={handleToggleZoomType}
            captions={captions}
            viewportWidthPx={getViewportWidth()}
          />

          {/* Highlights track */}
          <TimelineTrack name="Highlights" height={36}>
            {timeline.highlights.map((highlight) => (
              <HighlightMarker
                key={highlight.id}
                highlight={highlight}
                zoomLevel={zoomLevel}
                viewportStartMs={viewportStartMs}
                isSelected={
                  selection?.type === "highlight" &&
                  selection.id === highlight.id
                }
                onSelect={() => select({ type: "highlight", id: highlight.id })}
                viewportWidthPx={getViewportWidth()}
              />
            ))}
          </TimelineTrack>

          {/* Captions track */}
          <TimelineTrack name="Subtítulos" height={32}>
            {captions.map((caption, index) => {
              // Check if this caption has a highlight
              const hasHighlight = timeline.highlights.some(
                (h) =>
                  h.startMs <= caption.endMs && h.endMs >= caption.startMs
              );
              return (
                <CaptionBlock
                  key={index}
                  caption={caption}
                  index={index}
                  zoomLevel={zoomLevel}
                  viewportStartMs={viewportStartMs}
                  isHighlighted={hasHighlight}
                  onClick={() => handleCaptionClick(caption, index)}
                  viewportWidthPx={getViewportWidth()}
                />
              );
            })}
          </TimelineTrack>

          {/* Playhead */}
          <TimelinePlayhead
            playheadMs={playheadMs}
            zoomLevel={zoomLevel}
            viewportStartMs={viewportStartMs}
            viewportWidthPx={getViewportWidth()}
          />
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t bg-muted/20 text-xs text-muted-foreground">
        <span>
          {formatTime(playheadMs)} / {formatTime(durationMs)}
        </span>
        <span>
          Zoom: {Math.round(zoomLevel * 100)}% | Zooms: {timeline.zooms.length} |
          Highlights: {timeline.highlights.length}
        </span>
      </div>

      {/* Auto-detect dialog */}
      <AutoDetectDialog
        open={autoDetectOpen}
        onClose={() => setAutoDetectOpen(false)}
        onApply={handleApplyAutoDetect}
        waveformSamples={waveformRawData?.samples ?? null}
        waveformSampleRate={waveformRawData?.sampleRate ?? 200}
        captions={captions}
      />
    </div>
  );
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default Timeline;
