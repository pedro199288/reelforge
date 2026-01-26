import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Crosshair, Volume2, Clock, Tag } from "lucide-react";
import {
  detectKeyMoments,
  DEFAULT_DETECTION_CONFIG,
  type KeyMoment,
  type DetectionConfig,
} from "@/core/timeline/auto-detect";
import type { Caption } from "@/core/script/align";

interface AutoDetectDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: (moments: KeyMoment[]) => void;
  waveformSamples: number[] | null;
  waveformSampleRate: number;
  captions: Caption[];
}

export function AutoDetectDialog({
  open,
  onClose,
  onApply,
  waveformSamples,
  waveformSampleRate,
  captions,
}: AutoDetectDialogProps) {
  const [config, setConfig] = useState<DetectionConfig>(DEFAULT_DETECTION_CONFIG);

  // Run detection with current config
  const detectedMoments = useMemo(() => {
    if (!open) return [];
    return detectKeyMoments(waveformSamples, waveformSampleRate, captions, config);
  }, [open, waveformSamples, waveformSampleRate, captions, config]);

  // Group by type for display
  const momentsByType = useMemo(() => {
    const groups: Record<string, KeyMoment[]> = {
      "volume-peak": [],
      pause: [],
      keyword: [],
    };
    for (const m of detectedMoments) {
      groups[m.type]?.push(m);
    }
    return groups;
  }, [detectedMoments]);

  const handleApply = () => {
    onApply(detectedMoments);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crosshair className="h-5 w-5" />
            Auto-detectar momentos clave
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Volume peaks */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-orange-500" />
                <Label>Picos de volumen</Label>
                <Badge variant="outline" className="text-xs">
                  {momentsByType["volume-peak"].length}
                </Badge>
              </div>
              <Switch
                checked={config.enabled.volumePeaks}
                onCheckedChange={(v) =>
                  setConfig({ ...config, enabled: { ...config.enabled, volumePeaks: v } })
                }
              />
            </div>
            {config.enabled.volumePeaks && (
              <div className="pl-6 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Umbral</span>
                  <span>{Math.round(config.volumeThreshold * 100)}%</span>
                </div>
                <Slider
                  value={[config.volumeThreshold]}
                  onValueChange={([v]) => setConfig({ ...config, volumeThreshold: v })}
                  min={0.3}
                  max={0.95}
                  step={0.05}
                />
                <p className="text-xs text-muted-foreground">
                  Detecta como punch zoom
                </p>
              </div>
            )}
          </div>

          {/* Pauses */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                <Label>Pausas dramaticas</Label>
                <Badge variant="outline" className="text-xs">
                  {momentsByType["pause"].length}
                </Badge>
              </div>
              <Switch
                checked={config.enabled.pauses}
                onCheckedChange={(v) =>
                  setConfig({ ...config, enabled: { ...config.enabled, pauses: v } })
                }
              />
            </div>
            {config.enabled.pauses && (
              <div className="pl-6 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Duracion minima</span>
                  <span>{config.pauseMinDuration}ms</span>
                </div>
                <Slider
                  value={[config.pauseMinDuration]}
                  onValueChange={([v]) => setConfig({ ...config, pauseMinDuration: v })}
                  min={200}
                  max={1000}
                  step={50}
                />
                <p className="text-xs text-muted-foreground">
                  Detecta como slow zoom
                </p>
              </div>
            )}
          </div>

          {/* Keywords */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-yellow-500" />
                <Label>Palabras clave</Label>
                <Badge variant="outline" className="text-xs">
                  {momentsByType["keyword"].length}
                </Badge>
              </div>
              <Switch
                checked={config.enabled.keywords}
                onCheckedChange={(v) =>
                  setConfig({ ...config, enabled: { ...config.enabled, keywords: v } })
                }
              />
            </div>
            {config.enabled.keywords && (
              <div className="pl-6">
                <div className="flex flex-wrap gap-1">
                  {config.keywords.slice(0, 8).map((kw) => (
                    <Badge key={kw} variant="secondary" className="text-xs">
                      {kw}
                    </Badge>
                  ))}
                  {config.keywords.length > 8 && (
                    <Badge variant="secondary" className="text-xs">
                      +{config.keywords.length - 8}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Detecta como highlight
                </p>
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total detectado</span>
              <Badge>{detectedMoments.length} momentos</Badge>
            </div>
            {detectedMoments.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {momentsByType["volume-peak"].length} punch, {momentsByType["pause"].length} slow,{" "}
                {momentsByType["keyword"].length} highlight
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleApply} disabled={detectedMoments.length === 0}>
            Aplicar {detectedMoments.length} sugerencias
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
