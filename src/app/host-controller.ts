import {
  discardHandTiles,
  moveTile,
  snapshotForPlayer,
  type TableState,
  type Tile,
} from "../game.ts";
import { handleHostMessage, type HostMessageContext } from "./host-message.ts";
import { HostPreviews, type HostRefs } from "./host-previews.ts";
import { countTiles, sendMessage } from "./protocol.ts";
import type { SessionState } from "./session-state.ts";
import { playTileSound } from "./tile-sound.ts";
import {
  MAX_GRANTED_TILES,
  type Action,
  type InviteStatus,
  type PendingDrawGrant,
} from "./types.ts";

export class HostController {
  private readonly state: SessionState;
  private readonly refs: HostRefs;
  private readonly previews: HostPreviews;
  private readonly pendingDrawGrants = new Map<string, PendingDrawGrant>();

  constructor(
    state: SessionState,
    updateRemoteDragPreview: (tileId: string, tile: Tile | null) => void,
  ) {
    this.state = state;
    this.refs = {
      peers: new Map(),
      channels: new Map(),
      lastDragUpdateAt: new Map(),
      pendingDragUpdates: new Map(),
      activeDragOwners: new Map(),
    };
    this.previews = new HostPreviews(this.refs, updateRemoteDragPreview);
  }

  addPeer(id: string, peer: RTCPeerConnection) {
    this.refs.peers.set(id, peer);
  }

  removePeer(id: string) {
    this.refs.peers.delete(id);
  }

  getPeer(id: string) {
    return this.refs.peers.get(id);
  }

  setInviteStatus = (id: string, status: InviteStatus) => {
    this.state.setInvites((current) =>
      current.map((invite) =>
        invite.id === id ? { ...invite, status } : invite,
      ),
    );
  };

  commitHostState = (next: TableState) => {
    const previous = this.state.gameRef.current;
    const updated = { ...next, players: countTiles(next.players, next.tiles) };
    const previousIds = new Set(previous.tiles.map((tile) => tile.id));
    for (const tile of updated.tiles) {
      if (previousIds.has(tile.id)) continue;
      previousIds.add(tile.id);
      playTileSound();
      for (const channel of this.refs.channels.keys())
        sendMessage(channel, { type: "tile-drawn" });
    }
    this.state.gameRef.current = updated;
    this.state.setGame(updated);
    return updated;
  };

  snapshotFor = (playerId: string) =>
    snapshotForPlayer(this.state.gameRef.current, playerId);

  broadcast = (finishedDragTileId?: string) => {
    for (const [channel, playerId] of this.refs.channels) {
      sendMessage(channel, {
        type: "snapshot",
        state: this.snapshotFor(playerId),
        finishedDragTileId,
      });
    }
  };

  disconnectHostChannel = (inviteId: string, channel: RTCDataChannel) => {
    const playerId = this.refs.channels.get(channel);
    this.previews.cancelPending(channel);
    this.refs.channels.delete(channel);
    this.refs.lastDragUpdateAt.delete(channel);
    if (playerId) {
      for (const [grantId, grant] of this.pendingDrawGrants) {
        if (grant.playerId === playerId) this.pendingDrawGrants.delete(grantId);
      }
      for (const [tileId, ownerId] of this.refs.activeDragOwners) {
        if (ownerId === playerId) this.previews.end(tileId);
      }
      const current = this.state.gameRef.current;
      this.commitHostState({
        ...current,
        players: current.players.filter((player) => player.id !== playerId),
        tiles: current.tiles.filter((tile) => tile.ownerId !== playerId),
      });
      this.broadcast();
    }
    this.setInviteStatus(inviteId, "disconnected");
  };

  closeHostConnections = () => {
    for (const channel of this.refs.pendingDragUpdates.keys())
      this.previews.cancelPending(channel);
    for (const channel of this.refs.channels.keys()) {
      channel.onclose = null;
      channel.close();
    }
    this.refs.channels.clear();
    this.refs.activeDragOwners.clear();
    this.refs.lastDragUpdateAt.clear();
    this.pendingDrawGrants.clear();
    for (const peer of this.refs.peers.values()) {
      peer.onconnectionstatechange = null;
      peer.close();
    }
    this.refs.peers.clear();
  };

  handleMessage = (
    inviteId: string,
    channel: RTCDataChannel,
    data: unknown,
  ) => {
    const context: HostMessageContext = {
      state: this.state,
      hostChannels: this.refs.channels,
      pendingDrawGrants: this.pendingDrawGrants,
      setInviteStatus: this.setInviteStatus.bind(this),
      commitHostState: this.commitHostState.bind(this),
      snapshotFor: this.snapshotFor.bind(this),
      queuePeerDragPreview: this.previews.queue.bind(this.previews),
      cancelPendingPeerDragUpdate: this.previews.cancelPending.bind(
        this.previews,
      ),
      endDragPreview: this.previews.end.bind(this.previews),
      clearDragPreview: this.previews.clear.bind(this.previews),
      broadcast: this.broadcast.bind(this),
    };
    handleHostMessage(context, inviteId, channel, data);
  };

  performAction = (action: Action) => {
    const current = this.state.gameRef.current;
    switch (action.kind) {
      case "draw":
        if (action.tile.ownerId !== this.state.myIdRef.current) break;
        this.commitHostState({
          ...current,
          tiles: [...current.tiles, action.tile],
        });
        this.broadcast();
        break;
      case "discard-all":
        this.commitHostState({
          ...current,
          tiles: discardHandTiles(current.tiles, this.state.myIdRef.current),
        });
        this.broadcast();
        break;
      case "set-draw-options":
        this.commitHostState({ ...current, drawOptions: action.drawOptions });
        this.broadcast();
        break;
      case "grant-draw":
        sendDrawGrant(this.refs, this.pendingDrawGrants, action);
        break;
      case "drag-preview": {
        const tile = current.tiles.find(
          (candidate) =>
            candidate.id === action.tileId &&
            candidate.ownerId === this.state.myIdRef.current,
        );
        if (tile)
          this.previews.broadcast({
            ...tile,
            zone: "board",
            x: action.x,
            y: action.y,
            rotation: action.rotation,
          });
        break;
      }
      case "drag-end":
        this.previews.end(action.tileId);
        break;
      case "move":
        this.commitHostState({
          ...current,
          tiles: moveTile(
            current.tiles,
            action.tileId,
            this.state.myIdRef.current,
            action.destination,
            action.x,
            action.y,
            action.rotation,
          ),
        });
        this.previews.clear(action.tileId);
        this.broadcast(action.tileId);
        break;
    }
  };
}

function sendDrawGrant(
  refs: HostRefs,
  pendingDrawGrants: Map<string, PendingDrawGrant>,
  action: Extract<Action, { kind: "grant-draw" }>,
) {
  if (
    !Number.isInteger(action.count) ||
    action.count < 1 ||
    action.count > MAX_GRANTED_TILES
  )
    return;
  let channel: RTCDataChannel | undefined;
  for (const [candidate, playerId] of refs.channels) {
    if (playerId === action.playerId) {
      channel = candidate;
      break;
    }
  }
  if (!channel) return;
  const grantId = crypto.randomUUID();
  const count = action.blank ? 1 : action.count;
  pendingDrawGrants.set(grantId, {
    playerId: action.playerId,
    count,
    blank: action.blank,
    received: 0,
  });
  sendMessage(
    channel,
    action.blank
      ? { type: "draw-blank-grant", grantId }
      : { type: "draw-grant", grantId, count },
  );
}
