import type { MutableRefObject } from "react";
import { createSignallingServerClient } from "./signalling-server-client.ts";
import type { SessionState } from "./session-state.ts";

export type JoinRequest = {
  client: ReturnType<typeof createSignallingServerClient>;
  code: string;
  clientId: string;
};

type JoinDependencies = {
  state: SessionState;
  joinPollRef: MutableRefObject<AbortController | null>;
  joinRequestRef: MutableRefObject<JoinRequest | null>;
  closeGuestConnection: () => void;
  createAnswer: (
    description: RTCSessionDescriptionInit,
    beforeConnect: () => void,
    showAnswer: boolean,
  ) => Promise<string>;
};

const pause = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 1000));

export async function joinViaSignallingServer(
  dependencies: JoinDependencies,
  serverAddress: string,
  roomCode: string,
  beforeConnect: () => void,
) {
  const {
    state,
    joinPollRef,
    joinRequestRef,
    closeGuestConnection,
    createAnswer,
  } = dependencies;
  const code = roomCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code))
    throw new Error("Enter the four-character room code");
  const client = createSignallingServerClient(serverAddress);
  closeGuestConnection();
  const poll = new AbortController();
  joinPollRef.current = poll;
  const clientId = crypto.randomUUID();
  joinRequestRef.current = { client, code, clientId };
  try {
    state.setSignallingJoinStatus("requesting");
    await client.requestToJoin(code, clientId, poll.signal);
    if (poll.signal.aborted) {
      await client.cancelJoinRequest(code, clientId).catch(() => undefined);
      return;
    }
    state.setSignallingJoinStatus("waiting");
    while (!poll.signal.aborted) {
      const request = await client.getJoinRequest(code, clientId, poll.signal);
      if (request.offer) {
        state.setSignallingJoinStatus("answering");
        const answer = await createAnswer(request.offer, beforeConnect, false);
        await client.sendAnswer(
          code,
          clientId,
          JSON.parse(answer) as RTCSessionDescriptionInit,
          poll.signal,
        );
        state.setSignallingJoinStatus("submitted");
        return;
      }
      await pause();
    }
  } catch (caught) {
    if (poll.signal.aborted) {
      void client.cancelJoinRequest(code, clientId).catch(() => undefined);
    } else {
      state.setSignallingJoinStatus("idle");
      joinRequestRef.current = null;
      void client.cancelJoinRequest(code, clientId).catch(() => undefined);
      throw caught;
    }
  } finally {
    if (joinPollRef.current === poll) joinPollRef.current = null;
  }
}
