/**
 * Batch processing system for parallel video processing
 */

import { existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { detectSilences, getVideoDuration } from "../silence/detect";
import { silencesToSegments } from "../silence/segments";
import { cutVideo } from "../cut/index";
import type { QueueItem, PipelineStep } from "../../types/batch";
import type { PipelineConfig } from "../../store/workspace";

/**
 * Callbacks for tracking processing progress
 */
export interface ProcessorCallbacks {
  onProgress: (id: string, progress: number, step: PipelineStep) => void;
  onComplete: (id: string) => void;
  onError: (id: string, error: Error) => void;
  onStart: (id: string) => void;
}

/**
 * Result of processing a single video
 */
export interface ProcessingResult {
  videoId: string;
  inputPath: string;
  outputPath: string;
  duration: number;
  segmentsKept: number;
  segmentsTotal: number;
}

/**
 * Options for the batch processor
 */
export interface ProcessorOptions {
  outputDir: string;
  maxParallel?: 1 | 2 | 3 | 4;
}

/**
 * Active worker tracking
 */
interface ActiveWorker {
  itemId: string;
  abortController: AbortController;
  promise: Promise<ProcessingResult | null>;
}

/**
 * BatchProcessor handles parallel processing of multiple videos
 */
export class BatchProcessor {
  private activeWorkers: Map<string, ActiveWorker> = new Map();
  private isPaused = false;
  private isStopped = false;
  private maxParallel: number;
  private outputDir: string;
  private callbacks: ProcessorCallbacks;

  constructor(options: ProcessorOptions, callbacks: ProcessorCallbacks) {
    this.maxParallel = options.maxParallel ?? 2;
    this.outputDir = options.outputDir;
    this.callbacks = callbacks;

    // Ensure output directory exists
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Process a queue of videos
   */
  async processQueue(
    queue: QueueItem[],
    globalConfig: PipelineConfig
  ): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];
    const enabledItems = queue.filter((item) => item.enabled);
    const pending = [...enabledItems];

    this.isStopped = false;
    this.isPaused = false;

    while (pending.length > 0 || this.activeWorkers.size > 0) {
      if (this.isStopped) {
        // Cancel all active workers
        for (const worker of this.activeWorkers.values()) {
          worker.abortController.abort();
        }
        break;
      }

      // Wait while paused
      while (this.isPaused && !this.isStopped) {
        await sleep(100);
      }

      // Start new workers up to maxParallel
      while (
        pending.length > 0 &&
        this.activeWorkers.size < this.maxParallel &&
        !this.isPaused &&
        !this.isStopped
      ) {
        const item = pending.shift()!;
        const config = { ...globalConfig, ...item.config };
        this.startWorker(item, config);
      }

      // Wait for at least one worker to complete
      if (this.activeWorkers.size > 0) {
        const promises = Array.from(this.activeWorkers.values()).map(
          (w) => w.promise
        );
        const result = await Promise.race(promises);
        if (result) {
          results.push(result);
        }
      }
    }

    return results;
  }

  /**
   * Start a worker for a single item
   */
  private startWorker(item: QueueItem, config: PipelineConfig): void {
    const abortController = new AbortController();

    this.callbacks.onStart(item.id);

    const promise = this.processItem(item, config, abortController.signal)
      .then((result) => {
        this.activeWorkers.delete(item.id);
        if (result) {
          this.callbacks.onComplete(item.id);
        }
        return result;
      })
      .catch((error) => {
        this.activeWorkers.delete(item.id);
        if (!abortController.signal.aborted) {
          this.callbacks.onError(
            item.id,
            error instanceof Error ? error : new Error(String(error))
          );
        }
        return null;
      });

    this.activeWorkers.set(item.id, {
      itemId: item.id,
      abortController,
      promise,
    });
  }

  /**
   * Process a single video through the pipeline
   */
  private async processItem(
    item: QueueItem,
    config: PipelineConfig,
    signal: AbortSignal
  ): Promise<ProcessingResult | null> {
    const inputPath = item.videoId; // Assuming videoId is the file path
    const outputFilename = `${basename(inputPath, ".mp4")}_processed.mp4`;
    const outputPath = join(this.outputDir, outputFilename);

    // Step 1: Silence detection (0-30%)
    this.callbacks.onProgress(item.id, 5, "silence-detection");
    if (signal.aborted) return null;

    const silences = await detectSilences(inputPath, {
      thresholdDb: config.thresholdDb,
      minDurationSec: config.minDurationSec,
    });

    this.callbacks.onProgress(item.id, 20, "silence-detection");
    if (signal.aborted) return null;

    const duration = await getVideoDuration(inputPath);
    this.callbacks.onProgress(item.id, 30, "silence-detection");
    if (signal.aborted) return null;

    // Step 2: Segment generation (30-40%)
    this.callbacks.onProgress(item.id, 35, "segment-generation");
    if (signal.aborted) return null;

    const segments = silencesToSegments(silences, duration, {
      paddingSec: config.paddingSec,
    });

    this.callbacks.onProgress(item.id, 40, "segment-generation");
    if (signal.aborted) return null;

    // Step 3: Cutting video (40-90%)
    this.callbacks.onProgress(item.id, 45, "cutting");
    if (signal.aborted) return null;

    await cutVideo(inputPath, segments, outputPath);

    this.callbacks.onProgress(item.id, 90, "cutting");
    if (signal.aborted) return null;

    // Step 4: Transcription (placeholder - 90-95%)
    this.callbacks.onProgress(item.id, 95, "transcription");
    // TODO: Implement whisper transcription
    if (signal.aborted) return null;

    // Step 5: Rendering (placeholder - 95-100%)
    this.callbacks.onProgress(item.id, 98, "rendering");
    // TODO: Implement Remotion rendering
    if (signal.aborted) return null;

    this.callbacks.onProgress(item.id, 100, "rendering");

    return {
      videoId: item.videoId,
      inputPath,
      outputPath,
      duration,
      segmentsKept: segments.length,
      segmentsTotal: segments.length + silences.length,
    };
  }

  /**
   * Pause processing
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume processing
   */
  resume(): void {
    this.isPaused = false;
  }

  /**
   * Stop all processing
   */
  stop(): void {
    this.isStopped = true;
    for (const worker of this.activeWorkers.values()) {
      worker.abortController.abort();
    }
    this.activeWorkers.clear();
  }

  /**
   * Get count of active workers
   */
  getActiveCount(): number {
    return this.activeWorkers.size;
  }

  /**
   * Check if processing is paused
   */
  getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Check if processing is stopped
   */
  getIsStopped(): boolean {
    return this.isStopped;
  }
}

/**
 * Helper function to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a batch processor with store integration
 */
export function createBatchProcessor(
  outputDir: string,
  updateProgress: (id: string, progress: number, step: PipelineStep) => void,
  markCompleted: (id: string) => void,
  setError: (id: string, error: string) => void,
  setItemStatus: (id: string, status: "processing") => void
): BatchProcessor {
  return new BatchProcessor(
    { outputDir },
    {
      onProgress: updateProgress,
      onComplete: markCompleted,
      onError: (id, error) => setError(id, error.message),
      onStart: (id) => setItemStatus(id, "processing"),
    }
  );
}
