export const TILE_DISTRIBUTION = {
  A: 9,
  B: 2,
  C: 2,
  D: 4,
  E: 12,
  F: 2,
  G: 3,
  H: 2,
  I: 9,
  J: 1,
  K: 1,
  L: 4,
  M: 2,
  N: 6,
  O: 8,
  P: 2,
  Q: 1,
  R: 6,
  S: 4,
  T: 6,
  U: 4,
  V: 2,
  W: 2,
  X: 1,
  Y: 2,
  Z: 1,
  "?": 2,
} as const;

export const TILE_POINTS: Record<string, number> = {
  A: 1,
  B: 3,
  C: 3,
  D: 2,
  E: 1,
  F: 4,
  G: 2,
  H: 4,
  I: 1,
  J: 8,
  K: 5,
  L: 1,
  M: 3,
  N: 1,
  O: 1,
  P: 3,
  Q: 10,
  R: 1,
  S: 1,
  T: 1,
  U: 1,
  V: 4,
  W: 4,
  X: 8,
  Y: 4,
  Z: 10,
  "?": 0,
};

export type TileZone = "hand" | "board";
export type MoveDestination = TileZone | "discard";
export type Player = {
  id: string;
  name: string;
  color: string;
  tileCount: number;
};
export type TableState = { players: Player[]; tiles: Tile[] };

export type Tile = {
  id: string;
  face: string;
  points: number;
  ownerId: string;
  zone: TileZone;
  x: number;
  y: number;
};

export function drawTileFace(random = Math.random): string {
  let roll = random() * 100;
  for (const [face, count] of Object.entries(TILE_DISTRIBUTION)) {
    roll -= count;
    if (roll < 0) return face;
  }
  return "?";
}

// ponytail: full snapshots scan tiles per peer; send deltas if table size causes lag.
export function snapshotForPlayer(
  state: TableState,
  playerId: string,
): TableState {
  return {
    players: state.players,
    tiles: state.tiles.filter(
      (tile) => tile.zone === "board" || tile.ownerId === playerId,
    ),
  };
}

export function moveTile(
  tiles: Tile[],
  tileId: string,
  ownerId: string,
  destination: MoveDestination,
  x: number,
  y: number,
): Tile[] {
  const tile = tiles.find((item) => item.id === tileId);
  if (!tile || tile.ownerId !== ownerId) return tiles;
  if (destination === "discard")
    return tiles.filter((item) => item.id !== tileId);

  return tiles.map((item) =>
    item.id === tileId
      ? {
          ...item,
          zone: destination,
          x: Math.max(0, Math.min(100, x)),
          y: Math.max(0, Math.min(100, y)),
        }
      : item,
  );
}
