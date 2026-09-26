import assert from "node:assert/strict";
import test from "node:test";
import { playTileSound, unlockTileAudio } from "../src/app/tile-sound.ts";

class FakeAudioNode {
  frequency = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  gain = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
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

test("schedules a short tone and click on an unlocked audio context", () => {
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
    unlockTileAudio();
    playTileSound();
    assert.deepEqual(context.nodes.filter((node) => node.starts).length, 2);
  } finally {
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
  }
});
