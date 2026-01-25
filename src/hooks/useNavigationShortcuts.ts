import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";

const NAVIGATION_KEYS: Record<string, string> = {
  m: "/",
  p: "/pipeline",
  b: "/batch",
  s: "/studio",
};

/**
 * Hook that registers navigation keyboard shortcuts
 * G+M: Media Library
 * G+P: Pipeline
 * G+B: Batch Processing
 * G+S: Studio
 */
export function useNavigationShortcuts(enabled = true) {
  const navigate = useNavigate();
  const pendingGRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      // Skip if modifier keys are pressed (except for sequences)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      // Handle "G" prefix
      if (e.key.toLowerCase() === "g" && !pendingGRef.current) {
        pendingGRef.current = true;
        // Clear pending after 1 second
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          pendingGRef.current = false;
        }, 1000);
        return;
      }

      // Handle navigation keys after "G"
      if (pendingGRef.current) {
        const key = e.key.toLowerCase();
        const path = NAVIGATION_KEYS[key];

        if (path) {
          e.preventDefault();
          navigate({ to: path });
        }

        pendingGRef.current = false;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [enabled, navigate]);
}
