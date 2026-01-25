import { useState } from "react";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/store/workspace";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Settings,
  ChevronDown,
  Trash2,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";

interface PipelineResetActionsProps {
  videoId: string;
  disabled?: boolean;
}

interface ResetOptions {
  selections: boolean;
  takeSelections: boolean;
}

export function PipelineResetActions({ videoId, disabled }: PipelineResetActionsProps) {
  const clearSelection = useWorkspaceStore((state) => state.clearSelection);
  const clearTakeSelections = useWorkspaceStore((state) => state.clearTakeSelections);
  const selections = useWorkspaceStore((state) => state.selections[videoId]);
  const takeSelections = useWorkspaceStore((state) => state.takeSelections[videoId]);

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetOptions, setResetOptions] = useState<ResetOptions>({
    selections: true,
    takeSelections: true,
  });

  const hasSelections = selections && selections.length > 0;
  const hasTakeSelections = takeSelections && Object.keys(takeSelections.selections || {}).length > 0;
  const hasAnyData = hasSelections || hasTakeSelections;

  const handleClearSelections = () => {
    if (!hasSelections) {
      toast.info("Sin selecciones", {
        description: "No hay selección de cortes para limpiar",
      });
      return;
    }

    clearSelection(videoId);
    toast.success("Selección limpiada", {
      description: "Se ha limpiado la selección de cortes",
    });
  };

  const handleClearTakeSelections = () => {
    if (!hasTakeSelections) {
      toast.info("Sin selecciones", {
        description: "No hay selección de tomas para limpiar",
      });
      return;
    }

    clearTakeSelections(videoId);
    toast.success("Tomas limpiadas", {
      description: "Se ha limpiado la selección de tomas",
    });
  };

  const handleOpenResetDialog = () => {
    if (!hasAnyData) {
      toast.info("Sin datos", {
        description: "No hay datos para resetear",
      });
      return;
    }
    // Pre-select only options that have data
    setResetOptions({
      selections: hasSelections,
      takeSelections: hasTakeSelections,
    });
    setResetDialogOpen(true);
  };

  const handleResetAll = () => {
    let resetCount = 0;

    if (resetOptions.selections && hasSelections) {
      clearSelection(videoId);
      resetCount++;
    }
    if (resetOptions.takeSelections && hasTakeSelections) {
      clearTakeSelections(videoId);
      resetCount++;
    }

    setResetDialogOpen(false);

    if (resetCount > 0) {
      toast.success("Reset completado", {
        description: `Se han limpiado ${resetCount} tipo${resetCount > 1 ? "s" : ""} de datos`,
      });
    }
  };

  const canReset = (resetOptions.selections && hasSelections) ||
                   (resetOptions.takeSelections && hasTakeSelections);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={disabled} className="gap-2">
            <Settings className="w-4 h-4" />
            Acciones
            <ChevronDown className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleClearSelections} disabled={!hasSelections}>
            <Trash2 className="w-4 h-4 mr-2" />
            Limpiar selección de cortes
            {hasSelections && (
              <span className="ml-auto text-xs text-muted-foreground">
                ({selections.length})
              </span>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleClearTakeSelections} disabled={!hasTakeSelections}>
            <Trash2 className="w-4 h-4 mr-2" />
            Limpiar selección de tomas
            {hasTakeSelections && (
              <span className="ml-auto text-xs text-muted-foreground">
                ({Object.keys(takeSelections.selections).length})
              </span>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleOpenResetDialog}
            disabled={!hasAnyData}
            className="text-destructive focus:text-destructive"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset todo...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Reset All Dialog */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <AlertDialogTitle>Resetear procesado</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              Selecciona qué datos deseas eliminar. Esta acción se puede deshacer con Ctrl+Z.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="reset-selections"
                  checked={resetOptions.selections}
                  onCheckedChange={(checked) =>
                    setResetOptions((prev) => ({ ...prev, selections: checked === true }))
                  }
                  disabled={!hasSelections}
                />
                <Label
                  htmlFor="reset-selections"
                  className={`flex-1 ${!hasSelections ? "text-muted-foreground" : ""}`}
                >
                  <div className="font-medium">Selección de cortes</div>
                  <div className="text-sm text-muted-foreground">
                    {hasSelections
                      ? `${selections.length} segmentos seleccionados`
                      : "Sin datos"}
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="reset-takes"
                  checked={resetOptions.takeSelections}
                  onCheckedChange={(checked) =>
                    setResetOptions((prev) => ({ ...prev, takeSelections: checked === true }))
                  }
                  disabled={!hasTakeSelections}
                />
                <Label
                  htmlFor="reset-takes"
                  className={`flex-1 ${!hasTakeSelections ? "text-muted-foreground" : ""}`}
                >
                  <div className="font-medium">Selección de tomas</div>
                  <div className="text-sm text-muted-foreground">
                    {hasTakeSelections
                      ? `${Object.keys(takeSelections.selections).length} tomas seleccionadas`
                      : "Sin datos"}
                  </div>
                </Label>
              </div>
            </div>

            {/* Note about files */}
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <strong>Nota:</strong> Los archivos en disco (captions .srt, etc.) no se eliminarán.
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetAll}
              disabled={!canReset}
              variant="destructive"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Resetear seleccionado
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
