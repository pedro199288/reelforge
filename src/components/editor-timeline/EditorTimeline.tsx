import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { TimelineItem } from "@/types/editor";
import { cn } from "@/lib/utils";
import type { Track, EditorSelection } from "@/types/editor";
import { EditorTimelineRuler } from "./EditorTimelineRuler";
import { EditorTimelinePlayhead } from "./EditorTimelinePlayhead";
import { EditorTrackHeader } from "./EditorTrackHeader";
import { EditorTrackRow, type MediaDropData } from "./EditorTrackRow";
import { EditorTimelineToolbar } from "./EditorTimelineToolbar";
import { TRACK_HEADER_WIDTH, MIN_ZOOM, MAX_ZOOM, getPxPerFrame } from "./constants";

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
  onSetZoom: (zoom: number) => void;
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
  onDropMediaNewTrack?: (mediaData: MediaDropData, framePosition: number) => void;
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
  onSetZoom,
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
  onDropMediaNewTrack,
}: EditorTimelineProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const headersRef = useRef<HTMLDivElement>(null);

  const pxPerFrame = getPxPerFrame(zoom);
  const contentWidth = durationInFrames * pxPerFrame;
  const viewportWidth = contentRef.current?.clientWidth ?? 800;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // ─── Drag ghost state for item move preview ──────────────────────
  const [dragGhost, setDragGhost] = useState<{
    targetTrackId: string;
    newFrom: number;
    durationInFrames: number;
    itemType: string;
  } | null>(null);

  const handleDragStart = useCallback((_event: DragStartEvent) => {
    // Ghost will be set on first move
  }, []);

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const { active, over, delta } = event;
      const itemData = active.data.current;
      if (!itemData || itemData.type !== "timeline-item") return;

      const item = itemData.item as TimelineItem;
      const deltaFrames = Math.round(delta.x / pxPerFrame);
      const newFrom = Math.max(0, item.from + deltaFrames);

      const overData = over?.data.current;
      const targetTrackId = overData?.type === "track" ? overData.trackId : item.trackId;

      setDragGhost({
        targetTrackId,
        newFrom,
        durationInFrames: item.durationInFrames,
        itemType: item.type,
      });
    },
    [pxPerFrame]
  );

  const clearDragGhost = useCallback(() => setDragGhost(null), []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDragGhost(null);
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

  // ─── Cursor-anchored zoom via native wheel listener ─────────────
  const zoomRef = useRef(zoom);
  const scrollXRef = useRef(scrollX);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { scrollXRef.current = scrollX; }, [scrollX]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaX !== 0 && !e.ctrlKey && !e.metaKey) {
        // Horizontal pan
        const newScrollX = Math.max(0, scrollXRef.current + e.deltaX);
        el.scrollLeft = newScrollX;
        onScrollX(newScrollX);
      } else if (e.deltaY !== 0) {
        // Cursor-anchored zoom
        const cur = zoomRef.current;
        const factor = e.deltaY > 0 ? 0.8 : 1.25;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cur * factor));
        if (newZoom === cur) return;
        const rect = el.getBoundingClientRect();
        const cursorPx = Math.max(0, e.clientX - rect.left);
        const oldPxPF = getPxPerFrame(cur);
        const cursorFrame = (scrollXRef.current + cursorPx) / oldPxPF;
        const newPxPF = getPxPerFrame(newZoom);
        const newScrollX = Math.max(0, cursorFrame * newPxPF - cursorPx);
        onSetZoom(newZoom);
        el.scrollLeft = newScrollX;
        onScrollX(newScrollX);
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [onScrollX, onSetZoom]);

  // Sync scrollLeft after zoom re-render
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollLeft = scrollX;
  }, [zoom, scrollX]);

  const EDITOR_MEDIA_MIME = "application/x-editor-media";
  const [isTimelineDragOver, setIsTimelineDragOver] = useState(false);

  const handleTimelineDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(EDITOR_MEDIA_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsTimelineDragOver(true);
    },
    []
  );

  const handleTimelineDragLeave = useCallback(
    (e: React.DragEvent) => {
      // Only clear if leaving the container itself (not entering a child)
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setIsTimelineDragOver(false);
    },
    []
  );

  const handleTimelineDrop = useCallback(
    (e: React.DragEvent) => {
      setIsTimelineDragOver(false);
      const raw = e.dataTransfer.getData(EDITOR_MEDIA_MIME);
      if (!raw) return;
      e.preventDefault();

      const mediaData: MediaDropData = JSON.parse(raw);
      const rect = contentRef.current?.getBoundingClientRect();
      if (!rect) return;

      const xInContent = e.clientX - rect.left + scrollX;
      const framePosition = Math.max(0, Math.round(xInContent / pxPerFrame));

      onDropMediaNewTrack?.(mediaData, framePosition);
    },
    [scrollX, pxPerFrame, onDropMediaNewTrack]
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
          {[...tracks].reverse().map((track) => (
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
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={clearDragGhost}
        >
          <div
            ref={contentRef}
            className={cn(
              "flex-1 overflow-auto relative overscroll-contain touch-none",
              isTimelineDragOver && "bg-primary/5"
            )}
            onScroll={handleContentScroll}
            onClick={onClearSelection}
            onDragOver={handleTimelineDragOver}
            onDragLeave={handleTimelineDragLeave}
            onDrop={handleTimelineDrop}
          >
            <div style={{ width: contentWidth, minWidth: "100%", position: "relative" }}>
              {tracks.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-sm text-muted-foreground border border-dashed border-muted-foreground/30 rounded m-2">
                  Arrastra media aquí para comenzar
                </div>
              ) : (
                [...tracks].reverse().map((track) => (
                  <EditorTrackRow
                    key={track.id}
                    track={track}
                    zoom={zoom}
                    scrollX={scrollX}
                    viewportWidth={viewportWidth}
                    fps={fps}
                    selection={selection}
                    dragGhost={
                      dragGhost?.targetTrackId === track.id ? dragGhost : null
                    }
                    onSelectItem={onSelectItem}
                    onItemDoubleClick={onItemDoubleClick}
                    onDropMedia={onDropMedia}
                  />
                ))
              )}

              {/* Playhead overlay — inside inner div so it scrolls with content */}
              <EditorTimelinePlayhead
                currentFrame={currentFrame}
                zoom={zoom}
                scrollX={scrollX}
                viewportWidth={viewportWidth}
              />
            </div>

            <DragOverlay dropAnimation={null} />
          </div>
        </DndContext>
      </div>
    </div>
  );
}
