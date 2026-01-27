import { LABEL_COLUMN_WIDTH, getPxPerMs } from "./constants";

interface TimelinePlayheadProps {
  playheadMs: number;
  zoomLevel: number;
  viewportStartMs: number;
}

export function TimelinePlayhead({
  playheadMs,
  zoomLevel,
  viewportStartMs,
}: TimelinePlayheadProps) {
  const pxPerMs = getPxPerMs(zoomLevel);
  const x = (playheadMs - viewportStartMs) * pxPerMs;

  // Only render if playhead is in visible viewport
  if (x < -10 || x > 2000) return null;

  return (
    <div
      className="absolute top-0 bottom-0 pointer-events-none z-20"
      style={{ left: `calc(${LABEL_COLUMN_WIDTH}px + ${x}px)` }}
    >
      {/* Playhead handle */}
      <div className="absolute -top-1 -left-2 w-4 h-3 bg-red-500 rounded-t-sm">
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-red-500" />
      </div>
      {/* Playhead line */}
      <div className="w-px h-full bg-red-500" />
    </div>
  );
}
