import type { Tile } from "../game.ts";
import type { Action } from "./types.ts";

export function tileKeyboardAction(
  key: string,
  shiftKey: boolean,
  tile: Tile,
): Action | null {
  if (key === "Enter" || key === " ") {
    return {
      kind: "move",
      tileId: tile.id,
      destination: tile.zone === "hand" ? "board" : "hand",
      x: tile.x,
      y: tile.y,
      rotation: tile.rotation,
    };
  }
  if (key === "Backspace" || key === "Delete") {
    return {
      kind: "move",
      tileId: tile.id,
      destination: "discard",
      x: 0,
      y: 0,
      rotation: tile.rotation,
    };
  }
  if (!key.startsWith("Arrow")) return null;

  const step = shiftKey ? 8 : 3;
  const x =
    tile.x + (key === "ArrowRight" ? step : key === "ArrowLeft" ? -step : 0);
  const y =
    tile.y + (key === "ArrowDown" ? step : key === "ArrowUp" ? -step : 0);
  return {
    kind: "move",
    tileId: tile.id,
    destination: tile.zone,
    x,
    y,
    rotation: tile.rotation,
  };
}
