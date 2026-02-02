import { useRef, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Subtitles, Play } from "lucide-react";
import type { SubtitlePage } from "@/core/captions/group-into-pages";
import type { Caption } from "@/core/script/align";

interface CaptionListPanelProps {
  pages: SubtitlePage[];
  captions: Caption[];
  currentTimeMs: number;
  selectedPageIndex: number | null;
  onSelectPage: (index: number) => void;
  onSeekTo: (ms: number) => void;
  onEditCaption: (captionIndex: number, newText: string) => void;
}

function getConfidenceBadge(confidence: number | undefined) {
  if (confidence === undefined) return null;
  const pct = Math.round(confidence * 100);
  const color =
    confidence >= 0.8
      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
      : confidence >= 0.5
        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  return (
    <span className={cn("text-[10px] px-1 py-0.5 rounded font-mono", color)}>
      {pct}%
    </span>
  );
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function CaptionPageCard({
  page,
  pageIndex,
  captions,
  currentTimeMs,
  isActive,
  isSelected,
  onSelect,
  onSeekTo,
  onEditCaption,
}: {
  page: SubtitlePage;
  pageIndex: number;
  captions: Caption[];
  currentTimeMs: number;
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onSeekTo: (ms: number) => void;
  onEditCaption: (captionIndex: number, newText: string) => void;
}) {
  const durationMs = page.endMs - page.startMs;

  return (
    <div
      data-page-index={pageIndex}
      className={cn(
        "rounded-lg border p-2.5 space-y-2 transition-colors",
        isActive && "border-l-4 border-l-blue-500",
        isSelected && "ring-2 ring-blue-500",
        !isActive && !isSelected && "hover:bg-muted/30"
      )}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px] px-1.5">
          #{pageIndex + 1}
        </Badge>
        <span className="text-[10px] font-mono text-muted-foreground">
          {page.startMs} - {page.endMs}ms
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          ({durationMs}ms)
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 ml-auto"
          onClick={(e) => {
            e.stopPropagation();
            onSeekTo(page.startMs);
          }}
          title="Ir a este momento"
        >
          <Play className="w-3 h-3" />
        </Button>
      </div>

      {/* Preview text */}
      <p className="text-xs italic text-muted-foreground leading-relaxed">
        {page.words.map((w) => w.text).join("")}
      </p>

      {/* Word details */}
      <div className="space-y-1">
        {page.words.map((word, wi) => {
          // Find the global caption index for this word
          const globalIndex = captions.findIndex(
            (c) => c.startMs === word.startMs && c.endMs === word.endMs && c.text === word.text
          );

          return (
            <div
              key={`${word.startMs}-${wi}`}
              className="flex items-center gap-1.5 group"
            >
              <Input
                value={word.text}
                onChange={(e) => {
                  if (globalIndex >= 0) {
                    onEditCaption(globalIndex, e.target.value);
                  }
                }}
                className="h-6 text-[11px] px-1.5 flex-1 border-transparent hover:border-border focus:border-border"
              />
              <button
                type="button"
                className="text-[9px] font-mono text-muted-foreground/50 hover:text-muted-foreground cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(String(word.startMs));
                }}
                title="Copiar startMs"
              >
                {word.startMs}
              </button>
              <span className="text-[9px] text-muted-foreground/30">-</span>
              <button
                type="button"
                className="text-[9px] font-mono text-muted-foreground/50 hover:text-muted-foreground cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(String(word.endMs));
                }}
                title="Copiar endMs"
              >
                {word.endMs}
              </button>
              {getConfidenceBadge(word.confidence)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CaptionListPanel({
  pages,
  captions,
  currentTimeMs,
  selectedPageIndex,
  onSelectPage,
  onSeekTo,
  onEditCaption,
}: CaptionListPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastAutoScrollMs = useRef(0);

  // Active page: the one containing currentTimeMs
  const activePageIndex = useMemo(() => {
    for (let i = 0; i < pages.length; i++) {
      if (currentTimeMs >= pages[i].startMs && currentTimeMs <= pages[i].endMs)
        return i;
    }
    return null;
  }, [pages, currentTimeMs]);

  // Total word count
  const wordCount = useMemo(
    () => pages.reduce((sum, p) => sum + p.words.length, 0),
    [pages]
  );

  // Auto-scroll to active page (debounced)
  useEffect(() => {
    if (activePageIndex === null) return;
    const now = Date.now();
    if (now - lastAutoScrollMs.current < 500) return;
    lastAutoScrollMs.current = now;

    const container = scrollRef.current;
    if (!container) return;

    const el = container.querySelector(`[data-page-index="${activePageIndex}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activePageIndex]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0">
        <Subtitles className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Subtítulos</span>
        <Badge variant="secondary" className="text-[10px]">
          {pages.length} págs
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          {wordCount} palabras
        </Badge>
      </div>

      {/* Scrollable list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-subtle">
        {pages.map((page, index) => (
          <CaptionPageCard
            key={`${page.startMs}-${index}`}
            page={page}
            pageIndex={index}
            captions={captions}
            currentTimeMs={currentTimeMs}
            isActive={index === activePageIndex}
            isSelected={index === selectedPageIndex}
            onSelect={() => onSelectPage(index)}
            onSeekTo={onSeekTo}
            onEditCaption={onEditCaption}
          />
        ))}
        {pages.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No hay subtítulos disponibles
          </div>
        )}
      </div>
    </div>
  );
}
