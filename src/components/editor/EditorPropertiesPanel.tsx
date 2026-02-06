import type { TimelineItem, EditorProject } from "@/types/editor";
import { VideoItemProperties } from "./EditorItemProperties/VideoItemProperties";
import { AudioItemProperties } from "./EditorItemProperties/AudioItemProperties";
import { TextItemProperties } from "./EditorItemProperties/TextItemProperties";
import { ImageItemProperties } from "./EditorItemProperties/ImageItemProperties";
import { SolidItemProperties } from "./EditorItemProperties/SolidItemProperties";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface EditorPropertiesPanelProps {
  selectedItem: TimelineItem | null;
  project: EditorProject;
  onUpdateItem: (
    trackId: string,
    itemId: string,
    updates: Record<string, unknown>
  ) => void;
  onUpdateProject: (updates: Partial<Pick<EditorProject, "name" | "fps" | "width" | "height">>) => void;
}

export function EditorPropertiesPanel({
  selectedItem,
  project,
  onUpdateItem,
  onUpdateProject,
}: EditorPropertiesPanelProps) {
  if (!selectedItem) {
    return (
      <div className="flex flex-col h-full border-l bg-background">
        <div className="p-3 border-b">
          <h2 className="text-sm font-semibold">Proyecto</h2>
        </div>
        <div className="p-3 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Nombre</Label>
            <Input
              value={project.name}
              onChange={(e) => onUpdateProject({ name: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">FPS</Label>
              <Input
                type="number"
                value={project.fps}
                onChange={(e) => onUpdateProject({ fps: parseInt(e.target.value) || 30 })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ancho</Label>
              <Input
                type="number"
                value={project.width}
                onChange={(e) => onUpdateProject({ width: parseInt(e.target.value) || 1080 })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Alto</Label>
              <Input
                type="number"
                value={project.height}
                onChange={(e) => onUpdateProject({ height: parseInt(e.target.value) || 1920 })}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleUpdate = (updates: Record<string, unknown>) => {
    onUpdateItem(selectedItem.trackId, selectedItem.id, updates);
  };

  return (
    <div className="flex flex-col h-full border-l bg-background">
      <div className="p-3 border-b">
        <h2 className="text-sm font-semibold">Propiedades</h2>
        <p className="text-xs text-muted-foreground capitalize">{selectedItem.type}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {selectedItem.type === "video" && (
          <VideoItemProperties item={selectedItem} onUpdate={handleUpdate} />
        )}
        {selectedItem.type === "audio" && (
          <AudioItemProperties item={selectedItem} onUpdate={handleUpdate} />
        )}
        {selectedItem.type === "text" && (
          <TextItemProperties item={selectedItem} onUpdate={handleUpdate} />
        )}
        {selectedItem.type === "image" && (
          <ImageItemProperties item={selectedItem} onUpdate={handleUpdate} />
        )}
        {selectedItem.type === "solid" && (
          <SolidItemProperties item={selectedItem} onUpdate={handleUpdate} />
        )}
      </div>
    </div>
  );
}
