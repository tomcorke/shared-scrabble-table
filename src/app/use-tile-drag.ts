import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { stepTileSwing } from "../game.ts";
import { positionIn, projectDragCenter } from "./dom.ts";
import {
  createDragController,
  type DragAreas,
  type DragHandlers,
} from "./drag-controller.ts";
import type { Action, DragState } from "./types.ts";

const SWING_STEP = 1 / 120;

export function useTileDrag(
  myIdRef: MutableRefObject<string>,
  performAction: (action: Action) => void,
  areas: DragAreas,
) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const controllerRef = useRef<DragHandlers | null>(null);
  const handlers: DragHandlers = {
    startDrag: (event, tile) => controllerRef.current?.startDrag(event, tile),
    moveDrag: (event, tile) => controllerRef.current?.moveDrag(event, tile),
    finishDrag: (event, tile) => controllerRef.current?.finishDrag(event, tile),
    cancelDrag: (tileId) => controllerRef.current?.cancelDrag(tileId),
    handleTileKeyDown: (event, tile) =>
      controllerRef.current?.handleTileKeyDown(event, tile),
    cancelPendingDragPreview: (tileId) =>
      controllerRef.current?.cancelPendingDragPreview(tileId),
  };

  useLayoutEffect(() => {
    const controller = createDragController({
      myIdRef,
      dragRef,
      setDrag,
      areas,
      performAction,
    });
    controllerRef.current = controller;
    return () => {
      controller.cancelPendingDragPreview();
      controllerRef.current = null;
    };
  }, [areas, myIdRef, performAction]);

  useEffect(() => {
    const draggingTileId = drag?.tileId;
    if (!draggingTileId) return;

    let frame = 0;
    let previousTime: number | null = null;
    let accumulator = 0;
    const animate = (time: number) => {
      if (previousTime === null) {
        previousTime = time;
      } else {
        accumulator += Math.min((time - previousTime) / 1000, 0.05);
        previousTime = time;
      }

      const current = dragRef.current;
      if (!current || current.tileId !== draggingTileId) return;
      let rotation = current.rotation;
      let angularVelocity = current.angularVelocity;
      while (accumulator >= SWING_STEP) {
        const swing = stepTileSwing({
          rotation,
          angularVelocity,
          dt: SWING_STEP,
        });
        rotation = swing.rotation;
        angularVelocity = swing.angularVelocity;
        accumulator -= SWING_STEP;
      }

      if (
        rotation !== current.rotation ||
        angularVelocity !== current.angularVelocity
      ) {
        const next: DragState = {
          ...current,
          rotation,
          angularVelocity,
          previewCenter: null,
        };
        const previewArea =
          next.destination === "board"
            ? areas.tableRef.current
            : next.destination === "hand"
              ? areas.handRef.current
              : null;
        if (previewArea) {
          const center = projectDragCenter(next);
          const position = positionIn(previewArea, center.x, center.y);
          next.previewCenter = { x: position.centerX, y: position.centerY };
        }
        dragRef.current = next;
        setDrag(next);
      }
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [areas.handRef, areas.tableRef, drag?.tileId]);

  return { drag, handlers };
}
