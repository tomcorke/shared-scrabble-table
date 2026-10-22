import { useRef, useState } from "react";
import { DEFAULT_DRAW_OPTIONS, type TableState, type Tile } from "../game.ts";
import { playerColor } from "./protocol.ts";
import type {
  Invite,
  PeerRole,
  SetupTab,
  SignallingJoinStatus,
  SignallingRequest,
  SignallingRoomStatus,
} from "./types.ts";

// Join links: ?server=<origin>&join=<code> opens the join dialog pre-filled.
const linkParams = new URLSearchParams(window.location.search);
const linkServer = linkParams.get("server") ?? "";
const linkJoinCode = (linkParams.get("join") ?? "")
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, "")
  .slice(0, 4);
const hasJoinLink = Boolean(linkServer && linkJoinCode);

export function joinLink(serverUrl: string, code: string) {
  const url = new URL(window.location.pathname, window.location.origin);
  url.search = new URLSearchParams({
    server: serverUrl,
    join: code,
  }).toString();
  return url.toString();
}

function useSignallingState() {
  const [useServer, setUseServer] = useState(hasJoinLink);
  const [serverUrl, setServerUrl] = useState(linkServer);
  const [joinCode, setJoinCode] = useState(hasJoinLink ? linkJoinCode : "");
  const [roomCode, setRoomCode] = useState("");
  const [requests, setRequests] = useState<SignallingRequest[]>([]);
  const [roomStatus, setRoomStatus] = useState<SignallingRoomStatus>("idle");
  const [joinStatus, setJoinStatus] = useState<SignallingJoinStatus>("idle");
  return {
    useSignallingServer: useServer,
    setUseSignallingServer: setUseServer,
    signallingServerUrl: serverUrl,
    setSignallingServerUrl: setServerUrl,
    signallingJoinCode: joinCode,
    setSignallingJoinCode: setJoinCode,
    signallingRequests: requests,
    setSignallingRequests: setRequests,
    signallingRoomCode: roomCode,
    setSignallingRoomCode: setRoomCode,
    signallingRoomStatus: roomStatus,
    setSignallingRoomStatus: setRoomStatus,
    signallingJoinStatus: joinStatus,
    setSignallingJoinStatus: setJoinStatus,
  };
}

export function useSessionState() {
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
      {
        id: myId,
        name: playerName,
        color: playerColor(0),
        tileCount: 0,
        isVip: false,
      },
    ],
    tiles: [],
    drawOptions: { ...DEFAULT_DRAW_OPTIONS },
  }));
  const [role, setRole] = useState<PeerRole>("host");
  const [setupTab, setSetupTab] = useState<SetupTab>(
    hasJoinLink ? "join" : "host",
  );
  const [setupOpen, setSetupOpen] = useState(hasJoinLink);
  const [invites, setInvites] = useState<Invite[]>([]);
  const signalling = useSignallingState();
  const [remoteOffer, setRemoteOffer] = useState("");
  const [localAnswer, setLocalAnswer] = useState("");
  const [connectionState, setConnectionState] = useState("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [remoteDragPreviews, setRemoteDragPreviews] = useState<
    Record<string, Tile>
  >({});

  const gameRef = useRef(game);
  const myIdRef = useRef(myId);
  const nameRef = useRef(playerName);
  const roleRef = useRef<PeerRole>("host");
  const updateGame = (nextGame: TableState) => {
    gameRef.current = nextGame;
    setGame(nextGame);
  };
  const changeMyId = (id: string) => {
    myIdRef.current = id;
    setMyId(id);
  };
  const changeRole = (nextRole: PeerRole) => {
    roleRef.current = nextRole;
    setRole(nextRole);
  };

  return {
    myId,
    setMyId,
    playerName,
    setPlayerName,
    game,
    setGame,
    role,
    setRole,
    setupTab,
    setSetupTab,
    setupOpen,
    setSetupOpen,
    invites,
    setInvites,
    ...signalling,
    remoteOffer,
    setRemoteOffer,
    localAnswer,
    setLocalAnswer,
    connectionState,
    setConnectionState,
    error,
    setError,
    notice,
    setNotice,
    remoteDragPreviews,
    setRemoteDragPreviews,
    gameRef,
    myIdRef,
    nameRef,
    roleRef,
    changeMyId,
    changeRole,
    updateGame,
  };
}

export type SessionState = ReturnType<typeof useSessionState>;
