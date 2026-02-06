import { useCallback, useEffect, useState } from "react";
import { Film, Music, ImageIcon, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

export function EditorMediaBrowser({ onDragStart }: EditorMediaBrowserProps) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MediaTab>("video");

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
    (e: React.DragEvent, video: Video) => {
      e.dataTransfer.setData("application/x-editor-media", JSON.stringify({
        type: "video",
        src: `/videos/${video.filename}`,
        name: video.title,
      }));
      e.dataTransfer.effectAllowed = "copy";
      onDragStart?.("video", `/videos/${video.filename}`);
    },
    [onDragStart]
  );

  const tabs: { id: MediaTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: "video", label: "Video", icon: Film },
    { id: "audio", label: "Audio", icon: Music },
    { id: "image", label: "Imagen", icon: ImageIcon },
    { id: "text", label: "Texto", icon: FileText },
  ];

  return (
    <div className="flex flex-col h-full border-r bg-background">
      <div className="p-3 border-b">
        <h2 className="text-sm font-semibold">Media</h2>
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
            ) : videos.length === 0 ? (
              <div className="text-xs text-muted-foreground p-2">Sin videos</div>
            ) : (
              videos.map((video) => (
                <div
                  key={video.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, video)}
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
              ))
            )}
          </>
        )}

        {activeTab === "audio" && (
          <div className="text-xs text-muted-foreground p-2">
            Arrastra archivos de audio aquí
          </div>
        )}

        {activeTab === "image" && (
          <div className="text-xs text-muted-foreground p-2">
            Arrastra imágenes aquí
          </div>
        )}

        {activeTab === "text" && (
          <div className="p-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={() => {
                // Text items are created directly via the timeline
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
