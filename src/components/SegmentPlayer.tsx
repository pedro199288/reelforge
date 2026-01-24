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
        style={{
          width,
          height,
          backgroundColor: "#1a1a1a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#666",
          borderRadius: 8,
        }}
      >
        Selecciona un segmento
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <video
        ref={videoRef}
        src={videoSrc}
        width={width}
        height={height}
        controls
        onTimeUpdate={handleTimeUpdate}
        style={{
          borderRadius: 8,
          backgroundColor: "#1a1a1a",
          objectFit: "contain",
        }}
      />
      <div style={{ textAlign: "center", color: "#888", fontSize: 12 }}>
        Segmento #{segment.index + 1} | {segment.startTime.toFixed(2)}s -{" "}
        {segment.endTime.toFixed(2)}s | {segment.duration.toFixed(2)}s
      </div>
    </div>
  );
};
