import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Film,
  Layers,
  Clapperboard,
  LayoutGrid,
  Sun,
  Moon,
  Monitor,
  Undo,
  Redo,
  HelpCircle,
} from "lucide-react";
import { useThemeStore } from "@/hooks/useTheme";
import { useUndo, useRedo, useCanUndo, useCanRedo } from "@/store/workspace";
import { toast } from "sonner";

interface CommandPaletteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CommandPalette({ open: controlledOpen, onOpenChange }: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const navigate = useNavigate();
  const location = useLocation();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const undo = useUndo();
  const redo = useRedo();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  // Global keyboard shortcut to open palette
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, setOpen]);

  const runCommand = useCallback(
    (command: () => void) => {
      setOpen(false);
      command();
    },
    [setOpen]
  );

  const navigateTo = useCallback(
    (path: string) => {
      runCommand(() => navigate({ to: path }));
    },
    [navigate, runCommand]
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar acciones..." />
      <CommandList>
        <CommandEmpty>No se encontraron resultados.</CommandEmpty>

        <CommandGroup heading="Navegación">
          <CommandItem
            onSelect={() => navigateTo("/")}
            disabled={location.pathname === "/"}
          >
            <LayoutGrid className="mr-2 h-4 w-4" />
            Media Library
            <CommandShortcut>G M</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => navigateTo("/pipeline")}
            disabled={location.pathname === "/pipeline"}
          >
            <Layers className="mr-2 h-4 w-4" />
            Pipeline
            <CommandShortcut>G P</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => navigateTo("/batch")}
            disabled={location.pathname === "/batch"}
          >
            <Film className="mr-2 h-4 w-4" />
            Batch Processing
            <CommandShortcut>G B</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => navigateTo("/studio")}
            disabled={location.pathname === "/studio"}
          >
            <Clapperboard className="mr-2 h-4 w-4" />
            Studio
            <CommandShortcut>G S</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Edición">
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                if (canUndo) {
                  undo();
                  toast.info("Acción deshecha", { duration: 1500 });
                }
              })
            }
            disabled={!canUndo}
          >
            <Undo className="mr-2 h-4 w-4" />
            Deshacer
            <CommandShortcut>⌘Z</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                if (canRedo) {
                  redo();
                  toast.info("Acción rehecha", { duration: 1500 });
                }
              })
            }
            disabled={!canRedo}
          >
            <Redo className="mr-2 h-4 w-4" />
            Rehacer
            <CommandShortcut>⌘⇧Z</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Tema">
          <CommandItem
            onSelect={() => runCommand(() => setTheme("light"))}
            disabled={theme === "light"}
          >
            <Sun className="mr-2 h-4 w-4" />
            Tema claro
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => setTheme("dark"))}
            disabled={theme === "dark"}
          >
            <Moon className="mr-2 h-4 w-4" />
            Tema oscuro
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => setTheme("system"))}
            disabled={theme === "system"}
          >
            <Monitor className="mr-2 h-4 w-4" />
            Tema del sistema
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Ayuda">
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                toast.info("Atajos de teclado", {
                  description: "⌘K: Command palette | G+M/P/B/S: Navegación | ⌘Z: Deshacer",
                  duration: 5000,
                });
              })
            }
          >
            <HelpCircle className="mr-2 h-4 w-4" />
            Ver atajos de teclado
            <CommandShortcut>?</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export default CommandPalette;
