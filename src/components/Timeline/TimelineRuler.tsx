import { useMemo } from "react";

interface TimelineRulerProps {
  durationMs: number;
  zoomLevel: number;
  viewportStartMs: number;
  viewportWidthPx: number;
  onSeek: (ms: number) => void;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor((ms % 1000) / 10);

  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${seconds}.${milliseconds.toString().padStart(2, "0")}`;
}

export function TimelineRuler({
  durationMs,
  zoomLevel,
  viewportStartMs,
  viewportWidthPx,
  onSeek,
}: TimelineRulerProps) {
  // Calculate pixels per millisecond based on zoom level
  // At zoom level 1, 1 second = 100px
  const pxPerMs = (100 * zoomLevel) / 1000;

  // Calculate tick interval based on zoom level
  const tickIntervalMs = useMemo(() => {
    if (zoomLevel >= 4) return 100; // 100ms ticks at high zoom
    if (zoomLevel >= 2) return 250; // 250ms ticks
    if (zoomLevel >= 1) return 500; // 500ms ticks
    if (zoomLevel >= 0.5) return 1000; // 1s ticks
    if (zoomLevel >= 0.25) return 2000; // 2s ticks
    return 5000; // 5s ticks at low zoom
  }, [zoomLevel]);

  // Major tick every nth minor tick
  const majorTickInterval = tickIntervalMs < 1000 ? 1000 : tickIntervalMs * 5;

  // Calculate visible range
  const visibleDurationMs = viewportWidthPx / pxPerMs;
  const startMs = Math.max(0, viewportStartMs - tickIntervalMs);
  const endMs = Math.min(durationMs, viewportStartMs + visibleDurationMs + tickIntervalMs);

  // Generate tick marks
  const ticks = useMemo(() => {
    const result: { ms: number; x: number; isMajor: boolean }[] = [];
    const firstTick = Math.floor(startMs / tickIntervalMs) * tickIntervalMs;

    for (let ms = firstTick; ms <= endMs; ms += tickIntervalMs) {
      if (ms < 0) continue;
      const x = (ms - viewportStartMs) * pxPerMs;
      const isMajor = ms % majorTickInterval === 0;
      result.push({ ms, x, isMajor });
    }

    return result;
  }, [startMs, endMs, tickIntervalMs, majorTickInterval, viewportStartMs, pxPerMs]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ms = viewportStartMs + clickX / pxPerMs;
    onSeek(Math.max(0, Math.min(durationMs, ms)));
  };

  return (
    <div className="flex border-b border-border">
      <div className="w-20 shrink-0 bg-muted/30 border-r border-border" />
      <div
        className="flex-1 relative h-6 bg-muted/20 cursor-pointer select-none"
        onClick={handleClick}
      >
        {ticks.map(({ ms, x, isMajor }) => (
          <div
            key={ms}
            className="absolute top-0"
            style={{ left: x }}
          >
            <div
              className={`w-px ${isMajor ? "h-4 bg-foreground/60" : "h-2 bg-foreground/30"}`}
            />
            {isMajor && (
              <span className="absolute top-4 left-1 text-[10px] text-muted-foreground whitespace-nowrap">
                {formatTime(ms)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
