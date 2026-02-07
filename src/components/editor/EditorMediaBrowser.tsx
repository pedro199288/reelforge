import { useCallback, useEffect, useState } from "react";
import { Film, Music, ImageIcon, FileText, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useMediaLibraryStore,
  type ImportedMedia,
  type ImportedMediaType,
} from "@/store/media-library";
import { useEditorProjectStore } from "@/store/editor-project";

interface Video {
  id: string;
  filename: string;
  title: string;
  size: number;
  hasCaptions: boolean;
}

interface VideoManifest {
  videos: Video[];
}

type MediaTab = "video" | "audio" | "image" | "text";

interface EditorMediaBrowserProps {
  onDragStart?: (type: string, src: string) => void;
}

const ACCEPT_BY_TAB: Record<MediaTab, string> = {
  video: "video/*",
  audio: "audio/*",
  image: "image/*",
  text: "",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ICON_BY_TYPE: Record<ImportedMediaType, React.FC<{ className?: string }>> = {
  video: Film,
  audio: Music,
  image: ImageIcon,
};

const ICON_COLOR_BY_TYPE: Record<ImportedMediaType, string> = {
  video: "text-blue-500",
  audio: "text-green-500",
  image: "text-purple-500",
};

export function EditorMediaBrowser({ onDragStart }: EditorMediaBrowserProps) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MediaTab>("video");
  const importedItems = useMediaLibraryStore((s) => s.items);
  const importFiles = useMediaLibraryStore((s) => s.importFiles);
  const removeItem = useMediaLibraryStore((s) => s.removeItem);

  useEffect(() => {
    fetch("/videos.manifest.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load manifest");
        return res.json() as Promise<VideoManifest>;
      })
      .then((data) => {
        setVideos(data.videos);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleDragStart = useCallback(
    (e: React.DragEvent, type: string, src: string, name: string) => {
      e.dataTransfer.setData("application/x-editor-media", JSON.stringify({
        type,
        src,
        name,
      }));
      e.dataTransfer.effectAllowed = "copy";
      onDragStart?.(type, src);
    },
    [onDragStart]
  );

  const handleImportClick = useCallback(async () => {
    const accept = ACCEPT_BY_TAB[activeTab];
    if (!accept) return;
    try {
      const handles = await showOpenFilePicker({
        multiple: true,
        types: [{ description: "Media", accept: { [accept]: [] } }],
      });
      const entries = await Promise.all(
        handles.map(async (h) => ({ handle: h, file: await h.getFile() }))
      );
      importFiles(entries);
    } catch {
      // User cancelled the picker
    }
  }, [activeTab, importFiles]);

  const filteredImported = importedItems.filter(
    (item) => activeTab !== "text" && item.type === activeTab
  );

  const tabs: { id: MediaTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: "video", label: "Video", icon: Film },
    { id: "audio", label: "Audio", icon: Music },
    { id: "image", label: "Imagen", icon: ImageIcon },
    { id: "text", label: "Texto", icon: FileText },
  ];

  return (
    <div className="flex flex-col h-full border-r bg-background">
      <div className="flex items-center justify-between p-3 border-b">
        <h2 className="text-sm font-semibold">Media</h2>
        {activeTab !== "text" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleImportClick}
            title="Importar archivos"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 py-1.5 text-xs transition-colors",
              activeTab === id
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab(id)}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {activeTab === "video" && (
          <>
            {loading ? (
              <div className="text-xs text-muted-foreground p-2">Cargando...</div>
            ) : videos.length === 0 && filteredImported.length === 0 ? (
              <div className="text-xs text-muted-foreground p-2">Sin videos</div>
            ) : (
              <>
                {videos.map((video) => (
                  <div
                    key={video.id}
                    draggable
                    onDragStart={(e) =>
                      handleDragStart(e, "video", `/videos/${video.filename}`, video.title)
                    }
                    className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-grab active:cursor-grabbing select-none"
                  >
                    <Film className="h-4 w-4 text-blue-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{video.title}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {video.filename}
                      </div>
                    </div>
                  </div>
                ))}
                {filteredImported.map((item) => (
                  <ImportedMediaItem
                    key={item.id}
                    item={item}
                    onDragStart={handleDragStart}
                    onRemove={removeItem}
                  />
                ))}
              </>
            )}
          </>
        )}

        {activeTab === "audio" && (
          <>
            {filteredImported.length === 0 ? (
              <div className="text-xs text-muted-foreground p-2">
                Sin archivos de audio. Usa + para importar.
              </div>
            ) : (
              filteredImported.map((item) => (
                <ImportedMediaItem
                  key={item.id}
                  item={item}
                  onDragStart={handleDragStart}
                  onRemove={removeItem}
                />
              ))
            )}
          </>
        )}

        {activeTab === "image" && (
          <>
            {filteredImported.length === 0 ? (
              <div className="text-xs text-muted-foreground p-2">
                Sin imágenes. Usa + para importar.
              </div>
            ) : (
              filteredImported.map((item) => (
                <ImportedMediaItem
                  key={item.id}
                  item={item}
                  onDragStart={handleDragStart}
                  onRemove={removeItem}
                />
              ))
            )}
          </>
        )}

        {activeTab === "text" && (
          <div className="p-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={() => {
                const state = useEditorProjectStore.getState();
                const { project, currentFrame } = state;
                let trackId = project.tracks.find((t) => t.type === "text")?.id;
                if (!trackId) trackId = state.addTrack("Texto", "text");
                state.addTextItem(trackId, "Nuevo texto", currentFrame, 3 * project.fps);
              }}
            >
              <FileText className="h-3 w-3 mr-1" />
              Agregar texto
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Imported Media Item ──────────────────────────────────────────────

function ImportedMediaItem({
  item,
  onDragStart,
  onRemove,
}: {
  item: ImportedMedia;
  onDragStart: (e: React.DragEvent, type: string, src: string, name: string) => void;
  onRemove: (id: string) => void;
}) {
  const Icon = ICON_BY_TYPE[item.type];
  const iconColor = ICON_COLOR_BY_TYPE[item.type];

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item.type, item.blobUrl, item.name)}
      className="group flex items-center gap-2 p-2 rounded hover:bg-accent cursor-grab active:cursor-grabbing select-none"
    >
      <Icon className={cn("h-4 w-4 shrink-0", iconColor)} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium truncate">{item.name}</div>
        <div className="text-[10px] text-muted-foreground">
          {formatFileSize(item.size)}
        </div>
      </div>
      <button
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(item.id);
        }}
        title="Eliminar"
      >
        <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
      </button>
    </div>
  );
}
