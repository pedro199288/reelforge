/**
 * Pipeline utilities for managing individual step execution state
 * State is persisted in public/pipeline/{videoId}/
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename, extname } from "node:path";
import type { SilenceRange } from "../src/core/silence/detect";
import type { Segment } from "../src/core/silence/segments";
import type { PreselectionStats, PreselectedSegment } from "../src/core/preselection";

export type PipelineStep =
  | "silences"
  | "full-captions"
  | "segments"
  | "cut"
  | "captions"
  | "effects-analysis"
  | "rendered"
  | "preselection-logs";

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
    method?: "ffmpeg" | "envelope";
    thresholdDb: number;
    minDurationSec: number;
    amplitudeThreshold?: number;
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
    /** Whether semantic analysis was used for script-aware segmentation */
    usedSemanticAnalysis?: boolean;
  };
  /** Preselection data (when captions-raw is available) */
  preselection?: {
    /** Segments with preselection metadata */
    segments: PreselectedSegment[];
    /** Preselection statistics */
    stats: PreselectionStats;
  };
  createdAt: string;
}

export interface CutMapEntry {
  segmentIndex: number;
  originalStartMs: number;
  originalEndMs: number;
  finalStartMs: number;
  finalEndMs: number;
}

export interface CutResult {
  outputPath: string;
  originalDuration: number;
  editedDuration: number;
  segmentsCount: number;
  cutMap: CutMapEntry[];
  createdAt: string;
}

export interface CaptionsResult {
  captionsPath: string;
  captionsCount: number;
  createdAt: string;
}


export interface EffectsAnalysisResultMeta {
  mainTopic: string;
  topicKeywords: string[];
  overallTone: string;
  language: string;
  wordCount: number;
  enrichedCaptionsCount: number;
  captionsHash: string;
  model: string;
  processingTimeMs: number;
  createdAt: string;
}

// Step dependencies: step -> required preceding steps
// Pipeline:
// silences ────────┐
//                  ├─> segments -> cut ─┐
// full-captions ──┘                     ├─> captions -> effects-analysis -> rendered
// full-captions ───────────────────────┘
// preselection-logs is a side-effect of segments, generated alongside it
// segments uses full-captions for real preselection scoring
// captions are derived from full-captions + cut-map (no second Whisper run)
const STEP_DEPENDENCIES: Record<PipelineStep, PipelineStep[]> = {
  silences: [],
  "full-captions": [],
  segments: ["silences", "full-captions"],
  cut: ["segments"],
  captions: ["full-captions", "cut"],
  "effects-analysis": ["captions"],  // Now depends on post-cut captions
  rendered: ["effects-analysis"],
  "preselection-logs": ["segments"],  // Generated alongside segments
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
      "full-captions": { ...emptyStep },
      segments: { ...emptyStep },
      cut: { ...emptyStep },
      captions: { ...emptyStep },
      "effects-analysis": { ...emptyStep },
      rendered: { ...emptyStep },
      "preselection-logs": { ...emptyStep },
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

/**
 * Reset a step's status to pending (full replace, no merge)
 */
export function resetStepStatus(videoId: string, step: PipelineStep): void {
  const current = getPipelineStatus(videoId, "");
  current.steps[step] = { status: "pending" };
  current.updatedAt = new Date().toISOString();

  const dir = ensurePipelineDir(videoId);
  writeFileSync(join(dir, "status.json"), JSON.stringify(current, null, 2));
}

/**
 * Get public file paths associated with a pipeline step.
 * Returns absolute paths to files that should be deleted when resetting the step.
 */
export function getStepPublicFiles(videoId: string, step: PipelineStep, filename: string): string[] {
  const ext = extname(filename);
  const name = basename(filename, ext);
  const videosDir = join(process.cwd(), "public", "videos");
  const subsDir = join(process.cwd(), "public", "subs");

  switch (step) {
    case "full-captions":
      return [join(subsDir, `${name}.json`)];
    case "cut":
      return [join(videosDir, `${name}-cut${ext}`)];
    case "captions":
      return [join(subsDir, `${name}-cut.json`)];
    case "rendered":
      return [join(videosDir, `${name}-rendered${ext}`)];
    default:
      return [];
  }
}
