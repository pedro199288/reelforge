import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useWorkspaceStore, SILENCE_DEFAULTS } from "@/store/workspace";
import type {
  TakeSelectionCriteria,
  Resolution,
  FPS,
  RenderQuality,
} from "@/store/workspace";
import { ProfileSelector } from "./ProfileSelector";
import { AI_PRESELECTION_MODELS } from "@/core/preselection/types";
import type { AIProvider } from "@/core/preselection/types";

interface ConfigPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ConfigPanel({ open, onClose }: ConfigPanelProps) {
  const pipelineConfig = useWorkspaceStore((s) => s.pipelineConfig);
  const setPipelineConfig = useWorkspaceStore((s) => s.setPipelineConfig);
  const resetPipelineConfig = useWorkspaceStore((s) => s.resetPipelineConfig);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[400px] sm:w-[450px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span>Configuracion</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4">
          <ProfileSelector />
        </div>

        <Separator className="my-4" />

        <Accordion type="multiple" defaultValue={["silence", "takes", "output"]}>
          {/* Silence Detection Section */}
          <AccordionItem value="silence">
            <AccordionTrigger>Deteccion de Silencios</AccordionTrigger>
            <AccordionContent className="space-y-6 pt-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Threshold</Label>
                  <span className="text-sm text-muted-foreground">
                    {pipelineConfig.silence.thresholdDb ?? SILENCE_DEFAULTS.thresholdDb} dB
                  </span>
                </div>
                <Slider
                  value={[pipelineConfig.silence.thresholdDb ?? SILENCE_DEFAULTS.thresholdDb]}
                  onValueChange={([v]) =>
                    setPipelineConfig({
                      silence: { ...pipelineConfig.silence, thresholdDb: v },
                    })
                  }
                  min={-60}
                  max={-20}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  Audio por debajo de este nivel se considera silencio
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Duracion minima</Label>
                  <span className="text-sm text-muted-foreground">
                    {pipelineConfig.silence.minDurationSec ?? SILENCE_DEFAULTS.minDurationSec}s
                  </span>
                </div>
                <Slider
                  value={[pipelineConfig.silence.minDurationSec ?? SILENCE_DEFAULTS.minDurationSec]}
                  onValueChange={([v]) =>
                    setPipelineConfig({
                      silence: { ...pipelineConfig.silence, minDurationSec: v },
                    })
                  }
                  min={0.1}
                  max={2}
                  step={0.1}
                />
                <p className="text-xs text-muted-foreground">
                  Silencios mas cortos se ignoran
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Padding</Label>
                  <span className="text-sm text-muted-foreground">
                    {pipelineConfig.silence.paddingSec ?? SILENCE_DEFAULTS.paddingSec}s
                  </span>
                </div>
                <Slider
                  value={[pipelineConfig.silence.paddingSec ?? SILENCE_DEFAULTS.paddingSec]}
                  onValueChange={([v]) =>
                    setPipelineConfig({
                      silence: { ...pipelineConfig.silence, paddingSec: v },
                    })
                  }
                  min={0}
                  max={0.5}
                  step={0.01}
                />
                <p className="text-xs text-muted-foreground">
                  Tiempo extra a mantener al inicio/fin de cada segmento
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Preselection AI Section */}
          <AccordionItem value="preselection">
            <AccordionTrigger>Preseleccion con IA</AccordionTrigger>
            <AccordionContent className="space-y-6 pt-4">
              {/* Switch para habilitar */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Usar IA para preseleccion</Label>
                  <p className="text-xs text-muted-foreground">
                    Reemplaza el algoritmo tradicional con analisis de IA
                  </p>
                </div>
                <Switch
                  checked={pipelineConfig.preselection?.ai?.enabled ?? false}
                  onCheckedChange={(v) =>
                    setPipelineConfig({
                      preselection: {
                        ai: { ...pipelineConfig.preselection?.ai, enabled: v },
                      },
                    })
                  }
                />
              </div>

              {/* Opciones cuando esta habilitado */}
              {pipelineConfig.preselection?.ai?.enabled && (
                <>
                  {/* Selector de modelo */}
                  <div className="space-y-2">
                    <Label>Proveedor / Modelo</Label>
                    <Select
                      value={`${pipelineConfig.preselection.ai.provider}:${pipelineConfig.preselection.ai.modelId}`}
                      onValueChange={(v) => {
                        const [provider, modelId] = v.split(":") as [AIProvider, string];
                        setPipelineConfig({
                          preselection: {
                            ai: { ...pipelineConfig.preselection?.ai, provider, modelId },
                          },
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AI_PRESELECTION_MODELS.map((m) => (
                          <SelectItem
                            key={`${m.provider}:${m.modelId}`}
                            value={`${m.provider}:${m.modelId}`}
                          >
                            {m.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Campos para servidor local (LM Studio, Ollama) */}
                  {pipelineConfig.preselection.ai.provider === "openai-compatible" && (
                    <>
                      <div className="space-y-2">
                        <Label>URL del servidor</Label>
                        <Input
                          type="text"
                          placeholder="http://localhost:1234/v1"
                          value={pipelineConfig.preselection?.ai?.baseUrl ?? ""}
                          onChange={(e) =>
                            setPipelineConfig({
                              preselection: {
                                ai: {
                                  ...pipelineConfig.preselection?.ai,
                                  baseUrl: e.target.value || undefined,
                                },
                              },
                            })
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          LM Studio: http://localhost:1234/v1 | Ollama: http://localhost:11434/v1
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Nombre del modelo</Label>
                        <Input
                          type="text"
                          placeholder="Ej: llama-3.2-3b-instruct"
                          value={pipelineConfig.preselection?.ai?.modelId ?? ""}
                          onChange={(e) =>
                            setPipelineConfig({
                              preselection: {
                                ai: {
                                  ...pipelineConfig.preselection?.ai,
                                  modelId: e.target.value || "local-model",
                                },
                              },
                            })
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Nombre del modelo cargado en LM Studio u Ollama
                        </p>
                      </div>
                    </>
                  )}

                  {/* Input para API key (solo para proveedores cloud) */}
                  {pipelineConfig.preselection.ai.provider !== "openai-compatible" && (
                    <div className="space-y-2">
                      <Label>API Key</Label>
                      <Input
                        type="password"
                        placeholder="Requerida para usar IA"
                        value={pipelineConfig.preselection?.ai?.apiKey ?? ""}
                        onChange={(e) =>
                          setPipelineConfig({
                            preselection: {
                              ai: {
                                ...pipelineConfig.preselection?.ai,
                                apiKey: e.target.value || undefined,
                              },
                            },
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Introduce tu API key de Anthropic u OpenAI segun el modelo
                      </p>
                    </div>
                  )}
                </>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Take Detection Section */}
          <AccordionItem value="takes">
            <AccordionTrigger>Deteccion de Tomas</AccordionTrigger>
            <AccordionContent className="space-y-6 pt-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Similitud minima</Label>
                  <span className="text-sm text-muted-foreground">
                    {pipelineConfig.takes.minSimilarity}%
                  </span>
                </div>
                <Slider
                  value={[pipelineConfig.takes.minSimilarity]}
                  onValueChange={([v]) =>
                    setPipelineConfig({
                      takes: { ...pipelineConfig.takes, minSimilarity: v },
                    })
                  }
                  min={50}
                  max={100}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  Porcentaje minimo de similitud para agrupar tomas
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-seleccionar mejor toma</Label>
                  <p className="text-xs text-muted-foreground">
                    Selecciona automaticamente la mejor toma de cada grupo
                  </p>
                </div>
                <Switch
                  checked={pipelineConfig.takes.autoSelectBest}
                  onCheckedChange={(v) =>
                    setPipelineConfig({
                      takes: { ...pipelineConfig.takes, autoSelectBest: v },
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Criterio de seleccion</Label>
                <Select
                  value={pipelineConfig.takes.selectionCriteria}
                  onValueChange={(v: TakeSelectionCriteria) =>
                    setPipelineConfig({
                      takes: { ...pipelineConfig.takes, selectionCriteria: v },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clarity">Claridad</SelectItem>
                    <SelectItem value="fluency">Fluidez</SelectItem>
                    <SelectItem value="energy">Energia</SelectItem>
                    <SelectItem value="duration">Duracion</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Criterio principal para evaluar la mejor toma
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Output Section */}
          <AccordionItem value="output">
            <AccordionTrigger>Output</AccordionTrigger>
            <AccordionContent className="space-y-6 pt-4">
              <div className="space-y-2">
                <Label>Duracion maxima (segundos)</Label>
                <Input
                  type="number"
                  placeholder="Sin limite"
                  value={pipelineConfig.output.maxDurationSec ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPipelineConfig({
                      output: {
                        ...pipelineConfig.output,
                        maxDurationSec: v ? Number(v) : null,
                      },
                    });
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Dejar vacio para sin limite
                </p>
              </div>

              <div className="space-y-2">
                <Label>Resolucion</Label>
                <Select
                  value={pipelineConfig.output.resolution}
                  onValueChange={(v: Resolution) =>
                    setPipelineConfig({
                      output: { ...pipelineConfig.output, resolution: v },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1080x1920">1080x1920 (9:16 Vertical)</SelectItem>
                    <SelectItem value="1080x1080">1080x1080 (1:1 Cuadrado)</SelectItem>
                    <SelectItem value="1920x1080">1920x1080 (16:9 Horizontal)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>FPS</Label>
                <Select
                  value={String(pipelineConfig.output.fps)}
                  onValueChange={(v) =>
                    setPipelineConfig({
                      output: { ...pipelineConfig.output, fps: Number(v) as FPS },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">24 fps</SelectItem>
                    <SelectItem value="30">30 fps</SelectItem>
                    <SelectItem value="60">60 fps</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Calidad de render</Label>
                <Select
                  value={pipelineConfig.output.quality}
                  onValueChange={(v: RenderQuality) =>
                    setPipelineConfig({
                      output: { ...pipelineConfig.output, quality: v },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baja (rapido)</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="high">Alta (lento)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <SheetFooter className="mt-6 flex-col gap-2 sm:flex-col">
          <Button variant="outline" onClick={resetPipelineConfig} className="w-full">
            Restaurar valores por defecto
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
