import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/media/$videoId")({
  component: VideoDetailPage,
});

function VideoDetailPage() {
  const { videoId } = Route.useParams();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-4">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          ← Back to Media Library
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-4">Video: {videoId}</h1>

      <p className="text-muted-foreground">
        Video detail page coming soon...
      </p>
    </div>
  );
}
