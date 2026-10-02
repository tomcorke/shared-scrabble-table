import {
  discardPlayerTiles,
  returnBoardTilesToHands,
  type TableState,
} from "../game.ts";
import type { HostRefs } from "./host-previews.ts";
import type { SessionState } from "./session-state.ts";
import type { HostAction } from "./types.ts";

type Rack = { viewportWidth: number; rackWidth: number; rackHeight: number };
type ModerationContext = {
  state: SessionState;
  refs: HostRefs;
  commitHostState(next: TableState): TableState;
  broadcast(): void;
  cancelPending(channel: RTCDataChannel): void;
  endDragPreview(tileId: string): boolean;
  disconnectHostChannel(inviteId: string, channel: RTCDataChannel): void;
};

export class HostModeration {
  private readonly context: ModerationContext;

  constructor(context: ModerationContext) {
    this.context = context;
  }

  perform = (action: HostAction, rack?: Rack) => {
    switch (action.kind) {
      case "clear-shared-area":
        clearSharedArea(this.context, rack);
        break;
      case "discard-player-tiles":
        discardPlayer(this.context, action.playerId);
        break;
      case "set-player-vip":
        setPlayerVip(this.context, action.playerId, action.isVip);
        break;
      case "disconnect-player":
        disconnectPlayer(this.context, action.playerId);
        break;
    }
  };
}

function clearSharedArea(context: ModerationContext, rack?: Rack) {
  const current = context.state.gameRef.current;
  if (!rack || !current.tiles.some((tile) => tile.zone === "board")) return;
  // ponytail: use host rack bounds; report per-player bounds if mixed-screen racks overflow.
  commitAndBroadcast(context, {
    ...current,
    tiles: returnBoardTilesToHands(
      current.tiles,
      rack.viewportWidth,
      rack.rackWidth,
      rack.rackHeight,
    ),
  });
}

function discardPlayer(context: ModerationContext, playerId: string) {
  const current = context.state.gameRef.current;
  if (!current.players.some((player) => player.id === playerId)) return;
  const tiles = discardPlayerTiles(current.tiles, playerId);
  if (tiles.length === current.tiles.length) return;
  commitAndBroadcast(context, { ...current, tiles });
}

function setPlayerVip(
  context: ModerationContext,
  playerId: string,
  isVip: boolean,
) {
  const current = context.state.gameRef.current;
  const player = current.players.find((candidate) => candidate.id === playerId);
  if (
    !player ||
    player.id === context.state.myIdRef.current ||
    player.isVip === isVip ||
    ![...context.refs.channels.values()].includes(player.id)
  )
    return;

  if (player.isVip && !isVip) {
    for (const [channel, moverId] of context.refs.channels) {
      if (moverId === player.id) context.cancelPending(channel);
    }
    for (const [tileId, moverId] of context.refs.activeDragPlayers) {
      if (moverId === player.id) context.endDragPreview(tileId);
    }
  }
  commitAndBroadcast(context, {
    ...current,
    players: current.players.map((candidate) =>
      candidate.id === player.id ? { ...candidate, isVip } : candidate,
    ),
  });
}

function disconnectPlayer(context: ModerationContext, playerId: string) {
  if (playerId === context.state.myIdRef.current) return;
  const entry = [...context.refs.peerChannels].find(
    ([, channel]) => context.refs.channels.get(channel) === playerId,
  );
  if (!entry) return;
  const [inviteId, channel] = entry;
  channel.onclose = null;
  context.disconnectHostChannel(inviteId, channel);
  channel.close();
}

function commitAndBroadcast(context: ModerationContext, next: TableState) {
  context.commitHostState(next);
  context.broadcast();
}
