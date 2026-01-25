import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  setHighlightColor: (color: string) => void;
}

export const useSubtitleStore = create<SubtitleStore>()(
  persist(
    (set) => ({
      highlightColor: DEFAULT_HIGHLIGHT_COLOR,
      setHighlightColor: (color) => set({ highlightColor: color }),
    }),
    {
      name: "reelforge-subtitles",
    }
  )
);

export const useHighlightColor = () =>
  useSubtitleStore((state) => state.highlightColor);
