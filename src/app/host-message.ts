import {
  createTile,
  MAX_POSITION_OFFSET,
  MAX_TILE_ROTATION,
  moveTile,
  type Player,
  type TableState,
  type Tile,
} from "../game.ts";
import {
  isRecord,
  parseMessage,
  playerColor,
  positiveDimension,
  sendMessage,
} from "./protocol.ts";
import type { SessionState } from "./session-state.ts";
import type { InviteStatus } from "./types.ts";

export type HostMessageContext = {
  state: SessionState;
  hostChannels: Map<RTCDataChannel, string>;
  setInviteStatus(id: string, status: InviteStatus): void;
  commitHostState(next: TableState): TableState;
  snapshotFor(playerId: string): TableState;
  queuePeerDragPreview(channel: RTCDataChannel, tile: Tile): void;
  cancelPendingPeerDragUpdate(channel: RTCDataChannel): void;
  endDragPreview(tileId: string, excludedChannel?: RTCDataChannel): boolean;
  clearDragPreview(tileId: string): void;
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
  if (message.type !== "action" || !isRecord(message.action)) return;

  const playerId = context.hostChannels.get(channel);
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
    (candidate) => candidate.id === tileId && candidate.ownerId === playerId,
  );
  if (!tile) return false;
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
      (tile) => tile.id === tileId && tile.ownerId === playerId,
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
  const viewportWidth = positiveDimension(
    action.viewportWidth,
    window.innerWidth,
  );
  const rackWidth = positiveDimension(action.rackWidth, window.innerWidth);
  const rackHeight = positiveDimension(action.rackHeight, 108);
  context.commitHostState({
    ...current,
    tiles: [
      ...current.tiles,
      createTile(playerId, current.tiles, viewportWidth, rackWidth, rackHeight),
    ],
  });
  context.broadcast();
  return true;
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
      (tile) => tile.id === tileId && tile.ownerId === playerId,
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
  );
  context.commitHostState({ ...current, tiles });
  context.clearDragPreview(tileId);
  context.broadcast(tileId);
}
