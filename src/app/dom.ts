import { projectedTileCenter } from "../game.ts";
import type { DragState } from "./types.ts";

export function pointInside(element: HTMLElement | null, x: number, y: number) {
  if (!element) return false;
  const bounds = element.getBoundingClientRect();
  return (
    x >= bounds.left &&
    x <= bounds.right &&
    y >= bounds.top &&
    y <= bounds.bottom
  );
}

export function projectDragCenter(
  drag: DragState,
  pointerX = drag.clientX,
  pointerY = drag.clientY,
  rotation = drag.rotation,
) {
  return projectedTileCenter({
    pointerX,
    pointerY,
    grabX: drag.offsetX,
    grabY: drag.offsetY,
    width: drag.width,
    height: drag.height,
    rotation,
  });
}

export function positionIn(element: HTMLElement, x: number, y: number) {
  const bounds = element.getBoundingClientRect();
  const left = bounds.left + element.clientLeft;
  const top = bounds.top + element.clientTop;
  const width = element.clientWidth;
  const height = element.clientHeight;
  const centerX = Math.max(left, Math.min(left + width, x));
  const centerY = Math.max(top, Math.min(top + height, y));
  return {
    x: centerX - left - width / 2,
    y: centerY - top - height / 2,
    centerX,
    centerY,
  };
}
