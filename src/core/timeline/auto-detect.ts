/**
 * Auto-detection of key moments for zoom suggestions
 * Analyzes audio waveform and captions to find optimal zoom points
 */

import type { Caption } from "@/core/script/align";

export interface KeyMoment {
  timestampMs: number;
  endMs?: number;
  type: "volume-peak" | "pause" | "keyword";
  confidence: number;
  suggestedZoom: "punch" | "slow" | "highlight";
  label?: string;
}

export interface DetectionConfig {
  /** Threshold for volume peaks (0-1, relative to max amplitude) */
  volumeThreshold: number;
  /** Minimum duration in ms for a pause to be considered dramatic */
  pauseMinDuration: number;
  /** Keywords to highlight */
  keywords: string[];
  /** Which detection methods to enable */
  enabled: {
    volumePeaks: boolean;
    keywords: boolean;
    pauses: boolean;
  };
}

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  volumeThreshold: 0.7,
  pauseMinDuration: 400,
  keywords: [
    "importante",
    "clave",
    "atencion",
    "mira",
    "escucha",
    "pero",
    "sin embargo",
    "secreto",
    "truco",
    "consejo",
  ],
  enabled: {
    volumePeaks: true,
    keywords: true,
    pauses: true,
  },
};

/**
 * Detect volume peaks in waveform data
 * Returns moments where amplitude exceeds threshold
 */
export function detectVolumePeaks(
  samples: number[],
  sampleRate: number,
  threshold: number,
  minGapMs: number = 500
): KeyMoment[] {
  const moments: KeyMoment[] = [];
  let lastPeakMs = -minGapMs;

  // Calculate absolute values and find local maxima
  for (let i = 1; i < samples.length - 1; i++) {
    const current = Math.abs(samples[i]);
    const prev = Math.abs(samples[i - 1]);
    const next = Math.abs(samples[i + 1]);

    // Is this a local maximum above threshold?
    if (current >= threshold && current > prev && current >= next) {
      const timestampMs = (i / sampleRate) * 1000;

      // Ensure minimum gap between peaks
      if (timestampMs - lastPeakMs >= minGapMs) {
        moments.push({
          timestampMs,
          type: "volume-peak",
          confidence: current, // Use amplitude as confidence
          suggestedZoom: "punch",
          label: `Pico ${Math.round(current * 100)}%`,
        });
        lastPeakMs = timestampMs;
      }
    }
  }

  return moments;
}

/**
 * Detect dramatic pauses between captions
 * Returns moments where there's significant silence
 */
export function detectPauses(
  captions: Caption[],
  minDurationMs: number
): KeyMoment[] {
  const moments: KeyMoment[] = [];

  for (let i = 0; i < captions.length - 1; i++) {
    const current = captions[i];
    const next = captions[i + 1];
    const gap = next.startMs - current.endMs;

    if (gap >= minDurationMs) {
      // Confidence based on pause length (longer = more confident)
      const confidence = Math.min(1, gap / 1000);

      moments.push({
        timestampMs: current.endMs,
        endMs: next.startMs,
        type: "pause",
        confidence,
        suggestedZoom: "slow",
        label: `Pausa ${Math.round(gap)}ms`,
      });
    }
  }

  return moments;
}

/**
 * Detect keywords in captions
 * Returns moments where keywords appear
 */
export function detectKeywords(
  captions: Caption[],
  keywords: string[]
): KeyMoment[] {
  const moments: KeyMoment[] = [];
  const keywordLower = keywords.map((k) => k.toLowerCase());

  for (const caption of captions) {
    const textLower = caption.text.toLowerCase();

    for (const keyword of keywordLower) {
      if (textLower.includes(keyword)) {
        moments.push({
          timestampMs: caption.startMs,
          endMs: caption.endMs,
          type: "keyword",
          confidence: 0.8, // Fixed confidence for keywords
          suggestedZoom: "highlight",
          label: keyword,
        });
        break; // Only one moment per caption
      }
    }
  }

  return moments;
}

/**
 * Run all enabled detection methods and combine results
 */
export function detectKeyMoments(
  waveformSamples: number[] | null,
  waveformSampleRate: number,
  captions: Caption[],
  config: DetectionConfig = DEFAULT_DETECTION_CONFIG
): KeyMoment[] {
  const allMoments: KeyMoment[] = [];

  // Volume peaks
  if (config.enabled.volumePeaks && waveformSamples) {
    const peaks = detectVolumePeaks(
      waveformSamples,
      waveformSampleRate,
      config.volumeThreshold
    );
    allMoments.push(...peaks);
  }

  // Pauses
  if (config.enabled.pauses && captions.length > 0) {
    const pauses = detectPauses(captions, config.pauseMinDuration);
    allMoments.push(...pauses);
  }

  // Keywords
  if (config.enabled.keywords && captions.length > 0) {
    const keywords = detectKeywords(captions, config.keywords);
    allMoments.push(...keywords);
  }

  // Sort by timestamp
  allMoments.sort((a, b) => a.timestampMs - b.timestampMs);

  // Remove duplicates (moments too close together)
  const filtered: KeyMoment[] = [];
  let lastMs = -500;

  for (const moment of allMoments) {
    if (moment.timestampMs - lastMs >= 300) {
      filtered.push(moment);
      lastMs = moment.timestampMs;
    }
  }

  return filtered;
}
