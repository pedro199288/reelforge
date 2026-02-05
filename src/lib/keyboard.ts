export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.platform?.startsWith("Mac") ?? /Mac/.test(navigator.userAgent);
}

/**
 * Format a shortcut string for display.
 *
 * Accepts tokens like "Mod+Z", "Shift+1", "F".
 * "Mod" maps to "⌘" on Mac and "Ctrl" on other platforms.
 */
export function formatShortcut(shortcut: string): string {
  const mac = isMac();
  return shortcut
    .split("+")
    .map((token) => {
      const t = token.trim();
      switch (t.toLowerCase()) {
        case "mod":
          return mac ? "\u2318" : "Ctrl";
        case "shift":
          return mac ? "\u21E7" : "Shift";
        case "alt":
          return mac ? "\u2325" : "Alt";
        default:
          return t;
      }
    })
    .join(mac ? "" : "+");
}
