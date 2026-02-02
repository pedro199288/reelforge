import { useState, useEffect } from "react";
import type { Caption } from "@/core/script/align";

const API_URL = "http://localhost:3012";

interface UseCutCaptionsResult {
  captions: Caption[] | null;
  loading: boolean;
  error: string | null;
}

/**
 * Loads word-level captions from the cut video WITHOUT remapping.
 * These are raw timestamps relative to the cut video, not the original.
 */
export function useCutCaptions(
  videoId: string,
  captionsCompleted: boolean
): UseCutCaptionsResult {
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!captionsCompleted) {
      setCaptions(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const res = await fetch(
          `${API_URL}/api/pipeline/result?videoId=${encodeURIComponent(videoId)}&step=captions`
        );
        if (!res.ok) throw new Error("Failed to fetch captions result");

        const result = (await res.json()) as { captionsPath: string };
        const servablePath = result.captionsPath.replace(/^public\//, "");
        const subsRes = await fetch(`/${servablePath}`);
        if (!subsRes.ok) throw new Error("Failed to fetch captions file");

        const caps = (await subsRes.json()) as Caption[];
        if (!cancelled) {
          setCaptions(caps);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Error loading cut captions"
          );
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [videoId, captionsCompleted]);

  return { captions, loading, error };
}
