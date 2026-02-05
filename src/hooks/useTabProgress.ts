import { useEffect, useRef } from "react";
import { STEPS, type PipelineStep, type ProcessProgress } from "@/types/pipeline";
import {
  setFaviconProgress,
  setFaviconDone,
  clearFavicon,
} from "@/lib/favicon-progress";
import { playNotificationSound } from "@/lib/notification-sound";

interface UseTabProgressParams {
  stepProcessing: PipelineStep | null;
  stepProgress: ProcessProgress | null;
  completedCount: number;
  totalSteps: number;
}

/**
 * Updates the browser tab title with pipeline progress and sends
 * a browser notification when processing finishes while the tab is hidden.
 * Also shows a dynamic favicon with progress and plays a chime on completion.
 */
export function useTabProgress({
  stepProcessing,
  stepProgress,
  completedCount,
  totalSteps,
}: UseTabProgressParams) {
  const originalTitleRef = useRef(document.title);
  const wasProcessingRef = useRef(false);

  // Request notification permission when processing starts
  useEffect(() => {
    if (
      stepProcessing &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission();
    }
  }, [stepProcessing]);

  // Update document title + favicon with step progress
  useEffect(() => {
    if (stepProcessing && stepProgress) {
      const stepLabel =
        STEPS.find((s) => s.key === stepProcessing)?.label ?? stepProcessing;
      const pct = Math.round(stepProgress.progress);
      document.title = `[${pct}%] ${stepLabel} — ${completedCount}/${totalSteps}`;
      setFaviconProgress(pct);
    }
  }, [stepProcessing, stepProgress, completedCount, totalSteps]);

  // Detect processing end → show completion + notify + sound
  useEffect(() => {
    if (stepProcessing) {
      wasProcessingRef.current = true;
    } else if (wasProcessingRef.current) {
      wasProcessingRef.current = false;
      document.title = `✓ Pipeline ${completedCount}/${totalSteps}`;
      setFaviconDone();
      playNotificationSound();

      if (
        document.hidden &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        new Notification("ReelForge", {
          body: `Pipeline: ${completedCount}/${totalSteps} pasos completados`,
        });
      }
    }
  }, [stepProcessing, completedCount, totalSteps]);

  // Restore original title + clear favicon when tab becomes visible and not processing
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && !wasProcessingRef.current) {
        document.title = originalTitleRef.current;
        clearFavicon();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Restore title + clear favicon on unmount
  useEffect(() => {
    return () => {
      document.title = originalTitleRef.current;
      clearFavicon();
    };
  }, []);
}
