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

interface EditorTrackRowProps {
  track: Track;
  zoom: number;
  scrollX: number;
  viewportWidth: number;
  selection: EditorSelection;
  onSelectItem: (itemId: string, trackId: string) => void;
  onItemDoubleClick: (itemId: string, trackId: string) => void;
  onDropMedia?: (trackId: string, mediaData: MediaDropData, framePosition: number) => void;
}

export function EditorTrackRow({
  track,
  zoom,
  scrollX,
  viewportWidth,
  selection,
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

  const pxPerFrame = getPxPerFrame(zoom);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (track.locked) return;
      if (!e.dataTransfer.types.includes(EDITOR_MEDIA_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsNativeDragOver(true);
    },
    [track.locked]
  );

  const handleDragLeave = useCallback(() => {
    setIsNativeDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      setIsNativeDragOver(false);
      if (track.locked) return;

      const raw = e.dataTransfer.getData(EDITOR_MEDIA_MIME);
      if (!raw) return;
      e.preventDefault();

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
    </div>
  );
}
