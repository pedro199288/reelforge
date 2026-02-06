import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { Track, EditorSelection } from "@/types/editor";
import { TimelineItemBlock } from "./TimelineItemBlock";
import { getPxPerFrame } from "./constants";

interface EditorTrackRowProps {
  track: Track;
  zoom: number;
  scrollX: number;
  viewportWidth: number;
  selection: EditorSelection;
  onSelectItem: (itemId: string, trackId: string) => void;
  onItemDoubleClick: (itemId: string, trackId: string) => void;
}

export function EditorTrackRow({
  track,
  zoom,
  scrollX,
  viewportWidth,
  selection,
  onSelectItem,
  onItemDoubleClick,
}: EditorTrackRowProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `track-${track.id}`,
    data: { trackId: track.id, type: "track" },
  });

  const pxPerFrame = getPxPerFrame(zoom);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative border-b",
        isOver && "bg-primary/5",
        !track.visible && "opacity-40",
        track.locked && "pointer-events-none opacity-70"
      )}
      style={{ height: track.height }}
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
