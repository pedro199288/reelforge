import { useHotkeys } from "react-hotkeys-hook";
import type { PlayerRef } from "@remotion/player";
import type { RefObject } from "react";

interface UseTimelineShortcutsOptions {
  playerRef: RefObject<PlayerRef | null>;
  /** Duration in frames */
  durationInFrames: number;
  /** Frames per second */
  fps: number;
  /** Whether shortcuts are enabled */
  enabled?: boolean;
}

/**
 * Hook for keyboard shortcuts in the timeline/studio view
 *
 * Available shortcuts:
 * - Space: Play/Pause (handled by Remotion Player natively)
 * - ArrowLeft: Seek -1 second
 * - ArrowRight: Seek +1 second
 * - Shift+ArrowLeft: Seek -100ms (fine control)
 * - Shift+ArrowRight: Seek +100ms (fine control)
 * - Home: Go to start
 * - End: Go to end
 * - ?: Show keyboard shortcuts help
 */
export function useTimelineShortcuts({
  playerRef,
  durationInFrames,
  fps,
  enabled = true,
}: UseTimelineShortcutsOptions) {
  const seekBy = (deltaMs: number) => {
    const player = playerRef.current;
    if (!player) return;

    const deltaFrames = Math.round((deltaMs / 1000) * fps);
    const currentFrame = player.getCurrentFrame();
    const targetFrame = Math.max(
      0,
      Math.min(durationInFrames - 1, currentFrame + deltaFrames)
    );
    player.seekTo(targetFrame);
  };

  const seekToStart = () => {
    playerRef.current?.seekTo(0);
  };

  const seekToEnd = () => {
    playerRef.current?.seekTo(durationInFrames - 1);
  };

  // Seek backward 1 second
  useHotkeys(
    "left",
    () => seekBy(-1000),
    { enabled, preventDefault: true },
    [fps, durationInFrames]
  );

  // Seek forward 1 second
  useHotkeys(
    "right",
    () => seekBy(1000),
    { enabled, preventDefault: true },
    [fps, durationInFrames]
  );

  // Fine seek backward 100ms
  useHotkeys(
    "shift+left",
    () => seekBy(-100),
    { enabled, preventDefault: true },
    [fps, durationInFrames]
  );

  // Fine seek forward 100ms
  useHotkeys(
    "shift+right",
    () => seekBy(100),
    { enabled, preventDefault: true },
    [fps, durationInFrames]
  );

  // Go to start
  useHotkeys("home", seekToStart, { enabled, preventDefault: true }, [
    durationInFrames,
  ]);

  // Go to end
  useHotkeys("end", seekToEnd, { enabled, preventDefault: true }, [
    durationInFrames,
  ]);

  return {
    seekBy,
    seekToStart,
    seekToEnd,
  };
}

/** Keyboard shortcut definitions for help display */
export const TIMELINE_SHORTCUTS = [
  { key: "Space", description: "Play / Pause" },
  { key: "\u2190", description: "Seek -1 second" },
  { key: "\u2192", description: "Seek +1 second" },
  { key: "Shift + \u2190", description: "Seek -100ms" },
  { key: "Shift + \u2192", description: "Seek +100ms" },
  { key: "Home", description: "Go to start" },
  { key: "End", description: "Go to end" },
] as const;

/** Keyboard shortcut definitions for the segment editor */
export const SEGMENT_EDITOR_SHORTCUTS = [
  { key: "Space", description: "Play / Pause" },
  { key: "\u2318/Ctrl + B", description: "Dividir segmento en el playhead" },
  { key: "Q", description: "Cortar izquierda (mover inicio al playhead)" },
  { key: "W", description: "Cortar derecha (mover fin al playhead)" },
  { key: "\u2190", description: "Seek -100ms" },
  { key: "\u2192", description: "Seek +100ms" },
  { key: "Shift + \u2190", description: "Seek -1 segundo" },
  { key: "Shift + \u2192", description: "Seek +1 segundo" },
  { key: "\u2191", description: "Keypoint anterior" },
  { key: "\u2193", description: "Keypoint siguiente" },
] as const;
