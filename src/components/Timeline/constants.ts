/**
 * Width of the label column in pixels (w-20 = 5rem = 80px)
 */
export const LABEL_COLUMN_WIDTH = 80;

/**
 * Calculate pixels per millisecond based on zoom level
 * At zoom level 1, 1 second = 100px
 */
export function getPxPerMs(zoomLevel: number): number {
  return (100 * zoomLevel) / 1000;
}
