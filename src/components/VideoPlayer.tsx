import { useRef } from "react";

interface VideoPlayerProps {
  src: string;
  width?: number;
  height?: number;
  startTime?: number;
  endTime?: number;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  width = 360,
  height = 640,
  startTime,
  endTime,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleTimeUpdate = () => {
    if (videoRef.current && endTime !== undefined) {
      if (videoRef.current.currentTime >= endTime) {
        videoRef.current.currentTime = startTime ?? 0;
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current && startTime !== undefined) {
      videoRef.current.currentTime = startTime;
    }
  };

  return (
    <video
      ref={videoRef}
      src={src}
      width={width}
      height={height}
      controls
      onTimeUpdate={endTime !== undefined ? handleTimeUpdate : undefined}
      onLoadedMetadata={startTime !== undefined ? handleLoadedMetadata : undefined}
      style={{
        borderRadius: 8,
        backgroundColor: "#1a1a1a",
        objectFit: "contain",
      }}
    />
  );
};
