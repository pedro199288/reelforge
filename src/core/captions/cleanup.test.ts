import { describe, it, expect } from "bun:test";
import { removePhantomEchoes, type CleanupLogEntry } from "./cleanup";
import type { Caption } from "@/core/script/align";

function cap(
  text: string,
  startMs: number,
  endMs: number,
  confidence = 0.9,
): Caption {
  return { text, startMs, endMs, confidence };
}

describe("removePhantomEchoes", () => {
  it("returns same captions when no phantom echoes exist", () => {
    const captions = [
      cap("Hello", 0, 200),
      cap(" world.", 250, 500),
    ];
    expect(removePhantomEchoes(captions)).toEqual(captions);
  });

  it("removes a single phantom word that echoes the start of the next chunk", () => {
    // "si" at 13240 (phantom breath), then silence, then "si estás..."
    const captions = [
      cap("before.", 0, 200),
      cap(" si", 13240, 13400, 0.6),
      // 800ms gap → silence split
      cap(" si", 14200, 14400, 0.95),
      cap(" estás", 14450, 14700, 0.95),
    ];
    const result = removePhantomEchoes(captions);
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe("before.");
    expect(result[1].text).toBe(" si");
    expect(result[1].startMs).toBe(14200); // the real one
    expect(result[2].text).toBe(" estás");
  });

  it("does not remove isolated word when next chunk starts with a different word", () => {
    const captions = [
      cap("ok", 0, 100),
      // 800ms gap
      cap(" pero", 900, 1100),
      cap(" luego", 1150, 1400),
    ];
    const result = removePhantomEchoes(captions);
    expect(result).toHaveLength(3);
  });

  it("does not remove multi-word chunks", () => {
    const captions = [
      cap("si", 0, 100),
      cap(" estás", 150, 300),
      // 800ms gap
      cap(" si", 1100, 1300),
      cap(" estás", 1350, 1500),
    ];
    // The first chunk has 2 words, so it's not a phantom echo
    const result = removePhantomEchoes(captions);
    expect(result).toHaveLength(4);
  });

  it("logs removed phantom echoes", () => {
    const log: CleanupLogEntry[] = [];
    const captions = [
      cap("si", 13240, 13400, 0.6),
      // 800ms gap
      cap(" si", 14200, 14400, 0.95),
      cap(" estás.", 14450, 14700, 0.95),
    ];
    removePhantomEchoes(captions, { log });
    expect(log).toHaveLength(1);
    expect(log[0].reason).toBe("phantom_echo");
    expect(log[0].text).toBe("si");
    expect(log[0].startMs).toBe(13240);
    expect(log[0].confidence).toBe(0.6);
  });

  it("handles multiple phantom echoes", () => {
    const captions = [
      cap("si", 0, 100, 0.5),
      // 800ms gap
      cap(" si", 900, 1000, 0.9),
      cap(" estás.", 1050, 1300, 0.9),
      cap(" pero", 5000, 5100, 0.4),
      // 800ms gap
      cap(" pero", 5900, 6100, 0.9),
      cap(" luego.", 6150, 6400, 0.9),
    ];
    const result = removePhantomEchoes(captions);
    expect(result).toHaveLength(4);
    expect(result.map((c) => c.text.trim())).toEqual([
      "si", "estás.", "pero", "luego.",
    ]);
  });

  it("ignores punctuation when comparing words", () => {
    const captions = [
      cap("si...", 0, 100),
      // 800ms gap
      cap(" si", 900, 1000),
      cap(" estás.", 1050, 1300),
    ];
    const result = removePhantomEchoes(captions);
    expect(result).toHaveLength(2);
    expect(result[0].startMs).toBe(900);
  });

  it("returns same array for fewer than 2 captions", () => {
    expect(removePhantomEchoes([])).toEqual([]);
    const single = [cap("hello", 0, 100)];
    expect(removePhantomEchoes(single)).toEqual(single);
  });

  it("respects custom silenceGapMs", () => {
    const captions = [
      cap("si", 0, 100),
      // 400ms gap (below default 700, above custom 300)
      cap(" si", 500, 600),
      cap(" estás.", 650, 900),
    ];
    // Default 700ms → no silence split → not detected as phantom
    expect(removePhantomEchoes(captions)).toHaveLength(3);
    // Custom 300ms → detected as phantom echo
    expect(removePhantomEchoes(captions, { silenceGapMs: 300 })).toHaveLength(2);
  });
});
