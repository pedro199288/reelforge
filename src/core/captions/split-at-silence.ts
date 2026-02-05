export const DEFAULT_SILENCE_GAP_MS = 700;

interface TimedCaption {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * Split a flat list of captions into chunks wherever the gap between
 * consecutive words exceeds `silenceGapMs`.
 */
export function splitAtSilenceGaps<T extends TimedCaption>(
  captions: T[],
  silenceGapMs = DEFAULT_SILENCE_GAP_MS,
): T[][] {
  if (captions.length === 0) return [];

  const chunks: T[][] = [];
  let current: T[] = [captions[0]];

  for (let i = 1; i < captions.length; i++) {
    const gap = captions[i].startMs - captions[i - 1].endMs;
    if (gap >= silenceGapMs) {
      chunks.push(current);
      current = [];
    }
    current.push(captions[i]);
  }
  if (current.length > 0) chunks.push(current);

  return chunks;
}

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.,!?…\u2026]/g, "");
}

/**
 * Filter out phantom echo chunks: single-word chunks whose word matches
 * the start of the next chunk. Whisper sometimes detects a breath as the
 * upcoming word (e.g. "si" [silence] "si estás...").
 */
export function dropPhantomEchoes<T extends TimedCaption>(
  chunks: T[][],
): T[][] {
  const result: T[][] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (chunk.length === 1) {
      const word = normalize(chunk[0].text);
      const nextChunk = chunks[i + 1];

      if (
        word.length > 0 &&
        nextChunk &&
        nextChunk.length > 0 &&
        word === normalize(nextChunk[0].text)
      ) {
        continue; // skip phantom echo
      }
    }

    result.push(chunk);
  }

  return result;
}
