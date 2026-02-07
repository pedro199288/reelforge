export const TRACK_HEADER_WIDTH = 150;
export const DEFAULT_PX_PER_FRAME = 8;
export const MIN_ZOOM = 0.01;
export const MAX_ZOOM = 10;
export const SNAP_THRESHOLD_PX = 8;

export function getPxPerFrame(zoom: number): number {
  return DEFAULT_PX_PER_FRAME * zoom;
}
