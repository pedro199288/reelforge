import { useCallback, useRef, useState } from "react";
import { TimelineTrack } from "./TimelineTrack";
import { SegmentMarker } from "./SegmentMarker";
import type { TimelineSegment, TimelineSelection } from "@/store/timeline";
import type { SilenceRange } from "@/core/silence/detect";

interface SegmentTrackProps {
  segments: TimelineSegment[];
  silences: SilenceRange[];
  zoomLevel: number;
  viewportStartMs: number;
  durationMs: number;
  selection: TimelineSelection;
  onSelect: (selection: TimelineSelection) => void;
  onResizeSegment: (id: string, field: "startMs" | "endMs", newValue: number) => void;
  onToggleSegment: (id: string) => void;
  onAddSegment?: (startMs: number, endMs: number) => void;
}

export function SegmentTrack({
  segments,
  silences,
  zoomLevel,
  viewportStartMs,
  durationMs,
  selection,
  onSelect,
  onResizeSegment,
  onToggleSegment,
  onAddSegment,
}: SegmentTrackProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);

  // Calculate pixels per millisecond based on zoom level
  const pxPerMs = (100 * zoomLevel) / 1000;

  // Convert pixel position to milliseconds
  const pxToMs = useCallback(
    (px: number): number => {
      return viewportStartMs + px / pxPerMs;
    },
    [viewportStartMs, pxPerMs]
  );

  // Check if a position is inside any existing segment
  const isInsideSegment = useCallback(
    (ms: number): boolean => {
      return segments.some((s) => ms >= s.startMs && ms <= s.endMs);
    },
    [segments]
  );

  // Handle mouse down for drag creation
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onAddSegment) return;
      if (e.target !== e.currentTarget) return; // Only on empty area

      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left - 80; // Account for label width
      const ms = pxToMs(x);

      // Don't start drag if inside existing segment
      if (isInsideSegment(ms)) return;

      setIsDragging(true);
      setDragStart(ms);
      setDragEnd(ms);
    },
    [onAddSegment, pxToMs, isInsideSegment]
  );

  // Handle mouse move during drag
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging || dragStart === null) return;

      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left - 80;
      const ms = Math.max(0, Math.min(durationMs, pxToMs(x)));
      setDragEnd(ms);
    },
    [isDragging, dragStart, pxToMs, durationMs]
  );

  // Handle mouse up to finalize segment creation
  const handleMouseUp = useCallback(() => {
    if (!isDragging || dragStart === null || dragEnd === null || !onAddSegment) {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      return;
    }

    const startMs = Math.min(dragStart, dragEnd);
    const endMs = Math.max(dragStart, dragEnd);

    // Minimum segment duration of 100ms
    if (endMs - startMs >= 100) {
      onAddSegment(startMs, endMs);
    }

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDragging, dragStart, dragEnd, onAddSegment]);

  // Handle mouse leave to cancel drag
  const handleMouseLeave = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
    }
  }, [isDragging]);

  // Handle click on empty area (clear selection)
  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only handle direct clicks on the track (not on segment markers)
      // And only if not dragging
      if (e.target === e.currentTarget && !isDragging) {
        onSelect(null);
      }
    },
    [onSelect, isDragging]
  );

  // Calculate drag preview position
  const dragPreview = isDragging && dragStart !== null && dragEnd !== null
    ? {
        startMs: Math.min(dragStart, dragEnd),
        endMs: Math.max(dragStart, dragEnd),
      }
    : null;

  // Calculate total times
  const enabledDuration = segments
    .filter((s) => s.enabled)
    .reduce((sum, s) => sum + (s.endMs - s.startMs), 0);
  const disabledDuration = segments
    .filter((s) => !s.enabled)
    .reduce((sum, s) => sum + (s.endMs - s.startMs), 0);
  const silenceDuration = silences.reduce((sum, s) => sum + s.duration * 1000, 0);

  return (
    <TimelineTrack name="Segmentos" height={48}>
      <div
        ref={trackRef}
        className="absolute inset-0 cursor-crosshair"
        onClick={handleTrackClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Render silences as dark background regions */}
        {silences.map((silence, index) => {
          const startMs = silence.start * 1000;
          const endMs = silence.end * 1000;
          const x = (startMs - viewportStartMs) * pxPerMs;
          const width = (endMs - startMs) * pxPerMs;

          // Don't render if outside viewport
          if (x + width < -50 || x > 2000) return null;

          return (
            <div
              key={`silence-${index}`}
              className="absolute top-0 bottom-0 bg-red-900/30 border-x border-red-500/20"
              style={{
                left: x + 80, // Account for track label width
                width: Math.max(width, 2),
              }}
            />
          );
        })}

        {/* Render segments */}
        <div className="absolute inset-0 ml-[80px]">
          {segments.map((segment) => (
            <SegmentMarker
              key={segment.id}
              segment={segment}
              zoomLevel={zoomLevel}
              viewportStartMs={viewportStartMs}
              isSelected={selection?.type === "segment" && selection.id === segment.id}
              onSelect={() => onSelect({ type: "segment", id: segment.id })}
              onResize={(field, value) => onResizeSegment(segment.id, field, value)}
              onToggleEnabled={() => onToggleSegment(segment.id)}
            />
          ))}
        </div>

        {/* Drag preview */}
        {dragPreview && (
          <div
            className="absolute top-1 bottom-1 bg-green-500/30 border-2 border-dashed border-green-500 rounded pointer-events-none"
            style={{
              left: (dragPreview.startMs - viewportStartMs) * pxPerMs + 80,
              width: Math.max((dragPreview.endMs - dragPreview.startMs) * pxPerMs, 4),
            }}
          />
        )}

        {/* Summary overlay */}
        {segments.length > 0 && (
          <div className="absolute bottom-0 right-2 text-[10px] text-muted-foreground bg-background/80 px-1 rounded">
            {segments.filter((s) => s.enabled).length} seg |
            {formatDuration(enabledDuration)} keep |
            {formatDuration(silenceDuration + disabledDuration)} cut
          </div>
        )}
      </div>
    </TimelineTrack>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
