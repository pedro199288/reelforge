import type { Caption } from "@/core/script/align";
import {
  cleanupCaptions,
  removePhantomEchoes,
  removeFalseStarts,
  removeRepeatedPhrases,
  fixTimingOnly,
  type CleanupLogEntry,
} from "./cleanup";

export interface CutMapEntry {
  segmentIndex: number;
  originalStartMs: number;
  originalEndMs: number;
  finalStartMs: number;
  finalEndMs: number;
}

export interface DeriveOptions {
  /** Apply cleanup pipeline after remapping (default: true) */
  cleanup?: boolean;
  /** Array to collect cleanup log entries */
  cleanupLog?: CleanupLogEntry[];
}

/**
 * Derive cut-video captions from full (original) captions + cut-map.
 * Forward remapping: original timestamps -> cut timestamps.
 * No Whisper run needed.
 *
 * When cleanup is enabled (default), applies post-remapping pipeline:
 * confidence filter → phantom echoes → false starts → repeated phrases → timing fix
 */
export function deriveCutCaptions(
  fullCaptions: Caption[],
  cutMap: CutMapEntry[],
  options?: DeriveOptions,
): Caption[] {
  let result: Caption[] = [];

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

  if (options?.cleanup !== false) {
    result = cleanupCaptions(result, { _log: options?.cleanupLog });
    result = removePhantomEchoes(result, { log: options?.cleanupLog });
    result = removeFalseStarts(result, options?.cleanupLog);
    result = removeRepeatedPhrases(result, options?.cleanupLog);
    result = fixTimingOnly(result);
  }

  return result;
}
