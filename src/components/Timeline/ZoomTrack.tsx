import { useCallback, useMemo, useRef } from "react";
import { TimelineTrack } from "./TimelineTrack";
import { ZoomMarker } from "./ZoomMarker";
import type { TimelineZoom, TimelineSelection } from "@/store/timeline";
import type { Caption } from "@/core/script/align";

interface ZoomTrackProps {
  zooms: TimelineZoom[];
  zoomLevel: number;
  viewportStartMs: number;
  durationMs: number;
  selection: TimelineSelection;
  onSelect: (selection: TimelineSelection) => void;
  onAddZoom: (type: "punch" | "slow", startMs: number) => void;
  onMoveZoom: (id: string, newStartMs: number) => void;
  onResizeZoom: (id: string, newDurationMs: number) => void;
  onToggleZoomType: (id: string) => void;
  /** Captions for snap-to-word functionality */
  captions?: Caption[];
  /** Snap threshold in pixels (default: 10) */
  snapThreshold?: number;
}

export function ZoomTrack({
  zooms,
  zoomLevel,
  viewportStartMs,
  durationMs,
  selection,
  onSelect,
  onAddZoom,
  onMoveZoom,
  onResizeZoom,
  onToggleZoomType,
  captions = [],
  snapThreshold = 10,
}: ZoomTrackProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Calculate pixels per millisecond based on zoom level
  const pxPerMs = (100 * zoomLevel) / 1000;

  // Generate snap points from captions (start and end of each word)
  const snapPoints = useMemo(() => {
    const points = new Set<number>();
    for (const caption of captions) {
      points.add(caption.startMs);
      points.add(caption.endMs);
    }
    return Array.from(points).sort((a, b) => a - b);
  }, [captions]);

  // Handle click on empty area to create new zoom
  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only handle direct clicks on the track (not on zoom markers)
      if (e.target !== e.currentTarget) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickMs = viewportStartMs + clickX / pxPerMs;

      // Clamp to valid range
      const startMs = Math.max(0, Math.min(durationMs, Math.round(clickMs)));

      // Check if clicking on existing zoom (shouldn't happen due to target check, but safety)
      const clickedOnZoom = zooms.some((zoom) => {
        const zoomEndMs = zoom.startMs + zoom.durationMs;
        return startMs >= zoom.startMs && startMs <= zoomEndMs;
      });

      if (!clickedOnZoom) {
        // Default to punch zoom on click
        onAddZoom("punch", startMs);
      }
    },
    [viewportStartMs, pxPerMs, durationMs, zooms, onAddZoom]
  );

  // Handle context menu (right-click) to add slow zoom
  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();

      // Only handle direct clicks on the track
      if (e.target !== e.currentTarget) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickMs = viewportStartMs + clickX / pxPerMs;

      const startMs = Math.max(0, Math.min(durationMs, Math.round(clickMs)));

      const clickedOnZoom = zooms.some((zoom) => {
        const zoomEndMs = zoom.startMs + zoom.durationMs;
        return startMs >= zoom.startMs && startMs <= zoomEndMs;
      });

      if (!clickedOnZoom) {
        // Right-click adds slow zoom
        onAddZoom("slow", startMs);
      }
    },
    [viewportStartMs, pxPerMs, durationMs, zooms, onAddZoom]
  );

  return (
    <TimelineTrack name="Zooms" height={40}>
      <div
        ref={trackRef}
        className="absolute inset-0 cursor-crosshair"
        onClick={handleTrackClick}
        onContextMenu={handleContextMenu}
      >
        {zooms.map((zoom) => (
          <ZoomMarker
            key={zoom.id}
            zoom={zoom}
            zoomLevel={zoomLevel}
            viewportStartMs={viewportStartMs}
            isSelected={selection?.type === "zoom" && selection.id === zoom.id}
            onSelect={() => onSelect({ type: "zoom", id: zoom.id })}
            onMove={(newStartMs) => onMoveZoom(zoom.id, newStartMs)}
            onResize={(newDurationMs) => onResizeZoom(zoom.id, newDurationMs)}
            onToggleType={() => onToggleZoomType(zoom.id)}
            snapPoints={snapPoints}
            snapThreshold={snapThreshold}
          />
        ))}
      </div>
    </TimelineTrack>
  );
}
