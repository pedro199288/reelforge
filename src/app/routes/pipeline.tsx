import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/pipeline")({
  component: PipelinePage,
});

function PipelinePage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Pipeline Dashboard</h1>
      <p className="text-muted-foreground">
        Processing pipeline coming soon...
      </p>
    </div>
  );
}
