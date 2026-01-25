import { HexColorPicker } from "react-colorful";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, Save, RotateCcw, Trash2 } from "lucide-react";
import {
  useSubtitleStore,
  useSubtitleStyle,
  useSubtitlePresets,
  AVAILABLE_FONTS,
  ENTRANCE_ANIMATIONS,
  HIGHLIGHT_EFFECTS,
  POSITIONS,
  FONT_WEIGHTS,
  HIGHLIGHT_COLORS,
  DEFAULT_PRESETS,
  type SubtitleStyle,
} from "@/store/subtitles";

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, children, defaultOpen = false }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between py-2 px-1 hover:bg-accent/50 rounded-md transition-colors">
        <span className="text-sm font-medium">{title}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-2 pb-4 px-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
  presets?: readonly { name: string; value: string }[];
}

function ColorPicker({ label, value, onChange, presets }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="w-8 h-8 rounded-md border-2 border-border shadow-sm"
          style={{ backgroundColor: value }}
          onClick={() => setIsOpen(!isOpen)}
        />
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-24 font-mono text-xs"
        />
        {presets && (
          <div className="flex gap-1">
            {presets.slice(0, 4).map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`w-5 h-5 rounded-full border ${
                  value === preset.value ? "ring-2 ring-primary ring-offset-1" : ""
                }`}
                style={{ backgroundColor: preset.value }}
                onClick={() => onChange(preset.value)}
                title={preset.name}
              />
            ))}
          </div>
        )}
      </div>
      {isOpen && (
        <div className="pt-2">
          <HexColorPicker color={value} onChange={onChange} className="w-full" />
        </div>
      )}
    </div>
  );
}

interface SliderFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "",
}: SliderFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs text-muted-foreground font-mono">
          {value}
          {unit}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
      />
    </div>
  );
}

function FontSection() {
  const style = useSubtitleStyle();
  const setStyle = useSubtitleStore((s) => s.setStyle);

  return (
    <Section title="Fuente" defaultOpen>
      <div className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs">Familia</Label>
          <Select
            value={style.fontFamily}
            onValueChange={(v) => setStyle({ fontFamily: v as SubtitleStyle["fontFamily"] })}
          >
            <SelectTrigger className="w-full h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AVAILABLE_FONTS.map((font) => (
                <SelectItem key={font.id} value={font.id}>
                  <span style={{ fontFamily: font.id }}>{font.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <SliderField
          label="Tamaño"
          value={style.fontSize}
          onChange={(v) => setStyle({ fontSize: v })}
          min={40}
          max={200}
          unit="px"
        />

        <div className="space-y-2">
          <Label className="text-xs">Peso</Label>
          <Select
            value={style.fontWeight}
            onValueChange={(v) => setStyle({ fontWeight: v as SubtitleStyle["fontWeight"] })}
          >
            <SelectTrigger className="w-full h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHTS.map((weight) => (
                <SelectItem key={weight} value={weight}>
                  {weight.charAt(0).toUpperCase() + weight.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </Section>
  );
}

function ColorSection() {
  const style = useSubtitleStyle();
  const setStyle = useSubtitleStore((s) => s.setStyle);

  return (
    <Section title="Colores" defaultOpen>
      <div className="space-y-4">
        <ColorPicker
          label="Texto"
          value={style.textColor}
          onChange={(v) => setStyle({ textColor: v })}
        />
        <ColorPicker
          label="Highlight"
          value={style.highlightColor}
          onChange={(v) => setStyle({ highlightColor: v })}
          presets={HIGHLIGHT_COLORS}
        />
        <ColorPicker
          label="Borde"
          value={style.strokeColor}
          onChange={(v) => setStyle({ strokeColor: v })}
        />
        <SliderField
          label="Grosor de borde"
          value={style.strokeWidth}
          onChange={(v) => setStyle({ strokeWidth: v })}
          min={0}
          max={40}
          unit="px"
        />
      </div>
    </Section>
  );
}

function ShadowSection() {
  const style = useSubtitleStyle();
  const setStyle = useSubtitleStore((s) => s.setStyle);

  return (
    <Section title="Sombra">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Activar sombra</Label>
          <Switch
            checked={style.shadowEnabled}
            onCheckedChange={(v) => setStyle({ shadowEnabled: v })}
          />
        </div>

        {style.shadowEnabled && (
          <>
            <ColorPicker
              label="Color"
              value={style.shadowColor}
              onChange={(v) => setStyle({ shadowColor: v })}
            />
            <SliderField
              label="Blur"
              value={style.shadowBlur}
              onChange={(v) => setStyle({ shadowBlur: v })}
              min={0}
              max={50}
              unit="px"
            />
            <SliderField
              label="Offset X"
              value={style.shadowOffsetX}
              onChange={(v) => setStyle({ shadowOffsetX: v })}
              min={-20}
              max={20}
              unit="px"
            />
            <SliderField
              label="Offset Y"
              value={style.shadowOffsetY}
              onChange={(v) => setStyle({ shadowOffsetY: v })}
              min={-20}
              max={20}
              unit="px"
            />
          </>
        )}
      </div>
    </Section>
  );
}

function BackgroundSection() {
  const style = useSubtitleStyle();
  const setStyle = useSubtitleStore((s) => s.setStyle);

  return (
    <Section title="Fondo">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Activar fondo</Label>
          <Switch
            checked={style.backgroundEnabled}
            onCheckedChange={(v) => setStyle({ backgroundEnabled: v })}
          />
        </div>

        {style.backgroundEnabled && (
          <>
            <ColorPicker
              label="Color"
              value={style.backgroundColor}
              onChange={(v) => setStyle({ backgroundColor: v })}
            />
            <SliderField
              label="Opacidad"
              value={style.backgroundOpacity}
              onChange={(v) => setStyle({ backgroundOpacity: v })}
              min={0}
              max={1}
              step={0.1}
            />
            <SliderField
              label="Padding"
              value={style.backgroundPadding}
              onChange={(v) => setStyle({ backgroundPadding: v })}
              min={0}
              max={40}
              unit="px"
            />
          </>
        )}
      </div>
    </Section>
  );
}

function AnimationSection() {
  const style = useSubtitleStyle();
  const setStyle = useSubtitleStore((s) => s.setStyle);

  return (
    <Section title="Animación de entrada">
      <div className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs">Tipo</Label>
          <Select
            value={style.entranceAnimation}
            onValueChange={(v) =>
              setStyle({ entranceAnimation: v as SubtitleStyle["entranceAnimation"] })
            }
          >
            <SelectTrigger className="w-full h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENTRANCE_ANIMATIONS.map((anim) => (
                <SelectItem key={anim.id} value={anim.id}>
                  {anim.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <SliderField
          label="Duración"
          value={style.entranceDuration}
          onChange={(v) => setStyle({ entranceDuration: v })}
          min={100}
          max={1000}
          step={50}
          unit="ms"
        />
      </div>
    </Section>
  );
}

function HighlightSection() {
  const style = useSubtitleStyle();
  const setStyle = useSubtitleStore((s) => s.setStyle);

  return (
    <Section title="Efecto de highlight">
      <div className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs">Tipo</Label>
          <Select
            value={style.highlightEffect}
            onValueChange={(v) =>
              setStyle({ highlightEffect: v as SubtitleStyle["highlightEffect"] })
            }
          >
            <SelectTrigger className="w-full h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HIGHLIGHT_EFFECTS.map((effect) => (
                <SelectItem key={effect.id} value={effect.id}>
                  {effect.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(style.highlightEffect === "scale" ||
          style.highlightEffect === "glow") && (
          <SliderField
            label="Intensidad"
            value={style.highlightIntensity}
            onChange={(v) => setStyle({ highlightIntensity: v })}
            min={1}
            max={2}
            step={0.05}
          />
        )}
      </div>
    </Section>
  );
}

function PositionSection() {
  const style = useSubtitleStyle();
  const setStyle = useSubtitleStore((s) => s.setStyle);

  return (
    <Section title="Posición">
      <div className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs">Vertical</Label>
          <Select
            value={style.position}
            onValueChange={(v) => setStyle({ position: v as SubtitleStyle["position"] })}
          >
            <SelectTrigger className="w-full h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POSITIONS.map((pos) => (
                <SelectItem key={pos.id} value={pos.id}>
                  {pos.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {style.position === "bottom" && (
          <SliderField
            label="Margen inferior"
            value={style.marginBottom}
            onChange={(v) => setStyle({ marginBottom: v })}
            min={50}
            max={600}
            unit="px"
          />
        )}
      </div>
    </Section>
  );
}

function PresetsSection() {
  const presets = useSubtitlePresets();
  const { loadPreset, savePreset, deletePreset, resetToDefault } = useSubtitleStore();
  const [newPresetName, setNewPresetName] = useState("");

  const customPresets = Object.keys(presets).filter(
    (name) => !(name in DEFAULT_PRESETS)
  );
  const builtInPresets = Object.keys(DEFAULT_PRESETS);

  const handleSavePreset = () => {
    if (newPresetName.trim()) {
      savePreset(newPresetName.trim());
      setNewPresetName("");
    }
  };

  return (
    <Section title="Presets">
      <div className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs">Presets incluidos</Label>
          <div className="flex flex-wrap gap-2">
            {builtInPresets.map((name) => (
              <Button
                key={name}
                variant="outline"
                size="sm"
                onClick={() => loadPreset(name)}
                className="h-7 text-xs"
              >
                {name}
              </Button>
            ))}
          </div>
        </div>

        {customPresets.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs">Mis presets</Label>
            <div className="flex flex-wrap gap-2">
              {customPresets.map((name) => (
                <div key={name} className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadPreset(name)}
                    className="h-7 text-xs"
                  >
                    {name}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deletePreset(name)}
                    className="h-7 w-7 p-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Nombre del preset"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            className="h-8 text-xs"
            onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleSavePreset}
            disabled={!newPresetName.trim()}
            className="h-8"
          >
            <Save className="h-3 w-3" />
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={resetToDefault}
          className="w-full h-8 text-xs"
        >
          <RotateCcw className="h-3 w-3 mr-2" />
          Restablecer valores
        </Button>
      </div>
    </Section>
  );
}

export function SubtitleEditor() {
  return (
    <div className="space-y-1 divide-y divide-border">
      <PresetsSection />
      <FontSection />
      <ColorSection />
      <ShadowSection />
      <BackgroundSection />
      <AnimationSection />
      <HighlightSection />
      <PositionSection />
    </div>
  );
}

export default SubtitleEditor;
