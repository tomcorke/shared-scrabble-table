import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import "./App.css";
import {
  drawTileFace,
  moveTile,
  snapshotForPlayer,
  TILE_POINTS,
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

function playerColor(seat: number) {
  return PLAYER_COLORS[seat] ?? `hsl(${(seat * 137.508) % 360} 55% 54%)`;
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
  | { kind: "draw" }
  | {
      kind: "move";
      tileId: string;
      destination: MoveDestination;
      x: number;
      y: number;
    };
type DragState = {
  tileId: string;
  pointerId: number;
  clientX: number;
  clientY: number;
  offsetX: number;
  offsetY: number;
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
    ) &&
    value.tiles.every(
      (tile) =>
        isRecord(tile) &&
        typeof tile.id === "string" &&
        typeof tile.face === "string" &&
        typeof tile.points === "number" &&
        typeof tile.ownerId === "string" &&
        (tile.zone === "hand" || tile.zone === "board") &&
        typeof tile.x === "number" &&
        Number.isFinite(tile.x) &&
        typeof tile.y === "number" &&
        Number.isFinite(tile.y),
    )
  );
}

// ponytail: count scans are O(players × tiles); track counts incrementally if tables grow.
function countTiles(players: Player[], tiles: Tile[]): Player[] {
  return players.map((player) => ({
    ...player,
    tileCount: tiles.filter((tile) => tile.ownerId === player.id).length,
  }));
}

function createTile(ownerId: string, tiles: Tile[]): Tile {
  const handCount = tiles.filter(
    (tile) => tile.ownerId === ownerId && tile.zone === "hand",
  ).length;
  const face = drawTileFace();

  return {
    id: crypto.randomUUID(),
    face,
    points: TILE_POINTS[face],
    ownerId,
    zone: "hand",
    x: 7 + (handCount % 7) * 13,
    y: handCount % 14 < 7 ? 30 : 68,
  };
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

function positionIn(element: HTMLElement, x: number, y: number) {
  const bounds = element.getBoundingClientRect();
  const insetX = Math.min(49, (28 / bounds.width) * 100);
  const insetY = Math.min(49, (34 / bounds.height) * 100);
  return {
    x: Math.max(
      insetX,
      Math.min(100 - insetX, ((x - bounds.left) / bounds.width) * 100),
    ),
    y: Math.max(
      insetY,
      Math.min(100 - insetY, ((y - bounds.top) / bounds.height) * 100),
    ),
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

  const gameRef = useRef(game);
  const myIdRef = useRef<string>(myId);
  const nameRef = useRef(playerName);
  const roleRef = useRef<PeerRole>("host");
  const hostPeersRef = useRef(new Map<string, RTCPeerConnection>());
  const hostChannelsRef = useRef(new Map<RTCDataChannel, string>());
  const guestPeerRef = useRef<RTCPeerConnection | null>(null);
  const guestChannelRef = useRef<RTCDataChannel | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const discardRef = useRef<HTMLDivElement | null>(null);
  const handRef = useRef<HTMLDivElement | null>(null);

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

  const broadcast = () => {
    for (const [channel, playerId] of hostChannelsRef.current) {
      sendMessage(channel, { type: "snapshot", state: snapshotFor(playerId) });
    }
  };

  const disconnectHostChannel = (inviteId: string, channel: RTCDataChannel) => {
    const playerId = hostChannelsRef.current.get(channel);
    hostChannelsRef.current.delete(channel);
    if (playerId) {
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
    if (message.action.kind === "draw") {
      commitHostState({
        ...current,
        tiles: [...current.tiles, createTile(playerId, current.tiles)],
      });
    } else if (
      message.action.kind === "move" &&
      typeof message.action.tileId === "string" &&
      (message.action.destination === "hand" ||
        message.action.destination === "board" ||
        message.action.destination === "discard") &&
      typeof message.action.x === "number" &&
      Number.isFinite(message.action.x) &&
      typeof message.action.y === "number" &&
      Number.isFinite(message.action.y)
    ) {
      const tiles = moveTile(
        current.tiles,
        message.action.tileId,
        playerId,
        message.action.destination as MoveDestination,
        message.action.x,
        message.action.y,
      );
      commitHostState({ ...current, tiles });
    } else {
      return;
    }
    broadcast();
  };

  const handleGuestMessage = (data: unknown) => {
    const message = parseMessage(data);
    if (!message || !isTableState(message.state)) return;
    if (message.type === "welcome" && typeof message.playerId === "string") {
      myIdRef.current = message.playerId;
      setMyId(message.playerId);
      gameRef.current = message.state;
      setGame(message.state);
      setConnectionState("connected");
    } else if (message.type === "snapshot") {
      gameRef.current = message.state;
      setGame(message.state);
    }
  };

  const closeHostConnections = () => {
    for (const channel of hostChannelsRef.current.keys()) {
      channel.onclose = null;
      channel.close();
    }
    hostChannelsRef.current.clear();
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
      channel.onclose = () => setConnectionState("disconnected");
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
          tiles: [...current.tiles, createTile(myIdRef.current, current.tiles)],
        });
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
          ),
        });
      }
      broadcast();
      return;
    }

    const channel = guestChannelRef.current;
    if (channel?.readyState !== "open") {
      setError("Connect to the table before moving tiles");
      return;
    }
    sendMessage(channel, { type: "action", action });
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>, tile: Tile) => {
    if (tile.ownerId !== myIdRef.current || event.button !== 0) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const next = {
      tileId: tile.id,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
    };
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
    const next = { ...current, clientX: event.clientX, clientY: event.clientY };
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
    dragRef.current = null;
    setDrag(null);

    if (pointInside(discardRef.current, event.clientX, event.clientY)) {
      performAction({
        kind: "move",
        tileId: tile.id,
        destination: "discard",
        x: 0,
        y: 0,
      });
    } else if (
      pointInside(tableRef.current, event.clientX, event.clientY) &&
      tableRef.current
    ) {
      const position = positionIn(
        tableRef.current,
        event.clientX,
        event.clientY,
      );
      performAction({
        kind: "move",
        tileId: tile.id,
        destination: "board",
        ...position,
      });
    } else if (
      pointInside(handRef.current, event.clientX, event.clientY) &&
      handRef.current
    ) {
      const position = positionIn(
        handRef.current,
        event.clientX,
        event.clientY,
      );
      performAction({
        kind: "move",
        tileId: tile.id,
        destination: "hand",
        ...position,
      });
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
      });
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      performAction({
        kind: "move",
        tileId: tile.id,
        destination: "discard",
        x: 0,
        y: 0,
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
      });
    }
  };

  const renderTile = (tile: Tile) => {
    const owner = game.players.find((player) => player.id === tile.ownerId);
    const isDragging = drag?.tileId === tile.id;
    const isBlank = tile.face === "?";
    const style = isDragging
      ? {
          left: drag.clientX - drag.offsetX,
          top: drag.clientY - drag.offsetY,
        }
      : { left: `${tile.x}%`, top: `${tile.y}%` };

    return (
      <button
        key={tile.id}
        type="button"
        className={`scrabble-tile ${tile.zone === "board" ? "public-tile" : "private-tile"}${isDragging ? " is-dragging" : ""}`}
        style={style}
        aria-label={`${isBlank ? "Blank" : tile.face} tile, ${tile.points} points. ${
          owner?.name ?? "Player"
        } owns it. Press Enter to move between your rack and the table; arrow keys to nudge; Backspace to discard.`}
        title={`${owner?.name ?? "Player"}${tile.zone === "board" ? " · public tile" : " · your rack"}`}
        onPointerDown={(event) => startDrag(event, tile)}
        onPointerMove={(event) => moveDrag(event, tile)}
        onPointerUp={(event) => finishDrag(event, tile)}
        onPointerCancel={() => {
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

        <button
          className="draw-station"
          type="button"
          onClick={() => performAction({ kind: "draw" })}
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

        <div className="public-play-area" ref={tableRef}>
          {publicTiles.map(renderTile)}
        </div>

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

        <div className="felt-stamp" aria-hidden="true">
          WORDHAVEN <span className="stamp-separator">·</span> EST. YOUR TABLE
        </div>
      </section>

      <div className="wood-rail" aria-hidden="true">
        <span className="rail-inlay" />
      </div>

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
            ownTiles.map(renderTile)
          )}
        </div>
      </section>

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
