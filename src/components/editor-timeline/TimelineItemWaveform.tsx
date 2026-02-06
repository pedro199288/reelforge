import { useMemo } from "react";
import { useWaveform } from "@/hooks/useWaveform";
import { downsampleWaveform } from "@/core/audio/waveform";
import { Waveform, WaveformPlaceholder } from "@/components/Timeline/Waveform";

interface TimelineItemWaveformProps {
  src: string;
  trimStartFrame: number;
  durationInFrames: number;
  width: number;
  height: number;
  fps: number;
  color: string;
}

export function TimelineItemWaveform({
  src,
  trimStartFrame,
  durationInFrames,
  width,
  height,
  fps,
  color,
}: TimelineItemWaveformProps) {
  const { rawData, loading, error } = useWaveform(src, {
    samplesPerSecond: 200,
  });

  if (error) {
    console.warn(`[TimelineItemWaveform] Waveform error for "${src}":`, error);
  }

  const slicedData = useMemo(() => {
    if (!rawData || rawData.samples.length === 0) return null;

    const totalSamples = rawData.samples.length;
    const totalDurationSec = rawData.duration;

    // Convert frame range to sample indices
    const trimStartSec = trimStartFrame / fps;
    const durationSec = durationInFrames / fps;

    const startIdx = Math.floor((trimStartSec / totalDurationSec) * totalSamples);
    const endIdx = Math.floor(((trimStartSec + durationSec) / totalDurationSec) * totalSamples);

    const sliced = rawData.samples.slice(
      Math.max(0, startIdx),
      Math.min(totalSamples, endIdx)
    );

    if (sliced.length === 0) return null;

    // Downsample to pixel width
    const targetPoints = Math.max(1, Math.round(width));
    return downsampleWaveform(
      { samples: sliced, sampleRate: rawData.sampleRate, duration: durationSec },
      targetPoints
    );
  }, [rawData, trimStartFrame, durationInFrames, width, fps]);

  if (loading) {
    return (
      <div className="absolute inset-0 pointer-events-none">
        <WaveformPlaceholder width={width} height={height} />
      </div>
    );
  }

  if (!slicedData) return null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      <Waveform
        data={slicedData}
        width={width}
        height={height}
        color={color}
        style="mirror"
      />
    </div>
  );
}
