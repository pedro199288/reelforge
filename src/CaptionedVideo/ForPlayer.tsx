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
import { loadFont, type FontId, DEFAULT_FONT } from "../load-font";
import { Caption, createTikTokStyleCaptions } from "@remotion/captions";
import { ZoomLayer } from "./ZoomLayer";
import type { AlignedEvent } from "../core/script/align";

const SWITCH_CAPTIONS_EVERY_MS = 1200;

export const CaptionedVideoForPlayer: React.FC<{
  src: string;
  highlightColor?: string;
  fontFamily?: FontId;
}> = ({ src, highlightColor, fontFamily = DEFAULT_FONT }) => {
  const [subtitles, setSubtitles] = useState<Caption[]>([]);
  const [zoomEvents, setZoomEvents] = useState<AlignedEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { fps } = useVideoConfig();

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
    try {
      const res = await fetch(zoomFile);
      if (!res.ok) return;
      const data = (await res.json()) as AlignedEvent[];
      setZoomEvents(data);
    } catch {
      // Zoom events are optional
    }
  }, [zoomFile]);

  useEffect(() => {
    const loadAll = async () => {
      setIsLoading(true);
      await Promise.all([fetchSubtitles(), fetchZoomEvents()]);
      setIsLoading(false);
    };
    loadAll();
  }, [fetchSubtitles, fetchZoomEvents]);

  const { pages } = useMemo(() => {
    return createTikTokStyleCaptions({
      combineTokensWithinMilliseconds: SWITCH_CAPTIONS_EVERY_MS,
      captions: subtitles ?? [],
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
        const subtitleEndFrame = Math.min(
          nextPage ? (nextPage.startMs / 1000) * fps : Infinity,
          subtitleStartFrame + (SWITCH_CAPTIONS_EVERY_MS / 1000) * fps,
        );
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
            <SubtitlePage key={index} page={page} highlightColor={highlightColor} fontFamily={fontFamily} />;
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
