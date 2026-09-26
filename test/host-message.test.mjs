import assert from "node:assert/strict";
import test from "node:test";
import { handleHostMessage } from "../src/app/host-message.ts";

const guestTile = {
  id: "guest-tile",
  face: "A",
  points: 1,
  ownerId: "guest",
  zone: "hand",
  x: 0,
  y: 0,
  rotation: 0,
};

function createHostContext(drawOptions) {
  const channel = { readyState: "open", send() {} };
  const state = {
    gameRef: {
      current: {
        players: [
          { id: "host", name: "Host", color: "gold", tileCount: 0 },
          { id: "guest", name: "Guest", color: "blue", tileCount: 0 },
        ],
        tiles: [],
        drawOptions,
      },
    },
  };
  let broadcasts = 0;
  const context = {
    state,
    hostChannels: new Map([[channel, "guest"]]),
    pendingDrawGrants: new Map(),
    setInviteStatus() {},
    commitHostState(next) {
      state.gameRef.current = next;
      return next;
    },
    snapshotFor() {},
    queuePeerDragPreview() {},
    cancelPendingPeerDragUpdate() {},
    endDragPreview() {},
    clearDragPreview() {},
    broadcast() {
      broadcasts++;
    },
  };
  return { channel, context, state, broadcasts: () => broadcasts };
}

test("host rejects guest draws when client draws are disabled", () => {
  const { channel, context, state, broadcasts } = createHostContext({
    allowClientDraw: false,
    allowClientBlankDraw: true,
  });

  handleHostMessage(
    context,
    "invite",
    channel,
    JSON.stringify({
      type: "action",
      action: { kind: "draw", tile: guestTile },
    }),
  );

  assert.deepEqual(state.gameRef.current.tiles, []);
  assert.equal(broadcasts(), 0);
});

test("host accepts a client-generated random tile when enabled", () => {
  const { channel, context, state, broadcasts } = createHostContext({
    allowClientDraw: true,
    allowClientBlankDraw: false,
  });

  handleHostMessage(
    context,
    "invite",
    channel,
    JSON.stringify({
      type: "action",
      action: { kind: "draw", tile: guestTile },
    }),
  );

  assert.deepEqual(state.gameRef.current.tiles, [guestTile]);
  assert.equal(broadcasts(), 1);
});

test("host blocks client blank draws independently", () => {
  const { channel, context, state, broadcasts } = createHostContext({
    allowClientDraw: true,
    allowClientBlankDraw: false,
  });
  const blankTile = { ...guestTile, id: "guest-blank", face: "?", points: 0 };

  handleHostMessage(
    context,
    "invite",
    channel,
    JSON.stringify({
      type: "action",
      action: { kind: "draw", tile: blankTile },
    }),
  );

  assert.deepEqual(state.gameRef.current.tiles, []);
  assert.equal(broadcasts(), 0);
});

test("host discards only the requesting player's private tiles", () => {
  const { channel, context, state, broadcasts } = createHostContext({
    allowClientDraw: true,
    allowClientBlankDraw: true,
  });
  const hostTile = { ...guestTile, id: "host-tile", ownerId: "host" };
  const guestBoardTile = {
    ...guestTile,
    id: "guest-board",
    zone: "board",
  };
  state.gameRef.current.tiles = [guestTile, hostTile, guestBoardTile];

  handleHostMessage(
    context,
    "invite",
    channel,
    JSON.stringify({ type: "action", action: { kind: "discard-all" } }),
  );

  assert.deepEqual(state.gameRef.current.tiles, [hostTile, guestBoardTile]);
  assert.equal(broadcasts(), 1);
});

test("host accepts one client-drawn tile per grant result", () => {
  const { channel, context, state, broadcasts } = createHostContext({
    allowClientDraw: false,
    allowClientBlankDraw: false,
  });
  const tiles = [
    { ...guestTile, id: "grant-one" },
    { ...guestTile, id: "grant-two", face: "B", points: 3 },
  ];
  context.pendingDrawGrants.set("grant-1", {
    playerId: "guest",
    count: 2,
    blank: false,
    received: 0,
  });

  for (let index = 0; index < tiles.length; index++) {
    handleHostMessage(
      context,
      "invite",
      channel,
      JSON.stringify({
        type: "draw-grant-result",
        grantId: "grant-1",
        tile: tiles[index],
      }),
    );
    assert.deepEqual(state.gameRef.current.tiles, tiles.slice(0, index + 1));
    if (index + 1 < tiles.length)
      assert.equal(
        context.pendingDrawGrants.get("grant-1")?.received,
        index + 1,
      );
    else assert.equal(context.pendingDrawGrants.has("grant-1"), false);
  }

  assert.equal(context.pendingDrawGrants.has("grant-1"), false);
  assert.equal(broadcasts(), 2);
});
