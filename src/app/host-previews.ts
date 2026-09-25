import {
  canSendDragUpdate,
  DRAG_UPDATE_INTERVAL_MS,
  type Tile,
} from "../game.ts";
import { sendMessage } from "./protocol.ts";
import type { PendingPeerDragUpdate } from "./types.ts";

export type HostRefs = {
  peers: Map<string, RTCPeerConnection>;
  channels: Map<RTCDataChannel, string>;
  lastDragUpdateAt: Map<RTCDataChannel, number>;
  pendingDragUpdates: Map<RTCDataChannel, PendingPeerDragUpdate>;
  activeDragOwners: Map<string, string>;
};

export class HostPreviews {
  private readonly refs: HostRefs;
  private readonly updateRemoteDragPreview: (
    tileId: string,
    tile: Tile | null,
  ) => void;

  constructor(
    refs: HostRefs,
    updateRemoteDragPreview: (tileId: string, tile: Tile | null) => void,
  ) {
    this.refs = refs;
    this.updateRemoteDragPreview = updateRemoteDragPreview;
  }

  broadcast = (
    tile: Tile,
    excludedChannel?: RTCDataChannel,
    showOnHost = false,
  ) => {
    this.refs.activeDragOwners.set(tile.id, tile.ownerId);
    if (showOnHost) this.updateRemoteDragPreview(tile.id, tile);
    for (const channel of this.refs.channels.keys()) {
      if (channel !== excludedChannel)
        sendMessage(channel, { type: "tile-preview", tile });
    }
  };

  cancelPending = (channel: RTCDataChannel) => {
    const pending = this.refs.pendingDragUpdates.get(channel);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    this.refs.pendingDragUpdates.delete(channel);
  };

  queue = (channel: RTCDataChannel, tile: Tile) => {
    const relay = (preview: Tile, sentAt: number) => {
      this.refs.lastDragUpdateAt.set(channel, sentAt);
      this.broadcast(preview, channel, true);
    };
    const now = performance.now();
    const lastSentAt = this.refs.lastDragUpdateAt.get(channel) ?? -Infinity;
    if (canSendDragUpdate(now, lastSentAt)) {
      this.cancelPending(channel);
      relay(tile, now);
      return;
    }

    let pending = this.refs.pendingDragUpdates.get(channel);
    if (!pending) {
      pending = { tile, timer: 0 };
      this.refs.pendingDragUpdates.set(channel, pending);
    } else {
      pending.tile = tile;
    }
    if (pending.timer === 0) {
      const flush = () => {
        if (this.refs.pendingDragUpdates.get(channel) !== pending) return;
        if (this.refs.channels.get(channel) !== pending.tile.ownerId) {
          this.refs.pendingDragUpdates.delete(channel);
          return;
        }
        const sentAt = performance.now();
        const last = this.refs.lastDragUpdateAt.get(channel) ?? -Infinity;
        if (!canSendDragUpdate(sentAt, last)) {
          pending.timer = window.setTimeout(
            flush,
            last + DRAG_UPDATE_INTERVAL_MS - sentAt,
          );
          return;
        }
        this.refs.pendingDragUpdates.delete(channel);
        relay(pending.tile, sentAt);
      };
      pending.timer = window.setTimeout(
        flush,
        Math.max(0, lastSentAt + DRAG_UPDATE_INTERVAL_MS - now),
      );
    }
  };

  clear = (tileId: string) => {
    this.refs.activeDragOwners.delete(tileId);
    this.updateRemoteDragPreview(tileId, null);
  };

  end = (tileId: string, excludedChannel?: RTCDataChannel) => {
    if (!this.refs.activeDragOwners.has(tileId)) return false;
    this.clear(tileId);
    for (const channel of this.refs.channels.keys()) {
      if (channel !== excludedChannel)
        sendMessage(channel, { type: "tile-preview-end", tileId });
    }
    return true;
  };
}
