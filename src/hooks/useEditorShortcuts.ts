import { useHotkeys } from "react-hotkeys-hook";
import type { PlayerRef } from "@remotion/player";
import {
  useEditorProjectStore,
  useEditorUndo,
  useEditorRedo,
} from "@/store/editor-project";
import type { Track } from "@/types/editor";

/** Collect all item boundary frames (start and end) across all tracks, sorted ascending. */
function getItemBoundaries(tracks: Track[]): number[] {
  const set = new Set<number>();
  for (const track of tracks) {
    for (const item of track.items) {
      set.add(item.from);
      set.add(item.from + item.durationInFrames);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

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

  // Cmd+Z / Cmd+Shift+Z / Cmd+Y → Undo/Redo
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

  useHotkeys(
    "meta+y",
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

  // Up → Jump to previous item boundary
  useHotkeys(
    "up",
    () => {
      const { currentFrame, project } = store.getState();
      const boundaries = getItemBoundaries(project.tracks);
      const prev = boundaries.filter((b) => b < currentFrame - 1);
      if (prev.length > 0) {
        store.getState().setCurrentFrame(prev[prev.length - 1]);
      }
    },
    { enabled, preventDefault: true },
    []
  );

  // Down → Jump to next item boundary
  useHotkeys(
    "down",
    () => {
      const { currentFrame, project } = store.getState();
      const boundaries = getItemBoundaries(project.tracks);
      const next = boundaries.find((b) => b > currentFrame + 1);
      if (next !== undefined) {
        store.getState().setCurrentFrame(next);
      }
    },
    { enabled, preventDefault: true },
    []
  );

  // Q → Trim left (move item start to playhead)
  useHotkeys(
    "q",
    () => {
      const { selection, currentFrame } = store.getState();
      if (selection?.type !== "item") return;
      const item = store.getState().getItem(selection.trackId, selection.itemId);
      if (!item) return;
      const itemEnd = item.from + item.durationInFrames;
      if (currentFrame <= item.from || currentFrame >= itemEnd) return;
      store.getState().resizeItem(
        selection.trackId,
        selection.itemId,
        currentFrame,
        itemEnd - currentFrame
      );
    },
    { enabled, preventDefault: true },
    []
  );

  // W → Trim right (move item end to playhead)
  useHotkeys(
    "w",
    () => {
      const { selection, currentFrame } = store.getState();
      if (selection?.type !== "item") return;
      const item = store.getState().getItem(selection.trackId, selection.itemId);
      if (!item) return;
      const newDuration = currentFrame - item.from;
      if (newDuration < 1 || currentFrame >= item.from + item.durationInFrames) return;
      store.getState().resizeItem(
        selection.trackId,
        selection.itemId,
        item.from,
        newDuration
      );
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
  { key: "↑/↓", description: "Saltar a boundary anterior/siguiente" },
  { key: "Home / End", description: "Inicio / Fin" },
  { key: "Q", description: "Trim left (inicio → playhead)" },
  { key: "W", description: "Trim right (fin → playhead)" },
  { key: "Delete", description: "Eliminar seleccionado" },
  { key: "Cmd + Z", description: "Deshacer" },
  { key: "Cmd + Shift + Z / Cmd + Y", description: "Rehacer" },
  { key: "Cmd + D", description: "Duplicar item" },
  { key: "Cmd + B", description: "Dividir en playhead" },
  { key: "Escape", description: "Limpiar selección" },
  { key: "+/-", description: "Zoom timeline" },
] as const;
