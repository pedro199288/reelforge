/**
 * Take Scorer
 *
 * Scores individual takes and selects the best take per script sentence.
 * Replaces segment-level scoring for the with-script path.
 */

import type { Caption } from "../script/align";
import { normalize, similarity } from "../script/align";
import type { ClassifiedTake, ClassifiedTakeGroup } from "./take-extractor";

/**
 * Score breakdown for a single take
 */
export interface TakeScoreBreakdown {
  scriptCoverage: number;
  fluency: number;
  whisperConfidence: number;
  completeness: number;
  duration: number;
}

/**
 * Score result for a single take
 */
export interface TakeScore {
  takeId: string;
  sentenceIdx: number;
  totalScore: number;
  breakdown: TakeScoreBreakdown;
  reason: string;
}

/**
 * Configuration for take scoring weights
 */
export interface TakeScoreConfig {
  weights: {
    scriptCoverage: number;
    fluency: number;
    whisperConfidence: number;
    completeness: number;
    duration: number;
  };
}

export const DEFAULT_TAKE_SCORE_CONFIG: TakeScoreConfig = {
  weights: {
    scriptCoverage: 0.35,
    fluency: 0.25,
    whisperConfidence: 0.20,
    completeness: 0.10,
    duration: 0.10,
  },
};

/**
 * Result of take selection across all sentence groups
 */
export interface SelectionResult {
  selected: ClassifiedTake[];
  rejected: ClassifiedTake[];
  missingScripts: number[];
  scores: TakeScore[];
}

/**
 * Score a single take against its sentence.
 */
export function scoreTake(
  take: ClassifiedTake,
  sentenceText: string,
  captions: Caption[],
  config: TakeScoreConfig = DEFAULT_TAKE_SCORE_CONFIG
): TakeScore {
  const sentenceWords = sentenceText
    .split(/\s+/)
    .filter(Boolean);
  const sentenceWordCount = sentenceWords.length;
  const sentenceNormalized = sentenceWords.map((w) => normalize(w));

  // --- scriptCoverage (0-100) ---
  // Use the take's confidence which is based on similarity matching
  const scriptCoverage = Math.round(take.confidence * 100);

  // --- fluency (0-100) ---
  // Use the pre-calculated fluency, apply false-start penalty
  let fluency = take.fluencyScore;
  if (take.isFalseStart) {
    fluency = Math.max(0, fluency - 40);
  }

  // --- whisperConfidence (0-100) ---
  const takeCaptions = captions.filter((_, idx) =>
    take.captionIndices.includes(idx)
  );
  let whisperConfidence = 50;
  if (takeCaptions.length > 0) {
    const totalConf = takeCaptions.reduce(
      (sum, c) => sum + (c.confidence ?? 1.0),
      0
    );
    whisperConfidence = Math.round((totalConf / takeCaptions.length) * 100);
  }

  // --- completeness (0-100) ---
  const completeness = calculateCompleteness(
    take,
    sentenceNormalized
  );

  // --- duration (0-100) ---
  const duration = calculateDurationScore(take.durationMs, sentenceWordCount);

  const breakdown: TakeScoreBreakdown = {
    scriptCoverage,
    fluency,
    whisperConfidence,
    completeness,
    duration,
  };

  const totalScore =
    breakdown.scriptCoverage * config.weights.scriptCoverage +
    breakdown.fluency * config.weights.fluency +
    breakdown.whisperConfidence * config.weights.whisperConfidence +
    breakdown.completeness * config.weights.completeness +
    breakdown.duration * config.weights.duration;

  const reasons: string[] = [];
  if (scriptCoverage >= 80) reasons.push("buena cobertura del guion");
  else if (scriptCoverage < 50) reasons.push("baja cobertura del guion");
  if (take.isFalseStart) reasons.push("falso comienzo");
  if (fluency < 50) reasons.push("baja fluidez");
  if (whisperConfidence < 50) reasons.push("baja confianza de transcripcion");

  const prefix = totalScore >= 50 ? "Seleccionado" : "Descartado";
  const reasonText = reasons.length > 0 ? `: ${reasons.join(", ")}` : "";
  const reason = `${prefix} (${Math.round(totalScore)}%)${reasonText}`;

  return {
    takeId: take.id,
    sentenceIdx: take.sentenceIndex,
    totalScore,
    breakdown,
    reason,
  };
}

/**
 * Calculate completeness score: does the take cover the beginning and end of the sentence?
 */
function calculateCompleteness(
  take: ClassifiedTake,
  sentenceNormalizedWords: string[]
): number {
  if (sentenceNormalizedWords.length === 0) return 50;

  const takeWords = take.transcribedText
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => normalize(w));

  if (takeWords.length === 0) return 0;

  let score = 50; // base

  // Check if first words match sentence start
  const firstSentenceWords = sentenceNormalizedWords.slice(0, 2);
  const firstTakeWords = takeWords.slice(0, 2);
  const startMatch = firstSentenceWords.some((sw) =>
    firstTakeWords.some((tw) => similarity(sw, tw) > 0.6)
  );
  if (startMatch) score += 25;

  // Check if last words match sentence end
  const lastSentenceWords = sentenceNormalizedWords.slice(-2);
  const lastTakeWords = takeWords.slice(-2);
  const endMatch = lastSentenceWords.some((sw) =>
    lastTakeWords.some((tw) => similarity(sw, tw) > 0.6)
  );
  if (endMatch) score += 25;

  return score;
}

/**
 * Calculate duration score: is the take's duration reasonable for the sentence length?
 * Expected ~250ms per word, with ±50% tolerance.
 */
function calculateDurationScore(
  durationMs: number,
  sentenceWordCount: number
): number {
  if (sentenceWordCount === 0) return 50;

  const expectedMs = sentenceWordCount * 250;
  const minExpected = expectedMs * 0.5;
  const maxExpected = expectedMs * 1.5;

  if (durationMs >= minExpected && durationMs <= maxExpected) {
    return 100;
  }

  // Outside range — linear decay
  if (durationMs < minExpected) {
    const ratio = durationMs / minExpected;
    return Math.max(0, Math.round(ratio * 100));
  }

  // Too long
  const ratio = maxExpected / durationMs;
  return Math.max(0, Math.round(ratio * 100));
}

/**
 * Select the best take per sentence group.
 *
 * Rules:
 * 1. Single take → ALWAYS select (never lose content)
 * 2. Multiple takes → filter false starts, score rest, pick best
 * 3. Tiebreaker (within 3 points) → prefer the most recent take
 * 4. All false starts → pick the best anyway (partial > nothing)
 * 5. 0 takes → register as missingScript
 */
export function selectBestTakes(
  groups: ClassifiedTakeGroup[],
  captions: Caption[],
  config: TakeScoreConfig = DEFAULT_TAKE_SCORE_CONFIG
): SelectionResult {
  const selected: ClassifiedTake[] = [];
  const rejected: ClassifiedTake[] = [];
  const missingScripts: number[] = [];
  const scores: TakeScore[] = [];

  for (const group of groups) {
    const takes = group.classifiedTakes;

    if (takes.length === 0) {
      // No takes found for this sentence
      missingScripts.push(group.sentence.index);
      continue;
    }

    if (takes.length === 1) {
      // Single take → always select
      const score = scoreTake(takes[0], group.sentence.text, captions, config);
      scores.push(score);
      selected.push(takes[0]);
      continue;
    }

    // Multiple takes: score all
    const takeScores = takes.map((take) => ({
      take,
      score: scoreTake(take, group.sentence.text, captions, config),
    }));

    for (const ts of takeScores) {
      scores.push(ts.score);
    }

    // Try to filter out false starts first
    const nonFalseStarts = takeScores.filter((ts) => !ts.take.isFalseStart);

    // If all are false starts, use all of them
    const candidates =
      nonFalseStarts.length > 0 ? nonFalseStarts : takeScores;

    // Sort by score descending
    candidates.sort((a, b) => b.score.totalScore - a.score.totalScore);

    const best = candidates[0];

    // Tiebreaker: if top candidates are within 3 points, prefer the most recent
    if (candidates.length > 1) {
      const topScore = best.score.totalScore;
      const closeOnes = candidates.filter(
        (c) => topScore - c.score.totalScore <= 3
      );

      if (closeOnes.length > 1) {
        // Pick the most recent (latest startMs)
        closeOnes.sort((a, b) => b.take.startMs - a.take.startMs);
        const recentBest = closeOnes[0];
        selected.push(recentBest.take);
        for (const ts of takeScores) {
          if (ts.take.id !== recentBest.take.id) {
            rejected.push(ts.take);
          }
        }
        continue;
      }
    }

    // Standard selection: pick the best
    selected.push(best.take);
    for (const ts of takeScores) {
      if (ts.take.id !== best.take.id) {
        rejected.push(ts.take);
      }
    }
  }

  return { selected, rejected, missingScripts, scores };
}
