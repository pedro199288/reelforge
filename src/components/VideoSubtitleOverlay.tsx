import { useMemo } from "react";
import type { Caption } from "@/core/script/align";

interface SubtitlePage {
  startMs: number;
  endMs: number;
  words: Caption[];
}

const GAP_THRESHOLD_MS = 400;
const MAX_WORDS_PER_PAGE = 8;

/**
 * Groups word-level captions into displayable "pages" of ~6-8 words,
 * splitting on gaps >400ms between words.
 */
function groupIntoPages(captions: Caption[]): SubtitlePage[] {
  if (captions.length === 0) return [];

  const pages: SubtitlePage[] = [];
  let currentWords: Caption[] = [captions[0]];

  for (let i = 1; i < captions.length; i++) {
    const prev = captions[i - 1];
    const curr = captions[i];
    const gap = curr.startMs - prev.endMs;

    if (gap > GAP_THRESHOLD_MS || currentWords.length >= MAX_WORDS_PER_PAGE) {
      pages.push({
        startMs: currentWords[0].startMs,
        endMs: currentWords[currentWords.length - 1].endMs,
        words: currentWords,
      });
      currentWords = [curr];
    } else {
      currentWords.push(curr);
    }
  }

  // Push the last page
  if (currentWords.length > 0) {
    pages.push({
      startMs: currentWords[0].startMs,
      endMs: currentWords[currentWords.length - 1].endMs,
      words: currentWords,
    });
  }

  return pages;
}

function getConfidenceColor(confidence: number | undefined): string {
  if (confidence === undefined) return "text-white";
  if (confidence >= 0.8) return "text-green-400";
  if (confidence >= 0.5) return "text-yellow-400";
  return "text-red-400";
}

interface VideoSubtitleOverlayProps {
  captions: Caption[];
  currentTimeMs: number;
}

export function VideoSubtitleOverlay({
  captions,
  currentTimeMs,
}: VideoSubtitleOverlayProps) {
  const pages = useMemo(() => groupIntoPages(captions), [captions]);

  // Find the active page for the current time
  const activePage = useMemo(() => {
    return pages.find(
      (p) => currentTimeMs >= p.startMs && currentTimeMs <= p.endMs
    );
  }, [pages, currentTimeMs]);

  if (!activePage) return null;

  return (
    <div className="absolute bottom-12 left-0 right-0 pointer-events-none flex justify-center px-4">
      <div className="bg-black/75 rounded-md px-3 py-1.5 max-w-[90%]">
        <p className="text-sm font-medium text-center leading-relaxed">
          {activePage.words.map((word, i) => {
            const isActive =
              currentTimeMs >= word.startMs && currentTimeMs <= word.endMs;

            return (
              <span
                key={`${word.startMs}-${i}`}
                className={
                  isActive
                    ? `font-bold ${getConfidenceColor(word.confidence)}`
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
