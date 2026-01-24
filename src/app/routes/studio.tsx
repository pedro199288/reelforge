import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/studio")({
  component: StudioPage,
});

function StudioPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Studio</h1>
      <p className="text-muted-foreground">
        Remotion Studio integration coming soon...
      </p>
    </div>
  );
}
