import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import type { SolidItem } from "@/types/editor";
import { AnimationSection } from "./AnimationSection";

interface SolidItemPropertiesProps {
  item: SolidItem;
  onUpdate: (updates: Record<string, unknown>) => void;
}

export function SolidItemProperties({ item, onUpdate }: SolidItemPropertiesProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Nombre</Label>
        <Input
          value={item.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="h-8 text-xs"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Color</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={item.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
            className="w-10 h-10 rounded border cursor-pointer"
          />
          <Input
            value={item.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
            className="h-8 text-xs flex-1"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Opacidad: {Math.round(item.opacity * 100)}%</Label>
        <Slider
          value={[item.opacity]}
          min={0}
          max={1}
          step={0.01}
          onValueChange={([v]) => onUpdate({ opacity: v })}
        />
      </div>

      <AnimationSection
        animations={item.animations}
        maxDurationInFrames={item.durationInFrames}
        onUpdate={onUpdate}
      />
    </div>
  );
}
