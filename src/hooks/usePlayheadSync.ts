import { useState, useEffect, useRef, type RefObject } from "react";

interface UsePlayheadSyncOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
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
 */
export function usePlayheadSync({
  videoRef,
  isPlaying,
}: UsePlayheadSyncOptions): UsePlayheadSyncResult {
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const rafRef = useRef<number | null>(null);

  // RAF loop for smooth playhead during playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

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
      if (videoRef.current) {
        setCurrentTimeMs(videoRef.current.currentTime * 1000);
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
  }, [isPlaying, videoRef]);

  // Fallback: sync on timeupdate when paused (for seek operations)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      // Only update via timeupdate when NOT playing (RAF handles playback)
      if (!isPlaying) {
        setCurrentTimeMs(video.currentTime * 1000);
      }
    };

    const handleSeeked = () => {
      // Always update immediately on seek
      setCurrentTimeMs(video.currentTime * 1000);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("seeked", handleSeeked);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("seeked", handleSeeked);
    };
  }, [videoRef, isPlaying]);

  return {
    currentTimeMs,
    isTransitioning: isPlaying,
  };
}
