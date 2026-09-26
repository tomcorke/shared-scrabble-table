import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_DRAW_OPTIONS } from "../src/game.ts";
import { HostController } from "../src/app/host-controller.ts";

function createConnectedHost() {
  const sent = [];
  const channel = {
    readyState: "open",
    send(message) {
      sent.push(JSON.parse(message));
    },
    close() {},
  };
  const state = {
    gameRef: {
      current: {
        players: [{ id: "host", name: "Host", color: "gold", tileCount: 0 }],
        tiles: [],
        drawOptions: { ...DEFAULT_DRAW_OPTIONS },
      },
    },
    myIdRef: { current: "host" },
    setGame(next) {
      this.gameRef.current = next;
    },
    setInvites() {},
    setConnectionState() {},
  };
  const controller = new HostController(state, () => {});
  controller.handleMessage(
    "invite",
    channel,
    JSON.stringify({ type: "hello", name: "Guest" }),
  );
  return {
    channel,
    controller,
    playerId: state.gameRef.current.players[1].id,
    sent,
    state,
  };
}

test("host broadcasts a draw sound before each new tile snapshot", () => {
  const { controller, sent, state } = createConnectedHost();
  const sentBeforeDraw = sent.length;
  const tile = {
    id: "host-tile",
    face: "A",
    points: 1,
    ownerId: "host",
    zone: "hand",
    x: 0,
    y: 0,
    rotation: 0,
  };

  controller.performAction({ kind: "draw", tile });

  assert.deepEqual(state.gameRef.current.tiles, [tile]);
  assert.deepEqual(
    sent.slice(sentBeforeDraw).map(({ type }) => type),
    ["tile-drawn", "snapshot"],
  );
});

test("host sends count-only grants and broadcasts option changes", () => {
  const { controller, playerId, sent, state } = createConnectedHost();

  controller.performAction({
    kind: "grant-draw",
    playerId,
    count: 4,
    blank: false,
  });
  assert.deepEqual(sent.at(-1), {
    type: "draw-grant",
    grantId: sent.at(-1).grantId,
    count: 4,
  });
  assert.equal("tiles" in sent.at(-1), false);

  controller.performAction({
    kind: "set-draw-options",
    drawOptions: {
      allowClientDraw: false,
      allowClientBlankDraw: true,
    },
  });
  assert.deepEqual(state.gameRef.current.drawOptions, {
    allowClientDraw: false,
    allowClientBlankDraw: true,
  });
  assert.equal(sent.at(-1).type, "snapshot");
  assert.deepEqual(
    sent.at(-1).state.drawOptions,
    state.gameRef.current.drawOptions,
  );
});
