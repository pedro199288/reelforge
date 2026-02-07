// ─── Types ──────────────────────────────────────────────────────────
// We use a minimal type instead of GoogleFont from @remotion/google-fonts
// because each font module has its own Variants generic that is incompatible
// with the base GoogleFont type.

interface FontModule {
  fontFamily: string;
  loadFont: (...args: never[]) => { fontFamily: string };
}

interface FontEntry {
  family: string;
  load: () => Promise<FontModule>;
}

// ─── Curated Popular Fonts ──────────────────────────────────────────
// Dynamic imports keep the bundle lean — only loaded when used.

export const POPULAR_FONTS: FontEntry[] = [
  { family: "Inter", load: () => import("@remotion/google-fonts/Inter") as Promise<FontModule> },
  { family: "Roboto", load: () => import("@remotion/google-fonts/Roboto") as Promise<FontModule> },
  { family: "Open Sans", load: () => import("@remotion/google-fonts/OpenSans") as Promise<FontModule> },
  { family: "Montserrat", load: () => import("@remotion/google-fonts/Montserrat") as Promise<FontModule> },
  { family: "Lato", load: () => import("@remotion/google-fonts/Lato") as Promise<FontModule> },
  { family: "Poppins", load: () => import("@remotion/google-fonts/Poppins") as Promise<FontModule> },
  { family: "Oswald", load: () => import("@remotion/google-fonts/Oswald") as Promise<FontModule> },
  { family: "Raleway", load: () => import("@remotion/google-fonts/Raleway") as Promise<FontModule> },
  { family: "Nunito", load: () => import("@remotion/google-fonts/Nunito") as Promise<FontModule> },
  { family: "Ubuntu", load: () => import("@remotion/google-fonts/Ubuntu") as Promise<FontModule> },
  { family: "Playfair Display", load: () => import("@remotion/google-fonts/PlayfairDisplay") as Promise<FontModule> },
  { family: "Merriweather", load: () => import("@remotion/google-fonts/Merriweather") as Promise<FontModule> },
  { family: "PT Sans", load: () => import("@remotion/google-fonts/PTSans") as Promise<FontModule> },
  { family: "Noto Sans", load: () => import("@remotion/google-fonts/NotoSans") as Promise<FontModule> },
  { family: "Rubik", load: () => import("@remotion/google-fonts/Rubik") as Promise<FontModule> },
  { family: "Work Sans", load: () => import("@remotion/google-fonts/WorkSans") as Promise<FontModule> },
  { family: "Fira Sans", load: () => import("@remotion/google-fonts/FiraSans") as Promise<FontModule> },
  { family: "Barlow", load: () => import("@remotion/google-fonts/Barlow") as Promise<FontModule> },
  { family: "Quicksand", load: () => import("@remotion/google-fonts/Quicksand") as Promise<FontModule> },
  { family: "Bebas Neue", load: () => import("@remotion/google-fonts/BebasNeue") as Promise<FontModule> },
  { family: "Anton", load: () => import("@remotion/google-fonts/Anton") as Promise<FontModule> },
  { family: "Archivo", load: () => import("@remotion/google-fonts/Archivo") as Promise<FontModule> },
  { family: "Space Grotesk", load: () => import("@remotion/google-fonts/SpaceGrotesk") as Promise<FontModule> },
  { family: "DM Sans", load: () => import("@remotion/google-fonts/DMSans") as Promise<FontModule> },
  { family: "Bitter", load: () => import("@remotion/google-fonts/Bitter") as Promise<FontModule> },
];

const POPULAR_FAMILIES = new Set(POPULAR_FONTS.map((f) => f.family));

// ─── Cache ──────────────────────────────────────────────────────────

const fontCache = new Map<string, string>();
const loadingPromises = new Map<string, Promise<string>>();

// ─── All Fonts (lazy) ───────────────────────────────────────────────

type AvailableFontEntry = {
  fontFamily: string;
  importName: string;
  load: () => Promise<FontModule>;
};

let allFontsCache: AvailableFontEntry[] | null = null;

export async function getAllFonts(): Promise<AvailableFontEntry[]> {
  if (allFontsCache) return allFontsCache;
  const { getAvailableFonts } = await import("@remotion/google-fonts");
  allFontsCache = getAvailableFonts() as AvailableFontEntry[];
  return allFontsCache;
}

// ─── Load a Font ────────────────────────────────────────────────────

export async function loadGoogleFont(fontFamily: string): Promise<string> {
  // Already loaded
  const cached = fontCache.get(fontFamily);
  if (cached) return cached;

  // Already loading
  const pending = loadingPromises.get(fontFamily);
  if (pending) return pending;

  const promise = (async () => {
    // Try curated list first
    const popular = POPULAR_FONTS.find((f) => f.family === fontFamily);
    if (popular) {
      const mod = await popular.load();
      const { fontFamily: cssFontFamily } = mod.loadFont();
      fontCache.set(fontFamily, cssFontFamily);
      return cssFontFamily;
    }

    // Fall back to full catalogue
    const allFonts = await getAllFonts();
    const entry = allFonts.find((f) => f.fontFamily === fontFamily);
    if (!entry) {
      fontCache.set(fontFamily, fontFamily);
      return fontFamily;
    }

    const mod = await entry.load();
    const { fontFamily: cssFontFamily } = mod.loadFont();
    fontCache.set(fontFamily, cssFontFamily);
    return cssFontFamily;
  })();

  loadingPromises.set(fontFamily, promise);
  try {
    return await promise;
  } finally {
    loadingPromises.delete(fontFamily);
  }
}

export function isPopularFont(family: string): boolean {
  return POPULAR_FAMILIES.has(family);
}
