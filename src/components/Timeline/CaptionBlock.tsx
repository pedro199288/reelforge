import { cn } from "@/lib/utils";
import type { Caption } from "@/core/script/align";

interface CaptionBlockProps {
  caption: Caption;
  index: number;
  zoomLevel: number;
  viewportStartMs: number;
  isHighlighted: boolean;
  onClick?: () => void;
}

export function CaptionBlock({
  caption,
  zoomLevel,
  viewportStartMs,
  isHighlighted,
  onClick,
}: CaptionBlockProps) {
  // Calculate pixels per millisecond based on zoom level
  const pxPerMs = (100 * zoomLevel) / 1000;

  const x = (caption.startMs - viewportStartMs) * pxPerMs;
  const width = Math.max((caption.endMs - caption.startMs) * pxPerMs, 30); // Minimum 30px width

  // Don't render if outside viewport
  if (x + width < -50 || x > 2000) return null;

  return (
    <div
      className={cn(
        "absolute top-1 bottom-1 rounded-sm cursor-pointer transition-all",
        "bg-muted/60 border border-border/50 px-1",
        "flex items-center overflow-hidden",
        "hover:bg-muted hover:border-border",
        isHighlighted && "bg-yellow-500/30 border-yellow-500"
      )}
      style={{
        left: x,
        width,
      }}
      onClick={onClick}
      title={caption.text}
    >
      <span className="text-[10px] text-foreground/80 truncate">
        {caption.text}
      </span>
    </div>
  );
}
