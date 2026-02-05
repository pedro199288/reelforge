import { describe, it, expect } from "bun:test";
import { groupIntoPages, type SubtitlePage } from "./group-into-pages";
import type { Caption } from "@/core/script/align";

function cap(text: string, startMs: number, endMs: number): Caption {
  return { text, startMs, endMs };
}

describe("groupIntoPages", () => {
  it("returns [] for empty input", () => {
    expect(groupIntoPages([])).toEqual([]);
  });

  it("groups a simple sentence into one page", () => {
    const captions = [
      cap("Hello", 0, 200),
      cap(" world.", 250, 500),
    ];
    const pages = groupIntoPages(captions);
    expect(pages).toHaveLength(1);
    expect(pages[0].words).toEqual(captions);
    expect(pages[0].startMs).toBe(0);
    expect(pages[0].endMs).toBe(500);
  });

  it("splits pages at sentence boundaries", () => {
    const captions = [
      cap("First.", 0, 200),
      cap(" Second.", 250, 500),
    ];
    const pages = groupIntoPages(captions);
    expect(pages).toHaveLength(2);
    expect(pages[0].words).toEqual([captions[0]]);
    expect(pages[1].words).toEqual([captions[1]]);
  });

  it("splits at silence gaps even within the same sentence", () => {
    const captions = [
      cap("Hello", 0, 200),
      cap(" world", 250, 500),
      // 900ms gap — exceeds 700ms threshold
      cap(" today.", 1400, 1700),
    ];
    const pages = groupIntoPages(captions);
    // Should produce 2 pages: ["Hello", " world"] and [" today."]
    expect(pages).toHaveLength(2);
    expect(pages[0].words).toEqual([captions[0], captions[1]]);
    expect(pages[1].words).toEqual([captions[2]]);
  });

  it("does not merge tail across silence gap", () => {
    // Build a sentence with 9 words where the last 2 words are after a silence gap.
    // Without silence check, tail merge would combine them back.
    const words: Caption[] = [];
    let t = 0;
    for (let i = 0; i < 7; i++) {
      words.push(cap(`w${i}`, t, t + 100));
      t += 150;
    }
    // Insert silence gap before the last 2 words
    t += 800; // > 700ms gap
    words.push(cap("w7", t, t + 100));
    t += 150;
    words.push(cap("w8.", t, t + 100));

    const pages = groupIntoPages(words);
    // Words 0-6 should NOT be merged with words 7-8 because of silence gap.
    // The silence split separates [w0..w6] from [w7, w8.].
    // w0..w6 → no sentence end → one sentence → paginated as one chunk (7 words < 8 max).
    // w7, w8. → one sentence → one page.
    expect(pages).toHaveLength(2);
    expect(pages[0].words).toHaveLength(7);
    expect(pages[1].words).toHaveLength(2);
  });

  it("respects custom silenceGapMs option", () => {
    const captions = [
      cap("A", 0, 100),
      // 400ms gap
      cap(" B.", 500, 600),
    ];
    // default 700ms → no split (one page)
    expect(groupIntoPages(captions)).toHaveLength(1);
    // custom 300ms → split (two pages)
    expect(groupIntoPages(captions, { silenceGapMs: 300 })).toHaveLength(2);
  });

  it("drops phantom echo word before pagination", () => {
    // "si" at 13240 (breath), gap, then "si estás..." at 14200
    const captions = [
      cap("before.", 0, 200),
      cap(" si", 13240, 13400),
      // 800ms gap
      cap(" si", 14200, 14400),
      cap(" estás.", 14450, 14700),
    ];
    const pages = groupIntoPages(captions);
    // "before." → page 1
    // phantom " si" at 13240 → dropped
    // " si estás." → page 2
    expect(pages).toHaveLength(2);
    expect(pages[0].words).toEqual([captions[0]]);
    expect(pages[1].words).toEqual([captions[2], captions[3]]);
    expect(pages[1].startMs).toBe(14200);
  });

  it("preserves behavior for long sentences with no silence", () => {
    // 10 words, no silence — should split at 8 and merge the tail (2 words < 3)
    const words: Caption[] = [];
    let t = 0;
    for (let i = 0; i < 10; i++) {
      const text = i === 9 ? `w${i}.` : `w${i}`;
      words.push(cap(text, t, t + 100));
      t += 150;
    }
    const pages = groupIntoPages(words);
    // 10 words → split at 8 → tail has 2 words (< 3 MIN_TAIL) → merged back → 1 page with 10 words
    expect(pages).toHaveLength(1);
    expect(pages[0].words).toHaveLength(10);
  });
});
