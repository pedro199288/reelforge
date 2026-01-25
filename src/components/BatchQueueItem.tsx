import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QueueItem, PipelineStep } from "@/types/batch";

interface BatchQueueItemProps {
  item: QueueItem;
  onToggleEnabled: (id: string) => void;
  onRemove: (id: string) => void;
}

const STEP_LABELS: Record<PipelineStep, string> = {
  "silence-detection": "Detectando silencios",
  "segment-generation": "Generando segmentos",
  cutting: "Cortando video",
  transcription: "Transcribiendo",
  rendering: "Renderizando",
};

export function BatchQueueItem({
  item,
  onToggleEnabled,
  onRemove,
}: BatchQueueItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isProcessing = item.status === "processing";
  const isCompleted = item.status === "completed";
  const isError = item.status === "error";
  const isPaused = item.status === "paused";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-background p-3",
        isDragging && "opacity-50 shadow-lg",
        !item.enabled && "opacity-50",
        isError && "border-destructive/50",
        isCompleted && "border-green-500/50"
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-5 w-5" />
      </button>

      {/* Checkbox */}
      <Checkbox
        checked={item.enabled}
        onCheckedChange={() => onToggleEnabled(item.id)}
        disabled={isProcessing}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{item.filename}</span>
          {isCompleted && (
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          )}
          {isError && (
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          )}
          {isProcessing && (
            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
          )}
        </div>

        {/* Progress bar (only show when processing or has progress) */}
        {(isProcessing || item.progress > 0) && !isCompleted && (
          <div className="mt-2 space-y-1">
            <Progress value={item.progress} className="h-1.5" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{STEP_LABELS[item.currentStep]}</span>
              <span>{item.progress}%</span>
            </div>
          </div>
        )}

        {/* Error message */}
        {isError && item.error && (
          <p className="mt-1 text-xs text-destructive truncate">{item.error}</p>
        )}

        {/* Status for pending/paused */}
        {item.status === "pending" && (
          <p className="text-xs text-muted-foreground">En cola</p>
        )}
        {isPaused && (
          <p className="text-xs text-amber-500">Pausado</p>
        )}
      </div>

      {/* Remove button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => onRemove(item.id)}
        disabled={isProcessing}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
