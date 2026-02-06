import { TRACK_HEADER_WIDTH, getPxPerFrame } from "./constants";

interface EditorTimelinePlayheadProps {
  currentFrame: number;
  zoom: number;
  scrollX: number;
  viewportWidth?: number;
}

export function EditorTimelinePlayhead({
  currentFrame,
  zoom,
  scrollX,
  viewportWidth,
}: EditorTimelinePlayheadProps) {
  const pxPerFrame = getPxPerFrame(zoom);
  const x = currentFrame * pxPerFrame - scrollX + TRACK_HEADER_WIDTH;

  // Viewport culling
  if (x < TRACK_HEADER_WIDTH - 10 || x > (viewportWidth ?? 2000) + TRACK_HEADER_WIDTH + 10) {
    return null;
  }

  return (
    <div
      className="absolute top-0 bottom-0 z-30 pointer-events-none"
      style={{
        transform: `translateX(${x}px)`,
        willChange: "transform",
      }}
    >
      {/* Head triangle */}
      <div
        className="absolute -top-0 -translate-x-1/2 w-3 h-3 bg-red-500"
        style={{
          clipPath: "polygon(0 0, 100% 0, 50% 100%)",
        }}
      />
      {/* Line */}
      <div className="w-px h-full bg-red-500 -translate-x-1/2" />
    </div>
  );
}
