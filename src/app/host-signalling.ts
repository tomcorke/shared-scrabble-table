import { parseSessionDescription } from "../signalling.ts";
import type { HostController } from "./host-controller.ts";
import {
  createSignallingServerClient,
  SignallingServerError,
} from "./signalling-server-client.ts";
import { ICE_SERVERS, waitForIceCandidates } from "./protocol.ts";
import type { SessionState } from "./session-state.ts";

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export type OfferDelivery = {
  client: ReturnType<typeof createSignallingServerClient>;
  code: string;
  hostToken: string;
  signal: AbortSignal;
};

export async function createHostInvite(
  state: SessionState,
  controller: HostController,
  id: string,
  delivery?: OfferDelivery,
) {
  const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  controller.addPeer(id, peer);
  const channel = peer.createDataChannel("shared-scrabble-table");
  channel.onopen = () => controller.setInviteStatus(id, "connecting");
  channel.onmessage = ({ data }) => controller.handleMessage(id, channel, data);
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
    const description = peer.localDescription;
    if (!description) throw new Error("Could not create an offer");
    if (delivery) {
      await delivery.client.sendOffer(
        delivery.code,
        id,
        delivery.hostToken,
        description,
        delivery.signal,
      );
    }
    state.setInvites((current) => [
      ...current,
      {
        id,
        transport: delivery ? "server" : "manual",
        offer: delivery ? "" : JSON.stringify(description),
        answer: "",
        status: "ready",
      },
    ]);
  } catch (caught) {
    controller.removePeer(id);
    peer.close();
    throw caught;
  }
}

async function applySignallingAnswers(
  controller: HostController,
  client: ReturnType<typeof createSignallingServerClient>,
  code: string,
  hostToken: string,
  signal: AbortSignal,
) {
  const answers = await client.answers(code, hostToken, signal);
  for (const { clientId, answer } of answers) {
    const peer = controller.getPeer(clientId);
    if (!peer || peer.remoteDescription) continue;
    const description = parseSessionDescription(JSON.stringify(answer));
    if (description.type !== "answer") continue;
    await peer.setRemoteDescription(description);
    controller.setInviteStatus(clientId, "connecting");
  }
}

export async function pollSignallingRoom(
  state: SessionState,
  controller: HostController,
  client: ReturnType<typeof createSignallingServerClient>,
  code: string,
  hostToken: string,
  signal: AbortSignal,
) {
  while (!signal.aborted) {
    try {
      state.setSignallingRequests(
        await client.pendingRequests(code, hostToken, signal),
      );
      await applySignallingAnswers(controller, client, code, hostToken, signal);
    } catch (caught) {
      if (signal.aborted) return;
      state.setError(
        caught instanceof Error ? caught.message : "Signalling server error",
      );
      if (
        caught instanceof SignallingServerError &&
        [401, 404].includes(caught.status)
      ) {
        state.setSignallingRequests([]);
        state.setSignallingRoomStatus("error");
        return;
      }
      await pause(2000);
      continue;
    }
    await pause(1000);
  }
}
