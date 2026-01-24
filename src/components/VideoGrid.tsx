import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { VideoStatusBadge } from "./VideoStatusBadge";
import type { Video } from "./VideoList";

interface VideoGridProps {
  videos: Video[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function VideoGrid({ videos }: VideoGridProps) {
  if (videos.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No videos found
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {videos.map((video) => (
        <Link
          key={video.id}
          to="/media/$videoId"
          params={{ videoId: video.id }}
          className="block"
        >
          <Card className="overflow-hidden hover:border-primary transition-colors cursor-pointer h-full">
            <div className="aspect-video bg-muted flex items-center justify-center">
              <div className="text-4xl text-muted-foreground/50">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
            </div>
            <CardContent className="p-4">
              <div className="font-medium truncate mb-1">{video.title}</div>
              <div className="text-sm text-muted-foreground truncate mb-2">
                {video.filename}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(video.size)}
                </span>
                <VideoStatusBadge hasCaptions={video.hasCaptions} />
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
