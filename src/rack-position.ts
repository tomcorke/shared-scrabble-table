import type { Tile } from "./game.ts";

const TILE_WIDTH = 55;
const TILE_HEIGHT = 66;

type RackPosition = { x: number; y: number };
type RackSearch = { position: RackPosition; penetration: number };
type ConsiderPosition = (position: RackPosition) => boolean;

function rackTileOverlapDepth(
  position: RackPosition,
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

  let overlapDepth = Infinity;
  for (const axis of axes) {
    const distance = Math.abs(deltaX * axis.x + deltaY * axis.y);
    const radius = (angle: number) => {
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      return (
        (TILE_WIDTH / 2 + 1) * Math.abs(cosine * axis.x + sine * axis.y) +
        (TILE_HEIGHT / 2 + 1) * Math.abs(-sine * axis.x + cosine * axis.y)
      );
    };
    const overlap = radius(radians) + radius(otherRadians) - distance;
    if (overlap <= 0) return 0;
    overlapDepth = Math.min(overlapDepth, overlap);
  }
  return overlapDepth;
}

function considerRackPosition(
  position: RackPosition,
  tiles: Tile[],
  rotation: number,
  best: RackSearch,
) {
  const penetration = tiles.reduce(
    (total, tile) => total + rackTileOverlapDepth(position, rotation, tile),
    0,
  );
  if (penetration === 0) return true;
  if (penetration < best.penetration) {
    best.position = position;
    best.penetration = penetration;
  }
  return false;
}

function randomRingRadius(
  ring: number,
  maxRadius: number,
  random: () => number,
) {
  const baseRadius = Math.min(maxRadius, ring * (TILE_WIDTH / 3));
  return ring === 0 || baseRadius === maxRadius
    ? baseRadius
    : baseRadius + (random() - 0.5) * (TILE_WIDTH / 3) * 0.4;
}

function findLinearRackPosition(
  horizontalRadius: number,
  verticalRadius: number,
  consider: ConsiderPosition,
  best: RackSearch,
  random: () => number,
) {
  const maxRadius = Math.max(horizontalRadius, verticalRadius);
  const radialStep = TILE_WIDTH / 3;
  for (let ring = 0; ring <= Math.ceil(maxRadius / radialStep); ring++) {
    const radius = randomRingRadius(ring, maxRadius, random);
    const directions = radius === 0 ? [1] : random() < 0.5 ? [-1, 1] : [1, -1];
    for (const direction of directions) {
      const position =
        horizontalRadius === 0
          ? { x: 0, y: direction * radius }
          : { x: direction * radius, y: 0 };
      if (consider(position)) return position;
    }
  }
  return best.position;
}

function findAreaRackPosition(
  horizontalRadius: number,
  verticalRadius: number,
  consider: ConsiderPosition,
  best: RackSearch,
  random: () => number,
) {
  const maxRadius = Math.hypot(horizontalRadius, verticalRadius);
  const radialStep = TILE_WIDTH / 3;
  for (let ring = 0; ring <= Math.ceil(maxRadius / radialStep); ring++) {
    const radius = randomRingRadius(ring, maxRadius, random);
    const pointCount =
      radius === 0
        ? 1
        : Math.max(6, Math.ceil((2 * Math.PI * radius) / (TILE_WIDTH / 2)));
    const phase = random() * 2 * Math.PI;

    for (let point = 0; point < pointCount; point++) {
      const angle = phase + (point * 2 * Math.PI) / pointCount;
      const position = {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
      if (
        Math.abs(position.x) > horizontalRadius ||
        Math.abs(position.y) > verticalRadius
      )
        continue;
      if (consider(position)) return position;
    }
  }
  return best.position;
}

// ponytail: coarse center-out rings then least-penetration fallback; use finer packing if dense racks still collide.
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
  const horizontalRadius =
    Math.min(viewportWidth, Math.max(0, rackWidth - halfWidth * 2)) / 2;
  const verticalRadius = Math.max(0, rackHeight - halfHeight * 2) / 2;
  const best = { position: { x: 0, y: 0 }, penetration: Infinity };
  const consider = (position: RackPosition) =>
    considerRackPosition(position, rackTiles, rotation, best);

  return horizontalRadius === 0 || verticalRadius === 0
    ? findLinearRackPosition(
        horizontalRadius,
        verticalRadius,
        consider,
        best,
        random,
      )
    : findAreaRackPosition(
        horizontalRadius,
        verticalRadius,
        consider,
        best,
        random,
      );
}
