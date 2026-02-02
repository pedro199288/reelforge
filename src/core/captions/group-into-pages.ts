import type { Caption } from "@/core/script/align";

export interface SubtitlePage {
  startMs: number;
  endMs: number;
  words: Caption[];
}

const MAX_WORDS_PER_PAGE = 8;
const MIN_TAIL_WORDS = 3;
const SENTENCE_END_RE = /[.?!…]$/;

/**
 * Two-pass sentence-aware pagination.
 * Pass 1: Group words into sentences (split at . ? ! …)
 * Pass 2: Split each sentence at word-count boundaries (~8 words max).
 *         Short trailing chunks are merged back into the previous chunk.
 */
export function groupIntoPages(captions: Caption[]): SubtitlePage[] {
  if (captions.length === 0) return [];

  // Pass 1: sentences
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

  // Pass 2: paginate each sentence
  const pages: SubtitlePage[] = [];
  for (const sentence of sentences) {
    paginateSentence(sentence, pages);
  }
  return pages;
}

function paginateSentence(sentence: Caption[], pages: SubtitlePage[]) {
  const chunks: Caption[][] = [];
  let chunk: Caption[] = [];

  for (let i = 0; i < sentence.length; i++) {
    const cap = sentence[i];
    chunk.push(cap);

    // Split on max word count
    if (chunk.length >= MAX_WORDS_PER_PAGE && i < sentence.length - 1) {
      chunks.push(chunk);
      chunk = [];
    }
  }
  if (chunk.length > 0) chunks.push(chunk);

  // Merge short tail back into previous chunk to avoid orphaned words
  if (chunks.length > 1 && chunks[chunks.length - 1].length < MIN_TAIL_WORDS) {
    const prev = chunks[chunks.length - 2];
    const tail = chunks[chunks.length - 1];
    prev.push(...tail);
    chunks.pop();
  }

  for (const c of chunks) {
    pages.push({
      startMs: c[0].startMs,
      endMs: c[c.length - 1].endMs,
      words: c,
    });
  }
}
