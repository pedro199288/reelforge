import { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  useWorkspaceStore,
  useSelection,
  useScript,
  SILENCE_DEFAULTS,
} from "@/store/workspace";
import type { PreselectionLog } from "@/core/preselection";
import {
  type PipelineStep,
  type BackendPipelineStatus,
  type ProcessProgress,
  type StepResult,
  type SegmentsResult,
  type PipelineState,
  STEP_DEPENDENCIES,
} from "@/types/pipeline";

const API_URL = "http://localhost:3012";

export interface UsePipelineExecutionParams {
  videoId: string;
  filename: string;
}

export interface UsePipelineExecutionReturn {
  backendStatus: BackendPipelineStatus | null;
  statusError: string | null;
  stepProcessing: PipelineStep | null;
  stepProgress: ProcessProgress | null;
  stepResults: Record<string, StepResult>;
  preselectionLog: PreselectionLog | null;
  completedCount: number;
  canExecuteStep: (step: PipelineStep, state: PipelineState) => { canExecute: boolean; missingDeps: PipelineStep[] };
  executeStep: (step: PipelineStep) => Promise<void>;
  executeUntilStep: (targetStep: PipelineStep) => Promise<void>;
  refreshStatus: () => Promise<void>;
  handleReapplyPreselection: () => Promise<void>;
  isReapplyingPreselection: boolean;
  resetState: () => void;
}

export function usePipelineExecution({
  videoId,
  filename,
}: UsePipelineExecutionParams): UsePipelineExecutionReturn {
  const [backendStatus, setBackendStatus] =
    useState<BackendPipelineStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [stepProcessing, setStepProcessing] = useState<PipelineStep | null>(
    null,
  );
  const [stepProgress, setStepProgress] = useState<ProcessProgress | null>(
    null,
  );
  const [stepResults, setStepResults] = useState<Record<string, StepResult>>(
    {},
  );
  const [preselectionLog, setPreselectionLog] =
    useState<PreselectionLog | null>(null);
  const [isReapplyingPreselection, setIsReapplyingPreselection] =
    useState(false);

  // Pipeline config from persistent store
  const config = useWorkspaceStore((state) => state.pipelineConfig);
  const scriptState = useScript(videoId);
  const segmentSelection = useSelection(videoId);

  // Load result of a specific step
  const loadStepResult = useCallback(
    async (vid: string, step: PipelineStep) => {
      try {
        const res = await fetch(
          `${API_URL}/api/pipeline/result?videoId=${encodeURIComponent(vid)}&step=${step}`,
        );
        if (res.ok) {
          const result = (await res.json()) as StepResult;
          setStepResults((prev) => ({ ...prev, [step]: result }));
        }
      } catch (err) {
        console.error(`Error loading ${step} result:`, err);
      }
    },
    [],
  );

  // Load preselection logs
  const loadPreselectionLogs = useCallback(async (vid: string) => {
    try {
      const res = await fetch(
        `${API_URL}/api/pipeline/${encodeURIComponent(vid)}/preselection-logs`,
      );
      if (res.ok) {
        const result = await res.json();
        setPreselectionLog(result.log ?? null);
      }
    } catch (err) {
      console.debug("Preselection logs not available:", err);
    }
  }, []);

  // Load backend pipeline status
  const loadPipelineStatus = useCallback(
    async (vid: string, fname: string) => {
      setStatusError(null);
      try {
        const res = await fetch(
          `${API_URL}/api/pipeline/status?videoId=${encodeURIComponent(vid)}&filename=${encodeURIComponent(fname)}`,
        );
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        const status = (await res.json()) as BackendPipelineStatus;
        setBackendStatus(status);

        // Load results for completed steps
        const completedSteps = Object.entries(status.steps)
          .filter(([, state]) => state.status === "completed")
          .map(([step]) => step as PipelineStep);

        for (const step of completedSteps) {
          loadStepResult(vid, step);
        }

        // Load preselection logs if segments step is completed
        if (completedSteps.includes("segments")) {
          loadPreselectionLogs(vid);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Error desconocido";
        console.error("Error loading pipeline status:", err);
        setStatusError(`No se pudo conectar al servidor API: ${message}`);
        toast.error("Servidor API no disponible", {
          description:
            "Asegurate de que el servidor este corriendo en el puerto 3012",
        });
      }
    },
    [loadStepResult, loadPreselectionLogs],
  );

  // Refresh status using current videoId/filename
  const refreshStatus = useCallback(async () => {
    if (videoId && filename) {
      await loadPipelineStatus(videoId, filename);
    }
  }, [videoId, filename, loadPipelineStatus]);

  // Check if a step can be executed
  const canExecuteStep = useCallback(
    (
      step: PipelineStep,
      state: PipelineState,
    ): { canExecute: boolean; missingDeps: PipelineStep[] } => {
      const deps = STEP_DEPENDENCIES[step];
      const missingDeps = deps.filter((dep) => !state[dep]);
      return { canExecute: missingDeps.length === 0, missingDeps };
    },
    [],
  );

  // Build config body for API calls
  const buildConfigBody = useCallback(() => {
    return {
      method: config.silence.method ?? SILENCE_DEFAULTS.method,
      thresholdDb: config.silence.thresholdDb ?? SILENCE_DEFAULTS.thresholdDb,
      minDurationSec:
        config.silence.minDurationSec ?? SILENCE_DEFAULTS.minDurationSec,
      paddingSec: config.silence.paddingSec ?? SILENCE_DEFAULTS.paddingSec,
      amplitudeThreshold:
        config.silence.amplitudeThreshold ?? SILENCE_DEFAULTS.amplitudeThreshold,
      envelopeSamplesPerSecond:
        config.silence.envelopeSamplesPerSecond ??
        SILENCE_DEFAULTS.envelopeSamplesPerSecond,
    };
  }, [config]);

  // Execute a single pipeline step
  const executeStep = useCallback(
    async (step: PipelineStep) => {
      if (!videoId || stepProcessing) return;

      setStepProcessing(step);
      setStepProgress({ step, progress: 0, message: "Iniciando..." });

      try {
        const response = await fetch(`${API_URL}/api/pipeline/step`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId,
            filename,
            step,
            config: buildConfigBody(),
            selectedSegments:
              step === "cut" && segmentSelection.length > 0
                ? segmentSelection
                : undefined,
            script: scriptState?.rawScript || undefined,
            preselection: config.preselection,
          }),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || "Error al ejecutar el paso");
        }

        // Read SSE stream
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const chunk of lines) {
            if (!chunk.trim()) continue;

            const eventMatch = chunk.match(/event: (\w+)/);
            const dataMatch = chunk.match(/data: (.+)/);

            if (eventMatch && dataMatch) {
              const eventType = eventMatch[1];
              const data = JSON.parse(dataMatch[1]);

              switch (eventType) {
                case "progress":
                  setStepProgress(data);
                  break;
                case "complete":
                  toast.success(`${step} completado`, {
                    description: `Paso "${step}" ejecutado correctamente`,
                  });
                  setStepResults((prev) => ({
                    ...prev,
                    [step]: data.result,
                  }));
                  await loadPipelineStatus(videoId, filename);
                  break;
                case "error":
                  throw new Error(data.error);
              }
            }
          }
        }
      } catch (err) {
        toast.error(`Error en ${step}`, {
          description:
            err instanceof Error ? err.message : "Error desconocido",
        });
      } finally {
        setStepProcessing(null);
        setStepProgress(null);
      }
    },
    [
      videoId,
      filename,
      stepProcessing,
      config,
      buildConfigBody,
      loadPipelineStatus,
      scriptState,
      segmentSelection,
    ],
  );

  // Execute all steps up to and including the target step
  const executeUntilStep = useCallback(
    async (targetStep: PipelineStep) => {
      if (!videoId || stepProcessing) return;

      const executableSteps: PipelineStep[] = [
        "silences",
        "full-captions",
        "segments",
        "cut",
        "captions",
        "effects-analysis",
        "rendered",
      ];
      const targetIndex = executableSteps.indexOf(targetStep);

      if (targetIndex === -1) return;

      const currentStatus = backendStatus;

      const stepsToExecute = executableSteps
        .slice(0, targetIndex + 1)
        .filter((step) => {
          const stepState = currentStatus?.steps[step];
          return stepState?.status !== "completed";
        });

      if (stepsToExecute.length === 0) {
        toast.info("Todos los pasos ya estan completados");
        return;
      }

      for (const step of stepsToExecute) {
        setStepProcessing(step);
        setStepProgress({
          step,
          progress: 0,
          message: `Iniciando ${step}...`,
        });

        try {
          const response = await fetch(`${API_URL}/api/pipeline/step`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              videoId,
              filename,
              step,
              config: buildConfigBody(),
              script: scriptState?.rawScript || undefined,
              preselection: config.preselection,
            }),
          });

          if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || `Error al ejecutar ${step}`);
          }

          const reader = response.body?.getReader();
          if (!reader) throw new Error("No response body");

          const decoder = new TextDecoder();
          let buffer = "";
          let stepCompleted = false;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const chunk of lines) {
              if (!chunk.trim()) continue;

              const eventMatch = chunk.match(/event: (\w+)/);
              const dataMatch = chunk.match(/data: (.+)/);

              if (eventMatch && dataMatch) {
                const eventType = eventMatch[1];
                const data = JSON.parse(dataMatch[1]);

                switch (eventType) {
                  case "progress":
                    setStepProgress(data);
                    break;
                  case "complete":
                    setStepResults((prev) => ({
                      ...prev,
                      [step]: data.result,
                    }));
                    stepCompleted = true;
                    break;
                  case "error":
                    throw new Error(data.error);
                }
              }
            }
          }

          if (!stepCompleted) {
            throw new Error(`Paso ${step} no se completo correctamente`);
          }

          await loadPipelineStatus(videoId, filename);
        } catch (err) {
          toast.error(`Error en ${step}`, {
            description:
              err instanceof Error ? err.message : "Error desconocido",
          });
          setStepProcessing(null);
          setStepProgress(null);
          return;
        }
      }

      toast.success("Ejecucion completada", {
        description: `Se ejecutaron ${stepsToExecute.length} paso(s) correctamente`,
      });
      setStepProcessing(null);
      setStepProgress(null);
    },
    [
      videoId,
      filename,
      stepProcessing,
      config,
      buildConfigBody,
      loadPipelineStatus,
      backendStatus,
      scriptState,
    ],
  );

  // Re-apply preselection with captions from cut video
  const handleReapplyPreselection = useCallback(async () => {
    if (!videoId || !scriptState?.rawScript) return;

    setIsReapplyingPreselection(true);

    try {
      const res = await fetch(
        `${API_URL}/api/pipeline/${encodeURIComponent(videoId)}/reapply-preselection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script: scriptState.rawScript }),
        },
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const result = await res.json();

      // Update local state with new preselection data
      if (result.preselection) {
        setStepResults((prev) => {
          const segmentsResult = prev.segments as SegmentsResult | undefined;
          if (segmentsResult) {
            return {
              ...prev,
              segments: {
                ...segmentsResult,
                preselection: result.preselection,
              },
            };
          }
          return prev;
        });
      }

      // Reload preselection logs
      await loadPreselectionLogs(videoId);

      toast.success("Re-evaluacion completada", {
        description:
          "La preseleccion se ha actualizado con los scores de Script Match reales",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      toast.error("Error en re-evaluacion", {
        description: message,
      });
    } finally {
      setIsReapplyingPreselection(false);
    }
  }, [videoId, scriptState?.rawScript, loadPreselectionLogs]);

  // Reset state (for when video changes)
  const resetState = useCallback(() => {
    setBackendStatus(null);
    setStepResults({});
    setStepProcessing(null);
    setStepProgress(null);
    setPreselectionLog(null);
    setStatusError(null);
  }, []);

  // Computed: completed count
  const completedCount = backendStatus
    ? Object.values(backendStatus.steps).filter(
        (s) => s.status === "completed",
      ).length
    : 0;

  return {
    backendStatus,
    statusError,
    stepProcessing,
    stepProgress,
    stepResults,
    preselectionLog,
    completedCount,
    canExecuteStep,
    executeStep,
    executeUntilStep,
    refreshStatus,
    handleReapplyPreselection,
    isReapplyingPreselection,
    resetState,
  };
}
