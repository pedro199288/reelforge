/**
 * Pipeline utilities for managing individual step execution state
 * State is persisted in public/pipeline/{videoId}/
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename, extname } from "node:path";
import type { SilenceRange } from "../src/core/silence/detect";
import type { Segment } from "../src/core/silence/segments";

export type PipelineStep = "silences" | "segments" | "cut" | "captions" | "captions-raw" | "semantic";

export type StepStatus = "pending" | "running" | "completed" | "error";

export interface StepState {
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  resultFile?: string;
}

export interface PipelineStatus {
  videoId: string;
  filename: string;
  videoDuration?: number;
  steps: Record<PipelineStep, StepState>;
  updatedAt: string;
}

export interface SilencesResult {
  silences: SilenceRange[];
  videoDuration: number;
  config: {
    thresholdDb: number;
    minDurationSec: number;
  };
  createdAt: string;
}

export interface SegmentsResult {
  segments: Segment[];
  totalDuration: number;
  editedDuration: number;
  timeSaved: number;
  percentSaved: number;
  config: {
    paddingSec: number;
  };
  createdAt: string;
}

export interface CutResult {
  outputPath: string;
  originalDuration: number;
  editedDuration: number;
  segmentsCount: number;
  createdAt: string;
}

export interface CaptionsResult {
  captionsPath: string;
  captionsCount: number;
  createdAt: string;
}

export interface CaptionsRawResult {
  captionsPath: string;
  captionsCount: number;
  sourceVideo: "raw";
  createdAt: string;
}

export interface SemanticResult {
  sentenceCount: number;
  semanticCutCount: number;
  naturalPauseCount: number;
  totalCuttableDurationMs: number;
  totalPreservedPauseDurationMs: number;
  overallConfidence: number;
  createdAt: string;
}

// Step dependencies: step -> required preceding steps
// Note: captions-raw has no dependencies (runs on raw video)
// semantic requires captions-raw + silences to classify silences
const STEP_DEPENDENCIES: Record<PipelineStep, PipelineStep[]> = {
  silences: [],
  "captions-raw": [],  // Can run in parallel with silences
  segments: ["silences"],
  semantic: ["captions-raw", "silences"],  // Requires transcript + silences to classify
  cut: ["segments"],
  captions: ["cut"],  // Post-cut captions (for backward compatibility)
};

/**
 * Get the pipeline directory for a video
 */
export function getPipelineDir(videoId: string): string {
  return join(process.cwd(), "public", "pipeline", videoId);
}

/**
 * Ensure pipeline directory exists
 */
export function ensurePipelineDir(videoId: string): string {
  const dir = getPipelineDir(videoId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get status file path
 */
function getStatusPath(videoId: string): string {
  return join(getPipelineDir(videoId), "status.json");
}

/**
 * Get video ID from filename
 */
export function filenameToVideoId(filename: string): string {
  const ext = extname(filename);
  const name = basename(filename, ext);
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Get initial empty pipeline status
 */
function getInitialStatus(videoId: string, filename: string): PipelineStatus {
  const emptyStep: StepState = { status: "pending" };
  return {
    videoId,
    filename,
    steps: {
      silences: { ...emptyStep },
      "captions-raw": { ...emptyStep },
      segments: { ...emptyStep },
      semantic: { ...emptyStep },
      cut: { ...emptyStep },
      captions: { ...emptyStep },
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get current pipeline status for a video
 */
export function getPipelineStatus(videoId: string, filename: string): PipelineStatus {
  const statusPath = getStatusPath(videoId);

  if (existsSync(statusPath)) {
    try {
      const content = readFileSync(statusPath, "utf-8");
      return JSON.parse(content) as PipelineStatus;
    } catch {
      // If corrupted, return initial status
    }
  }

  return getInitialStatus(videoId, filename);
}

/**
 * Update pipeline status
 */
export function updatePipelineStatus(
  videoId: string,
  updates: Partial<Omit<PipelineStatus, "videoId" | "updatedAt">>
): PipelineStatus {
  const dir = ensurePipelineDir(videoId);
  const statusPath = join(dir, "status.json");

  let current: PipelineStatus;
  if (existsSync(statusPath)) {
    current = JSON.parse(readFileSync(statusPath, "utf-8"));
  } else {
    current = getInitialStatus(videoId, updates.filename || videoId);
  }

  const updated: PipelineStatus = {
    ...current,
    ...updates,
    steps: {
      ...current.steps,
      ...(updates.steps || {}),
    },
    updatedAt: new Date().toISOString(),
  };

  writeFileSync(statusPath, JSON.stringify(updated, null, 2));
  return updated;
}

/**
 * Update a single step's status
 */
export function updateStepStatus(
  videoId: string,
  step: PipelineStep,
  stepState: Partial<StepState>
): PipelineStatus {
  const current = getPipelineStatus(videoId, "");
  return updatePipelineStatus(videoId, {
    steps: {
      ...current.steps,
      [step]: {
        ...current.steps[step],
        ...stepState,
      },
    },
  });
}

/**
 * Check if a step can be executed (all dependencies are satisfied)
 */
export function canExecuteStep(status: PipelineStatus, step: PipelineStep): { canExecute: boolean; missingDeps: PipelineStep[] } {
  const dependencies = STEP_DEPENDENCIES[step];
  const missingDeps: PipelineStep[] = [];

  for (const dep of dependencies) {
    if (status.steps[dep].status !== "completed") {
      missingDeps.push(dep);
    }
  }

  return {
    canExecute: missingDeps.length === 0,
    missingDeps,
  };
}

/**
 * Get the result file path for a step
 */
export function getStepResultPath(videoId: string, step: PipelineStep): string {
  const dir = getPipelineDir(videoId);
  return join(dir, `${step}.json`);
}

/**
 * Save step result to JSON file
 */
export function saveStepResult<T>(videoId: string, step: PipelineStep, result: T): string {
  const dir = ensurePipelineDir(videoId);
  const resultPath = join(dir, `${step}.json`);
  writeFileSync(resultPath, JSON.stringify(result, null, 2));
  return resultPath;
}

/**
 * Load step result from JSON file
 */
export function loadStepResult<T>(videoId: string, step: PipelineStep): T | null {
  const resultPath = getStepResultPath(videoId, step);

  if (!existsSync(resultPath)) {
    return null;
  }

  try {
    const content = readFileSync(resultPath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Check if step result exists
 */
export function hasStepResult(videoId: string, step: PipelineStep): boolean {
  return existsSync(getStepResultPath(videoId, step));
}
