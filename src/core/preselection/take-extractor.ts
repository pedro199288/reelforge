/**
 * Take Extractor
 *
 * Coordinates extraction of takes from captions using detectTakes(),
 * classifies false starts, and maps selected/rejected takes back to segments.
 */

import type { Caption } from "../script/align";
import { normalize } from "../script/align";
import {
  detectTakes,
  type TakeDetectionResult,
  type Take,
  type TakeGroup,
} from "../script/takes";
import type { InputSegment, PreselectedSegment } from "./types";
import { splitSegment } from "./segment-splitter";

/**
 * A take with false-start classification and fluency score
 */
export interface ClassifiedTake extends Take {
  isFalseStart: boolean;
  fluencyScore: number;
}

/**
 * A take group enriched with classified takes
 */
export interface ClassifiedTakeGroup extends TakeGroup {
  classifiedTakes: ClassifiedTake[];
}

/**
 * Result of take extraction and classification
 */
export interface TakeExtractionResult {
  groups: ClassifiedTakeGroup[];
  totalSentences: number;
  sentencesWithRepetitions: number;
  falseStartsDetected: number;
}

/**
 * Extract takes from captions using the script, then classify false starts.
 */
export function extractAndClassifyTakes(
  captions: Caption[],
  script: string
): TakeExtractionResult {
  const detection: TakeDetectionResult = detectTakes(script, captions);

  let falseStartsDetected = 0;

  const groups: ClassifiedTakeGroup[] = detection.groups.map((group) => {
    const sentenceWordCount = group.sentence.normalized
      .split(/\s+/)
      .filter(Boolean).length;

    const classifiedTakes = classifyFalseStarts(
      group.takes,
      sentenceWordCount,
      captions
    );

    falseStartsDetected += classifiedTakes.filter((t) => t.isFalseStart).length;

    return {
      ...group,
      classifiedTakes,
    };
  });

  return {
    groups,
    totalSentences: detection.totalSentences,
    sentencesWithRepetitions: detection.sentencesWithRepetitions,
    falseStartsDetected,
  };
}

/**
 * Classify which takes in a group are false starts.
 *
 * A take is a false start if:
 * - coverageRatio < 0.6 AND another take in the group has higher coverage
 * - OR the transcribed text contains stutter markers ("..." / "…")
 *
 * If there is only 1 take for a sentence, it is NEVER a false start.
 */
export function classifyFalseStarts(
  takes: Take[],
  sentenceWordCount: number,
  captions: Caption[]
): ClassifiedTake[] {
  if (takes.length === 0) return [];

  // Calculate coverage ratio for each take
  const takesWithCoverage = takes.map((take) => {
    const takeWordCount = take.transcribedText
      .split(/\s+/)
      .filter(Boolean).length;
    const coverageRatio =
      sentenceWordCount > 0 ? takeWordCount / sentenceWordCount : 0;
    return { take, coverageRatio };
  });

  const maxCoverage = Math.max(...takesWithCoverage.map((t) => t.coverageRatio));

  return takesWithCoverage.map(({ take, coverageRatio }) => {
    const fluencyScore = calculateTakeFluency(take, captions);

    let isFalseStart = false;

    // Single take → never a false start
    if (takes.length > 1) {
      const hasStutter =
        take.transcribedText.includes("...") ||
        take.transcribedText.includes("…");

      // Low coverage + better alternative exists
      if (coverageRatio < 0.6 && maxCoverage > coverageRatio) {
        isFalseStart = true;
      }

      // Stutter marker present and there's a better take
      if (hasStutter && maxCoverage > coverageRatio) {
        isFalseStart = true;
      }
    }

    return {
      ...take,
      isFalseStart,
      fluencyScore,
    };
  });
}

/**
 * Calculate fluency score (0-100) for a take.
 *
 * Penalties:
 * - -15 per repeated bigram (stutter detection)
 * - -20 proportional to % of words with confidence < 0.5
 * - -5/-10 for gaps > 500ms/1000ms between captions (hesitation)
 * - -40 if isFalseStart (applied later by caller, not here)
 *
 * This returns the raw fluency BEFORE the false-start penalty.
 */
export function calculateTakeFluency(
  take: Take,
  captions: Caption[]
): number {
  let score = 100;

  // --- Bigram repetition (stutter) ---
  const words = take.transcribedText
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => normalize(w));

  const bigrams = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1);
  }
  for (const count of bigrams.values()) {
    if (count > 1) {
      score -= 15 * (count - 1);
    }
  }

  // --- Low-confidence words ---
  const takeCaptions = captions.filter(
    (_, idx) => take.captionIndices.includes(idx)
  );
  if (takeCaptions.length > 0) {
    const lowConfCount = takeCaptions.filter(
      (c) => (c.confidence ?? 1.0) < 0.5
    ).length;
    const lowConfRatio = lowConfCount / takeCaptions.length;
    score -= Math.round(20 * lowConfRatio);
  }

  // --- Gaps between captions (hesitation) ---
  const sortedCaptions = [...takeCaptions].sort(
    (a, b) => a.startMs - b.startMs
  );
  for (let i = 1; i < sortedCaptions.length; i++) {
    const gap = sortedCaptions[i].startMs - sortedCaptions[i - 1].endMs;
    if (gap > 1000) {
      score -= 10;
    } else if (gap > 500) {
      score -= 5;
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Map selected and rejected takes back to segments.
 *
 * For each segment, check overlap with takes:
 * - Only selected takes → enabled: true
 * - Only rejected takes → enabled: false
 * - Mix of selected + rejected → attempt split
 * - No takes (off-script / silence) → enabled: false
 */
export function mapTakesToSegments(
  selected: ClassifiedTake[],
  rejected: ClassifiedTake[],
  segments: Array<InputSegment & { id: string }>,
  captions: Caption[]
): PreselectedSegment[] {
  const result: PreselectedSegment[] = [];

  for (const seg of segments) {
    const segSelected = selected.filter(
      (t) => t.startMs < seg.endMs && t.endMs > seg.startMs
    );
    const segRejected = rejected.filter(
      (t) => t.startMs < seg.endMs && t.endMs > seg.startMs
    );

    const hasSelected = segSelected.length > 0;
    const hasRejected = segRejected.length > 0;

    if (hasSelected && !hasRejected) {
      // Only good takes → enable
      const bestTake = segSelected.reduce((best, t) =>
        t.confidence > best.confidence ? t : best
      );
      result.push({
        id: seg.id,
        startMs: seg.startMs,
        endMs: seg.endMs,
        enabled: true,
        score: Math.round(bestTake.confidence * 100),
        reason: `Seleccionado: mejor toma para frase ${bestTake.sentenceIndex + 1}`,
        contentType: "best_take",
        takeGroupId: `take-s${bestTake.sentenceIndex}`,
      });
    } else if (!hasSelected && hasRejected) {
      // Only rejected takes → disable
      const bestRejected = segRejected[0];
      result.push({
        id: seg.id,
        startMs: seg.startMs,
        endMs: seg.endMs,
        enabled: false,
        score: Math.round((bestRejected.confidence ?? 0) * 50),
        reason: bestRejected.isFalseStart
          ? "Descartado: falso comienzo"
          : "Descartado: toma alternativa no seleccionada",
        contentType: "false_start",
        takeGroupId: `take-s${bestRejected.sentenceIndex}`,
      });
    } else if (hasSelected && hasRejected) {
      // Mixed → try to split
      const splitResult = attemptTakeSplit(
        seg,
        segSelected,
        segRejected,
        captions
      );
      result.push(...splitResult);
    } else if (!hasSelected && !hasRejected) {
      // No takes at all → off-script or silence
      result.push({
        id: seg.id,
        startMs: seg.startMs,
        endMs: seg.endMs,
        enabled: false,
        score: 20,
        reason: "Descartado: sin coincidencia con guion",
        contentType: "off_script",
      });
    }
  }

  return result;
}

/**
 * Attempt to split a segment that contains both selected and rejected takes.
 * Finds the boundary between the last rejected caption and the first selected caption.
 */
function attemptTakeSplit(
  seg: InputSegment & { id: string },
  selected: ClassifiedTake[],
  rejected: ClassifiedTake[],
  captions: Caption[]
): PreselectedSegment[] {
  // Find the boundary: gap between last rejected take end and first selected take start
  const rejectedEnd = Math.max(...rejected.map((t) => t.endMs));
  const selectedStart = Math.min(...selected.map((t) => t.startMs));

  // If rejected comes before selected, split between them
  if (rejectedEnd <= selectedStart) {
    // Find a caption boundary near the midpoint
    const splitPoint = findCaptionBoundary(
      captions,
      rejectedEnd,
      selectedStart,
      seg.startMs
    );

    if (splitPoint !== null) {
      const splitAtMs = splitPoint - seg.startMs;
      const bestSelected = selected.reduce((best, t) =>
        t.confidence > best.confidence ? t : best
      );

      const splitRes = splitSegment(
        {
          id: seg.id,
          startMs: seg.startMs,
          endMs: seg.endMs,
          enabled: true,
          score: Math.round(bestSelected.confidence * 100),
          reason: "Split: falso comienzo + toma buena",
        },
        splitAtMs,
        {
          enableFirst: false,
          enableSecond: true,
          reason: "Separacion de falso comienzo",
        }
      );

      if (splitRes) {
        // Enrich with take info
        splitRes.first.contentType = "false_start";
        splitRes.first.takeGroupId = `take-s${rejected[0].sentenceIndex}`;
        splitRes.second.contentType = "best_take";
        splitRes.second.takeGroupId = `take-s${bestSelected.sentenceIndex}`;
        splitRes.second.score = Math.round(bestSelected.confidence * 100);
        return [splitRes.first, splitRes.second];
      }
    }
  }

  // If selected comes before rejected, split the other way
  if (selectedStart < rejectedEnd) {
    const selectedEnd = Math.max(...selected.map((t) => t.endMs));
    const rejectedStart = Math.min(...rejected.map((t) => t.startMs));

    if (selectedEnd <= rejectedStart) {
      const splitPoint = findCaptionBoundary(
        captions,
        selectedEnd,
        rejectedStart,
        seg.startMs
      );

      if (splitPoint !== null) {
        const splitAtMs = splitPoint - seg.startMs;
        const bestSelected = selected.reduce((best, t) =>
          t.confidence > best.confidence ? t : best
        );

        const splitRes = splitSegment(
          {
            id: seg.id,
            startMs: seg.startMs,
            endMs: seg.endMs,
            enabled: true,
            score: Math.round(bestSelected.confidence * 100),
            reason: "Split: toma buena + falso comienzo",
          },
          splitAtMs,
          {
            enableFirst: true,
            enableSecond: false,
            reason: "Separacion de falso comienzo",
          }
        );

        if (splitRes) {
          splitRes.first.contentType = "best_take";
          splitRes.first.takeGroupId = `take-s${bestSelected.sentenceIndex}`;
          splitRes.first.score = Math.round(bestSelected.confidence * 100);
          splitRes.second.contentType = "false_start";
          splitRes.second.takeGroupId = `take-s${rejected[0].sentenceIndex}`;
          return [splitRes.first, splitRes.second];
        }
      }
    }
  }

  // Fallback: can't split cleanly → enable the whole segment (selected takes exist)
  const bestSelected = selected.reduce((best, t) =>
    t.confidence > best.confidence ? t : best
  );
  return [
    {
      id: seg.id,
      startMs: seg.startMs,
      endMs: seg.endMs,
      enabled: true,
      score: Math.round(bestSelected.confidence * 100),
      reason: `Seleccionado: contiene toma valida (no se pudo separar falso comienzo)`,
      contentType: "best_take",
      takeGroupId: `take-s${bestSelected.sentenceIndex}`,
    },
  ];
}

/**
 * Find a caption boundary between two timestamps for a clean split point.
 * Returns absolute timestamp, or null if no good boundary found.
 */
function findCaptionBoundary(
  captions: Caption[],
  afterMs: number,
  beforeMs: number,
  _segStartMs: number
): number | null {
  // Look for a caption end that falls between afterMs and beforeMs
  for (const cap of captions) {
    if (cap.endMs >= afterMs && cap.endMs <= beforeMs) {
      return cap.endMs;
    }
  }

  // No caption boundary found → use midpoint
  const midpoint = (afterMs + beforeMs) / 2;
  // Only use midpoint if there's enough room (> 500ms gap)
  if (beforeMs - afterMs >= 500) {
    return midpoint;
  }

  return null;
}
