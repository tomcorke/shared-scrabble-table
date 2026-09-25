import { useEffect, useRef } from "react";
import type { Player, Tile } from "../game.ts";
import { parseSessionDescription } from "../signalling.ts";
import { handleGuestMessage } from "./guest-message.ts";
import {
  ICE_SERVERS,
  playerColor,
  sendMessage,
  waitForIceCandidates,
} from "./protocol.ts";
import type { Action } from "./types.ts";
import type { SessionState } from "./session-state.ts";

export function useGuestSession(
  state: SessionState,
  closeHostConnections: () => void,
  updateRemoteDragPreview: (tileId: string, tile: Tile | null) => void,
) {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);

  const closeGuestConnection = () => {
    const channel = channelRef.current;
    if (channel) {
      channel.onclose = null;
      channel.close();
      channelRef.current = null;
    }
    const peer = peerRef.current;
    if (peer) {
      peer.onconnectionstatechange = null;
      peer.ondatachannel = null;
      peer.close();
      peerRef.current = null;
    }
  };

  useEffect(() => () => closeGuestConnection(), []);

  const createAnswer = async (beforeConnect: () => void) => {
    const description = parseSessionDescription(state.remoteOffer);
    if (description.type !== "offer") throw new Error("Paste an offer here");
    beforeConnect();
    closeHostConnections();
    closeGuestConnection();
    state.changeRole("guest");
    state.setSetupTab("join");
    state.setConnectionState("connecting");
    state.setLocalAnswer("");

    const provisionalId = crypto.randomUUID();
    state.changeMyId(provisionalId);
    const localPlayer: Player = {
      id: provisionalId,
      name: state.nameRef.current.trim().slice(0, 24) || "Player",
      color: playerColor(0),
      tileCount: 0,
    };
    state.updateGame({ players: [localPlayer], tiles: [] });

    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerRef.current = peer;
    peer.onconnectionstatechange = () =>
      state.setConnectionState(
        peer.connectionState === "connected"
          ? "connecting"
          : peer.connectionState,
      );
    peer.ondatachannel = ({ channel }) => {
      channelRef.current = channel;
      channel.onopen = () => {
        state.setConnectionState("connecting");
        sendMessage(channel, { type: "hello", name: state.nameRef.current });
      };
      channel.onmessage = ({ data }) =>
        handleGuestMessage(state, updateRemoteDragPreview, data);
      channel.onclose = () => {
        state.setConnectionState("disconnected");
        state.setRemoteDragPreviews({});
      };
    };

    try {
      await peer.setRemoteDescription(description);
      await peer.setLocalDescription(await peer.createAnswer());
      await waitForIceCandidates(peer);
      state.setLocalAnswer(JSON.stringify(peer.localDescription));
    } catch (caught) {
      peer.close();
      peerRef.current = null;
      throw caught;
    }
  };

  const sendAction = (action: Action) => {
    const channel = channelRef.current;
    if (channel?.readyState !== "open") {
      state.setError("Connect to the table before moving tiles");
      return;
    }
    sendMessage(channel, { type: "action", action });
  };

  return { closeGuestConnection, createAnswer, sendAction };
}

export type GuestSession = ReturnType<typeof useGuestSession>;
