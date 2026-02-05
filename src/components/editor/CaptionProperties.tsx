import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditorUIStore, type EditorSelection } from "@/store/editor-ui";
import { cn } from "@/lib/utils";
import { X, Play } from "lucide-react";
import type { SubtitlePage } from "@/core/captions/group-into-pages";
import type { Caption } from "@/core/script/align";

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

interface CaptionPropertiesProps {
  selection: Extract<EditorSelection, { type: "caption" }>;
  captionPages: SubtitlePage[];
  captions: Caption[];
  onSeekTo?: (ms: number) => void;
  onEditCaption: (captionIndex: number, newText: string) => void;
  onEditCaptionTime: (captionIndex: number, startMs: number, endMs: number) => void;
}

export function CaptionProperties({
  selection,
  captionPages,
  captions,
  onSeekTo,
  onEditCaption,
  onEditCaptionTime,
}: CaptionPropertiesProps) {
  const clearSelection = useEditorUIStore((s) => s.clearSelection);

  const page = captionPages[selection.pageIndex];
  if (!page) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Caption no encontrada
      </div>
    );
  }

  const durationMs = page.endMs - page.startMs;
  const avgConfidence = useMemo(() => {
    const confidences = page.words
      .map((w) => w.confidence)
      .filter((c): c is number => c !== undefined);
    if (confidences.length === 0) return undefined;
    return confidences.reduce((a, b) => a + b, 0) / confidences.length;
  }, [page]);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            Pagina #{selection.pageIndex + 1}
          </Badge>
          <span className="text-[10px] font-mono text-muted-foreground">
            {page.startMs}–{page.endMs}ms ({durationMs}ms)
          </span>
          {avgConfidence !== undefined && getConfidenceBadge(avgConfidence)}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearSelection}
          className="h-6 w-6 p-0"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Preview text */}
      <p className="text-sm italic text-muted-foreground leading-relaxed bg-muted/30 rounded p-2">
        {page.words.map((w) => w.text).join("")}
      </p>

      {/* Seek button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onSeekTo?.(page.startMs)}
        className="w-full"
      >
        <Play className="w-3.5 h-3.5 mr-1" />
        Ir a {(page.startMs / 1000).toFixed(1)}s
      </Button>

      {/* Word-by-word editing */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium">Palabras</span>
        {page.words.map((word, wi) => {
          const globalIndex = captions.findIndex(
            (c) =>
              c.startMs === word.startMs &&
              c.endMs === word.endMs &&
              c.text === word.text
          );

          return (
            <div
              key={`${word.startMs}-${wi}`}
              className="flex items-center gap-1.5"
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
              <Input
                type="number"
                step={10}
                value={word.startMs}
                onChange={(e) => {
                  if (globalIndex >= 0) {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      onEditCaptionTime(globalIndex, val, word.endMs);
                    }
                  }
                }}
                className="h-6 text-[9px] px-1 w-[52px] font-mono text-muted-foreground border-transparent hover:border-border focus:border-border"
                title="Inicio (ms)"
              />
              <Input
                type="number"
                step={10}
                value={word.endMs}
                onChange={(e) => {
                  if (globalIndex >= 0) {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      onEditCaptionTime(globalIndex, word.startMs, val);
                    }
                  }
                }}
                className="h-6 text-[9px] px-1 w-[52px] font-mono text-muted-foreground border-transparent hover:border-border focus:border-border"
                title="Fin (ms)"
              />
              {getConfidenceBadge(word.confidence)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
