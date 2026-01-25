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

export const DEFAULT_HIGHLIGHT_COLOR = "#39E508";

interface SubtitleStore {
  highlightColor: string;
  fontFamily: FontId;
  setHighlightColor: (color: string) => void;
  setFontFamily: (font: FontId) => void;
}

export const useSubtitleStore = create<SubtitleStore>()(
  persist(
    (set) => ({
      highlightColor: DEFAULT_HIGHLIGHT_COLOR,
      fontFamily: DEFAULT_FONT,
      setHighlightColor: (color) => set({ highlightColor: color }),
      setFontFamily: (font) => set({ fontFamily: font }),
    }),
    {
      name: "reelforge-subtitles",
    }
  )
);

export const useHighlightColor = () =>
  useSubtitleStore((state) => state.highlightColor);

export const useFontFamily = () =>
  useSubtitleStore((state) => state.fontFamily);
