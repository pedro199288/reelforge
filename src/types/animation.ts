/**
 * Animation Types & Constants
 *
 * Predefined enter/exit animations for visual timeline items.
 */

export type AnimationPreset =
  | "none"
  | "fade"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "scale"
  | "bounce"
  | "spin";

export interface AnimationConfig {
  preset: AnimationPreset;
  durationInFrames: number;
}

export interface ItemAnimations {
  enter: AnimationConfig;
  exit: AnimationConfig;
}

export const DEFAULT_ITEM_ANIMATIONS: ItemAnimations = {
  enter: { preset: "none", durationInFrames: 10 },
  exit: { preset: "none", durationInFrames: 10 },
};

export const ANIMATION_PRESET_LABELS: Record<AnimationPreset, string> = {
  none: "Ninguna",
  fade: "Desvanecer",
  "slide-left": "Deslizar izquierda",
  "slide-right": "Deslizar derecha",
  "slide-up": "Deslizar arriba",
  "slide-down": "Deslizar abajo",
  scale: "Escalar",
  bounce: "Rebote",
  spin: "Girar",
};
