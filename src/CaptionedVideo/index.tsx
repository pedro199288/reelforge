import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  CalculateMetadataFunction,
  cancelRender,
  getStaticFiles,
  OffthreadVideo,
  Sequence,
  useDelayRender,
  useVideoConfig,
  watchStaticFile,
} from "remotion";
import { z } from "zod";
import SubtitlePage from "./SubtitlePage";
import { getVideoMetadata } from "@remotion/media-utils";
import { loadFont } from "../load-font";
import { NoCaptionFile } from "./NoCaptionFile";
import { Caption, createTikTokStyleCaptions } from "@remotion/captions";
import { ZoomLayer } from "./ZoomLayer";
import type { AlignedEvent } from "../core/script/align";

export type SubtitleProp = {
  startInSeconds: number;
  text: string;
};

export const captionedVideoSchema = z.object({
  src: z.string(),
});

export const calculateCaptionedVideoMetadata: CalculateMetadataFunction<
  z.infer<typeof captionedVideoSchema>
> = async ({ props }) => {
  const fps = 30;
  const metadata = await getVideoMetadata(props.src);

  return {
    fps,
    durationInFrames: Math.floor(metadata.durationInSeconds * fps),
  };
};

const getFileExists = (file: string) => {
  const files = getStaticFiles();
  const fileExists = files.find((f) => {
    return f.src === file;
  });
  return Boolean(fileExists);
};

// How many captions should be displayed at a time?
// Try out:
// - 1500 to display a lot of words at a time
// - 200 to only display 1 word at a time
const SWITCH_CAPTIONS_EVERY_MS = 1200;

export const CaptionedVideo: React.FC<{
  src: string;
  highlightColor?: string;
}> = ({ src, highlightColor }) => {
  const [subtitles, setSubtitles] = useState<Caption[]>([]);
  const [zoomEvents, setZoomEvents] = useState<AlignedEvent[]>([]);
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender());
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
      await loadFont();
      const res = await fetch(subtitlesFile);
      const data = (await res.json()) as Caption[];
      setSubtitles(data);
    } catch (e) {
      // Subtitles are optional, don't cancel render
      console.warn("Could not load subtitles:", e);
    }
  }, [subtitlesFile]);

  const fetchZoomEvents = useCallback(async () => {
    try {
      if (!getFileExists(zoomFile)) {
        return;
      }
      const res = await fetch(zoomFile);
      const data = (await res.json()) as AlignedEvent[];
      setZoomEvents(data);
    } catch (e) {
      // Zoom events are optional
      console.warn("Could not load zoom events:", e);
    }
  }, [zoomFile]);

  useEffect(() => {
    const loadAll = async () => {
      try {
        await Promise.all([fetchSubtitles(), fetchZoomEvents()]);
        continueRender(handle);
      } catch (e) {
        cancelRender(e);
      }
    };
    loadAll();

    const c1 = watchStaticFile(subtitlesFile, fetchSubtitles);
    const c2 = getFileExists(zoomFile) ? watchStaticFile(zoomFile, fetchZoomEvents) : null;

    return () => {
      c1.cancel();
      c2?.cancel();
    };
  }, [fetchSubtitles, fetchZoomEvents, src, subtitlesFile, zoomFile, continueRender, handle]);

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
            <SubtitlePage key={index} page={page} highlightColor={highlightColor} />;
          </Sequence>
        );
      })}
    </>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "white" }}>
      {zoomEvents.length > 0 ? (
        <ZoomLayer events={zoomEvents}>{videoContent}</ZoomLayer>
      ) : (
        videoContent
      )}
      {getFileExists(subtitlesFile) ? null : <NoCaptionFile />}
    </AbsoluteFill>
  );
};
