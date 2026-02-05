import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditorUIStore } from "@/store/editor-ui";
import { cn } from "@/lib/utils";
import { X, Play, Zap, Highlighter } from "lucide-react";
import type { AppliedEffect } from "@/core/effects/types";

function getConfidenceBadge(confidence: number) {
  const pct = Math.round(confidence * 100);
  const color =
    confidence >= 0.8
      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
      : confidence >= 0.5
        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  return (
    <span className={cn("text-[10px] px-1 py-0.5 rounded font-mono", color)}>
      {pct}%
    </span>
  );
}

interface EffectPropertiesProps {
  effect: AppliedEffect | undefined;
  effectIndex: number;
  onSeekTo?: (ms: number) => void;
  onEditEffect?: (index: number, updates: Partial<AppliedEffect>) => void;
}

export function EffectProperties({
  effect,
  effectIndex,
  onSeekTo,
  onEditEffect,
}: EffectPropertiesProps) {
  const clearSelection = useEditorUIStore((s) => s.clearSelection);

  if (!effect) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Efecto no encontrado
      </div>
    );
  }

  const effectEndMs = effect.endMs ?? (effect.startMs + (effect.durationMs ?? 300));
  const durationMs = effectEndMs - effect.startMs;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {effect.type === "zoom" ? (
            <Zap className="w-4 h-4 text-orange-400" />
          ) : (
            <Highlighter className="w-4 h-4 text-yellow-400" />
          )}
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              effect.type === "zoom" && effect.style === "punch" && "border-orange-500/50 text-orange-400",
              effect.type === "zoom" && effect.style === "slow" && "border-blue-500/50 text-blue-400",
              effect.type === "highlight" && "border-yellow-500/50 text-yellow-400"
            )}
          >
            {effect.type === "zoom"
              ? `Zoom ${effect.style ?? "punch"}`
              : "Highlight"}
          </Badge>
          {getConfidenceBadge(effect.confidence)}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearSelection}
          className="h-6 w-6 p-0"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Word */}
      <div className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Palabra</span>
        <p className="text-sm bg-muted/30 rounded p-2 font-mono">"{effect.word}"</p>
      </div>

      {/* Timing */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">Timing</span>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Inicio (ms)</label>
            <Input
              type="number"
              step={10}
              value={effect.startMs}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && onEditEffect) {
                  onEditEffect(effectIndex, { startMs: val });
                }
              }}
              className="h-7 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">
              {effect.type === "highlight" ? "Fin (ms)" : "Duracion (ms)"}
            </label>
            <Input
              type="number"
              step={10}
              value={effect.type === "highlight" ? (effect.endMs ?? effectEndMs) : (effect.durationMs ?? durationMs)}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && onEditEffect) {
                  if (effect.type === "highlight") {
                    onEditEffect(effectIndex, { endMs: val });
                  } else {
                    onEditEffect(effectIndex, { durationMs: val });
                  }
                }
              }}
              className="h-7 text-xs font-mono"
            />
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">
          Duracion: {durationMs}ms
        </span>
      </div>

      {/* Type/Style selection */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">Tipo</span>
        <div className="flex gap-1">
          <Button
            variant={effect.type === "zoom" && effect.style === "punch" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs flex-1"
            onClick={() => onEditEffect?.(effectIndex, { type: "zoom", style: "punch" })}
          >
            Zoom Punch
          </Button>
          <Button
            variant={effect.type === "zoom" && effect.style === "slow" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs flex-1"
            onClick={() => onEditEffect?.(effectIndex, { type: "zoom", style: "slow" })}
          >
            Zoom Slow
          </Button>
          <Button
            variant={effect.type === "highlight" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs flex-1"
            onClick={() => onEditEffect?.(effectIndex, { type: "highlight", style: undefined })}
          >
            Highlight
          </Button>
        </div>
      </div>

      {/* Metadata */}
      <div className="space-y-1 text-[10px] text-muted-foreground">
        <div>Regla: <span className="font-mono">{effect.ruleId}</span></div>
      </div>

      {/* Seek button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onSeekTo?.(effect.startMs)}
        className="w-full"
      >
        <Play className="w-3.5 h-3.5 mr-1" />
        Ir a {(effect.startMs / 1000).toFixed(1)}s
      </Button>
    </div>
  );
}
