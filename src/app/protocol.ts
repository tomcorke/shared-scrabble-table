import {
  MAX_POSITION_OFFSET,
  MAX_TILE_ROTATION,
  TILE_DISTRIBUTION,
  TILE_POINTS,
  type DrawOptions,
  type Player,
  type TableState,
  type Tile,
} from "../game.ts";

export const PLAYER_COLORS = [
  "#e6aa48",
  "#dc6f58",
  "#69a9c5",
  "#b17cc2",
  "#75a86d",
  "#de7d9d",
  "#61aaa0",
  "#858bd0",
];
export const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export function playerColor(seat: number) {
  return PLAYER_COLORS[seat] ?? `hsl(${(seat * 137.508) % 360} 55% 54%)`;
}

export function positiveDimension(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(value, 10_000)
    : fallback;
}

export function waitForIceCandidates(peer: RTCPeerConnection) {
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseMessage(data: unknown): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(String(data));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isTile(value: unknown): value is Tile {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.face === "string" &&
    Object.hasOwn(TILE_DISTRIBUTION, value.face) &&
    typeof value.points === "number" &&
    value.points === TILE_POINTS[value.face] &&
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

function isDrawOptions(value: unknown): value is DrawOptions {
  return (
    isRecord(value) &&
    typeof value.allowClientDraw === "boolean" &&
    typeof value.allowClientBlankDraw === "boolean"
  );
}

export function isTableState(value: unknown): value is TableState {
  if (
    !isRecord(value) ||
    !Array.isArray(value.players) ||
    !Array.isArray(value.tiles)
  )
    return false;

  return (
    value.players.every(
      (player) =>
        isRecord(player) &&
        typeof player.id === "string" &&
        typeof player.name === "string" &&
        typeof player.color === "string" &&
        typeof player.tileCount === "number" &&
        Number.isInteger(player.tileCount) &&
        player.tileCount >= 0 &&
        (player.isVip === undefined || typeof player.isVip === "boolean"),
    ) &&
    value.tiles.every(isTile) &&
    isDrawOptions(value.drawOptions)
  );
}

// ponytail: count scans are O(players × tiles); track counts incrementally if tables grow.
export function countTiles(players: Player[], tiles: Tile[]): Player[] {
  return players.map((player) => ({
    ...player,
    tileCount: tiles.filter((tile) => tile.ownerId === player.id).length,
  }));
}

export function sendMessage(channel: RTCDataChannel, message: unknown) {
  if (channel.readyState === "open") channel.send(JSON.stringify(message));
}
