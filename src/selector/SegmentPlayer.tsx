import { Player, PlayerRef } from "@remotion/player";
import { useRef, useEffect } from "react";
import { AbsoluteFill, OffthreadVideo, Sequence } from "remotion";
import type { Segment } from "../core/silence/segments";

interface SegmentVideoProps {
  src: string;
  startFrame: number;
  durationInFrames: number;
}

const SegmentVideo: React.FC<SegmentVideoProps> = ({
  src,
  startFrame,
  durationInFrames,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Sequence from={0} durationInFrames={durationInFrames}>
        <OffthreadVideo
          src={src}
          startFrom={startFrame}
          style={{ objectFit: "contain", width: "100%", height: "100%" }}
        />
      </Sequence>
    </AbsoluteFill>
  );
};

interface SegmentPlayerProps {
  videoSrc: string;
  segment: Segment | null;
  fps?: number;
  width?: number;
  height?: number;
}

export const SegmentPlayer: React.FC<SegmentPlayerProps> = ({
  videoSrc,
  segment,
  fps = 30,
  width = 360,
  height = 640,
}) => {
  const playerRef = useRef<PlayerRef>(null);

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.seekTo(0);
      playerRef.current.pause();
    }
  }, [segment]);

  if (!segment) {
    return (
      <div
        style={{ width, height }}
        className="bg-muted flex items-center justify-center text-muted-foreground rounded-lg"
      >
        Selecciona un segmento
      </div>
    );
  }

  const startFrame = Math.floor(segment.startTime * fps);
  const durationInFrames = Math.max(1, Math.floor(segment.duration * fps));

  return (
    <div className="flex flex-col gap-2">
      <Player
        ref={playerRef}
        component={SegmentVideo}
        inputProps={{
          src: videoSrc,
          startFrame,
          durationInFrames,
        }}
        durationInFrames={durationInFrames}
        compositionWidth={1080}
        compositionHeight={1920}
        fps={fps}
        style={{
          width,
          height,
          borderRadius: 8,
        }}
        controls
        loop
        clickToPlay
        doubleClickToFullscreen
        spaceKeyToPlayOrPause
      />
      <div className="text-center text-muted-foreground text-xs">
        Segmento #{segment.index + 1} |{" "}
        {segment.startTime.toFixed(2)}s - {segment.endTime.toFixed(2)}s |{" "}
        {segment.duration.toFixed(2)}s
      </div>
    </div>
  );
};
