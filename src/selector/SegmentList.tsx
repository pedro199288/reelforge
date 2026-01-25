import type { Segment } from "../core/silence/segments";

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
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex justify-between items-center">
        <div>
          <strong>{selectedSegments.size}</strong> de {segments.length}{" "}
          seleccionados
          <span className="text-muted-foreground ml-2">
            ({selectedDuration.toFixed(1)}s / {totalDuration.toFixed(1)}s)
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="px-2 py-1 bg-primary border-none rounded text-white cursor-pointer text-xs hover:bg-primary/90 transition-colors"
          >
            Todos
          </button>
          <button
            onClick={onDeselectAll}
            className="px-2 py-1 bg-muted border-none rounded text-white cursor-pointer text-xs hover:bg-muted/80 transition-colors"
          >
            Ninguno
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {segments.map((segment) => {
          const isSelected = selectedSegments.has(segment.index);
          const isActive = activeSegmentIndex === segment.index;

          return (
            <div
              key={segment.index}
              onClick={() => onSelectSegment(segment.index)}
              className={`flex items-center px-4 py-2.5 border-b border-border/50 cursor-pointer transition-colors ${
                isActive ? "bg-primary/20" : "hover:bg-muted/50"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleSegment(segment.index);
                }}
                className="w-[18px] h-[18px] mr-3 accent-primary cursor-pointer"
              />
              <div className="flex-1">
                <div className="font-medium">
                  Segmento #{segment.index + 1}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                </div>
              </div>
              <div
                className={`text-sm ${
                  isSelected ? "text-primary font-medium" : "text-muted-foreground"
                }`}
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
