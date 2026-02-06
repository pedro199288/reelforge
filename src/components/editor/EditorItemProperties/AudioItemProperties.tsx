import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import type { AudioItem } from "@/types/editor";

interface AudioItemPropertiesProps {
  item: AudioItem;
  onUpdate: (updates: Record<string, unknown>) => void;
}

export function AudioItemProperties({ item, onUpdate }: AudioItemPropertiesProps) {
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
        <Label className="text-xs">Fuente</Label>
        <Input
          value={item.src}
          readOnly
          className="h-8 text-xs text-muted-foreground"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Volumen: {Math.round(item.volume * 100)}%</Label>
        <Slider
          value={[item.volume]}
          min={0}
          max={1}
          step={0.01}
          onValueChange={([v]) => onUpdate({ volume: v })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Fade In (frames)</Label>
          <Input
            type="number"
            value={item.fadeInFrames}
            min={0}
            onChange={(e) => onUpdate({ fadeInFrames: parseInt(e.target.value) || 0 })}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fade Out (frames)</Label>
          <Input
            type="number"
            value={item.fadeOutFrames}
            min={0}
            onChange={(e) => onUpdate({ fadeOutFrames: parseInt(e.target.value) || 0 })}
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Trim inicio (frames)</Label>
          <Input
            type="number"
            value={item.trimStartFrame}
            onChange={(e) => onUpdate({ trimStartFrame: parseInt(e.target.value) || 0 })}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Trim fin (frames)</Label>
          <Input
            type="number"
            value={item.trimEndFrame}
            onChange={(e) => onUpdate({ trimEndFrame: parseInt(e.target.value) || 0 })}
            className="h-8 text-xs"
          />
        </div>
      </div>
    </div>
  );
}
