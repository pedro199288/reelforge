import { continueRender, delayRender, staticFile } from "remotion";

export const AVAILABLE_FONTS = [
  { id: "TheBoldFont", name: "The Bold Font", file: "fonts/theboldfont.ttf" },
  { id: "Montserrat", name: "Montserrat", file: "fonts/Montserrat-Bold.ttf" },
  { id: "Oswald", name: "Oswald", file: "fonts/Oswald-Bold.ttf" },
  { id: "Poppins", name: "Poppins", file: "fonts/Poppins-Bold.ttf" },
] as const;

export type FontId = (typeof AVAILABLE_FONTS)[number]["id"];

export const DEFAULT_FONT: FontId = "TheBoldFont";

// Legacy export for backwards compatibility
export const TheBoldFont = "TheBoldFont";

const loadedFonts = new Set<string>();

export const loadFont = async (fontId: FontId = DEFAULT_FONT): Promise<void> => {
  if (loadedFonts.has(fontId)) {
    return Promise.resolve();
  }

  const fontConfig = AVAILABLE_FONTS.find((f) => f.id === fontId);
  if (!fontConfig) {
    console.warn(`Font "${fontId}" not found, falling back to default`);
    return loadFont(DEFAULT_FONT);
  }

  const waitForFont = delayRender();
  loadedFonts.add(fontId);

  const font = new FontFace(
    fontConfig.id,
    `url('${staticFile(fontConfig.file)}') format('truetype')`,
  );

  await font.load();
  document.fonts.add(font);

  continueRender(waitForFont);
};

export const loadAllFonts = async (): Promise<void> => {
  await Promise.all(AVAILABLE_FONTS.map((f) => loadFont(f.id)));
};
