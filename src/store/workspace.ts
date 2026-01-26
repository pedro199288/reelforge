import { create } from "zustand";
import { persist } from "zustand/middleware";
import { temporal, type TemporalState } from "zundo";

export interface SilenceDetectionConfig {
  thresholdDb: number;
  minDurationSec: number;
  paddingSec: number;
}

export type TakeSelectionCriteria = "clarity" | "fluency" | "energy" | "duration";

export interface TakeDetectionConfig {
  minSimilarity: number;
  autoSelectBest: boolean;
  selectionCriteria: TakeSelectionCriteria;
}

export type Resolution = "1080x1920" | "1080x1080" | "1920x1080";
export type FPS = 24 | 30 | 60;
export type RenderQuality = "low" | "medium" | "high";

export interface OutputConfig {
  maxDurationSec: number | null;
  resolution: Resolution;
  fps: FPS;
  quality: RenderQuality;
}

export interface PipelineConfig {
  silence: SilenceDetectionConfig;
  takes: TakeDetectionConfig;
  output: OutputConfig;
  /** @deprecated Use silence.thresholdDb */
  thresholdDb?: number;
  /** @deprecated Use silence.minDurationSec */
  minDurationSec?: number;
  /** @deprecated Use silence.paddingSec */
  paddingSec?: number;
  /** @deprecated Use takes.autoSelectBest */
  autoSelectTakes?: boolean;
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

export interface ConfigProfile {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  config: PipelineConfig;
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

  // Perfiles de configuracion
  profiles: ConfigProfile[];
  activeProfileId: string | null;

  // Config override por video
  videoConfigs: Record<string, Partial<PipelineConfig>>;

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

  // Actions - Profiles
  createProfile: (name: string, description?: string) => string;
  updateProfile: (id: string, updates: Partial<Omit<ConfigProfile, "id" | "createdAt">>) => void;
  deleteProfile: (id: string) => void;
  loadProfile: (id: string) => void;
  saveCurrentToProfile: (id: string) => void;

  // Actions - Video Config
  setVideoConfig: (videoId: string, config: Partial<PipelineConfig>) => void;
  clearVideoConfig: (videoId: string) => void;
  getEffectiveConfig: (videoId?: string) => PipelineConfig;
}

const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  silence: {
    thresholdDb: -40,
    minDurationSec: 0.5,
    paddingSec: 0.05,
  },
  takes: {
    minSimilarity: 80,
    autoSelectBest: false,
    selectionCriteria: "clarity",
  },
  output: {
    maxDurationSec: null,
    resolution: "1080x1920",
    fps: 30,
    quality: "high",
  },
};

const DEFAULT_PROFILES: ConfigProfile[] = [
  {
    id: "tiktok-vertical",
    name: "TikTok Vertical",
    description: "9:16, 30fps, silencios agresivos",
    createdAt: new Date().toISOString(),
    config: {
      silence: { thresholdDb: -35, minDurationSec: 0.3, paddingSec: 0.03 },
      takes: { minSimilarity: 80, autoSelectBest: true, selectionCriteria: "energy" },
      output: { maxDurationSec: 180, resolution: "1080x1920", fps: 30, quality: "high" },
    },
  },
  {
    id: "youtube-shorts",
    name: "YouTube Shorts",
    description: "9:16, 60fps, calidad alta",
    createdAt: new Date().toISOString(),
    config: {
      silence: { thresholdDb: -40, minDurationSec: 0.4, paddingSec: 0.05 },
      takes: { minSimilarity: 85, autoSelectBest: true, selectionCriteria: "clarity" },
      output: { maxDurationSec: 60, resolution: "1080x1920", fps: 60, quality: "high" },
    },
  },
  {
    id: "instagram-reels",
    name: "Instagram Reels",
    description: "9:16, 30fps, duracion 90s max",
    createdAt: new Date().toISOString(),
    config: {
      silence: { thresholdDb: -38, minDurationSec: 0.4, paddingSec: 0.04 },
      takes: { minSimilarity: 80, autoSelectBest: true, selectionCriteria: "fluency" },
      output: { maxDurationSec: 90, resolution: "1080x1920", fps: 30, quality: "high" },
    },
  },
];

let profileIdCounter = 0;
const generateProfileId = () => `profile-${Date.now()}-${++profileIdCounter}`;

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    temporal(
      (set, get) => ({
        // Initial state
        selections: {},
        pipelineConfig: DEFAULT_PIPELINE_CONFIG,
        renderHistory: [],
        takeSelections: {},
        profiles: DEFAULT_PROFILES,
        activeProfileId: null,
        videoConfigs: {},

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

        // Profile actions
        createProfile: (name, description) => {
          const id = generateProfileId();
          const state = get();
          set({
            profiles: [
              ...state.profiles,
              {
                id,
                name,
                description,
                createdAt: new Date().toISOString(),
                config: { ...state.pipelineConfig },
              },
            ],
            activeProfileId: id,
          });
          return id;
        },

        updateProfile: (id, updates) =>
          set((state) => ({
            profiles: state.profiles.map((p) =>
              p.id === id ? { ...p, ...updates } : p
            ),
          })),

        deleteProfile: (id) =>
          set((state) => ({
            profiles: state.profiles.filter((p) => p.id !== id),
            activeProfileId: state.activeProfileId === id ? null : state.activeProfileId,
          })),

        loadProfile: (id) =>
          set((state) => {
            const profile = state.profiles.find((p) => p.id === id);
            if (!profile) return {};
            return {
              pipelineConfig: { ...profile.config },
              activeProfileId: id,
            };
          }),

        saveCurrentToProfile: (id) =>
          set((state) => ({
            profiles: state.profiles.map((p) =>
              p.id === id ? { ...p, config: { ...state.pipelineConfig } } : p
            ),
          })),

        // Video config actions
        setVideoConfig: (videoId, config) =>
          set((state) => ({
            videoConfigs: {
              ...state.videoConfigs,
              [videoId]: { ...state.videoConfigs[videoId], ...config },
            },
          })),

        clearVideoConfig: (videoId) =>
          set((state) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [videoId]: _removed, ...rest } = state.videoConfigs;
            return { videoConfigs: rest };
          }),

        getEffectiveConfig: (videoId) => {
          const state = get();
          if (!videoId) return state.pipelineConfig;
          const videoConfig = state.videoConfigs[videoId];
          if (!videoConfig) return state.pipelineConfig;
          return {
            silence: { ...state.pipelineConfig.silence, ...videoConfig.silence },
            takes: { ...state.pipelineConfig.takes, ...videoConfig.takes },
            output: { ...state.pipelineConfig.output, ...videoConfig.output },
          };
        },
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
