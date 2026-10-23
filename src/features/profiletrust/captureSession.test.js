import assert from "node:assert/strict";
import test from "node:test";
import {
  handCoversFace,
  prepareCaptureSession,
  recordWithRestarts,
} from "./captureSession.js";
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
  await run.advance(28);
  assert.equal(run.completed, false);
  assert.equal(run.states.at(-1).stage, "centering");
  assert.ok(run.states.at(-1).progress > 0.8);
  await run.advance(4);
  assert.equal(run.states.at(-1).stage, "pose");
  assert.deepEqual(run.states.at(-1).completedStages, ["centering"]);
  await run.advance(26);
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

test("a stalled pose stage reports the most frequent blocker", async (t) => {
  const cropped = hand.map((point, index) =>
    index === 8 ? { ...point, y: -0.15 } : point,
  );
  let stalled = false;
  const run = await setup(t, { hands: () => (stalled ? [cropped] : [hand]) });
  await run.advance(36);
  assert.equal(run.states.at(-1).stage, "pose");
  stalled = true;
  await run.advance(10);
  assert.deepEqual(run.session.stuck(), {
    stage: "pose",
    blocker: "HAND_CROPPED",
  });
  run.controller.abort();
});

// 정면 얼굴 박스 x 0.35~0.65, y 0.23~0.73. 휴대폰처럼 얼굴이 크면 손을 얼굴 옆에 둘 때 뺨 쪽과 겹친다.
const cheekHand = poseFixtures.v.map((point) => ({
  ...point,
  x: point.x + 0.094,
}));
const faceBox = { x: 0.5, y: 0.48, width: 0.3, height: 0.5 };

test("only the face center counts as covered in pose and head stages", () => {
  assert.equal(handCoversFace(faceBox, [cheekHand]), true);
  assert.equal(
    handCoversFace(faceBox, [cheekHand], { centerOnly: true }),
    false,
  );
  const overCenter = poseFixtures.v.map((point) => ({
    ...point,
    y: point.y - 0.1,
  }));
  assert.equal(
    handCoversFace(faceBox, [overCenter], { centerOnly: true }),
    true,
  );
});

test("pose stage accepts a hand beside the face that overlaps only the cheek", async (t) => {
  let raised = false;
  const run = await setup(t, { hands: () => (raised ? [cheekHand] : [hand]) });
  await run.advance(36);
  assert.equal(run.states.at(-1).stage, "pose");
  raised = true;
  await run.advance(36);
  assert.equal(run.completed, true);
});

test("pose stage still blocks a hand over the face center", async (t) => {
  const overCenter = poseFixtures.v.map((point) => ({
    ...point,
    y: point.y - 0.1,
  }));
  let raised = false;
  const run = await setup(t, { hands: () => (raised ? [overCenter] : [hand]) });
  await run.advance(36);
  raised = true;
  await run.advance(10);
  assert.deepEqual(run.session.stuck(), {
    stage: "pose",
    blocker: "HAND_COVERS_FACE",
  });
  run.controller.abort();
});

test("a phone held close gets a distance hint when the hand has no room", async (t) => {
  const close = () => ({
    ...neutral(),
    faceLandmarks: [
      [
        { x: 0.25, y: 0.15 },
        { x: 0.75, y: 0.8 },
      ],
    ],
  });
  const cropped = hand.map((point, index) =>
    index === 8 ? { ...point, y: -0.15 } : point,
  );
  let raised = false;
  const run = await setup(t, {
    face: close,
    hands: () => (raised ? [cropped] : [hand]),
  });
  await run.advance(36);
  raised = true;
  await run.advance(3);
  assert.match(run.states.at(-1).hint, /휴대폰을 조금 더 멀리/);
  run.controller.abort();
});

test("restart stops the current run without closing models and a new run starts from the frontal stage", async (t) => {
  const run = await setup(t);
  await run.advance(36);
  assert.equal(run.states.at(-1).stage, "pose");
  run.session.restart();
  await assert.rejects(run.waiting, { code: "CAMERA_ALIGNMENT_TIMEOUT" });
  assert.equal(run.closed, 0);
  let done = false;
  const second = run.session.wait().then(() => {
    done = true;
  });
  await run.advance(2);
  assert.equal(run.states.at(-1).stage, "centering");
  await run.advance(70);
  await second;
  assert.equal(done, true);
  // 모델은 다시 불러오지 않는다.
  assert.deepEqual(run.loads, [1, 1]);
});

const timeout = () =>
  Object.assign(new Error("CAMERA_ALIGNMENT_TIMEOUT"), {
    code: "CAMERA_ALIGNMENT_TIMEOUT",
  });

test("a timed-out recording restarts automatically instead of failing", async () => {
  let calls = 0,
    restarts = 0;
  const notices = [];
  const session = {
    stuck: () => ({ stage: "pose", blocker: "HAND_NOT_DETECTED" }),
    restart: () => restarts++,
  };
  const file = await recordWithRestarts(
    async () => {
      if (++calls < 3) throw timeout();
      return "clip";
    },
    session,
    { onRestart: (stuck, count) => notices.push([stuck.blocker, count]) },
  );
  assert.equal(file, "clip");
  assert.equal(restarts, 2);
  assert.deepEqual(notices, [
    ["HAND_NOT_DETECTED", 1],
    ["HAND_NOT_DETECTED", 2],
  ]);
});

test("auto restarts are capped and other errors are not retried", async () => {
  const session = {
    stuck: () => ({ stage: "head", blocker: "HEAD_NOT_MOVED" }),
    restart() {},
  };
  let calls = 0;
  await assert.rejects(
    recordWithRestarts(
      async () => {
        calls++;
        throw timeout();
      },
      session,
      { maxRestarts: 2 },
    ),
    {
      code: "CAMERA_ALIGNMENT_TIMEOUT",
      stage: "head",
      blocker: "HEAD_NOT_MOVED",
    },
  );
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(
    recordWithRestarts(async () => {
      calls++;
      throw Object.assign(new Error("x"), { code: "CAMERA_INTERRUPTED" });
    }, session),
    { code: "CAMERA_INTERRUPTED" },
  );
  assert.equal(calls, 1);
});
