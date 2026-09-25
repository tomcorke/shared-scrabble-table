import type { PeerRole } from "./types.ts";

export function canJoinAnotherTable(
  role: PeerRole,
  playerCount: number,
  inviteCount: number,
  connectionState: string,
) {
  return (
    (role === "host" && playerCount === 1 && inviteCount === 0) ||
    (role === "guest" &&
      ["idle", "failed", "disconnected", "closed"].includes(connectionState))
  );
}

export function connectionLabel(
  role: PeerRole,
  connectionState: string,
  playerCount: number,
) {
  if (role === "guest") {
    if (connectionState === "connected") return "Connected to table";
    if (connectionState === "failed") return "Connection failed";
    if (connectionState === "disconnected") return "Disconnected";
    return "Joining table";
  }
  if (playerCount > 1) {
    return `${playerCount - 1} ${playerCount === 2 ? "player" : "players"} connected`;
  }
  return "Your private table";
}
