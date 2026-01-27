import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/pipeline/$videoId")({
  component: PipelineVideoRedirect,
});

/**
 * Redirects /pipeline/$videoId to /pipeline/$videoId/raw
 * This handles the case when a video is selected but no tab is specified
 */
function PipelineVideoRedirect() {
  const { videoId } = Route.useParams();

  return (
    <Navigate
      to="/pipeline/$videoId/$tab"
      params={{ videoId, tab: "raw" }}
      replace
    />
  );
}
