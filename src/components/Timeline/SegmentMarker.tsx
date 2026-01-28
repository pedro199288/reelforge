import { useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { TimelineSegment } from "@/store/timeline";

interface SegmentMarkerProps {
  segment: TimelineSegment;
  zoomLevel: number;
  viewportStartMs: number;
  isSelected: boolean;
  onSelect: () => void;
  onResize?: (field: "startMs" | "endMs", newValue: number) => void;
  onToggleEnabled?: () => void;
}

type DragMode = "resize-start" | "resize-end" | null;

export function SegmentMarker({
  segment,
  zoomLevel,
  viewportStartMs,
  isSelected,
  onSelect,
  onResize,
  onToggleEnabled,
}: SegmentMarkerProps) {
  const markerRef = useRef<HTMLDivElement>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [originalStartMs, setOriginalStartMs] = useState(0);
  const [originalEndMs, setOriginalEndMs] = useState(0);

  // Calculate pixels per millisecond based on zoom level
  const pxPerMs = (100 * zoomLevel) / 1000;

  // Use actual calculated positions - no artificial expansion
  const x = (segment.startMs - viewportStartMs) * pxPerMs;
  const actualWidth = (segment.endMs - segment.startMs) * pxPerMs;
  // Keep minimum width for clickability, but this is the VISUAL width only
  const width = Math.max(actualWidth, 4); // Minimum 4px for clickability
  const isCompressedDisplay = actualWidth < 20; // Mark as compressed for visual hint

  // Handle drag start
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, mode: DragMode) => {
      e.preventDefault();
      e.stopPropagation();

      onSelect();

      if (!onResize) return;

      setDragMode(mode);
      setDragStartX(e.clientX);
      setOriginalStartMs(segment.startMs);
      setOriginalEndMs(segment.endMs);

      // Capture pointer for smooth dragging
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [onSelect, onResize, segment.startMs, segment.endMs]
  );

  // Handle drag move
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragMode || !onResize) return;

      const deltaX = e.clientX - dragStartX;
      const deltaMs = deltaX / pxPerMs;

      if (dragMode === "resize-start") {
        // Resize from start: move start position
        const newStartMs = Math.max(0, Math.round(originalStartMs + deltaMs));
        onResize("startMs", newStartMs);
      } else if (dragMode === "resize-end") {
        // Resize from end: move end position
        const newEndMs = Math.round(originalEndMs + deltaMs);
        onResize("endMs", newEndMs);
      }
    },
    [dragMode, dragStartX, pxPerMs, originalStartMs, originalEndMs, onResize]
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

  // Handle click on body (select)
  const handleBodyClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect();
    },
    [onSelect]
  );

  // Handle double-click to toggle enabled
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onToggleEnabled?.();
    },
    [onToggleEnabled]
  );

  // Don't render if outside viewport (after hooks to follow React rules)
  if (x + width < -50 || x > 2000) return null;

  const resizeHandleClass =
    "absolute top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 transition-colors z-10";

  return (
    <div
      ref={markerRef}
      className={cn(
        "absolute top-1 bottom-1 rounded transition-shadow select-none box-border",
        "border-2 flex items-center justify-center text-xs font-medium",
        segment.enabled
          ? "bg-emerald-500/30 border-emerald-500 text-emerald-700 dark:text-emerald-300"
          : "bg-gray-500/20 border-gray-400 text-gray-500 dark:text-gray-400",
        isSelected && "ring-2 ring-primary ring-offset-1",
        dragMode && "cursor-ew-resize opacity-80",
        isCompressedDisplay && "border-dashed"
      )}
      style={{
        left: x,
        width,
        cursor: dragMode ? "ew-resize" : "pointer",
      }}
      onClick={handleBodyClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* Left resize handle */}
      {onResize && (
        <div
          className={cn(resizeHandleClass, "left-0 rounded-l")}
          onPointerDown={(e) => handlePointerDown(e, "resize-start")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      )}

      {/* Content */}
      <span className="truncate px-1 pointer-events-none opacity-70">
        {segment.enabled ? "" : "Cut"}
      </span>

      {/* Right resize handle */}
      {onResize && (
        <div
          className={cn(resizeHandleClass, "right-0 rounded-r")}
          onPointerDown={(e) => handlePointerDown(e, "resize-end")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      )}

      {/* ================================================================
          DEBUG MARKERS - DO NOT DELETE THIS CODE
          These markers are essential for debugging segment alignment issues.
          To enable: change `false &&` to `true &&` below.
          Pink = startMs (left edge), Yellow = endMs (right edge)
          ================================================================ */}
      {/* START DEBUG MARKERS */}
      {false && segment.enabled && (
        <>
          {/* Pink marker at startMs (left edge) */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-pink-500 z-50 pointer-events-none"
            style={{ left: 0 }}
            title={`startMs: ${segment.startMs}ms`}
          />
          {/* Yellow marker at endMs (right edge) */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 z-50 pointer-events-none"
            style={{ left: actualWidth }}
            title={`endMs: ${segment.endMs}ms (width: ${actualWidth.toFixed(1)}px)`}
          />
        </>
      )}
      {/* END DEBUG MARKERS */}

    </div>
  );
}
