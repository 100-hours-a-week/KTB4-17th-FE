import assert from "node:assert/strict";
import test from "node:test";
import { visibleHandSide, waitForHandSide } from "./handGuide.js";

const hand = (x) =>
  Array.from({ length: 21 }, (_, i) => ({
    x: x + ((i % 5) - 2) * 0.02,
    y: 0.4 + Math.floor(i / 5) * 0.02,
  }));

test("mirrored hand guides select the visible side and wait when both hands are raised", () => {
  assert.equal(visibleHandSide({ landmarks: [hand(0.25)] }), "right");
  assert.equal(visibleHandSide({ landmarks: [hand(0.75)] }), "left");
  assert.equal(visibleHandSide({ landmarks: [hand(0.25), hand(0.75)] }), null);
  assert.equal(visibleHandSide({ landmarks: [hand(0.5)] }), null);
  assert.equal(visibleHandSide({ landmarks: [hand(-0.1)] }), null);
  assert.equal(visibleHandSide({ landmarks: [] }), null);
});

test("a stable hand locks its guide and releases the model; cancellation closes late models", async () => {
  let frames = 0,
    calls = 0,
    closed = 0;
  const video = {
    readyState: 2,
    get currentTime() {
      return ++frames;
    },
  };
  const controller = new AbortController();
  const side = await waitForHandSide(video, {
    signal: controller.signal,
    create: async () => ({
      detectForVideo() {
        calls++;
        return { landmarks: [hand(0.25)] };
      },
      close() {
        closed++;
      },
    }),
  });
  assert.equal(side, "right");
  assert.equal(calls, 4);
  assert.equal(closed, 1);

  let resolveModel;
  const pendingModel = new Promise((resolve) => {
    resolveModel = resolve;
  });
  const abort = new AbortController();
  const pending = waitForHandSide(video, {
    signal: abort.signal,
    create: () => pendingModel,
  });
  abort.abort();
  await assert.rejects(pending, { name: "AbortError" });
  resolveModel({
    close() {
      closed++;
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(closed, 2);
});
