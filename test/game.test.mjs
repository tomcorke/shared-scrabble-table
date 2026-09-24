import assert from "node:assert/strict";
import test from "node:test";
import {
  drawTileFace,
  moveTile,
  snapshotForPlayer,
  TILE_DISTRIBUTION,
  TILE_POINTS,
} from "../src/game.ts";

const tile = {
  id: "one",
  face: "A",
  points: 1,
  ownerId: "player-a",
  zone: "hand",
  x: 10,
  y: 20,
};

test("draws from the standard 100-tile distribution", () => {
  assert.equal(
    Object.values(TILE_DISTRIBUTION).reduce((sum, count) => sum + count),
    100,
  );
  assert.equal(
    drawTileFace(() => 0),
    "A",
  );
  assert.equal(
    drawTileFace(() => 0.999),
    "?",
  );
  assert.equal(TILE_POINTS.Q, 10);
  assert.equal(TILE_POINTS["?"], 0);
});

test("players receive only their private tiles and shared tiles", () => {
  const state = {
    players: [
      { id: "player-a", name: "A", color: "gold", tileCount: 1 },
      { id: "player-b", name: "B", color: "blue", tileCount: 1 },
    ],
    tiles: [
      tile,
      { ...tile, id: "two", ownerId: "player-b" },
      { ...tile, id: "public", ownerId: "player-b", zone: "board" },
    ],
  };

  assert.deepEqual(
    snapshotForPlayer(state, "player-a").tiles.map(({ id }) => id),
    ["one", "public"],
  );
});

test("only tile owners can move or discard their tiles", () => {
  const tiles = [tile];
  assert.equal(moveTile(tiles, "one", "player-b", "board", 50, 50), tiles);
  assert.deepEqual(moveTile(tiles, "one", "player-a", "board", 140, -2), [
    { ...tile, zone: "board", x: 100, y: 0 },
  ]);
  assert.deepEqual(moveTile(tiles, "one", "player-a", "discard", 0, 0), []);
});
