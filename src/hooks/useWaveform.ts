import { useState, useEffect } from "react";
import type { WaveformData } from "@/core/audio/waveform";
import { downsampleWaveform } from "@/core/audio/waveform";

const API_BASE = "http://localhost:3012";

// Cache waveform data in memory
const waveformCache = new Map<string, WaveformData>();

interface UseWaveformOptions {
  /** Samples per second to extract (default: 100) */
  samplesPerSecond?: number;
  /** Target number of points for visualization */
  targetPoints?: number;
}

interface UseWaveformResult {
  data: number[] | null;
  rawData: WaveformData | null;
  loading: boolean;
  error: string | null;
}

/**
 * Extract filename from a video path or URL.
 * Handles formats like:
 * - "video.mp4" (plain filename)
 * - "/path/to/video.mp4" (local path)
 * - "http://localhost:3012/api/stream/videos/video.mp4" (streaming URL)
 */
function extractFilename(pathOrUrl: string): string {
  // If it's a URL with /api/stream/videos/, extract the filename
  const streamMatch = pathOrUrl.match(/\/api\/stream\/videos\/(.+)$/);
  if (streamMatch) {
    return decodeURIComponent(streamMatch[1]);
  }
  // Otherwise, get the last segment of the path
  const segments = pathOrUrl.split("/");
  return segments[segments.length - 1];
}

export function useWaveform(
  videoPath: string | null,
  options: UseWaveformOptions = {}
): UseWaveformResult {
  const { samplesPerSecond = 100, targetPoints } = options;
  const [rawData, setRawData] = useState<WaveformData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoPath) {
      setRawData(null);
      return;
    }

    // Extract just the filename for the API request
    const filename = extractFilename(videoPath);
    const cacheKey = `${filename}:${samplesPerSecond}`;

    // Check cache first
    if (waveformCache.has(cacheKey)) {
      setRawData(waveformCache.get(cacheKey)!);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/api/waveform`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoPath: filename, samplesPerSecond }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch waveform: ${res.status}`);
        return res.json();
      })
      .then((data: WaveformData) => {
        if (cancelled) return;
        waveformCache.set(cacheKey, data);
        setRawData(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [videoPath, samplesPerSecond]);

  // Downsample if targetPoints specified
  const data = rawData
    ? targetPoints
      ? downsampleWaveform(rawData, targetPoints)
      : rawData.samples
    : null;

  return { data, rawData, loading, error };
}

/**
 * Clear the waveform cache for a specific video or all videos
 */
export function clearWaveformCache(videoPath?: string): void {
  if (videoPath) {
    for (const key of waveformCache.keys()) {
      if (key.startsWith(videoPath)) {
        waveformCache.delete(key);
      }
    }
  } else {
    waveformCache.clear();
  }
}
