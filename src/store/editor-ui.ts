import { create } from "zustand";
import { persist } from "zustand/middleware";

// --- Types ---

export type VideoSource = "original" | "cut" | "preview";

export type EditorSelection =
  | { type: "segment"; id: string }
  | { type: "caption"; index: number; pageIndex: number }
  | { type: "effect"; id: string }
  | null;

export type PropertiesPanelTab = "auto" | "script" | "logs";

export type TrackType = "segments" | "subtitles" | "effects";

// --- Store ---

interface EditorUIStore {
  // Video source (replaces viewMode)
  videoSource: VideoSource;
  setVideoSource: (s: VideoSource) => void;

  // Unified selection (across all tracks)
  selection: EditorSelection;
  setSelection: (sel: EditorSelection) => void;
  clearSelection: () => void;

  // Properties panel
  propertiesPanelOpen: boolean;
  propertiesPanelTab: PropertiesPanelTab;
  togglePropertiesPanel: () => void;
  setPropertiesPanelOpen: (open: boolean) => void;
  setPropertiesPanelTab: (tab: PropertiesPanelTab) => void;

  // Pipeline drawer
  pipelineDrawerOpen: boolean;
  setPipelineDrawerOpen: (open: boolean) => void;
  togglePipelineDrawer: () => void;

  // Timeline track visibility
  visibleTracks: Set<TrackType>;
  toggleTrack: (track: TrackType) => void;

  // Last manual tab (restored when deselecting)
  _lastManualTab: PropertiesPanelTab;
}

export const useEditorUIStore = create<EditorUIStore>()(
  persist(
    (set, get) => ({
      // Video source
      videoSource: "original",
      setVideoSource: (videoSource) => set({ videoSource }),

      // Selection
      selection: null,
      setSelection: (selection) => {
        const state = get();
        if (selection) {
          // Auto-open properties panel and switch to auto tab
          set({
            selection,
            propertiesPanelOpen: true,
            propertiesPanelTab: "auto",
          });
        } else {
          // Restore last manual tab when deselecting
          set({
            selection: null,
            propertiesPanelTab: state._lastManualTab,
          });
        }
      },
      clearSelection: () => {
        const state = get();
        set({
          selection: null,
          propertiesPanelTab: state._lastManualTab,
        });
      },

      // Properties panel
      propertiesPanelOpen: true,
      propertiesPanelTab: "auto",
      togglePropertiesPanel: () =>
        set((s) => ({ propertiesPanelOpen: !s.propertiesPanelOpen })),
      setPropertiesPanelOpen: (open) => set({ propertiesPanelOpen: open }),
      setPropertiesPanelTab: (tab) => {
        if (tab !== "auto") {
          set({ propertiesPanelTab: tab, _lastManualTab: tab });
        } else {
          set({ propertiesPanelTab: tab });
        }
      },

      // Pipeline drawer
      pipelineDrawerOpen: false,
      setPipelineDrawerOpen: (open) => set({ pipelineDrawerOpen: open }),
      togglePipelineDrawer: () =>
        set((s) => ({ pipelineDrawerOpen: !s.pipelineDrawerOpen })),

      // Track visibility
      visibleTracks: new Set(["segments", "subtitles"] as TrackType[]),
      toggleTrack: (track) =>
        set((s) => {
          const next = new Set(s.visibleTracks);
          if (next.has(track)) {
            next.delete(track);
          } else {
            next.add(track);
          }
          return { visibleTracks: next };
        }),

      // Internal
      _lastManualTab: "script",
    }),
    {
      name: "reelforge-editor-ui",
      partialize: (state) => ({
        propertiesPanelOpen: state.propertiesPanelOpen,
        videoSource: state.videoSource,
      }),
    }
  )
);

// --- Selector hooks ---

export const useVideoSource = () =>
  useEditorUIStore((s) => s.videoSource);
export const useEditorSelection = () =>
  useEditorUIStore((s) => s.selection);
export const usePropertiesPanelOpen = () =>
  useEditorUIStore((s) => s.propertiesPanelOpen);
export const usePropertiesPanelTab = () =>
  useEditorUIStore((s) => s.propertiesPanelTab);
export const usePipelineDrawerOpen = () =>
  useEditorUIStore((s) => s.pipelineDrawerOpen);
