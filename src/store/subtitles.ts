import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AVAILABLE_FONTS, DEFAULT_FONT, type FontId } from "../load-font";

export { AVAILABLE_FONTS, type FontId };

export const HIGHLIGHT_COLORS = [
  { name: "Verde Lima", value: "#39E508" },
  { name: "Amarillo", value: "#FFE135" },
  { name: "Naranja", value: "#FF6B35" },
  { name: "Rosa", value: "#FF1493" },
  { name: "Cyan", value: "#00D4FF" },
  { name: "Rojo", value: "#FF0000" },
  { name: "Púrpura", value: "#9B59B6" },
  { name: "Blanco", value: "#FFFFFF" },
] as const;

export const ENTRANCE_ANIMATIONS = [
  { id: "spring", name: "Spring" },
  { id: "fade", name: "Fade In" },
  { id: "slide-up", name: "Slide Up" },
  { id: "slide-down", name: "Slide Down" },
  { id: "pop", name: "Pop" },
  { id: "typewriter", name: "Typewriter" },
  { id: "karaoke", name: "Karaoke" },
] as const;

export type EntranceAnimation = (typeof ENTRANCE_ANIMATIONS)[number]["id"];

export const HIGHLIGHT_EFFECTS = [
  { id: "color", name: "Color Change" },
  { id: "scale", name: "Scale/Pulse" },
  { id: "glow", name: "Glow" },
  { id: "underline", name: "Underline" },
  { id: "bounce", name: "Bounce" },
  { id: "shake", name: "Shake" },
] as const;

export type HighlightEffect = (typeof HIGHLIGHT_EFFECTS)[number]["id"];

export const POSITIONS = [
  { id: "top", name: "Top" },
  { id: "center", name: "Center" },
  { id: "bottom", name: "Bottom" },
] as const;

export type Position = (typeof POSITIONS)[number]["id"];

export const FONT_WEIGHTS = ["normal", "bold", "black"] as const;
export type FontWeight = (typeof FONT_WEIGHTS)[number];

export interface SubtitleStyle {
  // Font
  fontFamily: FontId;
  fontSize: number;
  fontWeight: FontWeight;

  // Colors
  textColor: string;
  highlightColor: string;
  strokeColor: string;
  strokeWidth: number;

  // Shadow
  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;

  // Background
  backgroundEnabled: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  backgroundPadding: number;

  // Animation
  entranceAnimation: EntranceAnimation;
  entranceDuration: number;

  // Highlight effect
  highlightEffect: HighlightEffect;
  highlightIntensity: number;

  // Position
  position: Position;
  marginBottom: number;
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: DEFAULT_FONT,
  fontSize: 120,
  fontWeight: "bold",

  textColor: "#FFFFFF",
  highlightColor: "#39E508",
  strokeColor: "#000000",
  strokeWidth: 20,

  shadowEnabled: false,
  shadowColor: "#000000",
  shadowBlur: 10,
  shadowOffsetX: 2,
  shadowOffsetY: 2,

  backgroundEnabled: false,
  backgroundColor: "#000000",
  backgroundOpacity: 0.5,
  backgroundPadding: 10,

  entranceAnimation: "spring",
  entranceDuration: 300,

  highlightEffect: "color",
  highlightIntensity: 1.2,

  position: "bottom",
  marginBottom: 350,
};

// Presets for different platforms
export const DEFAULT_PRESETS: Record<string, SubtitleStyle> = {
  TikTok: {
    ...DEFAULT_SUBTITLE_STYLE,
    fontFamily: "TheBoldFont",
    fontSize: 100,
    highlightColor: "#39E508",
    entranceAnimation: "spring",
    highlightEffect: "color",
    position: "bottom",
    marginBottom: 350,
  },
  YouTube: {
    ...DEFAULT_SUBTITLE_STYLE,
    fontFamily: "Montserrat",
    fontSize: 80,
    textColor: "#FFFFFF",
    highlightColor: "#FFFF00",
    strokeWidth: 15,
    entranceAnimation: "fade",
    highlightEffect: "color",
    backgroundEnabled: true,
    backgroundColor: "#000000",
    backgroundOpacity: 0.7,
    backgroundPadding: 12,
    position: "bottom",
    marginBottom: 100,
  },
  Instagram: {
    ...DEFAULT_SUBTITLE_STYLE,
    fontFamily: "Poppins",
    fontSize: 90,
    highlightColor: "#FF1493",
    strokeWidth: 18,
    entranceAnimation: "pop",
    highlightEffect: "scale",
    highlightIntensity: 1.15,
    position: "center",
    marginBottom: 0,
  },
  Netflix: {
    ...DEFAULT_SUBTITLE_STYLE,
    fontFamily: "Oswald",
    fontSize: 70,
    textColor: "#FFFFFF",
    highlightColor: "#E50914",
    strokeWidth: 0,
    shadowEnabled: true,
    shadowColor: "#000000",
    shadowBlur: 8,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    backgroundEnabled: true,
    backgroundColor: "#000000",
    backgroundOpacity: 0.8,
    backgroundPadding: 8,
    entranceAnimation: "fade",
    highlightEffect: "color",
    position: "bottom",
    marginBottom: 80,
  },
};

interface SubtitleStore {
  currentStyle: SubtitleStyle;
  presets: Record<string, SubtitleStyle>;

  // Style actions
  setStyle: (style: Partial<SubtitleStyle>) => void;
  resetToDefault: () => void;

  // Preset actions
  savePreset: (name: string) => void;
  loadPreset: (name: string) => void;
  deletePreset: (name: string) => void;

  // Legacy compatibility (deprecated but kept for existing code)
  highlightColor: string;
  fontFamily: FontId;
  setHighlightColor: (color: string) => void;
  setFontFamily: (font: FontId) => void;
}

export const useSubtitleStore = create<SubtitleStore>()(
  persist(
    (set, get) => ({
      currentStyle: DEFAULT_SUBTITLE_STYLE,
      presets: DEFAULT_PRESETS,

      setStyle: (style) =>
        set((state) => ({
          currentStyle: { ...state.currentStyle, ...style },
          // Keep legacy properties in sync
          highlightColor: style.highlightColor ?? state.currentStyle.highlightColor,
          fontFamily: style.fontFamily ?? state.currentStyle.fontFamily,
        })),

      resetToDefault: () =>
        set({
          currentStyle: DEFAULT_SUBTITLE_STYLE,
          highlightColor: DEFAULT_SUBTITLE_STYLE.highlightColor,
          fontFamily: DEFAULT_SUBTITLE_STYLE.fontFamily,
        }),

      savePreset: (name) =>
        set((state) => ({
          presets: {
            ...state.presets,
            [name]: { ...state.currentStyle },
          },
        })),

      loadPreset: (name) => {
        const state = get();
        const preset = state.presets[name];
        if (preset) {
          set({
            currentStyle: { ...preset },
            highlightColor: preset.highlightColor,
            fontFamily: preset.fontFamily,
          });
        }
      },

      deletePreset: (name) =>
        set((state) => {
          const { [name]: _, ...rest } = state.presets;
          return { presets: rest };
        }),

      // Legacy compatibility
      highlightColor: DEFAULT_SUBTITLE_STYLE.highlightColor,
      fontFamily: DEFAULT_SUBTITLE_STYLE.fontFamily,

      setHighlightColor: (color) =>
        set((state) => ({
          highlightColor: color,
          currentStyle: { ...state.currentStyle, highlightColor: color },
        })),

      setFontFamily: (font) =>
        set((state) => ({
          fontFamily: font,
          currentStyle: { ...state.currentStyle, fontFamily: font },
        })),
    }),
    {
      name: "reelforge-subtitles",
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        if (version < 2) {
          // Migration from v1 (simple highlightColor + fontFamily) to v2 (full style)
          const oldState = persistedState as {
            highlightColor?: string;
            fontFamily?: FontId;
          };
          return {
            currentStyle: {
              ...DEFAULT_SUBTITLE_STYLE,
              highlightColor: oldState.highlightColor ?? DEFAULT_SUBTITLE_STYLE.highlightColor,
              fontFamily: oldState.fontFamily ?? DEFAULT_SUBTITLE_STYLE.fontFamily,
            },
            presets: DEFAULT_PRESETS,
            highlightColor: oldState.highlightColor ?? DEFAULT_SUBTITLE_STYLE.highlightColor,
            fontFamily: oldState.fontFamily ?? DEFAULT_SUBTITLE_STYLE.fontFamily,
          };
        }
        return persistedState;
      },
    }
  )
);

// Selector helpers
export const useHighlightColor = () =>
  useSubtitleStore((state) => state.highlightColor);

export const useFontFamily = () =>
  useSubtitleStore((state) => state.fontFamily);

export const useSubtitleStyle = () =>
  useSubtitleStore((state) => state.currentStyle);

export const useSubtitlePresets = () =>
  useSubtitleStore((state) => state.presets);
