import {
  canMoveTile,
  discardHandTiles,
  MAX_POSITION_OFFSET,
  MAX_TILE_ROTATION,
  moveTile,
  type Player,
  type TableState,
  type Tile,
} from "../game.ts";
import {
  isRecord,
  isTile,
  parseMessage,
  playerColor,
  sendMessage,
} from "./protocol.ts";
import type { SessionState } from "./session-state.ts";
import type { InviteStatus, PendingDrawGrant } from "./types.ts";

export type HostMessageContext = {
  state: SessionState;
  hostChannels: Map<RTCDataChannel, string>;
  pendingDrawGrants: Map<string, PendingDrawGrant>;
  setInviteStatus(id: string, status: InviteStatus): void;
  commitHostState(next: TableState): TableState;
  snapshotFor(playerId: string): TableState;
  queuePeerDragPreview(channel: RTCDataChannel, tile: Tile): void;
  cancelPendingPeerDragUpdate(channel: RTCDataChannel): void;
  endDragPreview(tileId: string, excludedChannel?: RTCDataChannel): boolean;
  clearDragPreview(tileId: string): void;
  signalTileSound(): void;
  broadcast(finishedDragTileId?: string): void;
};

export function handleHostMessage(
  context: HostMessageContext,
  inviteId: string,
  channel: RTCDataChannel,
  data: unknown,
) {
  const message = parseMessage(data);
  if (!message) return;

  if (message.type === "hello" && typeof message.name === "string") {
    handleHostHello(context, inviteId, channel, message.name);
    return;
  }
  const playerId = context.hostChannels.get(channel);
  if (message.type === "draw-grant-result") {
    if (playerId) handleDrawGrantResult(context, playerId, message);
    return;
  }
  if (message.type !== "action" || !isRecord(message.action)) return;
  if (playerId) handleHostAction(context, channel, playerId, message.action);
}

function handleHostHello(
  context: HostMessageContext,
  inviteId: string,
  channel: RTCDataChannel,
  name: string,
) {
  if (context.hostChannels.has(channel)) return;
  const current = context.state.gameRef.current;
  const playerId = crypto.randomUUID();
  const player: Player = {
    id: playerId,
    name: name.trim().slice(0, 24) || "Guest",
    color: playerColor(current.players.length),
    tileCount: 0,
    isVip: false,
  };
  context.hostChannels.set(channel, playerId);
  const updated = context.commitHostState({
    ...current,
    players: [...current.players, player],
  });
  sendMessage(channel, {
    type: "welcome",
    playerId,
    state: context.snapshotFor(playerId),
  });
  context.setInviteStatus(inviteId, "connected");
  if (updated.players.length > 1) context.state.setConnectionState("connected");
  context.broadcast();
}

function handleHostAction(
  context: HostMessageContext,
  channel: RTCDataChannel,
  playerId: string,
  action: Record<string, unknown>,
) {
  if (handleDragPreview(context, channel, playerId, action)) return;
  if (handleDragEnd(context, channel, playerId, action)) return;
  if (handleDraw(context, playerId, action)) return;
  if (handleDiscardAll(context, playerId, action)) return;
  handleMove(context, channel, playerId, action);
}

function handleDragPreview(
  context: HostMessageContext,
  channel: RTCDataChannel,
  playerId: string,
  action: Record<string, unknown>,
) {
  const { kind, tileId, x, y, rotation } = action;
  if (
    kind !== "drag-preview" ||
    typeof tileId !== "string" ||
    typeof x !== "number" ||
    !Number.isFinite(x) ||
    Math.abs(x) > MAX_POSITION_OFFSET ||
    typeof y !== "number" ||
    !Number.isFinite(y) ||
    Math.abs(y) > MAX_POSITION_OFFSET ||
    typeof rotation !== "number" ||
    !Number.isFinite(rotation) ||
    Math.abs(rotation) > MAX_TILE_ROTATION
  )
    return false;

  const tile = context.state.gameRef.current.tiles.find(
    (candidate) => candidate.id === tileId,
  );
  if (!tile || !canMovePlayerTile(context, playerId, tile)) return false;
  context.queuePeerDragPreview(channel, {
    ...tile,
    zone: "board",
    x,
    y,
    rotation,
  });
  return true;
}

function handleDragEnd(
  context: HostMessageContext,
  channel: RTCDataChannel,
  playerId: string,
  action: Record<string, unknown>,
) {
  const { kind, tileId } = action;
  if (
    kind !== "drag-end" ||
    typeof tileId !== "string" ||
    !context.state.gameRef.current.tiles.some(
      (tile) =>
        tile.id === tileId && canMovePlayerTile(context, playerId, tile),
    )
  )
    return false;

  context.cancelPendingPeerDragUpdate(channel);
  context.endDragPreview(tileId, channel);
  return true;
}

function handleDraw(
  context: HostMessageContext,
  playerId: string,
  action: Record<string, unknown>,
) {
  if (action.kind !== "draw") return false;
  const current = context.state.gameRef.current;
  const tile = action.tile;
  const occupiedIds = new Set(current.tiles.map((item) => item.id));
  if (!isDrawnHandTile(tile, playerId, occupiedIds)) return true;
  if (
    tile.face === "?"
      ? !current.drawOptions.allowClientBlankDraw
      : !current.drawOptions.allowClientDraw
  )
    return true;
  appendDrawnTiles(context, [tile]);
  return true;
}

function handleDiscardAll(
  context: HostMessageContext,
  playerId: string,
  action: Record<string, unknown>,
) {
  if (action.kind !== "discard-all") return false;
  const current = context.state.gameRef.current;
  context.commitHostState({
    ...current,
    tiles: discardHandTiles(current.tiles, playerId),
  });
  context.broadcast();
  return true;
}

function handleDrawGrantResult(
  context: HostMessageContext,
  playerId: string,
  message: Record<string, unknown>,
) {
  if (typeof message.grantId !== "string") return;
  const grant = context.pendingDrawGrants.get(message.grantId);
  if (!grant || grant.playerId !== playerId || grant.received >= grant.count)
    return;
  const current = context.state.gameRef.current;
  const occupiedIds = new Set(current.tiles.map((tile) => tile.id));
  const tile = message.tile;
  if (
    !isDrawnHandTile(tile, playerId, occupiedIds) ||
    (tile.face === "?") !== grant.blank
  )
    return;
  grant.received++;
  if (grant.received === grant.count)
    context.pendingDrawGrants.delete(message.grantId);
  appendDrawnTiles(context, [tile]);
}

function isDrawnHandTile(
  value: unknown,
  playerId: string,
  occupiedIds: Set<string>,
): value is Tile {
  if (
    !isTile(value) ||
    value.ownerId !== playerId ||
    value.zone !== "hand" ||
    occupiedIds.has(value.id)
  )
    return false;
  occupiedIds.add(value.id);
  return true;
}

function appendDrawnTiles(context: HostMessageContext, tiles: Tile[]) {
  const current = context.state.gameRef.current;
  context.commitHostState({ ...current, tiles: [...current.tiles, ...tiles] });
  context.broadcast();
}

function canMovePlayerTile(
  context: HostMessageContext,
  playerId: string,
  tile: Tile,
) {
  const player = context.state.gameRef.current.players.find(
    (candidate) => candidate.id === playerId,
  );
  return canMoveTile(tile, playerId, player?.isVip === true);
}

function handleMove(
  context: HostMessageContext,
  channel: RTCDataChannel,
  playerId: string,
  action: Record<string, unknown>,
) {
  const { kind, tileId, destination, x, y, rotation } = action;
  const current = context.state.gameRef.current;
  if (
    kind !== "move" ||
    typeof tileId !== "string" ||
    (destination !== "hand" &&
      destination !== "board" &&
      destination !== "discard") ||
    typeof x !== "number" ||
    !Number.isFinite(x) ||
    typeof y !== "number" ||
    !Number.isFinite(y) ||
    typeof rotation !== "number" ||
    !Number.isFinite(rotation) ||
    !current.tiles.some(
      (tile) =>
        tile.id === tileId && canMovePlayerTile(context, playerId, tile),
    )
  )
    return;

  context.cancelPendingPeerDragUpdate(channel);
  const tiles = moveTile(
    current.tiles,
    tileId,
    playerId,
    destination,
    x,
    y,
    rotation,
    current.players.some(
      (player) => player.id === playerId && player.isVip === true,
    ),
  );
  context.signalTileSound();
  context.commitHostState({ ...current, tiles });
  context.clearDragPreview(tileId);
  context.broadcast(tileId);
}
