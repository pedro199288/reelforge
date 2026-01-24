import type { Segment } from "@/core/silence/segments";

interface SegmentListProps {
  segments: Segment[];
  selectedSegments: Set<number>;
  activeSegmentIndex: number | null;
  onToggleSegment: (index: number) => void;
  onSelectSegment: (index: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export const SegmentList: React.FC<SegmentListProps> = ({
  segments,
  selectedSegments,
  activeSegmentIndex,
  onToggleSegment,
  onSelectSegment,
  onSelectAll,
  onDeselectAll,
}) => {
  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);
  const selectedDuration = segments
    .filter((s) => selectedSegments.has(s.index))
    .reduce((sum, s) => sum + s.duration, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #333",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <strong>{selectedSegments.size}</strong> de {segments.length}{" "}
          seleccionados
          <span style={{ color: "#888", marginLeft: 8 }}>
            ({selectedDuration.toFixed(1)}s / {totalDuration.toFixed(1)}s)
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onSelectAll}
            style={{
              padding: "4px 8px",
              background: "#2563eb",
              border: "none",
              borderRadius: 4,
              color: "white",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Todos
          </button>
          <button
            onClick={onDeselectAll}
            style={{
              padding: "4px 8px",
              background: "#4b5563",
              border: "none",
              borderRadius: 4,
              color: "white",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Ninguno
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {segments.map((segment) => {
          const isSelected = selectedSegments.has(segment.index);
          const isActive = activeSegmentIndex === segment.index;

          return (
            <div
              key={segment.index}
              onClick={() => onSelectSegment(segment.index)}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 16px",
                borderBottom: "1px solid #222",
                cursor: "pointer",
                backgroundColor: isActive ? "#1e3a5f" : "transparent",
                transition: "background-color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "#2a2a2a";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleSegment(segment.index);
                }}
                style={{
                  width: 18,
                  height: 18,
                  marginRight: 12,
                  accentColor: "#2563eb",
                  cursor: "pointer",
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>
                  Segmento #{segment.index + 1}
                </div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                  {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                </div>
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: isSelected ? "#60a5fa" : "#666",
                  fontWeight: isSelected ? 500 : 400,
                }}
              >
                {segment.duration.toFixed(2)}s
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, "0")}`;
}
