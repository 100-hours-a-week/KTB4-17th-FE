import assert from "node:assert/strict";
import test from "node:test";
import { prepareCaptureSession } from "./captureSession.js";
import { holdProgress } from "./hold.js";
import { poseFixtures } from "./poseHold.fixtures.js";

const target = { legacy: false, hand: "HAND_TWO", direction: "UP", head: null };
const hand = poseFixtures.v.map((point) => ({ ...point, x: point.x + 0.3 }));
const neutral = (pitch = 0) => {
  const radians = (pitch * Math.PI) / 180;
  return {
    faceLandmarks: [
      [
        { x: 0.35, y: 0.23 },
        { x: 0.65, y: 0.73 },
      ],
    ],
    facialTransformationMatrixes: [
      {
        data: [
          1,
          0,
          0,
          0,
          0,
          Math.cos(radians),
          Math.sin(radians),
          0,
          0,
          -Math.sin(radians),
          Math.cos(radians),
          0,
          0,
          0,
          -45,
          1,
        ],
      },
    ],
  };
};
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

async function setup(t, options = {}) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  const controller = new AbortController();
  const states = [];
  let closed = 0,
    faceLoads = 0,
    handLoads = 0;
  const video = {
    readyState: 2,
    videoWidth: 640,
    videoHeight: 480,
    get currentTime() {
      return Date.now() / 1000;
    },
  };
  const session = await prepareCaptureSession(video, options.target || target, {
    signal: controller.signal,
    createFace: async () => {
      faceLoads++;
      return {
        detectForVideo: () => options.face?.(states.at(-1)) || neutral(),
        close: () => closed++,
      };
    },
    createHand: async () => {
      handLoads++;
      return {
        detectForVideo: () => ({ landmarks: options.hands?.() ?? [hand] }),
        close: () => closed++,
      };
    },
    onState: (state) => states.push(state),
  });
  let completed = false;
  const waiting = session.wait().then(() => {
    completed = true;
  });
  waiting.catch(() => {});
  const advance = async (count) => {
    for (let i = 0; i < count; i++) {
      t.mock.timers.tick(100);
      await flush();
    }
  };
  return {
    controller,
    states,
    waiting,
    advance,
    session,
    get completed() {
      return completed;
    },
    get closed() {
      return closed;
    },
    get loads() {
      return [faceLoads, handLoads];
    },
  };
}

test("each stage requires its own three-second hold, displays progress, and shares models", async (t) => {
  const run = await setup(t);
  await run.advance(30);
  assert.equal(run.completed, false);
  assert.equal(run.states.at(-1).stage, "centering");
  assert.ok(run.states.at(-1).progress > 0.8);
  await run.advance(6);
  assert.equal(run.states.at(-1).stage, "pose");
  assert.deepEqual(run.states.at(-1).completedStages, ["centering"]);
  await run.advance(30);
  assert.equal(run.completed, false);
  await run.advance(6);
  await run.waiting;
  assert.deepEqual(run.loads, [1, 1]);
  assert.equal(run.closed, 2);
});

test("face loss or a hand covering the face cannot complete the hand stage", async (t) => {
  let hideFace = false;
  const run = await setup(t, {
    face: () => (hideFace ? { faceLandmarks: [] } : neutral()),
  });
  await run.advance(35);
  hideFace = true;
  await run.advance(40);
  assert.equal(run.completed, false);
  assert.equal(run.states.at(-1).stage, "pose");
  assert.equal(run.states.at(-1).progress, 0);
  run.controller.abort();
  await assert.rejects(run.waiting);
  assert.equal(run.closed, 2);
});

test("head movement starts after the hand stage and must itself be held for three seconds", async (t) => {
  const run = await setup(t, {
    target: { ...target, head: "LOOK_UP" },
    face: (state) => neutral(state?.stage === "head" ? -20 : 0),
  });
  await run.advance(75);
  assert.equal(run.states.at(-1).stage, "head");
  assert.equal(run.completed, false);
  await run.advance(33);
  await run.waiting;
  assert.equal(run.states.at(-1).live.headCompleted, true);
});

test("brief detection loss pauses progress, long loss resets only the current hold", () => {
  let state = {};
  for (let i = 0; i <= 15; i++) state = holdProgress(state, true, i / 10);
  const elapsed = state.elapsed;
  state = holdProgress(state, false, 1.6);
  assert.equal(state.paused, true);
  assert.equal(state.elapsed, elapsed);
  state = holdProgress(state, true, 1.7);
  assert.equal(state.elapsed, elapsed);
  state = holdProgress(state, true, 2.1);
  assert.ok(state.elapsed > elapsed);
  state = holdProgress(state, false, 2.2);
  state = holdProgress(state, false, 3.0);
  assert.equal(state.progress, 0);
});

test("cancelled or partially failed model preparation releases every model", async () => {
  const controller = new AbortController();
  let release,
    closed = 0;
  const waiting = prepareCaptureSession({}, target, {
    signal: controller.signal,
    createFace: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    createHand: async () => {
      throw new Error("load failed");
    },
  });
  await assert.rejects(waiting, { code: "CAMERA_MODEL_UNAVAILABLE" });
  release({ close: () => closed++ });
  await flush();
  assert.equal(closed, 1);
});

test("model preparation cancellation rejects promptly and closes late models", async () => {
  const controller = new AbortController();
  let resolveFace,
    closed = 0;
  const preparing = prepareCaptureSession({}, target, {
    signal: controller.signal,
    createFace: () =>
      new Promise((resolve) => {
        resolveFace = resolve;
      }),
    createHand: async () => ({ close: () => closed++ }),
  });
  await flush();
  controller.abort();
  await assert.rejects(preparing, { name: "AbortError" });
  resolveFace({ close: () => closed++ });
  await flush();
  assert.equal(closed, 2);
});

test("model preparation has a deadline before recording starts", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const preparing = prepareCaptureSession({}, target, {
    signal: new AbortController().signal,
    createFace: () => new Promise(() => {}),
    createHand: () => new Promise(() => {}),
  });
  const rejected = assert.rejects(preparing, {
    code: "CAMERA_MODEL_UNAVAILABLE",
  });
  t.mock.timers.tick(30_000);
  await rejected;
});
