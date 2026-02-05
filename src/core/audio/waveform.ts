/**
 * Audio waveform extraction and processing
 * Extracts amplitude data from video/audio files for visualization
 */

export interface WaveformAlignment {
  /** Audio stream start_time from container (seconds) */
  audioStreamStartTime: number;
  /** Offset applied to align audio with video (seconds) */
  appliedOffset: number;
  /** Video duration requested (seconds), if provided */
  videoDuration?: number;
}

export interface WaveformData {
  /** Normalized amplitude values (-1 to 1) */
  samples: number[];
  /** Number of samples per second */
  sampleRate: number;
  /** Total duration in seconds */
  duration: number;
  /** Alignment metadata for debugging */
  alignment?: WaveformAlignment;
}

/**
 * Downsample waveform data to target number of points for visualization
 * Uses peak detection to preserve visual representation
 */
export function downsampleWaveform(
  data: WaveformData,
  targetPoints: number
): number[] {
  const { samples } = data;
  const samplesPerPoint = samples.length / targetPoints;

  if (samplesPerPoint <= 1) {
    return samples.slice(0, targetPoints);
  }

  const result: number[] = [];
  for (let i = 0; i < targetPoints; i++) {
    const start = Math.floor(i * samplesPerPoint);
    const end = Math.floor((i + 1) * samplesPerPoint);
    const segment = samples.slice(start, end);

    // Use max absolute value to preserve peaks
    let maxAbs = 0;
    let maxVal = 0;
    for (const val of segment) {
      const abs = Math.abs(val);
      if (abs > maxAbs) {
        maxAbs = abs;
        maxVal = val;
      }
    }
    result.push(maxVal);
  }

  return result;
}

/**
 * Normalize samples to -1 to 1 range
 */
export function normalizeWaveform(samples: number[]): number[] {
  let max = 0;
  for (const s of samples) {
    const abs = Math.abs(s);
    if (abs > max) max = abs;
  }
  if (max === 0) return samples;
  return samples.map((s) => s / max);
}

/**
 * Parse raw PCM float32 samples from FFmpeg output
 */
export function parseFloat32Samples(buffer: ArrayBuffer): number[] {
  const float32Array = new Float32Array(buffer);
  return Array.from(float32Array);
}
