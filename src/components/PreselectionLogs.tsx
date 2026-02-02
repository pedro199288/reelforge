import { useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Filter,
  Play,
  Search,
  Sparkles,
  Target,
  Cpu,
  BarChart3,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import type {
  PreselectionLog,
  SegmentPreselectionLog,
} from "@/core/preselection";

interface PreselectionLogsProps {
  log: PreselectionLog;
  onSeekTo?: (seconds: number) => void;
  /** When set, auto-expand and scroll to this segment's log card */
  highlightSegmentId?: string | null;
}

type FilterStatus = "all" | "selected" | "rejected" | "ambiguous";

function formatTime(ms: number): string {
  const seconds = ms / 1000;
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return mins > 0 ? `${mins}:${secs.padStart(4, "0")}` : `${secs}s`;
}

function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function getScoreColor(score: number): string {
  if (score >= 85) return "bg-green-500";
  if (score >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

function getScoreBadgeClass(score: number): string {
  if (score >= 85) {
    return "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700";
  }
  if (score >= 60) {
    return "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700";
  }
  return "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700";
}

function ScoreBar({
  label,
  score,
  weighted,
  weight,
}: {
  label: string;
  score: number;
  weighted: number;
  weight: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">
          {score.toFixed(0)}% <span className="text-muted-foreground">({(weight * 100).toFixed(0)}%)</span>
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full transition-all", getScoreColor(score))}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="text-[10px] text-muted-foreground text-right">
        Aporte: {weighted.toFixed(1)} pts
      </div>
    </div>
  );
}

function SegmentLogCard({
  segment,
  index,
  weights,
  onSeekTo,
  isOpen,
  onToggle,
}: {
  segment: SegmentPreselectionLog;
  index: number;
  weights: PreselectionLog["config"]["weights"];
  onSeekTo?: (seconds: number) => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const statusIcon = segment.decision.enabled ? (
    <CheckCircle2 className="w-4 h-4 text-green-600" />
  ) : segment.decision.isAmbiguous ? (
    <AlertCircle className="w-4 h-4 text-yellow-600" />
  ) : (
    <XCircle className="w-4 h-4 text-red-500" />
  );

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left",
            segment.decision.enabled
              ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
              : "bg-muted/30 border-transparent hover:bg-muted/50 opacity-70"
          )}
        >
          {isOpen ? (
            <ChevronDown className="w-4 h-4 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 flex-shrink-0" />
          )}

          <Badge variant="outline" className="text-xs">
            #{index + 1}
          </Badge>

          <span className="text-sm font-mono text-muted-foreground flex-shrink-0">
            {formatTime(segment.timing.startMs)} - {formatTime(segment.timing.endMs)}
            <span className="text-[9px] text-muted-foreground/50 ml-1.5">
              (<button type="button" className="hover:text-foreground cursor-pointer" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(String(segment.timing.startMs)).then(() => toast.success(`Copiado: ${segment.timing.startMs}ms`)); }} title="Copiar startMs">{segment.timing.startMs}</button>–<button type="button" className="hover:text-foreground cursor-pointer" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(String(segment.timing.endMs)).then(() => toast.success(`Copiado: ${segment.timing.endMs}ms`)); }} title="Copiar endMs">{segment.timing.endMs}</button>ms)
            </span>
          </span>

          <Badge
            variant="outline"
            className={cn("text-xs", getScoreBadgeClass(segment.scores.total))}
          >
            {segment.scores.total.toFixed(0)}
          </Badge>

          {statusIcon}

          <span className="flex-1 text-xs text-muted-foreground truncate">
            {segment.decision.reason}
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-8 mt-2 p-4 bg-muted/30 rounded-lg space-y-4">
          {/* Score Breakdown */}
          <div className="grid grid-cols-2 gap-4">
            <ScoreBar
              label="Cobertura del Guion"
              score={segment.scores.breakdown.scriptMatch}
              weighted={segment.scores.weighted.scriptMatch}
              weight={weights.scriptMatch}
            />
            <ScoreBar
              label="Confianza Whisper"
              score={segment.scores.breakdown.whisperConfidence}
              weighted={segment.scores.weighted.whisperConfidence}
              weight={weights.whisperConfidence}
            />
            <ScoreBar
              label="Fluidez"
              score={segment.scores.breakdown.takeOrder}
              weighted={segment.scores.weighted.takeOrder}
              weight={weights.takeOrder}
            />
            <ScoreBar
              label="Completitud"
              score={segment.scores.breakdown.completeness}
              weighted={segment.scores.weighted.completeness}
              weight={weights.completeness}
            />
            <ScoreBar
              label="Duracion"
              score={segment.scores.breakdown.duration}
              weighted={segment.scores.weighted.duration}
              weight={weights.duration}
            />
          </div>

          {/* Detailed Info */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            {/* Script Match Details */}
            {segment.scriptMatch && (
              <div className="space-y-1">
                <div className="font-medium">Script Match</div>
                <div className="text-muted-foreground">
                  Cobertura: {segment.scriptMatch.coverageScore.toFixed(0)}%
                </div>
                {segment.scriptMatch.isRepetition && (
                  <Badge variant="secondary" className="text-[10px]">
                    Repeticion
                  </Badge>
                )}
                {segment.scriptMatch.transcribedText && (
                  <div className="p-2 bg-background/50 rounded text-[10px] italic max-h-16 overflow-y-auto">
                    &ldquo;{segment.scriptMatch.transcribedText}&rdquo;
                  </div>
                )}
              </div>
            )}

            {/* Take Info */}
            <div className="space-y-1">
              <div className="font-medium">Informacion de Toma</div>
              <div className="text-muted-foreground">
                Toma #{segment.takeInfo.takeNumber}
              </div>
              <div className="text-muted-foreground">
                Deteccion: {segment.takeInfo.detectionMethod}
              </div>
            </div>

            {/* Completeness Details */}
            <div className="space-y-1">
              <div className="font-medium">Completitud</div>
              <div className="text-muted-foreground">
                {segment.completeness.isCompleteSentence
                  ? "Oracion completa"
                  : "Fragmento"}
              </div>
              <div className="text-muted-foreground">
                Inicio: {segment.completeness.boundaries.startScore.toFixed(0)}%
                {segment.completeness.boundaries.startAlignedWithCaption && " (alineado)"}
              </div>
              <div className="text-muted-foreground">
                Fin: {segment.completeness.boundaries.endScore.toFixed(0)}%
                {segment.completeness.boundaries.endHasPunctuation && " (puntuacion)"}
              </div>
            </div>

            {/* Duration Analysis */}
            <div className="space-y-1">
              <div className="font-medium">Duracion</div>
              <div className="text-muted-foreground">
                {formatDuration(segment.timing.durationMs)}
              </div>
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px]",
                  segment.durationAnalysis.status === "ideal"
                    ? "bg-green-100 text-green-700"
                    : segment.durationAnalysis.status === "too_short"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-orange-100 text-orange-700"
                )}
              >
                {segment.durationAnalysis.status === "ideal"
                  ? "Ideal"
                  : segment.durationAnalysis.status === "too_short"
                    ? "Muy corto"
                    : "Muy largo"}
              </Badge>
              <div className="text-muted-foreground text-[10px]">
                Ideal: {formatDuration(segment.durationAnalysis.idealRange.minMs)} -{" "}
                {formatDuration(segment.durationAnalysis.idealRange.maxMs)}
              </div>
            </div>
          </div>

          {/* Criterion Reasons */}
          <div className="space-y-1">
            <div className="text-xs font-medium">Razones por Criterio</div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              {segment.decision.criterionReasons.scriptMatch && (
                <div className="text-muted-foreground">
                  <span className="font-medium">Script:</span>{" "}
                  {segment.decision.criterionReasons.scriptMatch}
                </div>
              )}
              {segment.decision.criterionReasons.whisperConfidence && (
                <div className="text-muted-foreground">
                  <span className="font-medium">Whisper:</span>{" "}
                  {segment.decision.criterionReasons.whisperConfidence}
                </div>
              )}
              {segment.decision.criterionReasons.takeOrder && (
                <div className="text-muted-foreground">
                  <span className="font-medium">Fluidez:</span>{" "}
                  {segment.decision.criterionReasons.takeOrder}
                </div>
              )}
              {segment.decision.criterionReasons.completeness && (
                <div className="text-muted-foreground">
                  <span className="font-medium">Completitud:</span>{" "}
                  {segment.decision.criterionReasons.completeness}
                </div>
              )}
              {segment.decision.criterionReasons.duration && (
                <div className="text-muted-foreground">
                  <span className="font-medium">Duracion:</span>{" "}
                  {segment.decision.criterionReasons.duration}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          {onSeekTo && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSeekTo(segment.timing.startMs / 1000)}
                className="gap-1"
              >
                <Play className="w-3 h-3" />
                Ver en video
              </Button>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function PreselectionLogs({ log, onSeekTo, highlightSegmentId }: PreselectionLogsProps) {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [searchText, setSearchText] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [openSegments, setOpenSegments] = useState<Set<string>>(new Set());

  // Filter segments
  const filteredSegments = useMemo(() => {
    return log.segmentLogs.filter((segment) => {
      // Status filter
      if (filterStatus === "selected" && !segment.decision.enabled) return false;
      if (filterStatus === "rejected" && segment.decision.enabled) return false;
      if (filterStatus === "ambiguous" && !segment.decision.isAmbiguous) return false;

      // Score filter
      if (segment.scores.total < minScore) return false;

      // Text search
      if (searchText) {
        const searchLower = searchText.toLowerCase();
        const matchesReason = segment.decision.reason.toLowerCase().includes(searchLower);
        const matchesText = segment.scriptMatch?.transcribedText
          ?.toLowerCase()
          .includes(searchLower);
        if (!matchesReason && !matchesText) return false;
      }

      return true;
    });
  }, [log.segmentLogs, filterStatus, searchText, minScore]);

  // Calculate summary stats
  const summary = useMemo(() => {
    const total = log.segmentLogs.length;
    const selected = log.segmentLogs.filter((s) => s.decision.enabled).length;
    const avgScore = log.stats.averageScore;
    return { total, selected, avgScore };
  }, [log]);

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const toggleSegment = (segmentId: string) => {
    setOpenSegments((prev) => {
      const next = new Set(prev);
      if (next.has(segmentId)) {
        next.delete(segmentId);
      } else {
        next.add(segmentId);
      }
      return next;
    });
  };

  // Auto-expand and scroll to highlighted segment
  useEffect(() => {
    if (!highlightSegmentId) return;

    // Expand the segment
    setOpenSegments((prev) => {
      const next = new Set(prev);
      next.add(highlightSegmentId);
      return next;
    });

    // Highlight with temporary ring
    setHighlightedId(highlightSegmentId);
    const timer = setTimeout(() => setHighlightedId(null), 2000);

    // Scroll into view after a brief delay (to let expand animation finish)
    requestAnimationFrame(() => {
      const el = scrollContainerRef.current?.querySelector(
        `[data-segment-id="${highlightSegmentId}"]`
      );
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => clearTimeout(timer);
  }, [highlightSegmentId]);

  const handleExport = () => {
    const dataStr = JSON.stringify(log, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `preselection-logs-${log.videoId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Logs de Preseleccion
          </CardTitle>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1">
            <Download className="w-4 h-4" />
            Exportar
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 overflow-hidden flex flex-col gap-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-3 flex-shrink-0">
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <div className="text-2xl font-bold text-primary">
              {summary.total}
            </div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-600">
              {summary.selected}
            </div>
            <div className="text-xs text-muted-foreground">Seleccionados</div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <div className="text-2xl font-bold">
              {summary.avgScore.toFixed(0)}%
            </div>
            <div className="text-xs text-muted-foreground">Promedio</div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-600">
              {formatDuration(log.processingTimeMs)}
            </div>
            <div className="text-xs text-muted-foreground">Tiempo</div>
          </div>
        </div>

        {/* Context Info */}
        <div className="flex flex-wrap gap-2 text-xs flex-shrink-0">
          <Badge variant="outline" className="gap-1">
            <Cpu className="w-3 h-3" />
            Modo: {log.config.mode}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Target className="w-3 h-3" />
            Min Score: {log.config.minScore}
          </Badge>
          {log.context.hasScript && (
            <Badge variant="outline" className="gap-1">
              <Sparkles className="w-3 h-3" />
              Con guion ({log.context.scriptSentenceCount} oraciones)
            </Badge>
          )}
          <Badge variant="outline" className="gap-1">
            <Clock className="w-3 h-3" />
            {log.context.captionsCount} captions
          </Badge>
        </div>

        {/* AI Trace (if available) */}
        {log.aiTrace && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full gap-1">
                <Sparkles className="w-4 h-4" />
                Ver AI Trace
                <ChevronDown className="w-4 h-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{log.aiTrace.provider}</Badge>
                  <Badge variant="secondary">{log.aiTrace.modelId}</Badge>
                </div>
                <div className="text-muted-foreground">
                  Latencia: {log.aiTrace.meta.latencyMs}ms
                  {log.aiTrace.meta.promptTokens && (
                    <> | Tokens: {log.aiTrace.meta.promptTokens} + {log.aiTrace.meta.completionTokens}</>
                  )}
                </div>
                <details className="cursor-pointer">
                  <summary className="text-muted-foreground hover:text-foreground">
                    Ver prompts
                  </summary>
                  <pre className="mt-2 p-2 bg-background/50 rounded text-[10px] overflow-x-auto max-h-40">
                    {log.aiTrace.systemPrompt}
                  </pre>
                  <pre className="mt-1 p-2 bg-background/50 rounded text-[10px] overflow-x-auto max-h-40">
                    {log.aiTrace.userPrompt}
                  </pre>
                </details>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por texto o razon..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>

          <Select
            value={filterStatus}
            onValueChange={(v) => setFilterStatus(v as FilterStatus)}
          >
            <SelectTrigger className="w-[140px] h-8">
              <Filter className="w-4 h-4 mr-1" />
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="selected">Seleccionados</SelectItem>
              <SelectItem value="rejected">Rechazados</SelectItem>
              <SelectItem value="ambiguous">Ambiguos</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">Min:</span>
            <Input
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-16 h-8 text-sm"
              min={0}
              max={100}
            />
          </div>
        </div>

        {/* Results count */}
        <div className="text-xs text-muted-foreground flex-shrink-0">
          Mostrando {filteredSegments.length} de {log.segmentLogs.length} segmentos
        </div>

        {/* Segment List */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-subtle">
          {filteredSegments.map((segment, index) => (
            <div
              key={segment.segmentId}
              data-segment-id={segment.segmentId}
              className={cn(
                "transition-shadow duration-300",
                highlightedId === segment.segmentId && "ring-2 ring-blue-500 rounded-lg"
              )}
            >
              <SegmentLogCard
                segment={segment}
                index={index}
                weights={log.config.weights}
                onSeekTo={onSeekTo}
                isOpen={openSegments.has(segment.segmentId)}
                onToggle={() => toggleSegment(segment.segmentId)}
              />
            </div>
          ))}

          {filteredSegments.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No hay segmentos que coincidan con los filtros
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
