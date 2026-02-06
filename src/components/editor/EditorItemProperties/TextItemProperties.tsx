import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import type { TextItem } from "@/types/editor";

interface TextItemPropertiesProps {
  item: TextItem;
  onUpdate: (updates: Record<string, unknown>) => void;
}

export function TextItemProperties({ item, onUpdate }: TextItemPropertiesProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Texto</Label>
        <textarea
          value={item.text}
          onChange={(e) => onUpdate({ text: e.target.value, name: e.target.value.slice(0, 20) || "Text" })}
          className="w-full h-20 rounded-md border bg-background px-2 py-1.5 text-xs resize-none"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Fuente</Label>
        <Input
          value={item.fontFamily}
          onChange={(e) => onUpdate({ fontFamily: e.target.value })}
          className="h-8 text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Tamaño</Label>
          <Input
            type="number"
            value={item.fontSize}
            onChange={(e) => onUpdate({ fontSize: parseInt(e.target.value) || 48 })}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Peso</Label>
          <Input
            type="number"
            value={item.fontWeight}
            min={100}
            max={900}
            step={100}
            onChange={(e) => onUpdate({ fontWeight: parseInt(e.target.value) || 700 })}
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Color</Label>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={item.color}
              onChange={(e) => onUpdate({ color: e.target.value })}
              className="w-8 h-8 rounded border cursor-pointer"
            />
            <Input
              value={item.color}
              onChange={(e) => onUpdate({ color: e.target.value })}
              className="h-8 text-xs flex-1"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Stroke</Label>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={item.strokeColor}
              onChange={(e) => onUpdate({ strokeColor: e.target.value })}
              className="w-8 h-8 rounded border cursor-pointer"
            />
            <Input
              value={item.strokeColor}
              onChange={(e) => onUpdate({ strokeColor: e.target.value })}
              className="h-8 text-xs flex-1"
            />
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Stroke Width: {item.strokeWidth}px</Label>
        <Slider
          value={[item.strokeWidth]}
          min={0}
          max={10}
          step={0.5}
          onValueChange={([v]) => onUpdate({ strokeWidth: v })}
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
    </div>
  );
}
