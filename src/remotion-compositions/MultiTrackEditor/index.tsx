import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence } from "remotion";
import type { Track, TimelineItem, VideoItem, AudioItem, TextItem, ImageItem, SolidItem } from "@/types/editor";

// ─── Props ───────────────────────────────────────────────────────────

interface MultiTrackMainProps extends Record<string, unknown> {
  tracks: Track[];
}

// ─── Item Renderers ──────────────────────────────────────────────────

function VideoItemComp({ item }: { item: VideoItem }) {
  return (
    <OffthreadVideo
      src={item.src}
      startFrom={item.trimStartFrame}
      endAt={item.trimEndFrame}
      volume={item.volume}
      playbackRate={item.playbackRate}
      style={{
        width: "100%",
        height: "100%",
        objectFit: item.fit,
      }}
    />
  );
}

function AudioItemComp({ item }: { item: AudioItem }) {
  return (
    <Audio
      src={item.src}
      startFrom={item.trimStartFrame}
      endAt={item.trimEndFrame}
      volume={item.volume}
    />
  );
}

function TextItemComp({ item }: { item: TextItem }) {
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <h1
        style={{
          position: "absolute",
          left: item.position.x,
          top: item.position.y,
          transform: "translate(-50%, -50%)",
          fontFamily: item.fontFamily,
          fontSize: item.fontSize,
          fontWeight: item.fontWeight,
          color: item.color,
          WebkitTextStroke: item.strokeWidth > 0
            ? `${item.strokeWidth}px ${item.strokeColor}`
            : undefined,
          whiteSpace: "pre-wrap",
          textAlign: "center",
          margin: 0,
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
  }
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
