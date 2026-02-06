import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { getVideoMetadata } from "@remotion/media-utils";
import type { PlayerRef } from "@remotion/player";
import type { MediaDropData } from "@/components/editor-timeline/EditorTrackRow";
import {
  useEditorProjectStore,
  useEditorProject,
  useTracks,
  useCurrentFrame,
  useIsEditorPlaying,
  useEditorSelection,
  useTimelineZoom,
  useSelectedItem,
  useEditorActions,
  useEditorCanUndo,
  useEditorCanRedo,
  useEditorUndo,
  useEditorRedo,
} from "@/store/editor-project";
import { EditorTimeline } from "@/components/editor-timeline/EditorTimeline";
import { EditorPreview } from "@/components/editor/EditorPreview";
import { EditorMediaBrowser } from "@/components/editor/EditorMediaBrowser";
import { EditorPropertiesPanel } from "@/components/editor/EditorPropertiesPanel";
import { useEditorShortcuts } from "@/hooks/useEditorShortcuts";
import { Button } from "@/components/ui/button";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/editor")({
  component: EditorPage,
});

function EditorPage() {
  const project = useEditorProject();
  const tracks = useTracks();
  const currentFrame = useCurrentFrame();
  const isPlaying = useIsEditorPlaying();
  const selection = useEditorSelection();
  const selectedItem = useSelectedItem();
  const zoom = useTimelineZoom();
  const canUndo = useEditorCanUndo();
  const canRedo = useEditorCanRedo();
  const editorUndo = useEditorUndo();
  const editorRedo = useEditorRedo();

  const {
    setCurrentFrame,
    togglePlayback,
    zoomIn,
    zoomOut,
    setTimelineScrollX,
    setTimelineScrollY,
    select,
    clearSelection,
    deleteSelected,
    splitItem,
    moveItem,
    updateTrack,
    updateItem,
    updateProjectSettings,
    addTrack,
    addVideoItem,
    getProjectDuration,
  } = useEditorActions();

  const scrollX = useEditorProjectStore((s) => s.timelineScrollX);
  const scrollY = useEditorProjectStore((s) => s.timelineScrollY);

  const playerRef = useRef<PlayerRef>(null);

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // Keyboard shortcuts
  useEditorShortcuts({ playerRef });

  // Toggle playback — call player directly to keep user gesture chain
  const handleTogglePlayback = useCallback(() => {
    const willPlay = !isPlaying;
    togglePlayback();
    if (willPlay) {
      playerRef.current?.play();
    } else {
      playerRef.current?.pause();
    }
  }, [isPlaying, togglePlayback]);

  const handleSelectItem = useCallback(
    (itemId: string, trackId: string) => {
      select({ type: "item", itemId, trackId });
    },
    [select]
  );

  const handleSelectTrack = useCallback(
    (trackId: string) => {
      select({ type: "track", trackId });
    },
    [select]
  );

  const handleSplitAtPlayhead = useCallback(() => {
    if (selection?.type === "item") {
      splitItem(selection.trackId, selection.itemId, currentFrame);
    }
  }, [selection, currentFrame, splitItem]);

  const handleAddTrack = useCallback(() => {
    addTrack("New Track", "video");
  }, [addTrack]);

  const handleItemDoubleClick = useCallback(
    (itemId: string, trackId: string) => {
      select({ type: "item", itemId, trackId });
      setRightOpen(true);
    },
    [select]
  );

  const handleUpdateItem = useCallback(
    (trackId: string, itemId: string, updates: Record<string, unknown>) => {
      updateItem(trackId, itemId, updates);
    },
    [updateItem]
  );

  const handleDropMediaNewTrack = useCallback(
    async (mediaData: MediaDropData, framePosition: number) => {
      const trackName = `Track ${tracks.length + 1}`;
      const trackId = addTrack(trackName, "video");
      if (mediaData.type === "video") {
        const defaultDuration = 5 * project.fps;
        try {
          const metadata = await getVideoMetadata(mediaData.src);
          const frames = Math.ceil(metadata.durationInSeconds * project.fps);
          addVideoItem(trackId, mediaData.src, framePosition, frames);
        } catch {
          addVideoItem(trackId, mediaData.src, framePosition, defaultDuration);
        }
      }
    },
    [tracks.length, project.fps, addTrack, addVideoItem]
  );

  const handleDropMedia = useCallback(
    async (trackId: string, mediaData: MediaDropData, framePosition: number) => {
      if (mediaData.type === "video") {
        const defaultDuration = 5 * project.fps;
        try {
          const metadata = await getVideoMetadata(mediaData.src);
          const frames = Math.ceil(metadata.durationInSeconds * project.fps);
          addVideoItem(trackId, mediaData.src, framePosition, frames);
        } catch {
          addVideoItem(trackId, mediaData.src, framePosition, defaultDuration);
        }
      }
    },
    [project.fps, addVideoItem]
  );

  const durationInFrames = getProjectDuration();

  return (
    <div className="h-full flex flex-col">
      {/* Main content area */}
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar: Media Browser */}
        <div
          className={cn(
            "transition-all duration-200 flex-shrink-0 overflow-hidden",
            leftOpen ? "w-56" : "w-0"
          )}
        >
          {leftOpen && <EditorMediaBrowser />}
        </div>

        {/* Center: Preview + Timeline */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Toggle buttons */}
          <div className="flex items-center justify-between px-1 py-0.5 border-b bg-muted/20">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setLeftOpen(!leftOpen)}
            >
              {leftOpen ? (
                <PanelLeftClose className="h-3.5 w-3.5" />
              ) : (
                <PanelLeftOpen className="h-3.5 w-3.5" />
              )}
            </Button>

            <span className="text-xs text-muted-foreground font-medium">
              {project.name}
            </span>

            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setRightOpen(!rightOpen)}
            >
              {rightOpen ? (
                <PanelRightClose className="h-3.5 w-3.5" />
              ) : (
                <PanelRightOpen className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          {/* Preview (Remotion Player) */}
          <EditorPreview
            tracks={tracks}
            fps={project.fps}
            width={project.width}
            height={project.height}
            durationInFrames={durationInFrames}
            playerRef={playerRef}
          />
        </div>

        {/* Right sidebar: Properties */}
        <div
          className={cn(
            "transition-all duration-200 flex-shrink-0 overflow-hidden",
            rightOpen ? "w-64" : "w-0"
          )}
        >
          {rightOpen && (
            <EditorPropertiesPanel
              selectedItem={selectedItem}
              project={project}
              onUpdateItem={handleUpdateItem}
              onUpdateProject={updateProjectSettings}
            />
          )}
        </div>
      </div>

      {/* Timeline — full width */}
      <EditorTimeline
        tracks={tracks}
        fps={project.fps}
        durationInFrames={durationInFrames}
        currentFrame={currentFrame}
        isPlaying={isPlaying}
        zoom={zoom}
        scrollX={scrollX}
        scrollY={scrollY}
        selection={selection}
        canUndo={canUndo}
        canRedo={canRedo}
        onTogglePlayback={handleTogglePlayback}
        onSeek={setCurrentFrame}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onScrollX={setTimelineScrollX}
        onScrollY={setTimelineScrollY}
        onSelectItem={handleSelectItem}
        onSelectTrack={handleSelectTrack}
        onClearSelection={clearSelection}
        onUndo={editorUndo}
        onRedo={editorRedo}
        onDeleteSelected={deleteSelected}
        onSplitAtPlayhead={handleSplitAtPlayhead}
        onMoveItem={moveItem}
        onUpdateTrack={updateTrack}
        onAddTrack={handleAddTrack}
        onItemDoubleClick={handleItemDoubleClick}
        onDropMedia={handleDropMedia}
        onDropMediaNewTrack={handleDropMediaNewTrack}
      />
    </div>
  );
}
