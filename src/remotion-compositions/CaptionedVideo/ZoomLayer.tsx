import React, { useMemo } from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import type {
  ZoomEvent,
  HighlightEvent,
  AlignedEvent,
} from "../../core/script/align";

export interface ZoomLayerProps {
  events: AlignedEvent[];
  children: React.ReactNode;
}

/**
 * Layer that applies zoom effects to its children based on timed events
 *
 * Zoom styles:
 * - punch: Fast zoom in (1.2x), smooth out - impactful, energetic
 * - slow: Gradual smooth zoom - cinematic, dramatic
 * - highlight: Quick zoom pulse on specific word
 */
export const ZoomLayer: React.FC<ZoomLayerProps> = ({ events, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = (frame / fps) * 1000;

  // Calculate total scale from all active zoom effects
  const scale = useMemo(() => {
    let totalScale = 1;

    for (const event of events) {
      if (event.type === "zoom") {
        const zoomScale = calculateZoomScale(event, currentTimeMs, fps, frame);
        // Multiply scales for overlapping zooms
        totalScale *= zoomScale;
      } else if (event.type === "highlight") {
        const highlightScale = calculateHighlightScale(
          event,
          currentTimeMs,
          fps,
          frame,
        );
        totalScale *= highlightScale;
      }
    }

    return totalScale;
  }, [events, currentTimeMs, fps, frame]);

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${scale})`,
        transformOrigin: "center center",
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/**
 * Calculate scale for a zoom event
 */
function calculateZoomScale(
  event: ZoomEvent,
  currentTimeMs: number,
  fps: number,
  frame: number,
): number {
  const eventStartFrame = Math.floor((event.timestampMs / 1000) * fps);
  const eventDurationFrames = Math.floor((event.durationMs / 1000) * fps);
  const eventEndFrame = eventStartFrame + eventDurationFrames;

  // Not active yet or already finished
  if (frame < eventStartFrame || frame > eventEndFrame + fps) {
    return 1;
  }

  const localFrame = frame - eventStartFrame;

  if (event.style === "punch") {
    // Punch zoom: fast in, smooth out
    // Peak at 20% of duration, then ease back
    const peakFrame = Math.floor(eventDurationFrames * 0.2);
    const maxScale = 1.15;

    if (localFrame <= peakFrame) {
      // Fast zoom in with spring
      const zoomIn = spring({
        fps,
        frame: localFrame,
        config: {
          damping: 100,
          stiffness: 400,
          mass: 0.3,
        },
      });
      return 1 + (maxScale - 1) * zoomIn;
    } else {
      // Smooth zoom out
      const outProgress =
        (localFrame - peakFrame) / (eventDurationFrames - peakFrame + fps);
      const zoomOut = interpolate(outProgress, [0, 1], [maxScale, 1], {
        easing: Easing.out(Easing.cubic),
        extrapolateRight: "clamp",
      });
      return zoomOut;
    }
  } else {
    // Slow zoom: gradual cinematic zoom
    const maxScale = 1.08;
    const holdFrames = Math.floor(eventDurationFrames * 0.6);

    if (localFrame <= holdFrames) {
      // Slow zoom in
      const progress = localFrame / holdFrames;
      return interpolate(progress, [0, 1], [1, maxScale], {
        easing: Easing.inOut(Easing.quad),
      });
    } else {
      // Slow zoom out
      const outProgress =
        (localFrame - holdFrames) / (eventDurationFrames - holdFrames + fps);
      return interpolate(outProgress, [0, 1], [maxScale, 1], {
        easing: Easing.out(Easing.quad),
        extrapolateRight: "clamp",
      });
    }
  }
}

/**
 * Calculate scale for a highlight event
 */
function calculateHighlightScale(
  event: HighlightEvent,
  currentTimeMs: number,
  fps: number,
  frame: number,
): number {
  const eventStartFrame = Math.floor((event.startMs / 1000) * fps);
  const eventEndFrame = Math.floor((event.endMs / 1000) * fps);
  const transitionFrames = Math.floor(fps * 0.15); // 150ms transition

  // Not active
  if (
    frame < eventStartFrame - transitionFrames ||
    frame > eventEndFrame + transitionFrames
  ) {
    return 1;
  }

  const maxScale = 1.1;

  if (frame < eventStartFrame) {
    // Zoom in before word
    const progress =
      (frame - (eventStartFrame - transitionFrames)) / transitionFrames;
    return interpolate(progress, [0, 1], [1, maxScale], {
      easing: Easing.out(Easing.back(1.5)),
    });
  } else if (frame <= eventEndFrame) {
    // Hold during word
    return maxScale;
  } else {
    // Zoom out after word
    const progress = (frame - eventEndFrame) / transitionFrames;
    return interpolate(progress, [0, 1], [maxScale, 1], {
      easing: Easing.in(Easing.quad),
      extrapolateRight: "clamp",
    });
  }
}

/**
 * Props for ZoomLayer when using with script alignment
 */
export interface ZoomLayerFromScriptProps {
  zoomEvents: ZoomEvent[];
  highlightEvents: HighlightEvent[];
  children: React.ReactNode;
}

/**
 * Convenience component that takes separated zoom and highlight events
 */
export const ZoomLayerFromScript: React.FC<ZoomLayerFromScriptProps> = ({
  zoomEvents,
  highlightEvents,
  children,
}) => {
  const events: AlignedEvent[] = [...zoomEvents, ...highlightEvents];
  return <ZoomLayer events={events}>{children}</ZoomLayer>;
};
