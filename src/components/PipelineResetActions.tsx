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
  FileVideo,
  Subtitles,
  FileText,
  Loader2,
} from "lucide-react";

const API_URL = "http://localhost:3012";

type ResetPhase = "cut" | "captions" | "metadata" | "all";

interface PipelineResetActionsProps {
  videoId: string;
  disabled?: boolean;
  hasCaptions?: boolean;
  onReset?: () => void;
}

interface ResetOptions {
  selections: boolean;
  takeSelections: boolean;
  cutVideo: boolean;
  captions: boolean;
  metadata: boolean;
}

export function PipelineResetActions({
  videoId,
  disabled,
  hasCaptions = false,
  onReset,
}: PipelineResetActionsProps) {
  const clearSelection = useWorkspaceStore((state) => state.clearSelection);
  const clearTakeSelections = useWorkspaceStore((state) => state.clearTakeSelections);
  const selections = useWorkspaceStore((state) => state.selections[videoId]);
  const takeSelections = useWorkspaceStore((state) => state.takeSelections[videoId]);

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetOptions, setResetOptions] = useState<ResetOptions>({
    selections: true,
    takeSelections: true,
    cutVideo: false,
    captions: false,
    metadata: false,
  });

  const hasSelections = selections && selections.length > 0;
  const hasTakeSelections = takeSelections && Object.keys(takeSelections.selections || {}).length > 0;

  // API call to reset phases
  const resetPhases = async (phases: ResetPhase[]): Promise<{ deleted: string[] }> => {
    const response = await fetch(`${API_URL}/api/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, phases }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Error al resetear");
    }

    return response.json();
  };

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

  const handleDeleteCutVideo = async () => {
    setIsResetting(true);
    try {
      const result = await resetPhases(["cut"]);
      if (result.deleted.length > 0) {
        toast.success("Video cortado eliminado", {
          description: `Eliminado: ${result.deleted.join(", ")}`,
        });
        onReset?.();
      } else {
        toast.info("Sin archivos", {
          description: "No se encontró el video cortado",
        });
      }
    } catch (error) {
      toast.error("Error", {
        description: error instanceof Error ? error.message : "Error al eliminar",
      });
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteCaptions = async () => {
    setIsResetting(true);
    try {
      const result = await resetPhases(["captions"]);
      if (result.deleted.length > 0) {
        toast.success("Transcripciones eliminadas", {
          description: `Eliminado: ${result.deleted.join(", ")}`,
        });
        onReset?.();
      } else {
        toast.info("Sin archivos", {
          description: "No se encontraron transcripciones",
        });
      }
    } catch (error) {
      toast.error("Error", {
        description: error instanceof Error ? error.message : "Error al eliminar",
      });
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteMetadata = async () => {
    setIsResetting(true);
    try {
      const result = await resetPhases(["metadata"]);
      if (result.deleted.length > 0) {
        toast.success("Metadata eliminada", {
          description: `Eliminado: ${result.deleted.join(", ")}`,
        });
        onReset?.();
      } else {
        toast.info("Sin archivos", {
          description: "No se encontró metadata",
        });
      }
    } catch (error) {
      toast.error("Error", {
        description: error instanceof Error ? error.message : "Error al eliminar",
      });
    } finally {
      setIsResetting(false);
    }
  };

  const handleOpenResetDialog = () => {
    // Pre-select only options that have data
    setResetOptions({
      selections: hasSelections,
      takeSelections: hasTakeSelections,
      cutVideo: true,
      captions: true,
      metadata: true,
    });
    setResetDialogOpen(true);
  };

  const handleResetAll = async () => {
    setIsResetting(true);
    let resetCount = 0;
    const phasesToReset: ResetPhase[] = [];

    try {
      // Clear local state
      if (resetOptions.selections && hasSelections) {
        clearSelection(videoId);
        resetCount++;
      }
      if (resetOptions.takeSelections && hasTakeSelections) {
        clearTakeSelections(videoId);
        resetCount++;
      }

      // Build phases to reset on server
      if (resetOptions.cutVideo) phasesToReset.push("cut");
      if (resetOptions.captions) phasesToReset.push("captions");
      if (resetOptions.metadata) phasesToReset.push("metadata");

      // Call API if we have phases to reset
      let serverDeleted: string[] = [];
      if (phasesToReset.length > 0) {
        const result = await resetPhases(phasesToReset);
        serverDeleted = result.deleted;
        resetCount += serverDeleted.length;
      }

      setResetDialogOpen(false);

      if (resetCount > 0) {
        toast.success("Reset completado", {
          description: `Se han limpiado ${resetCount} elemento${resetCount > 1 ? "s" : ""}`,
        });
        if (phasesToReset.length > 0) {
          onReset?.();
        }
      }
    } catch (error) {
      toast.error("Error en reset", {
        description: error instanceof Error ? error.message : "Error desconocido",
      });
    } finally {
      setIsResetting(false);
    }
  };

  const canReset =
    (resetOptions.selections && hasSelections) ||
    (resetOptions.takeSelections && hasTakeSelections) ||
    resetOptions.cutVideo ||
    resetOptions.captions ||
    resetOptions.metadata;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={disabled || isResetting} className="gap-2">
            {isResetting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Settings className="w-4 h-4" />
            )}
            Acciones
            <ChevronDown className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* Local state actions */}
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

          {/* File actions */}
          <DropdownMenuItem onClick={handleDeleteCutVideo} disabled={isResetting}>
            <FileVideo className="w-4 h-4 mr-2" />
            Borrar video cortado
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleDeleteCaptions}
            disabled={!hasCaptions || isResetting}
          >
            <Subtitles className="w-4 h-4 mr-2" />
            Borrar transcripciones
            {hasCaptions && (
              <span className="ml-auto text-xs text-green-600">●</span>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDeleteMetadata} disabled={isResetting}>
            <FileText className="w-4 h-4 mr-2" />
            Borrar metadata
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleOpenResetDialog}
            className="text-destructive focus:text-destructive"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset completo...
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
              <AlertDialogTitle>Reset completo del pipeline</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              Selecciona qué datos deseas eliminar. Los datos locales se pueden deshacer con Ctrl+Z,
              pero los archivos en disco se eliminarán permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4 space-y-4">
            {/* Local data section */}
            <div className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">Datos locales</div>
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

            {/* File data section */}
            <div className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">Archivos en disco</div>
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="reset-cut-video"
                  checked={resetOptions.cutVideo}
                  onCheckedChange={(checked) =>
                    setResetOptions((prev) => ({ ...prev, cutVideo: checked === true }))
                  }
                />
                <Label htmlFor="reset-cut-video" className="flex-1">
                  <div className="font-medium flex items-center gap-2">
                    <FileVideo className="w-4 h-4" />
                    Video cortado
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Archivo *-cut.mp4 en public/videos/
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="reset-captions"
                  checked={resetOptions.captions}
                  onCheckedChange={(checked) =>
                    setResetOptions((prev) => ({ ...prev, captions: checked === true }))
                  }
                />
                <Label htmlFor="reset-captions" className="flex-1">
                  <div className="font-medium flex items-center gap-2">
                    <Subtitles className="w-4 h-4" />
                    Transcripciones
                    {hasCaptions && (
                      <span className="text-xs text-green-600">● Existe</span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Archivo *-cut.json en public/subs/
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="reset-metadata"
                  checked={resetOptions.metadata}
                  onCheckedChange={(checked) =>
                    setResetOptions((prev) => ({ ...prev, metadata: checked === true }))
                  }
                />
                <Label htmlFor="reset-metadata" className="flex-1">
                  <div className="font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Metadata
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Archivo *-cut.json en public/metadata/
                  </div>
                </Label>
              </div>
            </div>

            {/* Warning about permanent deletion */}
            {(resetOptions.cutVideo || resetOptions.captions || resetOptions.metadata) && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <strong>Advertencia:</strong> Los archivos seleccionados se eliminarán permanentemente
                y no se pueden recuperar.
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetAll}
              disabled={!canReset || isResetting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isResetting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4 mr-2" />
              )}
              {isResetting ? "Reseteando..." : "Resetear seleccionado"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
