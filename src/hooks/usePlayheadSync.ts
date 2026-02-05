import { useState, useEffect, useRef } from "react";

interface UsePlayheadSyncOptions {
  videoElement: HTMLVideoElement | null;
  isPlaying: boolean;
}

interface UsePlayheadSyncResult {
  currentTimeMs: number;
  isTransitioning: boolean;
}

/**
 * Hook that syncs playhead position with video currentTime using RAF for smooth updates.
 *
 * - When playing: uses requestAnimationFrame to read currentTime at 60fps
 * - When paused: falls back to timeupdate events (less frequent but sufficient)
 * - Returns isTransitioning flag to enable CSS transitions during playback
 *
 * Accepts `videoElement` (HTMLVideoElement | null) instead of a ref so that
 * effects re-run when the element mounts/unmounts.
 */
export function usePlayheadSync({
  videoElement,
  isPlaying,
}: UsePlayheadSyncOptions): UsePlayheadSyncResult {
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const rafRef = useRef<number | null>(null);

  // RAF loop for smooth playhead during playback
  useEffect(() => {
    if (!videoElement) return;

    if (!isPlaying) {
      // When paused, cancel any pending RAF
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // RAF loop for 60fps updates during playback
    const tick = () => {
      if (videoElement) {
        setCurrentTimeMs(videoElement.currentTime * 1000);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, videoElement]);

  // Fallback: sync on timeupdate when paused (for seek operations)
  useEffect(() => {
    if (!videoElement) return;

    const handleTimeUpdate = () => {
      // Only update via timeupdate when NOT playing (RAF handles playback)
      if (!isPlaying) {
        setCurrentTimeMs(videoElement.currentTime * 1000);
      }
    };

    const handleSeeked = () => {
      // Always update immediately on seek
      setCurrentTimeMs(videoElement.currentTime * 1000);
    };

    videoElement.addEventListener("timeupdate", handleTimeUpdate);
    videoElement.addEventListener("seeked", handleSeeked);

    return () => {
      videoElement.removeEventListener("timeupdate", handleTimeUpdate);
      videoElement.removeEventListener("seeked", handleSeeked);
    };
  }, [videoElement, isPlaying]);

  return {
    currentTimeMs,
    isTransitioning: isPlaying,
  };
}
