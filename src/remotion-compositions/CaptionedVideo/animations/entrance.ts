import { spring, interpolate, Easing } from "remotion";
import type { EntranceAnimation } from "../../../store/subtitles";

interface EntranceConfig {
  frame: number;
  fps: number;
  durationMs: number;
}

export interface EntranceStyles {
  opacity: number;
  transform: string;
}

export function getEntranceStyles(
  animation: EntranceAnimation,
  config: EntranceConfig
): EntranceStyles {
  const { frame, fps, durationMs } = config;
  const durationFrames = Math.round((durationMs / 1000) * fps);

  switch (animation) {
    case "spring":
      return getSpringEntrance(frame, fps);
    case "fade":
      return getFadeEntrance(frame, durationFrames);
    case "slide-up":
      return getSlideEntrance(frame, fps, durationFrames, "up");
    case "slide-down":
      return getSlideEntrance(frame, fps, durationFrames, "down");
    case "pop":
      return getPopEntrance(frame, fps);
    case "typewriter":
      return getTypewriterEntrance(frame, durationFrames);
    case "karaoke":
      return getKaraokeEntrance(frame, durationFrames);
    default:
      return { opacity: 1, transform: "none" };
  }
}

function getSpringEntrance(frame: number, fps: number): EntranceStyles {
  const progress = spring({
    frame,
    fps,
    config: {
      damping: 200,
      stiffness: 100,
      mass: 0.5,
    },
  });

  const scaleValue = interpolate(progress, [0, 1], [0.8, 1]);
  const translateValue = interpolate(progress, [0, 1], [50, 0]);

  return {
    opacity: progress,
    transform: `scale(${scaleValue}) translateY(${translateValue}px)`,
  };
}

function getFadeEntrance(frame: number, durationFrames: number): EntranceStyles {
  const opacity = interpolate(frame, [0, durationFrames], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return {
    opacity,
    transform: "none",
  };
}

function getSlideEntrance(
  frame: number,
  fps: number,
  durationFrames: number,
  direction: "up" | "down"
): EntranceStyles {
  const progress = spring({
    frame,
    fps,
    config: {
      damping: 100,
      stiffness: 80,
    },
  });

  const opacity = interpolate(frame, [0, durationFrames * 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });

  const startOffset = direction === "up" ? 80 : -80;
  const translateValue = interpolate(progress, [0, 1], [startOffset, 0]);

  return {
    opacity,
    transform: `translateY(${translateValue}px)`,
  };
}

function getPopEntrance(frame: number, fps: number): EntranceStyles {
  const progress = spring({
    frame,
    fps,
    config: {
      damping: 10,
      stiffness: 200,
      mass: 0.3,
    },
  });

  // Overshoot scale for bounce effect
  const scaleValue = interpolate(progress, [0, 1], [0, 1]);

  return {
    opacity: Math.min(1, progress * 2),
    transform: `scale(${scaleValue})`,
  };
}

function getTypewriterEntrance(
  frame: number,
  _durationFrames: number
): EntranceStyles {
  // For typewriter, the main container is always visible
  // Individual character reveal is handled at the token level
  const opacity = interpolate(frame, [0, 3], [0, 1], {
    extrapolateRight: "clamp",
  });

  return {
    opacity,
    transform: "none",
  };
}

function getKaraokeEntrance(
  frame: number,
  durationFrames: number
): EntranceStyles {
  // Karaoke uses a fill effect, container fades in quickly
  const opacity = interpolate(frame, [0, durationFrames * 0.3], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return {
    opacity,
    transform: "none",
  };
}

// Helper for typewriter effect - get character visibility
export function getTypewriterCharacterOpacity(
  charIndex: number,
  totalChars: number,
  frame: number,
  durationFrames: number
): number {
  const framesPerChar = durationFrames / totalChars;
  const charAppearFrame = charIndex * framesPerChar;

  return interpolate(frame, [charAppearFrame, charAppearFrame + 2], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

// Helper for karaoke effect - get fill progress
export function getKaraokeFillProgress(
  frame: number,
  durationFrames: number
): number {
  return interpolate(frame, [0, durationFrames], [0, 100], {
    extrapolateRight: "clamp",
    easing: Easing.linear,
  });
}
