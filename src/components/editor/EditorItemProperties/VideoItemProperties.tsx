import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VideoItem } from "@/types/editor";

interface VideoItemPropertiesProps {
  item: VideoItem;
  onUpdate: (updates: Record<string, unknown>) => void;
}

export function VideoItemProperties({ item, onUpdate }: VideoItemPropertiesProps) {
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

      <div className="space-y-1">
        <Label className="text-xs">Velocidad: {item.playbackRate}x</Label>
        <Slider
          value={[item.playbackRate]}
          min={0.25}
          max={4}
          step={0.25}
          onValueChange={([v]) => onUpdate({ playbackRate: v })}
        />
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

      <div className="space-y-1">
        <Label className="text-xs">Ajuste</Label>
        <Select value={item.fit} onValueChange={(v) => onUpdate({ fit: v })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cover">Cover</SelectItem>
            <SelectItem value="contain">Contain</SelectItem>
            <SelectItem value="fill">Fill</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
