import {
  MAX_GRANTED_TILES,
  type Action,
  type PendingDrawGrant,
} from "./types.ts";
import type { HostRefs } from "./host-previews.ts";
import { sendMessage } from "./protocol.ts";

export function sendDrawGrant(
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
