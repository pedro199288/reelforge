import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { GlobalProgressBar } from "@/components/GlobalProgressBar";
import { QuickActionsPanel } from "@/components/QuickActionsPanel";
import { CommandPalette } from "@/components/CommandPalette";
import { useUndoRedoKeyboard } from "@/hooks/useUndoRedoKeyboard";
import { useNavigationShortcuts } from "@/hooks/useNavigationShortcuts";
import { useTheme, useSetTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { Sun, Moon, Monitor, Command } from "lucide-react";

export const Route = createRootRoute({
  component: RootLayout,
});

function ThemeToggle() {
  const theme = useTheme();
  const setTheme = useSetTheme();

  const cycleTheme = () => {
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={cycleTheme}
      className="h-8 w-8 p-0"
      title={`Tema: ${theme === "light" ? "Claro" : theme === "dark" ? "Oscuro" : "Sistema"}`}
    >
      {theme === "light" && <Sun className="h-4 w-4" />}
      {theme === "dark" && <Moon className="h-4 w-4" />}
      {theme === "system" && <Monitor className="h-4 w-4" />}
    </Button>
  );
}

function RootLayout() {
  // Enable global keyboard shortcuts
  useUndoRedoKeyboard();
  useNavigationShortcuts();

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
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground"
            onClick={() => {
              const event = new KeyboardEvent("keydown", {
                key: "k",
                metaKey: true,
                bubbles: true,
              });
              document.dispatchEvent(event);
            }}
          >
            <Command className="h-3 w-3 mr-1" />
            <span className="hidden sm:inline">Buscar</span>
            <kbd className="ml-2 pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
      <GlobalProgressBar />
      <QuickActionsPanel />
      <CommandPalette />
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
