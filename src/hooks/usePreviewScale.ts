import { useCallback, useEffect, useRef, useState } from "react";

interface PreviewScale {
  /** Ratio: composition pixels per DOM pixel */
  scale: number;
  /** Offset of the Player area within the container (letterboxing) */
  playerOffset: { x: number; y: number };
  /** Rendered Player size in DOM pixels */
  playerSize: { width: number; height: number };
  /** Convert viewport coordinates to composition coordinates */
  domToComposition: (clientX: number, clientY: number) => { x: number; y: number };
  /** Convert composition coordinates to DOM pixel position relative to container */
  compositionToDom: (compX: number, compY: number) => { x: number; y: number };
}

export function usePreviewScale(
  containerRef: React.RefObject<HTMLDivElement | null>,
  compositionWidth: number,
  compositionHeight: number
): PreviewScale {
  const [scale, setScale] = useState(1);
  const [playerOffset, setPlayerOffset] = useState({ x: 0, y: 0 });
  const [playerSize, setPlayerSize] = useState({ width: 0, height: 0 });

  // Keep mutable refs for use in callbacks without stale closures
  const scaleRef = useRef(scale);
  const offsetRef = useRef(playerOffset);
  scaleRef.current = scale;
  offsetRef.current = playerOffset;

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const containerW = el.clientWidth;
    const containerH = el.clientHeight;
    if (containerW === 0 || containerH === 0) return;

    const aspectRatio = compositionWidth / compositionHeight;
    const containerAspect = containerW / containerH;

    let playerW: number;
    let playerH: number;

    if (containerAspect > aspectRatio) {
      // Height-constrained: player fills height, narrower than container
      playerH = containerH;
      playerW = playerH * aspectRatio;
    } else {
      // Width-constrained: player fills width, shorter than container
      playerW = containerW;
      playerH = playerW / aspectRatio;
    }

    const offsetX = (containerW - playerW) / 2;
    const offsetY = (containerH - playerH) / 2;
    const newScale = compositionWidth / playerW;

    setScale(newScale);
    setPlayerOffset({ x: offsetX, y: offsetY });
    setPlayerSize({ width: playerW, height: playerH });
  }, [containerRef, compositionWidth, compositionHeight]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, measure]);

  const domToComposition = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el) return { x: 0, y: 0 };

      const rect = el.getBoundingClientRect();
      const localX = clientX - rect.left - offsetRef.current.x;
      const localY = clientY - rect.top - offsetRef.current.y;

      return {
        x: localX * scaleRef.current,
        y: localY * scaleRef.current,
      };
    },
    [containerRef]
  );

  const compositionToDom = useCallback(
    (compX: number, compY: number) => {
      return {
        x: compX / scaleRef.current + offsetRef.current.x,
        y: compY / scaleRef.current + offsetRef.current.y,
      };
    },
    []
  );

  return { scale, playerOffset, playerSize, domToComposition, compositionToDom };
}
