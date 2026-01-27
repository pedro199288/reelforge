import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeftRight, Zap, Type } from "lucide-react";
import { applyEffects, listPresets, PRESETS } from "@/core/effects/rule-engine";
import type { EnrichedCaption, PresetName } from "@/core/effects/types";

interface PresetComparatorProps {
  enrichedCaptions: EnrichedCaption[];
  className?: string;
}

export function PresetComparator({
  enrichedCaptions,
  className,
}: PresetComparatorProps) {
  const [presetA, setPresetA] = useState<PresetName>("balanced");
  const [presetB, setPresetB] = useState<PresetName>("aggressive");

  const presets = useMemo(() => listPresets().filter((p) => p.name !== "custom"), []);

  // Apply effects for both presets
  const resultA = useMemo(() => {
    return applyEffects(enrichedCaptions, {
      activePreset: presetA,
      customRules: [],
      thresholdMultiplier: 1,
      maxEffectsPerMinute: 0,
    });
  }, [enrichedCaptions, presetA]);

  const resultB = useMemo(() => {
    return applyEffects(enrichedCaptions, {
      activePreset: presetB,
      customRules: [],
      thresholdMultiplier: 1,
      maxEffectsPerMinute: 0,
    });
  }, [enrichedCaptions, presetB]);

  const swapPresets = () => {
    const temp = presetA;
    setPresetA(presetB);
    setPresetB(temp);
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5" />
          Comparador de Presets
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Preset selectors */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Preset A</label>
            <Select value={presetA} onValueChange={(v) => setPresetA(v as PresetName)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presets.map((preset) => (
                  <SelectItem key={preset.name} value={preset.name}>
                    {preset.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button variant="ghost" size="icon" className="mt-4" onClick={swapPresets}>
            <ArrowLeftRight className="w-4 h-4" />
          </Button>

          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Preset B</label>
            <Select value={presetB} onValueChange={(v) => setPresetB(v as PresetName)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presets.map((preset) => (
                  <SelectItem key={preset.name} value={preset.name}>
                    {preset.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Comparison grid */}
        <div className="grid grid-cols-2 gap-4">
          <ComparisonPanel
            title={PRESETS[presetA].displayName}
            description={PRESETS[presetA].description}
            result={resultA}
            variant="a"
          />
          <ComparisonPanel
            title={PRESETS[presetB].displayName}
            description={PRESETS[presetB].description}
            result={resultB}
            variant="b"
          />
        </div>

        {/* Summary comparison */}
        <div className="p-4 bg-muted/50 rounded-lg">
          <h4 className="text-sm font-medium mb-2">Diferencia</h4>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Efectos totales:</span>
              <span className="ml-2 font-medium">
                {resultA.effects.length} vs {resultB.effects.length}
                {resultA.effects.length !== resultB.effects.length && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({resultB.effects.length - resultA.effects.length > 0 ? "+" : ""}
                    {resultB.effects.length - resultA.effects.length})
                  </span>
                )}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Zooms:</span>
              <span className="ml-2 font-medium">
                {resultA.stats.zoomCount} vs {resultB.stats.zoomCount}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Highlights:</span>
              <span className="ml-2 font-medium">
                {resultA.stats.highlightCount} vs {resultB.stats.highlightCount}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ComparisonPanelProps {
  title: string;
  description: string;
  result: ReturnType<typeof applyEffects>;
  variant: "a" | "b";
}

function ComparisonPanel({ title, description, result, variant }: ComparisonPanelProps) {
  const bgColor = variant === "a" ? "bg-blue-50 dark:bg-blue-950/30" : "bg-green-50 dark:bg-green-950/30";
  const borderColor = variant === "a" ? "border-blue-200 dark:border-blue-800" : "border-green-200 dark:border-green-800";

  return (
    <div className={`p-4 rounded-lg border ${bgColor} ${borderColor}`}>
      <h4 className="font-medium">{title}</h4>
      <p className="text-xs text-muted-foreground mb-3">{description}</p>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-500" />
          <span className="text-sm">
            {result.stats.zoomCount} zoom{result.stats.zoomCount !== 1 && "s"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Type className="w-4 h-4 text-blue-500" />
          <span className="text-sm">
            {result.stats.highlightCount} highlight{result.stats.highlightCount !== 1 && "s"}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {result.stats.captionsWithEffects} de {result.stats.totalCaptions} palabras con efectos
        </div>
      </div>

      {/* Effect timeline preview */}
      <div className="mt-3 h-8 bg-muted rounded relative overflow-hidden">
        {result.effects.slice(0, 50).map((effect, i) => (
          <div
            key={i}
            className={`absolute top-1 bottom-1 rounded-sm ${
              effect.type === "zoom" ? "bg-yellow-500/60" : "bg-blue-500/60"
            }`}
            style={{
              left: `${(effect.startMs / (result.effects[result.effects.length - 1]?.startMs || 1)) * 95}%`,
              width: "3px",
            }}
          />
        ))}
      </div>
    </div>
  );
}
