import { useRef, useState } from "react";
import { type TableState, type Tile } from "../game.ts";
import { playerColor } from "./protocol.ts";
import type { Invite, PeerRole, SetupTab } from "./types.ts";

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
