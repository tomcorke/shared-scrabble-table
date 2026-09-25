import assert from "node:assert/strict";
import test from "node:test";
import { canJoinAnotherTable, connectionLabel } from "../src/app/view-state.ts";

test("table actions reflect role and connection state", () => {
  assert.equal(canJoinAnotherTable("host", 1, 0, "idle"), true);
  assert.equal(canJoinAnotherTable("host", 1, 1, "idle"), false);
  assert.equal(canJoinAnotherTable("guest", 1, 0, "failed"), true);
  assert.equal(canJoinAnotherTable("guest", 1, 0, "connected"), false);
});

test("connection labels describe host and guest states", () => {
  assert.equal(connectionLabel("host", "idle", 1), "Your private table");
  assert.equal(connectionLabel("host", "idle", 3), "2 players connected");
  assert.equal(connectionLabel("guest", "connected", 2), "Connected to table");
  assert.equal(connectionLabel("guest", "failed", 2), "Connection failed");
});
