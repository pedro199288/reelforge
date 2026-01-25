/**
 * Backend API server for ReelForge
 * Exposes endpoints for video processing with real-time progress via SSE
 *
 * Run with: bun server/api.ts
 */

import { spawn, type Subprocess } from "bun";
import { existsSync, mkdirSync } from "node:fs";
import { join, basename, extname, dirname } from "node:path";

const PORT = 3003;
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
  let controller: ReadableStreamDefaultController<Uint8Array>;

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
    let controller: ReadableStreamDefaultController<Uint8Array>;

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

      const videoMap = new Map(videos.map((v) => [v.id, v]));
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
console.log("  GET  /api/batch/status - Get batch processing status\n");

Bun.serve({
  port: PORT,
  fetch: handleRequest,
});
