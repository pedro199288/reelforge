/**
 * Types for batch processing queue system
 */

import type { PipelineConfig } from "../store/workspace";

/**
 * Pipeline processing steps in order
 */
export type PipelineStep =
  | "silence-detection"
  | "segment-generation"
  | "cutting"
  | "transcription"
  | "rendering";

/**
 * Status of a queue item
 */
export type QueueItemStatus =
  | "pending"
  | "processing"
  | "completed"
  | "error"
  | "paused";

/**
 * A single video in the processing queue
 */
export interface QueueItem {
  /** Unique identifier for this queue entry */
  id: string;
  /** Reference to the video being processed */
  videoId: string;
  /** Display name of the video file */
  filename: string;
  /** Current processing status */
  status: QueueItemStatus;
  /** Whether this item is enabled for processing (checkbox state) */
  enabled: boolean;
  /** Processing progress 0-100 */
  progress: number;
  /** Current pipeline step being executed */
  currentStep: PipelineStep;
  /** Error message if status is 'error' */
  error?: string;
  /** When processing started */
  startedAt?: Date;
  /** When processing completed */
  completedAt?: Date;
  /** Optional per-video config override */
  config?: Partial<PipelineConfig>;
}

/**
 * The batch processing queue state
 */
export interface BatchQueue {
  /** All items in the queue */
  items: QueueItem[];
  /** Global config applied to all items without override */
  globalConfig: PipelineConfig;
  /** Maximum number of videos to process in parallel */
  maxParallel: 1 | 2 | 3 | 4;
  /** Whether the queue is currently processing */
  isProcessing: boolean;
  /** Whether processing is paused */
  isPaused: boolean;
}

/**
 * Default values for creating new queue items
 */
export const DEFAULT_QUEUE_ITEM: Omit<QueueItem, "id" | "videoId" | "filename"> = {
  status: "pending",
  enabled: true,
  progress: 0,
  currentStep: "silence-detection",
};

/**
 * Log level for processing events
 */
export type LogLevel = "info" | "warn" | "error";

/**
 * A single log entry for batch processing
 */
export interface LogEntry {
  /** Unique identifier for this log entry */
  id: string;
  /** Reference to the queue item */
  videoId: string;
  /** Display name of the video */
  filename: string;
  /** When the log was created */
  timestamp: Date;
  /** Severity level */
  level: LogLevel;
  /** Pipeline step that generated this log */
  step: PipelineStep;
  /** Main log message */
  message: string;
  /** Additional details (stack trace, debug info) */
  details?: string;
}
