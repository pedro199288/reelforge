import { create } from "zustand";

// ─── Types ──────────────────────────────────────────────────────────

export type ImportedMediaType = "video" | "audio" | "image";

export interface ImportedMedia {
  id: string;
  name: string;
  type: ImportedMediaType;
  blobUrl: string;
  size: number;
}

interface MediaLibraryStore {
  items: ImportedMedia[];
  importFiles: (files: FileList) => void;
  removeItem: (id: string) => void;
  clearAll: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────

function classifyMimeType(mime: string): ImportedMediaType | null {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  return null;
}

// ─── Store ──────────────────────────────────────────────────────────

export const useMediaLibraryStore = create<MediaLibraryStore>()((set) => ({
  items: [],

  importFiles: (files) => {
    const newItems: ImportedMedia[] = [];
    for (const file of Array.from(files)) {
      const type = classifyMimeType(file.type);
      if (!type) continue;
      newItems.push({
        id: crypto.randomUUID(),
        name: file.name,
        type,
        blobUrl: URL.createObjectURL(file),
        size: file.size,
      });
    }
    if (newItems.length > 0) {
      set((s) => ({ items: [...s.items, ...newItems] }));
    }
  },

  removeItem: (id) =>
    set((s) => {
      const item = s.items.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.blobUrl);
      return { items: s.items.filter((i) => i.id !== id) };
    }),

  clearAll: () =>
    set((s) => {
      for (const item of s.items) URL.revokeObjectURL(item.blobUrl);
      return { items: [] };
    }),
}));
