import { useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { BarChart3 } from "lucide-react";
import { Waveform } from "@/components/Timeline/Waveform";
import { useTimelineStore, type TimelineSegment } from "@/store/timeline";

interface SegmentMarkerProps {
  segment: TimelineSegment;
  zoomLevel: number;
  viewportStartMs: number;
  isSelected: boolean;
  onSelect: () => void;
  onResize?: (field: "startMs" | "endMs", newValue: number) => void;
  onToggleEnabled?: () => void;
  /** Callback to show the preselection log for this segment */
  onShowLog?: () => void;
  /** Offset in ms for contiguous (no-gap) layout */
  contiguousOffsetMs?: number;
  /** Waveform samples for this segment (used as background in contiguous mode) */
  waveformSlice?: number[];
  /** Track height in pixels (for dynamic waveform sizing) */
  trackHeight?: number;
}

function downsampleForWidth(samples: number[], targetWidth: number): number[] {
  if (samples.length <= targetWidth) return samples;
  const step = samples.length / targetWidth;
  const result: number[] = [];
  for (let i = 0; i < targetWidth; i++) {
    result.push(samples[Math.floor(i * step)]);
  }
  return result;
}

type DragMode = "resize-start" | "resize-end" | null;

function getScoreColorClasses(score: number | undefined): {
  bg: string;
  border: string;
  text: string;
} | null {
  if (score === undefined) return null;

  if (score >= 85) {
    return {
      bg: "bg-green-500/30",
      border: "border-green-500",
      text: "text-green-700 dark:text-green-300",
    };
  } else if (score >= 60) {
    return {
      bg: "bg-yellow-500/30",
      border: "border-yellow-500",
      text: "text-yellow-700 dark:text-yellow-300",
    };
  } else {
    return {
      bg: "bg-red-500/30",
      border: "border-red-500",
      text: "text-red-700 dark:text-red-300",
    };
  }
}

export function SegmentMarker({
  segment,
  zoomLevel,
  viewportStartMs,
  isSelected,
  onSelect,
  onResize,
  onToggleEnabled,
  onShowLog,
  contiguousOffsetMs,
  waveformSlice,
  trackHeight,
}: SegmentMarkerProps) {
  const markerRef = useRef<HTMLDivElement>(null);
  const preDragSnapshotRef = useRef<{ timelines: any } | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [originalStartMs, setOriginalStartMs] = useState(0);
  const [originalEndMs, setOriginalEndMs] = useState(0);

  // Calculate pixels per millisecond based on zoom level
  const pxPerMs = (100 * zoomLevel) / 1000;

  // Use contiguous offset if provided, otherwise absolute position
  const isContiguous = contiguousOffsetMs !== undefined;
  const displayStartMs = isContiguous ? contiguousOffsetMs : segment.startMs;
  const x = (displayStartMs - viewportStartMs) * pxPerMs;
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

      // Batch undo: save pre-drag state and pause undo tracking
      const temporal = useTimelineStore.temporal.getState();
      preDragSnapshotRef.current = {
        timelines: useTimelineStore.getState().timelines,
      };
      temporal.pause();
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

        // Batch undo: insert pre-drag snapshot as single undo entry and resume
        const temporal = useTimelineStore.temporal.getState();
        if (preDragSnapshotRef.current) {
          useTimelineStore.temporal.setState({
            pastStates: [...temporal.pastStates, preDragSnapshotRef.current],
            futureStates: [],
          });
          preDragSnapshotRef.current = null;
        }
        temporal.resume();

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

  // Calculate score-based colors for enabled segments
  const scoreColors = segment.enabled
    ? getScoreColorClasses(segment.preselectionScore)
    : null;

  // Build tooltip text with score breakdown
  const tooltipText = segment.scoreBreakdown
    ? [
        `Score: ${segment.preselectionScore ?? "—"}%`,
        `Script: ${segment.scoreBreakdown.scriptMatch.toFixed(0)}%`,
        `Whisper: ${segment.scoreBreakdown.whisperConfidence.toFixed(0)}%`,
        `Recencia: ${segment.scoreBreakdown.takeOrder.toFixed(0)}%`,
        `Completitud: ${segment.scoreBreakdown.completeness.toFixed(0)}%`,
        `Duracion: ${segment.scoreBreakdown.duration.toFixed(0)}%`,
        segment.totalTakes && segment.totalTakes > 1
          ? `Toma ${segment.takeNumber}/${segment.totalTakes}`
          : null,
      ].filter(Boolean).join("\n")
    : segment.preselectionReason || undefined;

  // Don't render if outside viewport (after hooks to follow React rules)
  if (x + width < -50 || x > 2000) return null;

  const resizeHandleClass =
    "absolute top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 transition-colors z-10";

  return (
    <div
      ref={markerRef}
      className={cn(
        "group absolute top-1 bottom-1 rounded transition-shadow select-none box-border",
        "border-2 flex items-end justify-center text-xs font-medium",
        segment.enabled
          ? scoreColors
            ? `${scoreColors.bg} ${scoreColors.border} ${scoreColors.text}`
            : "bg-emerald-500/30 border-emerald-500 text-emerald-700 dark:text-emerald-300"
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
      title={tooltipText}
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

      {/* Waveform background */}
      {waveformSlice && waveformSlice.length > 0 && (
        <div className="absolute inset-0 overflow-hidden rounded pointer-events-none">
          <Waveform
            data={downsampleForWidth(waveformSlice, Math.max(1, Math.round(width)))}
            width={Math.max(1, Math.round(width))}
            height={(trackHeight ?? 80) - 8}
            color={segment.enabled ? "rgb(74, 222, 128)" : "rgb(156, 163, 175)"}
            style="mirror"
          />
        </div>
      )}

      {/* Take indicator (top-left) */}
      {segment.enabled && segment.totalTakes && segment.totalTakes > 1 && segment.takeNumber && actualWidth > 40 && (
        <span className="absolute top-0.5 left-1 pointer-events-none text-[9px] font-bold opacity-80 leading-none">
          T{segment.takeNumber}/{segment.totalTakes}
        </span>
      )}

      {/* Show log button (top-right, hover only) */}
      {onShowLog && segment.preselectionScore !== undefined && actualWidth > 40 && (
        <button
          type="button"
          className="absolute top-0.5 right-0.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/30"
          onClick={(e) => {
            e.stopPropagation();
            onShowLog();
          }}
          title="Ver log de preseleccion"
        >
          <BarChart3 className="w-3 h-3" />
        </button>
      )}

      {/* Content label (bottom) */}
      <span className="truncate px-1 pb-0.5 pointer-events-none opacity-70 text-[10px] leading-none">
        {segment.enabled
          ? segment.preselectionScore !== undefined && actualWidth > 30
            ? `${segment.preselectionScore}%`
            : ""
          : "Cut"}
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
