import assert from "node:assert/strict";
import test from "node:test";
import {
  addTileDragImpulse,
  canSendDragUpdate,
  createTile,
  drawTileFace,
  moveTile,
  projectedTileCenter,
  stepTileSwing,
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
  rotation: 0,
  x: 10,
  y: 20,
};

test("projects grounded tile center around the grabbed pivot", () => {
  const drag = {
    pointerX: 100,
    pointerY: 200,
    grabX: 10,
    grabY: 20,
    width: 50,
    height: 60,
  };

  assert.deepEqual(projectedTileCenter({ ...drag, rotation: 0 }), {
    x: 115,
    y: 210,
  });
  assert.deepEqual(projectedTileCenter({ ...drag, rotation: 90 }), {
    x: 90,
    y: 215,
  });
});

test("shared drag position updates are capped at five per second", () => {
  assert.equal(canSendDragUpdate(999, 800), false);
  assert.equal(canSendDragUpdate(1000, 800), true);
  assert.equal(canSendDragUpdate(800, -Infinity), true);
});

test("drag impulses stay small and swing around arbitrary pickup points", () => {
  const pivot = { grabX: 30, grabY: 0, width: 60, height: 60 };
  let small = {
    rotation: 0,
    angularVelocity: addTileDragImpulse({
      ...pivot,
      rotation: 0,
      angularVelocity: 0,
      deltaX: 1,
      deltaY: 0,
    }),
  };
  for (let i = 0; i < 120; i++) {
    small = stepTileSwing({ ...small, dt: 1 / 120 });
  }
  assert.ok(Math.abs(small.rotation) < 1);

  let dragged = { rotation: 0, angularVelocity: 0 };
  for (let i = 0; i < 16; i++) {
    dragged.angularVelocity = addTileDragImpulse({
      ...pivot,
      ...dragged,
      deltaX: 15,
      deltaY: 0,
    });
    for (let step = 0; step < 2; step++) {
      dragged = stepTileSwing({ ...dragged, dt: 1 / 120 });
    }
  }
  assert.ok(dragged.rotation > 4 && dragged.rotation <= 5);
  const capped = stepTileSwing({
    rotation: 4,
    angularVelocity: 10,
    dt: 1 / 60,
  });
  assert.equal(capped.rotation, 5);
  assert.equal(capped.angularVelocity, 0);
  const negativeCap = stepTileSwing({
    rotation: -4,
    angularVelocity: -10,
    dt: 1 / 60,
  });
  assert.equal(negativeCap.rotation, -5);
  assert.equal(negativeCap.angularVelocity, 0);

  const fromLeft = addTileDragImpulse({
    rotation: 0,
    angularVelocity: 0,
    deltaX: 0,
    deltaY: 1,
    grabX: 0,
    grabY: 30,
    width: 60,
    height: 60,
  });
  assert.ok(fromLeft < 0);

  const centered = addTileDragImpulse({
    rotation: 0,
    angularVelocity: 0,
    deltaX: 1,
    deltaY: 0,
    grabX: 30,
    grabY: 30,
    width: 60,
    height: 60,
  });
  assert.equal(centered, 0);
});

test("spawns random-rotated tiles across centered viewport span without overlap", () => {
  const randomSequence = (...values) => {
    let index = 0;
    return () => values[index++] ?? 0.5;
  };
  const first = createTile(
    "player-a",
    [],
    764,
    708,
    108,
    randomSequence(0, 0.5, 0),
  );
  const second = createTile(
    "player-a",
    [first],
    764,
    708,
    108,
    randomSequence(0, 0.99, 0),
  );

  assert.equal(first.face, "A");
  assert.equal(first.rotation, 0);
  assert.equal(second.rotation, 4.9);
  assert.ok(Math.abs(first.rotation) <= 5);
  assert.ok(Math.abs(second.rotation) <= 5);
  assert.equal(first.x, -300);
  assert.equal(second.x, 0);
  assert.ok(Math.abs(first.x) <= 300);
  assert.ok(Math.abs(second.x) <= 300);
  assert.ok(Math.abs(first.y) <= 20);
  assert.ok(Math.abs(second.y) <= 20);
  const continuous = createTile(
    "player-a",
    [],
    764,
    708,
    108,
    randomSequence(0, 0.5, 0.25, 0.75),
  );
  assert.equal(continuous.x, -150);
  assert.equal(continuous.y, 10);
  assert.equal(
    createTile("player-a", [], 2400, 2344, 180, randomSequence(0, 0.5, 0)).x,
    -400,
  );
});

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
  assert.deepEqual(moveTile(tiles, "one", "player-a", "board", 140, -2, 3), [
    { ...tile, zone: "board", x: 140, y: -2, rotation: 3 },
  ]);
  const rotatedTile = { ...tile, rotation: 3 };
  assert.equal(
    moveTile([rotatedTile], "one", "player-a", "board", 50, 50)[0].rotation,
    3,
  );
  assert.equal(
    moveTile(tiles, "one", "player-a", "board", 50, 50, 4)[0].rotation,
    4,
  );
  assert.equal(
    moveTile(tiles, "one", "player-a", "board", 50, 50, 45)[0].rotation,
    5,
  );
  assert.equal(
    moveTile(tiles, "one", "player-a", "board", 50, 50, -45)[0].rotation,
    -5,
  );
  assert.deepEqual(moveTile(tiles, "one", "player-a", "discard", 0, 0), []);
});
