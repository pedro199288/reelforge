import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Play, Pause, Square, Settings2, Trash2, Upload } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BatchQueueItem } from "./BatchQueueItem";
import { useBatchStore } from "@/store/batch";
import { cn } from "@/lib/utils";

interface BatchQueueProps {
  className?: string;
  onAddVideos?: () => void;
  onOpenSettings?: () => void;
}

export function BatchQueue({
  className,
  onAddVideos,
  onOpenSettings,
}: BatchQueueProps) {
  const {
    queue,
    isProcessing,
    isPaused,
    maxParallel,
    reorderQueue,
    toggleEnabled,
    removeFromQueue,
    clearCompleted,
    startProcessing,
    pauseProcessing,
    resumeProcessing,
    stopProcessing,
  } = useBatchStore();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = queue.findIndex((item) => item.id === active.id);
      const newIndex = queue.findIndex((item) => item.id === over.id);
      reorderQueue(oldIndex, newIndex);
    }
  };

  const pendingCount = queue.filter((i) => i.status === "pending").length;
  const processingCount = queue.filter((i) => i.status === "processing").length;
  const completedCount = queue.filter((i) => i.status === "completed").length;
  const errorCount = queue.filter((i) => i.status === "error").length;
  const enabledCount = queue.filter((i) => i.enabled).length;

  const hasCompletedItems = completedCount > 0;
  const hasItems = queue.length > 0;
  const canStart = enabledCount > 0 && pendingCount > 0;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Cola de Procesamiento</CardTitle>
          <div className="flex items-center gap-2">
            {hasItems && (
              <>
                <Badge variant="secondary">{queue.length} videos</Badge>
                {processingCount > 0 && (
                  <Badge variant="default">{processingCount} procesando</Badge>
                )}
                {completedCount > 0 && (
                  <Badge variant="outline" className="border-green-500 text-green-500">
                    {completedCount} completados
                  </Badge>
                )}
                {errorCount > 0 && (
                  <Badge variant="destructive">{errorCount} errores</Badge>
                )}
              </>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4">
        {!hasItems ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Upload className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              No hay videos en la cola
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={onAddVideos}
            >
              Añadir videos
            </Button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={queue.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {queue.map((item) => (
                  <BatchQueueItem
                    key={item.id}
                    item={item}
                    onToggleEnabled={toggleEnabled}
                    onRemove={removeFromQueue}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>

      <CardFooter className="border-t flex items-center justify-between gap-2 pt-4">
        <div className="flex items-center gap-2">
          {!isProcessing ? (
            <Button
              onClick={startProcessing}
              disabled={!canStart}
            >
              <Play className="h-4 w-4 mr-2" />
              Procesar ({enabledCount})
            </Button>
          ) : isPaused ? (
            <Button onClick={resumeProcessing}>
              <Play className="h-4 w-4 mr-2" />
              Reanudar
            </Button>
          ) : (
            <Button variant="secondary" onClick={pauseProcessing}>
              <Pause className="h-4 w-4 mr-2" />
              Pausar
            </Button>
          )}

          {isProcessing && (
            <Button variant="destructive" onClick={stopProcessing}>
              <Square className="h-4 w-4 mr-2" />
              Detener
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasCompletedItems && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearCompleted}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Limpiar completados
            </Button>
          )}

          <Button
            variant="outline"
            size="icon"
            onClick={onOpenSettings}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
