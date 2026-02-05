import { useMemo } from "react";
import { TimelineTrack } from "./TimelineTrack";
import { getPxPerMs } from "./constants";
import { cn } from "@/lib/utils";
import type { SubtitlePage } from "@/core/captions/group-into-pages";

interface CaptionTrackProps {
  pages: SubtitlePage[];
  zoomLevel: number;
  viewportStartMs: number;
  viewportWidthPx: number;
  currentTimeMs: number;
  selectedPageIndex: number | null;
  onSelectPage: (index: number) => void;
  onSeek: (ms: number) => void;
}

export function CaptionTrack({
  pages,
  zoomLevel,
  viewportStartMs,
  viewportWidthPx,
  currentTimeMs,
  selectedPageIndex,
  onSelectPage,
  onSeek,
}: CaptionTrackProps) {
  const pxPerMs = getPxPerMs(zoomLevel);
  const CULL_MARGIN = 50;

  // Determine active page index (page containing currentTimeMs)
  const activePageIndex = useMemo(() => {
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      if (currentTimeMs >= p.startMs && currentTimeMs <= p.endMs) return i;
    }
    return null;
  }, [pages, currentTimeMs]);

  // Visible range for culling
  const visibleStartMs = viewportStartMs - CULL_MARGIN / pxPerMs;
  const visibleEndMs = viewportStartMs + (viewportWidthPx + CULL_MARGIN) / pxPerMs;

  return (
    <TimelineTrack name="Subs" height={32}>
      {pages.map((page, index) => {
        // Viewport culling
        if (page.endMs < visibleStartMs || page.startMs > visibleEndMs) return null;

        const left = (page.startMs - viewportStartMs) * pxPerMs;
        const width = (page.endMs - page.startMs) * pxPerMs;
        const isActive = index === activePageIndex;
        const isSelected = index === selectedPageIndex;
        const text = page.words.map((w) => w.text).join("");

        return (
          <button
            key={`${page.startMs}-${index}`}
            type="button"
            className={cn(
              "absolute top-1 bottom-1 rounded-sm cursor-pointer transition-colors overflow-hidden",
              "text-[9px] leading-tight text-foreground/70 px-0.5 truncate text-left",
              isActive
                ? "bg-blue-500/40"
                : "bg-blue-500/15 hover:bg-blue-500/25",
              isSelected && "ring-2 ring-blue-500"
            )}
            style={{ left, width: Math.max(width, 2) }}
            title={`${text}\n${page.startMs}ms - ${page.endMs}ms`}
            onClick={() => {
              onSelectPage(index);
              onSeek(page.startMs);
            }}
          >
            {width > 20 && text}
          </button>
        );
      })}
    </TimelineTrack>
  );
}
