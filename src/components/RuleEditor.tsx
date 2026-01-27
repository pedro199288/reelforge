import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Zap,
  Type,
} from "lucide-react";
import type {
  EffectRule,
  RuleCondition,
  ComparisonOperator,
  EffectType,
  ZoomStyle,
} from "@/core/effects/types";

interface RuleEditorProps {
  rules: EffectRule[];
  onChange: (rules: EffectRule[]) => void;
  className?: string;
}

const FIELD_OPTIONS = [
  { value: "semantic.isKeyword", label: "Es palabra clave" },
  { value: "semantic.topicRelevance", label: "Relevancia al tema" },
  { value: "semantic.emphasisScore", label: "Puntuacion de enfasis" },
  { value: "semantic.emotionalIntensity", label: "Intensidad emocional" },
  { value: "semantic.category", label: "Categoria" },
  { value: "sentencePosition", label: "Posicion en oracion" },
];

const OPERATOR_OPTIONS: { value: ComparisonOperator; label: string }[] = [
  { value: "equals", label: "=" },
  { value: "notEquals", label: "!=" },
  { value: "greaterThan", label: ">" },
  { value: "greaterThanOrEqual", label: ">=" },
  { value: "lessThan", label: "<" },
  { value: "lessThanOrEqual", label: "<=" },
];

const CATEGORY_VALUES = ["action", "concept", "emotion", "connector", "filler"];
const POSITION_VALUES = ["start", "middle", "end"];

export function RuleEditor({ rules, onChange, className }: RuleEditorProps) {
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedRules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const addRule = () => {
    const newRule: EffectRule = {
      id: `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: "Nueva regla",
      enabled: true,
      priority: 50,
      conditions: [
        { field: "semantic.isKeyword", operator: "equals", value: true },
      ],
      conditionLogic: "AND",
      effect: { type: "highlight" },
    };
    onChange([...rules, newRule]);
    setExpandedRules((prev) => new Set([...prev, newRule.id]));
  };

  const updateRule = (id: string, updates: Partial<EffectRule>) => {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  const deleteRule = (id: string) => {
    onChange(rules.filter((r) => r.id !== id));
  };

  const addCondition = (ruleId: string) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) return;

    const newCondition: RuleCondition = {
      field: "semantic.topicRelevance",
      operator: "greaterThanOrEqual",
      value: 0.5,
    };
    updateRule(ruleId, { conditions: [...rule.conditions, newCondition] });
  };

  const updateCondition = (
    ruleId: string,
    index: number,
    updates: Partial<RuleCondition>
  ) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) return;

    const newConditions = [...rule.conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    updateRule(ruleId, { conditions: newConditions });
  };

  const deleteCondition = (ruleId: string, index: number) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) return;

    updateRule(ruleId, {
      conditions: rule.conditions.filter((_, i) => i !== index),
    });
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Editor de Reglas</CardTitle>
          <Button size="sm" onClick={addRule} className="gap-1">
            <Plus className="w-4 h-4" />
            Agregar Regla
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rules.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No hay reglas personalizadas. Haz clic en "Agregar Regla" para crear una.
          </div>
        ) : (
          rules.map((rule, ruleIndex) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              index={ruleIndex}
              isExpanded={expandedRules.has(rule.id)}
              onToggleExpanded={() => toggleExpanded(rule.id)}
              onUpdate={(updates) => updateRule(rule.id, updates)}
              onDelete={() => deleteRule(rule.id)}
              onAddCondition={() => addCondition(rule.id)}
              onUpdateCondition={(idx, updates) =>
                updateCondition(rule.id, idx, updates)
              }
              onDeleteCondition={(idx) => deleteCondition(rule.id, idx)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

interface RuleCardProps {
  rule: EffectRule;
  index: number;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onUpdate: (updates: Partial<EffectRule>) => void;
  onDelete: () => void;
  onAddCondition: () => void;
  onUpdateCondition: (index: number, updates: Partial<RuleCondition>) => void;
  onDeleteCondition: (index: number) => void;
}

function RuleCard({
  rule,
  isExpanded,
  onToggleExpanded,
  onUpdate,
  onDelete,
  onAddCondition,
  onUpdateCondition,
  onDeleteCondition,
}: RuleCardProps) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggleExpanded}>
      <div className="border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 p-3 bg-muted/30">
          <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />

          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 flex-1 text-left">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <span className="font-medium">{rule.name}</span>
            </button>
          </CollapsibleTrigger>

          <div className="flex items-center gap-2">
            <Badge variant={rule.enabled ? "default" : "secondary"}>
              {rule.effect.type === "zoom" ? (
                <Zap className="w-3 h-3 mr-1" />
              ) : (
                <Type className="w-3 h-3 mr-1" />
              )}
              {rule.effect.type}
            </Badge>

            <Switch
              checked={rule.enabled}
              onCheckedChange={(enabled) => onUpdate({ enabled })}
            />

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <CollapsibleContent>
          <div className="p-4 space-y-4 border-t">
            {/* Name and priority */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">Nombre</label>
                <Input
                  value={rule.name}
                  onChange={(e) => onUpdate({ name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Prioridad: {rule.priority}
                </label>
                <Slider
                  value={[rule.priority]}
                  min={0}
                  max={100}
                  step={10}
                  className="mt-3"
                  onValueChange={([priority]) => onUpdate({ priority })}
                />
              </div>
            </div>

            {/* Conditions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted-foreground">
                  Condiciones ({rule.conditionLogic})
                </label>
                <div className="flex items-center gap-2">
                  <Select
                    value={rule.conditionLogic}
                    onValueChange={(v) =>
                      onUpdate({ conditionLogic: v as "AND" | "OR" })
                    }
                  >
                    <SelectTrigger className="w-20 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AND">AND</SelectItem>
                      <SelectItem value="OR">OR</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={onAddCondition}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Condicion
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {rule.conditions.map((condition, idx) => (
                  <ConditionRow
                    key={idx}
                    condition={condition}
                    onUpdate={(updates) => onUpdateCondition(idx, updates)}
                    onDelete={() => onDeleteCondition(idx)}
                  />
                ))}
              </div>
            </div>

            {/* Effect */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">
                Efecto
              </label>
              <div className="flex items-center gap-4">
                <Select
                  value={rule.effect.type}
                  onValueChange={(type) =>
                    onUpdate({
                      effect: {
                        type: type as EffectType,
                        style: type === "zoom" ? "punch" : undefined,
                        durationMs: type === "zoom" ? 500 : undefined,
                      },
                    })
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="highlight">Highlight</SelectItem>
                    <SelectItem value="zoom">Zoom</SelectItem>
                  </SelectContent>
                </Select>

                {rule.effect.type === "zoom" && (
                  <>
                    <Select
                      value={rule.effect.style || "punch"}
                      onValueChange={(style) =>
                        onUpdate({
                          effect: { ...rule.effect, style: style as ZoomStyle },
                        })
                      }
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="punch">Punch</SelectItem>
                        <SelectItem value="slow">Slow</SelectItem>
                      </SelectContent>
                    </Select>

                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">
                        Duracion:
                      </label>
                      <Input
                        type="number"
                        value={rule.effect.durationMs || 500}
                        onChange={(e) =>
                          onUpdate({
                            effect: {
                              ...rule.effect,
                              durationMs: parseInt(e.target.value) || 500,
                            },
                          })
                        }
                        className="w-20 h-8"
                      />
                      <span className="text-xs text-muted-foreground">ms</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface ConditionRowProps {
  condition: RuleCondition;
  onUpdate: (updates: Partial<RuleCondition>) => void;
  onDelete: () => void;
}

function ConditionRow({ condition, onUpdate, onDelete }: ConditionRowProps) {
  const isBooleanField = condition.field === "semantic.isKeyword";
  const isCategoryField = condition.field === "semantic.category";
  const isPositionField = condition.field === "sentencePosition";

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
      <Select
        value={condition.field}
        onValueChange={(field) => {
          const updates: Partial<RuleCondition> = { field };
          // Reset value based on field type
          if (field === "semantic.isKeyword") {
            updates.value = true;
            updates.operator = "equals";
          } else if (field === "semantic.category") {
            updates.value = "action";
            updates.operator = "equals";
          } else if (field === "sentencePosition") {
            updates.value = "start";
            updates.operator = "equals";
          } else {
            updates.value = 0.5;
            updates.operator = "greaterThanOrEqual";
          }
          onUpdate(updates);
        }}
      >
        <SelectTrigger className="w-40 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FIELD_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={condition.operator}
        onValueChange={(op) => onUpdate({ operator: op as ComparisonOperator })}
      >
        <SelectTrigger className="w-16 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPERATOR_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isBooleanField ? (
        <Select
          value={String(condition.value)}
          onValueChange={(v) => onUpdate({ value: v === "true" })}
        >
          <SelectTrigger className="w-20 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">true</SelectItem>
            <SelectItem value="false">false</SelectItem>
          </SelectContent>
        </Select>
      ) : isCategoryField ? (
        <Select
          value={String(condition.value)}
          onValueChange={(v) => onUpdate({ value: v })}
        >
          <SelectTrigger className="w-24 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_VALUES.map((val) => (
              <SelectItem key={val} value={val}>
                {val}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : isPositionField ? (
        <Select
          value={String(condition.value)}
          onValueChange={(v) => onUpdate({ value: v })}
        >
          <SelectTrigger className="w-24 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {POSITION_VALUES.map((val) => (
              <SelectItem key={val} value={val}>
                {val}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          type="number"
          step="0.1"
          min="0"
          max="1"
          value={condition.value as number}
          onChange={(e) => onUpdate({ value: parseFloat(e.target.value) || 0 })}
          className="w-20 h-8 text-xs"
        />
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  );
}
