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
import type { ImageItem } from "@/types/editor";

interface ImageItemPropertiesProps {
  item: ImageItem;
  onUpdate: (updates: Record<string, unknown>) => void;
}

export function ImageItemProperties({ item, onUpdate }: ImageItemPropertiesProps) {
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

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Posición X</Label>
          <Input
            type="number"
            value={item.position.x}
            onChange={(e) => onUpdate({ position: { ...item.position, x: parseInt(e.target.value) || 0 } })}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Posición Y</Label>
          <Input
            type="number"
            value={item.position.y}
            onChange={(e) => onUpdate({ position: { ...item.position, y: parseInt(e.target.value) || 0 } })}
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Escala: {item.scale.toFixed(2)}x</Label>
        <Slider
          value={[item.scale]}
          min={0.1}
          max={5}
          step={0.1}
          onValueChange={([v]) => onUpdate({ scale: v })}
        />
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
