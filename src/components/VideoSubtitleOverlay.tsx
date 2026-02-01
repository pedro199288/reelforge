import { useMemo } from "react";
import type { Caption } from "@/core/script/align";

interface SubtitlePage {
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
function groupIntoPages(captions: Caption[]): SubtitlePage[] {
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

function getConfidenceColor(confidence: number | undefined): string {
  if (confidence === undefined) return "text-white";
  if (confidence >= 0.8) return "text-green-400";
  if (confidence >= 0.5) return "text-yellow-400";
  return "text-red-400";
}

const LINGER_MS = 200;

interface VideoSubtitleOverlayProps {
  captions: Caption[];
  currentTimeMs: number;
}

export function VideoSubtitleOverlay({
  captions,
  currentTimeMs,
}: VideoSubtitleOverlayProps) {
  const pages = useMemo(() => groupIntoPages(captions), [captions]);

  // Show a page only if a word is being spoken right now
  // or was spoken within LINGER_MS ago (avoids flicker in tiny inter-word gaps).
  // Prioritize pages with an actively spoken word over lingering pages.
  const activePage = useMemo(() => {
    // First pass: page with a word being spoken right now
    for (const p of pages) {
      if (currentTimeMs < p.startMs || currentTimeMs > p.endMs) continue;
      for (const w of p.words) {
        if (currentTimeMs >= w.startMs && currentTimeMs <= w.endMs) return p;
      }
    }

    // Second pass: most recent page with a recently spoken word (linger fallback)
    for (let pi = pages.length - 1; pi >= 0; pi--) {
      const p = pages[pi];
      if (currentTimeMs < p.startMs || currentTimeMs > p.endMs + LINGER_MS)
        continue;
      for (let i = p.words.length - 1; i >= 0; i--) {
        const w = p.words[i];
        if (w.endMs <= currentTimeMs && currentTimeMs - w.endMs <= LINGER_MS)
          return p;
      }
    }

    return null;
  }, [pages, currentTimeMs]);

  if (!activePage) return null;

  return (
    <div className="absolute bottom-12 left-0 right-0 pointer-events-none flex justify-center px-4">
      <div className="bg-black/75 rounded-md px-3 py-1.5 max-w-[90%]">
        <p className="text-sm font-medium text-center leading-relaxed">
          {activePage.words.map((word, i) => {
            const isActive =
              currentTimeMs >= word.startMs && currentTimeMs <= word.endMs;
            const wasSpoken = word.endMs < currentTimeMs;

            return (
              <span
                key={`${word.startMs}-${i}`}
                className={
                  isActive
                    ? `font-bold ${getConfidenceColor(word.confidence)}`
                    : wasSpoken
                      ? "text-white/50"
                      : "text-white/80"
                }
              >
                {word.text}
              </span>
            );
          })}
        </p>
      </div>
    </div>
  );
}
