/**
 * Panel for displaying effects analysis results and configuring rules
 */

import { useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffectsStore, useVideoAnalysis, useVideoEffects } from "@/store/effects";
import { listPresets } from "@/core/effects/rule-engine";
import type { PresetName, AppliedEffect, EffectsAnalysisResult } from "@/core/effects/types";
import type { AlignedEvent } from "@/core/script/align";
import { useTimelineStore } from "@/store/timeline";

const API_URL = "http://localhost:3012";

interface EffectsAnalysisPanelProps {
  videoId: string;
  onApplyToTimeline?: () => void;
}

export function EffectsAnalysisPanel({ videoId, onApplyToTimeline }: EffectsAnalysisPanelProps) {
  const analysis = useVideoAnalysis(videoId);
  const effects = useVideoEffects(videoId);
  const config = useEffectsStore((state) => state.config);
  const setPreset = useEffectsStore((state) => state.setPreset);
  const setThresholdMultiplier = useEffectsStore((state) => state.setThresholdMultiplier);
  const setMaxEffectsPerMinute = useEffectsStore((state) => state.setMaxEffectsPerMinute);
  const recomputeEffects = useEffectsStore((state) => state.recomputeEffects);
  const previewEnabled = useEffectsStore((state) => state.previewEnabled);
  const setPreviewEnabled = useEffectsStore((state) => state.setPreviewEnabled);
  const setAnalysisResult = useEffectsStore((state) => state.setAnalysisResult);
  const importFromEvents = useTimelineStore((state) => state.importFromEvents);

  const presets = useMemo(() => listPresets(), []);

  // Load analysis result from backend if not in store
  useEffect(() => {
    if (analysis) return; // Already loaded

    const loadAnalysis = async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/pipeline/result?videoId=${encodeURIComponent(videoId)}&step=effects-analysis`
        );
        if (res.ok) {
          const result = await res.json() as EffectsAnalysisResult;
          if (result.enrichedCaptions) {
            setAnalysisResult(videoId, result);
          }
        }
      } catch {
        // Silently fail - analysis might not exist yet
      }
    };

    loadAnalysis();
  }, [videoId, analysis, setAnalysisResult]);

  // Convert effects to timeline events format
  const handleApplyToTimeline = () => {
    if (!effects) return;

    const events: AlignedEvent[] = effects.effects.map((effect) => {
      if (effect.type === "zoom") {
        return {
          type: "zoom" as const,
          style: effect.style ?? "punch",
          timestampMs: effect.startMs,
          durationMs: effect.durationMs ?? 500,
          confidence: effect.confidence,
        };
      } else {
        return {
          type: "highlight" as const,
          word: effect.word,
          startMs: effect.startMs,
          endMs: effect.endMs ?? effect.startMs + 500,
          confidence: effect.confidence,
        };
      }
    });

    importFromEvents(videoId, events);
    onApplyToTimeline?.();
  };

  if (!analysis) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No hay análisis de efectos disponible.</p>
        <p className="text-sm mt-2">Ejecuta el paso "Effects Analysis" primero.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Analysis Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span>Análisis de Contenido</span>
            <Badge variant="outline">{analysis.metadata.language.toUpperCase()}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Tema Principal</Label>
            <p className="font-medium">{analysis.metadata.mainTopic}</p>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Tono</Label>
            <Badge variant="secondary" className="ml-2">
              {analysis.metadata.overallTone}
            </Badge>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Palabras Clave</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {analysis.metadata.topicKeywords.map((keyword, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {keyword}
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Palabras analizadas:</span>
              <span className="ml-2 font-medium">{analysis.metadata.wordCount}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Tiempo de análisis:</span>
              <span className="ml-2 font-medium">{(analysis.processingTimeMs / 1000).toFixed(1)}s</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Effects Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Configuración de Efectos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Preset Selection */}
          <div className="space-y-2">
            <Label>Preset de Reglas</Label>
            <Select
              value={config.activePreset}
              onValueChange={(value) => {
                setPreset(value as PresetName);
                recomputeEffects(videoId);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presets.map((preset) => (
                  <SelectItem key={preset.name} value={preset.name}>
                    <div className="flex flex-col">
                      <span>{preset.displayName}</span>
                      <span className="text-xs text-muted-foreground">{preset.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Threshold Multiplier */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Sensibilidad</Label>
              <span className="text-sm text-muted-foreground">
                {config.thresholdMultiplier.toFixed(1)}x
              </span>
            </div>
            <Slider
              value={[config.thresholdMultiplier]}
              onValueChange={([value]) => {
                setThresholdMultiplier(value);
                recomputeEffects(videoId);
              }}
              min={0.5}
              max={2}
              step={0.1}
            />
            <p className="text-xs text-muted-foreground">
              Menor = más efectos, Mayor = menos efectos
            </p>
          </div>

          {/* Max Effects Per Minute */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Máx. efectos por minuto</Label>
              <span className="text-sm text-muted-foreground">
                {config.maxEffectsPerMinute === 0 ? "Sin límite" : config.maxEffectsPerMinute}
              </span>
            </div>
            <Slider
              value={[config.maxEffectsPerMinute]}
              onValueChange={([value]) => {
                setMaxEffectsPerMinute(value);
                recomputeEffects(videoId);
              }}
              min={0}
              max={30}
              step={1}
            />
          </div>

          {/* Preview Toggle */}
          <div className="flex items-center justify-between">
            <Label>Mostrar preview</Label>
            <Switch
              checked={previewEnabled}
              onCheckedChange={setPreviewEnabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Effects Preview */}
      {effects && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span>Efectos Generados</span>
              <Badge variant="secondary">
                {effects.effects.length} efectos
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Zooms:</span>
                <span className="ml-2 font-medium text-blue-600">{effects.stats.zoomCount}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Highlights:</span>
                <span className="ml-2 font-medium text-yellow-600">{effects.stats.highlightCount}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Palabras afectadas:</span>
                <span className="ml-2 font-medium">
                  {((effects.stats.captionsWithEffects / effects.stats.totalCaptions) * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Effects List Preview */}
            {previewEnabled && effects.effects.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1.5 border rounded-lg p-2">
                {effects.effects.slice(0, 20).map((effect, i) => (
                  <EffectItem key={i} effect={effect} />
                ))}
                {effects.effects.length > 20 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    ... y {effects.effects.length - 20} efectos más
                  </p>
                )}
              </div>
            )}

            {/* Apply Button */}
            <Button
              onClick={handleApplyToTimeline}
              className="w-full"
              disabled={effects.effects.length === 0}
            >
              Aplicar al Timeline ({effects.effects.length} efectos)
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EffectItem({ effect }: { effect: AppliedEffect }) {
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50">
      <Badge
        variant="outline"
        className={effect.type === "zoom" ? "border-blue-300 text-blue-600" : "border-yellow-300 text-yellow-600"}
      >
        {effect.type === "zoom" ? `Zoom ${effect.style}` : "Highlight"}
      </Badge>
      <span className="font-mono text-muted-foreground">{formatTime(effect.startMs)}</span>
      <span className="font-medium truncate flex-1">{effect.word}</span>
      <span className="text-muted-foreground">{(effect.confidence * 100).toFixed(0)}%</span>
    </div>
  );
}
