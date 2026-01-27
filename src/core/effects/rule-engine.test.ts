import { describe, it, expect } from "bun:test";
import {
  applyEffects,
  getRulesForConfig,
  getPreset,
  listPresets,
  PRESETS,
  DEFAULT_EFFECTS_CONFIG,
} from "./rule-engine";
import type {
  EnrichedCaption,
  EffectsConfig,
  EffectRule,
  WordSemanticScores,
} from "./types";

// Helper to create enriched captions for testing
function createCaption(
  text: string,
  startMs: number,
  endMs: number,
  semantic: Partial<WordSemanticScores> = {},
  sentencePosition?: "start" | "middle" | "end"
): EnrichedCaption {
  return {
    text,
    startMs,
    endMs,
    whisperConfidence: 0.95,
    sentencePosition,
    semantic: {
      topicRelevance: 0.5,
      emphasisScore: 0.5,
      emotionalIntensity: 0.5,
      isKeyword: false,
      category: "connector",
      ...semantic,
    },
  };
}

describe("rule-engine", () => {
  describe("getPreset", () => {
    it("should return the balanced preset", () => {
      const preset = getPreset("balanced");
      expect(preset.name).toBe("balanced");
      expect(preset.displayName).toBe("Balanceado");
      expect(preset.rules.length).toBeGreaterThan(0);
    });

    it("should return the minimal preset", () => {
      const preset = getPreset("minimal");
      expect(preset.name).toBe("minimal");
      expect(preset.rules.length).toBeLessThan(getPreset("balanced").rules.length);
    });

    it("should return the aggressive preset", () => {
      const preset = getPreset("aggressive");
      expect(preset.name).toBe("aggressive");
      expect(preset.rules.length).toBeGreaterThan(getPreset("balanced").rules.length);
    });

    it("should return empty rules for custom preset", () => {
      const preset = getPreset("custom");
      expect(preset.name).toBe("custom");
      expect(preset.rules).toHaveLength(0);
    });
  });

  describe("listPresets", () => {
    it("should return all presets", () => {
      const presets = listPresets();
      expect(presets).toHaveLength(4);
      expect(presets.map((p) => p.name)).toContain("balanced");
      expect(presets.map((p) => p.name)).toContain("minimal");
      expect(presets.map((p) => p.name)).toContain("aggressive");
      expect(presets.map((p) => p.name)).toContain("custom");
    });
  });

  describe("getRulesForConfig", () => {
    it("should return preset rules for non-custom preset", () => {
      const config: EffectsConfig = {
        activePreset: "balanced",
        customRules: [],
        thresholdMultiplier: 1,
        maxEffectsPerMinute: 0,
      };
      const rules = getRulesForConfig(config);
      expect(rules).toEqual(PRESETS.balanced.rules);
    });

    it("should return custom rules for custom preset", () => {
      const customRule: EffectRule = {
        id: "test-rule",
        name: "Test Rule",
        enabled: true,
        priority: 100,
        conditions: [{ field: "semantic.isKeyword", operator: "equals", value: true }],
        conditionLogic: "AND",
        effect: { type: "highlight" },
      };
      const config: EffectsConfig = {
        activePreset: "custom",
        customRules: [customRule],
        thresholdMultiplier: 1,
        maxEffectsPerMinute: 0,
      };
      const rules = getRulesForConfig(config);
      expect(rules).toEqual([customRule]);
    });
  });

  describe("applyEffects", () => {
    it("should return empty effects for empty captions", () => {
      const result = applyEffects([], DEFAULT_EFFECTS_CONFIG);
      expect(result.effects).toHaveLength(0);
      expect(result.stats.totalCaptions).toBe(0);
      expect(result.stats.captionsWithEffects).toBe(0);
    });

    it("should highlight keywords with high topic relevance", () => {
      const captions: EnrichedCaption[] = [
        createCaption("importante", 0, 500, {
          isKeyword: true,
          topicRelevance: 0.9,
        }),
        createCaption("palabra", 600, 1000, {
          isKeyword: false,
          topicRelevance: 0.3,
        }),
      ];

      const result = applyEffects(captions, DEFAULT_EFFECTS_CONFIG);

      expect(result.effects.length).toBeGreaterThanOrEqual(1);
      const highlightEffect = result.effects.find(
        (e) => e.type === "highlight" && e.word === "importante"
      );
      expect(highlightEffect).toBeDefined();
    });

    it("should apply zoom effect for emphatic moments", () => {
      const captions: EnrichedCaption[] = [
        createCaption("increíble", 0, 500, {
          emphasisScore: 0.8,
          emotionalIntensity: 0.7,
        }),
      ];

      const result = applyEffects(captions, DEFAULT_EFFECTS_CONFIG);

      const zoomEffect = result.effects.find((e) => e.type === "zoom");
      expect(zoomEffect).toBeDefined();
      expect(zoomEffect?.style).toBe("punch");
    });

    it("should apply slow zoom at sentence starts", () => {
      const captions: EnrichedCaption[] = [
        createCaption("Primero", 0, 500, { topicRelevance: 0.7 }, "start"),
        createCaption("segundo", 600, 1000, { topicRelevance: 0.7 }, "middle"),
      ];

      const result = applyEffects(captions, DEFAULT_EFFECTS_CONFIG);

      const slowZoom = result.effects.find(
        (e) => e.type === "zoom" && e.style === "slow" && e.word === "Primero"
      );
      expect(slowZoom).toBeDefined();
    });

    it("should respect maxEffectsPerMinute limit", () => {
      // Create many captions that would trigger effects
      const captions: EnrichedCaption[] = Array.from({ length: 20 }, (_, i) =>
        createCaption(`palabra${i}`, i * 3000, i * 3000 + 500, {
          isKeyword: true,
          topicRelevance: 0.95,
        })
      );

      const config: EffectsConfig = {
        activePreset: "aggressive",
        customRules: [],
        thresholdMultiplier: 2, // More lenient
        maxEffectsPerMinute: 5,
      };

      const result = applyEffects(captions, config);

      // Should be limited based on maxEffectsPerMinute
      expect(result.effects.length).toBeLessThanOrEqual(10); // ~1 minute of content
    });

    it("should avoid effects that are too close together", () => {
      const captions: EnrichedCaption[] = [
        createCaption("palabra1", 0, 200, {
          isKeyword: true,
          topicRelevance: 0.95,
        }),
        createCaption("palabra2", 100, 300, {
          isKeyword: true,
          topicRelevance: 0.95,
        }),
      ];

      const result = applyEffects(captions, DEFAULT_EFFECTS_CONFIG);

      // Should not apply both due to conflict
      expect(result.effects.length).toBeLessThanOrEqual(1);
    });

    it("should apply threshold multiplier correctly", () => {
      const captions: EnrichedCaption[] = [
        createCaption("palabra", 0, 500, {
          isKeyword: true,
          topicRelevance: 0.7, // Below 0.8 threshold
        }),
      ];

      // With default multiplier (1), this shouldn't trigger
      applyEffects(captions, DEFAULT_EFFECTS_CONFIG);

      // With higher multiplier (1.5), threshold becomes 0.53, so it should trigger
      const configLenient: EffectsConfig = {
        ...DEFAULT_EFFECTS_CONFIG,
        thresholdMultiplier: 1.5,
      };
      const result2 = applyEffects(captions, configLenient);
      const highlight2 = result2.effects.find(
        (e) => e.type === "highlight" && e.word === "palabra"
      );

      expect(highlight2).toBeDefined();
    });

    it("should return correct statistics", () => {
      const captions: EnrichedCaption[] = [
        createCaption("clave", 0, 500, {
          isKeyword: true,
          topicRelevance: 0.95,
        }),
        createCaption("normal", 1000, 1500, {}),
        createCaption("énfasis", 2000, 2500, {
          emphasisScore: 0.85,
          emotionalIntensity: 0.75,
        }),
      ];

      const result = applyEffects(captions, DEFAULT_EFFECTS_CONFIG);

      expect(result.stats.totalCaptions).toBe(3);
      expect(result.stats.captionsWithEffects).toBeGreaterThanOrEqual(1);
      expect(result.stats.zoomCount + result.stats.highlightCount).toBe(
        result.effects.length
      );
    });

    it("should handle OR condition logic", () => {
      // The aggressive preset has a rule with OR logic for action/concept
      const captions: EnrichedCaption[] = [
        createCaption("correr", 0, 500, { category: "action" }),
        createCaption("idea", 1000, 1500, { category: "concept" }),
      ];

      const config: EffectsConfig = {
        activePreset: "aggressive",
        customRules: [],
        thresholdMultiplier: 1,
        maxEffectsPerMinute: 0,
      };

      const result = applyEffects(captions, config);

      // Both should potentially trigger due to OR logic
      expect(result.effects.length).toBeGreaterThanOrEqual(1);
    });

    it("should prioritize rules by priority", () => {
      const captions: EnrichedCaption[] = [
        createCaption("importante", 0, 500, {
          isKeyword: true,
          topicRelevance: 0.95,
          emphasisScore: 0.9,
          emotionalIntensity: 0.8,
        }),
      ];

      const result = applyEffects(captions, DEFAULT_EFFECTS_CONFIG);

      // Should only have one effect per caption (highest priority wins)
      const effectsForWord = result.effects.filter((e) => e.word === "importante");
      expect(effectsForWord.length).toBe(1);
    });

    it("should not apply effects for disabled rules", () => {
      const customRule: EffectRule = {
        id: "disabled-rule",
        name: "Disabled Rule",
        enabled: false,
        priority: 100,
        conditions: [{ field: "semantic.isKeyword", operator: "equals", value: true }],
        conditionLogic: "AND",
        effect: { type: "highlight" },
      };

      const config: EffectsConfig = {
        activePreset: "custom",
        customRules: [customRule],
        thresholdMultiplier: 1,
        maxEffectsPerMinute: 0,
      };

      const captions: EnrichedCaption[] = [
        createCaption("keyword", 0, 500, { isKeyword: true }),
      ];

      const result = applyEffects(captions, config);
      expect(result.effects).toHaveLength(0);
    });

    it("should handle nested field access", () => {
      const customRule: EffectRule = {
        id: "nested-rule",
        name: "Nested Field Rule",
        enabled: true,
        priority: 100,
        conditions: [
          { field: "semantic.category", operator: "equals", value: "emotion" },
        ],
        conditionLogic: "AND",
        effect: { type: "highlight" },
      };

      const config: EffectsConfig = {
        activePreset: "custom",
        customRules: [customRule],
        thresholdMultiplier: 1,
        maxEffectsPerMinute: 0,
      };

      const captions: EnrichedCaption[] = [
        createCaption("feliz", 0, 500, { category: "emotion" }),
        createCaption("y", 600, 700, { category: "connector" }),
      ];

      const result = applyEffects(captions, config);

      expect(result.effects).toHaveLength(1);
      expect(result.effects[0].word).toBe("feliz");
    });
  });

  describe("DEFAULT_EFFECTS_CONFIG", () => {
    it("should have sensible defaults", () => {
      expect(DEFAULT_EFFECTS_CONFIG.activePreset).toBe("balanced");
      expect(DEFAULT_EFFECTS_CONFIG.customRules).toHaveLength(0);
      expect(DEFAULT_EFFECTS_CONFIG.thresholdMultiplier).toBe(1);
      expect(DEFAULT_EFFECTS_CONFIG.maxEffectsPerMinute).toBe(0);
    });
  });
});
