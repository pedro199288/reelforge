/**
 * Utilidades comunes para animaciones y cálculos
 */

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const secondsToFrames = (s: number, fps: number) => Math.round(s * fps);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
