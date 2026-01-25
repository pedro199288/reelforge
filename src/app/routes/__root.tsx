import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { GlobalProgressBar } from "@/components/GlobalProgressBar";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center px-4 h-12 border-b border-border gap-2">
        <span className="font-semibold mr-6">ReelForge</span>
        <nav className="flex gap-1">
          <NavLink to="/">Media</NavLink>
          <NavLink to="/pipeline">Pipeline</NavLink>
          <NavLink to="/batch">Batch</NavLink>
          <NavLink to="/studio">Studio</NavLink>
        </nav>
      </header>

      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
      <GlobalProgressBar />
      <Toaster position="bottom-right" richColors />
    </div>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors [&.active]:bg-secondary [&.active]:text-foreground"
    >
      {children}
    </Link>
  );
}
