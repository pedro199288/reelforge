import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { type FontId } from "../load-font";
import { fitText } from "@remotion/layout-utils";
import { TikTokPage } from "@remotion/captions";
import {
  useSubtitleStyle,
  type SubtitleStyle,
} from "@/store/subtitles";
import { getEntranceStyles } from "./animations/entrance";
import { getHighlightStyles, combineHighlightWithBase } from "./animations/highlight";

interface PageProps {
  readonly enterProgress: number;
  readonly page: TikTokPage;
  // Optional style overrides - if not provided, uses store
  readonly highlightColor?: string;
  readonly fontFamily?: FontId;
  readonly styleOverrides?: Partial<SubtitleStyle>;
}

// Helper to convert hex to rgba
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 0, 0, ${alpha})`;
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
}

export const Page: React.FC<PageProps> = ({
  enterProgress,
  page,
  highlightColor: propHighlightColor,
  fontFamily: propFontFamily,
  styleOverrides,
}) => {
  const frame = useCurrentFrame();
  const { width, fps } = useVideoConfig();
  const timeInMs = (frame / fps) * 1000;

  // Get style from store, with prop overrides for backwards compatibility
  const storeStyle = useSubtitleStyle();
  const style: SubtitleStyle = {
    ...storeStyle,
    ...styleOverrides,
    ...(propHighlightColor && { highlightColor: propHighlightColor }),
    ...(propFontFamily && { fontFamily: propFontFamily }),
  };

  // Calculate entrance animation
  const entranceFrame = Math.round(enterProgress * fps * (style.entranceDuration / 1000));
  const entranceStyles = getEntranceStyles(style.entranceAnimation, {
    frame: entranceFrame,
    fps,
    durationMs: style.entranceDuration,
  });

  // Calculate fitted font size
  const fittedText = fitText({
    fontFamily: style.fontFamily,
    text: page.text,
    withinWidth: width * 0.9,
    textTransform: "uppercase",
  });
  const fontSize = Math.min(style.fontSize, fittedText.fontSize);

  // Container positioning
  const containerStyle: React.CSSProperties = {
    justifyContent:
      style.position === "top"
        ? "flex-start"
        : style.position === "center"
          ? "center"
          : "flex-end",
    alignItems: "center",
    paddingTop: style.position === "top" ? style.marginBottom : undefined,
    paddingBottom: style.position === "bottom" ? style.marginBottom : undefined,
  };

  // Text wrapper styling
  const textWrapperStyle: React.CSSProperties = {
    fontSize,
    color: style.textColor,
    WebkitTextStroke:
      style.strokeWidth > 0
        ? `${style.strokeWidth}px ${style.strokeColor}`
        : undefined,
    paintOrder: style.strokeWidth > 0 ? "stroke" : undefined,
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    textTransform: "uppercase",
    opacity: entranceStyles.opacity,
    transform: entranceStyles.transform,
    // Shadow
    textShadow: style.shadowEnabled
      ? `${style.shadowOffsetX}px ${style.shadowOffsetY}px ${style.shadowBlur}px ${style.shadowColor}`
      : undefined,
    // Background
    backgroundColor: style.backgroundEnabled
      ? hexToRgba(style.backgroundColor, style.backgroundOpacity)
      : undefined,
    padding: style.backgroundEnabled ? style.backgroundPadding : undefined,
    borderRadius: style.backgroundEnabled ? 8 : undefined,
  };

  return (
    <AbsoluteFill style={containerStyle}>
      <div style={textWrapperStyle}>
        {page.tokens.map((t) => {
          const startRelativeToSequence = t.fromMs - page.startMs;
          const endRelativeToSequence = t.toMs - page.startMs;

          const isActive =
            startRelativeToSequence <= timeInMs &&
            endRelativeToSequence > timeInMs;

          // Calculate highlight effect
          const startFrame = Math.round((startRelativeToSequence / 1000) * fps);
          const endFrame = Math.round((endRelativeToSequence / 1000) * fps);
          const localFrame = Math.round((timeInMs / 1000) * fps);

          const highlightStyles = getHighlightStyles(
            style.highlightEffect,
            {
              frame: localFrame,
              fps,
              startFrame,
              endFrame,
              intensity: style.highlightIntensity,
              color: style.highlightColor,
            },
            isActive
          );

          const tokenBaseStyle: React.CSSProperties = {
            display: "inline",
            whiteSpace: "pre",
            color: isActive ? style.highlightColor : style.textColor,
          };

          const tokenStyle = combineHighlightWithBase(tokenBaseStyle, highlightStyles);

          return (
            <span key={t.fromMs} style={tokenStyle}>
              {t.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
