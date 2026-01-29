/**
 * Segment Splitter
 *
 * Handles splitting segments based on AI-proposed split points.
 * Used when a segment contains both good and bad content that
 * should be separated.
 */
import type { PreselectedSegment, ProposedSplit } from "./types";

/**
 * Result of splitting a segment
 */
export interface SplitResult {
  /** First part (before split point) */
  first: PreselectedSegment;
  /** Second part (after split point) */
  second: PreselectedSegment;
}

/**
 * Split a segment at a specific timestamp
 *
 * @param segment - The segment to split
 * @param splitAtMs - Timestamp relative to segment start where to split
 * @param options - Options for the split
 * @returns The two resulting segments, or null if split is invalid
 */
export function splitSegment(
  segment: PreselectedSegment,
  splitAtMs: number,
  options: {
    enableFirst: boolean;
    enableSecond: boolean;
    reason: string;
    /** Minimum segment duration in ms (default: 500) */
    minDurationMs?: number;
  }
): SplitResult | null {
  const minDuration = options.minDurationMs ?? 500;
  const absoluteSplitMs = segment.startMs + splitAtMs;

  // Validate split point
  if (splitAtMs <= 0) {
    console.warn(
      `[segment-splitter] Invalid split: splitAtMs (${splitAtMs}) must be positive`
    );
    return null;
  }

  if (absoluteSplitMs >= segment.endMs) {
    console.warn(
      `[segment-splitter] Invalid split: split point (${absoluteSplitMs}) >= segment end (${segment.endMs})`
    );
    return null;
  }

  // Check minimum duration for both parts
  const firstDuration = absoluteSplitMs - segment.startMs;
  const secondDuration = segment.endMs - absoluteSplitMs;

  if (firstDuration < minDuration) {
    console.warn(
      `[segment-splitter] First part too short: ${firstDuration}ms < ${minDuration}ms`
    );
    return null;
  }

  if (secondDuration < minDuration) {
    console.warn(
      `[segment-splitter] Second part too short: ${secondDuration}ms < ${minDuration}ms`
    );
    return null;
  }

  // Create the two new segments
  const first: PreselectedSegment = {
    id: `${segment.id}-a`,
    startMs: segment.startMs,
    endMs: absoluteSplitMs,
    enabled: options.enableFirst,
    score: options.enableFirst ? segment.score : Math.max(0, segment.score - 30),
    reason: options.enableFirst
      ? `Primera parte: ${options.reason}`
      : `Descartado (split): ${options.reason}`,
    contentType: options.enableFirst ? segment.contentType : "false_start",
    coversScriptLines: options.enableFirst ? segment.coversScriptLines : [],
  };

  const second: PreselectedSegment = {
    id: `${segment.id}-b`,
    startMs: absoluteSplitMs,
    endMs: segment.endMs,
    enabled: options.enableSecond,
    score: options.enableSecond
      ? segment.score
      : Math.max(0, segment.score - 30),
    reason: options.enableSecond
      ? `Segunda parte: ${options.reason}`
      : `Descartado (split): ${options.reason}`,
    contentType: options.enableSecond ? segment.contentType : "false_start",
    coversScriptLines: options.enableSecond ? segment.coversScriptLines : [],
  };

  return { first, second };
}

/**
 * Apply all proposed splits from AI decisions to segments
 *
 * @param segments - Original segments with proposed splits
 * @returns New array with segments split as proposed
 */
export function applyProposedSplits(
  segments: PreselectedSegment[]
): PreselectedSegment[] {
  const result: PreselectedSegment[] = [];

  for (const segment of segments) {
    if (!segment.proposedSplits || segment.proposedSplits.length === 0) {
      // No splits proposed, keep original
      result.push(segment);
      continue;
    }

    // Sort splits by timestamp
    const sortedSplits = [...segment.proposedSplits].sort(
      (a, b) => a.splitAtMs - b.splitAtMs
    );

    // Apply splits sequentially
    let currentSegment = segment;
    let appliedAny = false;

    for (const split of sortedSplits) {
      const splitResult = splitSegment(currentSegment, split.splitAtMs, {
        enableFirst: split.enableFirst,
        enableSecond: split.enableSecond,
        reason: split.reason,
      });

      if (splitResult) {
        result.push(splitResult.first);
        // Continue with second part for potential further splits
        currentSegment = splitResult.second;
        appliedAny = true;
      }
    }

    // Add the remaining segment (last part after all splits)
    if (appliedAny) {
      result.push(currentSegment);
    } else {
      // No splits were valid, keep original
      result.push(segment);
    }
  }

  return result;
}

/**
 * Validate a proposed split before applying
 *
 * @param segment - The segment to validate split for
 * @param split - The proposed split
 * @returns Error message if invalid, null if valid
 */
export function validateProposedSplit(
  segment: PreselectedSegment,
  split: ProposedSplit
): string | null {
  const minDuration = 500; // ms
  const absoluteSplitMs = segment.startMs + split.splitAtMs;

  if (split.splitAtMs <= 0) {
    return "Split point must be positive";
  }

  if (absoluteSplitMs >= segment.endMs) {
    return "Split point must be before segment end";
  }

  const firstDuration = absoluteSplitMs - segment.startMs;
  const secondDuration = segment.endMs - absoluteSplitMs;

  if (firstDuration < minDuration) {
    return `First part would be too short (${firstDuration}ms < ${minDuration}ms)`;
  }

  if (secondDuration < minDuration) {
    return `Second part would be too short (${secondDuration}ms < ${minDuration}ms)`;
  }

  return null;
}

/**
 * Create a manual split (user-initiated, not from AI)
 *
 * @param segment - The segment to split
 * @param splitAtMs - Timestamp relative to segment start
 * @returns Split result or error message
 */
export function createManualSplit(
  segment: PreselectedSegment,
  splitAtMs: number
): SplitResult | { error: string } {
  const validationError = validateProposedSplit(segment, {
    splitAtMs,
    reason: "Manual split",
    enableFirst: true,
    enableSecond: true,
  });

  if (validationError) {
    return { error: validationError };
  }

  const result = splitSegment(segment, splitAtMs, {
    enableFirst: true,
    enableSecond: true,
    reason: "División manual",
  });

  if (!result) {
    return { error: "Failed to create split" };
  }

  return result;
}
