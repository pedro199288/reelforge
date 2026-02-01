import type { Caption } from "@/core/script/align";

export interface CutMapEntry {
  segmentIndex: number;
  originalStartMs: number;
  originalEndMs: number;
  finalStartMs: number;
  finalEndMs: number;
}

/**
 * Derive cut-video captions from full (original) captions + cut-map.
 * Forward remapping: original timestamps -> cut timestamps.
 * No Whisper run needed.
 */
export function deriveCutCaptions(
  fullCaptions: Caption[],
  cutMap: CutMapEntry[],
): Caption[] {
  const result: Caption[] = [];

  for (const entry of cutMap) {
    // Find captions whose startMs falls within this segment's original range
    const segmentCaptions = fullCaptions.filter(
      (c) =>
        c.startMs >= entry.originalStartMs &&
        c.startMs < entry.originalEndMs,
    );

    for (const caption of segmentCaptions) {
      const offset = caption.startMs - entry.originalStartMs;
      const endOffset = caption.endMs - entry.originalStartMs;
      result.push({
        ...caption,
        startMs: entry.finalStartMs + offset,
        endMs: Math.min(entry.finalStartMs + endOffset, entry.finalEndMs),
      });
    }
  }

  return result;
}
