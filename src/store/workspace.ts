import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PipelineConfig {
  thresholdDb: number;
  minDurationSec: number;
  paddingSec: number;
}

export interface RenderEntry {
  videoId: string;
  timestamp: string;
  outputPath: string;
}

interface WorkspaceStore {
  // Selecciones por video (videoId -> indices seleccionados)
  selections: Record<string, number[]>;

  // Config pipeline (persiste entre videos)
  pipelineConfig: PipelineConfig;

  // Historial de renders
  renderHistory: RenderEntry[];

  // Actions - Selections
  setSelection: (videoId: string, indices: number[]) => void;
  toggleSegment: (videoId: string, index: number) => void;
  clearSelection: (videoId: string) => void;

  // Actions - Pipeline Config
  setPipelineConfig: (config: Partial<PipelineConfig>) => void;
  resetPipelineConfig: () => void;

  // Actions - Render History
  addRender: (entry: RenderEntry) => void;
  clearRenderHistory: () => void;
}

const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  thresholdDb: -40,
  minDurationSec: 0.5,
  paddingSec: 0.05,
};

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set) => ({
      // Initial state
      selections: {},
      pipelineConfig: DEFAULT_PIPELINE_CONFIG,
      renderHistory: [],

      // Selection actions
      setSelection: (videoId, indices) =>
        set((state) => ({
          selections: {
            ...state.selections,
            [videoId]: indices,
          },
        })),

      toggleSegment: (videoId, index) =>
        set((state) => {
          const current = state.selections[videoId] || [];
          const exists = current.includes(index);
          const updated = exists
            ? current.filter((i) => i !== index)
            : [...current, index].sort((a, b) => a - b);

          return {
            selections: {
              ...state.selections,
              [videoId]: updated,
            },
          };
        }),

      clearSelection: (videoId) =>
        set((state) => {
          const { [videoId]: _, ...rest } = state.selections;
          return { selections: rest };
        }),

      // Pipeline config actions
      setPipelineConfig: (config) =>
        set((state) => ({
          pipelineConfig: {
            ...state.pipelineConfig,
            ...config,
          },
        })),

      resetPipelineConfig: () =>
        set({ pipelineConfig: DEFAULT_PIPELINE_CONFIG }),

      // Render history actions
      addRender: (entry) =>
        set((state) => ({
          renderHistory: [...state.renderHistory, entry],
        })),

      clearRenderHistory: () => set({ renderHistory: [] }),
    }),
    {
      name: "reelforge-workspace",
    }
  )
);

// Selector helpers
export const useSelection = (videoId: string) =>
  useWorkspaceStore((state) => state.selections[videoId] || []);

export const usePipelineConfig = () =>
  useWorkspaceStore((state) => state.pipelineConfig);

export const useRenderHistory = () =>
  useWorkspaceStore((state) => state.renderHistory);
