import { useMemo, useCallback } from "react";
import type { CutMapEntry } from "@/core/preselection/types";
import type { TimelineSegment } from "@/store/timeline";
import type { Caption } from "@/core/script/align";
import { useEditorUIStore } from "@/store/editor-ui";

export type CoordinateSpace = "original" | "cut";

interface UseCoordinateSpaceResult {
  /** Current active coordinate space */
  space: CoordinateSpace;

  /** Total duration in the active space (ms) */
  activeDuration: number;

  /** Map ms from cut-space to original-space. Returns null if outside any segment. */
  toOriginal: (cutMs: number) => number | null;

  /** Map ms from original-space to cut-space. Returns null if in a gap. */
  toCut: (originalMs: number) => number | null;

  /** Map ms to the active space from the given source space */
  toActive: (ms: number, from: CoordinateSpace) => number | null;

  /** Map segments to cut-space (only enabled, contiguous) */
  mapSegmentsToCut: (segments: TimelineSegment[]) => TimelineSegment[];

  /** Map captions to cut-space */
  mapCaptionsToCut: (captions: Caption[]) => Caption[];
}

/**
 * Hook that provides bidirectional mapping between original and cut coordinate spaces.
 *
 * The cutMap provides the mapping: each entry has
 *   { originalStartMs, originalEndMs, finalStartMs, finalEndMs }
 *
 * When videoSource is "original", space = "original" and no mapping needed.
 * When videoSource is "cut" or "preview", space = "cut" and all coordinates
 * need to be mapped through the cutMap.
 */
export function useCoordinateSpace(
  cutMap: CutMapEntry[] | null,
  totalDurationMs: number,
): UseCoordinateSpaceResult {
  const videoSource = useEditorUIStore((s) => s.videoSource);

  const space: CoordinateSpace =
    videoSource === "original" ? "original" : "cut";

  // Compute total cut duration from cutMap
  const cutDuration = useMemo(() => {
    if (!cutMap || cutMap.length === 0) return 0;
    const last = cutMap[cutMap.length - 1];
    return last.finalEndMs;
  }, [cutMap]);

  const activeDuration = space === "original" ? totalDurationMs : cutDuration;

  const toOriginal = useCallback(
    (cutMs: number): number | null => {
      if (!cutMap || cutMap.length === 0) return null;
      for (const entry of cutMap) {
        if (cutMs >= entry.finalStartMs && cutMs <= entry.finalEndMs) {
          const offset = cutMs - entry.finalStartMs;
          return entry.originalStartMs + offset;
        }
      }
      return null;
    },
    [cutMap]
  );

  const toCut = useCallback(
    (originalMs: number): number | null => {
      if (!cutMap || cutMap.length === 0) return null;
      for (const entry of cutMap) {
        if (originalMs >= entry.originalStartMs && originalMs <= entry.originalEndMs) {
          const offset = originalMs - entry.originalStartMs;
          return entry.finalStartMs + offset;
        }
      }
      // Outside any segment in the cutMap → in a gap
      return null;
    },
    [cutMap]
  );

  const toActive = useCallback(
    (ms: number, from: CoordinateSpace): number | null => {
      if (from === space) return ms;
      if (from === "original" && space === "cut") return toCut(ms);
      if (from === "cut" && space === "original") return toOriginal(ms);
      return ms;
    },
    [space, toCut, toOriginal]
  );

  const mapSegmentsToCut = useCallback(
    (segments: TimelineSegment[]): TimelineSegment[] => {
      if (!cutMap || cutMap.length === 0) return [];
      const enabled = segments
        .filter((s) => s.enabled)
        .sort((a, b) => a.startMs - b.startMs);

      return enabled.map((seg) => {
        const cutStart = toCut(seg.startMs);
        const cutEnd = toCut(seg.endMs);
        return {
          ...seg,
          startMs: cutStart ?? 0,
          endMs: cutEnd ?? 0,
        };
      });
    },
    [cutMap, toCut]
  );

  const mapCaptionsToCut = useCallback(
    (captions: Caption[]): Caption[] => {
      if (!cutMap || cutMap.length === 0) return [];
      return captions
        .map((cap) => {
          const cutStart = toCut(cap.startMs);
          const cutEnd = toCut(cap.endMs);
          if (cutStart === null || cutEnd === null) return null;
          return { ...cap, startMs: cutStart, endMs: cutEnd };
        })
        .filter((c): c is Caption => c !== null);
    },
    [cutMap, toCut]
  );

  return {
    space,
    activeDuration,
    toOriginal,
    toCut,
    toActive,
    mapSegmentsToCut,
    mapCaptionsToCut,
  };
}
