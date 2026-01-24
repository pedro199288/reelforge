import type { SilenceRange } from "./detect";

export interface Segment {
  startTime: number;
  endTime: number;
  duration: number;
  index: number;
}

export interface SegmentConfig {
  paddingSec: number; // Default: 0.05 (50ms)
}

const DEFAULT_CONFIG: SegmentConfig = {
  paddingSec: 0.05,
};

/**
 * Convert silence ranges to segments of content to keep
 * Segments are the inverse of silences - the parts WITH audio
 */
export function silencesToSegments(
  silences: SilenceRange[],
  videoDuration: number,
  config: Partial<SegmentConfig> = {},
): Segment[] {
  const { paddingSec } = { ...DEFAULT_CONFIG, ...config };

  if (silences.length === 0) {
    return [
      {
        startTime: 0,
        endTime: videoDuration,
        duration: videoDuration,
        index: 0,
      },
    ];
  }

  const sorted = [...silences].sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  let cursor = 0;

  for (const silence of sorted) {
    const segmentEnd = Math.max(cursor, silence.start - paddingSec);

    if (segmentEnd > cursor + 0.1) {
      // Minimum 100ms of content
      segments.push({
        startTime: cursor,
        endTime: segmentEnd,
        duration: segmentEnd - cursor,
        index: segments.length,
      });
    }

    cursor = silence.end + paddingSec;
  }

  // Final segment (after last silence)
  if (cursor < videoDuration - 0.1) {
    segments.push({
      startTime: cursor,
      endTime: videoDuration,
      duration: videoDuration - cursor,
      index: segments.length,
    });
  }

  return segments;
}

/**
 * Get total duration of all segments combined
 */
export function getTotalDuration(segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + s.duration, 0);
}

/**
 * Map a time from the original video to the edited (cut) video
 * Returns null if the time falls within a cut (silence)
 */
export function mapTimeToEdited(
  originalTime: number,
  segments: Segment[],
): number | null {
  let editedTime = 0;

  for (const segment of segments) {
    if (originalTime >= segment.startTime && originalTime <= segment.endTime) {
      return editedTime + (originalTime - segment.startTime);
    }
    editedTime += segment.duration;
  }

  return null; // Time falls in a silence (cut)
}

/**
 * Map a time from the edited video back to the original video
 */
export function mapTimeToOriginal(
  editedTime: number,
  segments: Segment[],
): number | null {
  let accumulatedEdited = 0;

  for (const segment of segments) {
    if (editedTime < accumulatedEdited + segment.duration) {
      const timeInSegment = editedTime - accumulatedEdited;
      return segment.startTime + timeInSegment;
    }
    accumulatedEdited += segment.duration;
  }

  return null; // Time exceeds total edited duration
}
