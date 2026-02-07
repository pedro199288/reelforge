import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ItemAnimations, AnimationPreset } from "@/types/animation";
import {
  DEFAULT_ITEM_ANIMATIONS,
  ANIMATION_PRESET_LABELS,
} from "@/types/animation";

interface AnimationSectionProps {
  animations: ItemAnimations | undefined;
  maxDurationInFrames: number;
  onUpdate: (updates: Record<string, unknown>) => void;
}

const PRESETS = Object.keys(ANIMATION_PRESET_LABELS) as AnimationPreset[];

export function AnimationSection({
  animations,
  maxDurationInFrames,
  onUpdate,
}: AnimationSectionProps) {
  const anim = animations ?? DEFAULT_ITEM_ANIMATIONS;

  const updateEnter = (patch: Partial<typeof anim.enter>) => {
    onUpdate({
      animations: {
        ...anim,
        enter: { ...anim.enter, ...patch },
      },
    });
  };

  const updateExit = (patch: Partial<typeof anim.exit>) => {
    onUpdate({
      animations: {
        ...anim,
        exit: { ...anim.exit, ...patch },
      },
    });
  };

  return (
    <>
      <Separator className="my-3" />
      <div className="space-y-3">
        <Label className="text-xs font-medium text-muted-foreground">
          Animaciones
        </Label>

        {/* Entrada */}
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Entrada</Label>
            <Select
              value={anim.enter.preset}
              onValueChange={(v) =>
                updateEnter({ preset: v as AnimationPreset })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {ANIMATION_PRESET_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {anim.enter.preset !== "none" && (
            <div className="space-y-1">
              <Label className="text-xs">
                Duración entrada (frames)
              </Label>
              <Input
                type="number"
                value={anim.enter.durationInFrames}
                min={1}
                max={maxDurationInFrames}
                onChange={(e) =>
                  updateEnter({
                    durationInFrames: Math.max(
                      1,
                      Math.min(
                        parseInt(e.target.value) || 1,
                        maxDurationInFrames
                      )
                    ),
                  })
                }
                className="h-8 text-xs"
              />
            </div>
          )}
        </div>

        {/* Salida */}
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Salida</Label>
            <Select
              value={anim.exit.preset}
              onValueChange={(v) =>
                updateExit({ preset: v as AnimationPreset })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {ANIMATION_PRESET_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {anim.exit.preset !== "none" && (
            <div className="space-y-1">
              <Label className="text-xs">
                Duración salida (frames)
              </Label>
              <Input
                type="number"
                value={anim.exit.durationInFrames}
                min={1}
                max={maxDurationInFrames}
                onChange={(e) =>
                  updateExit({
                    durationInFrames: Math.max(
                      1,
                      Math.min(
                        parseInt(e.target.value) || 1,
                        maxDurationInFrames
                      )
                    ),
                  })
                }
                className="h-8 text-xs"
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
