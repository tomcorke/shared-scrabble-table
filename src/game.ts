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

export const MAX_TILE_ROTATION = 5;
export const DRAG_UPDATE_INTERVAL_MS = 200;
const MAX_SWING_SPEED = 6;
const SWING_DRAG_GAIN = 1;
const SWING_DAMPING = 4;

export type Tile = {
  id: string;
  face: string;
  points: number;
  ownerId: string;
  zone: TileZone;
  // CSS-pixel offsets from rack or play-area center.
  x: number;
  y: number;
  rotation: number;
};

export function canSendDragUpdate(now: number, lastSentAt: number) {
  return now - lastSentAt >= DRAG_UPDATE_INTERVAL_MS;
}

export function drawTileFace(random = Math.random): string {
  let roll = random() * 100;
  for (const [face, count] of Object.entries(TILE_DISTRIBUTION)) {
    roll -= count;
    if (roll < 0) return face;
  }
  return "?";
}

const TILE_WIDTH = 55;
const TILE_HEIGHT = 66;
export const MAX_POSITION_OFFSET = 10_000;

function overlapsRackTile(
  position: { x: number; y: number },
  rotation: number,
  tile: Tile,
) {
  const radians = (rotation * Math.PI) / 180;
  const otherRadians = (tile.rotation * Math.PI) / 180;
  const axes = [
    { x: Math.cos(radians), y: Math.sin(radians) },
    { x: -Math.sin(radians), y: Math.cos(radians) },
    { x: Math.cos(otherRadians), y: Math.sin(otherRadians) },
    { x: -Math.sin(otherRadians), y: Math.cos(otherRadians) },
  ];
  const deltaX = position.x - tile.x;
  const deltaY = position.y - tile.y;

  return axes.every((axis) => {
    const distance = Math.abs(deltaX * axis.x + deltaY * axis.y);
    const radius = (angle: number) => {
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      return (
        (TILE_WIDTH / 2 + 1) * Math.abs(cosine * axis.x + sine * axis.y) +
        (TILE_HEIGHT / 2 + 1) * Math.abs(-sine * axis.x + cosine * axis.y)
      );
    };
    return distance < radius(radians) + radius(otherRadians);
  });
}

// ponytail: 64 random tries then least-overlap; add spatial packing if dense racks still collide.
export function findRackPosition(
  tiles: Tile[],
  ownerId: string,
  rotation: number,
  viewportWidth: number,
  rackWidth: number,
  rackHeight: number,
  random = Math.random,
) {
  const rackTiles = tiles.filter(
    (tile) => tile.ownerId === ownerId && tile.zone === "hand",
  );
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const halfWidth = (TILE_WIDTH * cosine + TILE_HEIGHT * sine) / 2 + 1;
  const halfHeight = (TILE_WIDTH * sine + TILE_HEIGHT * cosine) / 2 + 1;
  const horizontalSpan = Math.min(
    Math.max(viewportWidth / 3, 600),
    Math.max(0, rackWidth - halfWidth * 2),
  );
  const verticalSpan = Math.max(0, rackHeight - halfHeight * 2);
  let bestPosition = { x: 0, y: 0 };
  let bestOverlap = Infinity;

  for (let attempt = 0; attempt < 64; attempt++) {
    const position = {
      x: (random() - 0.5) * horizontalSpan,
      y: (random() - 0.5) * verticalSpan,
    };
    const overlap = rackTiles.filter((tile) =>
      overlapsRackTile(position, rotation, tile),
    ).length;
    if (overlap === 0) return position;
    if (overlap < bestOverlap) {
      bestPosition = position;
      bestOverlap = overlap;
    }
  }

  return bestPosition;
}

export function createTile(
  ownerId: string,
  tiles: Tile[],
  viewportWidth: number,
  rackWidth: number,
  rackHeight: number,
  random = Math.random,
): Tile {
  const face = drawTileFace(random);
  const rotation = random() * MAX_TILE_ROTATION * 2 - MAX_TILE_ROTATION;
  const position = findRackPosition(
    tiles,
    ownerId,
    rotation,
    viewportWidth,
    rackWidth,
    rackHeight,
    random,
  );

  return {
    id: crypto.randomUUID(),
    face,
    points: TILE_POINTS[face],
    ownerId,
    zone: "hand",
    ...position,
    rotation,
  };
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

export function projectedTileCenter({
  pointerX,
  pointerY,
  grabX,
  grabY,
  width,
  height,
  rotation,
}: {
  pointerX: number;
  pointerY: number;
  grabX: number;
  grabY: number;
  width: number;
  height: number;
  rotation: number;
}) {
  const radians = (rotation * Math.PI) / 180;
  const x = width / 2 - grabX;
  const y = height / 2 - grabY;

  return {
    x: pointerX + x * Math.cos(radians) - y * Math.sin(radians),
    y: pointerY + x * Math.sin(radians) + y * Math.cos(radians),
  };
}

export function addTileDragImpulse({
  rotation,
  angularVelocity,
  deltaX,
  deltaY,
  grabX,
  grabY,
  width,
  height,
}: {
  rotation: number;
  angularVelocity: number;
  deltaX: number;
  deltaY: number;
  grabX: number;
  grabY: number;
  width: number;
  height: number;
}) {
  const offsetX = width / 2 - grabX;
  const offsetY = height / 2 - grabY;
  const radians = (rotation * Math.PI) / 180;
  const centerX = offsetX * Math.cos(radians) - offsetY * Math.sin(radians);
  const centerY = offsetX * Math.sin(radians) + offsetY * Math.cos(radians);
  const inertia = offsetX ** 2 + offsetY ** 2 + (width ** 2 + height ** 2) / 12;

  return Math.max(
    -MAX_SWING_SPEED,
    Math.min(
      MAX_SWING_SPEED,
      angularVelocity +
        ((deltaX * centerY - deltaY * centerX) / inertia) * SWING_DRAG_GAIN,
    ),
  );
}

export function stepTileSwing({
  rotation,
  angularVelocity,
  dt,
}: {
  rotation: number;
  angularVelocity: number;
  dt: number;
}) {
  const nextVelocity = angularVelocity * Math.exp(-SWING_DAMPING * dt);
  const settledVelocity = Math.abs(nextVelocity) < 0.001 ? 0 : nextVelocity;
  const nextRotation = rotation + (settledVelocity * dt * 180) / Math.PI;
  const boundedRotation = Math.max(
    -MAX_TILE_ROTATION,
    Math.min(MAX_TILE_ROTATION, nextRotation),
  );

  return {
    rotation: boundedRotation,
    angularVelocity: boundedRotation === nextRotation ? settledVelocity : 0,
  };
}

export function moveTile(
  tiles: Tile[],
  tileId: string,
  ownerId: string,
  destination: MoveDestination,
  x: number,
  y: number,
  rotation?: number,
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
          x: Math.max(-MAX_POSITION_OFFSET, Math.min(MAX_POSITION_OFFSET, x)),
          y: Math.max(-MAX_POSITION_OFFSET, Math.min(MAX_POSITION_OFFSET, y)),
          rotation: Math.max(
            -MAX_TILE_ROTATION,
            Math.min(MAX_TILE_ROTATION, rotation ?? tile.rotation),
          ),
        }
      : item,
  );
}
