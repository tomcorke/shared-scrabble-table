import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { Tile } from "../game.ts";
import { parseSessionDescription } from "../signalling.ts";
import { createGuestAnswer, type GuestPeerContext } from "./guest-peer.ts";
import {
  joinViaSignallingServer,
  type JoinRequest,
} from "./guest-signalling.ts";
import { sendMessage } from "./protocol.ts";
import type { SessionState } from "./session-state.ts";
import type { Action } from "./types.ts";

export function useGuestSession(
  state: SessionState,
  handRef: MutableRefObject<HTMLDivElement | null>,
  closeHostConnections: () => void,
  updateRemoteDragPreview: (tileId: string, tile: Tile | null) => void,
) {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const joinPollRef = useRef<AbortController | null>(null);
  const joinRequestRef = useRef<JoinRequest | null>(null);

  const closeGuestPeer = () => {
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

  const closeGuestConnection = () => {
    joinPollRef.current?.abort();
    joinPollRef.current = null;
    const joinRequest = joinRequestRef.current;
    joinRequestRef.current = null;
    if (joinRequest) {
      void joinRequest.client
        .cancelJoinRequest(joinRequest.code, joinRequest.clientId)
        .catch(() => undefined);
    }
    closeGuestPeer();
  };

  useEffect(() => () => closeGuestConnection(), []);

  const peerContext: GuestPeerContext = {
    state,
    handRef,
    peerRef,
    channelRef,
    closeHostConnections,
    closeGuestPeer,
    updateRemoteDragPreview,
  };
  const createAnswerFor = (
    description: RTCSessionDescriptionInit,
    beforeConnect: () => void,
    showAnswer: boolean,
  ) => createGuestAnswer(peerContext, description, beforeConnect, showAnswer);

  const createAnswer = async (beforeConnect: () => void) => {
    closeGuestConnection();
    const description = parseSessionDescription(state.remoteOffer);
    if (description.type !== "offer") throw new Error("Paste an offer here");
    await createAnswerFor(description, beforeConnect, true);
  };

  const joinDependencies = {
    state,
    joinPollRef,
    joinRequestRef,
    closeGuestConnection,
    createAnswer: createAnswerFor,
  };
  const sendAction = (action: Action) => {
    const channel = channelRef.current;
    if (channel?.readyState !== "open") {
      state.setError("Connect to the table before moving tiles");
      return;
    }
    sendMessage(channel, { type: "action", action });
  };

  return {
    closeGuestConnection,
    createAnswer,
    joinViaSignallingServer: (
      serverAddress: string,
      roomCode: string,
      beforeConnect: () => void,
    ) =>
      joinViaSignallingServer(
        joinDependencies,
        serverAddress,
        roomCode,
        beforeConnect,
      ),
    sendAction,
  };
}

export type GuestSession = ReturnType<typeof useGuestSession>;
