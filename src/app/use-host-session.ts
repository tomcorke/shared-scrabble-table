import { useEffect, useState } from "react";
import type { MutableRefObject } from "react";
import type { Tile } from "../game.ts";
import { parseSessionDescription } from "../signalling.ts";
import { HostController } from "./host-controller.ts";
import { ICE_SERVERS, waitForIceCandidates } from "./protocol.ts";
import type { SessionState } from "./session-state.ts";

export function useHostSession(
  state: SessionState,
  handRef: MutableRefObject<HTMLDivElement | null>,
  updateRemoteDragPreview: (tileId: string, tile: Tile | null) => void,
) {
  const [controller] = useState(
    () => new HostController(state, handRef, updateRemoteDragPreview),
  );

  useEffect(() => () => controller.closeHostConnections(), [controller]);

  const createInvite = async () => {
    const id = crypto.randomUUID();
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    controller.addPeer(id, peer);
    const channel = peer.createDataChannel("shared-scrabble-table");
    channel.onopen = () => controller.setInviteStatus(id, "connecting");
    channel.onmessage = ({ data }) =>
      controller.handleMessage(id, channel, data);
    channel.onclose = () => controller.disconnectHostChannel(id, channel);
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed")
        controller.setInviteStatus(id, "failed");
      if (peer.connectionState === "closed")
        controller.setInviteStatus(id, "disconnected");
    };

    try {
      await peer.setLocalDescription(await peer.createOffer());
      await waitForIceCandidates(peer);
      state.setInvites((current) => [
        ...current,
        {
          id,
          offer: JSON.stringify(peer.localDescription),
          answer: "",
          status: "ready",
        },
      ]);
    } catch (caught) {
      controller.removePeer(id);
      peer.close();
      throw caught;
    }
  };

  const applyAnswer = async (inviteId: string) => {
    const invite = state.invites.find((item) => item.id === inviteId);
    const peer = controller.getPeer(inviteId);
    if (!invite || !peer) throw new Error("Create an invite first");
    const description = parseSessionDescription(invite.answer);
    if (description.type !== "answer") throw new Error("Paste an answer here");
    await peer.setRemoteDescription(description);
    controller.setInviteStatus(inviteId, "connecting");
  };

  return { controller, createInvite, applyAnswer };
}

export type HostSession = ReturnType<typeof useHostSession>;
