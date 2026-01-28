/**
 * Paleta de colores consistente para todas las composiciones de fitness/salud
 */
export const COLORS = {
  bg: "#060812",
  panel: "rgba(255,255,255,0.06)",
  panelBorder: "rgba(255,255,255,0.10)",
  text: "rgba(255,255,255,0.92)",
  muted: "rgba(255,255,255,0.70)",
  faint: "rgba(255,255,255,0.45)",
  accent: "#8B5CF6", // Púrpura
  accent2: "#22C55E", // Verde
  danger: "#FB7185", // Rojo/Rosa
  warning: "#F59E0B", // Naranja
  cyan: "#06B6D4", // Cian
  blue: "#3B82F6", // Azul
} as const;

export type ColorKey = keyof typeof COLORS;
