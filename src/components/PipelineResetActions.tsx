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

interface PipelineResetActionsProps {
  videoId: string;
  disabled?: boolean;
}

export function PipelineResetActions({ videoId, disabled }: PipelineResetActionsProps) {
  const clearSelection = useWorkspaceStore((state) => state.clearSelection);
  const clearTakeSelections = useWorkspaceStore((state) => state.clearTakeSelections);
  const selections = useWorkspaceStore((state) => state.selections[videoId]);
  const takeSelections = useWorkspaceStore((state) => state.takeSelections[videoId]);

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

    if (window.confirm("¿Limpiar la selección de cortes? Esta acción no se puede deshacer.")) {
      clearSelection(videoId);
      toast.success("Selección limpiada", {
        description: "Se ha limpiado la selección de cortes",
      });
    }
  };

  const handleClearTakeSelections = () => {
    if (!hasTakeSelections) {
      toast.info("Sin selecciones", {
        description: "No hay selección de tomas para limpiar",
      });
      return;
    }

    if (window.confirm("¿Limpiar la selección de tomas? Esta acción no se puede deshacer.")) {
      clearTakeSelections(videoId);
      toast.success("Tomas limpiadas", {
        description: "Se ha limpiado la selección de tomas",
      });
    }
  };

  const handleResetAll = () => {
    if (!hasAnyData) {
      toast.info("Sin datos", {
        description: "No hay datos para resetear",
      });
      return;
    }

    const message = [
      "¿Resetear todos los procesados? Esto incluye:",
      hasSelections ? "- Selección de cortes" : null,
      hasTakeSelections ? "- Selección de tomas" : null,
      "",
      "Nota: Los archivos de captions (.srt) permanecerán en disco.",
    ]
      .filter(Boolean)
      .join("\n");

    if (window.confirm(message)) {
      if (hasSelections) clearSelection(videoId);
      if (hasTakeSelections) clearTakeSelections(videoId);
      toast.success("Reset completado", {
        description: "Se han limpiado todos los procesados del video",
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled} className="gap-2">
          <SettingsIcon className="w-4 h-4" />
          Acciones
          <ChevronDownIcon className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleClearSelections} disabled={!hasSelections}>
          <TrashIcon className="w-4 h-4 mr-2" />
          Limpiar selección de cortes
          {hasSelections && (
            <span className="ml-auto text-xs text-muted-foreground">
              ({selections.length})
            </span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleClearTakeSelections} disabled={!hasTakeSelections}>
          <TrashIcon className="w-4 h-4 mr-2" />
          Limpiar selección de tomas
          {hasTakeSelections && (
            <span className="ml-auto text-xs text-muted-foreground">
              ({Object.keys(takeSelections.selections).length})
            </span>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleResetAll}
          disabled={!hasAnyData}
          className="text-destructive focus:text-destructive"
        >
          <RotateCcwIcon className="w-4 h-4 mr-2" />
          Reset todo
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function RotateCcwIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}
