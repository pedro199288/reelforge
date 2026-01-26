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
}: ZoomMarkerProps) {
  const markerRef = useRef<HTMLDivElement>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [originalStartMs, setOriginalStartMs] = useState(0);
  const [originalDurationMs, setOriginalDurationMs] = useState(0);

  // Calculate pixels per millisecond based on zoom level
  const pxPerMs = (100 * zoomLevel) / 1000;

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
        const newStartMs = Math.max(0, Math.round(originalStartMs + deltaMs));
        onMove(newStartMs);
      } else if (dragMode === "resize-start" && onMove && onResize) {
        // Resize from start: move start position and adjust duration
        const newStartMs = Math.max(0, Math.round(originalStartMs + deltaMs));
        const newDurationMs = Math.max(100, originalDurationMs - (newStartMs - originalStartMs));
        onMove(newStartMs);
        onResize(newDurationMs);
      } else if (dragMode === "resize-end" && onResize) {
        // Resize from end: just adjust duration
        const newDurationMs = Math.max(100, Math.round(originalDurationMs + deltaMs));
        onResize(newDurationMs);
      }
    },
    [dragMode, dragStartX, pxPerMs, originalStartMs, originalDurationMs, onMove, onResize]
  );

  // Handle drag end
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (dragMode) {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        setDragMode(null);
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
  if (x + width < -50 || x > 2000) return null;

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
        dragMode && "cursor-grabbing opacity-80"
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
