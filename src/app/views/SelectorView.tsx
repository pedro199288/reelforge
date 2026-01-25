import { useState, useCallback, useEffect, useMemo } from "react";
import { SegmentPlayer } from "@/components/SegmentPlayer";
import { SegmentList } from "@/components/SegmentList";
import type { Segment } from "@/core/silence/segments";
import { useWorkspaceStore } from "@/store/workspace";

interface SelectionData {
  videoSrc: string;
  segments: Segment[];
  selectedIndices: number[];
  createdAt: string;
}

// Datos de ejemplo para desarrollo
const exampleSegments: Segment[] = [
  { index: 0, startTime: 0, endTime: 2.5, duration: 2.5 },
  { index: 1, startTime: 3.2, endTime: 5.8, duration: 2.6 },
  { index: 2, startTime: 6.5, endTime: 9.1, duration: 2.6 },
  { index: 3, startTime: 10.0, endTime: 12.3, duration: 2.3 },
  { index: 4, startTime: 13.5, endTime: 16.0, duration: 2.5 },
];

const VIDEO_SRC = "/sample-video.mp4";

export const SelectorView: React.FC = () => {
  const segments = exampleSegments;
  const videoSrc = VIDEO_SRC;

  // Derive videoId from videoSrc for store key
  const videoId = useMemo(
    () => videoSrc.replace(/^\//, "").replace(/\.[^.]+$/, ""),
    [videoSrc]
  );

  // Use persistent store for selections
  const storedSelection = useWorkspaceStore(
    (state) => state.selections[videoId]
  );
  const setSelection = useWorkspaceStore((state) => state.setSelection);
  const toggleSegment = useWorkspaceStore((state) => state.toggleSegment);

  // Convert array to Set for component compatibility
  const selectedSegments = useMemo(() => {
    // If no stored selection, default to all segments selected
    if (!storedSelection) {
      return new Set(segments.map((s) => s.index));
    }
    return new Set(storedSelection);
  }, [storedSelection, segments]);

  // Initialize selection on first load if not stored
  useEffect(() => {
    if (!storedSelection) {
      setSelection(
        videoId,
        segments.map((s) => s.index)
      );
    }
  }, [videoId, storedSelection, segments, setSelection]);

  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(
    segments.length > 0 ? 0 : null
  );

  const handleToggleSegment = useCallback(
    (index: number) => {
      toggleSegment(videoId, index);
    },
    [videoId, toggleSegment]
  );

  const handleSelectSegment = useCallback((index: number) => {
    setActiveSegmentIndex(index);
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelection(
      videoId,
      segments.map((s) => s.index)
    );
  }, [videoId, segments, setSelection]);

  const handleDeselectAll = useCallback(() => {
    setSelection(videoId, []);
  }, [videoId, setSelection]);

  const handleSave = useCallback(() => {
    const selectionData: SelectionData = {
      videoSrc,
      segments,
      selectedIndices: Array.from(selectedSegments).sort((a, b) => a - b),
      createdAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(selectionData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `selection-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [videoSrc, segments, selectedSegments]);

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
    <div className="flex h-full">
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
            {selectedCount} segmentos seleccionados (
            {selectedDuration.toFixed(1)}s)
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
