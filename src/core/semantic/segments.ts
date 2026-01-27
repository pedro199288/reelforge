/**
 * Generate segments based on semantic analysis
 *
 * Only cuts silences that fall BETWEEN sentences.
 * Silences within sentences are kept as natural pauses.
 */
import type { SilenceRange } from "../silence/detect";
import type { Caption } from "../script/align";
import type {
  AlignedSentence,
  SemanticSilence,
  SemanticAnalysisResult,
  SemanticSegmentConfig,
} from "./types";
import { DEFAULT_SEMANTIC_CONFIG } from "./types";
import { alignSentences, extractDeviations } from "./sentence-boundaries";
import { splitIntoSentences } from "../script/takes";

/**
 * Classify silences as inter-sentence (cut candidates) or intra-sentence (natural pauses)
 */
function classifySilences(
  silences: SilenceRange[],
  sentences: AlignedSentence[],
  config: SemanticSegmentConfig
): { semantic: SemanticSilence[]; intrasentence: SemanticSilence[] } {
  const semantic: SemanticSilence[] = [];
  const intrasentence: SemanticSilence[] = [];

  if (sentences.length === 0) {
    // No sentences aligned - treat all silences as semantic (fallback to silence-based)
    for (const silence of silences) {
      const startMs = silence.start * 1000;
      const endMs = silence.end * 1000;
      const durationMs = endMs - startMs;

      if (durationMs >= config.minSilenceDurationMs) {
        semantic.push({
          startMs,
          endMs,
          durationMs,
          sentenceBefore: -1,
          sentenceAfter: -1,
        });
      }
    }
    return { semantic, intrasentence };
  }

  for (const silence of silences) {
    const silenceStartMs = silence.start * 1000;
    const silenceEndMs = silence.end * 1000;
    const durationMs = silenceEndMs - silenceStartMs;

    // Skip very short silences
    if (durationMs < config.minSilenceDurationMs) {
      continue;
    }

    // Find which sentences this silence falls between or within
    let sentenceBefore = -1;
    let sentenceAfter = -1;
    let isWithinSentence = false;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];

      // Check if silence is within this sentence
      if (silenceStartMs >= sentence.startMs && silenceEndMs <= sentence.endMs) {
        isWithinSentence = true;
        sentenceBefore = i;
        sentenceAfter = i;
        break;
      }

      // Check if silence is after this sentence
      if (silenceStartMs >= sentence.endMs) {
        sentenceBefore = i;
      }

      // Check if silence is before this sentence
      if (silenceEndMs <= sentence.startMs && sentenceAfter === -1) {
        sentenceAfter = i;
      }
    }

    // If we haven't found sentenceAfter yet, check if there's a sentence starting after the silence
    if (sentenceAfter === -1) {
      for (let i = 0; i < sentences.length; i++) {
        if (sentences[i].startMs > silenceEndMs) {
          sentenceAfter = i;
          break;
        }
      }
    }

    const classified: SemanticSilence = {
      startMs: silenceStartMs,
      endMs: silenceEndMs,
      durationMs,
      sentenceBefore,
      sentenceAfter,
    };

    if (isWithinSentence) {
      // Silence is within a sentence - natural pause, don't cut
      intrasentence.push(classified);
    } else if (sentenceBefore !== -1 && sentenceAfter !== -1 && sentenceBefore !== sentenceAfter) {
      // Silence is between different sentences - candidate for cutting
      semantic.push(classified);
    } else if (sentenceBefore === -1 || sentenceAfter === -1) {
      // Silence is at the beginning or end - treat as semantic
      semantic.push(classified);
    }
  }

  return { semantic, intrasentence };
}

/**
 * Analyze script and transcription to identify semantic cut points
 *
 * When useScriptBoundaries is true (and a script is provided), the script's
 * sentence structure is used as the authoritative source for classifying
 * silences. This provides more accurate classification because:
 * - Script punctuation defines exact sentence boundaries
 * - Silences can be classified with higher precision
 * - Deviations from the script can be detected
 *
 * @param scriptText - The script text
 * @param captions - Transcription captions with timestamps
 * @param silences - Detected silence ranges
 * @param config - Configuration options
 * @returns Semantic analysis result with classified silences
 */
export function analyzeSemanticCuts(
  scriptText: string,
  captions: Caption[],
  silences: SilenceRange[],
  config: Partial<SemanticSegmentConfig> = {}
): SemanticAnalysisResult {
  const fullConfig = { ...DEFAULT_SEMANTIC_CONFIG, ...config };
  const {
    useScriptBoundaries = false,
    detectDeviations = false,
    deviationThreshold = 0.7,
  } = fullConfig;

  // Determine if we're using script as authoritative source
  const isScriptProvided = scriptText.trim().length > 0;
  const usedScriptBoundaries = useScriptBoundaries && isScriptProvided;

  // Align sentences with transcription, passing deviation threshold
  const sentences = alignSentences(scriptText, captions, {
    deviationThreshold,
  });

  // Sort silences by start time
  const sortedSilences = [...silences].sort((a, b) => a.start - b.start);

  // Classify silences based on sentence boundaries
  const { semantic, intrasentence } = classifySilences(
    sortedSilences,
    sentences,
    fullConfig
  );

  // Calculate overall confidence
  const overallConfidence =
    sentences.length > 0
      ? sentences.reduce((sum, s) => sum + s.confidence, 0) / sentences.length
      : 0;

  // Detect deviations if requested
  const deviations =
    detectDeviations && isScriptProvided
      ? extractDeviations(sentences, splitIntoSentences(scriptText))
      : undefined;

  return {
    sentences,
    semanticSilences: semantic,
    intrasentenceSilences: intrasentence,
    overallConfidence,
    usedScriptBoundaries,
    deviations,
  };
}

/**
 * Segment configuration result
 */
export interface SemanticSegment {
  id: string;
  startMs: number;
  endMs: number;
  enabled: boolean;
}

/**
 * Generate segments from semantic analysis
 *
 * Creates segments that keep content and only cut at inter-sentence silences.
 * Intra-sentence silences (natural pauses) are NOT cut.
 *
 * @param analysis - Semantic analysis result
 * @param durationMs - Total video duration in milliseconds
 * @param config - Segment configuration
 * @returns Array of segments to keep
 */
export function semanticToSegments(
  analysis: SemanticAnalysisResult,
  durationMs: number,
  config: Partial<SemanticSegmentConfig> = {}
): Array<{ startMs: number; endMs: number }> {
  const { paddingMs, minSegmentMs } = { ...DEFAULT_SEMANTIC_CONFIG, ...config };
  const segments: Array<{ startMs: number; endMs: number }> = [];

  // Only use semantic silences (between sentences) for cutting
  const silences = analysis.semanticSilences;

  if (silences.length === 0) {
    // No silences to cut - return single segment covering entire video
    return [{ startMs: 0, endMs: durationMs }];
  }

  // Sort by start time
  const sorted = [...silences].sort((a, b) => a.startMs - b.startMs);

  let cursor = 0;

  for (const silence of sorted) {
    const segmentEnd = Math.max(cursor, silence.startMs - paddingMs);

    if (segmentEnd > cursor + minSegmentMs) {
      segments.push({
        startMs: cursor,
        endMs: segmentEnd,
      });
    }

    cursor = silence.endMs + paddingMs;
  }

  // Final segment (after last silence)
  if (cursor < durationMs - minSegmentMs) {
    segments.push({
      startMs: cursor,
      endMs: durationMs,
    });
  }

  return segments;
}

/**
 * Statistics about semantic analysis
 */
export interface SemanticStats {
  sentenceCount: number;
  semanticCutCount: number;
  naturalPauseCount: number;
  totalCuttableDurationMs: number;
  totalPreservedPauseDurationMs: number;
  /** Whether script boundaries were used as authoritative source */
  usedScriptBoundaries: boolean;
  /** Number of deviations from script (if detection was enabled) */
  deviationCount?: number;
  /** Number of sentences that were modified from script */
  modifiedSentenceCount?: number;
  /** Number of sentences that were missing/skipped */
  missingSentenceCount?: number;
}

/**
 * Get statistics about the semantic analysis
 */
export function getSemanticStats(analysis: SemanticAnalysisResult): SemanticStats {
  const stats: SemanticStats = {
    sentenceCount: analysis.sentences.length,
    semanticCutCount: analysis.semanticSilences.length,
    naturalPauseCount: analysis.intrasentenceSilences.length,
    totalCuttableDurationMs: analysis.semanticSilences.reduce(
      (sum, s) => sum + s.durationMs,
      0
    ),
    totalPreservedPauseDurationMs: analysis.intrasentenceSilences.reduce(
      (sum, s) => sum + s.durationMs,
      0
    ),
    usedScriptBoundaries: analysis.usedScriptBoundaries,
  };

  // Add deviation stats if available
  if (analysis.deviations) {
    stats.deviationCount = analysis.deviations.length;
    stats.modifiedSentenceCount = analysis.deviations.filter(
      (d) => d.type === "modified"
    ).length;
    stats.missingSentenceCount = analysis.deviations.filter(
      (d) => d.type === "missing"
    ).length;
  }

  return stats;
}
