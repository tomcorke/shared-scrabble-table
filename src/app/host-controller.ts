import {
  discardHandTiles,
  moveTile,
  snapshotForPlayer,
  type TableState,
  type Tile,
} from "../game.ts";
import { handleHostMessage, type HostMessageContext } from "./host-message.ts";
import { sendDrawGrant } from "./host-draw-grants.ts";
import { HostModeration } from "./host-moderation.ts";
import { HostPreviews, type HostRefs } from "./host-previews.ts";
import { countTiles, sendMessage } from "./protocol.ts";
import type { SessionState } from "./session-state.ts";
import { playTileSound } from "./tile-sound.ts";
import type { Action, InviteStatus, PendingDrawGrant } from "./types.ts";

export class HostController {
  private readonly state: SessionState;
  private readonly refs: HostRefs;
  private readonly previews: HostPreviews;
  readonly performHostAction: HostModeration["perform"];
  private readonly pendingDrawGrants = new Map<string, PendingDrawGrant>();

  constructor(
    state: SessionState,
    updateRemoteDragPreview: (tileId: string, tile: Tile | null) => void,
  ) {
    this.state = state;
    this.refs = {
      peers: new Map(),
      peerChannels: new Map(),
      channels: new Map(),
      lastDragUpdateAt: new Map(),
      pendingDragUpdates: new Map(),
      activeDragOwners: new Map(),
      activeDragPlayers: new Map(),
    };
    this.previews = new HostPreviews(this.refs, updateRemoteDragPreview);
    const moderation = new HostModeration({
      state: this.state,
      refs: this.refs,
      commitHostState: this.commitHostState,
      broadcast: this.broadcast,
      cancelPending: this.previews.cancelPending,
      endDragPreview: this.previews.end,
      disconnectHostChannel: this.disconnectHostChannel,
    });
    this.performHostAction = moderation.perform;
  }

  addPeer(id: string, peer: RTCPeerConnection, channel?: RTCDataChannel) {
    this.refs.peers.set(id, peer);
    if (channel) this.refs.peerChannels.set(id, channel);
  }

  removePeer(id: string) {
    this.refs.peers.delete(id);
    this.refs.peerChannels.delete(id);
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
      this.signalTileSound();
    }
    this.state.gameRef.current = updated;
    this.state.setGame(updated);
    return updated;
  };

  private signalTileSound() {
    playTileSound();
    for (const channel of this.refs.channels.keys())
      sendMessage(channel, { type: "tile-drawn" });
  }

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

  readonly disconnectHostChannel = (
    inviteId: string,
    channel: RTCDataChannel,
  ) => {
    const playerId = this.refs.channels.get(channel);
    this.previews.cancelPending(channel);
    this.refs.channels.delete(channel);
    this.refs.peerChannels.delete(inviteId);
    this.refs.lastDragUpdateAt.delete(channel);
    const peer = this.refs.peers.get(inviteId);
    if (peer) {
      peer.onconnectionstatechange = null;
      peer.close();
      this.refs.peers.delete(inviteId);
    }
    if (playerId) this.removeConnectedPlayer(playerId);
    this.setInviteStatus(inviteId, "disconnected");
  };

  private removeConnectedPlayer(playerId: string) {
    for (const [grantId, grant] of this.pendingDrawGrants) {
      if (grant.playerId === playerId) this.pendingDrawGrants.delete(grantId);
    }
    for (const [tileId, ownerId] of this.refs.activeDragOwners) {
      if (ownerId === playerId) this.previews.end(tileId);
    }
    for (const [tileId, moverId] of this.refs.activeDragPlayers) {
      if (moverId === playerId) this.previews.end(tileId);
    }
    const current = this.state.gameRef.current;
    this.commitHostState({
      ...current,
      players: current.players.filter((player) => player.id !== playerId),
      tiles: current.tiles.filter((tile) => tile.ownerId !== playerId),
    });
    this.broadcast();
  }

  closeHostConnections = () => {
    for (const channel of this.refs.pendingDragUpdates.keys())
      this.previews.cancelPending(channel);
    for (const channel of this.refs.channels.keys()) {
      channel.onclose = null;
      channel.close();
    }
    for (const [id, channel] of this.refs.peerChannels) {
      channel.onclose = null;
      if (!this.refs.channels.has(channel)) channel.close();
      this.refs.peerChannels.delete(id);
    }
    this.refs.channels.clear();
    this.refs.activeDragOwners.clear();
    this.refs.activeDragPlayers.clear();
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
      signalTileSound: this.signalTileSound.bind(this),
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
            (candidate.ownerId === this.state.myIdRef.current ||
              candidate.zone === "board"),
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
      case "move": {
        const tiles = moveTile(
          current.tiles,
          action.tileId,
          this.state.myIdRef.current,
          action.destination,
          action.x,
          action.y,
          action.rotation,
          true,
        );
        if (tiles === current.tiles) break;
        this.signalTileSound();
        this.commitHostState({ ...current, tiles });
        this.previews.clear(action.tileId);
        this.broadcast(action.tileId);
        break;
      }
    }
  };
}
