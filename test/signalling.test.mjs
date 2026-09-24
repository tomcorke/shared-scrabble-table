import assert from "node:assert/strict";
import test from "node:test";
import { parseSessionDescription } from "../src/signalling.ts";

test("validates copied session descriptions", () => {
  assert.deepEqual(
    parseSessionDescription('{"type":"offer","sdp":"test-sdp"}'),
    { type: "offer", sdp: "test-sdp" },
  );
  assert.throws(() => parseSessionDescription('{"type":"rollback"}'));
  assert.throws(() => parseSessionDescription('{"type":"offer","sdp":""}'));
  assert.throws(() => parseSessionDescription("not json"));
});
