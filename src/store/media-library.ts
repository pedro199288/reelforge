import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  saveHandle,
  deleteHandle,
  clearAllHandles,
  loadAllHandles,
} from "@/lib/media-storage";

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
  _hydrated: boolean;
  _pendingPermissionIds: string[];
  importFiles: (
    entries: Array<{ handle: FileSystemFileHandle; file: File }>
  ) => void;
  removeItem: (id: string) => void;
  clearAll: () => void;
  hydrateBlobs: () => Promise<{
    urlMap: Map<string, string>;
    needsPermission: boolean;
  }>;
  requestFileAccess: () => Promise<Map<string, string>>;
}

// ─── Helpers ────────────────────────────────────────────────────────

function classifyMimeType(mime: string): ImportedMediaType | null {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  return null;
}

// ─── Store ──────────────────────────────────────────────────────────

export const useMediaLibraryStore = create<MediaLibraryStore>()(
  persist(
    (set, get) => ({
      items: [],
      _hydrated: false,
      _pendingPermissionIds: [],

      importFiles: (entries) => {
        const newItems: ImportedMedia[] = [];
        for (const { handle, file } of entries) {
          const type = classifyMimeType(file.type);
          if (!type) continue;
          const id = crypto.randomUUID();
          newItems.push({
            id,
            name: file.name,
            type,
            blobUrl: URL.createObjectURL(file),
            size: file.size,
          });
          // Fire-and-forget: persist handle to IndexedDB
          saveHandle(id, handle);
        }
        if (newItems.length > 0) {
          set((s) => ({ items: [...s.items, ...newItems] }));
        }
      },

      removeItem: (id) =>
        set((s) => {
          const item = s.items.find((i) => i.id === id);
          if (item) URL.revokeObjectURL(item.blobUrl);
          // Fire-and-forget: remove handle from IndexedDB
          deleteHandle(id);
          return {
            items: s.items.filter((i) => i.id !== id),
            _pendingPermissionIds: s._pendingPermissionIds.filter(
              (pid) => pid !== id
            ),
          };
        }),

      clearAll: () =>
        set((s) => {
          for (const item of s.items) URL.revokeObjectURL(item.blobUrl);
          // Fire-and-forget: clear all handles from IndexedDB
          clearAllHandles();
          return { items: [], _pendingPermissionIds: [] };
        }),

      hydrateBlobs: async () => {
        const urlMap = new Map<string, string>();
        const handles = await loadAllHandles();
        const currentItems = get().items;

        const hydratedItems: ImportedMedia[] = [];
        const pendingIds: string[] = [];

        for (const item of currentItems) {
          const handle = handles.get(item.id);
          if (!handle) {
            // Handle missing from IndexedDB — discard item
            continue;
          }

          try {
            const permission = await handle.queryPermission({ mode: "read" });
            if (permission === "granted") {
              const file = await handle.getFile();
              const freshUrl = URL.createObjectURL(file);
              urlMap.set(item.blobUrl, freshUrl);
              hydratedItems.push({ ...item, blobUrl: freshUrl });
            } else {
              // 'prompt' or 'denied' — needs user gesture
              pendingIds.push(item.id);
              hydratedItems.push(item);
            }
          } catch {
            // File moved/deleted — discard item, clean up handle
            deleteHandle(item.id);
          }
        }

        set({
          items: hydratedItems,
          _hydrated: true,
          _pendingPermissionIds: pendingIds,
        });
        return { urlMap, needsPermission: pendingIds.length > 0 };
      },

      requestFileAccess: async () => {
        const urlMap = new Map<string, string>();
        const handles = await loadAllHandles();
        const { _pendingPermissionIds: pendingIds, items } = get();

        const resolvedIds: string[] = [];
        const stillPending: string[] = [];
        const updatedItems = [...items];

        for (const id of pendingIds) {
          const handle = handles.get(id);
          if (!handle) continue;

          try {
            const permission = await handle.requestPermission({ mode: "read" });
            if (permission === "granted") {
              const file = await handle.getFile();
              const freshUrl = URL.createObjectURL(file);
              const idx = updatedItems.findIndex((i) => i.id === id);
              if (idx !== -1) {
                urlMap.set(updatedItems[idx].blobUrl, freshUrl);
                updatedItems[idx] = { ...updatedItems[idx], blobUrl: freshUrl };
              }
              resolvedIds.push(id);
            } else {
              stillPending.push(id);
            }
          } catch {
            // File moved/deleted — discard
            const idx = updatedItems.findIndex((i) => i.id === id);
            if (idx !== -1) updatedItems.splice(idx, 1);
            deleteHandle(id);
          }
        }

        set({
          items: updatedItems,
          _pendingPermissionIds: stillPending,
        });
        return urlMap;
      },
    }),
    {
      name: "reelforge-media-library",
      partialize: (state) => ({ items: state.items }),
    }
  )
);
