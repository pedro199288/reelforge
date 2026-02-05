import { useMemo } from "react";
import type { Caption } from "@/core/script/align";
import { groupIntoPages } from "@/core/captions/group-into-pages";

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
