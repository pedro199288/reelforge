import { useEffect } from "react";
import { useUndo, useRedo, useCanUndo, useCanRedo } from "@/store/workspace";
import { toast } from "sonner";

/**
 * Hook that registers Ctrl+Z (undo) and Ctrl+Shift+Z (redo) keyboard shortcuts
 * Shows toast notifications when actions are performed
 */
export function useUndoRedoKeyboard(enabled = true) {
  const undo = useUndo();
  const redo = useRedo();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl/Cmd key
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (!isCtrlOrCmd) return;

      // Undo: Ctrl+Z (without Shift)
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) {
          undo();
          toast.info("Deshacer", {
            description: "Acción deshecha",
            duration: 1500,
          });
        } else {
          toast.info("Nada que deshacer", {
            duration: 1500,
          });
        }
        return;
      }

      // Redo: Ctrl+Shift+Z or Ctrl+Y
      if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        if (canRedo) {
          redo();
          toast.info("Rehacer", {
            description: "Acción rehecha",
            duration: 1500,
          });
        } else {
          toast.info("Nada que rehacer", {
            duration: 1500,
          });
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, undo, redo, canUndo, canRedo]);

  return { canUndo, canRedo, undo, redo };
}
