export { detectSilences, getVideoDuration } from "./detect";
export type { SilenceRange, SilenceConfig } from "./detect";

export { detectSilencesEnvelope } from "./detect-envelope";
export type { EnvelopeSilenceConfig } from "./detect-envelope";

export {
  silencesToSegments,
  getTotalDuration,
  mapTimeToEdited,
  mapTimeToOriginal,
} from "./segments";
export type { Segment, SegmentConfig } from "./segments";
