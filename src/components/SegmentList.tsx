import type { Segment } from "@/core/silence/segments";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
        <div className="text-sm">
          <strong>{selectedSegments.size}</strong> de {segments.length} seleccionados
          <span className="text-muted-foreground ml-2">
            ({selectedDuration.toFixed(1)}s / {totalDuration.toFixed(1)}s)
          </span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="default" onClick={onSelectAll}>
            Todos
          </Button>
          <Button size="sm" variant="secondary" onClick={onDeselectAll}>
            Ninguno
          </Button>
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
              className={cn(
                "flex items-center px-4 py-2.5 border-b border-border/50 cursor-pointer transition-colors",
                isActive ? "bg-primary/20" : "hover:bg-muted"
              )}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleSegment(segment.index);
                }}
                className="w-4 h-4 mr-3 accent-primary cursor-pointer"
              />
              <div className="flex-1">
                <div className="font-medium text-sm">
                  Segmento #{segment.index + 1}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                </div>
              </div>
              <div
                className={cn(
                  "text-sm",
                  isSelected ? "text-primary font-medium" : "text-muted-foreground"
                )}
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
