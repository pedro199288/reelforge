/**
 * Multi-Track Editor Types
 *
 * All time values are in frames (not ms) for native Remotion compatibility.
 * Use frameToMs/msToFrame helpers for conversion.
 */

import type { ItemAnimations } from "./animation";

// ─── Base Item ───────────────────────────────────────────────────────

export interface BaseItem {
  id: string;
  name: string;
  from: number; // Start frame on the timeline
  durationInFrames: number;
  trackId: string;
  animations?: ItemAnimations;
}

// ─── Item Types ──────────────────────────────────────────────────────

export interface VideoItem extends BaseItem {
  type: "video";
  src: string;
  trimStartFrame: number;
  trimEndFrame: number;
  volume: number;
  playbackRate: number;
  fit: "cover" | "contain" | "fill";
  position: { x: number; y: number };
  scale: number;
}

export interface AudioItem extends BaseItem {
  type: "audio";
  src: string;
  trimStartFrame: number;
  trimEndFrame: number;
  volume: number;
  fadeInFrames: number;
  fadeOutFrames: number;
}

export interface TextItemShadow {
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
}

export interface TextItemBackground {
  color: string;
  borderRadius: number;
  opacity: number;
  paddingX: number;
  paddingY: number;
}

export interface TextItem extends BaseItem {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  position: { x: number; y: number };
  textShadow?: TextItemShadow;
  lineHeight: number;
  letterSpacing: number;
  background?: TextItemBackground;
  textOpacity: number;
  textTransform: "none" | "uppercase" | "lowercase" | "capitalize";
  underline: boolean;
  italic: boolean;
  textBoxWidth: number | null;
  textBoxHeight: number | null;
}

export interface ImageItem extends BaseItem {
  type: "image";
  src: string;
  position: { x: number; y: number };
  scale: number;
  opacity: number;
  fit: "cover" | "contain" | "fill";
}

export interface SolidItem extends BaseItem {
  type: "solid";
  color: string;
  opacity: number;
}

export interface CaptionWord {
  text: string;
  startOffsetFrames: number; // relative to CaptionItem start
  endOffsetFrames: number;
}

export interface CaptionItem extends BaseItem {
  type: "caption";
  text: string;
  words: CaptionWord[];
  sourceVideoItemId?: string;
}

// ─── Discriminated Union ─────────────────────────────────────────────

export type TimelineItem =
  | VideoItem
  | AudioItem
  | TextItem
  | ImageItem
  | SolidItem
  | CaptionItem;

export type TimelineItemType = TimelineItem["type"];

// ─── Track ───────────────────────────────────────────────────────────

export type TrackType = "video" | "audio" | "text" | "overlay" | "caption";

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  items: TimelineItem[];
  locked: boolean;
  visible: boolean;
  volume: number; // 0-1, applies to video/audio tracks
  height: number; // px height in timeline UI
}

// ─── Project ─────────────────────────────────────────────────────────

export interface EditorProject {
  id: string;
  name: string;
  tracks: Track[];
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
}

// ─── Selection ───────────────────────────────────────────────────────

export type EditorSelection =
  | { type: "item"; itemId: string; trackId: string }
  | { type: "track"; trackId: string }
  | null;

// ─── Helpers ─────────────────────────────────────────────────────────

export function frameToMs(frame: number, fps: number): number {
  return (frame / fps) * 1000;
}

export function msToFrame(ms: number, fps: number): number {
  return Math.round((ms / 1000) * fps);
}

export function framesToTimecode(frames: number, fps: number): string {
  const totalSeconds = frames / fps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const remainingFrames = Math.floor(frames % fps);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(remainingFrames).padStart(2, "0")}`;
}

// ─── Factory Functions ───────────────────────────────────────────────

export function createVideoItem(
  id: string,
  trackId: string,
  src: string,
  from: number,
  durationInFrames: number
): VideoItem {
  return {
    id,
    name: src.split("/").pop() ?? "Video",
    type: "video",
    from,
    durationInFrames,
    trackId,
    src,
    trimStartFrame: 0,
    trimEndFrame: durationInFrames,
    volume: 1,
    playbackRate: 1,
    fit: "cover",
    position: { x: 540, y: 960 },
    scale: 1,
  };
}

export function createAudioItem(
  id: string,
  trackId: string,
  src: string,
  from: number,
  durationInFrames: number
): AudioItem {
  return {
    id,
    name: src.split("/").pop() ?? "Audio",
    type: "audio",
    from,
    durationInFrames,
    trackId,
    src,
    trimStartFrame: 0,
    trimEndFrame: durationInFrames,
    volume: 1,
    fadeInFrames: 0,
    fadeOutFrames: 0,
  };
}

export function createTextItem(
  id: string,
  trackId: string,
  text: string,
  from: number,
  durationInFrames: number
): TextItem {
  return {
    id,
    name: text.slice(0, 20) || "Text",
    type: "text",
    from,
    durationInFrames,
    trackId,
    text,
    fontFamily: "Inter",
    fontSize: 48,
    fontWeight: 700,
    color: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: 0,
    position: { x: 540, y: 960 },
    lineHeight: 1.2,
    letterSpacing: 0,
    textOpacity: 1,
    textTransform: "none",
    underline: false,
    italic: false,
    textBoxWidth: null,
    textBoxHeight: null,
  };
}

export function createImageItem(
  id: string,
  trackId: string,
  src: string,
  from: number,
  durationInFrames: number
): ImageItem {
  return {
    id,
    name: src.split("/").pop() ?? "Image",
    type: "image",
    from,
    durationInFrames,
    trackId,
    src,
    position: { x: 0, y: 0 },
    scale: 1,
    opacity: 1,
    fit: "contain",
  };
}

export function createSolidItem(
  id: string,
  trackId: string,
  color: string,
  from: number,
  durationInFrames: number
): SolidItem {
  return {
    id,
    name: "Solid",
    type: "solid",
    from,
    durationInFrames,
    trackId,
    color,
    opacity: 1,
  };
}

export function createCaptionItem(
  id: string,
  trackId: string,
  text: string,
  words: CaptionWord[],
  from: number,
  durationInFrames: number,
  sourceVideoItemId?: string
): CaptionItem {
  return {
    id,
    name: text.slice(0, 20) || "Caption",
    type: "caption",
    from,
    durationInFrames,
    trackId,
    text,
    words,
    sourceVideoItemId,
  };
}

export function createTrack(
  id: string,
  name: string,
  type: TrackType
): Track {
  return {
    id,
    name,
    type,
    items: [],
    locked: false,
    visible: true,
    volume: 1,
    height: type === "audio" ? 60 : type === "caption" ? 50 : 80,
  };
}

export function createProject(id: string, name: string): EditorProject {
  return {
    id,
    name,
    tracks: [],
    fps: 30,
    width: 1080,
    height: 1920,
    durationInFrames: 900, // 30 seconds default
  };
}
