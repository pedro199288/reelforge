import {
  AbsoluteFill,
  Html5Audio,
  Img,
  OffthreadVideo,
  Sequence,
} from "remotion";
import type {
  Track,
  TimelineItem,
  VideoItem,
  AudioItem,
  TextItem,
  ImageItem,
  SolidItem,
} from "@/types/editor";
import { useGoogleFont } from "@/hooks/useGoogleFont";
import { CaptionItemComp } from "./CaptionItemComp";
import { AnimatedItem } from "./AnimatedItem";

// ─── Props ───────────────────────────────────────────────────────────

interface MultiTrackMainProps extends Record<string, unknown> {
  tracks: Track[];
}

// ─── Item Renderers ──────────────────────────────────────────────────

function VideoItemComp({ item }: { item: VideoItem }) {
  return (
    <AbsoluteFill>
      <OffthreadVideo
        src={item.src}
        startFrom={item.trimStartFrame}
        endAt={item.trimEndFrame}
        volume={item.volume}
        playbackRate={item.playbackRate}
        style={{
          position: "absolute",
          left: item.position.x,
          top: item.position.y,
          width: "100%",
          height: "100%",
          transform: `translate(-50%, -50%) scale(${item.scale})`,
          transformOrigin: "center center",
          objectFit: item.fit,
        }}
      />
    </AbsoluteFill>
  );
}

function AudioItemComp({ item }: { item: AudioItem }) {
  return (
    <Html5Audio
      src={item.src}
      trimBefore={item.trimStartFrame}
      trimAfter={item.trimEndFrame}
      volume={() => item.volume}
    />
  );
}

function TextItemComp({ item }: { item: TextItem }) {
  const fontFamily = useGoogleFont(item.fontFamily);

  const textShadow = item.textShadow
    ? `${item.textShadow.offsetX}px ${item.textShadow.offsetY}px ${item.textShadow.blur}px ${item.textShadow.color}`
    : undefined;

  const letterSpacing = item.letterSpacing ?? 0;

  const textStyles: React.CSSProperties = {
    fontFamily,
    fontSize: item.fontSize,
    fontWeight: item.fontWeight,
    fontStyle: (item.italic ?? false) ? "italic" : "normal",
    color: item.color,
    opacity: item.textOpacity ?? 1,
    WebkitTextStroke:
      item.strokeWidth > 0
        ? `${item.strokeWidth}px ${item.strokeColor}`
        : undefined,
    textShadow,
    lineHeight: item.lineHeight ?? 1.2,
    letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
    textTransform: (item.textTransform ?? "none") as React.CSSProperties["textTransform"],
    textDecoration: (item.underline ?? false) ? "underline" : "none",
    whiteSpace: "pre-wrap",
    textAlign: "center",
    margin: 0,
    maxWidth: item.textBoxWidth ?? undefined,
    maxHeight: item.textBoxHeight ?? undefined,
    overflow: item.textBoxHeight ? "hidden" : undefined,
    wordBreak: item.textBoxWidth ? "break-word" : undefined,
  };

  if (item.background) {
    return (
      <AbsoluteFill
        style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <div
          style={{
            position: "absolute",
            left: item.position.x,
            top: item.position.y,
            transform: "translate(-50%, -50%)",
            backgroundColor: item.background.color,
            borderRadius: item.background.borderRadius,
            opacity: item.background.opacity,
            paddingLeft: item.background.paddingX,
            paddingRight: item.background.paddingX,
            paddingTop: item.background.paddingY,
            paddingBottom: item.background.paddingY,
          }}
        >
          <h1 style={textStyles}>{item.text}</h1>
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill
      style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <h1
        style={{
          ...textStyles,
          position: "absolute",
          left: item.position.x,
          top: item.position.y,
          transform: "translate(-50%, -50%)",
        }}
      >
        {item.text}
      </h1>
    </AbsoluteFill>
  );
}

function ImageItemComp({ item }: { item: ImageItem }) {
  return (
    <AbsoluteFill>
      <Img
        src={item.src}
        style={{
          position: "absolute",
          left: item.position.x,
          top: item.position.y,
          transform: `scale(${item.scale})`,
          opacity: item.opacity,
          objectFit: item.fit,
          width: "100%",
          height: "100%",
        }}
      />
    </AbsoluteFill>
  );
}

function SolidItemComp({ item }: { item: SolidItem }) {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: item.color,
        opacity: item.opacity,
      }}
    />
  );
}

// ─── Item Router ─────────────────────────────────────────────────────

function ItemComp({ item }: { item: TimelineItem }) {
  const content = (() => {
    switch (item.type) {
      case "video":
        return <VideoItemComp item={item} />;
      case "audio":
        return <AudioItemComp item={item} />;
      case "text":
        return <TextItemComp item={item} />;
      case "image":
        return <ImageItemComp item={item} />;
      case "solid":
        return <SolidItemComp item={item} />;
      case "caption":
        return <CaptionItemComp item={item} />;
    }
  })();

  return <AnimatedItem item={item}>{content}</AnimatedItem>;
}

// ─── Track Renderer ──────────────────────────────────────────────────

function TrackComp({ track }: { track: Track }) {
  if (!track.visible) return null;

  return (
    <AbsoluteFill>
      {track.items.map((item) => (
        <Sequence
          key={item.id}
          from={item.from}
          durationInFrames={item.durationInFrames}
        >
          <ItemComp item={item} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

// ─── Main Composition ────────────────────────────────────────────────

export const MultiTrackMain: React.FC<MultiTrackMainProps> = ({ tracks }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* Track index 0 = bottom layer, last = top layer */}
      {tracks.map((track) => (
        <TrackComp key={track.id} track={track} />
      ))}
    </AbsoluteFill>
  );
};
