/**
 * Hook to connect batch processing UI with the API
 */

import { useCallback, useRef } from "react";
import { useBatchStore } from "@/store/batch";
import { useLogsStore } from "@/store/logs";
import type { PipelineStep } from "@/types/batch";
import {
  notifyVideoComplete,
  notifyBatchComplete,
  notifyError,
  notifyProcessingStart,
} from "@/lib/notifications";

const API_URL = "http://localhost:3012";

interface BatchEvent {
  id?: string;
  filename?: string;
  step?: string;
  progress?: number;
  message?: string;
  error?: string;
  total?: number;
  completed?: number;
  errors?: number;
}

/**
 * Hook for managing batch processing with the API
 */
export function useBatchProcessor() {
  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    queue,
    globalConfig,
    maxParallel,
    isProcessing,
    isPaused,
    startProcessing: storeStartProcessing,
    pauseProcessing: storePauseProcessing,
    resumeProcessing: storeResumeProcessing,
    stopProcessing: storeStopProcessing,
    updateProgress,
    markCompleted,
    setError,
    setItemStatus,
  } = useBatchStore();

  const { addLog } = useLogsStore();

  const mapStep = (step: string): PipelineStep => {
    const stepMap: Record<string, PipelineStep> = {
      duration: "silence-detection",
      silences: "silence-detection",
      segments: "segment-generation",
      cut: "cutting",
      subtitles: "transcription",
      metadata: "rendering",
      complete: "rendering",
    };
    return stepMap[step] || "silence-detection";
  };

  const startProcessing = useCallback(async () => {
    const enabledItems = queue.filter((item) => item.enabled && item.status === "pending");
    if (enabledItems.length === 0) return;

    storeStartProcessing();
    notifyProcessingStart(enabledItems.length);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(`${API_URL}/api/batch/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videos: enabledItems.map((item) => ({
            id: item.id,
            videoId: item.videoId,
            filename: item.filename,
          })),
          config: globalConfig,
          maxParallel,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to start batch processing");
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

          const eventMatch = chunk.match(/event: ([\w:]+)/);
          const dataMatch = chunk.match(/data: (.+)/);

          if (eventMatch && dataMatch) {
            const eventType = eventMatch[1];
            const data = JSON.parse(dataMatch[1]) as BatchEvent;

            switch (eventType) {
              case "batch:start":
                addLog(
                  "batch",
                  "Sistema",
                  "info",
                  "silence-detection",
                  `Iniciando procesamiento de ${data.total} videos`
                );
                break;

              case "item:start":
                if (data.id) {
                  setItemStatus(data.id, "processing");
                  addLog(
                    data.id,
                    data.filename || "Video",
                    "info",
                    "silence-detection",
                    "Iniciando procesamiento"
                  );
                }
                break;

              case "item:progress":
                if (data.id && data.progress !== undefined) {
                  const step = mapStep(data.step || "");
                  updateProgress(data.id, data.progress, step);
                  if (data.message) {
                    addLog(data.id, data.filename || "Video", "info", step, data.message);
                  }
                }
                break;

              case "item:complete":
                if (data.id) {
                  markCompleted(data.id);
                  addLog(
                    data.id,
                    data.filename || "Video",
                    "info",
                    "rendering",
                    "Procesamiento completado"
                  );
                  notifyVideoComplete(data.filename || "Video");
                }
                break;

              case "item:error":
                if (data.id) {
                  setError(data.id, data.error || "Error desconocido");
                  addLog(
                    data.id,
                    data.filename || "Video",
                    "error",
                    "silence-detection",
                    data.error || "Error desconocido"
                  );
                  notifyError(data.filename || "Video", data.error || "Error desconocido");
                }
                break;

              case "batch:complete":
                addLog(
                  "batch",
                  "Sistema",
                  "info",
                  "rendering",
                  `Lote completado: ${data.completed} exitosos, ${data.errors} errores`
                );
                notifyBatchComplete(data.completed || 0);
                storeStopProcessing();
                break;
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        addLog("batch", "Sistema", "warn", "silence-detection", "Procesamiento cancelado");
      } else {
        const message = err instanceof Error ? err.message : "Error desconocido";
        addLog("batch", "Sistema", "error", "silence-detection", message);
        notifyError("Lote", message);
      }
      storeStopProcessing();
    }
  }, [
    queue,
    globalConfig,
    maxParallel,
    storeStartProcessing,
    storeStopProcessing,
    updateProgress,
    markCompleted,
    setError,
    setItemStatus,
    addLog,
  ]);

  const pauseProcessing = useCallback(async () => {
    storePauseProcessing();
    try {
      await fetch(`${API_URL}/api/batch/pause`, { method: "POST" });
    } catch {
      // Ignore network errors
    }
  }, [storePauseProcessing]);

  const resumeProcessing = useCallback(async () => {
    storeResumeProcessing();
    try {
      await fetch(`${API_URL}/api/batch/resume`, { method: "POST" });
    } catch {
      // Ignore network errors
    }
  }, [storeResumeProcessing]);

  const stopProcessing = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    storeStopProcessing();
    try {
      await fetch(`${API_URL}/api/batch/stop`, { method: "POST" });
    } catch {
      // Ignore network errors
    }
  }, [storeStopProcessing]);

  return {
    queue,
    isProcessing,
    isPaused,
    startProcessing,
    pauseProcessing,
    resumeProcessing,
    stopProcessing,
  };
}
