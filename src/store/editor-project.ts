import { create } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { persist } from "zustand/middleware";
import { temporal, type TemporalState } from "zundo";
import { shallow } from "zustand/shallow";
import { nanoid } from "nanoid";
import type {
  EditorProject,
  EditorSelection,
  Track,
  TrackType,
  TimelineItem,
  VideoItem,
  AudioItem,
} from "@/types/editor";
import {
  createProject,
  createTrack,
  createVideoItem,
  createAudioItem,
  createTextItem,
  createImageItem,
  createSolidItem,
} from "@/types/editor";

// ─── Store Interface ─────────────────────────────────────────────────

interface EditorProjectStore {
  // Persisted + undoable
  project: EditorProject;

  // Transient state (not persisted, not undoable)
  currentFrame: number;
  isPlaying: boolean;
  playbackRate: number;
  timelineZoom: number; // 1 = default
  timelineScrollX: number; // px
  timelineScrollY: number; // px
  selection: EditorSelection;

  // ─── Track CRUD ──────────────────────────────────────────────────
  addTrack: (name: string, type: TrackType) => string;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Omit<Track, "id" | "items">>) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;

  // ─── Item CRUD ───────────────────────────────────────────────────
  addItem: (trackId: string, item: TimelineItem) => void;
  removeItem: (trackId: string, itemId: string) => void;
  updateItem: <T extends TimelineItem>(
    trackId: string,
    itemId: string,
    updates: Partial<Omit<T, "id" | "type" | "trackId">>
  ) => void;
  moveItem: (
    fromTrackId: string,
    toTrackId: string,
    itemId: string,
    newFrom: number
  ) => void;
  resizeItem: (
    trackId: string,
    itemId: string,
    newFrom: number,
    newDuration: number
  ) => void;
  splitItem: (trackId: string, itemId: string, splitAtFrame: number) => string | null;
  duplicateItem: (trackId: string, itemId: string) => string | null;

  // ─── Selection ───────────────────────────────────────────────────
  select: (selection: EditorSelection) => void;
  clearSelection: () => void;
  deleteSelected: () => void;

  // ─── Playback ────────────────────────────────────────────────────
  setCurrentFrame: (frame: number) => void;
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  cyclePlaybackRate: () => void;

  // ─── Timeline View ──────────────────────────────────────────────
  setTimelineZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setTimelineScrollX: (px: number) => void;
  setTimelineScrollY: (px: number) => void;

  // ─── Project Settings ───────────────────────────────────────────
  updateProjectSettings: (updates: Partial<Pick<EditorProject, "name" | "fps" | "width" | "height">>) => void;

  // ─── Helpers ─────────────────────────────────────────────────────
  getTrack: (trackId: string) => Track | undefined;
  getItem: (trackId: string, itemId: string) => TimelineItem | undefined;
  findItemGlobal: (itemId: string) => { item: TimelineItem; track: Track } | undefined;
  getProjectDuration: () => number;

  // ─── Quick Add Helpers ──────────────────────────────────────────
  addVideoItem: (trackId: string, src: string, from: number, durationInFrames: number) => string;
  addAudioItem: (trackId: string, src: string, from: number, durationInFrames: number) => string;
  addTextItem: (trackId: string, text: string, from: number, durationInFrames: number) => string;
  addImageItem: (trackId: string, src: string, from: number, durationInFrames: number) => string;
  addSolidItem: (trackId: string, color: string, from: number, durationInFrames: number) => string;
}

// ─── Constants ───────────────────────────────────────────────────────

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const ZOOM_FACTOR = 1.3;
const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 2.5, 3] as const;

// ─── Store ───────────────────────────────────────────────────────────

export const useEditorProjectStore = create<EditorProjectStore>()(
  temporal(
    persist(
      (set, get) => ({
        // Initial state
        project: (() => {
          const p = createProject(nanoid(8), "Untitled Project");
          p.tracks = [createTrack(nanoid(8), "Track 1", "video")];
          return p;
        })(),
        currentFrame: 0,
        isPlaying: false,
        playbackRate: 1,
        timelineZoom: 1,
        timelineScrollX: 0,
        timelineScrollY: 0,
        selection: null,

        // ─── Track CRUD ────────────────────────────────────────────

        addTrack: (name, type) => {
          const id = nanoid(8);
          set((state) => ({
            project: {
              ...state.project,
              tracks: [...state.project.tracks, createTrack(id, name, type)],
            },
          }));
          return id;
        },

        removeTrack: (trackId) =>
          set((state) => ({
            project: {
              ...state.project,
              tracks: state.project.tracks.filter((t) => t.id !== trackId),
            },
            selection:
              state.selection?.type === "track" && state.selection.trackId === trackId
                ? null
                : state.selection?.type === "item" && state.selection.trackId === trackId
                  ? null
                  : state.selection,
          })),

        updateTrack: (trackId, updates) =>
          set((state) => ({
            project: {
              ...state.project,
              tracks: state.project.tracks.map((t) =>
                t.id === trackId ? { ...t, ...updates } : t
              ),
            },
          })),

        reorderTracks: (fromIndex, toIndex) =>
          set((state) => {
            const tracks = [...state.project.tracks];
            const [moved] = tracks.splice(fromIndex, 1);
            tracks.splice(toIndex, 0, moved);
            return { project: { ...state.project, tracks } };
          }),

        // ─── Item CRUD ─────────────────────────────────────────────

        addItem: (trackId, item) =>
          set((state) => ({
            project: {
              ...state.project,
              tracks: state.project.tracks.map((t) =>
                t.id === trackId
                  ? { ...t, items: [...t.items, item].sort((a, b) => a.from - b.from) }
                  : t
              ),
            },
            selection: { type: "item", itemId: item.id, trackId },
          })),

        removeItem: (trackId, itemId) =>
          set((state) => ({
            project: {
              ...state.project,
              tracks: state.project.tracks.map((t) =>
                t.id === trackId
                  ? { ...t, items: t.items.filter((i) => i.id !== itemId) }
                  : t
              ),
            },
            selection:
              state.selection?.type === "item" && state.selection.itemId === itemId
                ? null
                : state.selection,
          })),

        updateItem: (trackId, itemId, updates) =>
          set((state) => ({
            project: {
              ...state.project,
              tracks: state.project.tracks.map((t) =>
                t.id === trackId
                  ? {
                      ...t,
                      items: t.items.map((i) =>
                        i.id === itemId ? { ...i, ...updates } : i
                      ),
                    }
                  : t
              ),
            },
          })),

        moveItem: (fromTrackId, toTrackId, itemId, newFrom) =>
          set((state) => {
            let movedItem: TimelineItem | undefined;
            const tracks = state.project.tracks.map((t) => {
              if (t.id === fromTrackId) {
                const item = t.items.find((i) => i.id === itemId);
                if (item) {
                  movedItem = { ...item, from: Math.max(0, newFrom), trackId: toTrackId };
                }
                return { ...t, items: t.items.filter((i) => i.id !== itemId) };
              }
              return t;
            });

            if (!movedItem) return state;

            return {
              project: {
                ...state.project,
                tracks: tracks.map((t) =>
                  t.id === toTrackId
                    ? { ...t, items: [...t.items, movedItem!].sort((a, b) => a.from - b.from) }
                    : t
                ),
              },
              selection: { type: "item", itemId, trackId: toTrackId },
            };
          }),

        resizeItem: (trackId, itemId, newFrom, newDuration) =>
          set((state) => ({
            project: {
              ...state.project,
              tracks: state.project.tracks.map((t) =>
                t.id === trackId
                  ? {
                      ...t,
                      items: t.items.map((i) =>
                        i.id === itemId
                          ? {
                              ...i,
                              from: Math.max(0, newFrom),
                              durationInFrames: Math.max(1, newDuration),
                            }
                          : i
                      ),
                    }
                  : t
              ),
            },
          })),

        splitItem: (trackId, itemId, splitAtFrame) => {
          const state = get();
          const track = state.project.tracks.find((t) => t.id === trackId);
          if (!track) return null;

          const item = track.items.find((i) => i.id === itemId);
          if (!item) return null;

          const localSplitFrame = splitAtFrame - item.from;
          if (localSplitFrame <= 0 || localSplitFrame >= item.durationInFrames) return null;

          const leftId = `${itemId}-a`;
          const rightId = `${itemId}-b`;

          const leftItem: TimelineItem = {
            ...item,
            id: leftId,
            durationInFrames: localSplitFrame,
          };

          const rightItem: TimelineItem = {
            ...item,
            id: rightId,
            from: splitAtFrame,
            durationInFrames: item.durationInFrames - localSplitFrame,
            name: `${item.name} (2)`,
          };

          // Adjust trim for video/audio items
          if (
            (leftItem.type === "video" || leftItem.type === "audio") &&
            (rightItem.type === "video" || rightItem.type === "audio")
          ) {
            (rightItem as VideoItem | AudioItem).trimStartFrame =
              (item as VideoItem | AudioItem).trimStartFrame + localSplitFrame;
          }

          set((state) => ({
            project: {
              ...state.project,
              tracks: state.project.tracks.map((t) =>
                t.id === trackId
                  ? {
                      ...t,
                      items: t.items
                        .flatMap((i) => (i.id === itemId ? [leftItem, rightItem] : [i]))
                        .sort((a, b) => a.from - b.from),
                    }
                  : t
              ),
            },
            selection: { type: "item", itemId: rightId, trackId },
          }));

          return rightId;
        },

        duplicateItem: (trackId, itemId) => {
          const state = get();
          const track = state.project.tracks.find((t) => t.id === trackId);
          if (!track) return null;

          const item = track.items.find((i) => i.id === itemId);
          if (!item) return null;

          const newId = nanoid(8);
          const duplicate: TimelineItem = {
            ...item,
            id: newId,
            name: `${item.name} (copy)`,
            from: item.from + item.durationInFrames,
          };

          set((state) => ({
            project: {
              ...state.project,
              tracks: state.project.tracks.map((t) =>
                t.id === trackId
                  ? {
                      ...t,
                      items: [...t.items, duplicate].sort((a, b) => a.from - b.from),
                    }
                  : t
              ),
            },
            selection: { type: "item", itemId: newId, trackId },
          }));

          return newId;
        },

        // ─── Selection ─────────────────────────────────────────────

        select: (selection) => set({ selection }),
        clearSelection: () => set({ selection: null }),

        deleteSelected: () => {
          const { selection } = get();
          if (!selection) return;

          if (selection.type === "item") {
            get().removeItem(selection.trackId, selection.itemId);
          } else if (selection.type === "track") {
            get().removeTrack(selection.trackId);
          }
        },

        // ─── Playback ─────────────────────────────────────────────

        setCurrentFrame: (frame) => set({ currentFrame: Math.max(0, frame) }),
        play: () => set({ isPlaying: true }),
        pause: () => set({ isPlaying: false }),
        togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),
        cyclePlaybackRate: () =>
          set((state) => {
            const idx = PLAYBACK_RATES.indexOf(state.playbackRate as typeof PLAYBACK_RATES[number]);
            return { playbackRate: PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length] };
          }),

        // ─── Timeline View ─────────────────────────────────────────

        setTimelineZoom: (zoom) =>
          set({ timelineZoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) }),
        zoomIn: () =>
          set((state) => ({
            timelineZoom: Math.min(MAX_ZOOM, state.timelineZoom * ZOOM_FACTOR),
          })),
        zoomOut: () =>
          set((state) => ({
            timelineZoom: Math.max(MIN_ZOOM, state.timelineZoom / ZOOM_FACTOR),
          })),
        setTimelineScrollX: (px) => set({ timelineScrollX: Math.max(0, px) }),
        setTimelineScrollY: (px) => set({ timelineScrollY: Math.max(0, px) }),

        // ─── Project Settings ──────────────────────────────────────

        updateProjectSettings: (updates) =>
          set((state) => ({
            project: { ...state.project, ...updates },
          })),

        // ─── Helpers ───────────────────────────────────────────────

        getTrack: (trackId) =>
          get().project.tracks.find((t) => t.id === trackId),

        getItem: (trackId, itemId) =>
          get()
            .project.tracks.find((t) => t.id === trackId)
            ?.items.find((i) => i.id === itemId),

        findItemGlobal: (itemId) => {
          for (const track of get().project.tracks) {
            const item = track.items.find((i) => i.id === itemId);
            if (item) return { item, track };
          }
          return undefined;
        },

        getProjectDuration: () => {
          const { project } = get();
          let maxFrame = project.durationInFrames;
          for (const track of project.tracks) {
            for (const item of track.items) {
              const end = item.from + item.durationInFrames;
              if (end > maxFrame) maxFrame = end;
            }
          }
          return maxFrame;
        },

        // ─── Quick Add Helpers ─────────────────────────────────────

        addVideoItem: (trackId, src, from, durationInFrames) => {
          const id = nanoid(8);
          get().addItem(trackId, createVideoItem(id, trackId, src, from, durationInFrames));
          return id;
        },

        addAudioItem: (trackId, src, from, durationInFrames) => {
          const id = nanoid(8);
          get().addItem(trackId, createAudioItem(id, trackId, src, from, durationInFrames));
          return id;
        },

        addTextItem: (trackId, text, from, durationInFrames) => {
          const id = nanoid(8);
          get().addItem(trackId, createTextItem(id, trackId, text, from, durationInFrames));
          return id;
        },

        addImageItem: (trackId, src, from, durationInFrames) => {
          const id = nanoid(8);
          get().addItem(trackId, createImageItem(id, trackId, src, from, durationInFrames));
          return id;
        },

        addSolidItem: (trackId, color, from, durationInFrames) => {
          const id = nanoid(8);
          get().addItem(trackId, createSolidItem(id, trackId, color, from, durationInFrames));
          return id;
        },
      }),
      {
        name: "reelforge-editor-project",
        partialize: (state) => ({
          project: state.project,
        }),
      }
    ),
    {
      limit: 50,
      partialize: (state) => ({
        project: state.project,
      }),
      equality: (pastState, currentState) =>
        JSON.stringify(pastState) === JSON.stringify(currentState),
    }
  )
);

// ─── Temporal Store (Undo/Redo) ──────────────────────────────────────

export const useEditorTemporalStore = <T>(
  selector: (state: TemporalState<Pick<EditorProjectStore, "project">>) => T
) => useStoreWithEqualityFn(useEditorProjectStore.temporal, selector);

export const useEditorUndo = () => useEditorTemporalStore((state) => state.undo);
export const useEditorRedo = () => useEditorTemporalStore((state) => state.redo);
export const useEditorCanUndo = () =>
  useEditorTemporalStore((state) => state.pastStates.length > 0);
export const useEditorCanRedo = () =>
  useEditorTemporalStore((state) => state.futureStates.length > 0);

// ─── Selector Hooks ──────────────────────────────────────────────────

const EMPTY_TRACKS: Track[] = [];

export const useCurrentFrame = () =>
  useEditorProjectStore((state) => state.currentFrame);

export const useIsEditorPlaying = () =>
  useEditorProjectStore((state) => state.isPlaying);

export const usePlaybackRate = () =>
  useEditorProjectStore((state) => state.playbackRate);

export const useEditorProject = () =>
  useStoreWithEqualityFn(
    useEditorProjectStore,
    (state) => state.project,
    shallow
  );

export const useTracks = () =>
  useStoreWithEqualityFn(
    useEditorProjectStore,
    (state) => state.project.tracks ?? EMPTY_TRACKS,
    shallow
  );

export const useEditorSelection = () =>
  useEditorProjectStore((state) => state.selection);

export const useTimelineZoom = () =>
  useEditorProjectStore((state) => state.timelineZoom);

export const useSelectedItem = () =>
  useStoreWithEqualityFn(
    useEditorProjectStore,
    (state) => {
      if (state.selection?.type !== "item") return null;
      const result = state.findItemGlobal(state.selection.itemId);
      return result?.item ?? null;
    },
    shallow
  );

export const useEditorActions = () =>
  useStoreWithEqualityFn(
    useEditorProjectStore,
    (state) => ({
      addTrack: state.addTrack,
      removeTrack: state.removeTrack,
      updateTrack: state.updateTrack,
      reorderTracks: state.reorderTracks,
      addItem: state.addItem,
      removeItem: state.removeItem,
      updateItem: state.updateItem,
      moveItem: state.moveItem,
      resizeItem: state.resizeItem,
      splitItem: state.splitItem,
      duplicateItem: state.duplicateItem,
      select: state.select,
      clearSelection: state.clearSelection,
      deleteSelected: state.deleteSelected,
      setCurrentFrame: state.setCurrentFrame,
      play: state.play,
      pause: state.pause,
      togglePlayback: state.togglePlayback,
      cyclePlaybackRate: state.cyclePlaybackRate,
      setTimelineZoom: state.setTimelineZoom,
      zoomIn: state.zoomIn,
      zoomOut: state.zoomOut,
      setTimelineScrollX: state.setTimelineScrollX,
      setTimelineScrollY: state.setTimelineScrollY,
      updateProjectSettings: state.updateProjectSettings,
      getTrack: state.getTrack,
      getItem: state.getItem,
      findItemGlobal: state.findItemGlobal,
      getProjectDuration: state.getProjectDuration,
      addVideoItem: state.addVideoItem,
      addAudioItem: state.addAudioItem,
      addTextItem: state.addTextItem,
      addImageItem: state.addImageItem,
      addSolidItem: state.addSolidItem,
    }),
    shallow
  );
