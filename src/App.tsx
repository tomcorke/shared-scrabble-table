import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import "./App.css";
import {
  addTileDragImpulse,
  canSendDragUpdate,
  createTile,
  DRAG_UPDATE_INTERVAL_MS,
  MAX_POSITION_OFFSET,
  MAX_TILE_ROTATION,
  moveTile,
  projectedTileCenter,
  snapshotForPlayer,
  stepTileSwing,
  type MoveDestination,
  type Player,
  type TableState,
  type Tile,
  type TileZone,
} from "./game.ts";
import { parseSessionDescription } from "./signalling.ts";

const PLAYER_COLORS = [
  "#e6aa48",
  "#dc6f58",
  "#69a9c5",
  "#b17cc2",
  "#75a86d",
  "#de7d9d",
  "#61aaa0",
  "#858bd0",
];
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
const DRAG_LIFT = 8;
const SWING_STEP = 1 / 120;

function playerColor(seat: number) {
  return PLAYER_COLORS[seat] ?? `hsl(${(seat * 137.508) % 360} 55% 54%)`;
}

function monotonicNow() {
  return performance.now();
}

function positiveDimension(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(value, 10_000)
    : fallback;
}

type PeerRole = "host" | "guest";
type SetupTab = "host" | "join";
type InviteStatus =
  "ready" | "connecting" | "connected" | "failed" | "disconnected";
type Invite = {
  id: string;
  offer: string;
  answer: string;
  status: InviteStatus;
};
type Action =
  | {
      kind: "draw";
      viewportWidth: number;
      rackWidth: number;
      rackHeight: number;
    }
  | {
      kind: "drag-preview";
      tileId: string;
      x: number;
      y: number;
      rotation: number;
    }
  | { kind: "drag-end"; tileId: string }
  | {
      kind: "move";
      tileId: string;
      destination: MoveDestination;
      x: number;
      y: number;
      rotation: number;
    };
type PendingPeerDragUpdate = { tile: Tile; timer: number };
type PendingDragUpdate = {
  tileId: string;
  x: number;
  y: number;
  rotation: number;
  timer: number;
};
type DragState = {
  tileId: string;
  pointerId: number;
  clientX: number;
  clientY: number;
  startClientX: number;
  startClientY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  startRotation: number;
  rotation: number;
  angularVelocity: number;
  destination: MoveDestination | null;
  previewCenter: { x: number; y: number } | null;
  sharedPreview: boolean;
};

function waitForIceCandidates(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("ICE gathering timed out. Try again."));
    }, 10_000);

    const handleStateChange = () => {
      if (peer.iceGatheringState === "complete") {
        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", handleStateChange);
    };

    peer.addEventListener("icegatheringstatechange", handleStateChange);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseMessage(data: unknown): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(String(data));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isTile(value: unknown): value is Tile {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.face === "string" &&
    typeof value.points === "number" &&
    Number.isFinite(value.points) &&
    typeof value.ownerId === "string" &&
    (value.zone === "hand" || value.zone === "board") &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    Math.abs(value.x) <= MAX_POSITION_OFFSET &&
    typeof value.y === "number" &&
    Number.isFinite(value.y) &&
    Math.abs(value.y) <= MAX_POSITION_OFFSET &&
    typeof value.rotation === "number" &&
    Number.isFinite(value.rotation) &&
    Math.abs(value.rotation) <= MAX_TILE_ROTATION
  );
}

function isTableState(value: unknown): value is TableState {
  if (
    !isRecord(value) ||
    !Array.isArray(value.players) ||
    !Array.isArray(value.tiles)
  ) {
    return false;
  }

  return (
    value.players.every(
      (player) =>
        isRecord(player) &&
        typeof player.id === "string" &&
        typeof player.name === "string" &&
        typeof player.color === "string" &&
        typeof player.tileCount === "number" &&
        Number.isInteger(player.tileCount) &&
        player.tileCount >= 0,
    ) && value.tiles.every(isTile)
  );
}

// ponytail: count scans are O(players × tiles); track counts incrementally if tables grow.
function countTiles(players: Player[], tiles: Tile[]): Player[] {
  return players.map((player) => ({
    ...player,
    tileCount: tiles.filter((tile) => tile.ownerId === player.id).length,
  }));
}

function sendMessage(channel: RTCDataChannel, message: unknown) {
  if (channel.readyState === "open") channel.send(JSON.stringify(message));
}

function pointInside(element: HTMLElement | null, x: number, y: number) {
  if (!element) return false;
  const bounds = element.getBoundingClientRect();
  return (
    x >= bounds.left &&
    x <= bounds.right &&
    y >= bounds.top &&
    y <= bounds.bottom
  );
}

function projectDragCenter(
  drag: DragState,
  pointerX = drag.clientX,
  pointerY = drag.clientY,
  rotation = drag.rotation,
) {
  return projectedTileCenter({
    pointerX,
    pointerY,
    grabX: drag.offsetX,
    grabY: drag.offsetY,
    width: drag.width,
    height: drag.height,
    rotation,
  });
}

function positionIn(element: HTMLElement, x: number, y: number) {
  const bounds = element.getBoundingClientRect();
  const left = bounds.left + element.clientLeft;
  const top = bounds.top + element.clientTop;
  const width = element.clientWidth;
  const height = element.clientHeight;
  const centerX = Math.max(left, Math.min(left + width, x));
  const centerY = Math.max(top, Math.min(top + height, y));
  return {
    x: centerX - left - width / 2,
    y: centerY - top - height / 2,
    centerX,
    centerY,
  };
}

function App() {
  const [myId, setMyId] = useState<string>(() => crypto.randomUUID());
  const [playerName, setPlayerName] = useState(() => {
    try {
      return window.localStorage.getItem("scrabble-player-name") || "Player";
    } catch {
      return "Player";
    }
  });
  const [game, setGame] = useState<TableState>(() => ({
    players: [
      { id: myId, name: playerName, color: playerColor(0), tileCount: 0 },
    ],
    tiles: [],
  }));
  const [role, setRole] = useState<PeerRole>("host");
  const [setupTab, setSetupTab] = useState<SetupTab>("host");
  const [setupOpen, setSetupOpen] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [remoteOffer, setRemoteOffer] = useState("");
  const [localAnswer, setLocalAnswer] = useState("");
  const [connectionState, setConnectionState] = useState("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [remoteDragPreviews, setRemoteDragPreviews] = useState<
    Record<string, Tile>
  >({});

  const gameRef = useRef(game);
  const myIdRef = useRef<string>(myId);
  const nameRef = useRef(playerName);
  const roleRef = useRef<PeerRole>("host");
  const hostPeersRef = useRef(new Map<string, RTCPeerConnection>());
  const hostChannelsRef = useRef(new Map<RTCDataChannel, string>());
  const guestPeerRef = useRef<RTCPeerConnection | null>(null);
  const guestChannelRef = useRef<RTCDataChannel | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pendingDragUpdateRef = useRef<PendingDragUpdate | null>(null);
  const lastDragUpdateAtRef = useRef(Number.NEGATIVE_INFINITY);
  const lastPeerDragUpdateAtRef = useRef(new Map<RTCDataChannel, number>());
  const pendingPeerDragUpdatesRef = useRef(
    new Map<RTCDataChannel, PendingPeerDragUpdate>(),
  );
  const activeDragOwnersRef = useRef(new Map<string, string>());
  const tableRef = useRef<HTMLDivElement | null>(null);
  const discardRef = useRef<HTMLDivElement | null>(null);
  const handRef = useRef<HTMLDivElement | null>(null);
  const draggingTileId = drag?.tileId;

  useEffect(
    () => () => {
      if (pendingDragUpdateRef.current)
        window.clearTimeout(pendingDragUpdateRef.current.timer);
    },
    [],
  );

  useEffect(() => {
    if (!draggingTileId) return;

    let frame = 0;
    let previousTime: number | null = null;
    let accumulator = 0;
    const animate = (time: number) => {
      if (previousTime === null) {
        previousTime = time;
      } else {
        accumulator += Math.min((time - previousTime) / 1000, 0.05);
        previousTime = time;
      }

      const current = dragRef.current;
      if (!current || current.tileId !== draggingTileId) return;
      let rotation = current.rotation;
      let angularVelocity = current.angularVelocity;
      while (accumulator >= SWING_STEP) {
        const swing = stepTileSwing({
          rotation,
          angularVelocity,
          dt: SWING_STEP,
        });
        rotation = swing.rotation;
        angularVelocity = swing.angularVelocity;
        accumulator -= SWING_STEP;
      }

      if (
        rotation !== current.rotation ||
        angularVelocity !== current.angularVelocity
      ) {
        const next: DragState = {
          ...current,
          rotation,
          angularVelocity,
          previewCenter: null,
        };
        const previewArea =
          next.destination === "board"
            ? tableRef.current
            : next.destination === "hand"
              ? handRef.current
              : null;
        if (previewArea) {
          const center = projectDragCenter(next);
          const position = positionIn(previewArea, center.x, center.y);
          next.previewCenter = { x: position.centerX, y: position.centerY };
        }
        dragRef.current = next;
        setDrag(next);
      }
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [draggingTileId]);

  const dragDestination = (x: number, y: number): MoveDestination | null => {
    if (pointInside(discardRef.current, x, y)) return "discard";
    if (pointInside(tableRef.current, x, y)) return "board";
    if (pointInside(handRef.current, x, y)) return "hand";
    return null;
  };

  const setInviteStatus = (id: string, status: InviteStatus) => {
    setInvites((current) =>
      current.map((invite) =>
        invite.id === id ? { ...invite, status } : invite,
      ),
    );
  };

  const commitHostState = (next: TableState) => {
    const updated = { ...next, players: countTiles(next.players, next.tiles) };
    gameRef.current = updated;
    setGame(updated);
    return updated;
  };

  const snapshotFor = (playerId: string): TableState =>
    snapshotForPlayer(gameRef.current, playerId);

  const updateRemoteDragPreview = (tileId: string, tile: Tile | null) => {
    setRemoteDragPreviews((current) => {
      const next = { ...current };
      if (tile) next[tileId] = tile;
      else delete next[tileId];
      return next;
    });
  };

  const broadcastDragPreview = (
    tile: Tile,
    excludedChannel?: RTCDataChannel,
    showOnHost = false,
  ) => {
    activeDragOwnersRef.current.set(tile.id, tile.ownerId);
    if (showOnHost) updateRemoteDragPreview(tile.id, tile);
    for (const channel of hostChannelsRef.current.keys()) {
      if (channel !== excludedChannel)
        sendMessage(channel, { type: "tile-preview", tile });
    }
  };

  const cancelPendingPeerDragUpdate = (channel: RTCDataChannel) => {
    const pending = pendingPeerDragUpdatesRef.current.get(channel);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingPeerDragUpdatesRef.current.delete(channel);
  };

  const queuePeerDragPreview = (channel: RTCDataChannel, tile: Tile) => {
    const relay = (preview: Tile, sentAt: number) => {
      lastPeerDragUpdateAtRef.current.set(channel, sentAt);
      broadcastDragPreview(preview, channel, true);
    };
    const now = monotonicNow();
    const lastSentAt =
      lastPeerDragUpdateAtRef.current.get(channel) ?? -Infinity;
    if (canSendDragUpdate(now, lastSentAt)) {
      cancelPendingPeerDragUpdate(channel);
      relay(tile, now);
      return;
    }

    let pending = pendingPeerDragUpdatesRef.current.get(channel);
    if (!pending) {
      pending = { tile, timer: 0 };
      pendingPeerDragUpdatesRef.current.set(channel, pending);
    } else {
      pending.tile = tile;
    }
    if (pending.timer === 0) {
      const flush = () => {
        if (pendingPeerDragUpdatesRef.current.get(channel) !== pending) return;
        if (hostChannelsRef.current.get(channel) !== pending.tile.ownerId) {
          pendingPeerDragUpdatesRef.current.delete(channel);
          return;
        }
        const sentAt = monotonicNow();
        const last = lastPeerDragUpdateAtRef.current.get(channel) ?? -Infinity;
        if (!canSendDragUpdate(sentAt, last)) {
          pending.timer = window.setTimeout(
            flush,
            last + DRAG_UPDATE_INTERVAL_MS - sentAt,
          );
          return;
        }
        pendingPeerDragUpdatesRef.current.delete(channel);
        relay(pending.tile, sentAt);
      };
      pending.timer = window.setTimeout(
        flush,
        Math.max(0, lastSentAt + DRAG_UPDATE_INTERVAL_MS - now),
      );
    }
  };

  const clearDragPreview = (tileId: string) => {
    activeDragOwnersRef.current.delete(tileId);
    updateRemoteDragPreview(tileId, null);
  };

  const endDragPreview = (tileId: string, excludedChannel?: RTCDataChannel) => {
    if (!activeDragOwnersRef.current.has(tileId)) return false;
    clearDragPreview(tileId);
    for (const channel of hostChannelsRef.current.keys()) {
      if (channel !== excludedChannel)
        sendMessage(channel, { type: "tile-preview-end", tileId });
    }
    return true;
  };

  const broadcast = (finishedDragTileId?: string) => {
    for (const [channel, playerId] of hostChannelsRef.current) {
      sendMessage(channel, {
        type: "snapshot",
        state: snapshotFor(playerId),
        finishedDragTileId,
      });
    }
  };

  const disconnectHostChannel = (inviteId: string, channel: RTCDataChannel) => {
    const playerId = hostChannelsRef.current.get(channel);
    cancelPendingPeerDragUpdate(channel);
    hostChannelsRef.current.delete(channel);
    lastPeerDragUpdateAtRef.current.delete(channel);
    if (playerId) {
      for (const [tileId, ownerId] of activeDragOwnersRef.current) {
        if (ownerId === playerId) endDragPreview(tileId);
      }
      const current = gameRef.current;
      commitHostState({
        players: current.players.filter((player) => player.id !== playerId),
        tiles: current.tiles.filter((tile) => tile.ownerId !== playerId),
      });
      broadcast();
    }
    setInviteStatus(inviteId, "disconnected");
  };

  const handleHostMessage = (
    inviteId: string,
    channel: RTCDataChannel,
    data: unknown,
  ) => {
    const message = parseMessage(data);
    if (!message) return;

    if (message.type === "hello" && typeof message.name === "string") {
      if (hostChannelsRef.current.has(channel)) return;
      const current = gameRef.current;
      const playerId = crypto.randomUUID();
      const player: Player = {
        id: playerId,
        name: message.name.trim().slice(0, 24) || "Guest",
        color: playerColor(current.players.length),
        tileCount: 0,
      };
      hostChannelsRef.current.set(channel, playerId);
      const updated = commitHostState({
        ...current,
        players: [...current.players, player],
      });
      sendMessage(channel, {
        type: "welcome",
        playerId,
        state: snapshotFor(playerId),
      });
      setInviteStatus(inviteId, "connected");
      if (updated.players.length > 1) setConnectionState("connected");
      broadcast();
      return;
    }

    if (message.type !== "action" || !isRecord(message.action)) return;
    const playerId = hostChannelsRef.current.get(channel);
    if (!playerId) return;

    const current = gameRef.current;
    const action = message.action;
    const kind = action.kind;
    const tileId = action.tileId;
    const x = action.x;
    const y = action.y;
    const rotation = action.rotation;
    if (
      kind === "drag-preview" &&
      typeof tileId === "string" &&
      typeof x === "number" &&
      Number.isFinite(x) &&
      Math.abs(x) <= MAX_POSITION_OFFSET &&
      typeof y === "number" &&
      Number.isFinite(y) &&
      Math.abs(y) <= MAX_POSITION_OFFSET &&
      typeof rotation === "number" &&
      Number.isFinite(rotation) &&
      Math.abs(rotation) <= MAX_TILE_ROTATION
    ) {
      const tile = current.tiles.find(
        (candidate) =>
          candidate.id === tileId && candidate.ownerId === playerId,
      );
      if (!tile) return;
      queuePeerDragPreview(channel, {
        ...tile,
        zone: "board",
        x,
        y,
        rotation,
      });
      return;
    }

    if (
      kind === "drag-end" &&
      typeof tileId === "string" &&
      current.tiles.some(
        (tile) => tile.id === tileId && tile.ownerId === playerId,
      )
    ) {
      cancelPendingPeerDragUpdate(channel);
      endDragPreview(tileId, channel);
      return;
    }

    if (kind === "draw") {
      const viewportWidth = positiveDimension(
        action.viewportWidth,
        window.innerWidth,
      );
      const rackWidth = positiveDimension(action.rackWidth, window.innerWidth);
      const rackHeight = positiveDimension(action.rackHeight, 108);
      commitHostState({
        ...current,
        tiles: [
          ...current.tiles,
          createTile(
            playerId,
            current.tiles,
            viewportWidth,
            rackWidth,
            rackHeight,
          ),
        ],
      });
      broadcast();
      return;
    }

    const destination = action.destination;
    if (
      kind === "move" &&
      typeof tileId === "string" &&
      (destination === "hand" ||
        destination === "board" ||
        destination === "discard") &&
      typeof x === "number" &&
      Number.isFinite(x) &&
      typeof y === "number" &&
      Number.isFinite(y) &&
      typeof rotation === "number" &&
      Number.isFinite(rotation) &&
      current.tiles.some(
        (tile) => tile.id === tileId && tile.ownerId === playerId,
      )
    ) {
      cancelPendingPeerDragUpdate(channel);
      const tiles = moveTile(
        current.tiles,
        tileId,
        playerId,
        destination,
        x,
        y,
        rotation,
      );
      commitHostState({ ...current, tiles });
      clearDragPreview(tileId);
      broadcast(tileId);
    }
  };

  const handleGuestMessage = (data: unknown) => {
    const message = parseMessage(data);
    if (!message) return;
    if (
      message.type === "tile-preview" &&
      isTile(message.tile) &&
      message.tile.zone === "board"
    ) {
      updateRemoteDragPreview(message.tile.id, message.tile);
      return;
    }
    if (
      message.type === "tile-preview-end" &&
      typeof message.tileId === "string"
    ) {
      updateRemoteDragPreview(message.tileId, null);
      return;
    }
    if (!isTableState(message.state)) return;
    if (message.type === "welcome" && typeof message.playerId === "string") {
      myIdRef.current = message.playerId;
      setMyId(message.playerId);
      gameRef.current = message.state;
      setGame(message.state);
      setRemoteDragPreviews({});
      setConnectionState("connected");
    } else if (message.type === "snapshot") {
      gameRef.current = message.state;
      setGame(message.state);
      if (typeof message.finishedDragTileId === "string")
        updateRemoteDragPreview(message.finishedDragTileId, null);
    }
  };

  const closeHostConnections = () => {
    for (const channel of pendingPeerDragUpdatesRef.current.keys())
      cancelPendingPeerDragUpdate(channel);
    for (const channel of hostChannelsRef.current.keys()) {
      channel.onclose = null;
      channel.close();
    }
    hostChannelsRef.current.clear();
    activeDragOwnersRef.current.clear();
    lastPeerDragUpdateAtRef.current.clear();
    for (const peer of hostPeersRef.current.values()) {
      peer.onconnectionstatechange = null;
      peer.close();
    }
    hostPeersRef.current.clear();
  };

  useEffect(
    () => () => {
      closeHostConnections();
      const channel = guestChannelRef.current;
      if (channel) {
        channel.onclose = null;
        channel.close();
      }
      guestPeerRef.current?.close();
    },
    [],
  );

  const attempt = async (action: () => Promise<void>) => {
    setError("");
    setNotice("");
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected error");
    }
  };

  const savePlayerName = () => {
    const name = nameRef.current.trim().slice(0, 24) || "Player";
    nameRef.current = name;
    setPlayerName(name);
    try {
      window.localStorage.setItem("scrabble-player-name", name);
    } catch {
      // The table still works when browser storage is unavailable.
    }

    if (roleRef.current === "host") {
      const current = gameRef.current;
      commitHostState({
        ...current,
        players: current.players.map((player) =>
          player.id === myIdRef.current ? { ...player, name } : player,
        ),
      });
      broadcast();
    }
  };

  const createHostInvite = async () => {
    savePlayerName();
    const id = crypto.randomUUID();
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    hostPeersRef.current.set(id, peer);
    const channel = peer.createDataChannel("shared-scrabble-table");
    channel.onopen = () => setInviteStatus(id, "connecting");
    channel.onmessage = ({ data }) => handleHostMessage(id, channel, data);
    channel.onclose = () => disconnectHostChannel(id, channel);
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed") setInviteStatus(id, "failed");
      if (peer.connectionState === "closed")
        setInviteStatus(id, "disconnected");
    };

    try {
      await peer.setLocalDescription(await peer.createOffer());
      await waitForIceCandidates(peer);
      setInvites((current) => [
        ...current,
        {
          id,
          offer: JSON.stringify(peer.localDescription),
          answer: "",
          status: "ready",
        },
      ]);
    } catch (caught) {
      hostPeersRef.current.delete(id);
      peer.close();
      throw caught;
    }
  };

  const applyAnswer = async (inviteId: string) => {
    const invite = invites.find((item) => item.id === inviteId);
    const peer = hostPeersRef.current.get(inviteId);
    if (!invite || !peer) throw new Error("Create an invite first");
    const description = parseSessionDescription(invite.answer);
    if (description.type !== "answer") throw new Error("Paste an answer here");
    await peer.setRemoteDescription(description);
    setInviteStatus(inviteId, "connecting");
  };

  const createAnswer = async () => {
    const description = parseSessionDescription(remoteOffer);
    if (description.type !== "offer") throw new Error("Paste an offer here");
    savePlayerName();
    closeHostConnections();
    guestChannelRef.current?.close();
    roleRef.current = "guest";
    setRole("guest");
    setSetupTab("join");
    setConnectionState("connecting");
    setLocalAnswer("");

    const provisionalId = crypto.randomUUID();
    myIdRef.current = provisionalId;
    setMyId(provisionalId);
    const localPlayer: Player = {
      id: provisionalId,
      name: nameRef.current.trim().slice(0, 24) || "Player",
      color: playerColor(0),
      tileCount: 0,
    };
    gameRef.current = { players: [localPlayer], tiles: [] };
    setGame(gameRef.current);

    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    guestPeerRef.current = peer;
    peer.onconnectionstatechange = () =>
      setConnectionState(
        peer.connectionState === "connected"
          ? "connecting"
          : peer.connectionState,
      );
    peer.ondatachannel = ({ channel }) => {
      guestChannelRef.current = channel;
      channel.onopen = () => {
        setConnectionState("connecting");
        sendMessage(channel, { type: "hello", name: nameRef.current });
      };
      channel.onmessage = ({ data }) => handleGuestMessage(data);
      channel.onclose = () => {
        setConnectionState("disconnected");
        setRemoteDragPreviews({});
      };
    };

    try {
      await peer.setRemoteDescription(description);
      await peer.setLocalDescription(await peer.createAnswer());
      await waitForIceCandidates(peer);
      setLocalAnswer(JSON.stringify(peer.localDescription));
    } catch (caught) {
      peer.close();
      guestPeerRef.current = null;
      throw caught;
    }
  };

  const performAction = (action: Action) => {
    if (roleRef.current === "host") {
      const current = gameRef.current;
      if (action.kind === "draw") {
        commitHostState({
          ...current,
          tiles: [
            ...current.tiles,
            createTile(
              myIdRef.current,
              current.tiles,
              window.innerWidth,
              handRef.current?.clientWidth ?? window.innerWidth,
              handRef.current?.clientHeight ?? 108,
            ),
          ],
        });
        broadcast();
      } else if (action.kind === "drag-preview") {
        const tile = current.tiles.find(
          (candidate) =>
            candidate.id === action.tileId &&
            candidate.ownerId === myIdRef.current,
        );
        if (tile)
          broadcastDragPreview({
            ...tile,
            zone: "board",
            x: action.x,
            y: action.y,
            rotation: action.rotation,
          });
      } else if (action.kind === "drag-end") {
        endDragPreview(action.tileId);
      } else {
        commitHostState({
          ...current,
          tiles: moveTile(
            current.tiles,
            action.tileId,
            myIdRef.current,
            action.destination,
            action.x,
            action.y,
            action.rotation,
          ),
        });
        clearDragPreview(action.tileId);
        broadcast(action.tileId);
      }
      return;
    }

    const channel = guestChannelRef.current;
    if (channel?.readyState !== "open") {
      setError("Connect to the table before moving tiles");
      return;
    }
    sendMessage(channel, { type: "action", action });
  };

  const cancelPendingDragPreview = (tileId?: string) => {
    const pending = pendingDragUpdateRef.current;
    if (!pending || (tileId && pending.tileId !== tileId)) return;
    window.clearTimeout(pending.timer);
    pendingDragUpdateRef.current = null;
  };

  const queueDragPreview = (
    tileId: string,
    x: number,
    y: number,
    rotation: number,
    now: number,
  ) => {
    const send = (update: PendingDragUpdate, sentAt: number) => {
      lastDragUpdateAtRef.current = sentAt;
      performAction({
        kind: "drag-preview",
        tileId: update.tileId,
        x: update.x,
        y: update.y,
        rotation: update.rotation,
      });
    };
    const schedule = (pending: PendingDragUpdate, delay: number) => {
      pending.timer = window.setTimeout(
        () => {
          if (pendingDragUpdateRef.current !== pending) return;
          const current = dragRef.current;
          const table = tableRef.current;
          if (
            !current ||
            current.tileId !== pending.tileId ||
            current.destination !== "board" ||
            !table
          ) {
            pendingDragUpdateRef.current = null;
            return;
          }
          const center = projectDragCenter(current);
          const position = positionIn(table, center.x, center.y);
          pending.x = position.x;
          pending.y = position.y;
          pending.rotation = current.rotation;
          const sentAt = monotonicNow();
          if (!canSendDragUpdate(sentAt, lastDragUpdateAtRef.current)) {
            schedule(
              pending,
              lastDragUpdateAtRef.current + DRAG_UPDATE_INTERVAL_MS - sentAt,
            );
            return;
          }
          send(pending, sentAt);
          if (!current.sharedPreview) {
            const next = { ...current, sharedPreview: true };
            dragRef.current = next;
            setDrag(next);
          }
          schedule(pending, DRAG_UPDATE_INTERVAL_MS);
        },
        Math.max(0, delay),
      );
    };

    if (canSendDragUpdate(now, lastDragUpdateAtRef.current)) {
      cancelPendingDragPreview();
      const pending = { tileId, x, y, rotation, timer: 0 };
      pendingDragUpdateRef.current = pending;
      send(pending, now);
      schedule(pending, DRAG_UPDATE_INTERVAL_MS);
      return true;
    }

    let pending = pendingDragUpdateRef.current;
    if (pending?.tileId !== tileId) {
      cancelPendingDragPreview();
      pending = { tileId, x, y, rotation, timer: 0 };
      pendingDragUpdateRef.current = pending;
      schedule(
        pending,
        lastDragUpdateAtRef.current + DRAG_UPDATE_INTERVAL_MS - now,
      );
    } else {
      pending.x = x;
      pending.y = y;
      pending.rotation = rotation;
    }
    return false;
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>, tile: Tile) => {
    if (tile.ownerId !== myIdRef.current || event.button !== 0) return;
    cancelPendingDragPreview();
    event.preventDefault();
    const element = event.currentTarget;
    const bounds = element.getBoundingClientRect();
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const radians = (tile.rotation * Math.PI) / 180;
    const deltaX = event.clientX - (bounds.left + bounds.width / 2);
    const deltaY = event.clientY - (bounds.top + bounds.height / 2);
    const offsetX = Math.max(
      0,
      Math.min(
        width,
        width / 2 + deltaX * Math.cos(radians) + deltaY * Math.sin(radians),
      ),
    );
    const offsetY = Math.max(
      0,
      Math.min(
        height,
        height / 2 - deltaX * Math.sin(radians) + deltaY * Math.cos(radians),
      ),
    );
    const next: DragState = {
      tileId: tile.id,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      startClientX: event.clientX,
      startClientY: event.clientY,
      offsetX,
      offsetY,
      width,
      height,
      startRotation: tile.rotation,
      rotation: tile.rotation,
      angularVelocity: 0,
      destination: tile.zone,
      previewCenter: null,
      sharedPreview: false,
    };
    const previewArea =
      tile.zone === "board" ? tableRef.current : handRef.current;
    if (previewArea) {
      const center = projectDragCenter(next);
      const position = positionIn(previewArea, center.x, center.y);
      next.previewCenter = { x: position.centerX, y: position.centerY };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = next;
    setDrag(next);
  };

  const moveDrag = (event: PointerEvent<HTMLButtonElement>, tile: Tile) => {
    const current = dragRef.current;
    if (
      !current ||
      current.tileId !== tile.id ||
      current.pointerId !== event.pointerId
    )
      return;
    const deltaX = event.clientX - current.clientX;
    const deltaY = event.clientY - current.clientY;
    const angularVelocity = addTileDragImpulse({
      rotation: current.rotation,
      angularVelocity: current.angularVelocity,
      deltaX,
      deltaY,
      grabX: current.offsetX,
      grabY: current.offsetY,
      width: current.width,
      height: current.height,
    });
    const destination = dragDestination(event.clientX, event.clientY);
    const next: DragState = {
      ...current,
      clientX: event.clientX,
      clientY: event.clientY,
      angularVelocity,
      destination,
      previewCenter: null,
    };
    const previewArea =
      destination === "board"
        ? tableRef.current
        : destination === "hand"
          ? handRef.current
          : null;
    let sharedPosition: { x: number; y: number } | null = null;
    if (previewArea) {
      const center = projectDragCenter(next);
      const position = positionIn(previewArea, center.x, center.y);
      next.previewCenter = { x: position.centerX, y: position.centerY };
      if (destination === "board") sharedPosition = position;
    }
    if (destination === "board" && sharedPosition) {
      if (
        queueDragPreview(
          tile.id,
          sharedPosition.x,
          sharedPosition.y,
          next.rotation,
          event.timeStamp,
        )
      )
        next.sharedPreview = true;
    } else {
      cancelPendingDragPreview(tile.id);
      if (current.sharedPreview) {
        performAction({ kind: "drag-end", tileId: tile.id });
        next.sharedPreview = false;
      }
    }
    dragRef.current = next;
    setDrag(next);
  };

  const finishDrag = (event: PointerEvent<HTMLButtonElement>, tile: Tile) => {
    const current = dragRef.current;
    if (
      !current ||
      current.tileId !== tile.id ||
      current.pointerId !== event.pointerId
    )
      return;
    cancelPendingDragPreview(tile.id);
    dragRef.current = null;
    setDrag(null);
    if (
      event.clientX === current.startClientX &&
      event.clientY === current.startClientY &&
      Math.abs(current.rotation - current.startRotation) < 0.001 &&
      Math.abs(current.angularVelocity) < 0.001
    ) {
      if (current.sharedPreview)
        performAction({ kind: "drag-end", tileId: tile.id });
      return;
    }

    const destination = dragDestination(event.clientX, event.clientY);
    const rotation = current.rotation;
    const center = projectDragCenter(
      current,
      event.clientX,
      event.clientY,
      rotation,
    );

    if (destination === "discard") {
      performAction({
        kind: "move",
        tileId: tile.id,
        destination: "discard",
        x: 0,
        y: 0,
        rotation,
      });
    } else if (destination === "board" && tableRef.current) {
      const { x, y } = positionIn(tableRef.current, center.x, center.y);
      performAction({
        kind: "move",
        tileId: tile.id,
        destination: "board",
        x,
        y,
        rotation,
      });
    } else if (destination === "hand" && handRef.current) {
      const { x, y } = positionIn(handRef.current, center.x, center.y);
      performAction({
        kind: "move",
        tileId: tile.id,
        destination: "hand",
        x,
        y,
        rotation,
      });
    } else if (current.sharedPreview) {
      performAction({ kind: "drag-end", tileId: tile.id });
    }
  };

  const handleTileKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    tile: Tile,
  ) => {
    if (tile.ownerId !== myIdRef.current) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const destination: TileZone = tile.zone === "hand" ? "board" : "hand";
      performAction({
        kind: "move",
        tileId: tile.id,
        destination,
        x: tile.x,
        y: tile.y,
        rotation: tile.rotation,
      });
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      performAction({
        kind: "move",
        tileId: tile.id,
        destination: "discard",
        x: 0,
        y: 0,
        rotation: tile.rotation,
      });
    } else if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      const step = event.shiftKey ? 8 : 3;
      const x =
        tile.x +
        (event.key === "ArrowRight"
          ? step
          : event.key === "ArrowLeft"
            ? -step
            : 0);
      const y =
        tile.y +
        (event.key === "ArrowDown"
          ? step
          : event.key === "ArrowUp"
            ? -step
            : 0);
      performAction({
        kind: "move",
        tileId: tile.id,
        destination: tile.zone,
        x,
        y,
        rotation: tile.rotation,
      });
    }
  };

  const renderTile = (tile: Tile, isRemotePreview = false) => {
    const owner = game.players.find((player) => player.id === tile.ownerId);
    const isDragging = drag?.tileId === tile.id;
    const isBlank = tile.face === "?";
    const style = isDragging
      ? {
          left: drag.clientX - drag.offsetX,
          top: drag.clientY - drag.offsetY - DRAG_LIFT,
          transformOrigin: `${drag.offsetX}px ${drag.offsetY}px`,
          transform: `rotate(${drag.rotation}deg)`,
        }
      : {
          left: `calc(50% ${tile.x < 0 ? "-" : "+"} ${Math.abs(tile.x)}px)`,
          top: `calc(50% ${tile.y < 0 ? "-" : "+"} ${Math.abs(tile.y)}px)`,
          transform: `translate(-50%, -50%) rotate(${tile.rotation}deg)`,
        };

    return (
      <button
        key={tile.id}
        type="button"
        className={`scrabble-tile ${tile.zone === "board" ? "public-tile" : "private-tile"}${isDragging ? " is-dragging" : ""}${isRemotePreview ? " remote-drag-preview" : ""}`}
        style={style}
        aria-label={`${isBlank ? "Blank" : tile.face} tile, ${tile.points} points. ${
          owner?.name ?? "Player"
        } owns it. Press Enter to move between your rack and the table; arrow keys to nudge; Backspace to discard.`}
        title={`${owner?.name ?? "Player"}${tile.zone === "board" ? " · public tile" : " · your rack"}`}
        onPointerDown={(event) => startDrag(event, tile)}
        onPointerMove={(event) => moveDrag(event, tile)}
        onPointerUp={(event) => finishDrag(event, tile)}
        onPointerCancel={() => {
          cancelPendingDragPreview(tile.id);
          if (
            dragRef.current?.tileId === tile.id &&
            dragRef.current.sharedPreview
          )
            performAction({ kind: "drag-end", tileId: tile.id });
          dragRef.current = null;
          setDrag(null);
        }}
        onKeyDown={(event) => handleTileKeyDown(event, tile)}
      >
        {tile.zone === "board" && (
          <span
            className="tile-owner-dot"
            style={{ backgroundColor: owner?.color ?? "#777" }}
            aria-hidden="true"
          />
        )}
        <span className="tile-face">{isBlank ? "" : tile.face}</span>
        <span className="tile-points">{tile.points || ""}</span>
      </button>
    );
  };

  const updateInviteAnswer = (id: string, answer: string) => {
    setInvites((current) =>
      current.map((invite) =>
        invite.id === id ? { ...invite, answer } : invite,
      ),
    );
  };

  const copyText = async (value: string, label: string) => {
    if (!value) throw new Error(`Create ${label} first`);
    await navigator.clipboard.writeText(value);
    setNotice(`${label} copied`);
  };

  const connectionLabel =
    role === "guest"
      ? connectionState === "connected"
        ? "Connected to table"
        : connectionState === "failed"
          ? "Connection failed"
          : connectionState === "disconnected"
            ? "Disconnected"
            : "Joining table"
      : game.players.length > 1
        ? `${game.players.length - 1} ${game.players.length === 2 ? "player" : "players"} connected`
        : "Your private table";
  const canPlay = role === "host" || connectionState === "connected";
  const ownTiles = game.tiles.filter(
    (tile) => tile.ownerId === myId && tile.zone === "hand",
  );
  const publicTiles = game.tiles.filter((tile) => tile.zone === "board");
  const dropPreview = drag?.previewCenter ?? null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            W
          </span>
          <div>
            <h1>Wordhaven</h1>
            <p>the shared scrabble table</p>
          </div>
        </div>
        <div className="topbar-actions">
          <span
            className={`connection-pill ${role === "guest" && connectionState === "connected" ? "is-connected" : ""}`}
          >
            <span className="connection-dot" />
            {connectionLabel}
          </span>
          <button
            className="invite-button"
            type="button"
            onClick={() => {
              setError("");
              setNotice("");
              setSetupTab(role === "host" ? "host" : "join");
              setSetupOpen(true);
            }}
          >
            <span aria-hidden="true">↗</span>{" "}
            {role === "host" ? "Invite players" : "Connection"}
          </button>
        </div>
      </header>

      <section className="player-strip" aria-label="Players at the table">
        <div className="player-strip-label">AT THE TABLE</div>
        <div className="player-list">
          {game.players.map((player) => (
            <div
              className={`player-card ${player.id === myId ? "is-you" : ""}`}
              key={player.id}
            >
              <span
                className="player-avatar"
                style={{ backgroundColor: player.color }}
              >
                {player.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="player-name">
                {player.name}
                {player.id === myId && <small>YOU</small>}
              </span>
              <span
                className="player-tile-count"
                aria-label={`${player.tileCount} tiles`}
              >
                <span className="mini-tile-stack" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                {player.tileCount}
              </span>
            </div>
          ))}
          {role === "host" && game.players.length === 1 && (
            <button
              className="waiting-player"
              type="button"
              onClick={() => setSetupOpen(true)}
            >
              <span>＋</span> Invite someone to play
            </button>
          )}
        </div>
        <span className="player-strip-note">
          {game.players.length} {game.players.length === 1 ? "seat" : "seats"}
        </span>
      </section>

      <section className="game-table" aria-label="Shared table">
        <div className="table-caption">
          <span className="caption-rule" />
          <span>SHARED PLAY AREA</span>
          <span className="caption-rule" />
        </div>

        <div className="public-play-area" ref={tableRef}>
          {publicTiles
            .filter((tile) => !remoteDragPreviews[tile.id])
            .map((tile) => renderTile(tile))}
          {Object.values(remoteDragPreviews).map((tile) =>
            renderTile(tile, true),
          )}
        </div>

        <div className="felt-stamp" aria-hidden="true">
          WORDHAVEN <span className="stamp-separator">·</span> EST. YOUR TABLE
        </div>
      </section>

      <div className="wood-rail" aria-hidden="true">
        <span className="rail-inlay" />
      </div>

      <div className="private-rack-layout">
        <button
          className="draw-station"
          type="button"
          onClick={() =>
            performAction({
              kind: "draw",
              viewportWidth: window.innerWidth,
              rackWidth: handRef.current?.clientWidth ?? window.innerWidth,
              rackHeight: handRef.current?.clientHeight ?? 108,
            })
          }
          disabled={!canPlay}
          aria-label="Draw one random tile from the infinite bag"
          title="Draw one tile"
        >
          <span className="bag-illustration" aria-hidden="true">
            <svg viewBox="0 0 72 82" role="presentation">
              <path d="M24 15c2-8 6-11 12-11s10 3 12 11l7 5c7 5 11 11 10 20l-4 30c-1 7-6 10-14 10H25c-8 0-13-3-14-10L7 40c-1-9 3-15 10-20l7-5Z" />
              <path d="M23 16c7 4 19 4 26 0M16 32c7 4 15 6 20 6m-19 4 1 20m38-31c-4 4-8 6-13 7" />
              <circle cx="31" cy="54" r="2" />
              <circle cx="43" cy="62" r="1.5" />
              <circle cx="48" cy="48" r="1.5" />
            </svg>
          </span>
          <span className="bag-label">DRAW A TILE</span>
          <span className="bag-infinite">∞ INFINITE BAG</span>
        </button>

        <section className="private-area" aria-label="Your private tile area">
          <div className="rack-heading">
            <div>
              <span className="rack-title">YOUR RACK</span>
              <span className="rack-hint">
                Only you can see these tiles · drag them onto the table to share
              </span>
            </div>
            <span className="rack-count">
              {ownTiles.length} {ownTiles.length === 1 ? "tile" : "tiles"}
            </span>
          </div>
          <div className="hand-space" ref={handRef}>
            {ownTiles.length === 0 ? (
              <p className="empty-rack">
                Draw a tile from the bag to get started
              </p>
            ) : (
              ownTiles.map((tile) => renderTile(tile))
            )}
          </div>
        </section>

        <div
          className="discard-zone"
          ref={discardRef}
          aria-label="Discard area. Drop one of your tiles here to remove it"
        >
          <span className="discard-icon" aria-hidden="true">
            ×
          </span>
          <span className="discard-label">DISCARD</span>
          <small>drop tile here</small>
        </div>
      </div>

      {drag && dropPreview && (
        <div
          className="tile-drop-shadow"
          aria-hidden="true"
          style={{
            left: dropPreview.x,
            top: dropPreview.y,
            transform: `translate(-50%, -50%) rotate(${drag.rotation}deg)`,
          }}
        />
      )}

      {(error || notice) && (
        <div
          className={`toast ${error ? "toast-error" : ""}`}
          role={error ? "alert" : "status"}
        >
          {error || notice}
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            ×
          </button>
        </div>
      )}

      {setupOpen && (
        <div className="dialog-backdrop">
          <section
            className="setup-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-title"
          >
            <header className="dialog-header">
              <div>
                <p className="dialog-eyebrow">A TABLE FOR EVERYONE</p>
                <h2 id="setup-title">Bring your people in</h2>
                <p>
                  Connect directly between browsers. No account or server
                  needed.
                </p>
              </div>
              <button
                className="close-dialog"
                type="button"
                aria-label="Close"
                onClick={() => setSetupOpen(false)}
              >
                ×
              </button>
            </header>

            {role === "host" && (
              <div
                className="setup-tabs"
                role="tablist"
                aria-label="Connection role"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={setupTab === "host"}
                  onClick={() => setSetupTab("host")}
                >
                  Host a table
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={setupTab === "join"}
                  onClick={() => setSetupTab("join")}
                >
                  Join a table
                </button>
              </div>
            )}

            <label className="name-field">
              Your name
              <input
                value={playerName}
                maxLength={24}
                onChange={(event) => {
                  nameRef.current = event.target.value;
                  setPlayerName(event.target.value);
                }}
                onBlur={savePlayerName}
                placeholder="Enter your name"
              />
            </label>

            {setupTab === "host" && role === "host" ? (
              <div className="host-panel">
                <p className="setup-instructions">
                  Make an invite, then send its code to a friend. They will
                  return an answer code for you to paste below.
                </p>
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => void attempt(createHostInvite)}
                >
                  + Create an invite
                </button>
                <div className="invite-list">
                  {invites.map((invite, index) => (
                    <article className="invite-card" key={invite.id}>
                      <div className="invite-card-heading">
                        <strong>Invite {index + 1}</strong>
                        <span
                          className={`invite-status status-${invite.status}`}
                        >
                          {invite.status}
                        </span>
                      </div>
                      <label>
                        Send this offer to your friend
                        <textarea readOnly rows={3} value={invite.offer} />
                      </label>
                      <button
                        className="secondary-action"
                        type="button"
                        onClick={() =>
                          void attempt(() => copyText(invite.offer, "Invite"))
                        }
                      >
                        Copy invite
                      </button>
                      {invite.status !== "connected" && (
                        <>
                          <label>
                            Paste their answer here
                            <textarea
                              rows={3}
                              value={invite.answer}
                              onChange={(event) =>
                                updateInviteAnswer(
                                  invite.id,
                                  event.target.value,
                                )
                              }
                              spellCheck={false}
                              placeholder="Paste answer code"
                            />
                          </label>
                          <button
                            className="primary-action"
                            type="button"
                            disabled={!invite.answer.trim()}
                            onClick={() =>
                              void attempt(() => applyAnswer(invite.id))
                            }
                          >
                            Connect player
                          </button>
                        </>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="join-panel">
                {role === "guest" && localAnswer ? (
                  <>
                    <p className="setup-instructions">
                      Send this answer code to the table host. Keep this page
                      open while they connect you.
                    </p>
                    <label>
                      Your answer code
                      <textarea readOnly rows={5} value={localAnswer} />
                    </label>
                    <button
                      className="primary-action"
                      type="button"
                      onClick={() =>
                        void attempt(() => copyText(localAnswer, "Answer"))
                      }
                    >
                      Copy answer
                    </button>
                    <p
                      className={`join-status ${connectionState === "connected" ? "is-live" : ""}`}
                    >
                      <span className="connection-dot" />{" "}
                      {connectionState === "connected"
                        ? "You are at the table"
                        : "Waiting for the host to apply your answer"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="setup-instructions">
                      Paste the invite code from the table host. Your connection
                      is direct and peer-to-peer.
                    </p>
                    <label>
                      Host invite code
                      <textarea
                        rows={5}
                        value={remoteOffer}
                        onChange={(event) => setRemoteOffer(event.target.value)}
                        spellCheck={false}
                        placeholder="Paste invite code"
                      />
                    </label>
                    <button
                      className="primary-action"
                      type="button"
                      disabled={!remoteOffer.trim()}
                      onClick={() => void attempt(createAnswer)}
                    >
                      Create answer
                    </button>
                  </>
                )}
              </div>
            )}

            {error && (
              <p className="dialog-error" role="alert">
                {error}
              </p>
            )}
            <p className="privacy-note">
              Peer-to-peer uses WebRTC and public STUN. Some networks may block
              direct connections.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
