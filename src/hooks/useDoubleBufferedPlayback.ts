import { useState, useEffect, useRef, useCallback } from "react";
import type { TimelineSegment } from "@/store/timeline";

interface UseDoubleBufferedPlaybackOptions {
  videoPath: string;
  enabledSegments: TimelineSegment[];
  isPlaying: boolean;
}

interface UseDoubleBufferedPlaybackResult {
  videoRefA: React.RefObject<HTMLVideoElement | null>;
  videoRefB: React.RefObject<HTMLVideoElement | null>;
  activeVideo: "A" | "B";
  /** Ref that always points to the currently active video element */
  activeVideoRef: React.RefObject<HTMLVideoElement | null>;
  currentTimeMs: number;
  isTransitioning: boolean;
  togglePlayback: () => void;
  seekTo: (ms: number) => void;
  setVideoElA: (el: HTMLVideoElement | null) => void;
  setVideoElB: (el: HTMLVideoElement | null) => void;
}

// Threshold for pre-seeking the background video (ms before segment end)
const PRE_SEEK_MS = 800;
// Threshold for swapping videos (ms before segment end, ~1 frame at 60fps)
const SWAP_MS = 17;
// Minimum segment duration for double-buffering (shorter segments use simple seek)
const MIN_SEGMENT_FOR_DB = 500;

export function useDoubleBufferedPlayback({
  videoPath,
  enabledSegments,
  isPlaying,
}: UseDoubleBufferedPlaybackOptions): UseDoubleBufferedPlaybackResult {
  const videoRefA = useRef<HTMLVideoElement | null>(null);
  const videoRefB = useRef<HTMLVideoElement | null>(null);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);

  const [activeVideo, setActiveVideo] = useState<"A" | "B">("A");
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  // Internal refs for RAF loop (avoid stale closures)
  const activeVideoIdRef = useRef<"A" | "B">("A");
  const preSeekPendingRef = useRef(false);
  const preSeekTargetSegmentRef = useRef<string | null>(null);
  const isPlayingRef = useRef(isPlaying);
  const enabledSegmentsRef = useRef(enabledSegments);
  const rafRef = useRef<number | null>(null);

  // Keep refs in sync
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    enabledSegmentsRef.current = enabledSegments;
  }, [enabledSegments]);

  // Update activeVideoRef when activeVideo changes
  useEffect(() => {
    activeVideoIdRef.current = activeVideo;
    activeVideoRef.current =
      activeVideo === "A" ? videoRefA.current : videoRefB.current;
  }, [activeVideo]);

  const getActiveEl = useCallback((): HTMLVideoElement | null => {
    return activeVideoIdRef.current === "A"
      ? videoRefA.current
      : videoRefB.current;
  }, []);

  const getBackgroundEl = useCallback((): HTMLVideoElement | null => {
    return activeVideoIdRef.current === "A"
      ? videoRefB.current
      : videoRefA.current;
  }, []);

  // Find the segment that contains a given time
  const findSegmentAt = useCallback(
    (timeMs: number): TimelineSegment | null => {
      return (
        enabledSegmentsRef.current.find(
          (s) => timeMs >= s.startMs && timeMs <= s.endMs
        ) ?? null
      );
    },
    []
  );

  // Find the next enabled segment after the given segment
  const findNextSegment = useCallback(
    (afterEndMs: number): TimelineSegment | null => {
      return (
        enabledSegmentsRef.current.find((s) => s.startMs >= afterEndMs) ?? null
      );
    },
    []
  );

  // Swap active/background videos
  const swapVideos = useCallback(() => {
    const nextId = activeVideoIdRef.current === "A" ? "B" : "A";
    const nowActive =
      nextId === "A" ? videoRefA.current : videoRefB.current;
    const nowBackground =
      nextId === "A" ? videoRefB.current : videoRefA.current;

    if (!nowActive || !nowBackground) return;

    // Play the now-active (already pre-seeked), pause the now-background
    nowActive.muted = false;
    nowBackground.muted = true;

    nowActive.play().catch(() => {});
    nowBackground.pause();

    preSeekPendingRef.current = false;
    preSeekTargetSegmentRef.current = null;
    activeVideoIdRef.current = nextId;
    activeVideoRef.current = nowActive;
    setActiveVideo(nextId);
  }, []);

  // Simple seek on active video (for short segments or user seek)
  const simpleSeek = useCallback((targetMs: number) => {
    const el = getActiveEl();
    if (!el) return;
    el.currentTime = targetMs / 1000;
    // Cancel any pending pre-seek
    preSeekPendingRef.current = false;
    preSeekTargetSegmentRef.current = null;
  }, [getActiveEl]);

  // RAF loop
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = () => {
      const active = getActiveEl();
      if (!active) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const timeMs = active.currentTime * 1000;
      setCurrentTimeMs(timeMs);

      const segments = enabledSegmentsRef.current;
      const currentSeg = findSegmentAt(timeMs);

      if (currentSeg) {
        const msToEnd = currentSeg.endMs - timeMs;
        const segDuration = currentSeg.endMs - currentSeg.startMs;

        // Step 4: Pre-seek background video when approaching segment end
        if (
          msToEnd <= PRE_SEEK_MS &&
          msToEnd > SWAP_MS &&
          !preSeekPendingRef.current &&
          segDuration >= MIN_SEGMENT_FOR_DB
        ) {
          const nextSeg = findNextSegment(currentSeg.endMs);
          if (nextSeg) {
            const bgEl = getBackgroundEl();
            if (bgEl) {
              bgEl.currentTime = nextSeg.startMs / 1000;
              preSeekPendingRef.current = true;
              preSeekTargetSegmentRef.current = nextSeg.id;
            }
          }
        }

        // Step 5: Swap at the transition point
        if (msToEnd <= SWAP_MS && msToEnd >= 0) {
          const nextSeg = findNextSegment(currentSeg.endMs);
          if (nextSeg) {
            if (preSeekPendingRef.current && preSeekTargetSegmentRef.current === nextSeg.id) {
              // Double-buffer swap
              swapVideos();
            } else {
              // Short segment fallback: simple seek on active
              simpleSeek(nextSeg.startMs);
            }
          } else {
            // No more segments - pause
            active.pause();
          }
        }
      } else {
        // Step 6: Not in any enabled segment - jump to the next one
        const nextSeg = segments.find((s) => s.startMs > timeMs);
        if (nextSeg) {
          simpleSeek(nextSeg.startMs);
        } else {
          // No segments ahead - pause
          active.pause();
        }
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
  }, [isPlaying, getActiveEl, getBackgroundEl, findSegmentAt, findNextSegment, swapVideos, simpleSeek]);

  // Fallback: sync on timeupdate/seeked when paused
  useEffect(() => {
    const elA = videoRefA.current;
    const elB = videoRefB.current;

    const handleTimeUpdate = (e: Event) => {
      const target = e.target as HTMLVideoElement;
      const isActive =
        (activeVideoIdRef.current === "A" && target === videoRefA.current) ||
        (activeVideoIdRef.current === "B" && target === videoRefB.current);
      if (isActive && !isPlayingRef.current) {
        setCurrentTimeMs(target.currentTime * 1000);
      }
    };

    const handleSeeked = (e: Event) => {
      const target = e.target as HTMLVideoElement;
      const isActive =
        (activeVideoIdRef.current === "A" && target === videoRefA.current) ||
        (activeVideoIdRef.current === "B" && target === videoRefB.current);
      if (isActive) {
        setCurrentTimeMs(target.currentTime * 1000);
      }
    };

    elA?.addEventListener("timeupdate", handleTimeUpdate);
    elA?.addEventListener("seeked", handleSeeked);
    elB?.addEventListener("timeupdate", handleTimeUpdate);
    elB?.addEventListener("seeked", handleSeeked);

    return () => {
      elA?.removeEventListener("timeupdate", handleTimeUpdate);
      elA?.removeEventListener("seeked", handleSeeked);
      elB?.removeEventListener("timeupdate", handleTimeUpdate);
      elB?.removeEventListener("seeked", handleSeeked);
    };
  }, []);

  // togglePlayback
  const togglePlayback = useCallback(() => {
    const active = getActiveEl();
    if (!active) return;

    if (isPlayingRef.current) {
      active.pause();
    } else {
      // If starting from a gap, jump to next enabled segment
      const timeMs = active.currentTime * 1000;
      const segs = enabledSegmentsRef.current;
      const inSeg = segs.find(
        (s) => timeMs >= s.startMs && timeMs <= s.endMs
      );

      if (!inSeg) {
        const nextSeg = segs.find((s) => s.startMs > timeMs);
        if (nextSeg) {
          active.currentTime = nextSeg.startMs / 1000;
        } else if (segs.length > 0) {
          active.currentTime = segs[0].startMs / 1000;
        }
      }
      active.play().catch(() => {});
    }
  }, [getActiveEl]);

  // seekTo (for user-initiated seeks)
  const seekTo = useCallback(
    (ms: number) => {
      // Cancel any pending pre-seek
      preSeekPendingRef.current = false;
      preSeekTargetSegmentRef.current = null;

      const active = getActiveEl();
      if (!active) return;
      active.currentTime = ms / 1000;
      setCurrentTimeMs(ms);
    },
    [getActiveEl]
  );

  // Setter callbacks for ref assignment in JSX
  const setVideoElA = useCallback((el: HTMLVideoElement | null) => {
    videoRefA.current = el;
    if (activeVideoIdRef.current === "A") {
      activeVideoRef.current = el;
    }
  }, []);

  const setVideoElB = useCallback((el: HTMLVideoElement | null) => {
    videoRefB.current = el;
    if (activeVideoIdRef.current === "B") {
      activeVideoRef.current = el;
    }
  }, []);

  return {
    videoRefA,
    videoRefB,
    activeVideo,
    activeVideoRef,
    currentTimeMs,
    isTransitioning: isPlaying,
    togglePlayback,
    seekTo,
    setVideoElA,
    setVideoElB,
  };
}
