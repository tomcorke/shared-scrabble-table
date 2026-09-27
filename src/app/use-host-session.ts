import { useEffect, useRef, useState } from "react";
import type { Tile } from "../game.ts";
import { parseSessionDescription } from "../signalling.ts";
import { HostController } from "./host-controller.ts";
import {
  createHostInvite,
  pollSignallingRoom,
  type OfferDelivery,
} from "./host-signalling.ts";
import { createSignallingServerClient } from "./signalling-server-client.ts";
import type { SessionState } from "./session-state.ts";

async function applyHostAnswer(
  state: SessionState,
  controller: HostController,
  inviteId: string,
) {
  const invite = state.invites.find((item) => item.id === inviteId);
  const peer = controller.getPeer(inviteId);
  if (!invite || !peer) throw new Error("Create an invite first");
  const description = parseSessionDescription(invite.answer);
  if (description.type !== "answer") throw new Error("Paste an answer here");
  await peer.setRemoteDescription(description);
  controller.setInviteStatus(inviteId, "connecting");
}

export function useHostSession(
  state: SessionState,
  updateRemoteDragPreview: (tileId: string, tile: Tile | null) => void,
) {
  const [controller] = useState(
    () => new HostController(state, updateRemoteDragPreview),
  );
  const roomPollRef = useRef<AbortController | null>(null);
  const roomRef = useRef<OfferDelivery | null>(null);

  useEffect(
    () => () => {
      roomPollRef.current?.abort();
      controller.closeHostConnections();
    },
    [controller],
  );

  const createInvite = () =>
    createHostInvite(state, controller, crypto.randomUUID());

  const startSignallingRoom = async (serverAddress: string) => {
    roomPollRef.current?.abort();
    roomRef.current = null;
    const poll = new AbortController();
    roomPollRef.current = poll;
    state.setSignallingRequests([]);
    state.setSignallingRoomCode("");
    state.setSignallingRoomStatus("starting");
    try {
      const client = createSignallingServerClient(serverAddress);
      const room = await client.createRoom(poll.signal);
      if (poll.signal.aborted) return;
      roomRef.current = {
        client,
        code: room.code,
        hostToken: room.hostToken,
        signal: poll.signal,
      };
      state.setSignallingRoomCode(room.code);
      state.setSignallingRoomStatus("ready");
      void pollSignallingRoom(
        state,
        controller,
        client,
        room.code,
        room.hostToken,
        poll.signal,
      );
    } catch (caught) {
      if (poll.signal.aborted) return;
      state.setSignallingRoomStatus("error");
      throw caught;
    }
  };

  const respondToSignallingRequest = async (
    clientId: string,
    accept: boolean,
  ) => {
    const room = roomRef.current;
    if (!room || room.signal.aborted)
      throw new Error("Start an exchange room first");
    if (accept) {
      if (controller.getPeer(clientId)) return;
      await createHostInvite(state, controller, clientId, room);
      return;
    }
    await room.client.rejectRequest(
      room.code,
      clientId,
      room.hostToken,
      room.signal,
    );
    state.setSignallingRequests((current) =>
      current.filter((request) => request.clientId !== clientId),
    );
  };

  const closeHostSession = () => {
    roomPollRef.current?.abort();
    roomPollRef.current = null;
    roomRef.current = null;
    state.setSignallingRequests([]);
    state.setSignallingRoomCode("");
    state.setSignallingRoomStatus("idle");
    controller.closeHostConnections();
  };

  const applyAnswer = (inviteId: string) =>
    applyHostAnswer(state, controller, inviteId);

  return {
    controller,
    createInvite,
    applyAnswer,
    startSignallingRoom,
    respondToSignallingRequest,
    closeHostSession,
  };
}

export type HostSession = ReturnType<typeof useHostSession>;
