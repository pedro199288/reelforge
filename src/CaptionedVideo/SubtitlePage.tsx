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

const SubtitlePage: React.FC<{
  readonly page: TikTokPage;
  readonly highlightColor?: string;
  readonly fontFamily?: FontId;
}> = ({ page, highlightColor, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({
    frame,
    fps,
    config: {
      damping: 200,
    },
    durationInFrames: 5,
  });

  return (
    <AbsoluteFill>
      <Page enterProgress={enter} page={page} highlightColor={highlightColor} fontFamily={fontFamily} />
    </AbsoluteFill>
  );
};

export default SubtitlePage;
