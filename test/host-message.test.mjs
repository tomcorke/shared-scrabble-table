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

function createHostContext(drawOptions, guestIsVip = false) {
  const channel = { readyState: "open", send() {} };
  const state = {
    gameRef: {
      current: {
        players: [
          { id: "host", name: "Host", color: "gold", tileCount: 0 },
          {
            id: "guest",
            name: "Guest",
            color: "blue",
            tileCount: 0,
            isVip: guestIsVip,
          },
        ],
        tiles: [],
        drawOptions,
      },
    },
  };
  let broadcasts = 0;
  let previews = 0;
  let sounds = 0;
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
    queuePeerDragPreview() {
      previews++;
    },
    signalTileSound() {
      sounds++;
    },
    cancelPendingPeerDragUpdate() {},
    endDragPreview() {},
    clearDragPreview() {},
    broadcast() {
      broadcasts++;
    },
  };
  return {
    channel,
    context,
    state,
    broadcasts: () => broadcasts,
    previews: () => previews,
    sounds: () => sounds,
  };
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

test("a guest tile drop signals the deal sound to every peer", () => {
  const { channel, context, state, broadcasts, sounds } = createHostContext({
    allowClientDraw: true,
    allowClientBlankDraw: true,
  });
  state.gameRef.current.tiles = [guestTile];

  handleHostMessage(
    context,
    "invite",
    channel,
    JSON.stringify({
      type: "action",
      action: {
        kind: "move",
        tileId: guestTile.id,
        destination: "board",
        x: 50,
        y: 60,
        rotation: 0,
      },
    }),
  );

  assert.equal(state.gameRef.current.tiles[0].zone, "board");
  assert.equal(sounds(), 1);
  assert.equal(broadcasts(), 1);
});

test("VIP guests can preview another player's shared tile", () => {
  const { channel, context, state, previews } = createHostContext(
    { allowClientDraw: true, allowClientBlankDraw: true },
    true,
  );
  state.gameRef.current.tiles = [
    { ...guestTile, id: "host-board", ownerId: "host", zone: "board" },
  ];

  handleHostMessage(
    context,
    "invite",
    channel,
    JSON.stringify({
      type: "action",
      action: {
        kind: "drag-preview",
        tileId: "host-board",
        x: 50,
        y: 60,
        rotation: 5,
      },
    }),
  );

  assert.equal(previews(), 1);
});

test("VIP guests can move other players' shared tiles, but not private tiles", () => {
  const drawOptions = {
    allowClientDraw: true,
    allowClientBlankDraw: true,
  };
  const regular = createHostContext(drawOptions);
  const hostBoardTile = {
    ...guestTile,
    id: "host-board",
    ownerId: "host",
    zone: "board",
  };
  regular.state.gameRef.current.tiles = [hostBoardTile];
  const move = (tileId) =>
    JSON.stringify({
      type: "action",
      action: {
        kind: "move",
        tileId,
        destination: "hand",
        x: 25,
        y: 30,
        rotation: 0,
      },
    });

  handleHostMessage(
    regular.context,
    "invite",
    regular.channel,
    move("host-board"),
  );
  assert.deepEqual(regular.state.gameRef.current.tiles, [hostBoardTile]);
  assert.equal(regular.broadcasts(), 0);

  const vip = createHostContext(drawOptions, true);
  const hostPrivateTile = { ...guestTile, id: "host-hand", ownerId: "host" };
  vip.state.gameRef.current.tiles = [hostBoardTile, hostPrivateTile];
  handleHostMessage(vip.context, "invite", vip.channel, move("host-board"));
  assert.equal(
    vip.state.gameRef.current.tiles.find((tile) => tile.id === "host-board")
      .zone,
    "hand",
  );
  assert.equal(vip.broadcasts(), 1);

  const moved = vip.state.gameRef.current.tiles;
  handleHostMessage(vip.context, "invite", vip.channel, move("host-hand"));
  assert.equal(vip.state.gameRef.current.tiles, moved);
  assert.equal(vip.broadcasts(), 1);
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
