import { TimelineTrack } from "./TimelineTrack";
import { getPxPerMs } from "./constants";
import { cn } from "@/lib/utils";
import type { AppliedEffect } from "@/core/effects/types";

interface EffectsTrackProps {
  effects: AppliedEffect[];
  zoomLevel: number;
  viewportStartMs: number;
  viewportWidthPx: number;
  selectedEffectIndex: number | null;
  onSelectEffect: (index: number) => void;
  onSeek: (ms: number) => void;
}

const EFFECT_COLORS: Record<string, { bg: string; bgActive: string; ring: string }> = {
  "zoom-punch": {
    bg: "bg-orange-500/20 hover:bg-orange-500/30",
    bgActive: "bg-orange-500/40",
    ring: "ring-orange-500",
  },
  "zoom-slow": {
    bg: "bg-blue-500/20 hover:bg-blue-500/30",
    bgActive: "bg-blue-500/40",
    ring: "ring-blue-500",
  },
  highlight: {
    bg: "bg-yellow-500/20 hover:bg-yellow-500/30",
    bgActive: "bg-yellow-500/40",
    ring: "ring-yellow-500",
  },
};

function getEffectColor(effect: AppliedEffect) {
  if (effect.type === "zoom") {
    return EFFECT_COLORS[`zoom-${effect.style ?? "punch"}`] ?? EFFECT_COLORS["zoom-punch"];
  }
  return EFFECT_COLORS.highlight;
}

function getEffectLabel(effect: AppliedEffect) {
  if (effect.type === "zoom") {
    return effect.style === "slow" ? "Z-slow" : "Z-punch";
  }
  return "HL";
}

export function EffectsTrack({
  effects,
  zoomLevel,
  viewportStartMs,
  viewportWidthPx,
  selectedEffectIndex,
  onSelectEffect,
  onSeek,
}: EffectsTrackProps) {
  const pxPerMs = getPxPerMs(zoomLevel);
  const CULL_MARGIN = 50;

  const visibleStartMs = viewportStartMs - CULL_MARGIN / pxPerMs;
  const visibleEndMs = viewportStartMs + (viewportWidthPx + CULL_MARGIN) / pxPerMs;

  return (
    <TimelineTrack name="Effects" height={28}>
      {effects.map((effect, index) => {
        const effectEndMs = effect.endMs ?? (effect.startMs + (effect.durationMs ?? 300));

        // Viewport culling
        if (effectEndMs < visibleStartMs || effect.startMs > visibleEndMs) return null;

        const left = (effect.startMs - viewportStartMs) * pxPerMs;
        const width = (effectEndMs - effect.startMs) * pxPerMs;
        const isSelected = index === selectedEffectIndex;
        const colors = getEffectColor(effect);
        const label = getEffectLabel(effect);

        return (
          <button
            key={`${effect.startMs}-${index}`}
            type="button"
            className={cn(
              "absolute top-0.5 bottom-0.5 rounded-sm cursor-pointer transition-colors overflow-hidden",
              "text-[8px] leading-tight text-foreground/80 px-0.5 truncate text-left font-medium",
              isSelected ? colors.bgActive : colors.bg,
              isSelected && `ring-2 ${colors.ring}`
            )}
            style={{ left, width: Math.max(width, 4) }}
            title={`${effect.type}${effect.style ? ` (${effect.style})` : ""}: "${effect.word}" @ ${effect.startMs}ms`}
            onClick={() => {
              onSelectEffect(index);
              onSeek(effect.startMs);
            }}
          >
            {width > 16 && label}
          </button>
        );
      })}
    </TimelineTrack>
  );
}
