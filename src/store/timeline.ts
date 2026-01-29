import { create } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { persist } from "zustand/middleware";
import { temporal, type TemporalState } from "zundo";
import { shallow } from "zustand/shallow";
import { nanoid } from "nanoid";
import type { AlignedEvent, ZoomEvent, HighlightEvent } from "@/core/script/align";
import type { SilenceRange } from "@/core/silence/detect";
import type { PreselectedSegment } from "@/core/preselection";

/**
 * Timeline zoom (video zoom effect, not timeline zoom level)
 */
export interface TimelineZoom {
  id: string;
  type: "punch" | "slow";
  startMs: number;
  durationMs: number;
}

/**
 * Timeline highlight (word emphasis effect)
 */
export interface TimelineHighlight {
  id: string;
  wordIndex: number; // Index in captions array
  word: string;
  startMs: number;
  endMs: number;
}

/**
 * Timeline segment (part of video with audio content)
 * Represents regions to keep (inverse of silences)
 */
export interface TimelineSegment {
  id: string;
  startMs: number;
  endMs: number;
  enabled: boolean; // When disabled, this segment will be cut too
  /** Preselection score (0-100), undefined if not preselected */
  preselectionScore?: number;
  /** Human-readable reason for preselection decision */
  preselectionReason?: string;
}

/**
 * Selection state for timeline elements
 */
export type TimelineSelection =
  | { type: "zoom"; id: string }
  | { type: "highlight"; id: string }
  | { type: "segment"; id: string }
  | null;

/**
 * Timeline editor state per video
 */
export interface TimelineState {
  videoId: string;
  zooms: TimelineZoom[];
  highlights: TimelineHighlight[];
  segments: TimelineSegment[];
  silences: SilenceRange[];
}

interface TimelineStore {
  // Playback state
  playheadMs: number;
  isPlaying: boolean;

  // Timeline view state
  zoomLevel: number; // 1 = 100%, 0.5 = zoomed out, 2 = zoomed in
  viewportStartMs: number; // Horizontal scroll position

  // Per-video timeline data
  timelines: Record<string, TimelineState>;

  // Selection
  selection: TimelineSelection;

  // Current video being edited
  activeVideoId: string | null;

  // Playback actions
  setPlayhead: (ms: number) => void;
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;

  // View actions
  setZoomLevel: (level: number) => void;
  scrollTo: (ms: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitToView: (durationMs: number, viewportWidthPx?: number) => void;

  // Video context
  setActiveVideo: (videoId: string | null) => void;

  // Zoom actions (video zoom effects)
  addZoom: (videoId: string, type: "punch" | "slow", startMs: number) => string;
  updateZoom: (videoId: string, id: string, updates: Partial<Omit<TimelineZoom, "id">>) => void;
  deleteZoom: (videoId: string, id: string) => void;
  moveZoom: (videoId: string, id: string, newStartMs: number) => void;

  // Highlight actions
  addHighlight: (
    videoId: string,
    wordIndex: number,
    word: string,
    startMs: number,
    endMs: number
  ) => string;
  updateHighlight: (
    videoId: string,
    id: string,
    updates: Partial<Omit<TimelineHighlight, "id">>
  ) => void;
  deleteHighlight: (videoId: string, id: string) => void;

  // Selection actions
  select: (selection: TimelineSelection) => void;
  clearSelection: () => void;
  deleteSelected: (videoId: string) => void;

  // Segment actions (for silence removal editing)
  importSilences: (
    videoId: string,
    silences: SilenceRange[],
    durationMs: number
  ) => void;
  importSemanticSegments: (
    videoId: string,
    segments: Array<{ startMs: number; endMs: number }>,
    silences: SilenceRange[]
  ) => void;
  importPreselectedSegments: (
    videoId: string,
    preselected: PreselectedSegment[],
    silences: SilenceRange[]
  ) => void;
  toggleSegment: (videoId: string, id: string) => void;
  resizeSegment: (
    videoId: string,
    id: string,
    field: "startMs" | "endMs",
    newValue: number
  ) => void;
  addSegment: (videoId: string, startMs: number, endMs: number) => string;
  deleteSegment: (videoId: string, segmentId: string) => void;

  // Bulk actions
  clearTimeline: (videoId: string) => void;
  clearSegments: (videoId: string) => void;

  // Import/Export
  importFromEvents: (videoId: string, events: AlignedEvent[]) => void;
  exportToEvents: (videoId: string) => AlignedEvent[];

  // Helper to get timeline for a video
  getTimeline: (videoId: string) => TimelineState;
}

const DEFAULT_ZOOM_DURATIONS = {
  punch: 500,
  slow: 1500,
} as const;

// MIN_ZOOM_LEVEL = 0.01 allows viewing ~13 minutes in 800px viewport
// Formula: maxDurationMs = viewportPx / (0.01 * 100 / 1000) = viewportPx * 1000
export const MIN_ZOOM_LEVEL = 0.01;
export const MAX_ZOOM_LEVEL = 10;

function createEmptyTimeline(videoId: string): TimelineState {
  return {
    videoId,
    zooms: [],
    highlights: [],
    segments: [],
    silences: [],
  };
}

export const useTimelineStore = create<TimelineStore>()(
  temporal(
    persist(
      (set, get) => ({
        // Initial state
        playheadMs: 0,
        isPlaying: false,
        zoomLevel: 1,
        viewportStartMs: 0,
        timelines: {},
        selection: null,
        activeVideoId: null,

        // Playback actions
        setPlayhead: (ms) => set({ playheadMs: Math.max(0, ms) }),

        play: () => set({ isPlaying: true }),

        pause: () => set({ isPlaying: false }),

        togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),

        // View actions
        setZoomLevel: (level) =>
          set({ zoomLevel: Math.max(MIN_ZOOM_LEVEL, Math.min(MAX_ZOOM_LEVEL, level)) }),

        scrollTo: (ms) => set({ viewportStartMs: Math.max(0, ms) }),

        zoomIn: () =>
          set((state) => ({
            zoomLevel: Math.min(MAX_ZOOM_LEVEL, state.zoomLevel * 1.5),
          })),

        zoomOut: () =>
          set((state) => ({
            zoomLevel: Math.max(MIN_ZOOM_LEVEL, state.zoomLevel / 1.5),
          })),

        fitToView: (durationMs, viewportWidthPx) => {
          // Calculate zoom level to fit entire duration in the viewport
          // pxPerMs = (100 * zoomLevel) / 1000 = zoomLevel / 10
          // To fit durationMs in viewportWidthPx: viewportWidthPx = durationMs * pxPerMs
          // viewportWidthPx = durationMs * (zoomLevel / 10)
          // zoomLevel = (viewportWidthPx * 10) / durationMs
          const effectiveWidth = viewportWidthPx ?? 800;
          const targetZoom = (effectiveWidth * 10) / durationMs;
          set({
            zoomLevel: Math.max(MIN_ZOOM_LEVEL, Math.min(MAX_ZOOM_LEVEL, targetZoom)),
            viewportStartMs: 0,
          });
        },

        // Video context
        setActiveVideo: (videoId) => set({ activeVideoId: videoId }),

        // Zoom actions
        addZoom: (videoId, type, startMs) => {
          const id = nanoid(8);
          set((state) => {
            const timeline = state.timelines[videoId] || createEmptyTimeline(videoId);
            return {
              timelines: {
                ...state.timelines,
                [videoId]: {
                  ...timeline,
                  zooms: [
                    ...timeline.zooms,
                    {
                      id,
                      type,
                      startMs,
                      durationMs: DEFAULT_ZOOM_DURATIONS[type],
                    },
                  ].sort((a, b) => a.startMs - b.startMs),
                },
              },
              selection: { type: "zoom", id },
            };
          });
          return id;
        },

        updateZoom: (videoId, id, updates) =>
          set((state) => {
            const timeline = state.timelines[videoId];
            if (!timeline) return state;

            return {
              timelines: {
                ...state.timelines,
                [videoId]: {
                  ...timeline,
                  zooms: timeline.zooms
                    .map((z) => (z.id === id ? { ...z, ...updates } : z))
                    .sort((a, b) => a.startMs - b.startMs),
                },
              },
            };
          }),

        deleteZoom: (videoId, id) =>
          set((state) => {
            const timeline = state.timelines[videoId];
            if (!timeline) return state;

            return {
              timelines: {
                ...state.timelines,
                [videoId]: {
                  ...timeline,
                  zooms: timeline.zooms.filter((z) => z.id !== id),
                },
              },
              selection:
                state.selection?.type === "zoom" && state.selection.id === id
                  ? null
                  : state.selection,
            };
          }),

        moveZoom: (videoId, id, newStartMs) => {
          get().updateZoom(videoId, id, { startMs: Math.max(0, newStartMs) });
        },

        // Highlight actions
        addHighlight: (videoId, wordIndex, word, startMs, endMs) => {
          const id = nanoid(8);
          set((state) => {
            const timeline = state.timelines[videoId] || createEmptyTimeline(videoId);
            return {
              timelines: {
                ...state.timelines,
                [videoId]: {
                  ...timeline,
                  highlights: [
                    ...timeline.highlights,
                    { id, wordIndex, word, startMs, endMs },
                  ].sort((a, b) => a.startMs - b.startMs),
                },
              },
              selection: { type: "highlight", id },
            };
          });
          return id;
        },

        updateHighlight: (videoId, id, updates) =>
          set((state) => {
            const timeline = state.timelines[videoId];
            if (!timeline) return state;

            return {
              timelines: {
                ...state.timelines,
                [videoId]: {
                  ...timeline,
                  highlights: timeline.highlights
                    .map((h) => (h.id === id ? { ...h, ...updates } : h))
                    .sort((a, b) => a.startMs - b.startMs),
                },
              },
            };
          }),

        deleteHighlight: (videoId, id) =>
          set((state) => {
            const timeline = state.timelines[videoId];
            if (!timeline) return state;

            return {
              timelines: {
                ...state.timelines,
                [videoId]: {
                  ...timeline,
                  highlights: timeline.highlights.filter((h) => h.id !== id),
                },
              },
              selection:
                state.selection?.type === "highlight" && state.selection.id === id
                  ? null
                  : state.selection,
            };
          }),

        // Selection actions
        select: (selection) => set({ selection }),

        clearSelection: () => set({ selection: null }),

        deleteSelected: (videoId) => {
          const { selection } = get();
          if (!selection) return;

          if (selection.type === "zoom") {
            get().deleteZoom(videoId, selection.id);
          } else if (selection.type === "highlight") {
            get().deleteHighlight(videoId, selection.id);
          }
          // Note: segments are not deleted, only toggled enabled/disabled
        },

        // Segment actions (for silence removal editing)
        importSilences: (videoId, silences, durationMs) => {
          // Convert silences to segments (inverse - regions with audio)
          const segments: TimelineSegment[] = [];
          let cursor = 0;
          const paddingMs = 50; // 50ms padding

          const sorted = [...silences].sort((a, b) => a.start - b.start);

          for (const silence of sorted) {
            const silenceStartMs = silence.start * 1000;
            const silenceEndMs = silence.end * 1000;
            const segmentEnd = Math.max(cursor, silenceStartMs - paddingMs);

            if (segmentEnd > cursor + 100) {
              // Minimum 100ms of content
              segments.push({
                id: nanoid(8),
                startMs: cursor,
                endMs: segmentEnd,
                enabled: true,
              });
            }

            cursor = silenceEndMs + paddingMs;
          }

          // Final segment (after last silence)
          if (cursor < durationMs - 100) {
            segments.push({
              id: nanoid(8),
              startMs: cursor,
              endMs: durationMs,
              enabled: true,
            });
          }

          set((state) => {
            const timeline = state.timelines[videoId] || createEmptyTimeline(videoId);
            return {
              timelines: {
                ...state.timelines,
                [videoId]: {
                  ...timeline,
                  segments: segments.sort((a, b) => a.startMs - b.startMs),
                  silences,
                },
              },
            };
          });
        },

        // Import segments from semantic analysis (cuts only between sentences)
        importSemanticSegments: (videoId, semanticSegments, silences) => {
          const segments: TimelineSegment[] = semanticSegments.map((seg) => ({
            id: nanoid(8),
            startMs: seg.startMs,
            endMs: seg.endMs,
            enabled: true,
          }));

          set((state) => {
            const timeline = state.timelines[videoId] || createEmptyTimeline(videoId);
            return {
              timelines: {
                ...state.timelines,
                [videoId]: {
                  ...timeline,
                  segments: segments.sort((a, b) => a.startMs - b.startMs),
                  silences,
                },
              },
            };
          });
        },

        // Import preselected segments with scores and reasons
        importPreselectedSegments: (videoId, preselected, silences) => {
          const segments: TimelineSegment[] = preselected.map((seg) => ({
            id: seg.id,
            startMs: seg.startMs,
            endMs: seg.endMs,
            enabled: seg.enabled,
            preselectionScore: seg.score,
            preselectionReason: seg.reason,
          }));

          set((state) => {
            const timeline = state.timelines[videoId] || createEmptyTimeline(videoId);
            return {
              timelines: {
                ...state.timelines,
                [videoId]: {
                  ...timeline,
                  segments: segments.sort((a, b) => a.startMs - b.startMs),
                  silences,
                },
              },
            };
          });
        },

        toggleSegment: (videoId, id) =>
          set((state) => {
            const timeline = state.timelines[videoId];
            if (!timeline) return state;

            return {
              timelines: {
                ...state.timelines,
                [videoId]: {
                  ...timeline,
                  segments: timeline.segments.map((s) =>
                    s.id === id ? { ...s, enabled: !s.enabled } : s
                  ),
                },
              },
            };
          }),

        resizeSegment: (videoId, id, field, newValue) =>
          set((state) => {
            const timeline = state.timelines[videoId];
            if (!timeline) return state;

            return {
              timelines: {
                ...state.timelines,
                [videoId]: {
                  ...timeline,
                  segments: timeline.segments
                    .map((s) => {
                      if (s.id !== id) return s;
                      // Ensure valid range
                      if (field === "startMs") {
                        const newStart = Math.max(0, Math.min(newValue, s.endMs - 100));
                        return { ...s, startMs: newStart };
                      } else {
                        const newEnd = Math.max(s.startMs + 100, newValue);
                        return { ...s, endMs: newEnd };
                      }
                    })
                    .sort((a, b) => a.startMs - b.startMs),
                },
              },
            };
          }),

        addSegment: (videoId, startMs, endMs) => {
          const id = nanoid(8);
          set((state) => {
            const timeline = state.timelines[videoId] || createEmptyTimeline(videoId);
            const newSegment: TimelineSegment = {
              id,
              startMs: Math.max(0, startMs),
              endMs: Math.max(startMs + 100, endMs),
              enabled: true,
            };
            return {
              timelines: {
                ...state.timelines,
                [videoId]: {
                  ...timeline,
                  segments: [...timeline.segments, newSegment].sort(
                    (a, b) => a.startMs - b.startMs
                  ),
                },
              },
              selection: { type: "segment", id },
            };
          });
          return id;
        },

        deleteSegment: (videoId, segmentId) =>
          set((state) => {
            const timeline = state.timelines[videoId];
            if (!timeline) return state;

            return {
              timelines: {
                ...state.timelines,
                [videoId]: {
                  ...timeline,
                  segments: timeline.segments.filter((s) => s.id !== segmentId),
                },
              },
              selection:
                state.selection?.type === "segment" && state.selection.id === segmentId
                  ? null
                  : state.selection,
            };
          }),

        // Bulk actions
        clearTimeline: (videoId) =>
          set((state) => ({
            timelines: {
              ...state.timelines,
              [videoId]: createEmptyTimeline(videoId),
            },
            selection: null,
          })),

        clearSegments: (videoId) =>
          set((state) => {
            const timeline = state.timelines[videoId];
            if (!timeline) return state;

            return {
              timelines: {
                ...state.timelines,
                [videoId]: {
                  ...timeline,
                  segments: [],
                  silences: [],
                },
              },
              selection:
                state.selection?.type === "segment" ? null : state.selection,
            };
          }),

        // Import from AlignedEvent[] format (from .zoom.json)
        importFromEvents: (videoId, events) => {
          const zooms: TimelineZoom[] = [];
          const highlights: TimelineHighlight[] = [];

          for (const event of events) {
            if (event.type === "zoom") {
              zooms.push({
                id: nanoid(8),
                type: event.style,
                startMs: event.timestampMs,
                durationMs: event.durationMs,
              });
            } else if (event.type === "highlight") {
              highlights.push({
                id: nanoid(8),
                wordIndex: -1, // Will need to be resolved against captions
                word: event.word,
                startMs: event.startMs,
                endMs: event.endMs,
              });
            }
          }

          set((state) => {
            const existingTimeline = state.timelines[videoId];
            return {
              timelines: {
                ...state.timelines,
                [videoId]: {
                  videoId,
                  zooms: zooms.sort((a, b) => a.startMs - b.startMs),
                  highlights: highlights.sort((a, b) => a.startMs - b.startMs),
                  // Preserve existing segments/silences
                  segments: existingTimeline?.segments || [],
                  silences: existingTimeline?.silences || [],
                },
              },
            };
          });
        },

        // Export to AlignedEvent[] format (for .zoom.json)
        exportToEvents: (videoId) => {
          const timeline = get().timelines[videoId];
          if (!timeline) return [];

          const events: AlignedEvent[] = [];

          for (const zoom of timeline.zooms) {
            events.push({
              type: "zoom",
              style: zoom.type,
              timestampMs: zoom.startMs,
              durationMs: zoom.durationMs,
              confidence: 1, // Manual edits have full confidence
            } satisfies ZoomEvent);
          }

          for (const highlight of timeline.highlights) {
            events.push({
              type: "highlight",
              word: highlight.word,
              startMs: highlight.startMs,
              endMs: highlight.endMs,
              confidence: 1,
            } satisfies HighlightEvent);
          }

          // Sort by timestamp
          return events.sort((a, b) => {
            const timeA = a.type === "zoom" ? a.timestampMs : a.startMs;
            const timeB = b.type === "zoom" ? b.timestampMs : b.startMs;
            return timeA - timeB;
          });
        },

        // Helper
        getTimeline: (videoId) => {
          return get().timelines[videoId] || createEmptyTimeline(videoId);
        },
      }),
      {
        name: "reelforge-timeline",
        // Only persist timelines data, not transient view state
        partialize: (state) => ({
          timelines: state.timelines,
        }),
      }
    ),
    {
      // Undo/redo config - only track editable content changes
      limit: 50,
      partialize: (state) => ({
        timelines: state.timelines,
      }),
      equality: (pastState, currentState) =>
        JSON.stringify(pastState) === JSON.stringify(currentState),
    }
  )
);

// Temporal store hook for undo/redo (reactive)
export const useTimelineTemporalStore = <T>(
  selector: (state: TemporalState<Pick<TimelineStore, "timelines">>) => T
) => useStoreWithEqualityFn(useTimelineStore.temporal, selector);

// Convenience hooks for undo/redo
export const useTimelineUndo = () => useTimelineTemporalStore((state) => state.undo);
export const useTimelineRedo = () => useTimelineTemporalStore((state) => state.redo);
export const useTimelineCanUndo = () =>
  useTimelineTemporalStore((state) => state.pastStates.length > 0);
export const useTimelineCanRedo = () =>
  useTimelineTemporalStore((state) => state.futureStates.length > 0);
export const useTimelineClearHistory = () =>
  useTimelineTemporalStore((state) => state.clear);

// Selector helpers
export const usePlayhead = () => useTimelineStore((state) => state.playheadMs);
export const useIsPlaying = () => useTimelineStore((state) => state.isPlaying);
export const useTimelineZoomLevel = () => useTimelineStore((state) => state.zoomLevel);
export const useViewportStart = () => useTimelineStore((state) => state.viewportStartMs);
export const useTimelineSelection = () => useTimelineStore((state) => state.selection);
export const useActiveVideoId = () => useTimelineStore((state) => state.activeVideoId);

// Stable empty values to avoid creating new references on each render
const EMPTY_TIMELINE: TimelineState = {
  videoId: "",
  zooms: [],
  highlights: [],
  segments: [],
  silences: [],
};
const EMPTY_ZOOMS: TimelineZoom[] = [];
const EMPTY_HIGHLIGHTS: TimelineHighlight[] = [];
const EMPTY_SEGMENTS: TimelineSegment[] = [];
const EMPTY_SILENCES: SilenceRange[] = [];

export const useVideoTimeline = (videoId: string) =>
  useStoreWithEqualityFn(
    useTimelineStore,
    (state) => state.timelines[videoId] || EMPTY_TIMELINE,
    shallow
  );

export const useVideoZooms = (videoId: string) =>
  useStoreWithEqualityFn(
    useTimelineStore,
    (state) => state.timelines[videoId]?.zooms || EMPTY_ZOOMS,
    shallow
  );

export const useVideoHighlights = (videoId: string) =>
  useStoreWithEqualityFn(
    useTimelineStore,
    (state) => state.timelines[videoId]?.highlights || EMPTY_HIGHLIGHTS,
    shallow
  );

export const useVideoSegments = (videoId: string) =>
  useStoreWithEqualityFn(
    useTimelineStore,
    (state) => state.timelines[videoId]?.segments || EMPTY_SEGMENTS,
    shallow
  );

export const useVideoSilences = (videoId: string) =>
  useStoreWithEqualityFn(
    useTimelineStore,
    (state) => state.timelines[videoId]?.silences || EMPTY_SILENCES,
    shallow
  );

// Actions hooks (stable references)
export const useTimelineActions = () =>
  useStoreWithEqualityFn(
    useTimelineStore,
    (state) => ({
      setPlayhead: state.setPlayhead,
      play: state.play,
      pause: state.pause,
      togglePlayback: state.togglePlayback,
      setZoomLevel: state.setZoomLevel,
      scrollTo: state.scrollTo,
      zoomIn: state.zoomIn,
      zoomOut: state.zoomOut,
      fitToView: state.fitToView,
      setActiveVideo: state.setActiveVideo,
      addZoom: state.addZoom,
      updateZoom: state.updateZoom,
      deleteZoom: state.deleteZoom,
      moveZoom: state.moveZoom,
      addHighlight: state.addHighlight,
      updateHighlight: state.updateHighlight,
      deleteHighlight: state.deleteHighlight,
      select: state.select,
      clearSelection: state.clearSelection,
      deleteSelected: state.deleteSelected,
      importSilences: state.importSilences,
      importSemanticSegments: state.importSemanticSegments,
      importPreselectedSegments: state.importPreselectedSegments,
      toggleSegment: state.toggleSegment,
      resizeSegment: state.resizeSegment,
      addSegment: state.addSegment,
      deleteSegment: state.deleteSegment,
      clearTimeline: state.clearTimeline,
      clearSegments: state.clearSegments,
      importFromEvents: state.importFromEvents,
      exportToEvents: state.exportToEvents,
      getTimeline: state.getTimeline,
    }),
    shallow
  );
