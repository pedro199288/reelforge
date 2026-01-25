import { useState, useCallback, useEffect } from "react";
import { SegmentPlayer } from "./SegmentPlayer";
import { SegmentList } from "./SegmentList";
import type { Segment } from "../core/silence/segments";

interface SelectionData {
  videoSrc: string;
  segments: Segment[];
  selectedIndices: number[];
  createdAt: string;
}

interface AppProps {
  videoSrc: string;
  segments: Segment[];
  initialSelection?: number[];
  onSave?: (selection: SelectionData) => void;
}

export const App: React.FC<AppProps> = ({
  videoSrc,
  segments,
  initialSelection,
  onSave,
}) => {
  const [selectedSegments, setSelectedSegments] = useState<Set<number>>(
    () => new Set(initialSelection ?? segments.map((s) => s.index))
  );
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(
    segments.length > 0 ? 0 : null
  );

  const handleToggleSegment = useCallback((index: number) => {
    setSelectedSegments((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleSelectSegment = useCallback((index: number) => {
    setActiveSegmentIndex(index);
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedSegments(new Set(segments.map((s) => s.index)));
  }, [segments]);

  const handleDeselectAll = useCallback(() => {
    setSelectedSegments(new Set());
  }, []);

  const handleSave = useCallback(() => {
    const selectionData: SelectionData = {
      videoSrc,
      segments,
      selectedIndices: Array.from(selectedSegments).sort((a, b) => a - b),
      createdAt: new Date().toISOString(),
    };

    if (onSave) {
      onSave(selectionData);
    } else {
      const blob = new Blob([JSON.stringify(selectionData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "selection.json";
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [videoSrc, segments, selectedSegments, onSave]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (activeSegmentIndex === null) return;

      if (e.key === "ArrowUp" && activeSegmentIndex > 0) {
        e.preventDefault();
        setActiveSegmentIndex(activeSegmentIndex - 1);
      } else if (
        e.key === "ArrowDown" &&
        activeSegmentIndex < segments.length - 1
      ) {
        e.preventDefault();
        setActiveSegmentIndex(activeSegmentIndex + 1);
      } else if (e.key === "Enter" || e.key === " ") {
        if (e.target === document.body) {
          e.preventDefault();
          handleToggleSegment(activeSegmentIndex);
        }
      }
    },
    [activeSegmentIndex, segments.length, handleToggleSegment]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const activeSegment =
    activeSegmentIndex !== null ? segments[activeSegmentIndex] : null;

  const selectedCount = selectedSegments.size;
  const selectedDuration = segments
    .filter((s) => selectedSegments.has(s.index))
    .reduce((sum, s) => sum + s.duration, 0);

  return (
    <div className="flex h-screen bg-background text-foreground font-sans">
      {/* Sidebar - Lista de segmentos */}
      <div className="w-[360px] border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h1 className="m-0 text-lg">Selector de Tomas</h1>
        </div>
        <div className="flex-1 overflow-hidden">
          <SegmentList
            segments={segments}
            selectedSegments={selectedSegments}
            activeSegmentIndex={activeSegmentIndex}
            onToggleSegment={handleToggleSegment}
            onSelectSegment={handleSelectSegment}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
          />
        </div>
      </div>

      {/* Main - Player */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-6">
          <SegmentPlayer
            videoSrc={videoSrc}
            segment={activeSegment}
            width={360}
            height={640}
          />
        </div>

        {/* Footer - Acciones */}
        <div className="px-6 py-4 border-t border-border flex justify-between items-center">
          <div className="text-muted-foreground">
            {selectedCount} segmentos seleccionados ({selectedDuration.toFixed(1)}s)
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={selectedCount === 0}
              className={`px-5 py-2.5 border-none rounded-md text-white text-sm font-medium transition-colors ${
                selectedCount > 0
                  ? "bg-primary cursor-pointer hover:bg-primary/90"
                  : "bg-muted cursor-not-allowed"
              }`}
            >
              Guardar seleccion
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export type { SelectionData };
