import { cn } from "@/lib/utils";
import type { TimelineHighlight } from "@/store/timeline";

interface HighlightMarkerProps {
  highlight: TimelineHighlight;
  zoomLevel: number;
  viewportStartMs: number;
  isSelected: boolean;
  onSelect: () => void;
}

export function HighlightMarker({
  highlight,
  zoomLevel,
  viewportStartMs,
  isSelected,
  onSelect,
}: HighlightMarkerProps) {
  // Calculate pixels per millisecond based on zoom level
  const pxPerMs = (100 * zoomLevel) / 1000;

  const x = (highlight.startMs - viewportStartMs) * pxPerMs;
  const width = Math.max((highlight.endMs - highlight.startMs) * pxPerMs, 24); // Minimum 24px width

  // Don't render if outside viewport
  if (x + width < -50 || x > 2000) return null;

  return (
    <div
      className={cn(
        "absolute top-1 bottom-1 rounded cursor-pointer transition-all",
        "border-2 flex items-center justify-center text-xs",
        "bg-yellow-500/20 border-yellow-500 text-yellow-700 dark:text-yellow-300",
        isSelected && "ring-2 ring-primary ring-offset-1"
      )}
      style={{
        left: x,
        width,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      title={highlight.word}
    >
      <span className="truncate px-1 font-medium">
        {highlight.word}
      </span>
    </div>
  );
}
