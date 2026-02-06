import { useCallback, useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Video, Music, Type, Image, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineItem, TimelineItemType } from "@/types/editor";
import { TimelineItemWaveform } from "./TimelineItemWaveform";

interface TimelineItemBlockProps {
  item: TimelineItem;
  x: number;
  width: number;
  height: number;
  fps: number;
  selected: boolean;
  onSelect: () => void;
  onDoubleClick: () => void;
}

const ITEM_COLORS: Record<TimelineItemType, string> = {
  video: "bg-blue-500/20 border-blue-500/50 hover:bg-blue-500/30",
  audio: "bg-green-500/20 border-green-500/50 hover:bg-green-500/30",
  text: "bg-yellow-500/20 border-yellow-500/50 hover:bg-yellow-500/30",
  image: "bg-purple-500/20 border-purple-500/50 hover:bg-purple-500/30",
  solid: "bg-gray-500/20 border-gray-500/50 hover:bg-gray-500/30",
};

const ITEM_SELECTED_COLORS: Record<TimelineItemType, string> = {
  video: "bg-blue-500/40 border-blue-500",
  audio: "bg-green-500/40 border-green-500",
  text: "bg-yellow-500/40 border-yellow-500",
  image: "bg-purple-500/40 border-purple-500",
  solid: "bg-gray-500/40 border-gray-500",
};

const ITEM_ICONS: Record<TimelineItemType, React.FC<{ className?: string }>> = {
  video: Video,
  audio: Music,
  text: Type,
  image: Image,
  solid: Square,
};

const WAVEFORM_COLORS: Partial<Record<TimelineItemType, string>> = {
  audio: "rgba(74, 222, 128, 0.4)",
  video: "rgba(96, 165, 250, 0.4)",
};

export function TimelineItemBlock({
  item,
  x,
  width,
  height,
  fps,
  selected,
  onSelect,
  onDoubleClick,
}: TimelineItemBlockProps) {
  const resizeRef = useRef<{
    side: "left" | "right";
    startX: number;
    startFrom: number;
    startDuration: number;
  } | null>(null);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
    data: { item, type: "timeline-item" },
  });

  const Icon = ITEM_ICONS[item.type];

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, side: "left" | "right") => {
      e.stopPropagation();
      e.preventDefault();
      resizeRef.current = {
        side,
        startX: e.clientX,
        startFrom: item.from,
        startDuration: item.durationInFrames,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        // Resize logic handled by parent through store
        // This is just a placeholder for the visual interaction
      };

      const handleMouseUp = () => {
        resizeRef.current = null;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [item.from, item.durationInFrames]
  );

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute top-0.5 rounded border cursor-pointer select-none flex items-center gap-1 px-1.5 overflow-hidden transition-colors",
        selected
          ? ITEM_SELECTED_COLORS[item.type]
          : ITEM_COLORS[item.type],
        selected && "ring-2 ring-primary",
        isDragging && "opacity-50 z-50"
      )}
      style={{
        left: x,
        width: Math.max(width, 20),
        height,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
      {...attributes}
      {...listeners}
    >
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/20 z-10"
        onMouseDown={(e) => handleMouseDown(e, "left")}
      />

      {/* Waveform background for audio/video items */}
      {(item.type === "audio" || item.type === "video") && (
        <TimelineItemWaveform
          src={item.src}
          trimStartFrame={item.trimStartFrame}
          durationInFrames={item.durationInFrames}
          width={Math.max(width, 20)}
          height={height}
          fps={fps}
          color={WAVEFORM_COLORS[item.type]!}
        />
      )}

      {/* Content */}
      <div className="relative z-10 flex items-center gap-1">
        <Icon className="h-3 w-3 shrink-0 opacity-60" />
        {width > 60 && (
          <span className="text-[10px] truncate opacity-80">{item.name}</span>
        )}
      </div>

      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/20 z-10"
        onMouseDown={(e) => handleMouseDown(e, "right")}
      />
    </div>
  );
}
