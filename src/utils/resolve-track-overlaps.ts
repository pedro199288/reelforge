import { nanoid } from "nanoid";
import type { TimelineItem, VideoItem, AudioItem } from "@/types/editor";

/**
 * Resolve overlaps between existing track items and an incoming item.
 * Existing items are trimmed, split, or removed to make room for the incoming item.
 * Returns the resulting array (including the incoming) sorted by `from`.
 */
export function resolveOverlaps(
  existingItems: TimelineItem[],
  incomingItem: TimelineItem,
  generateId: () => string = () => nanoid(8),
): TimelineItem[] {
  if (incomingItem.durationInFrames <= 0) {
    return existingItems;
  }

  const inStart = incomingItem.from;
  const inEnd = incomingItem.from + incomingItem.durationInFrames;

  const result: TimelineItem[] = [];

  for (const existing of existingItems) {
    const exStart = existing.from;
    const exEnd = existing.from + existing.durationInFrames;

    // No overlap
    if (exEnd <= inStart || exStart >= inEnd) {
      result.push(existing);
      continue;
    }

    // Completely covered — discard
    if (exStart >= inStart && exEnd <= inEnd) {
      continue;
    }

    // Incoming sits in the middle — split into two pieces
    if (exStart < inStart && exEnd > inEnd) {
      // Left piece: [exStart, inStart)
      const leftDuration = inStart - exStart;
      if (leftDuration >= 1) {
        result.push({ ...existing, durationInFrames: leftDuration });
      }

      // Right piece: [inEnd, exEnd)
      const rightDuration = exEnd - inEnd;
      if (rightDuration >= 1) {
        const rightPiece: TimelineItem = {
          ...existing,
          id: generateId(),
          from: inEnd,
          durationInFrames: rightDuration,
        };
        // Adjust trimStartFrame for video/audio
        if (rightPiece.type === "video" || rightPiece.type === "audio") {
          (rightPiece as VideoItem | AudioItem).trimStartFrame =
            (existing as VideoItem | AudioItem).trimStartFrame + (inEnd - exStart);
        }
        result.push(rightPiece);
      }
      continue;
    }

    // Overlap on the right side of existing: existing starts before incoming
    if (exStart < inStart && exEnd > inStart) {
      const trimmedDuration = inStart - exStart;
      if (trimmedDuration >= 1) {
        result.push({ ...existing, durationInFrames: trimmedDuration });
      }
      continue;
    }

    // Overlap on the left side of existing: existing ends after incoming
    if (exStart < inEnd && exEnd > inEnd) {
      const trimmedDuration = exEnd - inEnd;
      if (trimmedDuration >= 1) {
        const trimmed: TimelineItem = {
          ...existing,
          from: inEnd,
          durationInFrames: trimmedDuration,
        };
        // Adjust trimStartFrame for video/audio
        if (trimmed.type === "video" || trimmed.type === "audio") {
          (trimmed as VideoItem | AudioItem).trimStartFrame =
            (existing as VideoItem | AudioItem).trimStartFrame + (inEnd - exStart);
        }
        result.push(trimmed);
      }
      continue;
    }
  }

  result.push(incomingItem);
  return result.sort((a, b) => a.from - b.from);
}
