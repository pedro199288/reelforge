/**
 * Types for script parsing with zoom annotations
 */

export type ZoomStyle = "punch" | "slow";

/**
 * A zoom marker in the script
 * [zoom] or [zoom:slow]
 */
export interface ZoomMarker {
  type: "zoom";
  style: ZoomStyle;
  position: number; // Character position in original text
}

/**
 * A highlighted word with quick zoom
 * {word}
 */
export interface HighlightMarker {
  type: "highlight";
  word: string;
  position: number; // Character position in original text
}

export type ScriptMarker = ZoomMarker | HighlightMarker;

/**
 * Parsed script result
 */
export interface ParsedScript {
  /** Clean text with markers removed */
  text: string;
  /** All markers found in order of appearance */
  markers: ScriptMarker[];
  /** Original script text */
  original: string;
}

/**
 * A text segment with optional associated marker
 */
export interface ScriptSegment {
  text: string;
  marker?: ScriptMarker;
}
