import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/edit")({
  component: EditLayout,
});

function EditLayout() {
  return <Outlet />;
}
