import type { TableState, Tile } from "../game.ts";
import { isTableState, isTile, parseMessage } from "./protocol.ts";
import type { SessionState } from "./session-state.ts";
import { playTileSound } from "./tile-sound.ts";
import { MAX_GRANTED_TILES } from "./types.ts";

export function handleGuestMessage(
  state: SessionState,
  updateRemoteDragPreview: (tileId: string, tile: Tile | null) => void,
  data: unknown,
  drawGrant: (grantId: string, count: number, blank: boolean) => void,
  playDrawSound = playTileSound,
) {
  const message = parseMessage(data);
  if (!message) return;
  if (message.type === "tile-drawn") {
    playDrawSound();
    return;
  }
  if (message.type === "draw-grant") {
    if (
      typeof message.grantId === "string" &&
      typeof message.count === "number" &&
      Number.isInteger(message.count) &&
      message.count > 0 &&
      message.count <= MAX_GRANTED_TILES
    )
      drawGrant(message.grantId, message.count, false);
    return;
  }
  if (message.type === "draw-blank-grant") {
    if (typeof message.grantId === "string")
      drawGrant(message.grantId, 1, true);
    return;
  }
  if (
    message.type === "tile-preview" &&
    isTile(message.tile) &&
    message.tile.zone === "board"
  ) {
    updateRemoteDragPreview(message.tile.id, message.tile);
    return;
  }
  if (
    message.type === "tile-preview-end" &&
    typeof message.tileId === "string"
  ) {
    updateRemoteDragPreview(message.tileId, null);
    return;
  }
  if (!isTableState(message.state)) return;
  updateGuestTable(
    state,
    message.type,
    message.playerId,
    message.state,
    message.finishedDragTileId,
    updateRemoteDragPreview,
  );
}

function updateGuestTable(
  state: SessionState,
  messageType: unknown,
  playerId: unknown,
  table: TableState,
  finishedDragTileId: unknown,
  updateRemoteDragPreview: (tileId: string, tile: Tile | null) => void,
) {
  if (messageType === "welcome" && typeof playerId === "string") {
    state.changeMyId(playerId);
    state.updateGame(table);
    state.setRemoteDragPreviews({});
    state.setConnectionState("connected");
    state.setSetupOpen(false);
    return;
  }
  if (messageType !== "snapshot") return;
  state.updateGame(table);
  if (typeof finishedDragTileId === "string")
    updateRemoteDragPreview(finishedDragTileId, null);
}
