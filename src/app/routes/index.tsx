import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { VideoList, type Video } from "@/components/VideoList";
import { Button } from "@/components/ui/button";

interface VideoManifest {
  videos: Video[];
}

type FilterType = "all" | "with-captions" | "without-captions";

export const Route = createFileRoute("/")({
  component: MediaPage,
});

function MediaPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");

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
      });
  }, []);

  const filteredVideos = videos.filter((video) => {
    if (filter === "with-captions") return video.hasCaptions;
    if (filter === "without-captions") return !video.hasCaptions;
    return true;
  });

  const counts = {
    all: videos.length,
    withCaptions: videos.filter((v) => v.hasCaptions).length,
    withoutCaptions: videos.filter((v) => !v.hasCaptions).length,
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Media Library</h1>

      {loading && <p className="text-muted-foreground">Loading videos...</p>}

      {error && (
        <p className="text-destructive">Error: {error}</p>
      )}

      {!loading && !error && (
        <>
          <div className="flex gap-2 mb-4">
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

          <VideoList videos={filteredVideos} />
        </>
      )}
    </div>
  );
}
