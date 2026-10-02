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
    close() {
      this.closed = true;
    },
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
  const peer = {
    onconnectionstatechange: null,
    close() {
      this.closed = true;
    },
  };
  controller.addPeer("invite", peer, channel);
  controller.handleMessage(
    "invite",
    channel,
    JSON.stringify({ type: "hello", name: "Guest" }),
  );
  return {
    channel,
    controller,
    peer,
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

test("host can move another player's shared tile and signals the drop", () => {
  const { controller, playerId, sent, state } = createConnectedHost();
  const tile = {
    id: "guest-board-tile",
    face: "A",
    points: 1,
    ownerId: playerId,
    zone: "board",
    x: 0,
    y: 0,
    rotation: 0,
  };
  state.gameRef.current.tiles = [tile];
  const sentBeforeDrop = sent.length;

  controller.performAction({
    kind: "move",
    tileId: tile.id,
    destination: "hand",
    x: 40,
    y: 55,
    rotation: 0,
  });

  assert.equal(state.gameRef.current.tiles[0].zone, "hand");
  assert.deepEqual(
    sent.slice(sentBeforeDrop).map(({ type }) => type),
    ["tile-drawn", "snapshot"],
  );
});

test("host clears shared tiles into their owners' private racks", () => {
  const { controller, playerId, state, sent } = createConnectedHost();
  const hostHand = {
    id: "host-hand",
    face: "A",
    points: 1,
    ownerId: "host",
    zone: "hand",
    x: 0,
    y: 0,
    rotation: 0,
  };
  const hostBoard = { ...hostHand, id: "host-board", zone: "board", x: 180 };
  const guestBoard = {
    ...hostBoard,
    id: "guest-board",
    ownerId: playerId,
    x: -180,
  };
  state.gameRef.current.tiles = [hostHand, hostBoard, guestBoard];

  controller.performHostAction(
    { kind: "clear-shared-area" },
    { viewportWidth: 980, rackWidth: 920, rackHeight: 205 },
  );

  assert.equal(
    state.gameRef.current.tiles.every((item) => item.zone === "hand"),
    true,
  );
  assert.deepEqual(state.gameRef.current.tiles[0], hostHand);
  assert.deepEqual(
    state.gameRef.current.players.map((player) => player.tileCount),
    [2, 1],
  );
  assert.equal(sent.at(-1).type, "snapshot");
});

test("host discards all tiles owned by one player", () => {
  const { controller, playerId, state, sent } = createConnectedHost();
  const hostTile = {
    id: "host-tile",
    face: "A",
    points: 1,
    ownerId: "host",
    zone: "board",
    x: 0,
    y: 0,
    rotation: 0,
  };
  state.gameRef.current.tiles = [
    hostTile,
    { ...hostTile, id: "guest-hand", ownerId: playerId, zone: "hand" },
    { ...hostTile, id: "guest-board", ownerId: playerId },
  ];

  controller.performHostAction({ kind: "discard-player-tiles", playerId });

  assert.deepEqual(state.gameRef.current.tiles, [hostTile]);
  assert.equal(state.gameRef.current.players[1].tileCount, 0);
  assert.equal(sent.at(-1).type, "snapshot");
});

test("host grants VIP and disconnects a player with all their tiles", () => {
  const { controller, playerId, peer, channel, sent, state } =
    createConnectedHost();
  const tile = {
    id: "guest-tile",
    face: "A",
    points: 1,
    ownerId: playerId,
    zone: "board",
    x: 0,
    y: 0,
    rotation: 0,
  };
  state.gameRef.current.tiles = [tile];

  controller.performHostAction({
    kind: "set-player-vip",
    playerId,
    isVip: true,
  });
  assert.equal(state.gameRef.current.players[1].isVip, true);
  assert.equal(sent.at(-1).state.players[1].isVip, true);
  controller.performHostAction({ kind: "disconnect-player", playerId });

  assert.deepEqual(
    state.gameRef.current.players.map(({ id }) => id),
    ["host"],
  );
  assert.deepEqual(state.gameRef.current.tiles, []);
  assert.equal(peer.closed, true);
  assert.equal(channel.closed, true);
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
