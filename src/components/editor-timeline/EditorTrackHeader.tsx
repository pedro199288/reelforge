import { useCallback, useState } from "react";
import {
  Video,
  Music,
  Type,
  Image,
  Square,
  Lock,
  Unlock,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { Track, TrackType } from "@/types/editor";
import { TRACK_HEADER_WIDTH } from "./constants";

interface EditorTrackHeaderProps {
  track: Track;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<Pick<Track, "name" | "locked" | "visible" | "volume">>) => void;
}

const TRACK_ICONS: Record<TrackType, React.FC<{ className?: string }>> = {
  video: Video,
  audio: Music,
  text: Type,
  overlay: Image,
};

export function EditorTrackHeader({
  track,
  selected,
  onSelect,
  onUpdate,
}: EditorTrackHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(track.name);
  const Icon = TRACK_ICONS[track.type] ?? Square;

  const handleDoubleClick = useCallback(() => {
    setEditName(track.name);
    setIsEditing(true);
  }, [track.name]);

  const handleNameCommit = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== track.name) {
      onUpdate({ name: trimmed });
    }
    setIsEditing(false);
  }, [editName, track.name, onUpdate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleNameCommit();
      if (e.key === "Escape") setIsEditing(false);
    },
    [handleNameCommit]
  );

  const showVolume = track.type === "video" || track.type === "audio";

  return (
    <div
      className={cn(
        "flex flex-col gap-1 p-2 border-b border-r bg-muted/30 cursor-pointer select-none",
        selected && "ring-2 ring-primary ring-inset"
      )}
      style={{ width: TRACK_HEADER_WIDTH, height: track.height }}
      onClick={onSelect}
    >
      {/* Top row: icon + name + controls */}
      <div className="flex items-center gap-1 min-w-0">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

        {isEditing ? (
          <input
            className="flex-1 min-w-0 text-xs bg-transparent border-b border-primary outline-none px-0.5"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameCommit}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        ) : (
          <span
            className="flex-1 min-w-0 text-xs font-medium truncate"
            onDoubleClick={handleDoubleClick}
          >
            {track.name}
          </span>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onUpdate({ locked: !track.locked });
          }}
        >
          {track.locked ? (
            <Lock className="h-3 w-3" />
          ) : (
            <Unlock className="h-3 w-3 text-muted-foreground" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onUpdate({ visible: !track.visible });
          }}
        >
          {track.visible ? (
            <Eye className="h-3 w-3" />
          ) : (
            <EyeOff className="h-3 w-3 text-muted-foreground" />
          )}
        </Button>
      </div>

      {/* Volume slider for audio/video tracks */}
      {showVolume && (
        <div className="flex items-center gap-1 px-0.5">
          <Music className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
          <Slider
            value={[track.volume]}
            min={0}
            max={1}
            step={0.01}
            className="flex-1"
            onValueChange={([v]) => onUpdate({ volume: v })}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
