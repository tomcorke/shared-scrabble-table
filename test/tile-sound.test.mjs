import assert from "node:assert/strict";
import test from "node:test";
import {
  playTileSound,
  setTileSoundEnabled,
  unlockTileAudio,
} from "../src/app/tile-sound.ts";

class FakeAudioNode {
  frequency = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  gain = { setValueAtTime() {}, linearRampToValueAtTime() {} };
  starts = 0;

  connect() {
    return this;
  }

  start() {
    this.starts++;
  }

  stop() {}
}

class FakeAudioContext {
  state = "running";
  currentTime = 0;
  sampleRate = 1000;
  destination = {};
  nodes = [];

  createOscillator() {
    return this.node();
  }

  createGain() {
    return this.node();
  }

  createBufferSource() {
    return this.node();
  }

  createBiquadFilter() {
    return this.node();
  }

  createBuffer(_channels, length) {
    return { getChannelData: () => new Float32Array(length) };
  }

  node() {
    const node = new FakeAudioNode();
    this.nodes.push(node);
    return node;
  }
}

test("plays every Sound Creator layer only after unlock", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const context = new FakeAudioContext();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      AudioContext: class extends FakeAudioContext {
        constructor() {
          super();
          return context;
        }
      },
    },
  });

  try {
    playTileSound();
    assert.equal(context.nodes.length, 0);
    unlockTileAudio();
    setTileSoundEnabled(false);
    playTileSound();
    assert.deepEqual(context.nodes.filter((node) => node.starts).length, 0);
    setTileSoundEnabled(true);
    playTileSound();
    assert.deepEqual(context.nodes.filter((node) => node.starts).length, 6);
  } finally {
    setTileSoundEnabled(true);
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
  }
});
