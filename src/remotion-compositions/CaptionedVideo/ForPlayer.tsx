/**
 * Version of CaptionedVideo optimized for @remotion/player
 * - No getStaticFiles/watchStaticFile (Remotion Studio specific)
 * - Uses fetch directly with error handling
 * - No useDelayRender (Player handles loading)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  useVideoConfig,
} from "remotion";
import SubtitlePage from "./SubtitlePage";
import { loadFont, type FontId, DEFAULT_FONT } from "../../load-font";
import { Caption } from "@remotion/captions";
import { createSentenceAwarePages } from "../../core/captions/create-sentence-aware-pages";
import { ZoomLayer } from "./ZoomLayer";
import type { AlignedEvent } from "../../core/script/align";

const SWITCH_CAPTIONS_EVERY_MS = 1200;

export const CaptionedVideoForPlayer: React.FC<{
  src: string;
  highlightColor?: string;
  fontFamily?: FontId;
  /** Optional zoom/highlight events from timeline editor (takes precedence over file) */
  timelineEvents?: AlignedEvent[];
}> = ({ src, highlightColor, fontFamily = DEFAULT_FONT, timelineEvents }) => {
  const [subtitles, setSubtitles] = useState<Caption[]>([]);
  const [fileZoomEvents, setFileZoomEvents] = useState<AlignedEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { fps } = useVideoConfig();

  // Use timeline events if provided, otherwise fall back to file events
  const zoomEvents = timelineEvents ?? fileZoomEvents;

  const subtitlesFile = src
    .replace(/.mp4$/, ".json")
    .replace(/.mkv$/, ".json")
    .replace(/.mov$/, ".json")
    .replace(/.webm$/, ".json");

  const zoomFile = src
    .replace(/.mp4$/, ".zoom.json")
    .replace(/.mkv$/, ".zoom.json")
    .replace(/.mov$/, ".zoom.json")
    .replace(/.webm$/, ".zoom.json");

  const fetchSubtitles = useCallback(async () => {
    try {
      await loadFont(fontFamily);
      const res = await fetch(subtitlesFile);
      if (!res.ok) return;
      const data = (await res.json()) as Caption[];
      setSubtitles(data);
    } catch {
      // Subtitles are optional
    }
  }, [subtitlesFile, fontFamily]);

  const fetchZoomEvents = useCallback(async () => {
    // Skip fetching if timeline events are provided
    if (timelineEvents !== undefined) return;
    try {
      const res = await fetch(zoomFile);
      if (!res.ok) return;
      const data = (await res.json()) as AlignedEvent[];
      setFileZoomEvents(data);
    } catch {
      // Zoom events are optional
    }
  }, [zoomFile, timelineEvents]);

  useEffect(() => {
    const loadAll = async () => {
      setIsLoading(true);
      await Promise.all([fetchSubtitles(), fetchZoomEvents()]);
      setIsLoading(false);
    };
    loadAll();
  }, [fetchSubtitles, fetchZoomEvents]);

  const { pages } = useMemo(() => {
    return createSentenceAwarePages({
      captions: subtitles ?? [],
      maxPageDurationMs: SWITCH_CAPTIONS_EVERY_MS,
    });
  }, [subtitles]);

  const videoContent = (
    <>
      <AbsoluteFill>
        <OffthreadVideo
          style={{
            objectFit: "cover",
          }}
          src={src}
        />
      </AbsoluteFill>
      {pages.map((page, index) => {
        const nextPage = pages[index + 1] ?? null;
        const subtitleStartFrame = (page.startMs / 1000) * fps;
        const pageEndMs = page.startMs + page.durationMs;
        const subtitleEndFrame = nextPage
          ? (Math.min(nextPage.startMs, pageEndMs) / 1000) * fps
          : (pageEndMs / 1000) * fps;
        const durationInFrames = subtitleEndFrame - subtitleStartFrame;
        if (durationInFrames <= 0) {
          return null;
        }

        return (
          <Sequence
            key={index}
            from={subtitleStartFrame}
            durationInFrames={durationInFrames}
          >
            <SubtitlePage
              key={index}
              page={page}
              highlightColor={highlightColor}
              fontFamily={fontFamily}
            />
          </Sequence>
        );
      })}
    </>
  );

  if (isLoading) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#000",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div style={{ color: "#fff", fontSize: 24 }}>Loading...</div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "white" }}>
      {zoomEvents.length > 0 ? (
        <ZoomLayer events={zoomEvents}>{videoContent}</ZoomLayer>
      ) : (
        videoContent
      )}
    </AbsoluteFill>
  );
};
