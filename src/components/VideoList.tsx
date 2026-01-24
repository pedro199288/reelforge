import { Link } from "@tanstack/react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VideoStatusBadge } from "./VideoStatusBadge";

export interface Video {
  id: string;
  filename: string;
  title: string;
  size: number;
  hasCaptions: boolean;
}

interface VideoListProps {
  videos: Video[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function VideoList({ videos }: VideoListProps) {
  if (videos.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No videos found
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50%]">Title</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {videos.map((video) => (
          <TableRow key={video.id}>
            <TableCell>
              <Link
                to="/media/$videoId"
                params={{ videoId: video.id }}
                className="font-medium hover:underline"
              >
                {video.title}
              </Link>
              <div className="text-sm text-muted-foreground truncate max-w-[300px]">
                {video.filename}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatFileSize(video.size)}
            </TableCell>
            <TableCell>
              <VideoStatusBadge hasCaptions={video.hasCaptions} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
