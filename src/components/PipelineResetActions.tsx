import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/store/workspace";
import { useEffectsStore } from "@/store/effects";
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
import { Badge } from "@/components/ui/badge";
import {
  Settings,
  ChevronDown,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Loader2,
  CornerDownRight,
} from "lucide-react";
import {
  STEPS,
  getDownstreamSteps,
  type PipelineStep,
  type BackendPipelineStatus,
} from "@/types/pipeline";

const API_URL = "http://localhost:3012";

/** Steps that are costly to regenerate (Whisper, ffmpeg silence detection) */
const COSTLY_STEPS: PipelineStep[] = ["full-captions", "silences"];

/** Steps visible in the reset dialog (exclude "raw" — never resettable) */
const RESETTABLE_STEPS = STEPS.filter((s) => s.key !== "raw");

interface PipelineResetActionsProps {
  videoId: string;
  disabled?: boolean;
  /** @deprecated No longer used — status is derived from backendStatus */
  hasCaptions?: boolean;
  backendStatus: BackendPipelineStatus | null;
  onReset?: () => void;
}

export function PipelineResetActions({
  videoId,
  disabled,
  backendStatus,
  onReset,
}: PipelineResetActionsProps) {
  const clearSelection = useWorkspaceStore((state) => state.clearSelection);
  const clearTakeSelections = useWorkspaceStore((state) => state.clearTakeSelections);
  const selections = useWorkspaceStore((state) => state.selections[videoId]);
  const takeSelections = useWorkspaceStore((state) => state.takeSelections[videoId]);

  const clearAnalysisResult = useEffectsStore((state) => state.clearAnalysisResult);
  const renderHistory = useWorkspaceStore((state) => state.renderHistory);
  const setRenderHistory = useWorkspaceStore((state) => state.clearRenderHistory);

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [selectedSteps, setSelectedSteps] = useState<Set<PipelineStep>>(new Set());

  const hasSelections = selections && selections.length > 0;
  const hasTakeSelections = takeSelections && Object.keys(takeSelections.selections || {}).length > 0;

  /** Which steps are completed on the backend */
  const completedSteps = useMemo(() => {
    const set = new Set<PipelineStep>();
    if (!backendStatus) return set;
    for (const [step, state] of Object.entries(backendStatus.steps)) {
      if (state.status === "completed") set.add(step as PipelineStep);
    }
    return set;
  }, [backendStatus]);

  /** Steps forced by cascade (downstream of user-selected steps) */
  const cascadedSteps = useMemo(() => {
    const cascaded = new Set<PipelineStep>();
    for (const step of selectedSteps) {
      for (const downstream of getDownstreamSteps(step)) {
        if (downstream !== step) cascaded.add(downstream);
      }
    }
    return cascaded;
  }, [selectedSteps]);

  /** All steps that will be reset (user-selected + cascaded) */
  const allStepsToReset = useMemo(() => {
    return new Set([...selectedSteps, ...cascadedSteps]);
  }, [selectedSteps, cascadedSteps]);

  const toggleStep = useCallback((step: PipelineStep) => {
    setSelectedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(step)) {
        next.delete(step);
      } else {
        next.add(step);
      }
      return next;
    });
  }, []);

  /** Clear local stores for affected steps.
   * NOTE: Timeline (segments/silences) is NOT cleared here — the editor page's
   * own useEffects handle that reactively when pipelineStatus changes to avoid
   * race conditions between import and clear effects. */
  const clearLocalState = useCallback((steps: Set<PipelineStep>) => {
    if (steps.has("segments")) {
      clearSelection(videoId);
      clearTakeSelections(videoId);
    }
    if (steps.has("effects-analysis")) {
      clearAnalysisResult(videoId);
    }
    if (steps.has("rendered")) {
      const remaining = renderHistory.filter((r) => r.videoId !== videoId);
      if (remaining.length !== renderHistory.length) {
        setRenderHistory();
      }
    }
  }, [videoId, clearSelection, clearTakeSelections, clearAnalysisResult, renderHistory, setRenderHistory]);

  // API call to reset steps
  const resetSteps = async (steps: PipelineStep[]): Promise<{ deleted: string[]; stepsReset: PipelineStep[] }> => {
    const response = await fetch(`${API_URL}/api/pipeline/reset-steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, steps }),
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
        description: "No hay seleccion de cortes para limpiar",
      });
      return;
    }

    clearSelection(videoId);
    toast.success("Seleccion limpiada", {
      description: "Se ha limpiado la seleccion de cortes",
    });
  };

  const handleClearTakeSelections = () => {
    if (!hasTakeSelections) {
      toast.info("Sin selecciones", {
        description: "No hay seleccion de tomas para limpiar",
      });
      return;
    }

    clearTakeSelections(videoId);
    toast.success("Tomas limpiadas", {
      description: "Se ha limpiado la seleccion de tomas",
    });
  };

  const handleOpenResetDialog = (preselectAll: boolean) => {
    if (preselectAll) {
      // Pre-select all completed steps
      const completed = RESETTABLE_STEPS
        .filter((s) => completedSteps.has(s.key))
        .map((s) => s.key);
      setSelectedSteps(new Set(completed));
    } else {
      setSelectedSteps(new Set());
    }
    setResetDialogOpen(true);
  };

  const handleResetSelected = async () => {
    if (allStepsToReset.size === 0) return;

    setIsResetting(true);
    try {
      const stepsArray = Array.from(allStepsToReset).filter((s) => s !== "raw");

      const result = await resetSteps(stepsArray);

      // Clear local state for the reset steps
      clearLocalState(allStepsToReset);

      setResetDialogOpen(false);
      setSelectedSteps(new Set());

      toast.success("Reset completado", {
        description: `${result.stepsReset.length} paso${result.stepsReset.length > 1 ? "s" : ""} reseteado${result.stepsReset.length > 1 ? "s" : ""}`,
      });
      onReset?.();
    } catch (error) {
      toast.error("Error en reset", {
        description: error instanceof Error ? error.message : "Error desconocido",
      });
    } finally {
      setIsResetting(false);
    }
  };

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
            Limpiar seleccion de cortes
            {hasSelections && (
              <span className="ml-auto text-xs text-muted-foreground">
                ({selections.length})
              </span>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleClearTakeSelections} disabled={!hasTakeSelections}>
            <Trash2 className="w-4 h-4 mr-2" />
            Limpiar seleccion de tomas
            {hasTakeSelections && (
              <span className="ml-auto text-xs text-muted-foreground">
                ({Object.keys(takeSelections.selections).length})
              </span>
            )}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Granular reset actions */}
          <DropdownMenuItem onClick={() => handleOpenResetDialog(false)}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset por paso...
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleOpenResetDialog(true)}
            className="text-destructive focus:text-destructive"
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            Reset completo...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Granular Reset Dialog */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <AlertDialogTitle>Reset del pipeline</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              Selecciona que pasos resetear. Los pasos dependientes se marcan automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-3 space-y-1.5">
            {RESETTABLE_STEPS.map((stepInfo) => {
              const step = stepInfo.key;
              const isCompleted = completedSteps.has(step);
              const isCascaded = cascadedSteps.has(step) && !selectedSteps.has(step);
              const isSelected = selectedSteps.has(step) || isCascaded;
              const isCostly = COSTLY_STEPS.includes(step);
              // Disable checkbox if: not completed (nothing to reset) or forced by cascade
              const isDisabled = !isCompleted || isCascaded;

              return (
                <div
                  key={step}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 ${
                    isCascaded ? "pl-8 opacity-70" : ""
                  } ${isSelected ? "bg-destructive/5" : ""}`}
                >
                  <Checkbox
                    id={`reset-${step}`}
                    checked={isSelected}
                    onCheckedChange={() => toggleStep(step)}
                    disabled={isDisabled || isResetting}
                  />
                  <div className="flex-1 min-w-0">
                    <label
                      htmlFor={`reset-${step}`}
                      className={`flex items-center gap-2 text-sm font-medium cursor-pointer ${
                        !isCompleted ? "text-muted-foreground" : ""
                      }`}
                    >
                      {isCascaded && <CornerDownRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                      <span className="truncate">{stepInfo.label}</span>
                      {isCompleted ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-700 border-green-200">
                          Completado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                          Sin datos
                        </Badge>
                      )}
                      {isCostly && isSelected && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-700 border-amber-200">
                          Costoso
                        </Badge>
                      )}
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Warning about permanent deletion */}
          {allStepsToReset.size > 0 && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <strong>Advertencia:</strong> Los archivos de los pasos seleccionados se eliminaran
              permanentemente y no se pueden recuperar.
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetSelected}
              disabled={allStepsToReset.size === 0 || isResetting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isResetting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4 mr-2" />
              )}
              {isResetting
                ? "Reseteando..."
                : `Resetear ${allStepsToReset.size} paso${allStepsToReset.size > 1 ? "s" : ""}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
