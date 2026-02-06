import { useHotkeys } from "react-hotkeys-hook";
import type { PlayerRef } from "@remotion/player";
import {
  useEditorProjectStore,
  useEditorUndo,
  useEditorRedo,
} from "@/store/editor-project";

interface UseEditorShortcutsOptions {
  enabled?: boolean;
  playerRef?: React.RefObject<PlayerRef | null>;
}

export function useEditorShortcuts({
  enabled = true,
  playerRef,
}: UseEditorShortcutsOptions = {}) {
  const store = useEditorProjectStore;
  const undo = useEditorUndo();
  const redo = useEditorRedo();

  // Space → Play/Pause
  useHotkeys(
    "space",
    (e) => {
      e.preventDefault();
      const willPlay = !store.getState().isPlaying;
      store.getState().togglePlayback();
      if (willPlay) {
        playerRef?.current?.play();
      } else {
        playerRef?.current?.pause();
      }
    },
    { enabled, preventDefault: true },
    [playerRef]
  );

  // ←/→ → Seek ±1 frame
  useHotkeys(
    "left",
    () => {
      const { currentFrame } = store.getState();
      store.getState().setCurrentFrame(Math.max(0, currentFrame - 1));
    },
    { enabled, preventDefault: true },
    []
  );

  useHotkeys(
    "right",
    () => {
      const { currentFrame, getProjectDuration } = store.getState();
      const max = getProjectDuration() - 1;
      store.getState().setCurrentFrame(Math.min(max, currentFrame + 1));
    },
    { enabled, preventDefault: true },
    []
  );

  // Shift+←/→ → Seek ±10 frames
  useHotkeys(
    "shift+left",
    () => {
      const { currentFrame } = store.getState();
      store.getState().setCurrentFrame(Math.max(0, currentFrame - 10));
    },
    { enabled, preventDefault: true },
    []
  );

  useHotkeys(
    "shift+right",
    () => {
      const { currentFrame, getProjectDuration } = store.getState();
      const max = getProjectDuration() - 1;
      store.getState().setCurrentFrame(Math.min(max, currentFrame + 10));
    },
    { enabled, preventDefault: true },
    []
  );

  // Home/End → Start/End
  useHotkeys(
    "home",
    () => store.getState().setCurrentFrame(0),
    { enabled, preventDefault: true },
    []
  );

  useHotkeys(
    "end",
    () => {
      const max = store.getState().getProjectDuration() - 1;
      store.getState().setCurrentFrame(Math.max(0, max));
    },
    { enabled, preventDefault: true },
    []
  );

  // Delete/Backspace → Delete selected
  useHotkeys(
    "delete,backspace",
    () => store.getState().deleteSelected(),
    { enabled, preventDefault: true },
    []
  );

  // Cmd+Z / Cmd+Shift+Z → Undo/Redo
  useHotkeys(
    "meta+z",
    () => undo(),
    { enabled, preventDefault: true },
    [undo]
  );

  useHotkeys(
    "meta+shift+z",
    () => redo(),
    { enabled, preventDefault: true },
    [redo]
  );

  // Cmd+D → Duplicate
  useHotkeys(
    "meta+d",
    (e) => {
      e.preventDefault();
      const { selection } = store.getState();
      if (selection?.type === "item") {
        store.getState().duplicateItem(selection.trackId, selection.itemId);
      }
    },
    { enabled, preventDefault: true },
    []
  );

  // Cmd+B → Split at playhead
  useHotkeys(
    "meta+b",
    (e) => {
      e.preventDefault();
      const { selection, currentFrame } = store.getState();
      if (selection?.type === "item") {
        store.getState().splitItem(selection.trackId, selection.itemId, currentFrame);
      }
    },
    { enabled, preventDefault: true },
    []
  );

  // Escape → Clear selection
  useHotkeys(
    "escape",
    () => store.getState().clearSelection(),
    { enabled, preventDefault: true },
    []
  );

  // +/- → Zoom timeline
  useHotkeys(
    "equal,plus",
    () => store.getState().zoomIn(),
    { enabled, preventDefault: true },
    []
  );

  useHotkeys(
    "minus",
    () => store.getState().zoomOut(),
    { enabled, preventDefault: true },
    []
  );
}

export const EDITOR_SHORTCUTS = [
  { key: "Space", description: "Reproducir / Pausar" },
  { key: "←/→", description: "Seek ±1 frame" },
  { key: "Shift + ←/→", description: "Seek ±10 frames" },
  { key: "Home / End", description: "Inicio / Fin" },
  { key: "Delete", description: "Eliminar seleccionado" },
  { key: "Cmd + Z", description: "Deshacer" },
  { key: "Cmd + Shift + Z", description: "Rehacer" },
  { key: "Cmd + D", description: "Duplicar item" },
  { key: "Cmd + B", description: "Dividir en playhead" },
  { key: "Escape", description: "Limpiar selección" },
  { key: "+/-", description: "Zoom timeline" },
] as const;
