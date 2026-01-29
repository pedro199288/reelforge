/**
 * AI Preselection Panel Component
 *
 * Main panel for AI-first preselection. Allows users to:
 * - Run AI analysis on segments
 * - View real-time processing logs
 * - See decisions and their reasoning
 * - See script coverage map
 */
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Terminal,
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
  videoId: string;
  script?: string;
  hasCaptions: boolean;
  currentSegments: PreselectedSegment[];
  onSegmentsUpdate: (segments: PreselectedSegment[]) => void;
  onSegmentClick?: (segmentId: string) => void;
}

interface LogEntry {
  timestamp: Date;
  type: "info" | "success" | "error" | "ai";
  message: string;
}

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
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Add log entry
  const addLog = useCallback((type: LogEntry["type"], message: string) => {
    setLogs((prev) => [...prev, { timestamp: new Date(), type, message }]);
  }, []);

  // Get selected model config
  const modelConfig = useMemo(() => {
    return AI_PRESELECTION_MODELS.find((m) => m.modelId === selectedModel);
  }, [selectedModel]);

  // Run AI preselection with logging
  const runAIPreselection = useCallback(async () => {
    if (!hasCaptions) {
      toast.error("Se requieren captions para el analisis AI");
      return;
    }

    setIsLoading(true);
    setLogs([]);
    setResult(null);
    startTimeRef.current = Date.now();

    addLog("info", `Iniciando analisis con ${modelConfig?.displayName || selectedModel}`);
    addLog("info", `Video ID: ${videoId}`);
    addLog("info", `Segmentos a analizar: ${currentSegments.length}`);

    if (script) {
      const scriptLines = script.split("\n").filter((l) => l.trim()).length;
      addLog("info", `Lineas de guion: ${scriptLines}`);
    } else {
      addLog("info", "Sin guion - analisis basado solo en contenido");
    }

    addLog("ai", "Preparando prompt para la IA...");

    try {
      addLog("ai", "Enviando solicitud a la API...");

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

      addLog("ai", "Respuesta recibida, procesando...");

      const data = await response.json();
      const aiResult = data.result as AIPreselectionResult;

      // Log analysis results
      const elapsed = ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
      addLog("success", `Analisis completado en ${elapsed}s`);
      addLog("info", `Total segmentos: ${aiResult.summary.totalSegments}`);
      addLog("success", `Segmentos seleccionados: ${aiResult.summary.selectedSegments}`);

      if (aiResult.summary.falseStartsDetected > 0) {
        addLog("info", `Tomas falsas detectadas: ${aiResult.summary.falseStartsDetected}`);
      }
      if (aiResult.summary.repetitionsDetected > 0) {
        addLog("info", `Repeticiones detectadas: ${aiResult.summary.repetitionsDetected}`);
      }

      // Log coverage
      if (script) {
        const totalLines = aiResult.summary.coveredScriptLines.length +
                          aiResult.summary.missingScriptLines.length;
        const coverage = Math.round((aiResult.summary.coveredScriptLines.length / totalLines) * 100);
        addLog("info", `Cobertura del guion: ${coverage}%`);

        if (aiResult.summary.missingScriptLines.length > 0) {
          addLog("error", `Lineas sin cubrir: ${aiResult.summary.missingScriptLines.map(l => `L${l}`).join(", ")}`);
        }
      }

      // Log warnings
      if (aiResult.warnings.length > 0) {
        addLog("info", `Advertencias: ${aiResult.warnings.length}`);
        for (const warning of aiResult.warnings) {
          addLog("error", `[${warning.type}] ${warning.message}`);
        }
      }

      // Log detailed decisions
      addLog("ai", "--- Decisiones por segmento ---");
      for (const seg of aiResult.segments) {
        const status = seg.enabled ? "✓" : "✗";
        const type = seg.contentType || "unknown";
        addLog(
          seg.enabled ? "success" : "info",
          `${status} [${seg.id}] ${type} (${seg.score}pts) - ${seg.reason.slice(0, 60)}${seg.reason.length > 60 ? "..." : ""}`
        );
      }

      setResult(aiResult);
      onSegmentsUpdate(aiResult.segments);

      toast.success(
        `Analisis completado: ${aiResult.summary.selectedSegments} de ${aiResult.summary.totalSegments} segmentos seleccionados`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      addLog("error", `Error: ${message}`);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [videoId, script, hasCaptions, selectedModel, modelConfig, currentSegments, onSegmentsUpdate, addLog]);

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

  // Format log timestamp
  const formatLogTime = (date: Date) => {
    return date.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

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
            : "bg-gray-100 dark:bg-gray-800 opacity-60 hover:opacity-80"
        )}
        onClick={() => onSegmentClick?.(seg.id)}
      >
        <div
          className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
            typeConfig.color
          )}
        >
          <TypeIcon className="w-4 h-4" />
        </div>

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

          <p className="text-sm text-muted-foreground line-clamp-2">
            {seg.reason}
          </p>

          {seg.coversScriptLines && seg.coversScriptLines.length > 0 && (
            <div className="flex items-center gap-1 mt-2">
              <FileText className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Cubre: {seg.coversScriptLines.map((l) => `L${l}`).join(", ")}
              </span>
            </div>
          )}

          {seg.proposedSplits && seg.proposedSplits.length > 0 && (
            <div className="flex items-center gap-1 mt-2 text-xs text-yellow-600">
              <Scissors className="w-3 h-3" />
              {seg.proposedSplits.length} division(es) propuesta(s)
            </div>
          )}
        </div>

        <div className="flex-shrink-0 text-right">
          <span className="text-sm font-mono">
            {((seg.endMs - seg.startMs) / 1000).toFixed(1)}s
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header with controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" />
          <span className="font-semibold">Preseleccion IA</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Status indicators */}
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1">
              {hasCaptions ? (
                <CheckCircle2 className="w-3 h-3 text-green-500" />
              ) : (
                <XCircle className="w-3 h-3 text-red-500" />
              )}
              <span className={hasCaptions ? "" : "text-muted-foreground"}>
                Captions
              </span>
            </div>
            <div className="flex items-center gap-1">
              {script ? (
                <CheckCircle2 className="w-3 h-3 text-green-500" />
              ) : (
                <AlertTriangle className="w-3 h-3 text-yellow-500" />
              )}
              <span className={script ? "" : "text-muted-foreground"}>
                Guion
              </span>
            </div>
          </div>

          {/* Model selector */}
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="Modelo" />
            </SelectTrigger>
            <SelectContent>
              {AI_PRESELECTION_MODELS.map((model) => (
                <SelectItem key={model.modelId} value={model.modelId}>
                  {model.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Run button */}
          <Button
            onClick={runAIPreselection}
            disabled={isLoading || !hasCaptions}
            size="sm"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Analizando...
              </>
            ) : result ? (
              <>
                <RefreshCw className="w-4 h-4 mr-1" />
                Re-analizar
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-1" />
                Analizar
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Logs section */}
      {(logs.length > 0 || isLoading) && (
        <Collapsible open={showLogs} onOpenChange={setShowLogs}>
          <div className="border rounded-lg bg-gray-950 text-gray-100">
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-900">
                <div className="flex items-center gap-2 text-sm">
                  <Terminal className="w-4 h-4 text-green-400" />
                  <span className="font-mono text-xs">Logs</span>
                  {isLoading && (
                    <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                  )}
                </div>
                {showLogs ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="h-[200px] overflow-y-auto px-3 pb-3">
                <div className="font-mono text-xs space-y-0.5">
                  {logs.map((log, index) => (
                    <div
                      key={index}
                      className={cn(
                        "flex gap-2",
                        log.type === "error" && "text-red-400",
                        log.type === "success" && "text-green-400",
                        log.type === "ai" && "text-purple-400",
                        log.type === "info" && "text-gray-400"
                      )}
                    >
                      <span className="text-gray-600 flex-shrink-0">
                        [{formatLogTime(log.timestamp)}]
                      </span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {/* Results summary */}
      {result && (
        <div className="space-y-3">
          {/* Quick stats */}
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center p-2 rounded bg-green-50 dark:bg-green-950/30">
              <div className="text-lg font-bold text-green-600">
                {result.summary.selectedSegments}
              </div>
              <div className="text-[10px] text-muted-foreground">Seleccionados</div>
            </div>
            <div className="text-center p-2 rounded bg-red-50 dark:bg-red-950/30">
              <div className="text-lg font-bold text-red-600">
                {result.summary.falseStartsDetected}
              </div>
              <div className="text-[10px] text-muted-foreground">Tomas Falsas</div>
            </div>
            <div className="text-center p-2 rounded bg-yellow-50 dark:bg-yellow-950/30">
              <div className="text-lg font-bold text-yellow-600">
                {result.summary.repetitionsDetected}
              </div>
              <div className="text-[10px] text-muted-foreground">Repeticiones</div>
            </div>
            <div className="text-center p-2 rounded bg-blue-50 dark:bg-blue-950/30">
              <div className="text-lg font-bold text-blue-600">
                {Math.round(result.summary.estimatedFinalDurationMs / 1000)}s
              </div>
              <div className="text-[10px] text-muted-foreground">Duracion</div>
            </div>
          </div>

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="space-y-1">
              {result.warnings.slice(0, 2).map(renderWarning)}
              {result.warnings.length > 2 && (
                <div className="text-xs text-muted-foreground text-center">
                  +{result.warnings.length - 2} advertencias mas
                </div>
              )}
            </div>
          )}

          {/* Script coverage map */}
          {script && (
            <Collapsible open={showCoverage} onOpenChange={setShowCoverage}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-muted/50">
                  {showCoverage ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <FileText className="w-4 h-4" />
                  <span className="text-sm">Cobertura del Guion</span>
                  <Badge variant="outline" className="ml-auto text-xs">
                    {result.summary.coveredScriptLines.length} /{" "}
                    {result.summary.coveredScriptLines.length +
                      result.summary.missingScriptLines.length}
                  </Badge>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <ScriptCoverageMap
                  script={script}
                  segments={result.segments}
                  coveredLines={result.summary.coveredScriptLines}
                  missingLines={result.summary.missingScriptLines}
                  maxHeight="200px"
                  onLineClick={(lineNumber) => {
                    const seg = result.segments.find(
                      (s) =>
                        s.coversScriptLines?.includes(lineNumber) && s.enabled
                    );
                    if (seg) {
                      onSegmentClick?.(seg.id);
                    }
                  }}
                />
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Detailed decisions */}
          <Collapsible open={showDetails} onOpenChange={setShowDetails}>
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-muted/50">
                {showDetails ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <Target className="w-4 h-4" />
                <span className="text-sm">Decisiones por Segmento</span>
                <Badge variant="outline" className="ml-auto text-xs">
                  {result.segments.length}
                </Badge>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-3">
              <TooltipProvider>
                {Array.from(segmentsByType.entries()).map(([type, segments]) => (
                  <div key={type} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      {(() => {
                        const config = CONTENT_TYPE_CONFIG[type];
                        const Icon = config.icon;
                        return (
                          <>
                            <Icon
                              className={cn("w-3 h-3", config.color.split(" ")[0])}
                            />
                            <span className="font-medium">{config.label}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {segments.length}
                            </Badge>
                          </>
                        );
                      })()}
                    </div>
                    <div className="space-y-1 pl-5">
                      {segments.map(renderSegmentCard)}
                    </div>
                  </div>
                ))}
              </TooltipProvider>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Missing captions warning */}
      {!hasCaptions && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-yellow-50 dark:bg-yellow-950/20 text-sm">
          <AlertTriangle className="w-4 h-4 text-yellow-600" />
          <span className="text-yellow-700 dark:text-yellow-400 text-xs">
            Ejecuta el paso de Captions primero para habilitar el analisis AI
          </span>
        </div>
      )}
    </div>
  );
}
