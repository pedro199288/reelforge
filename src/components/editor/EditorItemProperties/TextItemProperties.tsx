import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import type { TextItem, TextItemBackground } from "@/types/editor";
import { FontPicker } from "@/components/editor/FontPicker";
import { cn } from "@/lib/utils";
import { AnimationSection } from "./AnimationSection";

interface TextItemPropertiesProps {
  item: TextItem;
  onUpdate: (updates: Record<string, unknown>) => void;
}

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-1 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ChevronRight
          className={cn(
            "size-3.5 transition-transform",
            open && "rotate-90"
          )}
        />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pb-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-1">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded border cursor-pointer"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-xs flex-1"
        />
      </div>
    </div>
  );
}

const TEXT_TRANSFORMS = [
  { value: "none", label: "Aa" },
  { value: "uppercase", label: "ABC" },
  { value: "lowercase", label: "abc" },
  { value: "capitalize", label: "Abc" },
] as const;

export function TextItemProperties({
  item,
  onUpdate,
}: TextItemPropertiesProps) {
  const isBold = item.fontWeight >= 700;
  const isItalic = item.italic ?? false;
  const isUnderline = item.underline ?? false;
  const currentTransform = item.textTransform ?? "none";
  const hasBackground = !!item.background;

  return (
    <div className="space-y-1">
      {/* ── Contenido ── */}
      <div className="space-y-2 pb-2">
        <div className="space-y-1">
          <Label className="text-xs">Texto</Label>
          <textarea
            value={item.text}
            onChange={(e) =>
              onUpdate({
                text: e.target.value,
                name: e.target.value.slice(0, 20) || "Text",
              })
            }
            className="w-full h-20 rounded-md border bg-background px-2 py-1.5 text-xs resize-none"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fuente</Label>
          <FontPicker
            value={item.fontFamily}
            onValueChange={(f) => onUpdate({ fontFamily: f })}
          />
        </div>
      </div>

      {/* ── Tipografia ── */}
      <Section title="Tipografia" defaultOpen>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Tamano</Label>
            <Input
              type="number"
              value={item.fontSize}
              onChange={(e) =>
                onUpdate({ fontSize: parseInt(e.target.value) || 48 })
              }
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
              onChange={(e) =>
                onUpdate({ fontWeight: parseInt(e.target.value) || 700 })
              }
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">
            Interlineado: {(item.lineHeight ?? 1.2).toFixed(1)}
          </Label>
          <Slider
            value={[item.lineHeight ?? 1.2]}
            min={0.5}
            max={3}
            step={0.1}
            onValueChange={([v]) => onUpdate({ lineHeight: v })}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">
            Espaciado: {(item.letterSpacing ?? 0).toFixed(1)}px
          </Label>
          <Slider
            value={[item.letterSpacing ?? 0]}
            min={-5}
            max={20}
            step={0.5}
            onValueChange={([v]) => onUpdate({ letterSpacing: v })}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Estilo</Label>
          <div className="flex gap-1">
            <Button
              variant={isBold ? "default" : "outline"}
              size="xs"
              className="font-bold"
              onClick={() =>
                onUpdate({ fontWeight: isBold ? 400 : 700 })
              }
            >
              B
            </Button>
            <Button
              variant={isItalic ? "default" : "outline"}
              size="xs"
              className="italic"
              onClick={() => onUpdate({ italic: !isItalic })}
            >
              I
            </Button>
            <Button
              variant={isUnderline ? "default" : "outline"}
              size="xs"
              className="underline"
              onClick={() => onUpdate({ underline: !isUnderline })}
            >
              U
            </Button>
          </div>
        </div>
      </Section>

      {/* ── Color y Opacidad ── */}
      <Section title="Color y Opacidad" defaultOpen>
        <ColorField
          label="Color texto"
          value={item.color}
          onChange={(v) => onUpdate({ color: v })}
        />

        <div className="space-y-1">
          <Label className="text-xs">
            Opacidad: {((item.textOpacity ?? 1) * 100).toFixed(0)}%
          </Label>
          <Slider
            value={[item.textOpacity ?? 1]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={([v]) => onUpdate({ textOpacity: v })}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Transformar texto</Label>
          <div className="flex gap-1">
            {TEXT_TRANSFORMS.map((t) => (
              <Button
                key={t.value}
                variant={currentTransform === t.value ? "default" : "outline"}
                size="xs"
                onClick={() => onUpdate({ textTransform: t.value })}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Stroke ── */}
      <Section title="Stroke" defaultOpen={false}>
        <ColorField
          label="Color stroke"
          value={item.strokeColor}
          onChange={(v) => onUpdate({ strokeColor: v })}
        />
        <div className="space-y-1">
          <Label className="text-xs">
            Grosor: {item.strokeWidth}px
          </Label>
          <Slider
            value={[item.strokeWidth]}
            min={0}
            max={10}
            step={0.5}
            onValueChange={([v]) => onUpdate({ strokeWidth: v })}
          />
        </div>
      </Section>

      {/* ── Sombra ── */}
      <Section title="Sombra" defaultOpen={false}>
        <ColorField
          label="Color sombra"
          value={item.textShadow?.color ?? "#000000"}
          onChange={(v) =>
            onUpdate({
              textShadow: {
                color: v,
                offsetX: item.textShadow?.offsetX ?? 2,
                offsetY: item.textShadow?.offsetY ?? 2,
                blur: item.textShadow?.blur ?? 4,
              },
            })
          }
        />
        <div className="space-y-1">
          <Label className="text-xs">
            Blur: {item.textShadow?.blur ?? 0}px
          </Label>
          <Slider
            value={[item.textShadow?.blur ?? 0]}
            min={0}
            max={30}
            step={1}
            onValueChange={([v]) =>
              onUpdate({
                textShadow: {
                  color: item.textShadow?.color ?? "#000000",
                  offsetX: item.textShadow?.offsetX ?? 2,
                  offsetY: item.textShadow?.offsetY ?? 2,
                  blur: v,
                },
              })
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">
              Offset X: {item.textShadow?.offsetX ?? 0}
            </Label>
            <Slider
              value={[item.textShadow?.offsetX ?? 0]}
              min={-50}
              max={50}
              step={1}
              onValueChange={([v]) =>
                onUpdate({
                  textShadow: {
                    color: item.textShadow?.color ?? "#000000",
                    offsetX: v,
                    offsetY: item.textShadow?.offsetY ?? 2,
                    blur: item.textShadow?.blur ?? 4,
                  },
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              Offset Y: {item.textShadow?.offsetY ?? 0}
            </Label>
            <Slider
              value={[item.textShadow?.offsetY ?? 0]}
              min={-50}
              max={50}
              step={1}
              onValueChange={([v]) =>
                onUpdate({
                  textShadow: {
                    color: item.textShadow?.color ?? "#000000",
                    offsetX: item.textShadow?.offsetX ?? 2,
                    offsetY: v,
                    blur: item.textShadow?.blur ?? 4,
                  },
                })
              }
            />
          </div>
        </div>
        {item.textShadow && (
          <Button
            variant="ghost"
            size="xs"
            className="text-xs text-muted-foreground"
            onClick={() => onUpdate({ textShadow: undefined })}
          >
            Quitar sombra
          </Button>
        )}
      </Section>

      {/* ── Fondo ── */}
      <Section title="Fondo" defaultOpen={false}>
        <div className="flex items-center gap-2">
          <Switch
            size="sm"
            checked={hasBackground}
            onCheckedChange={(checked) => {
              if (checked) {
                onUpdate({
                  background: {
                    color: "#000000",
                    borderRadius: 8,
                    opacity: 0.7,
                    paddingX: 16,
                    paddingY: 8,
                  } satisfies TextItemBackground,
                });
              } else {
                onUpdate({ background: undefined });
              }
            }}
          />
          <Label className="text-xs">Activar fondo</Label>
        </div>

        {item.background && (
          <>
            <ColorField
              label="Color fondo"
              value={item.background.color}
              onChange={(v) =>
                onUpdate({
                  background: { ...item.background!, color: v },
                })
              }
            />
            <div className="space-y-1">
              <Label className="text-xs">
                Opacidad: {(item.background.opacity * 100).toFixed(0)}%
              </Label>
              <Slider
                value={[item.background.opacity]}
                min={0}
                max={1}
                step={0.01}
                onValueChange={([v]) =>
                  onUpdate({
                    background: { ...item.background!, opacity: v },
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Border radius: {item.background.borderRadius}px
              </Label>
              <Slider
                value={[item.background.borderRadius]}
                min={0}
                max={30}
                step={1}
                onValueChange={([v]) =>
                  onUpdate({
                    background: { ...item.background!, borderRadius: v },
                  })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">
                  Padding X: {item.background.paddingX}
                </Label>
                <Slider
                  value={[item.background.paddingX]}
                  min={0}
                  max={50}
                  step={1}
                  onValueChange={([v]) =>
                    onUpdate({
                      background: { ...item.background!, paddingX: v },
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  Padding Y: {item.background.paddingY}
                </Label>
                <Slider
                  value={[item.background.paddingY]}
                  min={0}
                  max={50}
                  step={1}
                  onValueChange={([v]) =>
                    onUpdate({
                      background: { ...item.background!, paddingY: v },
                    })
                  }
                />
              </div>
            </div>
          </>
        )}
      </Section>

      {/* ── Layout ── */}
      <Section title="Layout" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Posicion X</Label>
            <Input
              type="number"
              value={item.position.x}
              onChange={(e) =>
                onUpdate({
                  position: {
                    ...item.position,
                    x: parseInt(e.target.value) || 0,
                  },
                })
              }
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Posicion Y</Label>
            <Input
              type="number"
              value={item.position.y}
              onChange={(e) =>
                onUpdate({
                  position: {
                    ...item.position,
                    y: parseInt(e.target.value) || 0,
                  },
                })
              }
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={item.textBoxWidth === null}
              onCheckedChange={(checked) =>
                onUpdate({ textBoxWidth: checked ? null : 400 })
              }
            />
            <Label className="text-xs">Ancho auto</Label>
          </div>
          {item.textBoxWidth !== null && (
            <div className="space-y-1">
              <Label className="text-xs">
                Ancho: {item.textBoxWidth}px
              </Label>
              <Slider
                value={[item.textBoxWidth]}
                min={50}
                max={1080}
                step={10}
                onValueChange={([v]) => onUpdate({ textBoxWidth: v })}
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={item.textBoxHeight === null}
              onCheckedChange={(checked) =>
                onUpdate({ textBoxHeight: checked ? null : 200 })
              }
            />
            <Label className="text-xs">Alto auto</Label>
          </div>
          {item.textBoxHeight !== null && (
            <div className="space-y-1">
              <Label className="text-xs">
                Alto: {item.textBoxHeight}px
              </Label>
              <Slider
                value={[item.textBoxHeight]}
                min={20}
                max={1920}
                step={10}
                onValueChange={([v]) => onUpdate({ textBoxHeight: v })}
              />
            </div>
          )}
        </div>
      </Section>

      <AnimationSection
        animations={item.animations}
        maxDurationInFrames={item.durationInFrames}
        onUpdate={onUpdate}
      />
    </div>
  );
}
