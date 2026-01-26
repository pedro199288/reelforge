import { useCallback, useRef } from "react";
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
}

export function SegmentTrack({
  segments,
  silences,
  zoomLevel,
  viewportStartMs,
  selection,
  onSelect,
  onResizeSegment,
  onToggleSegment,
}: SegmentTrackProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Calculate pixels per millisecond based on zoom level
  const pxPerMs = (100 * zoomLevel) / 1000;

  // Handle click on empty area (clear selection)
  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only handle direct clicks on the track (not on segment markers)
      if (e.target === e.currentTarget) {
        onSelect(null);
      }
    },
    [onSelect]
  );

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
        className="absolute inset-0"
        onClick={handleTrackClick}
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
