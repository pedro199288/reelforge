import { describe, it, expect, beforeEach } from "bun:test";
import { resolveOverlaps } from "./resolve-track-overlaps";
import type { VideoItem, TextItem } from "@/types/editor";

// ─── Helpers ────────────────────────────────────────────────────────

let idCounter = 0;
const mockGenerateId = () => `gen-${++idCounter}`;

function makeText(
  id: string,
  from: number,
  duration: number,
): TextItem {
  return {
    id,
    name: "Text",
    type: "text",
    from,
    durationInFrames: duration,
    trackId: "t1",
    text: "hello",
    fontFamily: "Inter",
    fontSize: 48,
    fontWeight: 700,
    color: "#fff",
    strokeColor: "#000",
    strokeWidth: 0,
    position: { x: 0, y: 0 },
  };
}

function makeVideo(
  id: string,
  from: number,
  duration: number,
  trimStartFrame = 0,
): VideoItem {
  return {
    id,
    name: "Video",
    type: "video",
    from,
    durationInFrames: duration,
    trackId: "t1",
    src: "test.mp4",
    trimStartFrame,
    trimEndFrame: duration,
    volume: 1,
    playbackRate: 1,
    fit: "cover",
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("resolveOverlaps", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it("preserves items with no overlap", () => {
    const existing = [makeText("a", 0, 50), makeText("b", 100, 50)];
    const incoming = makeText("c", 50, 50);
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(3);
    expect(result.map((i) => i.id)).toEqual(["a", "c", "b"]);
    // All items unchanged
    expect(result[0].from).toBe(0);
    expect(result[0].durationInFrames).toBe(50);
    expect(result[2].from).toBe(100);
    expect(result[2].durationInFrames).toBe(50);
  });

  it("removes item completely covered by incoming", () => {
    const existing = [makeText("a", 20, 30)]; // [20, 50)
    const incoming = makeText("c", 10, 60); // [10, 70) covers [20,50)
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c");
  });

  it("trims right side of existing when incoming overlaps from right", () => {
    const existing = [makeText("a", 0, 100)]; // [0, 100)
    const incoming = makeText("c", 50, 100); // [50, 150)
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("a");
    expect(result[0].from).toBe(0);
    expect(result[0].durationInFrames).toBe(50); // trimmed to [0, 50)
    expect(result[1].id).toBe("c");
  });

  it("trims left side of existing with trimStartFrame adjustment for video", () => {
    const existing = [makeVideo("a", 0, 100, 10)]; // [0, 100), trimStart=10
    const incoming = makeText("c", 0, 60); // [0, 60)
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("c");
    expect(result[1].id).toBe("a");
    expect(result[1].from).toBe(60);
    expect(result[1].durationInFrames).toBe(40); // [60, 100)
    // trimStartFrame should advance by 60 frames (inEnd - exStart = 60 - 0)
    expect((result[1] as VideoItem).trimStartFrame).toBe(70); // 10 + 60
  });

  it("splits existing into two pieces when incoming sits in the middle", () => {
    const existing = [makeVideo("a", 0, 200, 5)]; // [0, 200), trimStart=5
    const incoming = makeText("c", 50, 100); // [50, 150)
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(3);
    // Left piece
    expect(result[0].id).toBe("a");
    expect(result[0].from).toBe(0);
    expect(result[0].durationInFrames).toBe(50); // [0, 50)
    expect((result[0] as VideoItem).trimStartFrame).toBe(5); // unchanged
    // Incoming
    expect(result[1].id).toBe("c");
    expect(result[1].from).toBe(50);
    // Right piece
    expect(result[2].id).toBe("gen-1");
    expect(result[2].from).toBe(150);
    expect(result[2].durationInFrames).toBe(50); // [150, 200)
    // trimStartFrame = original(5) + (inEnd - exStart) = 5 + 150 = 155
    expect((result[2] as VideoItem).trimStartFrame).toBe(155);
  });

  it("handles multiple overlapping items at once", () => {
    const existing = [
      makeText("a", 0, 40),   // [0, 40) — overlaps
      makeText("b", 30, 40),  // [30, 70) — overlaps
      makeText("c", 80, 20),  // [80, 100) — no overlap
    ];
    const incoming = makeText("x", 20, 60); // [20, 80)
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    // "a" trimmed to [0, 20), "b" removed (completely within [20,80)), "c" preserved
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("a");
    expect(result[0].durationInFrames).toBe(20);
    expect(result[1].id).toBe("x");
    expect(result[2].id).toBe("c");
  });

  it("handles abutting items (touching exactly) — no overlap", () => {
    const existing = [makeText("a", 0, 50), makeText("b", 100, 50)];
    const incoming = makeText("c", 50, 50); // [50, 100)
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(3);
    // All items preserved
    expect(result.map((i) => i.id)).toEqual(["a", "c", "b"]);
  });

  it("returns existing items unchanged when incoming has duration 0", () => {
    const existing = [makeText("a", 0, 100)];
    const incoming = makeText("c", 50, 0);
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
    expect(result[0].durationInFrames).toBe(100);
  });

  it("discards existing item when trim leaves duration < 1", () => {
    const existing = [makeText("a", 50, 1)]; // [50, 51)
    const incoming = makeText("c", 50, 100); // [50, 150) completely covers
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c");
  });

  it("returns result sorted by from", () => {
    const existing = [
      makeText("a", 200, 50),
      makeText("b", 0, 50),
      makeText("c", 400, 50),
    ];
    const incoming = makeText("x", 100, 50);
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    const froms = result.map((i) => i.from);
    expect(froms).toEqual([0, 100, 200, 400]);
  });
});
