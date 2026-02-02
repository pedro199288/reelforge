import type { Caption, TikTokPage, TikTokToken } from "@remotion/captions";
import {
  splitAtSilenceGaps,
  dropPhantomEchoes,
  DEFAULT_SILENCE_GAP_MS,
} from "./split-at-silence";

const SENTENCE_END_RE = /[.?!…]$/;
const MIN_TAIL_DURATION_MS = 700;

interface CreateSentenceAwarePagesInput {
  captions: Caption[];
  maxPageDurationMs?: number;
  silenceGapMs?: number;
}

/**
 * Three-pass pagination that never mixes content from different sentences.
 *
 * Pass 0: Split at silence gaps (>= 700ms by default)
 * Pass 1: Group word-level captions into sentences (split at . ? ! …)
 * Pass 2: Paginate each sentence independently — long sentences get split
 *         at word boundaries every ~maxPageDurationMs. Short trailing
 *         chunks are merged back to avoid tiny flash pages, unless a
 *         silence gap separates them.
 */
export function createSentenceAwarePages({
  captions,
  maxPageDurationMs = 1200,
  silenceGapMs = DEFAULT_SILENCE_GAP_MS,
}: CreateSentenceAwarePagesInput): { pages: TikTokPage[] } {
  if (captions.length === 0) return { pages: [] };

  // Pass 0: split at silence gaps and drop phantom echoes
  const silenceChunks = dropPhantomEchoes(
    splitAtSilenceGaps(captions, silenceGapMs),
  );

  const pages: TikTokPage[] = [];

  for (const chunk of silenceChunks) {
    const sentences = groupIntoSentences(chunk);
    for (const sentence of sentences) {
      paginateSentence(sentence, maxPageDurationMs, silenceGapMs, pages);
    }
  }

  return { pages };
}

function groupIntoSentences(captions: Caption[]): Caption[][] {
  const sentences: Caption[][] = [];
  let current: Caption[] = [];

  for (const cap of captions) {
    current.push(cap);
    if (SENTENCE_END_RE.test(cap.text.trim())) {
      sentences.push(current);
      current = [];
    }
  }
  if (current.length > 0) sentences.push(current);

  return sentences;
}

function paginateSentence(
  sentence: Caption[],
  maxDuration: number,
  silenceGapMs: number,
  pages: TikTokPage[],
): void {
  const chunks: Caption[][] = [];
  let chunk: Caption[] = [];
  let chunkStart = sentence[0].startMs;

  for (let i = 0; i < sentence.length; i++) {
    const cap = sentence[i];
    if (chunk.length === 0) chunkStart = cap.startMs;
    chunk.push(cap);

    const dur = cap.endMs - chunkStart;

    // Only split mid-sentence (not at the very last word)
    if (dur >= maxDuration && i < sentence.length - 1) {
      const next = sentence[i + 1];
      if (next.text.startsWith(" ")) {
        chunks.push(chunk);
        chunk = [];
      }
    }
  }
  if (chunk.length > 0) chunks.push(chunk);

  // Merge short trailing chunk with previous to avoid tiny flash pages,
  // but only if there is no silence gap between them.
  if (chunks.length > 1) {
    const tail = chunks[chunks.length - 1];
    const prev = chunks[chunks.length - 2];
    const tailDur = tail[tail.length - 1].endMs - tail[0].startMs;
    const gap = tail[0].startMs - prev[prev.length - 1].endMs;

    if (tailDur < MIN_TAIL_DURATION_MS && gap < silenceGapMs) {
      prev.push(...tail);
      chunks.pop();
    }
  }

  for (const c of chunks) {
    pages.push(makePage(c));
  }
}

function makePage(captions: Caption[]): TikTokPage {
  const tokens: TikTokToken[] = captions.map((c) => ({
    text: c.text,
    fromMs: c.startMs,
    toMs: c.endMs,
  }));
  return {
    text: tokens.map((t) => t.text).join(""),
    startMs: captions[0].startMs,
    tokens,
    durationMs: captions[captions.length - 1].endMs - captions[0].startMs,
  };
}
