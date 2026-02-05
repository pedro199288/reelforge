import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useVideoSegments,
  useTimelineActions,
} from "@/store/timeline";
import { useEditorUIStore, type EditorSelection } from "@/store/editor-ui";
import { cn } from "@/lib/utils";
import {
  X,
  Clock,
  Play,
  ToggleLeft,
  ToggleRight,
  ScrollText,
} from "lucide-react";

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

interface SegmentPropertiesProps {
  videoId: string;
  selection: Extract<EditorSelection, { type: "segment" }>;
  onSeekTo?: (ms: number) => void;
  onShowLog?: (segmentId: string) => void;
}

export function SegmentProperties({
  videoId,
  selection,
  onSeekTo,
  onShowLog,
}: SegmentPropertiesProps) {
  const segments = useVideoSegments(videoId);
  const { toggleSegment } = useTimelineActions();
  const clearSelection = useEditorUIStore((s) => s.clearSelection);

  const selectedSegment = useMemo(() => {
    return segments.find((s) => s.id === selection.id) ?? null;
  }, [segments, selection.id]);

  const selectedSegmentIndex = useMemo(() => {
    if (!selectedSegment) return null;
    const index = segments.findIndex((s) => s.id === selectedSegment.id);
    return index >= 0 ? index + 1 : null;
  }, [selectedSegment, segments]);

  if (!selectedSegment || !selectedSegmentIndex) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Segmento no encontrado
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="default" className="text-xs">
            #{selectedSegmentIndex}
          </Badge>
          <Badge
            variant={selectedSegment.enabled ? "default" : "secondary"}
            className={cn(
              "text-xs",
              selectedSegment.enabled
                ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400"
                : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400"
            )}
          >
            {selectedSegment.enabled ? "Habilitado" : "Deshabilitado"}
          </Badge>
          {selectedSegment.preselectionScore !== undefined && (
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                selectedSegment.preselectionScore >= 85
                  ? "bg-green-100 text-green-700 border-green-300"
                  : selectedSegment.preselectionScore >= 60
                    ? "bg-yellow-100 text-yellow-700 border-yellow-300"
                    : "bg-red-100 text-red-700 border-red-300"
              )}
            >
              {selectedSegment.preselectionScore}%
            </Badge>
          )}
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

      {/* Time info */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground block text-xs">Inicio</span>
          <span className="font-mono font-medium">
            {formatTime(selectedSegment.startMs / 1000)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground block text-xs">Fin</span>
          <span className="font-mono font-medium">
            {formatTime(selectedSegment.endMs / 1000)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground block text-xs">Duracion</span>
          <span className="font-medium flex items-center gap-1">
            <Clock className="w-3 h-3 text-muted-foreground" />
            {formatDuration(
              (selectedSegment.endMs - selectedSegment.startMs) / 1000
            )}
          </span>
        </div>
      </div>

      {/* Take info */}
      {selectedSegment.takeGroupId && (
        <div className="text-xs text-muted-foreground">
          Take {selectedSegment.takeNumber}/{selectedSegment.totalTakes}
        </div>
      )}

      {/* Preselection reason */}
      {selectedSegment.preselectionReason && (
        <div className="p-2 bg-muted/50 rounded border text-xs">
          <span className="text-muted-foreground">Razon: </span>
          <span>{selectedSegment.preselectionReason}</span>
        </div>
      )}

      {/* Score breakdown */}
      {selectedSegment.scoreBreakdown && (
        <div className="p-2 bg-muted/50 rounded border text-xs space-y-1">
          <span className="font-medium">Desglose</span>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
            <span>Script match:</span>
            <span className="font-mono">{selectedSegment.scoreBreakdown.scriptMatch}</span>
            <span>Whisper conf:</span>
            <span className="font-mono">{selectedSegment.scoreBreakdown.whisperConfidence}</span>
            <span>Take order:</span>
            <span className="font-mono">{selectedSegment.scoreBreakdown.takeOrder}</span>
            <span>Completeness:</span>
            <span className="font-mono">{selectedSegment.scoreBreakdown.completeness}</span>
            <span>Duration:</span>
            <span className="font-mono">{selectedSegment.scoreBreakdown.duration}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onSeekTo?.(selectedSegment.startMs)}
          className="flex-1"
        >
          <Play className="w-3.5 h-3.5 mr-1" />
          Ir
        </Button>
        <Button
          variant={selectedSegment.enabled ? "outline" : "default"}
          size="sm"
          onClick={() => toggleSegment(videoId, selectedSegment.id)}
          className="flex-1"
        >
          {selectedSegment.enabled ? (
            <>
              <ToggleRight className="w-3.5 h-3.5 mr-1" />
              Deshab.
            </>
          ) : (
            <>
              <ToggleLeft className="w-3.5 h-3.5 mr-1" />
              Habilitar
            </>
          )}
        </Button>
      </div>

      {/* Show log button */}
      {onShowLog && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onShowLog(selectedSegment.id)}
          className="w-full gap-1.5 text-xs"
        >
          <ScrollText className="w-3.5 h-3.5" />
          Ver log de preseleccion
        </Button>
      )}
    </div>
  );
}
