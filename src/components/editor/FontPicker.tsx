import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  POPULAR_FONTS,
  getAllFonts,
  loadGoogleFont,
} from "@/lib/google-fonts";
import { useGoogleFont } from "@/hooks/useGoogleFont";

interface FontPickerProps {
  value: string;
  onValueChange: (fontFamily: string) => void;
}

// Eagerly load popular fonts for preview (fire-and-forget at module level)
void Promise.allSettled(POPULAR_FONTS.map((f) => loadGoogleFont(f.family)));

export function FontPicker({ value, onValueChange }: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [allFontFamilies, setAllFontFamilies] = useState<string[] | null>(null);
  const resolvedValue = useGoogleFont(value);

  // Load full catalogue when user starts searching beyond popular list
  useEffect(() => {
    if (!open) return;
    if (search.length >= 2 && !allFontFamilies) {
      getAllFonts().then((fonts) =>
        setAllFontFamilies(fonts.map((f) => f.fontFamily))
      );
    }
  }, [open, search, allFontFamilies]);

  const popularFamilies = useMemo(
    () => POPULAR_FONTS.map((f) => f.family),
    []
  );

  const filteredAllFonts = useMemo(() => {
    if (!allFontFamilies || search.length < 2) return null;
    const q = search.toLowerCase();
    const popularSet = new Set(popularFamilies);
    return allFontFamilies
      .filter((f) => !popularSet.has(f) && f.toLowerCase().includes(q))
      .slice(0, 30);
  }, [allFontFamilies, search, popularFamilies]);

  const handleSelect = useCallback(
    (family: string) => {
      onValueChange(family);
      setOpen(false);
      setSearch("");
      // Pre-load the selected font
      loadGoogleFont(family);
    },
    [onValueChange]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between text-xs font-normal"
        >
          <span
            className="truncate"
            style={{ fontFamily: resolvedValue }}
          >
            {value}
          </span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar fuente..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {search.length < 2
                ? "Escribe para buscar más fuentes"
                : allFontFamilies
                  ? "Sin resultados"
                  : "Cargando..."}
            </CommandEmpty>
            <CommandGroup heading="Populares">
              {popularFamilies
                .filter(
                  (f) =>
                    !search || f.toLowerCase().includes(search.toLowerCase())
                )
                .map((family) => (
                  <FontItem
                    key={family}
                    family={family}
                    selected={value === family}
                    onSelect={handleSelect}
                  />
                ))}
            </CommandGroup>
            {filteredAllFonts && filteredAllFonts.length > 0 && (
              <CommandGroup heading="Todas las fuentes">
                {filteredAllFonts.map((family) => (
                  <FontItem
                    key={family}
                    family={family}
                    selected={value === family}
                    onSelect={handleSelect}
                  />
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Font Item ──────────────────────────────────────────────────────

function FontItem({
  family,
  selected,
  onSelect,
}: {
  family: string;
  selected: boolean;
  onSelect: (family: string) => void;
}) {
  const resolved = useGoogleFont(family);

  return (
    <CommandItem
      value={family}
      onSelect={() => onSelect(family)}
    >
      <Check
        className={cn("mr-1 h-3 w-3", selected ? "opacity-100" : "opacity-0")}
      />
      <span className="truncate text-xs" style={{ fontFamily: resolved }}>
        {family}
      </span>
    </CommandItem>
  );
}
