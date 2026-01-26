/**
 * Take scoring system for automatic best-take selection
 */

import type { Take, PhraseGroup } from "./similarity";
import type { AudioAnalysis } from "./audio-analysis";

/**
 * Breakdown of individual scoring components
 */
export interface ScoreBreakdown {
  /** Audio clarity/SNR score (0-100) */
  clarity: number;
  /** Fluency score based on pauses (0-100) */
  fluency: number;
  /** Volume consistency score (0-100) */
  energy: number;
  /** Brevity score - shorter is better (0-100) */
  duration: number;
  /** Text completeness/similarity score (0-100) */
  completeness: number;
  /** Whisper transcription confidence score (0-100) */
  whisperConfidence: number;
}

/**
 * Complete score for a single take
 */
export interface TakeScore {
  /** Index of the take in the group */
  takeIndex: number;
  /** Overall score (0-100) */
  total: number;
  /** Individual component scores */
  breakdown: ScoreBreakdown;
  /** Rank within the group (1 = best) */
  rank?: number;
}

/**
 * Configuration for scoring weights
 */
export interface ScoringConfig {
  /** Weight distribution for each component (should sum to 1) */
  weights: {
    clarity: number;
    fluency: number;
    energy: number;
    duration: number;
    completeness: number;
    whisperConfidence: number;
  };
  /** Whether to apply bonus for shorter takes */
  preferShorter: boolean;
  /** Target duration ratio (0-1) - takes near this ratio of average get bonus */
  targetDurationRatio?: number;
}

/**
 * Default scoring configuration
 */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: {
    clarity: 0.20,
    fluency: 0.20,
    energy: 0.15,
    duration: 0.15,
    completeness: 0.15,
    whisperConfidence: 0.15,
  },
  preferShorter: true,
  targetDurationRatio: 0.9, // Slightly shorter than average is ideal
};

/**
 * Normalize a value to 0-100 scale
 */
function normalizeScore(value: number, min: number, max: number, invert = false): number {
  if (max === min) return 50;
  const normalized = ((value - min) / (max - min)) * 100;
  const clamped = Math.max(0, Math.min(100, normalized));
  return invert ? 100 - clamped : clamped;
}

/**
 * Calculate clarity score from SNR
 * Higher SNR = better clarity
 */
function calculateClarityScore(snr: number): number {
  // SNR typically ranges from 10dB (poor) to 40dB+ (excellent)
  // Map to 0-100 scale
  return normalizeScore(snr, 10, 40);
}

/**
 * Calculate fluency score from pause metrics
 * Fewer and shorter pauses = better fluency
 */
function calculateFluencyScore(
  pauseCount: number,
  pauseDurationMs: number,
  durationMs: number
): number {
  // Calculate pause ratio (what fraction of the take is pauses)
  const pauseRatio = durationMs > 0 ? pauseDurationMs / durationMs : 0;

  // Penalize both number of pauses and total pause time
  // Perfect fluency = no pauses, worst = 50%+ pauses
  const ratioScore = normalizeScore(pauseRatio, 0, 0.5, true);

  // Also penalize having many pauses (indicates stumbling)
  // Allow up to 2 pauses without penalty
  const countPenalty = Math.max(0, (pauseCount - 2) * 10);

  return Math.max(0, ratioScore - countPenalty);
}

/**
 * Calculate energy/consistency score from volume variance
 * Lower variance = more consistent = better
 */
function calculateEnergyScore(volumeVariance: number, avgVolume: number): number {
  // Penalize both high variance and very low average volume
  // Variance typically ranges from 5dB (consistent) to 20dB+ (inconsistent)
  const varianceScore = normalizeScore(volumeVariance, 5, 20, true);

  // Penalize very quiet audio (below -30dB average)
  const volumePenalty = avgVolume < -30 ? (avgVolume + 30) * 2 : 0;

  return Math.max(0, varianceScore + volumePenalty);
}

/**
 * Calculate duration score
 * Preference for slightly shorter than average
 */
function calculateDurationScore(
  durationMs: number,
  avgDurationMs: number,
  minDurationMs: number,
  maxDurationMs: number,
  config: ScoringConfig
): number {
  if (config.preferShorter) {
    // Target is slightly shorter than average
    const targetDuration = avgDurationMs * (config.targetDurationRatio ?? 0.9);

    // Calculate distance from target
    const distance = Math.abs(durationMs - targetDuration);
    const maxDistance = Math.max(
      Math.abs(maxDurationMs - targetDuration),
      Math.abs(minDurationMs - targetDuration)
    );

    return normalizeScore(distance, 0, maxDistance, true);
  } else {
    // Just normalize within range
    return normalizeScore(durationMs, minDurationMs, maxDurationMs, true);
  }
}

/**
 * Calculate completeness score from text similarity
 */
function calculateCompletenessScore(similarity: number): number {
  // Similarity is already 0-1, just scale to 0-100
  return similarity * 100;
}

/**
 * Calculate Whisper confidence score
 * Higher confidence from Whisper indicates clearer, more accurate transcription
 */
function calculateWhisperConfidenceScore(confidence: number): number {
  // Confidence is already 0-1, scale to 0-100
  // Apply slight curve to emphasize high-confidence takes
  return Math.pow(confidence, 0.8) * 100;
}

/**
 * Score a single take
 */
export function scoreTake(
  take: Take,
  audioAnalysis: AudioAnalysis,
  groupStats: {
    avgDurationMs: number;
    minDurationMs: number;
    maxDurationMs: number;
  },
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): TakeScore {
  const breakdown: ScoreBreakdown = {
    clarity: calculateClarityScore(audioAnalysis.snr),
    fluency: calculateFluencyScore(
      audioAnalysis.pauseCount,
      audioAnalysis.pauseDurationMs,
      take.durationMs
    ),
    energy: calculateEnergyScore(audioAnalysis.volumeVariance, audioAnalysis.avgVolume),
    duration: calculateDurationScore(
      take.durationMs,
      groupStats.avgDurationMs,
      groupStats.minDurationMs,
      groupStats.maxDurationMs,
      config
    ),
    completeness: calculateCompletenessScore(take.similarity),
    whisperConfidence: calculateWhisperConfidenceScore(take.whisperConfidence),
  };

  // Calculate weighted total
  const total =
    breakdown.clarity * config.weights.clarity +
    breakdown.fluency * config.weights.fluency +
    breakdown.energy * config.weights.energy +
    breakdown.duration * config.weights.duration +
    breakdown.completeness * config.weights.completeness +
    breakdown.whisperConfidence * config.weights.whisperConfidence;

  return {
    takeIndex: take.index,
    total: Math.round(total * 10) / 10, // Round to 1 decimal
    breakdown,
  };
}

/**
 * Score all takes in a group and select the best one
 */
export function scoreGroup(
  group: PhraseGroup,
  audioAnalyses: AudioAnalysis[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): {
  scores: TakeScore[];
  bestTakeIndex: number;
  bestScore: TakeScore;
} {
  if (group.takes.length === 0) {
    throw new Error("Cannot score empty group");
  }

  if (audioAnalyses.length !== group.takes.length) {
    throw new Error("Number of audio analyses must match number of takes");
  }

  // Calculate group statistics for duration scoring
  const durations = group.takes.map((t) => t.durationMs);
  const avgDurationMs = durations.reduce((a, b) => a + b, 0) / durations.length;
  const minDurationMs = Math.min(...durations);
  const maxDurationMs = Math.max(...durations);

  const groupStats = { avgDurationMs, minDurationMs, maxDurationMs };

  // Score each take
  const scores = group.takes.map((take, i) =>
    scoreTake(take, audioAnalyses[i], groupStats, config)
  );

  // Sort by score (descending) to assign ranks
  const sortedIndices = scores
    .map((s, i) => ({ score: s.total, index: i }))
    .sort((a, b) => b.score - a.score)
    .map((item, rank) => ({ ...item, rank: rank + 1 }));

  // Assign ranks to scores
  for (const item of sortedIndices) {
    scores[item.index].rank = item.rank;
  }

  // Find best take
  const bestIndex = sortedIndices[0].index;

  return {
    scores,
    bestTakeIndex: bestIndex,
    bestScore: scores[bestIndex],
  };
}

/**
 * Simple scoring without audio analysis (uses heuristics)
 * Useful when ffmpeg is not available or for quick estimates
 */
export function scoreGroupSimple(
  group: PhraseGroup,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): {
  scores: TakeScore[];
  bestTakeIndex: number;
  bestScore: TakeScore;
} {
  if (group.takes.length === 0) {
    throw new Error("Cannot score empty group");
  }

  // Calculate group statistics
  const durations = group.takes.map((t) => t.durationMs);
  const avgDurationMs = durations.reduce((a, b) => a + b, 0) / durations.length;
  const minDurationMs = Math.min(...durations);
  const maxDurationMs = Math.max(...durations);

  // Score each take using only text similarity, duration, and whisper confidence
  const scores: TakeScore[] = group.takes.map((take, index) => {
    const durationScore = calculateDurationScore(
      take.durationMs,
      avgDurationMs,
      minDurationMs,
      maxDurationMs,
      config
    );
    const completenessScore = calculateCompletenessScore(take.similarity);
    const whisperScore = calculateWhisperConfidenceScore(take.whisperConfidence);

    // Without audio analysis, weight duration, completeness, and whisper confidence more heavily
    const breakdown: ScoreBreakdown = {
      clarity: 50, // Default/neutral
      fluency: 50, // Default/neutral
      energy: 50, // Default/neutral
      duration: durationScore,
      completeness: completenessScore,
      whisperConfidence: whisperScore,
    };

    // Recalculate weights for simple scoring (sum = 1)
    const simpleWeights = {
      clarity: 0.05,
      fluency: 0.05,
      energy: 0.05,
      duration: 0.30,
      completeness: 0.30,
      whisperConfidence: 0.25,
    };

    const total =
      breakdown.clarity * simpleWeights.clarity +
      breakdown.fluency * simpleWeights.fluency +
      breakdown.energy * simpleWeights.energy +
      breakdown.duration * simpleWeights.duration +
      breakdown.completeness * simpleWeights.completeness +
      breakdown.whisperConfidence * simpleWeights.whisperConfidence;

    return {
      takeIndex: index,
      total: Math.round(total * 10) / 10,
      breakdown,
    };
  });

  // Assign ranks
  const sortedIndices = scores
    .map((s, i) => ({ score: s.total, index: i }))
    .sort((a, b) => b.score - a.score);

  for (let rank = 0; rank < sortedIndices.length; rank++) {
    scores[sortedIndices[rank].index].rank = rank + 1;
  }

  const bestIndex = sortedIndices[0].index;

  return {
    scores,
    bestTakeIndex: bestIndex,
    bestScore: scores[bestIndex],
  };
}
