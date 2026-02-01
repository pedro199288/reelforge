import { useEffect, type RefObject } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";
import { useVideoSegments, useTimelineActions, useTimelineStore } from "@/store/timeline";

interface UseSegmentEditorShortcutsOptions {
  videoId: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  totalDurationMs: number;
  enabled?: boolean;
}

export function isEditableElement(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

/**
 * Keyboard shortcuts for the SegmentEditorPanel (CapCut-style).
 *
 * - Cmd/Ctrl+B: Split segment at playhead
 * - Q: Trim left (move segment start to playhead)
 * - W: Trim right (move segment end to playhead)
 * - Left/Right: Seek ±100ms
 * - Shift+Left/Right: Seek ±1000ms
 * - Up: Jump to previous keypoint (segment boundary)
 * - Down: Jump to next keypoint (segment boundary)
 * - Home: Jump to beginning of timeline
 * - End: Jump to end of timeline
 * - Space: Play/Pause
 */
export function useSegmentEditorShortcuts({
  videoId,
  videoRef,
  totalDurationMs,
  enabled = true,
}: UseSegmentEditorShortcutsOptions) {
  const segments = useVideoSegments(videoId);
  const { splitSegmentAt, resizeSegment } = useTimelineActions();

  const MIN_DURATION_MS = 200;

  const getCurrentTimeMs = (): number | null => {
    const video = videoRef.current;
    if (!video) return null;
    return video.currentTime * 1000;
  };

  const findSegmentAtTime = (timeMs: number) => {
    return segments.find((s) => timeMs >= s.startMs && timeMs <= s.endMs) ?? null;
  };

  const seekTo = (ms: number) => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) video.pause();
    const clamped = Math.max(0, Math.min(totalDurationMs, ms));
    video.currentTime = clamped / 1000;
  };

  const seekBy = (deltaMs: number) => {
    const currentMs = getCurrentTimeMs();
    if (currentMs === null) return;
    seekTo(currentMs + deltaMs);
  };

  // Split: Cmd/Ctrl+B
  useHotkeys(
    "mod+b",
    () => {
      const currentMs = getCurrentTimeMs();
      if (currentMs === null) return;

      const segment = findSegmentAtTime(currentMs);
      if (!segment) {
        toast.info("No hay segmento bajo el playhead", { duration: 1500 });
        return;
      }

      const result = splitSegmentAt(videoId, segment.id, currentMs);
      if (result) {
        toast.success("Segmento dividido", { duration: 1500 });
      } else {
        toast.error("Segmento demasiado corto para dividir", {
          description: `Ambas partes deben tener al menos ${MIN_DURATION_MS}ms`,
          duration: 2500,
        });
      }
    },
    { enabled, preventDefault: true },
    [videoId, segments, splitSegmentAt, totalDurationMs],
  );

  // Trim left: Q
  useHotkeys(
    "q",
    () => {
      if (isEditableElement()) return;

      const currentMs = getCurrentTimeMs();
      if (currentMs === null) return;

      const segment = findSegmentAtTime(currentMs);
      if (!segment) {
        toast.info("No hay segmento bajo el playhead", { duration: 1500 });
        return;
      }

      const remaining = segment.endMs - currentMs;
      if (remaining < MIN_DURATION_MS) {
        toast.error("Segmento resultante demasiado corto", { duration: 1500 });
        return;
      }

      resizeSegment(videoId, segment.id, "startMs", currentMs);
      toast.success("Inicio del segmento ajustado", { duration: 1500 });
    },
    { enabled },
    [videoId, segments, resizeSegment, totalDurationMs],
  );

  // Trim right: W
  useHotkeys(
    "w",
    () => {
      if (isEditableElement()) return;

      const currentMs = getCurrentTimeMs();
      if (currentMs === null) return;

      const segment = findSegmentAtTime(currentMs);
      if (!segment) {
        toast.info("No hay segmento bajo el playhead", { duration: 1500 });
        return;
      }

      const remaining = currentMs - segment.startMs;
      if (remaining < MIN_DURATION_MS) {
        toast.error("Segmento resultante demasiado corto", { duration: 1500 });
        return;
      }

      resizeSegment(videoId, segment.id, "endMs", currentMs);
      toast.success("Fin del segmento ajustado", { duration: 1500 });
    },
    { enabled },
    [videoId, segments, resizeSegment, totalDurationMs],
  );

  // Seek fine: Left/Right ±100ms
  useHotkeys(
    "left",
    () => {
      if (isEditableElement()) return;
      seekBy(-100);
    },
    { enabled, preventDefault: true },
    [totalDurationMs],
  );

  useHotkeys(
    "right",
    () => {
      if (isEditableElement()) return;
      seekBy(100);
    },
    { enabled, preventDefault: true },
    [totalDurationMs],
  );

  // Seek coarse: Shift+Left/Right ±1000ms
  useHotkeys(
    "shift+left",
    () => {
      if (isEditableElement()) return;
      seekBy(-1000);
    },
    { enabled, preventDefault: true },
    [totalDurationMs],
  );

  useHotkeys(
    "shift+right",
    () => {
      if (isEditableElement()) return;
      seekBy(1000);
    },
    { enabled, preventDefault: true },
    [totalDurationMs],
  );

  // Keypoint previous: Up
  useHotkeys(
    "up",
    () => {
      if (isEditableElement()) return;

      const currentMs = getCurrentTimeMs();
      if (currentMs === null) return;

      const keypoints = getKeypoints(segments);
      // Find the closest keypoint BEFORE current time (with 50ms tolerance)
      let prev: number | null = null;
      for (const kp of keypoints) {
        if (kp < currentMs - 50) {
          prev = kp;
        } else {
          break;
        }
      }

      if (prev !== null) {
        seekTo(prev);
      }
    },
    { enabled, preventDefault: true },
    [segments, totalDurationMs],
  );

  // Keypoint next: Down
  useHotkeys(
    "down",
    () => {
      if (isEditableElement()) return;

      const currentMs = getCurrentTimeMs();
      if (currentMs === null) return;

      const keypoints = getKeypoints(segments);
      // Find the closest keypoint AFTER current time (with 50ms tolerance)
      const next = keypoints.find((kp) => kp > currentMs + 50) ?? null;

      if (next !== null) {
        seekTo(next);
      }
    },
    { enabled, preventDefault: true },
    [segments, totalDurationMs],
  );

  // Home: Jump to beginning of timeline
  useHotkeys(
    "home",
    () => {
      if (isEditableElement()) return;
      seekTo(0);
    },
    { enabled, preventDefault: true },
    [totalDurationMs],
  );

  // End: Jump to end of timeline
  useHotkeys(
    "end",
    () => {
      if (isEditableElement()) return;
      seekTo(totalDurationMs);
    },
    { enabled, preventDefault: true },
    [totalDurationMs],
  );

  // Space: Play/Pause
  useHotkeys(
    "space",
    () => {
      if (isEditableElement()) return;

      const video = videoRef.current;
      if (!video) return;

      if (video.paused) {
        video.play();
      } else {
        video.pause();
      }
    },
    { enabled, preventDefault: true },
    [],
  );

  // Undo/Redo: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (capture phase to intercept before workspace handler)
  useEffect(() => {
    if (!enabled) return;

    const handleUndoRedo = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (isEditableElement()) return;

      if (e.key === "z" && !e.shiftKey) {
        // Undo
        const canUndo = useTimelineStore.temporal.getState().pastStates.length > 0;
        if (canUndo) {
          e.preventDefault();
          e.stopImmediatePropagation();
          useTimelineStore.temporal.getState().undo();
          toast.info("Deshacer", { description: "Cambio de timeline deshecho", duration: 1500 });
        }
        // If nothing to undo in timeline, let the event bubble to workspace handler
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        // Redo
        const canRedo = useTimelineStore.temporal.getState().futureStates.length > 0;
        if (canRedo) {
          e.preventDefault();
          e.stopImmediatePropagation();
          useTimelineStore.temporal.getState().redo();
          toast.info("Rehacer", { description: "Cambio de timeline rehecho", duration: 1500 });
        }
      }
    };

    // Capture phase → fires BEFORE bubble-phase listeners (useUndoRedoKeyboard)
    window.addEventListener("keydown", handleUndoRedo, true);
    return () => window.removeEventListener("keydown", handleUndoRedo, true);
  }, [enabled]);
}

/** Collect and deduplicate all segment boundary times, sorted ascending. */
function getKeypoints(
  segments: Array<{ startMs: number; endMs: number }>,
): number[] {
  const set = new Set<number>();
  for (const s of segments) {
    set.add(s.startMs);
    set.add(s.endMs);
  }
  return Array.from(set).sort((a, b) => a - b);
}
