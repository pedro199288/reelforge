/**
 * Zustand store for batch processing queue
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  QueueItem,
  QueueItemStatus,
  PipelineStep,
} from "../types/batch";
import type { PipelineConfig } from "./workspace";

/**
 * Input for adding videos to the queue
 */
export interface VideoInput {
  videoId: string;
  filename: string;
}

interface BatchStore {
  // State
  queue: QueueItem[];
  globalConfig: PipelineConfig;
  maxParallel: 1 | 2 | 3 | 4;
  isProcessing: boolean;
  isPaused: boolean;

  // Queue actions
  addToQueue: (videos: VideoInput[]) => void;
  removeFromQueue: (id: string) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  toggleEnabled: (id: string) => void;
  clearCompleted: () => void;
  clearQueue: () => void;

  // Processing control
  startProcessing: () => void;
  pauseProcessing: () => void;
  resumeProcessing: () => void;
  stopProcessing: () => void;

  // Progress tracking
  updateProgress: (id: string, progress: number, step: PipelineStep) => void;
  setItemStatus: (id: string, status: QueueItemStatus) => void;
  setError: (id: string, error: string) => void;
  markCompleted: (id: string) => void;

  // Config
  setMaxParallel: (n: 1 | 2 | 3 | 4) => void;
  setGlobalConfig: (config: Partial<PipelineConfig>) => void;
  setItemConfig: (id: string, config: Partial<PipelineConfig>) => void;
}

const DEFAULT_GLOBAL_CONFIG: PipelineConfig = {
  thresholdDb: -40,
  minDurationSec: 0.5,
  paddingSec: 0.05,
  autoSelectTakes: false,
};

let idCounter = 0;
const generateId = () => `queue-${Date.now()}-${++idCounter}`;

export const useBatchStore = create<BatchStore>()(
  persist(
    (set, get) => ({
      // Initial state
      queue: [],
      globalConfig: DEFAULT_GLOBAL_CONFIG,
      maxParallel: 2,
      isProcessing: false,
      isPaused: false,

      // Queue actions
      addToQueue: (videos) =>
        set((state) => ({
          queue: [
            ...state.queue,
            ...videos.map(
              (v): QueueItem => ({
                id: generateId(),
                videoId: v.videoId,
                filename: v.filename,
                status: "pending",
                enabled: true,
                progress: 0,
                currentStep: "silence-detection",
              })
            ),
          ],
        })),

      removeFromQueue: (id) =>
        set((state) => ({
          queue: state.queue.filter((item) => item.id !== id),
        })),

      reorderQueue: (fromIndex, toIndex) =>
        set((state) => {
          const queue = [...state.queue];
          const [item] = queue.splice(fromIndex, 1);
          queue.splice(toIndex, 0, item);
          return { queue };
        }),

      toggleEnabled: (id) =>
        set((state) => ({
          queue: state.queue.map((item) =>
            item.id === id ? { ...item, enabled: !item.enabled } : item
          ),
        })),

      clearCompleted: () =>
        set((state) => ({
          queue: state.queue.filter((item) => item.status !== "completed"),
        })),

      clearQueue: () => set({ queue: [], isProcessing: false, isPaused: false }),

      // Processing control
      startProcessing: () =>
        set((state) => {
          // Mark first pending items as processing up to maxParallel
          const queue = [...state.queue];
          let processing = 0;
          for (const item of queue) {
            if (processing >= state.maxParallel) break;
            if (item.status === "pending" && item.enabled) {
              item.status = "processing";
              item.startedAt = new Date();
              processing++;
            }
          }
          return { queue, isProcessing: true, isPaused: false };
        }),

      pauseProcessing: () => set({ isPaused: true }),

      resumeProcessing: () => set({ isPaused: false }),

      stopProcessing: () =>
        set((state) => ({
          isProcessing: false,
          isPaused: false,
          queue: state.queue.map((item) =>
            item.status === "processing"
              ? { ...item, status: "pending" as const, progress: 0 }
              : item
          ),
        })),

      // Progress tracking
      updateProgress: (id, progress, step) =>
        set((state) => ({
          queue: state.queue.map((item) =>
            item.id === id ? { ...item, progress, currentStep: step } : item
          ),
        })),

      setItemStatus: (id, status) =>
        set((state) => ({
          queue: state.queue.map((item) =>
            item.id === id ? { ...item, status } : item
          ),
        })),

      setError: (id, error) =>
        set((state) => ({
          queue: state.queue.map((item) =>
            item.id === id
              ? { ...item, status: "error" as const, error }
              : item
          ),
        })),

      markCompleted: (id) =>
        set((state) => {
          const queue = state.queue.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "completed" as const,
                  progress: 100,
                  completedAt: new Date(),
                }
              : item
          );

          // Check if there are more pending items to process
          const processingCount = queue.filter(
            (i) => i.status === "processing"
          ).length;
          const pendingItems = queue.filter(
            (i) => i.status === "pending" && i.enabled
          );

          // Start next pending items if under maxParallel
          const toStart = state.maxParallel - processingCount;
          for (let i = 0; i < toStart && i < pendingItems.length; i++) {
            const item = queue.find((q) => q.id === pendingItems[i].id);
            if (item) {
              item.status = "processing";
              item.startedAt = new Date();
            }
          }

          // Check if all done
          const allDone =
            queue.filter((i) => i.enabled).every(
              (i) => i.status === "completed" || i.status === "error"
            );

          return {
            queue,
            isProcessing: !allDone,
          };
        }),

      // Config
      setMaxParallel: (n) => set({ maxParallel: n }),

      setGlobalConfig: (config) =>
        set((state) => ({
          globalConfig: { ...state.globalConfig, ...config },
        })),

      setItemConfig: (id, config) =>
        set((state) => ({
          queue: state.queue.map((item) =>
            item.id === id
              ? { ...item, config: { ...item.config, ...config } }
              : item
          ),
        })),
    }),
    {
      name: "reelforge-batch",
      partialize: (state) => ({
        queue: state.queue,
        globalConfig: state.globalConfig,
        maxParallel: state.maxParallel,
        // Exclude isProcessing and isPaused - reset on load
      }),
    }
  )
);

// Selector helpers
export const useQueue = () => useBatchStore((state) => state.queue);
export const useIsProcessing = () => useBatchStore((state) => state.isProcessing);
export const usePendingCount = () =>
  useBatchStore((state) => state.queue.filter((i) => i.status === "pending").length);
export const useCompletedCount = () =>
  useBatchStore((state) => state.queue.filter((i) => i.status === "completed").length);

/**
 * Returns global progress (0-100) for all enabled items in the queue
 */
export const useGlobalProgress = () =>
  useBatchStore((state) => {
    const enabled = state.queue.filter((i) => i.enabled);
    if (enabled.length === 0) return 0;
    const total = enabled.reduce((sum, i) => sum + i.progress, 0);
    return Math.round(total / enabled.length);
  });
