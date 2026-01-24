import type {
  ParsedScript,
  ScriptMarker,
  ZoomMarker,
  HighlightMarker,
  ZoomStyle,
  ScriptSegment,
} from "./types";

// Combined pattern to match all markers in order
const MARKER_PATTERN = /\[zoom(?::(\w+))?\]|\{([^}]+)\}/g;

/**
 * Parse a script with zoom and highlight markers
 *
 * Syntax:
 * - [zoom] - Punch zoom (fast, impactful)
 * - [zoom:slow] - Slow zoom (smooth, cinematic)
 * - {word} - Highlight word with quick zoom
 *
 * @example
 * const script = "Welcome to the show [zoom] today we talk about {React}";
 * const parsed = parseScript(script);
 * // parsed.text = "Welcome to the show  today we talk about React"
 * // parsed.markers = [
 * //   { type: "zoom", style: "punch", position: 20 },
 * //   { type: "highlight", word: "React", position: 41 }
 * // ]
 */
export function parseScript(script: string): ParsedScript {
  const markers: ScriptMarker[] = [];
  const parts: string[] = [];
  let lastIndex = 0;
  let cleanPosition = 0;

  // Single pass through all markers
  for (const match of script.matchAll(MARKER_PATTERN)) {
    const matchStart = match.index!;

    // Add text before this marker
    if (matchStart > lastIndex) {
      const textBefore = script.slice(lastIndex, matchStart);
      parts.push(textBefore);
      cleanPosition += textBefore.length;
    }

    if (match[0].startsWith("[zoom")) {
      // Zoom marker: [zoom] or [zoom:slow]
      const style: ZoomStyle = match[1] === "slow" ? "slow" : "punch";
      markers.push({
        type: "zoom",
        style,
        position: cleanPosition,
      } as ZoomMarker);
      // Zoom markers don't add text
    } else {
      // Highlight marker: {word}
      const word = match[2];
      markers.push({
        type: "highlight",
        word,
        position: cleanPosition,
      } as HighlightMarker);
      // Highlight keeps the word
      parts.push(word);
      cleanPosition += word.length;
    }

    lastIndex = matchStart + match[0].length;
  }

  // Add remaining text
  if (lastIndex < script.length) {
    parts.push(script.slice(lastIndex));
  }

  return {
    text: parts.join(""),
    markers,
    original: script,
  };
}

/**
 * Split script into segments, each potentially having a marker
 */
export function splitIntoSegments(parsed: ParsedScript): ScriptSegment[] {
  const { text, markers } = parsed;
  const segments: ScriptSegment[] = [];

  if (markers.length === 0) {
    return [{ text }];
  }

  let lastEnd = 0;

  for (const marker of markers) {
    // Text before this marker
    if (marker.position > lastEnd) {
      segments.push({
        text: text.slice(lastEnd, marker.position),
      });
    }

    if (marker.type === "highlight") {
      // The highlight includes the word itself
      segments.push({
        text: marker.word,
        marker,
      });
      lastEnd = marker.position + marker.word.length;
    } else {
      // Zoom markers are position-only, get surrounding context
      segments.push({
        text: "",
        marker,
      });
      lastEnd = marker.position;
    }
  }

  // Remaining text after last marker
  if (lastEnd < text.length) {
    segments.push({
      text: text.slice(lastEnd),
    });
  }

  return segments;
}

/**
 * Get all zoom markers from parsed script
 */
export function getZoomMarkers(parsed: ParsedScript): ZoomMarker[] {
  return parsed.markers.filter((m): m is ZoomMarker => m.type === "zoom");
}

/**
 * Get all highlight markers from parsed script
 */
export function getHighlightMarkers(parsed: ParsedScript): HighlightMarker[] {
  return parsed.markers.filter((m): m is HighlightMarker => m.type === "highlight");
}

export type { ParsedScript, ScriptMarker, ZoomMarker, HighlightMarker, ZoomStyle, ScriptSegment };
