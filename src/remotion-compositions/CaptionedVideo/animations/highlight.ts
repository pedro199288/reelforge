import { spring, interpolate } from "remotion";
import type { HighlightEffect } from "@/store/subtitles";

interface HighlightConfig {
  frame: number;
  fps: number;
  startFrame: number;
  endFrame: number;
  intensity: number;
  color: string;
}

export interface HighlightStyles {
  color?: string;
  transform?: string;
  textShadow?: string;
  textDecoration?: string;
  textDecorationColor?: string;
  textUnderlineOffset?: string;
}

export function getHighlightStyles(
  effect: HighlightEffect,
  config: HighlightConfig,
  isActive: boolean
): HighlightStyles {
  if (!isActive) {
    return {};
  }

  const { frame, fps, startFrame, endFrame, intensity, color } = config;
  const localFrame = frame - startFrame;
  const duration = endFrame - startFrame;

  switch (effect) {
    case "color":
      return getColorHighlight(color);
    case "scale":
      return getScaleHighlight(localFrame, fps, intensity);
    case "glow":
      return getGlowHighlight(localFrame, fps, color, intensity);
    case "underline":
      return getUnderlineHighlight(localFrame, duration, fps, color);
    case "bounce":
      return getBounceHighlight(localFrame, fps);
    case "shake":
      return getShakeHighlight(frame, fps);
    default:
      return { color };
  }
}

function getColorHighlight(color: string): HighlightStyles {
  return { color };
}

function getScaleHighlight(
  localFrame: number,
  fps: number,
  intensity: number
): HighlightStyles {
  // Quick scale up, then settle
  const progress = spring({
    frame: localFrame,
    fps,
    config: {
      damping: 15,
      stiffness: 200,
      mass: 0.3,
    },
  });

  const scaleValue = interpolate(progress, [0, 1], [1, intensity]);

  return {
    transform: `scale(${scaleValue})`,
  };
}

function getGlowHighlight(
  localFrame: number,
  fps: number,
  color: string,
  intensity: number
): HighlightStyles {
  const progress = spring({
    frame: localFrame,
    fps,
    config: {
      damping: 20,
      stiffness: 100,
    },
  });

  const glowSize = interpolate(progress, [0, 1], [0, 20 * intensity]);
  const glowSizeOuter = interpolate(progress, [0, 1], [0, 40 * intensity]);

  return {
    color,
    textShadow: `0 0 ${glowSize}px ${color}, 0 0 ${glowSizeOuter}px ${color}`,
  };
}

function getUnderlineHighlight(
  localFrame: number,
  duration: number,
  fps: number,
  color: string
): HighlightStyles {
  // Animated underline that grows from left to right
  const progress = spring({
    frame: localFrame,
    fps,
    config: {
      damping: 20,
      stiffness: 150,
    },
  });

  // We use CSS gradient to simulate growing underline
  // Since we can't use backgroundSize in inline styles reliably,
  // we use a simple underline with opacity
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  return {
    color,
    textDecoration: "underline",
    textDecorationColor: `rgba(${hexToRgb(color)}, ${opacity})`,
    textUnderlineOffset: "8px",
  };
}

function getBounceHighlight(localFrame: number, fps: number): HighlightStyles {
  // Bounce effect - word jumps up and settles
  const progress = spring({
    frame: localFrame,
    fps,
    config: {
      damping: 8,
      stiffness: 200,
      mass: 0.4,
    },
  });

  const bounceY = interpolate(progress, [0, 1], [-15, 0]);

  return {
    transform: `translateY(${bounceY}px)`,
  };
}

function getShakeHighlight(frame: number, fps: number): HighlightStyles {
  // Continuous shake effect while active
  // Using sine wave for smooth oscillation
  const frequency = 15; // Hz
  const amplitude = 3; // pixels

  const time = frame / fps;
  const shakeX = Math.sin(time * frequency * Math.PI * 2) * amplitude;

  return {
    transform: `translateX(${shakeX}px)`,
  };
}

// Helper to convert hex to RGB for rgba() usage
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "255, 255, 255";

  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

// Combine highlight styles with base word styles
export function combineHighlightWithBase(
  baseStyles: React.CSSProperties,
  highlightStyles: HighlightStyles
): React.CSSProperties {
  const combined: React.CSSProperties = { ...baseStyles };

  if (highlightStyles.color) {
    combined.color = highlightStyles.color;
  }

  if (highlightStyles.transform) {
    // Combine transforms if base has one
    const baseTransform = baseStyles.transform || "";
    combined.transform = baseTransform
      ? `${baseTransform} ${highlightStyles.transform}`
      : highlightStyles.transform;
  }

  if (highlightStyles.textShadow) {
    // Combine shadows if base has one
    const baseShadow = baseStyles.textShadow || "";
    combined.textShadow = baseShadow
      ? `${baseShadow}, ${highlightStyles.textShadow}`
      : highlightStyles.textShadow;
  }

  if (highlightStyles.textDecoration) {
    combined.textDecoration = highlightStyles.textDecoration;
  }

  if (highlightStyles.textDecorationColor) {
    combined.textDecorationColor = highlightStyles.textDecorationColor;
  }

  if (highlightStyles.textUnderlineOffset) {
    combined.textUnderlineOffset = highlightStyles.textUnderlineOffset;
  }

  return combined;
}
