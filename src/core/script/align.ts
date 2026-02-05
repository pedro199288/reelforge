import type { ParsedScript } from "./types";

/**
 * Caption from Whisper transcription
 */
export interface Caption {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs?: number | null;
  confidence?: number;
}

/**
 * Aligned zoom event with timestamp
 */
export interface ZoomEvent {
  type: "zoom";
  style: "punch" | "slow";
  timestampMs: number;
  durationMs: number;
  confidence: number;
}

/**
 * Aligned highlight event with timestamp
 */
export interface HighlightEvent {
  type: "highlight";
  word: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

export type AlignedEvent = ZoomEvent | HighlightEvent;

/**
 * Result of aligning script with captions
 */
export interface AlignmentResult {
  events: AlignedEvent[];
  transcriptionText: string;
  scriptText: string;
  overallConfidence: number;
}

/**
 * Levenshtein distance between two strings
 */
export function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Normalize text for comparison
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate similarity ratio between two strings (0-1)
 */
export function similarity(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);

  if (normA === normB) return 1;
  if (normA.length === 0 || normB.length === 0) return 0;

  const distance = levenshtein(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);

  return 1 - distance / maxLen;
}

/**
 * Align a parsed script with captions to generate timed zoom/highlight events
 *
 * @param script - Parsed script with markers
 * @param captions - Transcription captions with timestamps
 * @returns Alignment result with timed events
 */
export function alignScript(script: ParsedScript, captions: Caption[]): AlignmentResult {
  const events: AlignedEvent[] = [];
  const transcriptionText = captions.map((c) => c.text).join(" ");

  if (captions.length === 0 || script.markers.length === 0) {
    return {
      events: [],
      transcriptionText,
      scriptText: script.text,
      overallConfidence: 0,
    };
  }

  // Build word-level mapping from script position to caption
  const scriptWords = script.text.split(/\s+/).filter(Boolean);
  const captionWords: { word: string; startMs: number; endMs: number; captionIndex: number }[] = [];

  for (let i = 0; i < captions.length; i++) {
    const cap = captions[i];
    const words = cap.text.split(/\s+/).filter(Boolean);
    const wordDuration = (cap.endMs - cap.startMs) / Math.max(words.length, 1);

    for (let j = 0; j < words.length; j++) {
      captionWords.push({
        word: words[j],
        startMs: cap.startMs + j * wordDuration,
        endMs: cap.startMs + (j + 1) * wordDuration,
        captionIndex: i,
      });
    }
  }

  // Align script words to caption words using dynamic programming
  const alignment = alignWords(scriptWords, captionWords.map((cw) => cw.word));

  // Process each marker
  for (const marker of script.markers) {
    // Find which script word this marker is near
    let charCount = 0;
    let scriptWordIndex = 0;

    for (let i = 0; i < scriptWords.length; i++) {
      charCount += scriptWords[i].length + 1; // +1 for space
      if (charCount >= marker.position) {
        scriptWordIndex = i;
        break;
      }
    }

    // Find corresponding caption word via alignment
    const alignedCaptionIndex = alignment[scriptWordIndex];
    if (alignedCaptionIndex === -1 || alignedCaptionIndex >= captionWords.length) {
      continue;
    }

    const captionWord = captionWords[alignedCaptionIndex];
    const matchConfidence = similarity(
      normalize(scriptWords[scriptWordIndex] || ""),
      normalize(captionWord.word),
    );

    if (marker.type === "zoom") {
      events.push({
        type: "zoom",
        style: marker.style,
        timestampMs: captionWord.startMs,
        durationMs: marker.style === "slow" ? 1500 : 500,
        confidence: matchConfidence,
      });
    } else if (marker.type === "highlight") {
      // Find the word range for the highlight
      const highlightWord = normalize(marker.word);
      let startIdx = alignedCaptionIndex;
      let endIdx = alignedCaptionIndex;

      // Look for the full highlight word in nearby captions
      for (let i = Math.max(0, alignedCaptionIndex - 2); i < Math.min(captionWords.length, alignedCaptionIndex + 3); i++) {
        if (normalize(captionWords[i].word).includes(highlightWord) || highlightWord.includes(normalize(captionWords[i].word))) {
          startIdx = Math.min(startIdx, i);
          endIdx = Math.max(endIdx, i);
        }
      }

      events.push({
        type: "highlight",
        word: marker.word,
        startMs: captionWords[startIdx].startMs,
        endMs: captionWords[endIdx].endMs,
        confidence: matchConfidence,
      });
    }
  }

  // Sort events by timestamp
  events.sort((a, b) => {
    const timeA = a.type === "zoom" ? a.timestampMs : a.startMs;
    const timeB = b.type === "zoom" ? b.timestampMs : b.startMs;
    return timeA - timeB;
  });

  const overallConfidence =
    events.length > 0 ? events.reduce((sum, e) => sum + e.confidence, 0) / events.length : 0;

  return {
    events,
    transcriptionText,
    scriptText: script.text,
    overallConfidence,
  };
}

/**
 * Align two word sequences using dynamic programming (Needleman-Wunsch style)
 * Returns an array mapping script word indices to caption word indices (-1 if no match)
 */
export function alignWords(scriptWords: string[], captionWords: string[]): number[] {
  const m = scriptWords.length;
  const n = captionWords.length;

  if (m === 0) return [];
  if (n === 0) return new Array(m).fill(-1);

  // DP matrix for optimal alignment
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  const path: [number, number][][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(null).map(() => [-1, -1] as [number, number]),
  );

  // Fill DP matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const matchScore = similarity(normalize(scriptWords[i - 1]), normalize(captionWords[j - 1]));

      const match = dp[i - 1][j - 1] + matchScore;
      const skip = Math.max(dp[i - 1][j], dp[i][j - 1]);

      if (match >= skip) {
        dp[i][j] = match;
        path[i][j] = [i - 1, j - 1];
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        dp[i][j] = dp[i - 1][j];
        path[i][j] = [i - 1, j];
      } else {
        dp[i][j] = dp[i][j - 1];
        path[i][j] = [i, j - 1];
      }
    }
  }

  // Backtrack to find alignment
  const result: number[] = new Array(m).fill(-1);

  // Start backtracking from the earliest j that achieves the optimal score.
  // Without gap penalties, dp[m][j] is non-decreasing — once the max is
  // reached, later columns just carry the same value via skip transitions.
  // Starting from the earliest max prevents spanning into repeated words.
  const maxScore = dp[m][n];
  let bestJ = n;
  for (let jj = 1; jj <= n; jj++) {
    if (dp[m][jj] >= maxScore) {
      bestJ = jj;
      break;
    }
  }

  let i = m,
    j = bestJ;

  while (i > 0 && j > 0) {
    const [pi, pj] = path[i][j];
    if (pi === i - 1 && pj === j - 1) {
      // This was a match
      const score = similarity(normalize(scriptWords[i - 1]), normalize(captionWords[j - 1]));
      if (score > 0.3) {
        result[i - 1] = j - 1;
      }
    }
    i = pi;
    j = pj;
  }

  return result;
}

/**
 * Get zoom events only
 */
export function getZoomEvents(result: AlignmentResult): ZoomEvent[] {
  return result.events.filter((e): e is ZoomEvent => e.type === "zoom");
}

/**
 * Get highlight events only
 */
export function getHighlightEvents(result: AlignmentResult): HighlightEvent[] {
  return result.events.filter((e): e is HighlightEvent => e.type === "highlight");
}
