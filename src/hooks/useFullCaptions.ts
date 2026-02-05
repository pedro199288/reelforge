import { useState, useEffect } from "react";
import type { Caption } from "@/core/script/align";

const API_URL = "http://localhost:3012";

interface UseFullCaptionsResult {
  captions: Caption[] | null;
  loading: boolean;
  error: string | null;
}

/**
 * Loads word-level captions from the full (original) video.
 * No remapping needed — timestamps already correspond to the original video.
 */
export function useFullCaptions(
  videoId: string,
  fullCaptionsCompleted: boolean
): UseFullCaptionsResult {
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fullCaptionsCompleted) {
      setCaptions(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const res = await fetch(
          `${API_URL}/api/pipeline/result?videoId=${encodeURIComponent(videoId)}&step=full-captions`
        );
        if (!res.ok) throw new Error("Failed to fetch full-captions result");

        const result = (await res.json()) as { captionsPath: string };
        const servablePath = result.captionsPath.replace(/^public\//, "");
        const subsRes = await fetch(`/${servablePath}`);
        if (!subsRes.ok) throw new Error("Failed to fetch full captions file");

        const caps = (await subsRes.json()) as Caption[];
        if (!cancelled) {
          setCaptions(caps);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error loading full captions");
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [videoId, fullCaptionsCompleted]);

  return { captions, loading, error };
}
