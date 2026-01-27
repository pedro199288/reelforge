import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/pipeline/$videoId")({
  component: PipelineVideoLayout,
});

/**
 * Layout for /pipeline/$videoId routes.
 * If accessed directly without a tab, redirects to /pipeline/$videoId/raw.
 * Otherwise, renders the child route via Outlet.
 */
function PipelineVideoLayout() {
  const { videoId } = Route.useParams();
  const navigate = useNavigate();
  const matches = useMatches();

  // Check if we're at exactly /pipeline/$videoId (no child tab route)
  const isExactMatch = matches.length > 0 &&
    matches[matches.length - 1].routeId === "/pipeline/$videoId";

  useEffect(() => {
    if (isExactMatch) {
      navigate({
        to: "/pipeline/$videoId/$tab",
        params: { videoId, tab: "raw" },
        replace: true,
      });
    }
  }, [isExactMatch, videoId, navigate]);

  // If exact match, show nothing while redirecting
  if (isExactMatch) {
    return null;
  }

  // Otherwise render the child route
  return <Outlet />;
}
