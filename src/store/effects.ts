/**
 * Zustand store for effects configuration
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  EffectsConfig,
  PresetName,
  EffectRule,
  EffectsAnalysisResult,
  EffectsApplicationResult,
} from "@/core/effects/types";
import { DEFAULT_EFFECTS_CONFIG, applyEffects, getRulesForConfig } from "@/core/effects/rule-engine";

interface EffectsState {
  // Configuration
  config: EffectsConfig;

  // Cached analysis results per video
  analysisResults: Record<string, EffectsAnalysisResult>;

  // Cached application results per video (regenerated when config changes)
  applicationResults: Record<string, EffectsApplicationResult>;

  // UI state
  previewEnabled: boolean;
  selectedRuleId: string | null;

  // Actions - Configuration
  setPreset: (preset: PresetName) => void;
  setThresholdMultiplier: (multiplier: number) => void;
  setMaxEffectsPerMinute: (max: number) => void;

  // Actions - Custom Rules
  addCustomRule: (rule: EffectRule) => void;
  updateCustomRule: (id: string, updates: Partial<EffectRule>) => void;
  removeCustomRule: (id: string) => void;
  toggleCustomRule: (id: string) => void;
  reorderCustomRules: (fromIndex: number, toIndex: number) => void;

  // Actions - Analysis Results
  setAnalysisResult: (videoId: string, result: EffectsAnalysisResult) => void;
  clearAnalysisResult: (videoId: string) => void;
  getAnalysisResult: (videoId: string) => EffectsAnalysisResult | null;

  // Actions - Application Results
  recomputeEffects: (videoId: string) => EffectsApplicationResult | null;
  getApplicationResult: (videoId: string) => EffectsApplicationResult | null;

  // Actions - UI
  setPreviewEnabled: (enabled: boolean) => void;
  selectRule: (ruleId: string | null) => void;

  // Helpers
  getRules: () => EffectRule[];
  resetConfig: () => void;
}

export const useEffectsStore = create<EffectsState>()(
  persist(
    (set, get) => ({
      // Initial state
      config: DEFAULT_EFFECTS_CONFIG,
      analysisResults: {},
      applicationResults: {},
      previewEnabled: true,
      selectedRuleId: null,

      // Configuration actions
      setPreset: (preset) => {
        set((state) => ({
          config: { ...state.config, activePreset: preset },
          // Clear application results to force recomputation
          applicationResults: {},
        }));
      },

      setThresholdMultiplier: (multiplier) => {
        set((state) => ({
          config: { ...state.config, thresholdMultiplier: multiplier },
          applicationResults: {},
        }));
      },

      setMaxEffectsPerMinute: (max) => {
        set((state) => ({
          config: { ...state.config, maxEffectsPerMinute: max },
          applicationResults: {},
        }));
      },

      // Custom rules actions
      addCustomRule: (rule) => {
        set((state) => ({
          config: {
            ...state.config,
            customRules: [...state.config.customRules, rule],
          },
          applicationResults: {},
        }));
      },

      updateCustomRule: (id, updates) => {
        set((state) => ({
          config: {
            ...state.config,
            customRules: state.config.customRules.map((rule) =>
              rule.id === id ? { ...rule, ...updates } : rule
            ),
          },
          applicationResults: {},
        }));
      },

      removeCustomRule: (id) => {
        set((state) => ({
          config: {
            ...state.config,
            customRules: state.config.customRules.filter((rule) => rule.id !== id),
          },
          applicationResults: {},
        }));
      },

      toggleCustomRule: (id) => {
        set((state) => ({
          config: {
            ...state.config,
            customRules: state.config.customRules.map((rule) =>
              rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
            ),
          },
          applicationResults: {},
        }));
      },

      reorderCustomRules: (fromIndex, toIndex) => {
        set((state) => {
          const rules = [...state.config.customRules];
          const [removed] = rules.splice(fromIndex, 1);
          rules.splice(toIndex, 0, removed);
          return {
            config: { ...state.config, customRules: rules },
            applicationResults: {},
          };
        });
      },

      // Analysis results actions
      setAnalysisResult: (videoId, result) => {
        set((state) => ({
          analysisResults: { ...state.analysisResults, [videoId]: result },
          // Also compute application results immediately
          applicationResults: {
            ...state.applicationResults,
            [videoId]: applyEffects(result.enrichedCaptions, state.config),
          },
        }));
      },

      clearAnalysisResult: (videoId) => {
        set((state) => {
          const { [videoId]: _, ...rest } = state.analysisResults;
          const { [videoId]: __, ...appRest } = state.applicationResults;
          return {
            analysisResults: rest,
            applicationResults: appRest,
          };
        });
      },

      getAnalysisResult: (videoId) => {
        return get().analysisResults[videoId] ?? null;
      },

      // Application results actions
      recomputeEffects: (videoId) => {
        const state = get();
        const analysis = state.analysisResults[videoId];
        if (!analysis) return null;

        const result = applyEffects(analysis.enrichedCaptions, state.config);
        set((s) => ({
          applicationResults: { ...s.applicationResults, [videoId]: result },
        }));
        return result;
      },

      getApplicationResult: (videoId) => {
        const state = get();
        const cached = state.applicationResults[videoId];
        if (cached) return cached;

        // Try to compute if we have analysis
        const analysis = state.analysisResults[videoId];
        if (analysis) {
          const result = applyEffects(analysis.enrichedCaptions, state.config);
          set((s) => ({
            applicationResults: { ...s.applicationResults, [videoId]: result },
          }));
          return result;
        }

        return null;
      },

      // UI actions
      setPreviewEnabled: (enabled) => {
        set({ previewEnabled: enabled });
      },

      selectRule: (ruleId) => {
        set({ selectedRuleId: ruleId });
      },

      // Helpers
      getRules: () => {
        return getRulesForConfig(get().config);
      },

      resetConfig: () => {
        set({
          config: DEFAULT_EFFECTS_CONFIG,
          applicationResults: {},
        });
      },
    }),
    {
      name: "reelforge-effects",
      // Only persist config and analysis results
      partialize: (state) => ({
        config: state.config,
        analysisResults: state.analysisResults,
      }),
    }
  )
);

// Selector hooks for common use cases
export const useEffectsConfig = () => useEffectsStore((state) => state.config);
export const useActivePreset = () => useEffectsStore((state) => state.config.activePreset);
export const usePreviewEnabled = () => useEffectsStore((state) => state.previewEnabled);

export const useVideoAnalysis = (videoId: string) =>
  useEffectsStore((state) => state.analysisResults[videoId] ?? null);

export const useVideoEffects = (videoId: string) =>
  useEffectsStore((state) => state.applicationResults[videoId] ?? null);
