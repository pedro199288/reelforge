import { nanoid } from "nanoid";
import type { TimelineItem, VideoItem, AudioItem } from "@/types/editor";

// ─── Helpers ────────────────────────────────────────────────────────

function itemEnd(item: TimelineItem): number {
  return item.from + item.durationInFrames;
}

function overlaps(a: TimelineItem, b: TimelineItem): boolean {
  return a.from < itemEnd(b) && itemEnd(a) > b.from;
}

type OverlapType = "none" | "split" | "covered" | "right" | "left";

function getOverlapType(existing: TimelineItem, incoming: TimelineItem): OverlapType {
  const exStart = existing.from;
  const exEnd = itemEnd(existing);
  const inStart = incoming.from;
  const inEnd = itemEnd(incoming);

  if (exEnd <= inStart || exStart >= inEnd) return "none";
  if (exStart < inStart && exEnd > inEnd) return "split";
  if (exStart >= inStart && exEnd <= inEnd) return "covered";
  if (exStart < inStart && exEnd > inStart) return "right";
  return "left";
}

/** Resolve cascading overlaps for items to the left of a boundary, pushing left */
function cascadeLeft(items: TimelineItem[]): void {
  // Sort right-to-left (highest from first)
  items.sort((a, b) => b.from - a.from);
  for (let i = 0; i < items.length - 1; i++) {
    const right = items[i];
    const left = items[i + 1];
    if (overlaps(left, right)) {
      left.from = right.from - left.durationInFrames;
    }
  }
}

/** Resolve cascading overlaps for items to the right of a boundary, pushing right */
function cascadeRight(items: TimelineItem[]): void {
  // Sort left-to-right (lowest from first)
  items.sort((a, b) => a.from - b.from);
  for (let i = 0; i < items.length - 1; i++) {
    const left = items[i];
    const right = items[i + 1];
    if (overlaps(left, right)) {
      right.from = itemEnd(left);
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────

/**
 * Resolve overlaps between existing track items and an incoming item.
 * Existing items are displaced (never removed or trimmed) to make room.
 * Split still applies when the incoming sits in the middle of an existing item.
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

  const incoming = { ...incomingItem };

  // 1. Pre-process splits — separate items that wrap the incoming
  const processed: TimelineItem[] = [];
  for (const existing of existingItems) {
    const type = getOverlapType(existing, incoming);
    if (type === "split") {
      const inStart = incoming.from;
      const inEnd = itemEnd(incoming);
      const exStart = existing.from;

      // Left piece: keeps original id, trimmed to end at inStart
      const leftDuration = inStart - exStart;
      if (leftDuration >= 1) {
        processed.push({ ...existing, durationInFrames: leftDuration });
      }

      // Right piece: new id, starts at inEnd
      const rightDuration = itemEnd(existing) - inEnd;
      if (rightDuration >= 1) {
        const rightPiece: TimelineItem = {
          ...existing,
          id: generateId(),
          from: inEnd,
          durationInFrames: rightDuration,
        };
        if (rightPiece.type === "video" || rightPiece.type === "audio") {
          (rightPiece as VideoItem | AudioItem).trimStartFrame =
            (existing as VideoItem | AudioItem).trimStartFrame + (inEnd - exStart);
        }
        processed.push(rightPiece);
      }
    } else {
      processed.push({ ...existing });
    }
  }

  // 2. Iterative resolution (max 50 iterations as safety)
  const MAX_ITERATIONS = 50;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const inStart = incoming.from;
    const inEnd = itemEnd(incoming);

    // 2a. Resolve direct overlaps with incoming
    for (const item of processed) {
      const type = getOverlapType(item, incoming);
      if (type === "none") continue;

      if (type === "covered") {
        // Displace to nearest edge based on center comparison
        const exCenter = item.from + item.durationInFrames / 2;
        const inCenter = inStart + incoming.durationInFrames / 2;
        if (exCenter < inCenter) {
          item.from = inStart - item.durationInFrames;
        } else {
          item.from = inEnd;
        }
      } else if (type === "right") {
        // Existing starts before incoming, overlaps on right → push left
        item.from = inStart - item.durationInFrames;
      } else if (type === "left") {
        // Existing ends after incoming, overlaps on left → push right
        item.from = inEnd;
      }
    }

    // 2b. Check for negative frames — if any, shift incoming right
    let minFrom = 0;
    for (const item of processed) {
      if (item.from < minFrom) minFrom = item.from;
    }
    if (minFrom < 0) {
      const shift = -minFrom;
      incoming.from += shift;
      // Reset all items to original positions and re-resolve
      // Instead, shift all items that were displaced left by the same amount
      for (const item of processed) {
        item.from += shift;
      }
      // Continue to re-check after shift
      continue;
    }

    // 2c. Cascade left group (items ending at or before incoming start)
    const leftGroup = processed.filter((item) => itemEnd(item) <= incoming.from);
    const rightGroup = processed.filter((item) => item.from >= itemEnd(incoming));

    cascadeLeft(leftGroup);

    // 2d. Check for negative frames from cascade
    let minFromCascade = 0;
    for (const item of leftGroup) {
      if (item.from < minFromCascade) minFromCascade = item.from;
    }
    if (minFromCascade < 0) {
      const shift = -minFromCascade;
      incoming.from += shift;
      for (const item of processed) {
        item.from += shift;
      }
      continue;
    }

    // 2e. Cascade right group
    cascadeRight(rightGroup);

    // 2f. Check if stable (no overlaps remain)
    let stable = true;
    const allItems = [...processed, incoming];
    for (let i = 0; i < allItems.length && stable; i++) {
      for (let j = i + 1; j < allItems.length; j++) {
        if (overlaps(allItems[i], allItems[j])) {
          stable = false;
          break;
        }
      }
    }
    if (stable) break;
  }

  // 3. Combine and sort
  const result = [...processed, incoming];
  return result.sort((a, b) => a.from - b.from);
}
