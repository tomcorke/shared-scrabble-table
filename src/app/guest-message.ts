import type { TableState, Tile } from "../game.ts";
import { isTableState, isTile, parseMessage } from "./protocol.ts";
import type { SessionState } from "./session-state.ts";

export function handleGuestMessage(
  state: SessionState,
  updateRemoteDragPreview: (tileId: string, tile: Tile | null) => void,
  data: unknown,
) {
  const message = parseMessage(data);
  if (!message) return;
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
