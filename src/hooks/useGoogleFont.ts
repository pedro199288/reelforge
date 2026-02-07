import { useEffect, useState } from "react";
import { loadGoogleFont } from "@/lib/google-fonts";

/**
 * Loads a Google Font and returns the resolved CSS font-family string.
 * Returns the original family name while loading.
 */
export function useGoogleFont(fontFamily: string): string {
  const [resolved, setResolved] = useState(fontFamily);

  useEffect(() => {
    let cancelled = false;
    setResolved(fontFamily); // reset on family change
    loadGoogleFont(fontFamily).then((css) => {
      if (!cancelled) setResolved(css);
    });
    return () => {
      cancelled = true;
    };
  }, [fontFamily]);

  return resolved;
}
