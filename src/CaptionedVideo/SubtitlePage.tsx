import React from "react";
import {
  AbsoluteFill,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Page } from "./Page";
import { TikTokPage } from "@remotion/captions";
import type { FontId } from "../load-font";
import { useSubtitleStyle } from "@/store/subtitles";

const SubtitlePage: React.FC<{
  readonly page: TikTokPage;
  readonly highlightColor?: string;
  readonly fontFamily?: FontId;
}> = ({ page, highlightColor, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const style = useSubtitleStyle();

  // Calculate entrance duration in frames based on store config
  const durationInFrames = Math.max(3, Math.round((style.entranceDuration / 1000) * fps));

  const enter = spring({
    frame,
    fps,
    config: {
      damping: 200,
    },
    durationInFrames,
  });

  return (
    <AbsoluteFill>
      <Page
        enterProgress={enter}
        page={page}
        highlightColor={highlightColor}
        fontFamily={fontFamily}
      />
    </AbsoluteFill>
  );
};

export default SubtitlePage;
