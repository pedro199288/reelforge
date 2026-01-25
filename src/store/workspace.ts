import { create } from "zustand";
import { persist } from "zustand/middleware";
import { temporal, type TemporalState } from "zundo";

export interface PipelineConfig {
  thresholdDb: number;
  minDurationSec: number;
  paddingSec: number;
  autoSelectTakes: boolean;
}

export interface TakeSelection {
  videoId: string;
  /** phraseGroupId -> selectedTakeIndex */
  selections: Record<string, number>;
  autoSelected: boolean;
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

  // Selecciones de tomas (videoId -> TakeSelection)
  takeSelections: Record<string, TakeSelection>;

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

  // Actions - Take Selections
  setTakeSelection: (videoId: string, phraseGroupId: string, takeIndex: number) => void;
  setAllTakeSelections: (videoId: string, selections: Record<string, number>, autoSelected: boolean) => void;
  clearTakeSelections: (videoId: string) => void;
}

const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  thresholdDb: -40,
  minDurationSec: 0.5,
  paddingSec: 0.05,
  autoSelectTakes: false,
};

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    temporal(
      (set) => ({
        // Initial state
        selections: {},
        pipelineConfig: DEFAULT_PIPELINE_CONFIG,
        renderHistory: [],
        takeSelections: {},

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
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [videoId]: _removed, ...rest } = state.selections;
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

        // Take selection actions
        setTakeSelection: (videoId, phraseGroupId, takeIndex) =>
          set((state) => {
            const current = state.takeSelections[videoId] || {
              videoId,
              selections: {},
              autoSelected: false,
            };
            return {
              takeSelections: {
                ...state.takeSelections,
                [videoId]: {
                  ...current,
                  selections: {
                    ...current.selections,
                    [phraseGroupId]: takeIndex,
                  },
                  autoSelected: false,
                },
              },
            };
          }),

        setAllTakeSelections: (videoId, selections, autoSelected) =>
          set((state) => ({
            takeSelections: {
              ...state.takeSelections,
              [videoId]: {
                videoId,
                selections,
                autoSelected,
              },
            },
          })),

        clearTakeSelections: (videoId) =>
          set((state) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [videoId]: _removed, ...rest } = state.takeSelections;
            return { takeSelections: rest };
          }),
      }),
      {
        // Limit history to 50 actions
        limit: 50,
        // Only track changes to selections and takeSelections (user-reversible actions)
        // Exclude pipelineConfig and renderHistory from undo/redo
        partialize: (state) => ({
          selections: state.selections,
          takeSelections: state.takeSelections,
        }),
        // Equality check to avoid duplicate history entries
        equality: (pastState, currentState) =>
          JSON.stringify(pastState) === JSON.stringify(currentState),
      }
    ),
    {
      name: "reelforge-workspace",
    }
  )
);

// Temporal store hook for undo/redo
export const useTemporalStore = <T>(
  selector: (state: TemporalState<Pick<WorkspaceStore, "selections" | "takeSelections">>) => T
) => useWorkspaceStore.temporal(selector);

// Convenience hooks for undo/redo
export const useUndo = () => useTemporalStore((state) => state.undo);
export const useRedo = () => useTemporalStore((state) => state.redo);
export const useCanUndo = () =>
  useTemporalStore((state) => state.pastStates.length > 0);
export const useCanRedo = () =>
  useTemporalStore((state) => state.futureStates.length > 0);
export const useClearHistory = () => useTemporalStore((state) => state.clear);

// Selector helpers
export const useSelection = (videoId: string) =>
  useWorkspaceStore((state) => state.selections[videoId] || []);

export const usePipelineConfig = () =>
  useWorkspaceStore((state) => state.pipelineConfig);

export const useRenderHistory = () =>
  useWorkspaceStore((state) => state.renderHistory);

export const useTakeSelections = (videoId: string) =>
  useWorkspaceStore((state) => state.takeSelections[videoId]);
