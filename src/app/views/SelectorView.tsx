import { useState, useCallback, useEffect } from "react";
import { SegmentPlayer } from "@/components/SegmentPlayer";
import { SegmentList } from "@/components/SegmentList";
import type { Segment } from "@/core/silence/segments";

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

  const [selectedSegments, setSelectedSegments] = useState<Set<number>>(
    () => new Set(segments.map((s) => s.index))
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
    <div style={{ display: "flex", height: "100%" }}>
      {/* Sidebar - Lista de segmentos */}
      <div
        style={{
          width: 360,
          borderRight: "1px solid #333",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid #333",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 18 }}>Selector de Tomas</h1>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
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
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <SegmentPlayer
            videoSrc={videoSrc}
            segment={activeSegment}
            width={360}
            height={640}
          />
        </div>

        {/* Footer - Acciones */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #333",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ color: "#888" }}>
            {selectedCount} segmentos seleccionados (
            {selectedDuration.toFixed(1)}s)
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={handleSave}
              disabled={selectedCount === 0}
              style={{
                padding: "10px 20px",
                background: selectedCount > 0 ? "#2563eb" : "#333",
                border: "none",
                borderRadius: 6,
                color: "white",
                cursor: selectedCount > 0 ? "pointer" : "not-allowed",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Guardar seleccion
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
