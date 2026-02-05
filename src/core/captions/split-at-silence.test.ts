import { describe, it, expect } from "bun:test";
import {
  splitAtSilenceGaps,
  dropPhantomEchoes,
  DEFAULT_SILENCE_GAP_MS,
} from "./split-at-silence";

function cap(text: string, startMs: number, endMs: number) {
  return { text, startMs, endMs };
}

describe("splitAtSilenceGaps", () => {
  it("returns [] for empty input", () => {
    expect(splitAtSilenceGaps([])).toEqual([]);
  });

  it("returns a single chunk when no gap exceeds threshold", () => {
    const captions = [
      cap("Hello", 0, 300),
      cap(" world", 350, 600),
      cap(" today.", 650, 900),
    ];
    const result = splitAtSilenceGaps(captions);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(captions);
  });

  it("splits into two chunks when gap exceeds threshold", () => {
    const captions = [
      cap("Hello", 0, 300),
      cap(" world.", 350, 600),
      // 800ms gap (> 700ms default)
      cap("New", 1400, 1700),
      cap(" sentence.", 1750, 2000),
    ];
    const result = splitAtSilenceGaps(captions);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual([captions[0], captions[1]]);
    expect(result[1]).toEqual([captions[2], captions[3]]);
  });

  it("splits at multiple gaps", () => {
    const captions = [
      cap("A", 0, 100),
      // 1000ms gap
      cap("B", 1100, 1200),
      // 900ms gap
      cap("C", 2100, 2200),
    ];
    const result = splitAtSilenceGaps(captions);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual([captions[0]]);
    expect(result[1]).toEqual([captions[1]]);
    expect(result[2]).toEqual([captions[2]]);
  });

  it("does not split when gap equals threshold exactly", () => {
    const captions = [
      cap("A", 0, 100),
      // exactly 700ms gap
      cap("B", 800, 900),
    ];
    const result = splitAtSilenceGaps(captions);
    expect(result).toHaveLength(2);
  });

  it("respects custom silenceGapMs", () => {
    const captions = [
      cap("A", 0, 100),
      // 400ms gap
      cap("B", 500, 600),
    ];
    // default (700ms) → no split
    expect(splitAtSilenceGaps(captions)).toHaveLength(1);
    // custom 300ms → split
    expect(splitAtSilenceGaps(captions, 300)).toHaveLength(2);
  });

  it("handles a single caption", () => {
    const captions = [cap("Only", 0, 200)];
    const result = splitAtSilenceGaps(captions);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(captions);
  });

  it("exports DEFAULT_SILENCE_GAP_MS as 700", () => {
    expect(DEFAULT_SILENCE_GAP_MS).toBe(700);
  });
});

describe("dropPhantomEchoes", () => {
  it("removes single-word chunk that echoes start of next chunk", () => {
    const chunks = [
      [cap("before.", 0, 200)],
      [cap(" si", 13240, 13400)],        // phantom echo (alone)
      [cap(" si", 14200, 14400), cap(" estás.", 14450, 14700)],
    ];
    const result = dropPhantomEchoes(chunks);
    expect(result).toHaveLength(2);
    expect(result[0][0].text).toBe("before.");
    expect(result[1][0].startMs).toBe(14200); // the real "si"
  });

  it("keeps single-word chunk when next chunk starts with different word", () => {
    const chunks = [
      [cap("ok", 0, 100)],
      [cap(" pero", 900, 1100), cap(" luego.", 1150, 1400)],
    ];
    expect(dropPhantomEchoes(chunks)).toHaveLength(2);
  });

  it("keeps multi-word chunk even if first word matches next chunk", () => {
    const chunks = [
      [cap("si", 0, 100), cap(" estás", 150, 300)],
      [cap(" si", 1100, 1300), cap(" estás.", 1350, 1500)],
    ];
    expect(dropPhantomEchoes(chunks)).toHaveLength(2);
  });

  it("ignores punctuation when comparing", () => {
    const chunks = [
      [cap("si...", 0, 100)],
      [cap(" si", 900, 1000), cap(" estás.", 1050, 1300)],
    ];
    const result = dropPhantomEchoes(chunks);
    expect(result).toHaveLength(1);
    expect(result[0][0].startMs).toBe(900);
  });

  it("handles multiple phantom echoes", () => {
    const chunks = [
      [cap("si", 0, 100)],
      [cap(" si", 900, 1000), cap(" bien.", 1050, 1200)],
      [cap(" pero", 5000, 5100)],
      [cap(" pero", 5900, 6100), cap(" luego.", 6150, 6400)],
    ];
    const result = dropPhantomEchoes(chunks);
    expect(result).toHaveLength(2);
  });

  it("returns empty for empty input", () => {
    expect(dropPhantomEchoes([])).toEqual([]);
  });

  it("keeps last single-word chunk (no next chunk to compare)", () => {
    const chunks = [
      [cap("hello", 0, 100), cap(" world.", 150, 300)],
      [cap(" ok", 2000, 2100)],
    ];
    expect(dropPhantomEchoes(chunks)).toHaveLength(2);
  });
});
