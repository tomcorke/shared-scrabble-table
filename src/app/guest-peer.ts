import type { MutableRefObject } from "react";
import {
  createBlankTile,
  createTile,
  DEFAULT_DRAW_OPTIONS,
  type Player,
  type Tile,
} from "../game.ts";
import { handleGuestMessage } from "./guest-message.ts";
import {
  ICE_SERVERS,
  playerColor,
  sendMessage,
  waitForIceCandidates,
} from "./protocol.ts";
import type { SessionState } from "./session-state.ts";

const DRAW_GRANT_INTERVAL_MS = 140;

export type GuestPeerContext = {
  state: SessionState;
  handRef: MutableRefObject<HTMLDivElement | null>;
  peerRef: MutableRefObject<RTCPeerConnection | null>;
  channelRef: MutableRefObject<RTCDataChannel | null>;
  closeHostConnections: () => void;
  closeGuestPeer: () => void;
  updateRemoteDragPreview: (tileId: string, tile: Tile | null) => void;
};

function sendDrawGrantResult(
  state: SessionState,
  handRef: MutableRefObject<HTMLDivElement | null>,
  channel: RTCDataChannel,
  grantId: string,
  count: number,
  blank: boolean,
) {
  const grantedTiles: Tile[] = [];
  const create = blank ? createBlankTile : createTile;
  let remaining = count;
  const drawNext = () => {
    if (channel.readyState !== "open") return;
    const tiles = [...state.gameRef.current.tiles];
    const tileIds = new Set(tiles.map((tile) => tile.id));
    for (const tile of grantedTiles) {
      if (tileIds.has(tile.id)) continue;
      tiles.push(tile);
      tileIds.add(tile.id);
    }
    const tile = create(
      state.myIdRef.current,
      tiles,
      window.innerWidth,
      handRef.current?.clientWidth ?? window.innerWidth,
      handRef.current?.clientHeight ?? 108,
    );
    grantedTiles.push(tile);
    sendMessage(channel, { type: "draw-grant-result", grantId, tile });
    remaining--;
    if (remaining > 0) window.setTimeout(drawNext, DRAW_GRANT_INTERVAL_MS);
  };
  drawNext();
}

export async function createGuestAnswer(
  context: GuestPeerContext,
  description: RTCSessionDescriptionInit,
  beforeConnect: () => void,
  showAnswer: boolean,
) {
  const {
    state,
    handRef,
    peerRef,
    channelRef,
    closeHostConnections,
    closeGuestPeer,
    updateRemoteDragPreview,
  } = context;
  if (description.type !== "offer" || !description.sdp)
    throw new Error("A valid offer is required");
  beforeConnect();
  closeHostConnections();
  closeGuestPeer();
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
    isVip: false,
  };
  state.updateGame({
    players: [localPlayer],
    tiles: [],
    drawOptions: { ...DEFAULT_DRAW_OPTIONS },
  });

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
      handleGuestMessage(
        state,
        updateRemoteDragPreview,
        data,
        (grantId, count, blank) =>
          sendDrawGrantResult(state, handRef, channel, grantId, count, blank),
      );
    channel.onclose = () => {
      state.setConnectionState("disconnected");
      state.setRemoteDragPreviews({});
    };
  };

  try {
    await peer.setRemoteDescription(description);
    await peer.setLocalDescription(await peer.createAnswer());
    await waitForIceCandidates(peer);
    if (!peer.localDescription) throw new Error("Could not create an answer");
    const answer = JSON.stringify(peer.localDescription);
    if (showAnswer) state.setLocalAnswer(answer);
    return answer;
  } catch (caught) {
    peer.close();
    peerRef.current = null;
    throw caught;
  }
}
