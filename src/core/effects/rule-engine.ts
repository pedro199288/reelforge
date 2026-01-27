/**
 * Deterministic rule engine for applying effects based on AI-enriched captions
 */

import type {
  EnrichedCaption,
  EffectRule,
  RuleCondition,
  ComparisonOperator,
  EffectsPreset,
  PresetName,
  EffectsConfig,
  AppliedEffect,
  EffectsApplicationResult,
} from "./types";

// --------------------
// Condition Evaluation
// --------------------

/**
 * Get a nested field value from an object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Compare two values using the specified operator
 */
function compareValues(
  actual: unknown,
  operator: ComparisonOperator,
  expected: string | number | boolean
): boolean {
  // Handle undefined/null
  if (actual === undefined || actual === null) {
    return operator === "notEquals" ? expected !== null && expected !== undefined : false;
  }

  // Type coercion for comparison
  const actualNum = typeof actual === "number" ? actual : parseFloat(String(actual));
  const expectedNum = typeof expected === "number" ? expected : parseFloat(String(expected));
  const useNumericComparison = !isNaN(actualNum) && !isNaN(expectedNum);

  switch (operator) {
    case "equals":
      return useNumericComparison ? actualNum === expectedNum : actual === expected;
    case "notEquals":
      return useNumericComparison ? actualNum !== expectedNum : actual !== expected;
    case "greaterThan":
      return useNumericComparison ? actualNum > expectedNum : false;
    case "greaterThanOrEqual":
      return useNumericComparison ? actualNum >= expectedNum : false;
    case "lessThan":
      return useNumericComparison ? actualNum < expectedNum : false;
    case "lessThanOrEqual":
      return useNumericComparison ? actualNum <= expectedNum : false;
    default:
      return false;
  }
}

/**
 * Evaluate a single condition against a caption
 */
function evaluateCondition(caption: EnrichedCaption, condition: RuleCondition): boolean {
  const value = getNestedValue(caption as unknown as Record<string, unknown>, condition.field);
  return compareValues(value, condition.operator, condition.value);
}

/**
 * Evaluate all conditions of a rule against a caption
 */
function evaluateRule(caption: EnrichedCaption, rule: EffectRule): boolean {
  if (!rule.enabled || rule.conditions.length === 0) {
    return false;
  }

  const results = rule.conditions.map((condition) => evaluateCondition(caption, condition));

  if (rule.conditionLogic === "AND") {
    return results.every(Boolean);
  } else {
    return results.some(Boolean);
  }
}

// --------------------
// Utility
// --------------------

let ruleIdCounter = 0;

/**
 * Generate a simple unique ID for rules
 */
function generateRuleId(): string {
  return `rule_${Date.now().toString(36)}_${(++ruleIdCounter).toString(36)}`;
}

// --------------------
// Preset Definitions
// --------------------

/**
 * Create a rule with default values
 */
function createRule(
  partial: Partial<EffectRule> & Pick<EffectRule, "name" | "conditions" | "effect">
): EffectRule {
  return {
    id: generateRuleId(),
    enabled: true,
    priority: 50,
    conditionLogic: "AND",
    ...partial,
  };
}

/**
 * Balanced preset - Good mix of effects without being overwhelming
 */
const BALANCED_PRESET: EffectsPreset = {
  name: "balanced",
  displayName: "Balanceado",
  description: "Mezcla equilibrada de efectos para contenido general",
  rules: [
    // Highlight keywords with high topic relevance
    createRule({
      name: "Destacar palabras clave",
      priority: 100,
      conditions: [
        { field: "semantic.isKeyword", operator: "equals", value: true },
        { field: "semantic.topicRelevance", operator: "greaterThanOrEqual", value: 0.8 },
      ],
      effect: { type: "highlight" },
    }),
    // Punch zoom for emphatic moments
    createRule({
      name: "Zoom punch en énfasis",
      priority: 90,
      conditions: [
        { field: "semantic.emphasisScore", operator: "greaterThanOrEqual", value: 0.7 },
        { field: "semantic.emotionalIntensity", operator: "greaterThanOrEqual", value: 0.5 },
      ],
      effect: { type: "zoom", style: "punch", durationMs: 500 },
    }),
    // Slow zoom at sentence starts with topic relevance
    createRule({
      name: "Zoom lento al inicio de oración",
      priority: 80,
      conditions: [
        { field: "sentencePosition", operator: "equals", value: "start" },
        { field: "semantic.topicRelevance", operator: "greaterThanOrEqual", value: 0.6 },
      ],
      effect: { type: "zoom", style: "slow", durationMs: 1500 },
    }),
    // Highlight action words
    createRule({
      name: "Destacar verbos de acción",
      priority: 70,
      conditions: [
        { field: "semantic.category", operator: "equals", value: "action" },
        { field: "semantic.emphasisScore", operator: "greaterThanOrEqual", value: 0.5 },
      ],
      effect: { type: "highlight" },
    }),
  ],
};

/**
 * Minimal preset - Only the most important moments
 */
const MINIMAL_PRESET: EffectsPreset = {
  name: "minimal",
  displayName: "Mínimo",
  description: "Solo efectos en momentos muy importantes",
  rules: [
    // Only top keywords
    createRule({
      name: "Solo palabras clave principales",
      priority: 100,
      conditions: [
        { field: "semantic.isKeyword", operator: "equals", value: true },
        { field: "semantic.topicRelevance", operator: "greaterThanOrEqual", value: 0.9 },
      ],
      effect: { type: "highlight" },
    }),
    // Zoom only for very high emphasis
    createRule({
      name: "Zoom solo en momentos clave",
      priority: 90,
      conditions: [
        { field: "semantic.emphasisScore", operator: "greaterThanOrEqual", value: 0.85 },
        { field: "semantic.emotionalIntensity", operator: "greaterThanOrEqual", value: 0.7 },
      ],
      effect: { type: "zoom", style: "punch", durationMs: 500 },
    }),
  ],
};

/**
 * Aggressive preset - More effects for dynamic content
 */
const AGGRESSIVE_PRESET: EffectsPreset = {
  name: "aggressive",
  displayName: "Agresivo",
  description: "Muchos efectos para contenido dinámico",
  rules: [
    // Highlight keywords with moderate relevance
    createRule({
      name: "Destacar palabras relevantes",
      priority: 100,
      conditions: [
        { field: "semantic.isKeyword", operator: "equals", value: true },
        { field: "semantic.topicRelevance", operator: "greaterThanOrEqual", value: 0.6 },
      ],
      effect: { type: "highlight" },
    }),
    // More frequent zoom punches
    createRule({
      name: "Zoom punch frecuente",
      priority: 90,
      conditions: [
        { field: "semantic.emphasisScore", operator: "greaterThanOrEqual", value: 0.5 },
      ],
      effect: { type: "zoom", style: "punch", durationMs: 400 },
    }),
    // Slow zoom for all sentence starts
    createRule({
      name: "Zoom en inicios de oración",
      priority: 80,
      conditions: [
        { field: "sentencePosition", operator: "equals", value: "start" },
        { field: "semantic.topicRelevance", operator: "greaterThanOrEqual", value: 0.4 },
      ],
      effect: { type: "zoom", style: "slow", durationMs: 1200 },
    }),
    // Highlight all action and concept words
    createRule({
      name: "Destacar acciones y conceptos",
      priority: 70,
      conditionLogic: "OR",
      conditions: [
        { field: "semantic.category", operator: "equals", value: "action" },
        { field: "semantic.category", operator: "equals", value: "concept" },
      ],
      effect: { type: "highlight" },
    }),
    // Highlight emotional words
    createRule({
      name: "Destacar palabras emocionales",
      priority: 60,
      conditions: [
        { field: "semantic.category", operator: "equals", value: "emotion" },
        { field: "semantic.emotionalIntensity", operator: "greaterThanOrEqual", value: 0.4 },
      ],
      effect: { type: "highlight" },
    }),
  ],
};

/**
 * All available presets
 */
export const PRESETS: Record<PresetName, EffectsPreset> = {
  balanced: BALANCED_PRESET,
  minimal: MINIMAL_PRESET,
  aggressive: AGGRESSIVE_PRESET,
  custom: {
    name: "custom",
    displayName: "Personalizado",
    description: "Define tus propias reglas",
    rules: [],
  },
};

/**
 * Get the rules for a given configuration
 */
export function getRulesForConfig(config: EffectsConfig): EffectRule[] {
  if (config.activePreset === "custom") {
    return config.customRules;
  }
  return PRESETS[config.activePreset].rules;
}

// --------------------
// Effects Application
// --------------------

/**
 * Apply threshold multiplier to a rule's conditions
 */
function applyThresholdMultiplier(rule: EffectRule, multiplier: number): EffectRule {
  if (multiplier === 1) return rule;

  return {
    ...rule,
    conditions: rule.conditions.map((condition) => {
      // Only apply to numeric greater-than conditions (thresholds)
      if (
        typeof condition.value === "number" &&
        (condition.operator === "greaterThan" || condition.operator === "greaterThanOrEqual")
      ) {
        // Lower threshold = more effects (inverse relationship)
        const adjustedValue = condition.value / multiplier;
        // Clamp between 0 and 1 for normalized scores
        const clampedValue = Math.max(0, Math.min(1, adjustedValue));
        return { ...condition, value: clampedValue };
      }
      return condition;
    }),
  };
}

/**
 * Check if an effect conflicts with existing effects (too close in time)
 */
function hasConflict(effect: AppliedEffect, existing: AppliedEffect[], minGapMs: number = 500): boolean {
  for (const e of existing) {
    const effectEnd = effect.endMs ?? effect.startMs + (effect.durationMs ?? 500);
    const existingEnd = e.endMs ?? e.startMs + (e.durationMs ?? 500);

    // Check for overlap or too close
    const gap = Math.min(
      Math.abs(effect.startMs - existingEnd),
      Math.abs(effectEnd - e.startMs)
    );

    if (gap < minGapMs) return true;

    // Also check if same type and overlapping
    if (effect.type === e.type) {
      if (effect.startMs < existingEnd && effectEnd > e.startMs) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Apply effects rules to enriched captions
 */
export function applyEffects(
  enrichedCaptions: EnrichedCaption[],
  config: EffectsConfig
): EffectsApplicationResult {
  const effects: AppliedEffect[] = [];
  const rulesTriggered: Record<string, number> = {};

  // Get and sort rules by priority (highest first)
  const rules = getRulesForConfig(config)
    .map((rule) => applyThresholdMultiplier(rule, config.thresholdMultiplier))
    .sort((a, b) => b.priority - a.priority);

  // Track statistics
  let captionsWithEffects = 0;
  let zoomCount = 0;
  let highlightCount = 0;

  // Process each caption
  for (const caption of enrichedCaptions) {
    let hasEffect = false;

    // Try each rule in priority order
    for (const rule of rules) {
      if (!rule.enabled) continue;

      // Check if rule matches
      if (evaluateRule(caption, rule)) {
        // Create the effect
        const effect: AppliedEffect = {
          type: rule.effect.type,
          startMs: caption.startMs,
          word: caption.text,
          ruleId: rule.id,
          confidence: caption.semantic.topicRelevance,
        };

        if (rule.effect.type === "zoom") {
          effect.style = rule.effect.style ?? "punch";
          effect.durationMs = rule.effect.durationMs ?? 500;
        } else {
          effect.endMs = caption.endMs;
        }

        // Check for conflicts
        if (!hasConflict(effect, effects)) {
          effects.push(effect);
          hasEffect = true;

          // Update counters
          rulesTriggered[rule.id] = (rulesTriggered[rule.id] ?? 0) + 1;
          if (rule.effect.type === "zoom") {
            zoomCount++;
          } else {
            highlightCount++;
          }

          // Only one effect per caption (first matching rule wins due to priority)
          break;
        }
      }
    }

    if (hasEffect) {
      captionsWithEffects++;
    }
  }

  // Apply max effects per minute limit if set
  if (config.maxEffectsPerMinute > 0 && effects.length > 0) {
    const durationMinutes = (enrichedCaptions[enrichedCaptions.length - 1].endMs - enrichedCaptions[0].startMs) / 60000;
    const maxEffects = Math.ceil(durationMinutes * config.maxEffectsPerMinute);

    if (effects.length > maxEffects) {
      // Sort by confidence and keep top N
      effects.sort((a, b) => b.confidence - a.confidence);
      effects.splice(maxEffects);
      effects.sort((a, b) => a.startMs - b.startMs);

      // Recalculate counts
      zoomCount = effects.filter((e) => e.type === "zoom").length;
      highlightCount = effects.filter((e) => e.type === "highlight").length;
    }
  }

  // Sort effects by time
  effects.sort((a, b) => a.startMs - b.startMs);

  return {
    effects,
    stats: {
      totalCaptions: enrichedCaptions.length,
      captionsWithEffects,
      zoomCount,
      highlightCount,
      rulesTriggered,
    },
  };
}

/**
 * Default effects configuration
 */
export const DEFAULT_EFFECTS_CONFIG: EffectsConfig = {
  activePreset: "balanced",
  customRules: [],
  thresholdMultiplier: 1,
  maxEffectsPerMinute: 0, // Unlimited
};

/**
 * Get a preset by name
 */
export function getPreset(name: PresetName): EffectsPreset {
  return PRESETS[name];
}

/**
 * List all available presets
 */
export function listPresets(): EffectsPreset[] {
  return Object.values(PRESETS);
}
