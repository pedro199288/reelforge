import {
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  Undo2,
  Redo2,
  Scissors,
  Trash2,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { framesToTimecode } from "@/types/editor";

interface EditorTimelineToolbarProps {
  isPlaying: boolean;
  currentFrame: number;
  fps: number;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  onTogglePlayback: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSplit: () => void;
  onDelete: () => void;
  onAddTrack: () => void;
}

export function EditorTimelineToolbar({
  isPlaying,
  currentFrame,
  fps,
  canUndo,
  canRedo,
  hasSelection,
  onTogglePlayback,
  onZoomIn,
  onZoomOut,
  onUndo,
  onRedo,
  onSplit,
  onDelete,
  onAddTrack,
}: EditorTimelineToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b bg-muted/30 flex-shrink-0">
      <TooltipProvider delayDuration={300}>
        {/* Playback */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onTogglePlayback}>
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isPlaying ? "Pausar (Space)" : "Reproducir (Space)"}</TooltipContent>
        </Tooltip>

        {/* Timecode */}
        <span className="text-xs font-mono text-muted-foreground px-2 min-w-[70px] text-center">
          {framesToTimecode(currentFrame, fps)}
        </span>

        <div className="h-4 w-px bg-border" />

        {/* Undo/Redo */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onUndo} disabled={!canUndo}>
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Deshacer (Cmd+Z)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRedo} disabled={!canRedo}>
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Rehacer (Cmd+Shift+Z)</TooltipContent>
        </Tooltip>

        <div className="h-4 w-px bg-border" />

        {/* Split / Delete */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onSplit} disabled={!hasSelection}>
              <Scissors className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Dividir en playhead (Cmd+B)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete} disabled={!hasSelection}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Eliminar seleccionado (Delete)</TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        {/* Add Track */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={onAddTrack}>
              <Plus className="h-3.5 w-3.5" />
              Track
            </Button>
          </TooltipTrigger>
          <TooltipContent>Agregar track</TooltipContent>
        </Tooltip>

        <div className="h-4 w-px bg-border" />

        {/* Zoom */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onZoomOut}>
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Alejar (-)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onZoomIn}>
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Acercar (+)</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
