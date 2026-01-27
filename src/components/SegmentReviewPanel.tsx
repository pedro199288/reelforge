import { useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useSelection, useWorkspaceStore } from "@/store/workspace";
import { cn } from "@/lib/utils";
import { Play, Clock, Scissors, CheckCircle2, XCircle } from "lucide-react";

interface Segment {
  startTime: number;
  endTime: number;
  duration: number;
  index: number;
}

interface SegmentReviewPanelProps {
  videoId: string;
  segments: Segment[];
  totalDuration: number;
  onSeekTo?: (seconds: number) => void;
  onSelectionChange?: (selectedIndices: number[]) => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return mins > 0 ? `${mins}:${secs.padStart(4, "0")}` : `${secs}s`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function SegmentReviewPanel({
  videoId,
  segments,
  totalDuration,
  onSeekTo,
  onSelectionChange,
}: SegmentReviewPanelProps) {
  const selectedIndices = useSelection(videoId);
  const setSelection = useWorkspaceStore((s) => s.setSelection);
  const toggleSegment = useWorkspaceStore((s) => s.toggleSegment);

  // Initialize selection with all segments if empty
  const effectiveSelection = useMemo(() => {
    if (selectedIndices.length === 0 && segments.length > 0) {
      return segments.map((s) => s.index);
    }
    return selectedIndices;
  }, [selectedIndices, segments]);

  // Calculate statistics
  const stats = useMemo(() => {
    const selectedSegments = segments.filter((s) =>
      effectiveSelection.includes(s.index)
    );
    const selectedDuration = selectedSegments.reduce(
      (sum, s) => sum + s.duration,
      0
    );
    const removedDuration = totalDuration - selectedDuration;
    const percentKept = totalDuration > 0 ? (selectedDuration / totalDuration) * 100 : 0;

    return {
      totalSegments: segments.length,
      selectedCount: selectedSegments.length,
      selectedDuration,
      removedDuration,
      percentKept,
    };
  }, [segments, effectiveSelection, totalDuration]);

  const handleToggle = useCallback(
    (index: number) => {
      // If this is the first toggle and selection is empty, initialize with all except this one
      if (selectedIndices.length === 0) {
        const allIndices = segments.map((s) => s.index).filter((i) => i !== index);
        setSelection(videoId, allIndices);
        onSelectionChange?.(allIndices);
      } else {
        toggleSegment(videoId, index);
        const newSelection = selectedIndices.includes(index)
          ? selectedIndices.filter((i) => i !== index)
          : [...selectedIndices, index].sort((a, b) => a - b);
        onSelectionChange?.(newSelection);
      }
    },
    [videoId, segments, selectedIndices, setSelection, toggleSegment, onSelectionChange]
  );

  const handleSelectAll = useCallback(() => {
    const allIndices = segments.map((s) => s.index);
    setSelection(videoId, allIndices);
    onSelectionChange?.(allIndices);
  }, [videoId, segments, setSelection, onSelectionChange]);

  const handleSelectNone = useCallback(() => {
    setSelection(videoId, []);
    onSelectionChange?.([]);
  }, [videoId, setSelection, onSelectionChange]);

  const isSelected = useCallback(
    (index: number) => effectiveSelection.includes(index),
    [effectiveSelection]
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Scissors className="w-5 h-5" />
            Revisar Segmentos
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              Todos
            </Button>
            <Button variant="outline" size="sm" onClick={handleSelectNone}>
              Ninguno
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Statistics summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {stats.selectedCount}/{stats.totalSegments}
            </div>
            <div className="text-xs text-muted-foreground">Segmentos</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {formatDuration(stats.selectedDuration)}
            </div>
            <div className="text-xs text-muted-foreground">Duración final</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {formatDuration(stats.removedDuration)}
            </div>
            <div className="text-xs text-muted-foreground">Tiempo eliminado</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">
              {stats.percentKept.toFixed(0)}%
            </div>
            <div className="text-xs text-muted-foreground">Contenido</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Contenido seleccionado</span>
            <span>{stats.percentKept.toFixed(1)}%</span>
          </div>
          <Progress value={stats.percentKept} className="h-2" />
        </div>

        {/* Segment list */}
        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2 scrollbar-subtle">
          {segments.map((segment) => {
            const selected = isSelected(segment.index);
            return (
              <div
                key={segment.index}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                  selected
                    ? "bg-primary/5 border-primary/20"
                    : "bg-muted/30 border-transparent opacity-60"
                )}
              >
                <Checkbox
                  id={`segment-${segment.index}`}
                  checked={selected}
                  onCheckedChange={() => handleToggle(segment.index)}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={selected ? "default" : "secondary"} className="text-xs">
                      #{segment.index + 1}
                    </Badge>
                    <span className="text-sm font-mono text-muted-foreground">
                      {formatTime(segment.startTime)} → {formatTime(segment.endTime)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 text-sm">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-medium">{formatDuration(segment.duration)}</span>
                  </div>

                  {selected ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}

                  {onSeekTo && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => onSeekTo(segment.startTime)}
                    >
                      <Play className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {segments.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No hay segmentos disponibles. Ejecuta la fase de "Segmentos" primero.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
