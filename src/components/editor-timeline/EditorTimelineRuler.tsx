import { useCallback, useMemo } from "react";
import { framesToTimecode } from "@/types/editor";
import { TRACK_HEADER_WIDTH, getPxPerFrame } from "./constants";

interface EditorTimelineRulerProps {
  durationInFrames: number;
  fps: number;
  zoom: number;
  scrollX: number;
  viewportWidth: number;
  onSeek: (frame: number) => void;
}

export function EditorTimelineRuler({
  durationInFrames,
  fps,
  zoom,
  scrollX,
  viewportWidth,
  onSeek,
}: EditorTimelineRulerProps) {
  const pxPerFrame = getPxPerFrame(zoom);

  const tickInterval = useMemo(() => {
    // Adapt tick density to zoom level
    const targetTickPx = 80; // Target ~80px between major ticks
    const framesPerTargetPx = targetTickPx / pxPerFrame;

    if (framesPerTargetPx <= 1) return 1;
    if (framesPerTargetPx <= 5) return 5;
    if (framesPerTargetPx <= 10) return 10;
    if (framesPerTargetPx <= fps / 2) return Math.round(fps / 2);
    if (framesPerTargetPx <= fps) return fps;
    if (framesPerTargetPx <= fps * 5) return fps * 5;
    if (framesPerTargetPx <= fps * 10) return fps * 10;
    if (framesPerTargetPx <= fps * 30) return fps * 30;
    return fps * 60;
  }, [pxPerFrame, fps]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left - TRACK_HEADER_WIDTH + scrollX;
      const frame = Math.round(clickX / pxPerFrame);
      onSeek(Math.max(0, Math.min(durationInFrames - 1, frame)));
    },
    [pxPerFrame, scrollX, durationInFrames, onSeek]
  );

  const contentWidth = durationInFrames * pxPerFrame;
  const startFrame = Math.floor(scrollX / pxPerFrame);
  const endFrame = Math.min(
    durationInFrames,
    Math.ceil((scrollX + viewportWidth) / pxPerFrame)
  );

  const ticks: { frame: number; x: number; isMajor: boolean }[] = [];
  const firstTick = Math.floor(startFrame / tickInterval) * tickInterval;

  for (let frame = firstTick; frame <= endFrame; frame += tickInterval) {
    if (frame < 0) continue;
    ticks.push({
      frame,
      x: frame * pxPerFrame - scrollX + TRACK_HEADER_WIDTH,
      isMajor: frame % (tickInterval * 2) === 0 || tickInterval <= 1,
    });
  }

  return (
    <div
      className="h-7 border-b bg-muted/30 relative cursor-pointer select-none flex-shrink-0"
      onClick={handleClick}
    >
      {/* Fixed header spacer */}
      <div
        className="absolute left-0 top-0 bottom-0 bg-muted/50 border-r z-10"
        style={{ width: TRACK_HEADER_WIDTH }}
      />

      {/* Ticks */}
      {ticks.map(({ frame, x, isMajor }) => (
        <div
          key={frame}
          className="absolute top-0 bottom-0"
          style={{ left: x }}
        >
          <div
            className={`w-px ${isMajor ? "h-full bg-border" : "h-2 bg-border/50"}`}
          />
          {isMajor && (
            <span
              className="absolute top-1 left-1 text-[10px] text-muted-foreground whitespace-nowrap"
              style={{ width: contentWidth }}
            >
              {framesToTimecode(frame, fps)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
