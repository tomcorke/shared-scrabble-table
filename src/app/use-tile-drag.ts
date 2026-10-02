import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import {
  canMoveTile,
  stepTileSwing,
  type TableState,
  type Tile,
} from "../game.ts";
import type { PeerRole } from "./types.ts";
import { positionIn, projectDragCenter } from "./dom.ts";
import {
  createDragController,
  type DragAreas,
  type DragHandlers,
} from "./drag-controller.ts";
import type { Action, DragState } from "./types.ts";

const SWING_STEP = 1 / 120;

type TileDragRefs = {
  myId: MutableRefObject<string>;
  game: MutableRefObject<TableState>;
  role: MutableRefObject<PeerRole>;
};

function canMoveSessionTile(
  tile: Tile,
  myIdRef: TileDragRefs["myId"],
  gameRef: TileDragRefs["game"],
  roleRef: TileDragRefs["role"],
) {
  const myId = myIdRef.current;
  const player = gameRef.current.players.find((item) => item.id === myId);
  return canMoveTile(
    tile,
    myId,
    roleRef.current === "host" || player?.isVip === true,
  );
}

export function useTileDrag(
  refs: TileDragRefs,
  performAction: (action: Action) => void,
  areas: DragAreas,
) {
  const { myId, game, role } = refs;
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
      canMoveTile: (tile) => canMoveSessionTile(tile, myId, game, role),
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
  }, [areas, game, myId, role, performAction]);

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
