import { useRef, useEffect } from "react";
import type { Segment } from "@/core/silence/segments";

interface SegmentPlayerProps {
  videoSrc: string;
  segment: Segment | null;
  width?: number;
  height?: number;
}

export const SegmentPlayer: React.FC<SegmentPlayerProps> = ({
  videoSrc,
  segment,
  width = 360,
  height = 640,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && segment) {
      videoRef.current.currentTime = segment.startTime;
      videoRef.current.pause();
    }
  }, [segment]);

  const handleTimeUpdate = () => {
    if (videoRef.current && segment) {
      if (videoRef.current.currentTime >= segment.endTime) {
        videoRef.current.currentTime = segment.startTime;
      }
    }
  };

  if (!segment) {
    return (
      <div
        style={{ width, height }}
        className="bg-muted rounded-lg flex items-center justify-center text-muted-foreground"
      >
        Selecciona un segmento
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <video
        ref={videoRef}
        src={videoSrc}
        width={width}
        height={height}
        controls
        onTimeUpdate={handleTimeUpdate}
        className="rounded-lg bg-muted object-contain"
      />
      <div className="text-center text-muted-foreground text-xs">
        Segmento #{segment.index + 1} | {segment.startTime.toFixed(2)}s -{" "}
        {segment.endTime.toFixed(2)}s | {segment.duration.toFixed(2)}s
      </div>
    </div>
  );
};
