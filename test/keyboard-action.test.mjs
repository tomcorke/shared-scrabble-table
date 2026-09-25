import assert from "node:assert/strict";
import test from "node:test";
import { tileKeyboardAction } from "../src/app/keyboard-action.ts";

const tile = {
  id: "tile-a",
  face: "A",
  points: 1,
  ownerId: "player-a",
  zone: "hand",
  x: 4,
  y: -2,
  rotation: 3,
};

test("keyboard actions move, discard, and nudge tiles", () => {
  assert.deepEqual(tileKeyboardAction("Enter", false, tile), {
    kind: "move",
    tileId: "tile-a",
    destination: "board",
    x: 4,
    y: -2,
    rotation: 3,
  });
  assert.equal(
    tileKeyboardAction("Backspace", false, tile).destination,
    "discard",
  );
  assert.deepEqual(tileKeyboardAction("ArrowLeft", true, tile), {
    kind: "move",
    tileId: "tile-a",
    destination: "hand",
    x: -4,
    y: -2,
    rotation: 3,
  });
  assert.equal(tileKeyboardAction("Escape", false, tile), null);
});
