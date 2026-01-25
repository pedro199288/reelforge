/**
 * Zustand store for batch processing logs
 */

import { create } from "zustand";
import type { LogEntry, LogLevel, PipelineStep } from "../types/batch";

let logIdCounter = 0;
const generateLogId = () => `log-${Date.now()}-${++logIdCounter}`;

interface LogsStore {
  logs: LogEntry[];
  maxLogs: number;

  // Actions
  addLog: (
    videoId: string,
    filename: string,
    level: LogLevel,
    step: PipelineStep,
    message: string,
    details?: string
  ) => void;
  clearLogs: () => void;
  clearLogsForVideo: (videoId: string) => void;
  setMaxLogs: (max: number) => void;
}

export const useLogsStore = create<LogsStore>((set) => ({
  logs: [],
  maxLogs: 1000,

  addLog: (videoId, filename, level, step, message, details) =>
    set((state) => {
      const newLog: LogEntry = {
        id: generateLogId(),
        videoId,
        filename,
        timestamp: new Date(),
        level,
        step,
        message,
        details,
      };

      // Keep logs under maxLogs limit
      const logs = [newLog, ...state.logs].slice(0, state.maxLogs);
      return { logs };
    }),

  clearLogs: () => set({ logs: [] }),

  clearLogsForVideo: (videoId) =>
    set((state) => ({
      logs: state.logs.filter((log) => log.videoId !== videoId),
    })),

  setMaxLogs: (maxLogs) => set({ maxLogs }),
}));

// Selector helpers
export const useLogs = () => useLogsStore((state) => state.logs);

export const useLogsForVideo = (videoId: string) =>
  useLogsStore((state) => state.logs.filter((log) => log.videoId === videoId));

export const useLogsByLevel = (level: LogLevel) =>
  useLogsStore((state) => state.logs.filter((log) => log.level === level));

export const useErrorLogs = () =>
  useLogsStore((state) => state.logs.filter((log) => log.level === "error"));

export const useWarningLogs = () =>
  useLogsStore((state) => state.logs.filter((log) => log.level === "warn"));

/**
 * Export logs as a downloadable JSON file
 */
export function exportLogsAsJson(logs: LogEntry[]): void {
  const data = JSON.stringify(logs, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reelforge-logs-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export logs as a downloadable text file
 */
export function exportLogsAsText(logs: LogEntry[]): void {
  const lines = logs.map((log) => {
    const time = log.timestamp instanceof Date
      ? log.timestamp.toISOString()
      : new Date(log.timestamp).toISOString();
    const level = log.level.toUpperCase().padEnd(5);
    const step = log.step.padEnd(18);
    const details = log.details ? `\n    ${log.details}` : "";
    return `[${time}] [${level}] [${step}] ${log.filename}: ${log.message}${details}`;
  });

  const text = lines.join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reelforge-logs-${new Date().toISOString().split("T")[0]}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
