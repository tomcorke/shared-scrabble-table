import type {
  Dispatch,
  KeyboardEvent,
  MutableRefObject,
  PointerEvent,
  SetStateAction,
} from "react";
import {
  addTileDragImpulse,
  canSendDragUpdate,
  DRAG_UPDATE_INTERVAL_MS,
  type MoveDestination,
  type Tile,
} from "../game.ts";
import { pointInside, positionIn, projectDragCenter } from "./dom.ts";
import { tileKeyboardAction } from "./keyboard-action.ts";
import type { Action, DragState, PendingDragUpdate } from "./types.ts";

export type DragAreas = {
  tableRef: MutableRefObject<HTMLDivElement | null>;
  discardRef: MutableRefObject<HTMLDivElement | null>;
  handRef: MutableRefObject<HTMLDivElement | null>;
};

export type DragHandlers = {
  startDrag(event: PointerEvent<HTMLButtonElement>, tile: Tile): void;
  moveDrag(event: PointerEvent<HTMLButtonElement>, tile: Tile): void;
  finishDrag(event: PointerEvent<HTMLButtonElement>, tile: Tile): void;
  cancelDrag(tileId: string): void;
  handleTileKeyDown(event: KeyboardEvent<HTMLButtonElement>, tile: Tile): void;
  cancelPendingDragPreview(tileId?: string): void;
};

type DragControllerOptions = {
  canMoveTile(tile: Tile): boolean;
  dragRef: MutableRefObject<DragState | null>;
  setDrag: Dispatch<SetStateAction<DragState | null>>;
  areas: DragAreas;
  performAction(action: Action): void;
};

class DragController implements DragHandlers {
  private readonly canMoveTile: (tile: Tile) => boolean;
  private readonly dragRef: MutableRefObject<DragState | null>;
  private readonly setDrag: Dispatch<SetStateAction<DragState | null>>;
  private readonly areas: DragAreas;
  private readonly performAction: (action: Action) => void;
  private pendingDragUpdate: PendingDragUpdate | null = null;
  private lastDragUpdateAt = Number.NEGATIVE_INFINITY;

  constructor(options: DragControllerOptions) {
    this.canMoveTile = options.canMoveTile;
    this.dragRef = options.dragRef;
    this.setDrag = options.setDrag;
    this.areas = options.areas;
    this.performAction = options.performAction;
  }

  private dragDestination(x: number, y: number): MoveDestination | null {
    if (pointInside(this.areas.discardRef.current, x, y)) return "discard";
    if (pointInside(this.areas.tableRef.current, x, y)) return "board";
    if (pointInside(this.areas.handRef.current, x, y)) return "hand";
    return null;
  }

  cancelPendingDragPreview(tileId?: string) {
    const pending = this.pendingDragUpdate;
    if (!pending || (tileId && pending.tileId !== tileId)) return;
    window.clearTimeout(pending.timer);
    this.pendingDragUpdate = null;
  }

  private sendPreview(update: PendingDragUpdate, sentAt: number) {
    this.lastDragUpdateAt = sentAt;
    this.performAction({
      kind: "drag-preview",
      tileId: update.tileId,
      x: update.x,
      y: update.y,
      rotation: update.rotation,
    });
  }

  private schedulePreview(pending: PendingDragUpdate, delay: number) {
    pending.timer = window.setTimeout(
      () => {
        if (this.pendingDragUpdate !== pending) return;
        const current = this.dragRef.current;
        const table = this.areas.tableRef.current;
        if (
          !current ||
          current.tileId !== pending.tileId ||
          current.destination !== "board" ||
          !table
        ) {
          this.pendingDragUpdate = null;
          return;
        }
        const center = projectDragCenter(current);
        const position = positionIn(table, center.x, center.y);
        pending.x = position.x;
        pending.y = position.y;
        pending.rotation = current.rotation;
        const sentAt = performance.now();
        if (!canSendDragUpdate(sentAt, this.lastDragUpdateAt)) {
          this.schedulePreview(
            pending,
            this.lastDragUpdateAt + DRAG_UPDATE_INTERVAL_MS - sentAt,
          );
          return;
        }
        this.sendPreview(pending, sentAt);
        if (!current.sharedPreview) {
          const next = { ...current, sharedPreview: true };
          this.dragRef.current = next;
          this.setDrag(next);
        }
        this.schedulePreview(pending, DRAG_UPDATE_INTERVAL_MS);
      },
      Math.max(0, delay),
    );
  }

  private queueDragPreview(
    tileId: string,
    x: number,
    y: number,
    rotation: number,
    now: number,
  ) {
    if (canSendDragUpdate(now, this.lastDragUpdateAt)) {
      this.cancelPendingDragPreview();
      const pending = { tileId, x, y, rotation, timer: 0 };
      this.pendingDragUpdate = pending;
      this.sendPreview(pending, now);
      this.schedulePreview(pending, DRAG_UPDATE_INTERVAL_MS);
      return true;
    }

    let pending = this.pendingDragUpdate;
    if (pending?.tileId !== tileId) {
      this.cancelPendingDragPreview();
      pending = { tileId, x, y, rotation, timer: 0 };
      this.pendingDragUpdate = pending;
      this.schedulePreview(
        pending,
        this.lastDragUpdateAt + DRAG_UPDATE_INTERVAL_MS - now,
      );
    } else {
      pending.x = x;
      pending.y = y;
      pending.rotation = rotation;
    }
    return false;
  }

  startDrag(event: PointerEvent<HTMLButtonElement>, tile: Tile) {
    if (!this.canMoveTile(tile) || event.button !== 0) return;
    this.cancelPendingDragPreview();
    event.preventDefault();
    const element = event.currentTarget;
    const bounds = element.getBoundingClientRect();
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const radians = (tile.rotation * Math.PI) / 180;
    const deltaX = event.clientX - (bounds.left + bounds.width / 2);
    const deltaY = event.clientY - (bounds.top + bounds.height / 2);
    const offsetX = Math.max(
      0,
      Math.min(
        width,
        width / 2 + deltaX * Math.cos(radians) + deltaY * Math.sin(radians),
      ),
    );
    const offsetY = Math.max(
      0,
      Math.min(
        height,
        height / 2 - deltaX * Math.sin(radians) + deltaY * Math.cos(radians),
      ),
    );
    const next: DragState = {
      tileId: tile.id,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      startClientX: event.clientX,
      startClientY: event.clientY,
      offsetX,
      offsetY,
      width,
      height,
      startRotation: tile.rotation,
      rotation: tile.rotation,
      angularVelocity: 0,
      destination: tile.zone,
      previewCenter: null,
      sharedPreview: false,
    };
    const previewArea =
      tile.zone === "board"
        ? this.areas.tableRef.current
        : this.areas.handRef.current;
    if (previewArea) {
      const center = projectDragCenter(next);
      const position = positionIn(previewArea, center.x, center.y);
      next.previewCenter = { x: position.centerX, y: position.centerY };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    this.dragRef.current = next;
    this.setDrag(next);
  }

  moveDrag(event: PointerEvent<HTMLButtonElement>, tile: Tile) {
    const current = this.dragRef.current;
    if (
      !current ||
      current.tileId !== tile.id ||
      current.pointerId !== event.pointerId
    )
      return;
    const deltaX = event.clientX - current.clientX;
    const deltaY = event.clientY - current.clientY;
    const angularVelocity = addTileDragImpulse({
      rotation: current.rotation,
      angularVelocity: current.angularVelocity,
      deltaX,
      deltaY,
      grabX: current.offsetX,
      grabY: current.offsetY,
      width: current.width,
      height: current.height,
    });
    const destination = this.dragDestination(event.clientX, event.clientY);
    const next: DragState = {
      ...current,
      clientX: event.clientX,
      clientY: event.clientY,
      angularVelocity,
      destination,
      previewCenter: null,
    };
    const previewArea =
      destination === "board"
        ? this.areas.tableRef.current
        : destination === "hand"
          ? this.areas.handRef.current
          : null;
    let sharedPosition: { x: number; y: number } | null = null;
    if (previewArea) {
      const center = projectDragCenter(next);
      const position = positionIn(previewArea, center.x, center.y);
      next.previewCenter = { x: position.centerX, y: position.centerY };
      if (destination === "board") sharedPosition = position;
    }
    if (destination === "board" && sharedPosition) {
      if (
        this.queueDragPreview(
          tile.id,
          sharedPosition.x,
          sharedPosition.y,
          next.rotation,
          event.timeStamp,
        )
      )
        next.sharedPreview = true;
    } else {
      this.cancelPendingDragPreview(tile.id);
      if (current.sharedPreview) {
        this.performAction({ kind: "drag-end", tileId: tile.id });
        next.sharedPreview = false;
      }
    }
    this.dragRef.current = next;
    this.setDrag(next);
  }

  finishDrag(event: PointerEvent<HTMLButtonElement>, tile: Tile) {
    const current = this.dragRef.current;
    if (
      !current ||
      current.tileId !== tile.id ||
      current.pointerId !== event.pointerId
    )
      return;
    this.cancelPendingDragPreview(tile.id);
    this.dragRef.current = null;
    this.setDrag(null);
    if (
      event.clientX === current.startClientX &&
      event.clientY === current.startClientY &&
      Math.abs(current.rotation - current.startRotation) < 0.001 &&
      Math.abs(current.angularVelocity) < 0.001
    ) {
      if (current.sharedPreview)
        this.performAction({ kind: "drag-end", tileId: tile.id });
      return;
    }

    const destination = this.dragDestination(event.clientX, event.clientY);
    const rotation = current.rotation;
    const center = projectDragCenter(
      current,
      event.clientX,
      event.clientY,
      rotation,
    );
    const discardArea = this.areas.discardRef.current;
    const tableArea = this.areas.tableRef.current;
    const handArea = this.areas.handRef.current;
    if (destination === "discard" && discardArea) {
      this.performAction({
        kind: "move",
        tileId: tile.id,
        destination: "discard",
        x: 0,
        y: 0,
        rotation,
      });
    } else if (destination === "board" && tableArea) {
      const { x, y } = positionIn(tableArea, center.x, center.y);
      this.performAction({
        kind: "move",
        tileId: tile.id,
        destination,
        x,
        y,
        rotation,
      });
    } else if (destination === "hand" && handArea) {
      const { x, y } = positionIn(handArea, center.x, center.y);
      this.performAction({
        kind: "move",
        tileId: tile.id,
        destination,
        x,
        y,
        rotation,
      });
    } else if (current.sharedPreview) {
      this.performAction({ kind: "drag-end", tileId: tile.id });
    }
  }

  cancelDrag(tileId: string) {
    this.cancelPendingDragPreview(tileId);
    if (
      this.dragRef.current?.tileId === tileId &&
      this.dragRef.current.sharedPreview
    )
      this.performAction({ kind: "drag-end", tileId });
    this.dragRef.current = null;
    this.setDrag(null);
  }

  handleTileKeyDown(event: KeyboardEvent<HTMLButtonElement>, tile: Tile) {
    if (!this.canMoveTile(tile)) return;
    const action = tileKeyboardAction(event.key, event.shiftKey, tile);
    if (!action) return;
    event.preventDefault();
    this.performAction(action);
  }
}

export function createDragController(
  options: DragControllerOptions,
): DragHandlers {
  return new DragController(options);
}
