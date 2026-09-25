import type { KeyboardEvent, PointerEvent } from "react";
import type { Player, Tile } from "../game.ts";
import type { DragHandlers } from "../app/drag-controller.ts";
import type { DragState } from "../app/types.ts";

export function TileButton({
  tile,
  players,
  drag,
  isRemotePreview = false,
  handlers,
}: {
  tile: Tile;
  players: Player[];
  drag: DragState | null;
  isRemotePreview?: boolean;
  handlers: DragHandlers;
}) {
  const owner = players.find((player) => player.id === tile.ownerId);
  const isDragging = drag?.tileId === tile.id;
  const isBlank = tile.face === "?";
  const style = isDragging
    ? {
        left: drag.clientX - drag.offsetX,
        top: drag.clientY - drag.offsetY - 8,
        transformOrigin: `${drag.offsetX}px ${drag.offsetY}px`,
        transform: `rotate(${drag.rotation}deg)`,
      }
    : {
        left: `calc(50% ${tile.x < 0 ? "-" : "+"} ${Math.abs(tile.x)}px)`,
        top: `calc(50% ${tile.y < 0 ? "-" : "+"} ${Math.abs(tile.y)}px)`,
        transform: `translate(-50%, -50%) rotate(${tile.rotation}deg)`,
      };

  return (
    <button
      type="button"
      className={`scrabble-tile ${tile.zone === "board" ? "public-tile" : "private-tile"}${isDragging ? " is-dragging" : ""}${isRemotePreview ? " remote-drag-preview" : ""}`}
      style={style}
      aria-label={`${isBlank ? "Blank" : tile.face} tile, ${tile.points} points. ${
        owner?.name ?? "Player"
      } owns it. Press Enter to move between your rack and the table; arrow keys to nudge; Backspace to discard.`}
      title={`${owner?.name ?? "Player"}${tile.zone === "board" ? " · public tile" : " · your rack"}`}
      onPointerDown={(event: PointerEvent<HTMLButtonElement>) =>
        handlers.startDrag(event, tile)
      }
      onPointerMove={(event: PointerEvent<HTMLButtonElement>) =>
        handlers.moveDrag(event, tile)
      }
      onPointerUp={(event: PointerEvent<HTMLButtonElement>) =>
        handlers.finishDrag(event, tile)
      }
      onPointerCancel={() => handlers.cancelDrag(tile.id)}
      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) =>
        handlers.handleTileKeyDown(event, tile)
      }
    >
      {tile.zone === "board" && (
        <span
          className="tile-owner-dot"
          style={{ backgroundColor: owner?.color ?? "#777" }}
          aria-hidden="true"
        />
      )}
      <span className="tile-face">{isBlank ? "" : tile.face}</span>
      <span className="tile-points">{tile.points || ""}</span>
    </button>
  );
}
