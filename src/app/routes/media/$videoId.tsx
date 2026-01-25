import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Video } from "@/components/VideoList";

interface VideoManifest {
  videos: Video[];
}

export const Route = createFileRoute("/media/$videoId")({
  component: VideoDetailPage,
});

function VideoDetailPage() {
  const { videoId } = Route.useParams();
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/videos.manifest.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load video manifest");
        return res.json() as Promise<VideoManifest>;
      })
      .then((data) => {
        const found = data.videos.find((v) => v.id === videoId);
        if (!found) {
          setError("Video not found");
        } else {
          setVideo(found);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [videoId]);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="p-6">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          ← Back to Media Library
        </Link>
        <p className="text-destructive mt-4">{error || "Video not found"}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Video player panel */}
      <div className="flex-1 flex items-center justify-center bg-black/50 p-6">
        <VideoPlayer src={`/${video.filename}`} />
      </div>

      {/* Sidebar */}
      <div className="w-80 border-l border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            ← Back to Media Library
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{video.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Filename</span>
                <span className="truncate max-w-[150px]">{video.filename}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Size</span>
                <span>{formatFileSize(video.size)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Captions</span>
                <Badge variant={video.hasCaptions ? "default" : "secondary"}>
                  {video.hasCaptions ? "Available" : "Not available"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Button className="w-full" disabled={!video.hasCaptions}>
              Generate Segments
            </Button>
            <Link to="/studio" search={{ videoId: video.id }}>
              <Button className="w-full" variant="outline" disabled={!video.hasCaptions}>
                Open in Studio
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
