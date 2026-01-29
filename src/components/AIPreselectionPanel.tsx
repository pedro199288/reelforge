/**
 * AI Preselection Panel Component
 *
 * Main panel for AI-first preselection. Allows users to:
 * - Run AI analysis on segments
 * - View decisions and their reasoning
 * - See script coverage map
 * - Review and adjust warnings
 */
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Scissors,
  Target,
  Repeat,
  MessageSquare,
  ArrowRight,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScriptCoverageMap } from "./ScriptCoverageMap";
import type {
  PreselectedSegment,
  AIPreselectionResult,
  AIPreselectionWarning,
  ContentType,
} from "@/core/preselection/types";
import { AI_PRESELECTION_MODELS } from "@/core/preselection/types";

const API_URL = "http://localhost:3012";

interface AIPreselectionPanelProps {
  /** Video ID for API calls */
  videoId: string;
  /** Current script text */
  script?: string;
  /** Whether captions are available */
  hasCaptions: boolean;
  /** Current segments (before AI analysis) */
  currentSegments: PreselectedSegment[];
  /** Callback when segments are updated */
  onSegmentsUpdate: (segments: PreselectedSegment[]) => void;
  /** Callback when a segment is clicked */
  onSegmentClick?: (segmentId: string) => void;
}

// Content type configuration
const CONTENT_TYPE_CONFIG: Record<
  ContentType,
  { label: string; icon: typeof Target; color: string }
> = {
  best_take: {
    label: "Mejor Toma",
    icon: Target,
    color: "text-green-600 bg-green-50 border-green-200",
  },
  alternative_take: {
    label: "Toma Alternativa",
    icon: Repeat,
    color: "text-yellow-600 bg-yellow-50 border-yellow-200",
  },
  false_start: {
    label: "Toma Falsa",
    icon: XCircle,
    color: "text-red-600 bg-red-50 border-red-200",
  },
  off_script: {
    label: "Fuera de Guion",
    icon: MessageSquare,
    color: "text-blue-600 bg-blue-50 border-blue-200",
  },
  transition: {
    label: "Transicion",
    icon: ArrowRight,
    color: "text-gray-600 bg-gray-50 border-gray-200",
  },
};

export function AIPreselectionPanel({
  videoId,
  script,
  hasCaptions,
  currentSegments,
  onSegmentsUpdate,
  onSegmentClick,
}: AIPreselectionPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AIPreselectionResult | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(
    AI_PRESELECTION_MODELS[0].modelId
  );
  const [showDetails, setShowDetails] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);

  // Get selected model config
  const modelConfig = useMemo(() => {
    return AI_PRESELECTION_MODELS.find((m) => m.modelId === selectedModel);
  }, [selectedModel]);

  // Run AI preselection
  const runAIPreselection = useCallback(async () => {
    if (!hasCaptions) {
      toast.error("Se requieren captions para el analisis AI");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/pipeline/${videoId}/ai-preselection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            script,
            aiConfig: {
              provider: modelConfig?.provider,
              modelId: selectedModel,
            },
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Error en AI preselection");
      }

      const data = await response.json();
      setResult(data.result);
      onSegmentsUpdate(data.result.segments);

      toast.success(
        `Analisis completado: ${data.result.summary.selectedSegments} de ${data.result.summary.totalSegments} segmentos seleccionados`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [videoId, script, hasCaptions, selectedModel, modelConfig, onSegmentsUpdate]);

  // Group segments by content type
  const segmentsByType = useMemo(() => {
    const segments = result?.segments || currentSegments;
    const grouped = new Map<ContentType, PreselectedSegment[]>();

    for (const seg of segments) {
      const type = seg.contentType || "off_script";
      if (!grouped.has(type)) {
        grouped.set(type, []);
      }
      grouped.get(type)!.push(seg);
    }

    return grouped;
  }, [result, currentSegments]);

  // Render warning badge
  const renderWarning = (warning: AIPreselectionWarning) => {
    const icons: Record<string, typeof AlertTriangle> = {
      missing_script_line: FileText,
      multiple_takes: Repeat,
      audio_quality: AlertTriangle,
      long_gap: ArrowRight,
      out_of_order: Scissors,
    };
    const Icon = icons[warning.type] || AlertTriangle;

    return (
      <div
        key={`${warning.type}-${warning.message.slice(0, 20)}`}
        className="flex items-start gap-2 p-2 rounded-md bg-yellow-50 dark:bg-yellow-950/20 text-sm"
      >
        <Icon className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
        <div>
          <span className="text-yellow-700 dark:text-yellow-400">
            {warning.message}
          </span>
          {warning.affectedScriptLines && warning.affectedScriptLines.length > 0 && (
            <div className="text-xs text-muted-foreground mt-1">
              Lineas afectadas: {warning.affectedScriptLines.map((l) => `L${l}`).join(", ")}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render segment card
  const renderSegmentCard = (seg: PreselectedSegment) => {
    const typeConfig = CONTENT_TYPE_CONFIG[seg.contentType || "off_script"];
    const TypeIcon = typeConfig.icon;

    return (
      <div
        key={seg.id}
        className={cn(
          "flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors",
          seg.enabled
            ? "bg-white dark:bg-gray-900 hover:bg-gray-50"
            : "bg-gray-100 dark:bg-gray-800 opacity-60 hover:opacity-80",
          onSegmentClick && "cursor-pointer"
        )}
        onClick={() => onSegmentClick?.(seg.id)}
      >
        {/* Status indicator */}
        <div
          className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
            typeConfig.color
          )}
        >
          <TypeIcon className="w-4 h-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-muted-foreground">
              {seg.id}
            </span>
            <Badge
              variant={seg.enabled ? "default" : "secondary"}
              className={cn(
                "text-xs",
                seg.enabled ? "bg-green-500" : "bg-gray-400"
              )}
            >
              {seg.enabled ? "Incluir" : "Excluir"}
            </Badge>
            <Badge variant="outline" className="text-xs">
              Score: {seg.score}
            </Badge>
          </div>

          {/* Reason */}
          <p className="text-sm text-muted-foreground line-clamp-2">
            {seg.reason}
          </p>

          {/* Coverage info */}
          {seg.coversScriptLines && seg.coversScriptLines.length > 0 && (
            <div className="flex items-center gap-1 mt-2">
              <FileText className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Cubre: {seg.coversScriptLines.map((l) => `L${l}`).join(", ")}
              </span>
            </div>
          )}

          {/* Proposed splits warning */}
          {seg.proposedSplits && seg.proposedSplits.length > 0 && (
            <div className="flex items-center gap-1 mt-2 text-xs text-yellow-600">
              <Scissors className="w-3 h-3" />
              {seg.proposedSplits.length} division(es) propuesta(s)
            </div>
          )}
        </div>

        {/* Duration */}
        <div className="flex-shrink-0 text-right">
          <span className="text-sm font-mono">
            {((seg.endMs - seg.startMs) / 1000).toFixed(1)}s
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header with action button */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="w-5 h-5 text-purple-500" />
              Preseleccion IA
            </CardTitle>

            {/* Model selector */}
            <div className="flex items-center gap-2">
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Seleccionar modelo" />
                </SelectTrigger>
                <SelectContent>
                  {AI_PRESELECTION_MODELS.map((model) => (
                    <SelectItem key={model.modelId} value={model.modelId}>
                      {model.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Status and requirements */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              {hasCaptions ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500" />
              )}
              <span className={hasCaptions ? "" : "text-muted-foreground"}>
                Captions
              </span>
            </div>
            <div className="flex items-center gap-1">
              {script ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
              )}
              <span className={script ? "" : "text-muted-foreground"}>
                Guion {script ? "" : "(opcional)"}
              </span>
            </div>
          </div>

          {/* Action button */}
          <Button
            onClick={runAIPreselection}
            disabled={isLoading || !hasCaptions}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analizando...
              </>
            ) : result ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Re-analizar con IA
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Analizar con IA
              </>
            )}
          </Button>

          {/* Missing captions warning */}
          {!hasCaptions && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-yellow-50 dark:bg-yellow-950/20 text-sm">
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
              <span className="text-yellow-700 dark:text-yellow-400">
                Ejecuta el paso de Captions primero para habilitar el analisis AI
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Summary stats */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Resumen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-gray-800">
                  <div className="text-2xl font-bold text-green-600">
                    {result.summary.selectedSegments}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Seleccionados
                  </div>
                </div>
                <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-gray-800">
                  <div className="text-2xl font-bold text-red-600">
                    {result.summary.falseStartsDetected}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Tomas Falsas
                  </div>
                </div>
                <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-gray-800">
                  <div className="text-2xl font-bold text-yellow-600">
                    {result.summary.repetitionsDetected}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Repeticiones
                  </div>
                </div>
                <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-gray-800">
                  <div className="text-2xl font-bold text-blue-600">
                    {Math.round(result.summary.estimatedFinalDurationMs / 1000)}s
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Duracion Est.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  Advertencias ({result.warnings.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.warnings.map(renderWarning)}
              </CardContent>
            </Card>
          )}

          {/* Script coverage map */}
          {script && (
            <Collapsible open={showCoverage} onOpenChange={setShowCoverage}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <CardTitle className="text-base flex items-center gap-2">
                      {showCoverage ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      <FileText className="w-4 h-4" />
                      Cobertura del Guion
                      <Badge variant="outline" className="ml-2">
                        {result.summary.coveredScriptLines.length} /{" "}
                        {result.summary.coveredScriptLines.length +
                          result.summary.missingScriptLines.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <ScriptCoverageMap
                      script={script}
                      segments={result.segments}
                      coveredLines={result.summary.coveredScriptLines}
                      missingLines={result.summary.missingScriptLines}
                      onLineClick={(lineNumber) => {
                        // Find first segment covering this line
                        const seg = result.segments.find(
                          (s) =>
                            s.coversScriptLines?.includes(lineNumber) &&
                            s.enabled
                        );
                        if (seg) {
                          onSegmentClick?.(seg.id);
                        }
                      }}
                    />
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* Detailed decisions */}
          <Collapsible open={showDetails} onOpenChange={setShowDetails}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                  <CardTitle className="text-base flex items-center gap-2">
                    {showDetails ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    Decisiones por Segmento
                    <Badge variant="outline" className="ml-2">
                      {result.segments.length} segmentos
                    </Badge>
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-4">
                  <TooltipProvider>
                    {/* Group by content type */}
                    {Array.from(segmentsByType.entries()).map(
                      ([type, segments]) => (
                        <div key={type} className="space-y-2">
                          <div className="flex items-center gap-2">
                            {(() => {
                              const config = CONTENT_TYPE_CONFIG[type];
                              const Icon = config.icon;
                              return (
                                <>
                                  <Icon
                                    className={cn(
                                      "w-4 h-4",
                                      config.color.split(" ")[0]
                                    )}
                                  />
                                  <span className="font-medium text-sm">
                                    {config.label}
                                  </span>
                                  <Badge variant="outline" className="text-xs">
                                    {segments.length}
                                  </Badge>
                                </>
                              );
                            })()}
                          </div>
                          <div className="space-y-2 pl-6">
                            {segments.map(renderSegmentCard)}
                          </div>
                        </div>
                      )
                    )}
                  </TooltipProvider>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </>
      )}
    </div>
  );
}
