import type { MutableRefObject } from "react";
import {
  createTile,
  moveTile,
  snapshotForPlayer,
  type TableState,
  type Tile,
} from "../game.ts";
import { handleHostMessage, type HostMessageContext } from "./host-message.ts";
import { HostPreviews, type HostRefs } from "./host-previews.ts";
import { countTiles, sendMessage } from "./protocol.ts";
import type { SessionState } from "./session-state.ts";
import type { Action, InviteStatus } from "./types.ts";

export class HostController {
  private readonly state: SessionState;
  private readonly refs: HostRefs;
  private readonly handRef: MutableRefObject<HTMLDivElement | null>;
  private readonly previews: HostPreviews;

  constructor(
    state: SessionState,
    handRef: MutableRefObject<HTMLDivElement | null>,
    updateRemoteDragPreview: (tileId: string, tile: Tile | null) => void,
  ) {
    this.state = state;
    this.handRef = handRef;
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
    const updated = { ...next, players: countTiles(next.players, next.tiles) };
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
      for (const [tileId, ownerId] of this.refs.activeDragOwners) {
        if (ownerId === playerId) this.previews.end(tileId);
      }
      const current = this.state.gameRef.current;
      this.commitHostState({
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
        this.commitHostState({
          ...current,
          tiles: [
            ...current.tiles,
            createTile(
              this.state.myIdRef.current,
              current.tiles,
              window.innerWidth,
              this.handRef.current?.clientWidth ?? window.innerWidth,
              this.handRef.current?.clientHeight ?? 108,
            ),
          ],
        });
        this.broadcast();
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
