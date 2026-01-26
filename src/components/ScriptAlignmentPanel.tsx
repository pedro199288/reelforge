import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useWorkspaceStore, useScript } from "@/store/workspace";
import { useTimelineStore } from "@/store/timeline";
import { parseScript, type ParsedScript } from "@/core/script/parser";
import {
  alignScript,
  type AlignmentResult,
  type Caption,
  type AlignedEvent,
} from "@/core/script/align";
import { toast } from "sonner";

interface ScriptAlignmentPanelProps {
  videoId: string;
  captions: Caption[];
}

function formatTime(ms: number): string {
  const seconds = ms / 1000;
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(2);
  return mins > 0 ? `${mins}:${secs.padStart(5, "0")}` : `${secs}s`;
}

export function ScriptAlignmentPanel({
  videoId,
  captions,
}: ScriptAlignmentPanelProps) {
  const scriptState = useScript(videoId);
  const setScript = useWorkspaceStore((state) => state.setScript);
  const clearScript = useWorkspaceStore((state) => state.clearScript);
  const importFromEvents = useTimelineStore((state) => state.importFromEvents);
  const timeline = useTimelineStore((state) => state.timelines[videoId]);

  const [alignmentResult, setAlignmentResult] =
    useState<AlignmentResult | null>(null);

  const rawScript = scriptState?.rawScript ?? "";

  // Parse script in real-time
  const parsedScript: ParsedScript | null = useMemo(() => {
    if (!rawScript.trim()) return null;
    return parseScript(rawScript);
  }, [rawScript]);

  // Count markers by type
  const markerCounts = useMemo(() => {
    if (!parsedScript) return { zoom: 0, highlight: 0, total: 0 };
    const zoom = parsedScript.markers.filter((m) => m.type === "zoom").length;
    const highlight = parsedScript.markers.filter(
      (m) => m.type === "highlight"
    ).length;
    return { zoom, highlight, total: zoom + highlight };
  }, [parsedScript]);

  const handleScriptChange = useCallback(
    (value: string) => {
      setScript(videoId, value);
      // Clear alignment when script changes
      setAlignmentResult(null);
    },
    [videoId, setScript]
  );

  const handleAlign = useCallback(() => {
    if (!parsedScript || captions.length === 0) {
      toast.error("No hay captions o script para alinear");
      return;
    }

    const result = alignScript(parsedScript, captions);
    setAlignmentResult(result);

    if (result.events.length === 0) {
      toast.warning("No se encontraron coincidencias", {
        description: "El script puede ser muy diferente a la transcripcion",
      });
    } else {
      toast.success("Alineacion completada", {
        description: `${result.events.length} evento(s) encontrado(s) con ${Math.round(result.overallConfidence * 100)}% de confianza`,
      });
    }
  }, [parsedScript, captions]);

  const handleImport = useCallback(() => {
    if (!alignmentResult || alignmentResult.events.length === 0) {
      toast.error("No hay eventos para importar");
      return;
    }

    importFromEvents(videoId, alignmentResult.events);
    toast.success("Eventos importados al timeline", {
      description: `${alignmentResult.events.length} evento(s) importado(s)`,
    });
  }, [alignmentResult, videoId, importFromEvents]);

  const handleClear = useCallback(() => {
    clearScript(videoId);
    setAlignmentResult(null);
  }, [videoId, clearScript]);

  // Check if we already have events in the timeline
  const hasExistingEvents =
    timeline && (timeline.zooms.length > 0 || timeline.highlights.length > 0);

  return (
    <div className="space-y-4">
      {/* Script Input */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Guion de Referencia
            </CardTitle>
            {rawScript && (
              <Button variant="ghost" size="sm" onClick={handleClear}>
                Limpiar
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder={`Pega tu guion aqui con marcadores de zoom y highlight:

[zoom] - Zoom punch rapido
[zoom:slow] - Zoom lento cinematico
{palabra} - Resaltar palabra con zoom

Ejemplo:
Hola a todos [zoom] bienvenidos a este video donde vamos a hablar de {React} y como crear componentes increibles...`}
            value={rawScript}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleScriptChange(e.target.value)}
            className="min-h-[200px] font-mono text-sm"
          />

          {/* Marker Detection */}
          {parsedScript && markerCounts.total > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                Marcadores detectados:
              </span>
              <Badge variant="secondary">{markerCounts.total}</Badge>
              {markerCounts.zoom > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({markerCounts.zoom} zoom
                  {markerCounts.highlight > 0 &&
                    `, ${markerCounts.highlight} highlight`}
                  )
                </span>
              )}
            </div>
          )}

          {/* Captions status */}
          {captions.length === 0 && (
            <Alert>
              <AlertDescription>
                No hay captions disponibles. Ejecuta primero el paso de
                Captions.
              </AlertDescription>
            </Alert>
          )}

          {/* Align Button */}
          <div className="flex gap-2">
            <Button
              onClick={handleAlign}
              disabled={!parsedScript || markerCounts.total === 0 || captions.length === 0}
            >
              <AlignIcon className="w-4 h-4 mr-2" />
              Alinear con Transcripcion
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Alignment Result */}
      {alignmentResult && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                Resultado de Alineacion
              </CardTitle>
              <ConfidenceBadge confidence={alignmentResult.overallConfidence} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {alignmentResult.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No se encontraron coincidencias entre el script y la
                transcripcion.
              </p>
            ) : (
              <>
                {/* Events List */}
                <div className="space-y-2">
                  {alignmentResult.events.map((event, index) => (
                    <EventItem key={index} event={event} />
                  ))}
                </div>

                {/* Import Button */}
                <div className="flex items-center gap-3 pt-2 border-t">
                  <Button onClick={handleImport}>
                    <ImportIcon className="w-4 h-4 mr-2" />
                    Importar al Timeline
                  </Button>
                  {hasExistingEvents && (
                    <span className="text-xs text-muted-foreground">
                      Nota: Esto reemplazara los eventos existentes
                    </span>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Existing Events Info */}
      {hasExistingEvents && !alignmentResult && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckIcon className="w-4 h-4" />
              <span>
                El timeline ya tiene {timeline.zooms.length} zoom(s) y{" "}
                {timeline.highlights.length} highlight(s)
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100);
  const variant =
    percent >= 80 ? "default" : percent >= 50 ? "secondary" : "destructive";

  return (
    <Badge variant={variant}>
      {percent}% confianza
    </Badge>
  );
}

function EventItem({ event }: { event: AlignedEvent }) {
  const confidence = Math.round(event.confidence * 100);

  if (event.type === "zoom") {
    return (
      <div className="flex items-center justify-between p-2 bg-muted rounded text-sm">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            zoom
          </Badge>
          <span className="text-muted-foreground">
            {event.style === "slow" ? "lento" : "punch"}
          </span>
          <span className="font-mono text-xs">
            @ {formatTime(event.timestampMs)}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{confidence}%</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-2 bg-muted rounded text-sm">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs bg-yellow-50">
          highlight
        </Badge>
        <span className="font-medium">"{event.word}"</span>
        <span className="font-mono text-xs">
          {formatTime(event.startMs)} - {formatTime(event.endMs)}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">{confidence}%</span>
    </div>
  );
}

function AlignIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="21" y1="10" x2="3" y2="10" />
      <line x1="21" y1="6" x2="3" y2="6" />
      <line x1="21" y1="14" x2="3" y2="14" />
      <line x1="21" y1="18" x2="3" y2="18" />
    </svg>
  );
}

function ImportIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3v12" />
      <path d="m8 11 4 4 4-4" />
      <path d="M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
