import { useState, useEffect, useMemo } from "react";
import type { Caption } from "@/core/script/align";
import type { CutMapEntry } from "@/core/preselection/types";
import { remapCaptionsToOriginal } from "@/core/preselection";

const API_URL = "http://localhost:3012";

interface UseOriginalCaptionsResult {
  captions: Caption[] | null;
  loading: boolean;
  error: string | null;
}

/**
 * Loads word-level captions from the cut video and remaps them
 * to original video timestamps using the cut-map.
 */
export function useOriginalCaptions(
  videoId: string,
  captionsCompleted: boolean
): UseOriginalCaptionsResult {
  const [rawCaptions, setRawCaptions] = useState<Caption[] | null>(null);
  const [cutMap, setCutMap] = useState<CutMapEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!captionsCompleted) {
      setRawCaptions(null);
      setCutMap(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        // Fetch captions path and cut map in parallel
        const [captionsRes, cutRes] = await Promise.all([
          fetch(
            `${API_URL}/api/pipeline/result?videoId=${encodeURIComponent(videoId)}&step=captions`
          ),
          fetch(
            `${API_URL}/api/pipeline/result?videoId=${encodeURIComponent(videoId)}&step=cut`
          ),
        ]);

        if (!captionsRes.ok || !cutRes.ok) {
          throw new Error("Failed to fetch pipeline results");
        }

        const captionsResult = (await captionsRes.json()) as {
          captionsPath: string;
        };
        const cutResult = (await cutRes.json()) as { cutMap: CutMapEntry[] };

        // Fetch the actual captions JSON file
        const subsRes = await fetch(`/${captionsResult.captionsPath}`);
        if (!subsRes.ok) {
          throw new Error("Failed to fetch captions file");
        }

        const captions = (await subsRes.json()) as Caption[];

        if (!cancelled) {
          setRawCaptions(captions);
          setCutMap(cutResult.cutMap);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Error loading captions"
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

  const captions = useMemo(() => {
    if (!rawCaptions || !cutMap) return null;
    return remapCaptionsToOriginal(rawCaptions, cutMap);
  }, [rawCaptions, cutMap]);

  return { captions, loading, error };
}
