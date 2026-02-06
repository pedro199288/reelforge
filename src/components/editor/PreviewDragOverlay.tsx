import { useCallback, useRef, useState } from "react";
import {
  useEditorProjectStore,
  useEditorSelection,
  useSelectedItem,
} from "@/store/editor-project";
import { usePreviewScale } from "@/hooks/usePreviewScale";
import type { TextItem, ImageItem, EditorProject } from "@/types/editor";

interface PreviewDragOverlayProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  compositionWidth: number;
  compositionHeight: number;
}

type PositionableItem = TextItem | ImageItem;

function isPositionableItem(item: unknown): item is PositionableItem {
  const typed = item as { type?: string };
  return typed?.type === "text" || typed?.type === "image";
}

const SNAP_THRESHOLD = 8; // composition pixels

export function PreviewDragOverlay({
  containerRef,
  compositionWidth,
  compositionHeight,
}: PreviewDragOverlayProps) {
  const selection = useEditorSelection();
  const selectedItem = useSelectedItem();
  const updateItem = useEditorProjectStore((s) => s.updateItem);

  const { domToComposition, compositionToDom, playerOffset, playerSize } =
    usePreviewScale(containerRef, compositionWidth, compositionHeight);

  const [isDragging, setIsDragging] = useState(false);
  const [snapX, setSnapX] = useState(false);
  const [snapY, setSnapY] = useState(false);

  const dragStartComp = useRef({ x: 0, y: 0 });
  const itemStartPos = useRef({ x: 0, y: 0 });
  const preDragSnapshotRef = useRef<{ project: EditorProject } | null>(null);

  const positionable = isPositionableItem(selectedItem);
  const trackId = selection?.type === "item" ? selection.trackId : null;
  const itemId = selection?.type === "item" ? selection.itemId : null;

  const centerX = compositionWidth / 2;
  const centerY = compositionHeight / 2;

  // ─── Pointer handlers ──────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!positionable || !trackId || !itemId || !selectedItem) return;

      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const comp = domToComposition(e.clientX, e.clientY);
      dragStartComp.current = comp;
      itemStartPos.current = { ...(selectedItem as PositionableItem).position };

      // Undo batching: save pre-drag snapshot and pause temporal
      const temporal = useEditorProjectStore.temporal.getState();
      preDragSnapshotRef.current = {
        project: useEditorProjectStore.getState().project,
      };
      temporal.pause();

      setIsDragging(true);
      setSnapX(false);
      setSnapY(false);
    },
    [positionable, trackId, itemId, selectedItem, domToComposition]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || !trackId || !itemId) return;

      const comp = domToComposition(e.clientX, e.clientY);
      const deltaX = comp.x - dragStartComp.current.x;
      const deltaY = comp.y - dragStartComp.current.y;

      let newX = itemStartPos.current.x + deltaX;
      let newY = itemStartPos.current.y + deltaY;

      // Snap to center
      const nearCenterX = Math.abs(newX - centerX) < SNAP_THRESHOLD;
      const nearCenterY = Math.abs(newY - centerY) < SNAP_THRESHOLD;

      if (nearCenterX) newX = centerX;
      if (nearCenterY) newY = centerY;

      setSnapX(nearCenterX);
      setSnapY(nearCenterY);

      updateItem<TextItem>(trackId, itemId, { position: { x: Math.round(newX), y: Math.round(newY) } });
    },
    [isDragging, trackId, itemId, domToComposition, centerX, centerY, updateItem]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;

      (e.target as HTMLElement).releasePointerCapture(e.pointerId);

      // Undo batching: insert pre-drag snapshot and resume
      const temporal = useEditorProjectStore.temporal.getState();
      if (preDragSnapshotRef.current) {
        useEditorProjectStore.temporal.setState({
          pastStates: [...temporal.pastStates, preDragSnapshotRef.current],
          futureStates: [],
        });
        preDragSnapshotRef.current = null;
      }
      temporal.resume();

      setIsDragging(false);
      setSnapX(false);
      setSnapY(false);
    },
    [isDragging]
  );

  // ─── Computed positions for visual elements ────────────────────────

  const handleDomPos = positionable && selectedItem
    ? compositionToDom((selectedItem as PositionableItem).position.x, (selectedItem as PositionableItem).position.y)
    : null;

  const guideCenterDom = compositionToDom(centerX, centerY);

  return (
    <div
      className="absolute inset-0"
      style={{
        pointerEvents: positionable ? "auto" : "none",
        cursor: isDragging ? "grabbing" : positionable ? "move" : undefined,
        zIndex: 10,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Selection handle */}
      {positionable && handleDomPos && !isDragging && (
        <div
          className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-400 bg-cyan-400/20"
          style={{
            left: handleDomPos.x,
            top: handleDomPos.y,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Dragging crosshair */}
      {isDragging && handleDomPos && (
        <div
          className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-400 bg-cyan-400/30"
          style={{
            left: handleDomPos.x,
            top: handleDomPos.y,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Vertical snap guide (x = center) */}
      {isDragging && snapX && (
        <div
          className="absolute bg-cyan-400/70"
          style={{
            left: guideCenterDom.x,
            top: playerOffset.y,
            width: 1,
            height: playerSize.height,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Horizontal snap guide (y = center) */}
      {isDragging && snapY && (
        <div
          className="absolute bg-cyan-400/70"
          style={{
            left: playerOffset.x,
            top: guideCenterDom.y,
            width: playerSize.width,
            height: 1,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}
