export { detectSilences, getVideoDuration } from "./detect";
export type { SilenceRange, SilenceConfig } from "./detect";

export {
  silencesToSegments,
  getTotalDuration,
  mapTimeToEdited,
  mapTimeToOriginal,
} from "./segments";
export type { Segment, SegmentConfig } from "./segments";
