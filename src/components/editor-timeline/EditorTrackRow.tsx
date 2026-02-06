import { useState, useCallback, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { Track, EditorSelection } from "@/types/editor";
import { TimelineItemBlock } from "./TimelineItemBlock";
import { getPxPerFrame } from "./constants";

const EDITOR_MEDIA_MIME = "application/x-editor-media";

export interface MediaDropData {
  type: string;
  src: string;
  name: string;
}

export interface DragGhostData {
  targetTrackId: string;
  newFrom: number;
  durationInFrames: number;
  itemType: string;
}

interface EditorTrackRowProps {
  track: Track;
  zoom: number;
  scrollX: number;
  viewportWidth: number;
  fps: number;
  selection: EditorSelection;
  dragGhost: DragGhostData | null;
  onSelectItem: (itemId: string, trackId: string) => void;
  onItemDoubleClick: (itemId: string, trackId: string) => void;
  onDropMedia?: (trackId: string, mediaData: MediaDropData, framePosition: number) => void;
}

export function EditorTrackRow({
  track,
  zoom,
  scrollX,
  viewportWidth,
  fps,
  selection,
  dragGhost,
  onSelectItem,
  onItemDoubleClick,
  onDropMedia,
}: EditorTrackRowProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `track-${track.id}`,
    data: { trackId: track.id, type: "track" },
  });

  const rowRef = useRef<HTMLDivElement>(null);
  const [isNativeDragOver, setIsNativeDragOver] = useState(false);
  const [dragHoverFrame, setDragHoverFrame] = useState<number | null>(null);

  const pxPerFrame = getPxPerFrame(zoom);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (track.locked) return;
      if (!e.dataTransfer.types.includes(EDITOR_MEDIA_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsNativeDragOver(true);

      const rect = rowRef.current?.getBoundingClientRect();
      if (rect) {
        const xInContent = e.clientX - rect.left + scrollX;
        setDragHoverFrame(Math.max(0, Math.round(xInContent / pxPerFrame)));
      }
    },
    [track.locked, scrollX, pxPerFrame]
  );

  const handleDragLeave = useCallback(() => {
    setIsNativeDragOver(false);
    setDragHoverFrame(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      setIsNativeDragOver(false);
      setDragHoverFrame(null);
      if (track.locked) return;

      const raw = e.dataTransfer.getData(EDITOR_MEDIA_MIME);
      if (!raw) return;
      e.preventDefault();
      e.stopPropagation();

      const mediaData: MediaDropData = JSON.parse(raw);
      const rect = rowRef.current?.getBoundingClientRect();
      if (!rect) return;

      const xInContent = e.clientX - rect.left + scrollX;
      const framePosition = Math.max(0, Math.round(xInContent / pxPerFrame));

      onDropMedia?.(track.id, mediaData, framePosition);
    },
    [track.locked, track.id, scrollX, pxPerFrame, onDropMedia]
  );

  // Merge refs: dnd-kit droppable + our local ref
  const mergeRefs = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      (rowRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [setNodeRef]
  );

  return (
    <div
      ref={mergeRefs}
      className={cn(
        "relative border-b",
        (isOver || isNativeDragOver) && "bg-primary/5",
        isNativeDragOver && "border-dashed border-primary",
        !track.visible && "opacity-40",
        track.locked && "pointer-events-none opacity-70"
      )}
      style={{ height: track.height }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {track.items.map((item) => {
        const x = item.from * pxPerFrame - scrollX;
        const width = item.durationInFrames * pxPerFrame;

        // Viewport culling
        if (x + width < -50 || x > viewportWidth + 50) return null;

        const isSelected =
          selection?.type === "item" &&
          selection.itemId === item.id &&
          selection.trackId === track.id;

        return (
          <TimelineItemBlock
            key={item.id}
            item={item}
            x={x}
            width={width}
            height={track.height - 4}
            selected={isSelected}
            onSelect={() => onSelectItem(item.id, track.id)}
            onDoubleClick={() => onItemDoubleClick(item.id, track.id)}
          />
        );
      })}

      {/* Ghost preview — media drop from browser */}
      {dragHoverFrame !== null && (
        <div
          className="absolute top-0.5 bottom-0.5 pointer-events-none bg-primary/20 border border-dashed border-primary/60 rounded"
          style={{
            left: dragHoverFrame * pxPerFrame - scrollX,
            width: 5 * fps * pxPerFrame,
          }}
        />
      )}

      {/* Ghost preview — item move within timeline */}
      {dragGhost && (
        <div
          className="absolute top-0.5 bottom-0.5 pointer-events-none bg-primary/25 border-2 border-dashed border-primary/70 rounded"
          style={{
            left: dragGhost.newFrom * pxPerFrame - scrollX,
            width: Math.max(dragGhost.durationInFrames * pxPerFrame, 20),
          }}
        />
      )}
    </div>
  );
}
