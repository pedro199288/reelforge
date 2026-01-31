import { useEffect, useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Accordion } from "@/components/ui/accordion";
import {
  useWorkspaceStore,
  useScript,
  SILENCE_DEFAULTS,
  type SilenceDetectionMethod,
} from "@/store/workspace";
import {
  useVideoSegments,
  useTimelineActions,
  useTimelineSelection,
} from "@/store/timeline";
import { PipelineStepCard } from "@/components/PipelineStepCard";
import { PipelineResetActions } from "@/components/PipelineResetActions";
import { EffectsAnalysisPanel } from "@/components/EffectsAnalysisPanel";
import { AIPreselectionPanel } from "@/components/AIPreselectionPanel";
import { usePipelineExecution } from "@/hooks/usePipelineExecution";
import {
  type PipelineStep,
  type PipelineState,
  type SegmentsResult,
  STEPS,
  getVideoPipelineState,
} from "@/types/pipeline";
import {
  X,
  Zap,
  Loader2,
  ScrollText,
  Sparkles,
  Clock,
  Play,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Video } from "@/components/VideoList";

// --- Helpers ---

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return mins > 0 ? `${mins}:${secs.padStart(4, "0")}` : `${secs}s`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="text-center p-3 bg-muted/50 rounded-lg">
      <div className={cn("text-lg font-bold", color)}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

interface EditorPipelinePanelProps {
  video: Video;
  segmentsResult: SegmentsResult | null;
  onStepCompleted?: () => void;
  onOpenLogs?: () => void;
  onSeekTo?: (ms: number) => void;
}

export function EditorPipelinePanel({
  video,
  segmentsResult,
  onStepCompleted,
  onOpenLogs,
  onSeekTo,
}: EditorPipelinePanelProps) {
  const videoId = video.id;

  const pipeline = usePipelineExecution({
    videoId,
    filename: video.filename,
  });

  const {
    backendStatus,
    statusError,
    stepProcessing,
    stepProgress,
    completedCount,
    canExecuteStep,
    executeStep,
    executeUntilStep,
    refreshStatus,
    resetState,
  } = pipeline;

  // Pipeline config from persistent store
  const config = useWorkspaceStore((state) => state.pipelineConfig);
  const setPipelineConfig = useWorkspaceStore(
    (state) => state.setPipelineConfig,
  );

  // Store hooks for segments/selection
  const timelineSegments = useVideoSegments(videoId);
  const { importPreselectedSegments, toggleSegment, clearSelection } =
    useTimelineActions();
  const selection = useTimelineSelection();
  const scriptState = useScript(videoId);

  // Load pipeline status on mount & when video changes
  useEffect(() => {
    resetState();
    refreshStatus();
  }, [videoId, resetState, refreshStatus]);

  // Notify parent when a step completes (status changes)
  useEffect(() => {
    if (completedCount > 0) {
      onStepCompleted?.();
    }
  }, [completedCount, onStepCompleted]);

  // Compute pipeline state from backend status
  const pipelineState = useMemo<PipelineState | null>(() => {
    if (!backendStatus) return null;
    return getVideoPipelineState(video, backendStatus);
  }, [video, backendStatus]);

  // Steps to display (exclude "raw" -- script is managed in the Script tab)
  const displaySteps = useMemo(() => STEPS.filter((s) => s.key !== "raw"), []);

  const displayCompletedCount = useMemo(() => {
    if (!pipelineState) return 0;
    return displaySteps.filter((s) => pipelineState[s.key]).length;
  }, [pipelineState, displaySteps]);

  const progressPercent = useMemo(() => {
    if (!pipelineState) return 0;
    return Math.round((displayCompletedCount / displaySteps.length) * 100);
  }, [pipelineState, displayCompletedCount, displaySteps]);

  // Process all pending steps
  const handleProcessAll = useCallback(() => {
    executeUntilStep("rendered");
  }, [executeUntilStep]);

  // Refresh callback for reset actions
  const handleRefresh = useCallback(() => {
    resetState();
    refreshStatus();
    onStepCompleted?.();
  }, [resetState, refreshStatus, onStepCompleted]);

  const isAnyProcessing = !!stepProcessing;

  // Helper: get step status
  const getStepStatus = (key: PipelineStep) => {
    if (stepProcessing === key) return "running" as const;
    if (backendStatus?.steps[key]?.status === "completed") return "completed" as const;
    if (backendStatus?.steps[key]?.status === "error") return "error" as const;
    return "pending" as const;
  };

  // --- Derived data for segments step ---
  const hasCaptions = useMemo(() => {
    if (video?.hasCaptions) return true;
    return (backendStatus?.steps.captions?.status === "completed") || false;
  }, [video, backendStatus]);

  const selectedSegment = useMemo(() => {
    if (selection?.type !== "segment") return null;
    return timelineSegments.find((s) => s.id === selection.id) ?? null;
  }, [selection, timelineSegments]);

  const selectedSegmentIndex = useMemo(() => {
    if (!selectedSegment) return null;
    const index = timelineSegments.findIndex(
      (s) => s.id === selectedSegment.id
    );
    return index >= 0 ? index + 1 : null;
  }, [selectedSegment, timelineSegments]);

  const enabledSegments = useMemo(
    () =>
      timelineSegments
        .filter((s) => s.enabled)
        .sort((a, b) => a.startMs - b.startMs),
    [timelineSegments]
  );

  const totalDuration = segmentsResult?.totalDuration ?? 0;

  const stats = useMemo(() => {
    const selectedDuration = enabledSegments.reduce(
      (sum, s) => sum + (s.endMs - s.startMs) / 1000,
      0
    );
    const removedDuration = totalDuration - selectedDuration;
    const percentKept =
      totalDuration > 0 ? (selectedDuration / totalDuration) * 100 : 0;

    return {
      totalSegments: timelineSegments.length,
      selectedCount: enabledSegments.length,
      selectedDuration,
      removedDuration,
      percentKept,
    };
  }, [timelineSegments, enabledSegments, totalDuration]);

  const hasSegments = segmentsResult && segmentsResult.segments.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {displayCompletedCount}/{displaySteps.length}
          </Badge>
          <Progress value={progressPercent} className="h-1.5 w-20" />
        </div>
        <div className="flex items-center gap-1.5">
          <PipelineResetActions
            videoId={videoId}
            disabled={isAnyProcessing}
            hasCaptions={video.hasCaptions}
            onReset={handleRefresh}
          />
          <Button
            onClick={handleProcessAll}
            disabled={isAnyProcessing}
            size="sm"
            className="gap-1.5 text-xs h-7 bg-green-600 hover:bg-green-700"
          >
            {isAnyProcessing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            {isAnyProcessing ? "Procesando..." : "Procesar Todo"}
          </Button>
        </div>
      </div>

      {/* API Error */}
      {statusError && (
        <div className="p-3 text-xs text-destructive bg-destructive/10 border-b">
          {statusError}
        </div>
      )}

      {/* Steps list */}
      <div className="flex-1 overflow-y-auto scrollbar-subtle p-3">
        <Accordion
          type="single"
          collapsible
          defaultValue={pipelineState?.segments ? "segments" : undefined}
          className="w-full"
        >
          {displaySteps.map((step) => {
            const status = getStepStatus(step.key);
            const isExecutable = true;
            const { canExecute, missingDeps } = pipelineState
              ? canExecuteStep(step.key, pipelineState)
              : { canExecute: false, missingDeps: [] as PipelineStep[] };

            return (
              <PipelineStepCard
                key={step.key}
                stepKey={step.key}
                label={step.label}
                description={step.description}
                status={status}
                isProcessing={stepProcessing === step.key}
                isAnyProcessing={isAnyProcessing}
                canExecute={canExecute}
                missingDeps={missingDeps}
                progress={stepProcessing === step.key ? stepProgress : null}
                isExecutable={isExecutable}
                showExecuteUntil={step.key !== "silences"}
                onExecute={() => executeStep(step.key)}
                onExecuteUntil={() => executeUntilStep(step.key)}
              >
                {/* Silences: Config */}
                {step.key === "silences" && (
                  <div className="space-y-3">
                    {/* Metodo de deteccion */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Metodo</label>
                      <Select
                        value={config.silence.method ?? SILENCE_DEFAULTS.method}
                        onValueChange={(v: SilenceDetectionMethod) =>
                          setPipelineConfig({
                            silence: { ...config.silence, method: v },
                          })
                        }
                        disabled={stepProcessing === "silences"}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ffmpeg">FFmpeg silencedetect</SelectItem>
                          <SelectItem value="envelope">Envolvente de amplitud</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Threshold condicional */}
                    {(config.silence.method ?? SILENCE_DEFAULTS.method) === "ffmpeg" ? (
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-medium">Threshold</label>
                          <span className="text-xs text-muted-foreground">
                            {config.silence.thresholdDb ?? SILENCE_DEFAULTS.thresholdDb} dB
                          </span>
                        </div>
                        <Slider
                          value={[config.silence.thresholdDb ?? SILENCE_DEFAULTS.thresholdDb]}
                          onValueChange={([v]) =>
                            setPipelineConfig({
                              silence: { ...config.silence, thresholdDb: v },
                            })
                          }
                          min={-60}
                          max={-20}
                          step={1}
                          disabled={stepProcessing === "silences"}
                        />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-medium">Threshold amplitud</label>
                          <span className="text-xs text-muted-foreground">
                            {(config.silence.amplitudeThreshold ?? SILENCE_DEFAULTS.amplitudeThreshold).toFixed(2)}
                          </span>
                        </div>
                        <Slider
                          value={[config.silence.amplitudeThreshold ?? SILENCE_DEFAULTS.amplitudeThreshold]}
                          onValueChange={([v]) =>
                            setPipelineConfig({
                              silence: { ...config.silence, amplitudeThreshold: v },
                            })
                          }
                          min={0.01}
                          max={0.30}
                          step={0.01}
                          disabled={stepProcessing === "silences"}
                        />
                      </div>
                    )}

                    {/* Duracion minima */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-medium">Duracion minima</label>
                        <span className="text-xs text-muted-foreground">
                          {config.silence.minDurationSec ?? SILENCE_DEFAULTS.minDurationSec}s
                        </span>
                      </div>
                      <Slider
                        value={[config.silence.minDurationSec ?? SILENCE_DEFAULTS.minDurationSec]}
                        onValueChange={([v]) =>
                          setPipelineConfig({
                            silence: { ...config.silence, minDurationSec: v },
                          })
                        }
                        min={0.1}
                        max={2}
                        step={0.1}
                        disabled={stepProcessing === "silences"}
                      />
                    </div>
                  </div>
                )}

                {/* Segments: Config + Stats + Details + AI Preselection */}
                {step.key === "segments" && (
                  <div className="space-y-3">
                    {/* Padding config (always visible) */}
                    <div className="max-w-[160px]">
                      <label className="text-xs font-medium">Padding (s)</label>
                      <div className="relative mt-1">
                        <Input
                          type="number"
                          step="0.01"
                          value={config.silence.paddingSec ?? ""}
                          placeholder={`${SILENCE_DEFAULTS.paddingSec}`}
                          onChange={(e) =>
                            setPipelineConfig({
                              silence: {
                                ...config.silence,
                                paddingSec:
                                  e.target.value === ""
                                    ? undefined
                                    : Number(e.target.value),
                              },
                            })
                          }
                          className="h-7 text-xs pr-7"
                          disabled={stepProcessing === "segments"}
                        />
                        {config.silence.paddingSec !== undefined && (
                          <button
                            type="button"
                            onClick={() =>
                              setPipelineConfig({
                                silence: { ...config.silence, paddingSec: undefined },
                              })
                            }
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Content when step is completed and has segments */}
                    {status === "completed" && hasSegments && (
                      <>
                        {/* Stats grid */}
                        <div className="grid grid-cols-2 gap-3">
                          <StatCard
                            label="Segmentos"
                            value={`${stats.selectedCount}/${stats.totalSegments}`}
                            color="text-primary"
                          />
                          <StatCard
                            label="Duracion final"
                            value={formatDuration(stats.selectedDuration)}
                            color="text-green-600"
                          />
                          <StatCard
                            label="Eliminado"
                            value={formatDuration(stats.removedDuration)}
                            color="text-red-600"
                          />
                          <StatCard
                            label="Contenido"
                            value={`${stats.percentKept.toFixed(0)}%`}
                            color="text-foreground"
                          />
                        </div>

                        {/* Preselection IA stats */}
                        {segmentsResult?.preselection && (
                          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                            <div className="flex items-center gap-2 mb-2">
                              <Sparkles className="w-4 h-4 text-blue-600" />
                              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                                Preseleccion IA
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-blue-600 dark:text-blue-400">
                              {segmentsResult.preselection.stats.scriptCoverage <
                                100 && (
                                <span>
                                  Cobertura:{" "}
                                  {segmentsResult.preselection.stats.scriptCoverage.toFixed(
                                    0
                                  )}
                                  %
                                </span>
                              )}
                              {segmentsResult.preselection.stats
                                .repetitionsRemoved > 0 && (
                                <span>
                                  Repeticiones:{" "}
                                  {
                                    segmentsResult.preselection.stats
                                      .repetitionsRemoved
                                  }
                                </span>
                              )}
                              <span>
                                Score:{" "}
                                {segmentsResult.preselection.stats.averageScore.toFixed(
                                  0
                                )}
                                %
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Selected segment detail */}
                        {selectedSegment && selectedSegmentIndex && (
                          <div className="border rounded-lg p-3 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="default" className="text-xs">
                                  #{selectedSegmentIndex}
                                </Badge>
                                <Badge
                                  variant={
                                    selectedSegment.enabled ? "default" : "secondary"
                                  }
                                  className={cn(
                                    "text-xs",
                                    selectedSegment.enabled
                                      ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400"
                                      : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400"
                                  )}
                                >
                                  {selectedSegment.enabled
                                    ? "Habilitado"
                                    : "Deshabilitado"}
                                </Badge>
                                {selectedSegment.preselectionScore !== undefined && (
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-xs",
                                      selectedSegment.preselectionScore >= 85
                                        ? "bg-green-100 text-green-700 border-green-300"
                                        : selectedSegment.preselectionScore >= 60
                                          ? "bg-yellow-100 text-yellow-700 border-yellow-300"
                                          : "bg-red-100 text-red-700 border-red-300"
                                    )}
                                  >
                                    {selectedSegment.preselectionScore}%
                                  </Badge>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={clearSelection}
                                className="h-6 w-6 p-0"
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <span className="text-muted-foreground block text-xs">
                                  Inicio
                                </span>
                                <span className="font-mono font-medium">
                                  {formatTime(selectedSegment.startMs / 1000)}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block text-xs">
                                  Fin
                                </span>
                                <span className="font-mono font-medium">
                                  {formatTime(selectedSegment.endMs / 1000)}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block text-xs">
                                  Duracion
                                </span>
                                <span className="font-medium flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-muted-foreground" />
                                  {formatDuration(
                                    (selectedSegment.endMs -
                                      selectedSegment.startMs) /
                                      1000
                                  )}
                                </span>
                              </div>
                            </div>

                            {selectedSegment.preselectionReason && (
                              <div className="p-2 bg-muted/50 rounded border text-xs">
                                <span className="text-muted-foreground">Razon: </span>
                                <span>{selectedSegment.preselectionReason}</span>
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  onSeekTo?.(selectedSegment.startMs)
                                }
                                className="flex-1"
                              >
                                <Play className="w-3.5 h-3.5 mr-1" />
                                Ir
                              </Button>
                              <Button
                                variant={
                                  selectedSegment.enabled ? "outline" : "default"
                                }
                                size="sm"
                                onClick={() =>
                                  toggleSegment(videoId, selectedSegment.id)
                                }
                                className="flex-1"
                              >
                                {selectedSegment.enabled ? (
                                  <>
                                    <ToggleRight className="w-3.5 h-3.5 mr-1" />
                                    Deshab.
                                  </>
                                ) : (
                                  <>
                                    <ToggleLeft className="w-3.5 h-3.5 mr-1" />
                                    Habilitar
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* AI Preselection Panel */}
                        {hasCaptions && (
                          <AIPreselectionPanel
                            videoId={videoId}
                            script={scriptState?.rawScript}
                            hasCaptions={hasCaptions}
                            currentSegments={
                              segmentsResult?.preselection?.segments || []
                            }
                            onSegmentsUpdate={(newSegments) => {
                              importPreselectedSegments(videoId, newSegments, []);
                              onStepCompleted?.();
                            }}
                            onSegmentClick={(segmentId) => {
                              const seg = timelineSegments.find(
                                (s) => s.id === segmentId
                              );
                              if (seg && onSeekTo) onSeekTo(seg.startMs);
                            }}
                          />
                        )}

                        {/* View logs button */}
                        {onOpenLogs && (
                          <Button variant="outline" size="sm" onClick={onOpenLogs} className="gap-1.5 text-xs h-7">
                            <ScrollText className="w-3.5 h-3.5" />
                            Ver logs
                          </Button>
                        )}
                      </>
                    )}

                    {/* No segments message */}
                    {status === "completed" && !hasSegments && (
                      <div className="text-center py-4 text-muted-foreground text-sm">
                        No se generaron segmentos.
                      </div>
                    )}
                  </div>
                )}

                {/* Effects Analysis: Panel when completed */}
                {step.key === "effects-analysis" &&
                  pipelineState?.["effects-analysis"] && (
                    <EffectsAnalysisPanel videoId={videoId} />
                  )}
              </PipelineStepCard>
            );
          })}
        </Accordion>
      </div>
    </div>
  );
}
