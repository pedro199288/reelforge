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

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
}

console.log(`\n🚀 ReelForge API Server running on http://localhost:${PORT}\n`);
console.log("Available endpoints:");
console.log("  POST /api/process  - Process video (SSE stream)");
console.log("  GET  /api/status   - List running processes");
console.log("  POST /api/stop     - Stop a running process");
console.log("  GET  /api/health   - Health check\n");

Bun.serve({
  port: PORT,
  fetch: handleRequest,
});
