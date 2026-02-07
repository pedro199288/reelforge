import { useCallback, useRef, useState } from "react";
import {
  useEditorProjectStore,
} from "@/store/editor-project";
import { usePreviewScale } from "@/hooks/usePreviewScale";
import type {
  TextItem,
  ImageItem,
  VideoItem,
  TimelineItem,
  Track,
  EditorProject,
  EditorSelection,
} from "@/types/editor";

interface PreviewDragOverlayProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  compositionWidth: number;
  compositionHeight: number;
  tracks: Track[];
  currentFrame: number;
  onSelect: (selection: EditorSelection) => void;
  onClearSelection: () => void;
}

type PositionableItem = TextItem | ImageItem | VideoItem;

function isPositionableItem(item: unknown): item is PositionableItem {
  const typed = item as { type?: string };
  return typed?.type === "text" || typed?.type === "image" || typed?.type === "video";
}

const SNAP_THRESHOLD = 8; // composition pixels
const DRAG_THRESHOLD = 3; // composition pixels — distinguishes click from drag

interface HitResult {
  item: TimelineItem;
  trackId: string;
}

function getItemBoundingRect(
  item: TimelineItem,
  compositionWidth: number,
  compositionHeight: number,
): { x: number; y: number; w: number; h: number } | null {
  switch (item.type) {
    case "video": {
      const w = compositionWidth * item.scale;
      const h = compositionHeight * item.scale;
      return {
        x: item.position.x - w / 2,
        y: item.position.y - h / 2,
        w,
        h,
      };
    }
    case "image": {
      const w = compositionWidth * item.scale;
      const h = compositionHeight * item.scale;
      return {
        x: item.position.x,
        y: item.position.y,
        w,
        h,
      };
    }
    case "text": {
      const estW = item.fontSize * item.text.length * 0.6;
      const estH = item.fontSize * 1.4;
      return {
        x: item.position.x - estW / 2,
        y: item.position.y - estH / 2,
        w: estW,
        h: estH,
      };
    }
    case "solid":
      return { x: 0, y: 0, w: compositionWidth, h: compositionHeight };
    case "audio":
      return null;
  }
}

function hitTest(
  tracks: Track[],
  currentFrame: number,
  compX: number,
  compY: number,
  compositionWidth: number,
  compositionHeight: number,
): HitResult | null {
  // Iterate from last track to first (top-to-bottom z-order)
  for (let t = tracks.length - 1; t >= 0; t--) {
    const track = tracks[t];
    if (!track.visible) continue;
    for (const item of track.items) {
      if (item.type === "audio") continue;
      const end = item.from + item.durationInFrames;
      if (currentFrame < item.from || currentFrame >= end) continue;

      const rect = getItemBoundingRect(item, compositionWidth, compositionHeight);
      if (!rect) continue;

      if (
        compX >= rect.x &&
        compX <= rect.x + rect.w &&
        compY >= rect.y &&
        compY <= rect.y + rect.h
      ) {
        return { item, trackId: track.id };
      }
    }
  }
  return null;
}

export function PreviewDragOverlay({
  containerRef,
  compositionWidth,
  compositionHeight,
  tracks,
  currentFrame,
  onSelect,
  onClearSelection,
}: PreviewDragOverlayProps) {
  const updateItem = useEditorProjectStore((s) => s.updateItem);

  const { domToComposition, compositionToDom, playerOffset, playerSize } =
    usePreviewScale(containerRef, compositionWidth, compositionHeight);

  const [isDragging, setIsDragging] = useState(false);
  const [snapX, setSnapX] = useState(false);
  const [snapY, setSnapY] = useState(false);
  const [dragItem, setDragItem] = useState<PositionableItem | null>(null);
  const [dragTrackId, setDragTrackId] = useState<string | null>(null);

  const dragStartComp = useRef({ x: 0, y: 0 });
  const itemStartPos = useRef({ x: 0, y: 0 });
  const preDragSnapshotRef = useRef<{ project: EditorProject } | null>(null);
  const pointerDownHit = useRef<HitResult | null>(null);
  const hasDragged = useRef(false);

  const centerX = compositionWidth / 2;
  const centerY = compositionHeight / 2;

  // ─── Pointer handlers ──────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const comp = domToComposition(e.clientX, e.clientY);
      const hit = hitTest(tracks, currentFrame, comp.x, comp.y, compositionWidth, compositionHeight);

      pointerDownHit.current = hit;
      hasDragged.current = false;
      dragStartComp.current = comp;

      if (hit && isPositionableItem(hit.item)) {
        const posItem = hit.item as PositionableItem;
        itemStartPos.current = { ...posItem.position };
        setDragItem(posItem);
        setDragTrackId(hit.trackId);

        // Undo batching: save pre-drag snapshot and pause temporal
        const temporal = useEditorProjectStore.temporal.getState();
        preDragSnapshotRef.current = {
          project: useEditorProjectStore.getState().project,
        };
        temporal.pause();
      } else {
        setDragItem(null);
        setDragTrackId(null);
      }

      setSnapX(false);
      setSnapY(false);
    },
    [domToComposition, tracks, currentFrame, compositionWidth, compositionHeight]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragItem || !dragTrackId) return;

      const comp = domToComposition(e.clientX, e.clientY);
      const deltaX = comp.x - dragStartComp.current.x;
      const deltaY = comp.y - dragStartComp.current.y;

      // Check drag threshold
      if (!hasDragged.current) {
        const dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (dist < DRAG_THRESHOLD) return;
        hasDragged.current = true;
        setIsDragging(true);
      }

      let newX = itemStartPos.current.x + deltaX;
      let newY = itemStartPos.current.y + deltaY;

      // Snap to center
      const nearCenterX = Math.abs(newX - centerX) < SNAP_THRESHOLD;
      const nearCenterY = Math.abs(newY - centerY) < SNAP_THRESHOLD;

      if (nearCenterX) newX = centerX;
      if (nearCenterY) newY = centerY;

      setSnapX(nearCenterX);
      setSnapY(nearCenterY);

      updateItem<PositionableItem>(dragTrackId, dragItem.id, {
        position: { x: Math.round(newX), y: Math.round(newY) },
      });
    },
    [dragItem, dragTrackId, domToComposition, centerX, centerY, updateItem]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);

      const hit = pointerDownHit.current;

      if (!hasDragged.current) {
        // This was a click, not a drag
        if (hit) {
          onSelect({ type: "item", itemId: hit.item.id, trackId: hit.trackId });
        } else {
          onClearSelection();
        }
      }

      // Finalize drag undo batching
      if (dragItem) {
        const temporal = useEditorProjectStore.temporal.getState();
        if (hasDragged.current && preDragSnapshotRef.current) {
          useEditorProjectStore.temporal.setState({
            pastStates: [...temporal.pastStates, preDragSnapshotRef.current],
            futureStates: [],
          });
        }
        preDragSnapshotRef.current = null;
        temporal.resume();

        // If we dragged, also select the item
        if (hasDragged.current && hit) {
          onSelect({ type: "item", itemId: hit.item.id, trackId: hit.trackId });
        }
      }

      setIsDragging(false);
      setSnapX(false);
      setSnapY(false);
      setDragItem(null);
      setDragTrackId(null);
      pointerDownHit.current = null;
      hasDragged.current = false;
    },
    [dragItem, onSelect, onClearSelection]
  );

  // ─── Computed positions for visual elements ────────────────────────

  const handleDomPos = dragItem
    ? compositionToDom(
        (useEditorProjectStore.getState().findItemGlobal(dragItem.id)?.item as PositionableItem | undefined)?.position.x ?? dragItem.position.x,
        (useEditorProjectStore.getState().findItemGlobal(dragItem.id)?.item as PositionableItem | undefined)?.position.y ?? dragItem.position.y,
      )
    : null;

  const guideCenterDom = compositionToDom(centerX, centerY);

  return (
    <div
      className="absolute inset-0"
      style={{
        pointerEvents: "auto",
        cursor: isDragging ? "grabbing" : "default",
        zIndex: 10,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Selection handle */}
      {dragItem && handleDomPos && !isDragging && (
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
