/**
 * Backend API server for ReelForge
 * Exposes endpoints for video processing with real-time progress via SSE
 *
 * Run with: bun server/api.ts
 */

import { spawn, type Subprocess } from "bun";
import { existsSync, mkdirSync } from "node:fs";
import { join, basename, extname, dirname } from "node:path";

import {
  getPipelineStatus,
  updatePipelineStatus,
  updateStepStatus,
  canExecuteStep,
  saveStepResult,
  loadStepResult,
  type PipelineStep,
  type SilencesResult,
  type SegmentsResult,
  type CutResult,
  type CaptionsResult,
} from "./pipeline-utils";
import {
  detectSilences,
  getVideoDuration,
  silencesToSegments,
  getTotalDuration,
} from "../src/core/silence";
import { cutVideo } from "../src/core/cut";

const PORT = 3012;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Track running processes
const runningProcesses = new Map<string, Subprocess>();

// Track batch processing state
interface BatchState {
  isProcessing: boolean;
  isPaused: boolean;
  queue: string[];
  processing: Set<string>;
  completed: Set<string>;
  errors: Map<string, string>;
}

const batchState: BatchState = {
  isProcessing: false,
  isPaused: false,
  queue: [],
  processing: new Set(),
  completed: new Set(),
  errors: new Map(),
};

interface ProcessConfig {
  thresholdDb?: number;
  minDurationSec?: number;
  paddingSec?: number;
  codecCopy?: boolean;
  crf?: number;
}

function generateOutputPath(inputPath: string): string {
  const dir = dirname(inputPath);
  const ext = extname(inputPath);
  const name = basename(inputPath, ext);
  return join(dir, `${name}-cut${ext}`);
}

async function handleProcessVideo(
  req: Request,
  videoPath: string,
  config: ProcessConfig = {}
): Promise<Response> {
  const fullPath = join(process.cwd(), "public", "videos", videoPath);

  if (!existsSync(fullPath)) {
    return new Response(JSON.stringify({ error: `Video not found: ${fullPath}` }), {
      status: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Build command args
  const args = ["process-video.ts", fullPath];
  if (config.thresholdDb !== undefined) {
    args.push("--threshold", String(config.thresholdDb));
  }
  if (config.minDurationSec !== undefined) {
    args.push("--min-silence", String(config.minDurationSec));
  }
  if (config.paddingSec !== undefined) {
    args.push("--padding", String(config.paddingSec));
  }
  if (config.codecCopy) {
    args.push("--fast");
  }
  if (config.crf !== undefined) {
    args.push("--crf", String(config.crf));
  }

  // SSE stream for real-time progress
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      // Kill process if client disconnects
      const proc = runningProcesses.get(videoPath);
      if (proc) {
        proc.kill();
        runningProcesses.delete(videoPath);
      }
    },
  });

  const sendEvent = (event: string, data: object) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(encoder.encode(message));
  };

  // Start the process
  const proc = spawn(["bun", ...args], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  runningProcesses.set(videoPath, proc);

  // Process output in background
  (async () => {
    try {
      sendEvent("start", { video: videoPath, timestamp: new Date().toISOString() });

      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          // Parse progress from output
          const progress = parseProgressLine(line);
          if (progress) {
            sendEvent("progress", progress);
          } else {
            sendEvent("log", { message: line });
          }
        }
      }

      // Wait for process to complete
      const exitCode = await proc.exited;

      if (exitCode === 0) {
        const outputPath = generateOutputPath(fullPath);
        sendEvent("complete", {
          success: true,
          outputPath: outputPath.replace(process.cwd() + "/", ""),
        });
      } else {
        sendEvent("error", { message: `Process exited with code ${exitCode}` });
      }
    } catch (error) {
      sendEvent("error", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      runningProcesses.delete(videoPath);
      controller.close();
    }
  })();

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function parseProgressLine(line: string): { step: string; progress: number; message: string } | null {
  // Match step indicators like "1️⃣", "2️⃣", etc.
  const stepMatch = line.match(/^(\d)️⃣\s+(.+)/);
  if (stepMatch) {
    const stepNum = parseInt(stepMatch[1], 10);
    const message = stepMatch[2];
    const progress = Math.round((stepNum / 6) * 100);
    const stepNames = ["", "duration", "silences", "segments", "cut", "subtitles", "metadata"];
    return { step: stepNames[stepNum] || `step${stepNum}`, progress, message };
  }

  // Match completion line
  if (line.includes("Processing complete")) {
    return { step: "complete", progress: 100, message: "Processing complete!" };
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processVideoForBatch(
  video: { id: string; videoId: string; filename: string },
  config: ProcessConfig,
  sendEvent: (event: string, data: object) => void
): Promise<void> {
  const fullPath = join(process.cwd(), "public", "videos", video.filename);

  if (!existsSync(fullPath)) {
    throw new Error(`Video not found: ${fullPath}`);
  }

  // Build command args
  const args = ["process-video.ts", fullPath];
  if (config.thresholdDb !== undefined) {
    args.push("--threshold", String(config.thresholdDb));
  }
  if (config.minDurationSec !== undefined) {
    args.push("--min-silence", String(config.minDurationSec));
  }
  if (config.paddingSec !== undefined) {
    args.push("--padding", String(config.paddingSec));
  }
  if (config.codecCopy) {
    args.push("--fast");
  }
  if (config.crf !== undefined) {
    args.push("--crf", String(config.crf));
  }

  const proc = spawn(["bun", ...args], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  runningProcesses.set(video.id, proc);

  try {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;

        const progress = parseProgressLine(line);
        if (progress) {
          sendEvent("item:progress", {
            id: video.id,
            filename: video.filename,
            ...progress,
          });
        }
      }
    }

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      throw new Error(`Process exited with code ${exitCode}`);
    }
  } finally {
    runningProcesses.delete(video.id);
  }
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // Health check
  if (path === "/api/health") {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Import video endpoint
  if (path === "/api/import" && req.method === "POST") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return new Response(JSON.stringify({ error: "No file provided" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      // Validate file type
      const validTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"];
      if (!validTypes.some((t) => file.type.startsWith(t.split("/")[0]))) {
        return new Response(JSON.stringify({ error: "Invalid file type. Only video files are accepted." }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const videosDir = join(process.cwd(), "public", "videos");
      if (!existsSync(videosDir)) {
        mkdirSync(videosDir, { recursive: true });
      }

      // Save file
      const filename = file.name;
      const filePath = join(videosDir, filename);
      const arrayBuffer = await file.arrayBuffer();
      await Bun.write(filePath, arrayBuffer);

      // Generate video ID and title
      const ext = extname(filename);
      const nameWithoutExt = basename(filename, ext);
      const id = nameWithoutExt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const title = nameWithoutExt
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      // Update manifest
      const manifestPath = join(process.cwd(), "public", "videos.manifest.json");
      let manifest: { videos: Array<{ id: string; filename: string; title: string; size: number; hasCaptions: boolean }> } = { videos: [] };

      if (existsSync(manifestPath)) {
        manifest = JSON.parse(await Bun.file(manifestPath).text());
      }

      // Check if video already exists
      const existingIndex = manifest.videos.findIndex((v) => v.filename === filename);
      const videoEntry = {
        id,
        filename,
        title,
        size: file.size,
        hasCaptions: false,
      };

      if (existingIndex >= 0) {
        manifest.videos[existingIndex] = videoEntry;
      } else {
        manifest.videos.unshift(videoEntry);
      }

      await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));

      return new Response(JSON.stringify({ success: true, video: videoEntry }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
  }

  // Process video endpoint
  if (path === "/api/process" && req.method === "POST") {
    const body = await req.json();
    const { video, config } = body as { video: string; config?: ProcessConfig };

    if (!video) {
      return new Response(JSON.stringify({ error: "Missing video parameter" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return handleProcessVideo(req, video, config);
  }

  // List running processes
  if (path === "/api/status") {
    return new Response(
      JSON.stringify({
        running: Array.from(runningProcesses.keys()),
      }),
      {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  // Stop process
  if (path === "/api/stop" && req.method === "POST") {
    const body = await req.json();
    const { video } = body as { video: string };

    const proc = runningProcesses.get(video);
    if (proc) {
      proc.kill();
      runningProcesses.delete(video);
      return new Response(JSON.stringify({ stopped: video }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Process not found" }), {
      status: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Batch processing endpoints
  if (path === "/api/batch/start" && req.method === "POST") {
    const body = await req.json();
    const { videos, config, maxParallel = 2 } = body as {
      videos: Array<{ id: string; videoId: string; filename: string }>;
      config?: ProcessConfig;
      maxParallel?: number;
    };

    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      return new Response(JSON.stringify({ error: "No videos provided" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Reset batch state
    batchState.isProcessing = true;
    batchState.isPaused = false;
    batchState.queue = videos.map((v) => v.id);
    batchState.processing.clear();
    batchState.completed.clear();
    batchState.errors.clear();

    // SSE stream for batch progress
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;

    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
      cancel() {
        // Stop all processing if client disconnects
        batchState.isProcessing = false;
        for (const videoPath of batchState.processing) {
          const proc = runningProcesses.get(videoPath);
          if (proc) {
            proc.kill();
            runningProcesses.delete(videoPath);
          }
        }
      },
    });

    const sendEvent = (event: string, data: object) => {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      try {
        controller.enqueue(encoder.encode(message));
      } catch {
        // Stream closed
      }
    };

    // Process batch in background
    (async () => {
      sendEvent("batch:start", {
        total: videos.length,
        timestamp: new Date().toISOString(),
      });

      const pending = [...videos];
      const activeProcesses: Array<Promise<void>> = [];

      const processNext = async () => {
        while (pending.length > 0 && !batchState.isPaused && batchState.isProcessing) {
          if (batchState.processing.size >= maxParallel) {
            await sleep(100);
            continue;
          }

          const video = pending.shift()!;
          batchState.processing.add(video.id);
          sendEvent("item:start", { id: video.id, filename: video.filename });

          const promise = processVideoForBatch(video, config || {}, sendEvent)
            .then(() => {
              batchState.processing.delete(video.id);
              batchState.completed.add(video.id);
              sendEvent("item:complete", { id: video.id, filename: video.filename });
            })
            .catch((error) => {
              batchState.processing.delete(video.id);
              const errorMsg = error instanceof Error ? error.message : "Unknown error";
              batchState.errors.set(video.id, errorMsg);
              sendEvent("item:error", {
                id: video.id,
                filename: video.filename,
                error: errorMsg,
              });
            });

          activeProcesses.push(promise);
        }
      };

      await processNext();
      await Promise.all(activeProcesses);

      batchState.isProcessing = false;
      sendEvent("batch:complete", {
        completed: batchState.completed.size,
        errors: batchState.errors.size,
        timestamp: new Date().toISOString(),
      });

      controller.close();
    })();

    return new Response(stream, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  if (path === "/api/batch/stop" && req.method === "POST") {
    batchState.isProcessing = false;
    batchState.isPaused = false;

    // Kill all active processes
    for (const videoPath of batchState.processing) {
      const proc = runningProcesses.get(videoPath);
      if (proc) {
        proc.kill();
        runningProcesses.delete(videoPath);
      }
    }
    batchState.processing.clear();

    return new Response(JSON.stringify({ stopped: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (path === "/api/batch/pause" && req.method === "POST") {
    batchState.isPaused = true;
    return new Response(JSON.stringify({ paused: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (path === "/api/batch/resume" && req.method === "POST") {
    batchState.isPaused = false;
    return new Response(JSON.stringify({ resumed: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (path === "/api/batch/status") {
    return new Response(
      JSON.stringify({
        isProcessing: batchState.isProcessing,
        isPaused: batchState.isPaused,
        pending: batchState.queue.length - batchState.completed.size - batchState.errors.size,
        processing: Array.from(batchState.processing),
        completed: batchState.completed.size,
        errors: batchState.errors.size,
      }),
      {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  // Reset pipeline data endpoint
  if (path === "/api/reset" && req.method === "POST") {
    try {
      const body = await req.json();
      const { videoId, phases } = body as {
        videoId: string;
        phases: ("cut" | "captions" | "metadata" | "all")[];
      };

      if (!videoId) {
        return new Response(JSON.stringify({ error: "Missing videoId" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const deleted: string[] = [];
      const videosDir = join(process.cwd(), "public", "videos");
      const subsDir = join(process.cwd(), "public", "subs");
      const metadataDir = join(process.cwd(), "public", "metadata");

      // Find the video in manifest to get filename
      const manifestPath = join(process.cwd(), "public", "videos.manifest.json");
      let manifest: { videos: Array<{ id: string; filename: string; title: string; size: number; hasCaptions: boolean }> } = { videos: [] };

      if (existsSync(manifestPath)) {
        manifest = JSON.parse(await Bun.file(manifestPath).text());
      }

      const video = manifest.videos.find((v) => v.id === videoId);
      if (!video) {
        return new Response(JSON.stringify({ error: `Video not found: ${videoId}` }), {
          status: 404,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const ext = extname(video.filename);
      const nameWithoutExt = basename(video.filename, ext);

      const shouldReset = (phase: "cut" | "captions" | "metadata") =>
        phases.includes(phase) || phases.includes("all");

      // Delete cut video
      if (shouldReset("cut")) {
        const cutVideoPath = join(videosDir, `${nameWithoutExt}-cut${ext}`);
        if (existsSync(cutVideoPath)) {
          await Bun.write(cutVideoPath, ""); // Clear file first
          const { unlinkSync } = await import("node:fs");
          unlinkSync(cutVideoPath);
          deleted.push(`videos/${nameWithoutExt}-cut${ext}`);
        }
      }

      // Delete captions/subs
      if (shouldReset("captions")) {
        const subsJsonPath = join(subsDir, `${nameWithoutExt}-cut.json`);
        if (existsSync(subsJsonPath)) {
          const { unlinkSync } = await import("node:fs");
          unlinkSync(subsJsonPath);
          deleted.push(`subs/${nameWithoutExt}-cut.json`);
        }

        // Update manifest hasCaptions
        const videoIndex = manifest.videos.findIndex((v) => v.id === videoId);
        if (videoIndex >= 0) {
          manifest.videos[videoIndex].hasCaptions = false;
          await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));
        }
      }

      // Delete metadata
      if (shouldReset("metadata")) {
        const metadataJsonPath = join(metadataDir, `${nameWithoutExt}-cut.json`);
        if (existsSync(metadataJsonPath)) {
          const { unlinkSync } = await import("node:fs");
          unlinkSync(metadataJsonPath);
          deleted.push(`metadata/${nameWithoutExt}-cut.json`);
        }
      }

      return new Response(
        JSON.stringify({ success: true, deleted }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
  }

  // Waveform extraction endpoint
  if (path === "/api/waveform" && req.method === "POST") {
    try {
      const body = await req.json();
      const { videoPath, samplesPerSecond = 100 } = body as {
        videoPath: string;
        samplesPerSecond?: number;
      };

      const fullPath = join(process.cwd(), "public", "videos", videoPath);
      if (!existsSync(fullPath)) {
        return new Response(
          JSON.stringify({ error: `Video not found: ${videoPath}` }),
          { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Extract audio samples using FFmpeg
      // Output: mono, resampled to target rate, 32-bit float PCM
      const proc = spawn([
        "ffmpeg",
        "-i", fullPath,
        "-ac", "1",                          // Mono
        "-ar", String(samplesPerSecond),     // Sample rate
        "-f", "f32le",                        // 32-bit float little-endian
        "-",                                  // Output to stdout
      ], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const chunks: Uint8Array[] = [];
      const reader = proc.stdout.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      await proc.exited;

      // Combine chunks and convert to Float32Array
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const buffer = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.length;
      }

      const float32 = new Float32Array(buffer.buffer);
      const samples = Array.from(float32);

      // Normalize samples
      let maxAbs = 0;
      for (const s of samples) {
        const abs = Math.abs(s);
        if (abs > maxAbs) maxAbs = abs;
      }
      const normalized = maxAbs > 0 ? samples.map(s => s / maxAbs) : samples;

      return new Response(
        JSON.stringify({
          samples: normalized,
          sampleRate: samplesPerSecond,
          duration: samples.length / samplesPerSecond,
        }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({ error: String(error) }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }
  }

  // Pipeline individual step endpoints
  // GET /api/pipeline/status - Get pipeline status for a video
  if (path === "/api/pipeline/status" && req.method === "GET") {
    const videoId = url.searchParams.get("videoId");
    const filename = url.searchParams.get("filename");

    if (!videoId || !filename) {
      return new Response(JSON.stringify({ error: "Missing videoId or filename" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const status = getPipelineStatus(videoId, filename);
    return new Response(JSON.stringify(status), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // GET /api/pipeline/result - Get result of a specific step
  if (path === "/api/pipeline/result" && req.method === "GET") {
    const videoId = url.searchParams.get("videoId");
    const step = url.searchParams.get("step") as PipelineStep | null;

    if (!videoId || !step) {
      return new Response(JSON.stringify({ error: "Missing videoId or step" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const result = loadStepResult(videoId, step);
    if (!result) {
      return new Response(JSON.stringify({ error: "Result not found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // POST /api/pipeline/step - Execute a single pipeline step (SSE)
  if (path === "/api/pipeline/step" && req.method === "POST") {
    const body = await req.json();
    const { videoId, filename, step, config } = body as {
      videoId: string;
      filename: string;
      step: PipelineStep;
      config?: {
        thresholdDb?: number;
        minDurationSec?: number;
        paddingSec?: number;
        codecCopy?: boolean;
        crf?: number;
      };
    };

    if (!videoId || !filename || !step) {
      return new Response(JSON.stringify({ error: "Missing videoId, filename, or step" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Validate step name
    const validSteps: PipelineStep[] = ["silences", "segments", "cut", "captions"];
    if (!validSteps.includes(step)) {
      return new Response(JSON.stringify({ error: `Invalid step: ${step}` }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Check dependencies
    const status = getPipelineStatus(videoId, filename);
    const { canExecute, missingDeps } = canExecuteStep(status, step);

    if (!canExecute) {
      return new Response(
        JSON.stringify({
          error: "Dependencies not satisfied",
          missingDeps,
        }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    // SSE stream for progress
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;

    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });

    const sendEvent = (event: string, data: object) => {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      try {
        controller.enqueue(encoder.encode(message));
      } catch {
        // Stream closed
      }
    };

    // Execute step in background
    (async () => {
      const videoPath = join(process.cwd(), "public", "videos", filename);

      try {
        // Mark step as running
        updateStepStatus(videoId, step, {
          status: "running",
          startedAt: new Date().toISOString(),
          error: undefined,
        });

        sendEvent("start", { step, videoId, timestamp: new Date().toISOString() });

        switch (step) {
          case "silences": {
            sendEvent("progress", { step, progress: 10, message: "Obteniendo duración del video..." });
            const duration = await getVideoDuration(videoPath);

            sendEvent("progress", { step, progress: 30, message: "Detectando silencios..." });
            const silences = await detectSilences(videoPath, {
              thresholdDb: config?.thresholdDb ?? -35,
              minDurationSec: config?.minDurationSec ?? 0.5,
            });

            sendEvent("progress", { step, progress: 90, message: "Guardando resultados..." });
            const result: SilencesResult = {
              silences,
              videoDuration: duration,
              config: {
                thresholdDb: config?.thresholdDb ?? -35,
                minDurationSec: config?.minDurationSec ?? 0.5,
              },
              createdAt: new Date().toISOString(),
            };

            const resultPath = saveStepResult(videoId, step, result);
            updateStepStatus(videoId, step, {
              status: "completed",
              completedAt: new Date().toISOString(),
              resultFile: resultPath,
            });
            updatePipelineStatus(videoId, { videoDuration: duration });

            sendEvent("complete", { step, result });
            break;
          }

          case "segments": {
            sendEvent("progress", { step, progress: 10, message: "Cargando silencios..." });
            const silencesResult = loadStepResult<SilencesResult>(videoId, "silences");

            if (!silencesResult) {
              throw new Error("Silences result not found");
            }

            sendEvent("progress", { step, progress: 50, message: "Calculando segmentos..." });
            const segments = silencesToSegments(
              silencesResult.silences,
              silencesResult.videoDuration,
              { paddingSec: config?.paddingSec ?? 0.05 }
            );

            const editedDuration = getTotalDuration(segments);
            const timeSaved = silencesResult.videoDuration - editedDuration;

            sendEvent("progress", { step, progress: 90, message: "Guardando resultados..." });
            const result: SegmentsResult = {
              segments,
              totalDuration: silencesResult.videoDuration,
              editedDuration,
              timeSaved,
              percentSaved: (timeSaved / silencesResult.videoDuration) * 100,
              config: {
                paddingSec: config?.paddingSec ?? 0.05,
              },
              createdAt: new Date().toISOString(),
            };

            const resultPath = saveStepResult(videoId, step, result);
            updateStepStatus(videoId, step, {
              status: "completed",
              completedAt: new Date().toISOString(),
              resultFile: resultPath,
            });

            sendEvent("complete", { step, result });
            break;
          }

          case "cut": {
            sendEvent("progress", { step, progress: 10, message: "Cargando segmentos..." });
            const segmentsResult = loadStepResult<SegmentsResult>(videoId, "segments");

            if (!segmentsResult) {
              throw new Error("Segments result not found");
            }

            const ext = extname(filename);
            const name = basename(filename, ext);
            const outputPath = join(process.cwd(), "public", "videos", `${name}-cut${ext}`);

            sendEvent("progress", { step, progress: 20, message: "Cortando video..." });
            // Use re-encoding (codecCopy=false) by default for precise frame-accurate cuts
            await cutVideo(videoPath, segmentsResult.segments, outputPath, {
              codecCopy: config?.codecCopy ?? false,
              crf: config?.crf ?? 18,
            });

            sendEvent("progress", { step, progress: 90, message: "Guardando resultados..." });
            const result: CutResult = {
              outputPath: outputPath.replace(process.cwd() + "/", ""),
              originalDuration: segmentsResult.totalDuration,
              editedDuration: segmentsResult.editedDuration,
              segmentsCount: segmentsResult.segments.length,
              createdAt: new Date().toISOString(),
            };

            const resultPath = saveStepResult(videoId, step, result);
            updateStepStatus(videoId, step, {
              status: "completed",
              completedAt: new Date().toISOString(),
              resultFile: resultPath,
            });

            sendEvent("complete", { step, result });
            break;
          }

          case "captions": {
            sendEvent("progress", { step, progress: 10, message: "Verificando video cortado..." });
            const cutResult = loadStepResult<CutResult>(videoId, "cut");

            if (!cutResult) {
              throw new Error("Cut result not found");
            }

            const cutVideoPath = join(process.cwd(), cutResult.outputPath);
            if (!existsSync(cutVideoPath)) {
              throw new Error(`Cut video not found: ${cutResult.outputPath}`);
            }

            sendEvent("progress", { step, progress: 20, message: "Generando subtítulos con Whisper..." });

            // Run sub.mjs as a subprocess
            const proc = spawn(["node", "sub.mjs", cutVideoPath], {
              cwd: process.cwd(),
              stdout: "pipe",
              stderr: "pipe",
            });

            // Wait for completion
            const exitCode = await proc.exited;

            if (exitCode !== 0) {
              throw new Error(`Subtitle generation failed with code ${exitCode}`);
            }

            // Determine output subs path
            const ext = extname(cutResult.outputPath);
            const name = basename(cutResult.outputPath, ext);
            const subsPath = join("public", "subs", `${name}.json`);

            sendEvent("progress", { step, progress: 90, message: "Guardando resultados..." });

            // Count captions
            let captionsCount = 0;
            const fullSubsPath = join(process.cwd(), subsPath);
            if (existsSync(fullSubsPath)) {
              try {
                const captions = JSON.parse(await Bun.file(fullSubsPath).text());
                captionsCount = Array.isArray(captions) ? captions.length : 0;
              } catch {
                // Ignore parse errors
              }
            }

            const result: CaptionsResult = {
              captionsPath: subsPath,
              captionsCount,
              createdAt: new Date().toISOString(),
            };

            const resultPath = saveStepResult(videoId, step, result);
            updateStepStatus(videoId, step, {
              status: "completed",
              completedAt: new Date().toISOString(),
              resultFile: resultPath,
            });

            sendEvent("complete", { step, result });
            break;
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        updateStepStatus(videoId, step, {
          status: "error",
          error: errorMessage,
        });
        sendEvent("error", { step, error: errorMessage });
      } finally {
        controller.close();
      }
    })();

    return new Response(stream, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
}

console.log(`\n🚀 ReelForge API Server running on http://localhost:${PORT}\n`);
console.log("Available endpoints:");
console.log("  POST /api/import       - Import video file (FormData)");
console.log("  POST /api/process      - Process single video (SSE stream)");
console.log("  GET  /api/status       - List running processes");
console.log("  POST /api/stop         - Stop a running process");
console.log("  GET  /api/health       - Health check");
console.log("");
console.log("Batch processing:");
console.log("  POST /api/batch/start  - Start batch processing (SSE stream)");
console.log("  POST /api/batch/stop   - Stop all batch processing");
console.log("  POST /api/batch/pause  - Pause batch processing");
console.log("  POST /api/batch/resume - Resume batch processing");
console.log("  GET  /api/batch/status - Get batch processing status");
console.log("");
console.log("Pipeline steps:");
console.log("  GET  /api/pipeline/status  - Get pipeline status for a video");
console.log("  POST /api/pipeline/step    - Execute single step (SSE stream)");
console.log("  GET  /api/pipeline/result  - Get result of a step");
console.log("");
console.log("Audio:");
console.log("  POST /api/waveform     - Extract waveform from video");
console.log("");
console.log("Pipeline reset:");
console.log("  POST /api/reset        - Reset pipeline phases (cut, captions, metadata)\n");

Bun.serve({
  port: PORT,
  fetch: handleRequest,
});
