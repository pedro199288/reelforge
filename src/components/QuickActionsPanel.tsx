import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import {
  useUndo,
  useRedo,
  useCanUndo,
  useCanRedo,
  useTemporalStore,
} from "@/store/workspace";
import {
  Undo2,
  Redo2,
  History,
  Keyboard,
  ChevronDown,
} from "lucide-react";

export function QuickActionsPanel() {
  const [expanded, setExpanded] = useState(false);

  const undo = useUndo();
  const redo = useRedo();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const pastStatesCount = useTemporalStore((state) => state.pastStates.length);

  const handleUndo = () => {
    if (canUndo) undo();
  };

  const handleRedo = () => {
    if (canRedo) redo();
  };

  return (
    <TooltipProvider>
      <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2">
        {/* Expanded panel */}
        {expanded && (
          <div className="bg-background border rounded-lg shadow-lg p-3 space-y-3 animate-in slide-in-from-bottom-2 fade-in duration-200">
            {/* History indicator */}
            <div className="flex items-center gap-2 text-sm">
              <History className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Historial:</span>
              {pastStatesCount > 0 ? (
                <Badge variant="secondary" className="text-xs">
                  {pastStatesCount} cambio{pastStatesCount !== 1 ? "s" : ""}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">Sin cambios</span>
              )}
            </div>

            {/* Undo/Redo buttons */}
            <div className="flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className="flex-1"
                  >
                    <Undo2 className="w-4 h-4 mr-1" />
                    Deshacer
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Deshacer (Ctrl+Z)</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRedo}
                    disabled={!canRedo}
                    className="flex-1"
                  >
                    <Redo2 className="w-4 h-4 mr-1" />
                    Rehacer
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Rehacer (Ctrl+Shift+Z)</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Keyboard shortcuts reference */}
            <div className="border-t pt-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Keyboard className="w-3 h-3" />
                Atajos de teclado
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deshacer</span>
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
                    Ctrl+Z
                  </kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rehacer</span>
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
                    Ctrl+Shift+Z
                  </kbd>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FAB toggle button */}
        <Button
          onClick={() => setExpanded(!expanded)}
          className="rounded-full w-12 h-12 shadow-lg relative"
          variant={pastStatesCount > 0 ? "default" : "secondary"}
        >
          {pastStatesCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
              {pastStatesCount > 9 ? "9+" : pastStatesCount}
            </span>
          )}
          {expanded ? (
            <ChevronDown className="w-5 h-5" />
          ) : (
            <History className="w-5 h-5" />
          )}
        </Button>
      </div>
    </TooltipProvider>
  );
}
