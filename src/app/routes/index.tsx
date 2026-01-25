import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { VideoList, type Video } from "@/components/VideoList";
import { VideoGrid } from "@/components/VideoGrid";
import { VideoGridSkeleton } from "@/components/VideoGridSkeleton";
import { VideoListSkeleton } from "@/components/VideoListSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

interface VideoManifest {
  videos: Video[];
}

type FilterType = "all" | "with-captions" | "without-captions";
type ViewMode = "grid" | "list";

export const Route = createFileRoute("/")({
  component: MediaPage,
});

function MediaPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  useEffect(() => {
    fetch("/videos.manifest.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load video manifest");
        return res.json() as Promise<VideoManifest>;
      })
      .then((data) => {
        setVideos(data.videos);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
        toast.error("Error loading videos", {
          description: err.message,
        });
      });
  }, []);

  const filteredVideos = useMemo(() => {
    return videos.filter((video) => {
      // Apply caption filter
      if (filter === "with-captions" && !video.hasCaptions) return false;
      if (filter === "without-captions" && video.hasCaptions) return false;

      // Apply search filter
      if (search) {
        const query = search.toLowerCase();
        return (
          video.title.toLowerCase().includes(query) ||
          video.filename.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [videos, filter, search]);

  const counts = {
    all: videos.length,
    withCaptions: videos.filter((v) => v.hasCaptions).length,
    withoutCaptions: videos.filter((v) => !v.hasCaptions).length,
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Media Library</h1>
        <div className="w-64">
          <Input
            type="search"
            placeholder="Search videos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Error loading videos</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="mt-4">
          {viewMode === "grid" ? (
            <VideoGridSkeleton count={6} />
          ) : (
            <VideoListSkeleton count={5} />
          )}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              <Button
                variant={filter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("all")}
              >
                All ({counts.all})
              </Button>
              <Button
                variant={filter === "with-captions" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("with-captions")}
              >
                With Captions ({counts.withCaptions})
              </Button>
              <Button
                variant={filter === "without-captions" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("without-captions")}
              >
                Without Captions ({counts.withoutCaptions})
              </Button>
            </div>

            <div className="flex gap-1">
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
              >
                <GridIcon />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                aria-label="List view"
              >
                <ListIcon />
              </Button>
            </div>
          </div>

          {filteredVideos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {search ? `No videos matching "${search}"` : "No videos found"}
            </div>
          ) : viewMode === "grid" ? (
            <VideoGrid videos={filteredVideos} />
          ) : (
            <VideoList videos={filteredVideos} />
          )}
        </>
      )}
    </div>
  );
}

function GridIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
