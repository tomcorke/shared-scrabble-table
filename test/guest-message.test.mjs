import assert from "node:assert/strict";
import test from "node:test";
import { handleGuestMessage } from "../src/app/guest-message.ts";

test("guest draws the requested count locally after a host grant", () => {
  let grant;

  handleGuestMessage(
    {},
    () => {},
    JSON.stringify({ type: "draw-grant", grantId: "grant-1", count: 3 }),
    (...args) => {
      grant = args;
    },
  );

  assert.deepEqual(grant, ["grant-1", 3, false]);
});

test("guest plays the host's per-tile sound signal", () => {
  let sounds = 0;
  handleGuestMessage(
    {},
    () => {},
    JSON.stringify({ type: "tile-drawn" }),
    () => {},
    () => sounds++,
  );

  assert.equal(sounds, 1);
});

test("guest applies client draw permissions from host snapshots", () => {
  let game;
  const state = {
    updateGame(next) {
      game = next;
    },
  };
  const snapshot = {
    players: [],
    tiles: [],
    drawOptions: {
      allowClientDraw: false,
      allowClientBlankDraw: true,
    },
  };

  handleGuestMessage(
    state,
    () => {},
    JSON.stringify({ type: "snapshot", state: snapshot }),
    () => {},
  );

  assert.deepEqual(game.drawOptions, snapshot.drawOptions);
});
