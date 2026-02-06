import { useCallback, useRef } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { Track, EditorSelection } from "@/types/editor";
import { EditorTimelineRuler } from "./EditorTimelineRuler";
import { EditorTimelinePlayhead } from "./EditorTimelinePlayhead";
import { EditorTrackHeader } from "./EditorTrackHeader";
import { EditorTrackRow, type MediaDropData } from "./EditorTrackRow";
import { EditorTimelineToolbar } from "./EditorTimelineToolbar";
import { TRACK_HEADER_WIDTH, getPxPerFrame } from "./constants";

interface EditorTimelineProps {
  tracks: Track[];
  fps: number;
  durationInFrames: number;
  currentFrame: number;
  isPlaying: boolean;
  zoom: number;
  scrollX: number;
  scrollY: number;
  selection: EditorSelection;
  canUndo: boolean;
  canRedo: boolean;
  onTogglePlayback: () => void;
  onSeek: (frame: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onScrollX: (px: number) => void;
  onScrollY: (px: number) => void;
  onSelectItem: (itemId: string, trackId: string) => void;
  onSelectTrack: (trackId: string) => void;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
  onSplitAtPlayhead: () => void;
  onMoveItem: (fromTrackId: string, toTrackId: string, itemId: string, newFrom: number) => void;
  onUpdateTrack: (trackId: string, updates: Partial<Pick<Track, "name" | "locked" | "visible" | "volume">>) => void;
  onAddTrack: () => void;
  onItemDoubleClick: (itemId: string, trackId: string) => void;
  onDropMedia?: (trackId: string, mediaData: MediaDropData, framePosition: number) => void;
}

export function EditorTimeline({
  tracks,
  fps,
  durationInFrames,
  currentFrame,
  isPlaying,
  zoom,
  scrollX,
  scrollY,
  selection,
  canUndo,
  canRedo,
  onTogglePlayback,
  onSeek,
  onZoomIn,
  onZoomOut,
  onUndo,
  onRedo,
  onScrollX,
  onScrollY,
  onSelectItem,
  onSelectTrack,
  onClearSelection,
  onDeleteSelected,
  onSplitAtPlayhead,
  onMoveItem,
  onUpdateTrack,
  onAddTrack,
  onItemDoubleClick,
  onDropMedia,
}: EditorTimelineProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const headersRef = useRef<HTMLDivElement>(null);

  const pxPerFrame = getPxPerFrame(zoom);
  const contentWidth = durationInFrames * pxPerFrame;
  const viewportWidth = contentRef.current?.clientWidth ?? 800;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over, delta } = event;
      if (!over) return;

      const itemData = active.data.current;
      if (!itemData || itemData.type !== "timeline-item") return;

      const overData = over.data.current;
      if (!overData || overData.type !== "track") return;

      const deltaFrames = Math.round(delta.x / pxPerFrame);
      const newFrom = Math.max(0, itemData.item.from + deltaFrames);

      onMoveItem(
        itemData.item.trackId,
        overData.trackId,
        itemData.item.id,
        newFrom
      );
    },
    [pxPerFrame, onMoveItem]
  );

  const handleContentScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      onScrollX(target.scrollLeft);

      // Sync vertical scroll to headers
      if (headersRef.current) {
        headersRef.current.scrollTop = target.scrollTop;
      }
    },
    [onScrollX]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY > 0) onZoomOut();
        else onZoomIn();
      }
    },
    [onZoomIn, onZoomOut]
  );

  const hasSelection = selection !== null;

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background border-t">
      {/* Toolbar */}
      <EditorTimelineToolbar
        isPlaying={isPlaying}
        currentFrame={currentFrame}
        fps={fps}
        canUndo={canUndo}
        canRedo={canRedo}
        hasSelection={hasSelection}
        onTogglePlayback={onTogglePlayback}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onUndo={onUndo}
        onRedo={onRedo}
        onSplit={onSplitAtPlayhead}
        onDelete={onDeleteSelected}
        onAddTrack={onAddTrack}
      />

      {/* Ruler */}
      <EditorTimelineRuler
        durationInFrames={durationInFrames}
        fps={fps}
        zoom={zoom}
        scrollX={scrollX}
        viewportWidth={viewportWidth}
        onSeek={onSeek}
      />

      {/* Timeline body */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Track headers (fixed left) */}
        <div
          ref={headersRef}
          className="overflow-hidden flex-shrink-0"
          style={{ width: TRACK_HEADER_WIDTH }}
        >
          {tracks.map((track) => (
            <EditorTrackHeader
              key={track.id}
              track={track}
              selected={
                selection?.type === "track" && selection.trackId === track.id
              }
              onSelect={() => onSelectTrack(track.id)}
              onUpdate={(updates) => onUpdateTrack(track.id, updates)}
            />
          ))}
        </div>

        {/* Track content (scrollable) */}
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div
            ref={contentRef}
            className="flex-1 overflow-auto relative"
            onScroll={handleContentScroll}
            onWheel={handleWheel}
            onClick={onClearSelection}
          >
            <div style={{ width: contentWidth, minWidth: "100%" }}>
              {tracks.map((track) => (
                <EditorTrackRow
                  key={track.id}
                  track={track}
                  zoom={zoom}
                  scrollX={scrollX}
                  viewportWidth={viewportWidth}
                  selection={selection}
                  onSelectItem={onSelectItem}
                  onItemDoubleClick={onItemDoubleClick}
                  onDropMedia={onDropMedia}
                />
              ))}
            </div>

            {/* Playhead overlay */}
            <EditorTimelinePlayhead
              currentFrame={currentFrame}
              zoom={zoom}
              scrollX={scrollX}
              viewportWidth={viewportWidth}
            />
          </div>
        </DndContext>
      </div>
    </div>
  );
}
