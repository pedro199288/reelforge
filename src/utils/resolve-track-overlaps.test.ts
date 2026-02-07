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
    position: { x: 540, y: 960 },
    scale: 1,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("resolveOverlaps", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  // ── No overlap ──────────────────────────────────────────────────

  it("preserves items with no overlap", () => {
    const existing = [makeText("a", 0, 50), makeText("b", 100, 50)];
    const incoming = makeText("c", 50, 50);
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(3);
    expect(result.map((i) => i.id)).toEqual(["a", "c", "b"]);
    expect(result[0].from).toBe(0);
    expect(result[0].durationInFrames).toBe(50);
    expect(result[2].from).toBe(100);
    expect(result[2].durationInFrames).toBe(50);
  });

  it("handles abutting items (touching exactly) — no overlap", () => {
    const existing = [makeText("a", 0, 50), makeText("b", 100, 50)];
    const incoming = makeText("c", 50, 50);
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(3);
    expect(result.map((i) => i.id)).toEqual(["a", "c", "b"]);
  });

  // ── Duration 0 ─────────────────────────────────────────────────

  it("returns existing items unchanged when incoming has duration 0", () => {
    const existing = [makeText("a", 0, 100)];
    const incoming = makeText("c", 50, 0);
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
    expect(result[0].durationInFrames).toBe(100);
  });

  // ── Coverage total → displace to nearest edge ──────────────────

  it("displaces fully covered item to the left (center left of incoming center)", () => {
    // existing [20,50) center=35, incoming [10,70) center=40 → left
    const existing = [makeText("a", 20, 30)];
    const incoming = makeText("c", 10, 60);
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(2);
    // "a" displaced to the left: from = inStart - duration = 10 - 30 = -20 → shift
    // shift = 20, incoming moves to 30, "a" moves to 0
    const itemA = result.find((i) => i.id === "a")!;
    const itemC = result.find((i) => i.id === "c")!;
    expect(itemA.from).toBe(0);
    expect(itemA.durationInFrames).toBe(30); // preserved
    expect(itemC.from).toBe(30);
  });

  it("displaces fully covered item to the right (center right of incoming center)", () => {
    // existing [50,80) center=65, incoming [10,70) center=40 → right
    const existing = [makeText("a", 50, 30)];
    const incoming = makeText("c", 10, 60);
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(2);
    const itemA = result.find((i) => i.id === "a")!;
    const itemC = result.find((i) => i.id === "c")!;
    expect(itemA.from).toBe(70); // inEnd = 10+60 = 70
    expect(itemA.durationInFrames).toBe(30);
    expect(itemC.from).toBe(10);
  });

  it("shifts incoming right when covered item cannot fit left (negative frames)", () => {
    // existing [5,15) center=10, incoming [0,30) center=15 → left
    // left would put "a" at from=0-10=-10 → shift of 10
    const existing = [makeText("a", 5, 10)];
    const incoming = makeText("c", 0, 30);
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(2);
    const itemA = result.find((i) => i.id === "a")!;
    const itemC = result.find((i) => i.id === "c")!;
    expect(itemA.from).toBeGreaterThanOrEqual(0);
    expect(itemC.from).toBeGreaterThanOrEqual(0);
    expect(itemA.durationInFrames).toBe(10); // preserved
    // No overlaps
    expect(itemA.from + itemA.durationInFrames).toBeLessThanOrEqual(itemC.from);
  });

  // ── Right overlap → displace left ─────────────────────────────

  it("displaces existing left when incoming overlaps from right", () => {
    // existing [0,100), incoming [50,150)
    // right overlap → push left: from = 50 - 100 = -50 → shift 50
    const existing = [makeText("a", 0, 100)];
    const incoming = makeText("c", 50, 100);
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(2);
    const itemA = result.find((i) => i.id === "a")!;
    const itemC = result.find((i) => i.id === "c")!;
    expect(itemA.durationInFrames).toBe(100); // preserved, not trimmed!
    expect(itemA.from).toBeGreaterThanOrEqual(0);
    // "a" ends before "c" starts
    expect(itemA.from + itemA.durationInFrames).toBeLessThanOrEqual(itemC.from);
  });

  it("shifts incoming right when right-overlap displacement goes negative", () => {
    // existing [0,80), incoming [30,130)
    // right overlap → from = 30 - 80 = -50 → shift 50
    // After shift: a.from=0, c.from=80
    const existing = [makeText("a", 0, 80)];
    const incoming = makeText("c", 30, 100);
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(2);
    const itemA = result.find((i) => i.id === "a")!;
    const itemC = result.find((i) => i.id === "c")!;
    expect(itemA.from).toBe(0);
    expect(itemA.durationInFrames).toBe(80);
    expect(itemC.from).toBe(80); // shifted right to make room
  });

  // ── Left overlap → displace right ─────────────────────────────

  it("displaces existing right when incoming overlaps from left", () => {
    // existing [0,100), incoming [0,60)
    // left overlap → push right: from = 60
    const existing = [makeText("a", 0, 100)];
    const incoming = makeText("c", 0, 60);
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(2);
    const itemA = result.find((i) => i.id === "a")!;
    const itemC = result.find((i) => i.id === "c")!;
    expect(itemC.from).toBe(0);
    expect(itemA.from).toBe(60);
    expect(itemA.durationInFrames).toBe(100); // preserved
  });

  // ── Split ─────────────────────────────────────────────────────

  it("splits existing into two pieces when incoming sits in the middle", () => {
    const existing = [makeVideo("a", 0, 200, 5)];
    const incoming = makeText("c", 50, 100);
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(3);
    // Left piece
    expect(result[0].id).toBe("a");
    expect(result[0].from).toBe(0);
    expect(result[0].durationInFrames).toBe(50);
    expect((result[0] as VideoItem).trimStartFrame).toBe(5); // unchanged
    // Incoming
    expect(result[1].id).toBe("c");
    expect(result[1].from).toBe(50);
    // Right piece
    expect(result[2].id).toBe("gen-1");
    expect(result[2].from).toBe(150);
    expect(result[2].durationInFrames).toBe(50);
    // trimStartFrame = original(5) + (inEnd - exStart) = 5 + 150 = 155
    expect((result[2] as VideoItem).trimStartFrame).toBe(155);
  });

  // ── Cascade ───────────────────────────────────────────────────

  it("cascades: displaced item pushes another item further", () => {
    // "a" [0,50), "b" [50,100), incoming [25,75)
    // "a": right overlap → push left: from=25-50=-25 → shift 25
    // After shift: a.from=0, b.from=75, c.from=50
    // "b": left overlap with incoming [50,100) → push right: from=100
    // Wait, let's trace carefully after shift...
    // After shift of 25: a.from=0, b.from=75, incoming.from=50
    // b overlaps incoming [50,100): b.from=75 < inEnd=100, b.end=125 > inEnd → left overlap → push right to 100
    const existing = [makeText("a", 0, 50), makeText("b", 50, 50)];
    const incoming = makeText("c", 25, 50);
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(3);
    // No overlaps in result
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const aEnd = result[i].from + result[i].durationInFrames;
        const bStart = result[j].from;
        expect(aEnd).toBeLessThanOrEqual(bStart);
      }
    }
    // All durations preserved
    expect(result.find((i) => i.id === "a")!.durationInFrames).toBe(50);
    expect(result.find((i) => i.id === "b")!.durationInFrames).toBe(50);
    expect(result.find((i) => i.id === "c")!.durationInFrames).toBe(50);
  });

  it("cascades: chain of items shifts when displacement reaches frame 0", () => {
    // Three items packed: "a" [0,30), "b" [30,60), "c" [60,90)
    // incoming [30,60) covers "b" exactly
    // "b" center=45, incoming center=45 → equal, goes right (>=) → b.from=60
    // But "c" is at [60,90) → cascade right pushes "c" to 90
    const existing = [
      makeText("a", 0, 30),
      makeText("b", 30, 30),
      makeText("c", 60, 30),
    ];
    const incoming = makeText("x", 30, 30);
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(4);
    // No overlaps
    const sorted = result.sort((a, b) => a.from - b.from);
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].from + sorted[i].durationInFrames).toBeLessThanOrEqual(
        sorted[i + 1].from,
      );
    }
    // All durations preserved
    for (const item of result) {
      expect(item.durationInFrames).toBe(30);
    }
  });

  // ── Multiple overlapping items ────────────────────────────────

  it("handles multiple overlapping items at once", () => {
    const existing = [
      makeText("a", 0, 40),   // [0, 40) — right overlap
      makeText("b", 30, 40),  // [30, 70) — covered by incoming [20,80)
      makeText("c", 80, 20),  // [80, 100) — no overlap
    ];
    const incoming = makeText("x", 20, 60); // [20, 80)
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    // All items preserved (no removal!)
    expect(result).toHaveLength(4);
    // All durations preserved
    expect(result.find((i) => i.id === "a")!.durationInFrames).toBe(40);
    expect(result.find((i) => i.id === "b")!.durationInFrames).toBe(40);
    expect(result.find((i) => i.id === "c")!.durationInFrames).toBe(20);
    // No overlaps in result
    const sorted = result.sort((a, b) => a.from - b.from);
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].from + sorted[i].durationInFrames).toBeLessThanOrEqual(
        sorted[i + 1].from,
      );
    }
  });

  // ── Result ordering ───────────────────────────────────────────

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

  // ── trimStartFrame preservation ───────────────────────────────

  it("preserves trimStartFrame on displaced items (not split)", () => {
    // existing video [0,100) trimStart=10, incoming text [0,60)
    // left overlap → displace right to from=60
    const existing = [makeVideo("a", 0, 100, 10)];
    const incoming = makeText("c", 0, 60);
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    expect(result).toHaveLength(2);
    const video = result.find((i) => i.id === "a")! as VideoItem;
    expect(video.from).toBe(60);
    expect(video.durationInFrames).toBe(100); // preserved!
    expect(video.trimStartFrame).toBe(10); // unchanged for displacement
  });

  it("adjusts trimStartFrame on split right piece", () => {
    const existing = [makeVideo("a", 0, 200, 5)];
    const incoming = makeText("c", 50, 100);
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    const rightPiece = result.find((i) => i.id === "gen-1")! as VideoItem;
    expect(rightPiece.trimStartFrame).toBe(155); // 5 + (150 - 0)
  });

  // ── No negative frames ────────────────────────────────────────

  it("never produces items with negative from", () => {
    // Stress test: multiple items near frame 0, incoming covers all
    const existing = [
      makeText("a", 0, 20),
      makeText("b", 10, 20),
      makeText("c", 20, 20),
    ];
    const incoming = makeText("x", 0, 50);
    const result = resolveOverlaps(existing, incoming, mockGenerateId);

    for (const item of result) {
      expect(item.from).toBeGreaterThanOrEqual(0);
    }
    // All items preserved
    expect(result).toHaveLength(4);
    // No overlaps
    const sorted = result.sort((a, b) => a.from - b.from);
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].from + sorted[i].durationInFrames).toBeLessThanOrEqual(
        sorted[i + 1].from,
      );
    }
  });
});
