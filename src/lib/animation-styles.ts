/**
 * Animation Engine — Pure function that computes CSS styles from animation config.
 *
 * Uses Remotion's interpolate(), Easing, and spring() helpers.
 * Animations play *within* the item's existing duration (they don't extend it).
 */

import { interpolate, Easing, spring } from "remotion";
import type { ItemAnimations, AnimationPreset } from "@/types/animation";

const SLIDE_DISTANCE = 300; // px

interface InterpolateOpts {
  extrapolateLeft?: "clamp" | "extend" | "identity";
  extrapolateRight?: "clamp" | "extend" | "identity";
  easing?: (t: number) => number;
}

const CLAMP: InterpolateOpts = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
};

/**
 * Compute a 0→1 progress value for an entrance animation.
 */
function enterProgress(
  localFrame: number,
  duration: number,
  fps: number,
  preset: AnimationPreset
): number {
  if (preset === "bounce") {
    return spring({
      frame: localFrame,
      fps,
      config: { damping: 12, stiffness: 200, mass: 0.8 },
      durationInFrames: duration,
    });
  }
  return interpolate(localFrame, [0, duration], [0, 1], {
    ...CLAMP,
    easing: Easing.out(Easing.cubic),
  });
}

/**
 * Compute a 1→0 progress value for an exit animation.
 * Returns 1 when fully visible, 0 when fully exited.
 */
function exitProgress(
  localFrame: number,
  itemDuration: number,
  exitDuration: number,
  fps: number,
  preset: AnimationPreset
): number {
  const exitStart = itemDuration - exitDuration;
  if (preset === "bounce") {
    const exitFrame = localFrame - exitStart;
    const raw = spring({
      frame: exitFrame,
      fps,
      config: { damping: 12, stiffness: 200, mass: 0.8 },
      durationInFrames: exitDuration,
    });
    return 1 - raw;
  }
  return interpolate(localFrame, [exitStart, itemDuration], [1, 0], {
    ...CLAMP,
    easing: Easing.in(Easing.cubic),
  });
}

/**
 * Map a 0→1 progress to CSS styles for a given preset.
 * At progress=0 the item is fully hidden; at progress=1 fully visible.
 */
function presetToStyle(
  progress: number,
  preset: AnimationPreset
): React.CSSProperties {
  switch (preset) {
    case "none":
      return {};
    case "fade":
      return { opacity: progress };
    case "slide-left":
      return {
        opacity: progress,
        transform: `translateX(${(1 - progress) * -SLIDE_DISTANCE}px)`,
      };
    case "slide-right":
      return {
        opacity: progress,
        transform: `translateX(${(1 - progress) * SLIDE_DISTANCE}px)`,
      };
    case "slide-up":
      return {
        opacity: progress,
        transform: `translateY(${(1 - progress) * -SLIDE_DISTANCE}px)`,
      };
    case "slide-down":
      return {
        opacity: progress,
        transform: `translateY(${(1 - progress) * SLIDE_DISTANCE}px)`,
      };
    case "scale":
      return {
        opacity: progress,
        transform: `scale(${progress})`,
      };
    case "bounce":
      return {
        opacity: Math.min(progress * 2, 1),
        transform: `scale(${progress})`,
      };
    case "spin":
      return {
        opacity: progress,
        transform: `rotate(${(1 - progress) * 360}deg)`,
      };
  }
}

/**
 * Merge two CSS style objects, combining transform strings.
 */
function mergeStyles(
  a: React.CSSProperties,
  b: React.CSSProperties
): React.CSSProperties {
  const merged = { ...a, ...b };

  // Combine transforms if both exist
  if (a.transform && b.transform) {
    merged.transform = `${a.transform} ${b.transform}`;
  }

  // Multiply opacities if both exist
  if (a.opacity !== undefined && b.opacity !== undefined) {
    merged.opacity = (a.opacity as number) * (b.opacity as number);
  }

  return merged;
}

/**
 * Main entry point: compute CSS styles for an item at a given local frame.
 *
 * @param localFrame - Current frame relative to item start (0-based)
 * @param itemDurationInFrames - Total duration of the item
 * @param fps - Frames per second
 * @param animations - Optional animation config
 * @returns CSS properties to apply to the wrapper div
 */
export function getAnimationStyle(
  localFrame: number,
  itemDurationInFrames: number,
  fps: number,
  animations?: ItemAnimations
): React.CSSProperties {
  if (!animations) return {};

  const { enter, exit } = animations;
  const hasEnter = enter.preset !== "none";
  const hasExit = exit.preset !== "none";

  if (!hasEnter && !hasExit) return {};

  // Clamp durations proportionally if they exceed item duration
  let enterDur = enter.durationInFrames;
  let exitDur = exit.durationInFrames;
  const total = enterDur + exitDur;
  if (total > itemDurationInFrames) {
    const ratio = itemDurationInFrames / total;
    enterDur = Math.round(enterDur * ratio);
    exitDur = Math.round(exitDur * ratio);
  }

  let enterStyle: React.CSSProperties = {};
  let exitStyle: React.CSSProperties = {};

  if (hasEnter && localFrame < enterDur) {
    const progress = enterProgress(localFrame, enterDur, fps, enter.preset);
    enterStyle = presetToStyle(progress, enter.preset);
  }

  if (hasExit && localFrame >= itemDurationInFrames - exitDur) {
    const progress = exitProgress(
      localFrame,
      itemDurationInFrames,
      exitDur,
      fps,
      exit.preset
    );
    exitStyle = presetToStyle(progress, exit.preset);
  }

  if (Object.keys(enterStyle).length > 0 && Object.keys(exitStyle).length > 0) {
    return mergeStyles(enterStyle, exitStyle);
  }

  return Object.keys(enterStyle).length > 0 ? enterStyle : exitStyle;
}
