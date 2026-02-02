import { useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { TimelineZoom } from "@/store/timeline";

interface ZoomMarkerProps {
  zoom: TimelineZoom;
  zoomLevel: number;
  viewportStartMs: number;
  isSelected: boolean;
  onSelect: () => void;
  onMove?: (newStartMs: number) => void;
  onResize?: (newDurationMs: number) => void;
  onToggleType?: () => void;
  /** Snap points (timestamps in ms) for snapping during drag */
  snapPoints?: number[];
  /** Snap threshold in pixels (default: 10) */
  snapThreshold?: number;
  /** Viewport width in pixels (for viewport-aware culling) */
  viewportWidthPx?: number;
}

type DragMode = "move" | "resize-start" | "resize-end" | null;

export function ZoomMarker({
  zoom,
  zoomLevel,
  viewportStartMs,
  isSelected,
  onSelect,
  onMove,
  onResize,
  onToggleType,
  snapPoints = [],
  snapThreshold = 10,
  viewportWidthPx,
}: ZoomMarkerProps) {
  const markerRef = useRef<HTMLDivElement>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [originalStartMs, setOriginalStartMs] = useState(0);
  const [originalDurationMs, setOriginalDurationMs] = useState(0);
  const [isSnapped, setIsSnapped] = useState(false);

  // Calculate pixels per millisecond based on zoom level
  const pxPerMs = (100 * zoomLevel) / 1000;

  // Snap helper: find closest snap point within threshold
  // Returns { value, didSnap } to track whether snap occurred
  const snapToClosest = useCallback(
    (ms: number, skipSnap: boolean): { value: number; didSnap: boolean } => {
      if (skipSnap || snapPoints.length === 0) {
        return { value: ms, didSnap: false };
      }

      let closestPoint = ms;
      let closestDistancePx = Infinity;

      for (const point of snapPoints) {
        const distanceMs = Math.abs(ms - point);
        const distancePx = distanceMs * pxPerMs;

        if (distancePx < snapThreshold && distancePx < closestDistancePx) {
          closestDistancePx = distancePx;
          closestPoint = point;
        }
      }

      const didSnap = closestPoint !== ms;
      return { value: closestPoint, didSnap };
    },
    [snapPoints, pxPerMs, snapThreshold]
  );

  const x = (zoom.startMs - viewportStartMs) * pxPerMs;
  const width = Math.max(zoom.durationMs * pxPerMs, 20); // Minimum 20px width

  const isPunch = zoom.type === "punch";

  // Handle drag start
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, mode: DragMode) => {
      e.preventDefault();
      e.stopPropagation();

      onSelect();

      if (!onMove && !onResize) return;

      setDragMode(mode);
      setDragStartX(e.clientX);
      setOriginalStartMs(zoom.startMs);
      setOriginalDurationMs(zoom.durationMs);

      // Capture pointer for smooth dragging
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [onSelect, onMove, onResize, zoom.startMs, zoom.durationMs]
  );

  // Handle drag move
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragMode) return;

      const deltaX = e.clientX - dragStartX;
      const deltaMs = deltaX / pxPerMs;

      if (dragMode === "move" && onMove) {
        const rawStartMs = Math.max(0, Math.round(originalStartMs + deltaMs));
        // Apply snap to start position (hold Shift to bypass snap)
        const { value: newStartMs, didSnap } = snapToClosest(rawStartMs, e.shiftKey);
        setIsSnapped(didSnap);
        onMove(newStartMs);
      } else if (dragMode === "resize-start" && onMove && onResize) {
        // Resize from start: move start position and adjust duration
        const rawStartMs = Math.max(0, Math.round(originalStartMs + deltaMs));
        // Apply snap to start position (hold Shift to bypass snap)
        const { value: newStartMs, didSnap } = snapToClosest(rawStartMs, e.shiftKey);
        setIsSnapped(didSnap);
        const newDurationMs = Math.max(100, originalDurationMs - (newStartMs - originalStartMs));
        onMove(newStartMs);
        onResize(newDurationMs);
      } else if (dragMode === "resize-end" && onResize) {
        // Resize from end: just adjust duration
        const rawEndMs = originalStartMs + originalDurationMs + deltaMs;
        // Apply snap to end position (hold Shift to bypass snap)
        const { value: snappedEndMs, didSnap } = snapToClosest(rawEndMs, e.shiftKey);
        setIsSnapped(didSnap);
        const newDurationMs = Math.max(100, Math.round(snappedEndMs - originalStartMs));
        onResize(newDurationMs);
      }
    },
    [dragMode, dragStartX, pxPerMs, originalStartMs, originalDurationMs, onMove, onResize, snapToClosest]
  );

  // Handle drag end
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (dragMode) {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        setDragMode(null);
        setIsSnapped(false);
      }
    },
    [dragMode]
  );

  // Handle double-click to toggle type
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onToggleType?.();
    },
    [onToggleType]
  );

  // Don't render if outside viewport (after hooks to follow React rules)
  if (x + width < -50 || x > (viewportWidthPx || 2000) + 100) return null;

  const resizeHandleClass =
    "absolute top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 transition-colors";

  return (
    <div
      ref={markerRef}
      className={cn(
        "absolute top-1 bottom-1 rounded transition-shadow select-none",
        "border-2 flex items-center justify-center text-xs font-medium",
        isPunch
          ? "bg-orange-500/20 border-orange-500 text-orange-700 dark:text-orange-300"
          : "bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300",
        isSelected && "ring-2 ring-primary ring-offset-1",
        dragMode && "cursor-grabbing opacity-80",
        // Visual feedback when snapped to a word boundary
        isSnapped && "ring-2 ring-green-500 ring-offset-1 border-green-500"
      )}
      style={{
        left: x,
        width,
        cursor: dragMode ? "grabbing" : "grab",
      }}
      onPointerDown={(e) => handlePointerDown(e, "move")}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
    >
      {/* Left resize handle */}
      {(onMove || onResize) && (
        <div
          className={cn(resizeHandleClass, "left-0 rounded-l")}
          onPointerDown={(e) => handlePointerDown(e, "resize-start")}
        />
      )}

      {/* Content */}
      <span className="truncate px-1 pointer-events-none">
        {isPunch ? "P" : "S"}
      </span>

      {/* Right resize handle */}
      {onResize && (
        <div
          className={cn(resizeHandleClass, "right-0 rounded-r")}
          onPointerDown={(e) => handlePointerDown(e, "resize-end")}
        />
      )}
    </div>
  );
}
