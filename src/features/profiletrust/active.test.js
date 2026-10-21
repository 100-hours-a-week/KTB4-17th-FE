import assert from "node:assert/strict";
import test from "node:test";
import {
  centerProgress,
  facePosition,
  waitForCenteredFace,
} from "./centering.js";
import {
  challengeInstruction,
  HAND_NAMES,
  HEAD_NAMES,
  headGuideStep,
  parseChallenge,
  recordingHint,
} from "./challenge.js";

const neutral = () => ({
  faceLandmarks: [
    [
      { x: 0.35, y: 0.23 },
      { x: 0.65, y: 0.73 },
    ],
  ],
  facialTransformationMatrixes: [
    { data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -45, 1] },
  ],
});

test("all 120 challenge combinations preserve hand, up/down/sideways and head direction", () => {
  let count = 0;
  for (const hand of Object.keys(HAND_NAMES)) {
    for (const direction of ["UP", "DOWN", "SIDEWAYS"]) {
      for (const head of Object.keys(HEAD_NAMES)) {
        const challenge = parseChallenge([
          "LOOK_STRAIGHT",
          hand,
          `HAND_${direction}`,
          head,
        ]);
        assert.equal(challenge.hand, hand);
        assert.equal(challenge.direction, direction);
        assert.equal(challenge.head, head);
        assert.ok(
          challengeInstruction(challenge).includes(
            direction === "UP"
              ? "위를"
              : direction === "DOWN"
                ? "아래를"
                : "가로(왼쪽 또는 오른쪽)를",
          ),
        );
        count++;
      }
    }
  }
  assert.equal(count, 120);
});

test("invalid challenges are rejected rather than becoming a fixed pose", () => {
  for (const codes of [
    null,
    [],
    ["LOOK_UP"],
    ["LOOK_STRAIGHT", "HAND_TWO", "HAND_UNKNOWN", "LOOK_UP"],
    ["LOOK_STRAIGHT", "__proto__", "HAND_UP", "LOOK_UP"],
  ]) {
    assert.throws(() => parseChallenge(codes), {
      code: "VERIFICATION_RESPONSE_INVALID",
    });
  }
  assert.equal(parseChallenge(["LOOK_STRAIGHT"]).legacy, true);
});

test("centering requires one face, suitable distance, location and frontal pose", () => {
  assert.equal(facePosition(neutral()).issue, null);
  assert.equal(facePosition({}).issue, "NO_FACE");
  const multiple = neutral();
  multiple.faceLandmarks.push(multiple.faceLandmarks[0]);
  assert.equal(facePosition(multiple).issue, "MULTIPLE_FACES");
  const shifted = neutral();
  shifted.faceLandmarks[0].forEach((point) => {
    point.x -= 0.2;
  });
  assert.equal(facePosition(shifted).issue, "LEFT");
  const up = neutral();
  up.facialTransformationMatrixes[0].data[5] = Math.cos(Math.PI / 6);
  up.facialTransformationMatrixes[0].data[6] = -Math.sin(Math.PI / 6);
  up.facialTransformationMatrixes[0].data[10] = Math.cos(Math.PI / 6);
  assert.equal(facePosition(up).issue, "FRONTAL");
  assert.ok(facePosition(up).pitch < -20);
  const bad = neutral();
  bad.facialTransformationMatrixes[0].data.fill(0);
  assert.equal(facePosition(bad).issue, "INVALID_POSE");
});

test("fifteen stable frames are required and loss of face resets readiness", () => {
  let state = { history: [] };
  for (let index = 0; index < 15; index++) {
    state = centerProgress(state.history, neutral());
    assert.equal(state.ready, index === 14);
  }
  state = centerProgress(state.history, {});
  assert.equal(state.ready, false);
  assert.equal(state.history.length, 0);
});

test("a small offset from the center can complete camera preparation", () => {
  let state = { history: [] };
  for (let index = 0; index < 15; index++) {
    const frame = neutral();
    frame.faceLandmarks[0].forEach((point) => {
      point.x += 0.11;
      point.y += 0.12;
    });
    assert.equal(facePosition(frame).issue, null);
    state = centerProgress(state.history, frame);
  }
  assert.equal(state.ready, true);
});

test("small natural position jitter does not restart camera preparation", () => {
  let state = { history: [] };
  for (let index = 0; index < 15; index++) {
    const frame = neutral();
    frame.faceLandmarks[0].forEach((point) => {
      point.x += index % 2 ? -0.018 : 0.018;
      point.y += index % 2 ? 0.018 : -0.018;
    });
    state = centerProgress(state.history, frame);
  }
  assert.equal(state.ready, true);
});

test("moving inside the guide still cannot confirm a center", () => {
  let state = { history: [] };
  for (let index = 0; index < 15; index++) {
    const frame = neutral();
    frame.faceLandmarks[0].forEach((point) => {
      point.x += index % 2 ? -0.055 : 0.055;
    });
    state = centerProgress(state.history, frame);
  }
  assert.equal(state.ready, false);
});

test("the camera waits for explicit confirmation and releases the local model", async () => {
  const signal = new AbortController().signal;
  let confirm,
    frames = 0,
    closed = 0;
  const waiting = waitForCenteredFace(
    { readyState: 2 },
    {
      signal,
      setConfirm: (next) => {
        confirm = next;
      },
      create: async () => ({
        detectForVideo: () => {
          frames++;
          return neutral();
        },
        close: () => {
          closed++;
        },
      }),
      onState: (state) => {
        if (state.ready) queueMicrotask(() => confirm());
      },
    },
  );
  await waiting;
  assert.equal(frames, 15);
  assert.equal(closed, 1);
  assert.equal(confirm, null);
});

test("cancelled model loading cannot leave a camera-analysis model alive", async () => {
  const controller = new AbortController();
  let resolveModel,
    closed = 0;
  const waiting = waitForCenteredFace(
    { readyState: 2 },
    {
      signal: controller.signal,
      onState: () => {},
      setConfirm: () => {},
      create: () =>
        new Promise((resolve) => {
          resolveModel = resolve;
        }),
    },
  );
  await Promise.resolve();
  controller.abort();
  await assert.rejects(waiting, { name: "AbortError" });
  resolveModel({
    close: () => {
      closed++;
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(closed, 1);
});

test("recording guidance starts neutral, moves once and returns neutral", () => {
  const target = parseChallenge([
    "LOOK_STRAIGHT",
    "HAND_TWO",
    "HAND_DOWN",
    "LOOK_UP",
  ]);
  assert.ok(recordingHint(target, 0).includes("먼저"));
  assert.ok(recordingHint(target, 0.5).includes("위로"));
  assert.ok(recordingHint(target, 0.9).includes("다시 정면"));
});

test("head guide and spoken instructions change together at recording boundaries", () => {
  const challenge = parseChallenge([
    "LOOK_STRAIGHT",
    "HAND_TWO",
    "HAND_UP",
    "TURN_LEFT",
  ]);
  assert.equal(headGuideStep("pose", 1), 0);
  for (const progress of [0, 0.179]) {
    assert.equal(headGuideStep("recording", progress), 0);
    assert.ok(recordingHint(challenge, progress).includes("먼저"));
  }
  for (const progress of [0.18, 0.719]) {
    assert.equal(headGuideStep("recording", progress), 1);
    assert.ok(recordingHint(challenge, progress).includes("본인 기준 왼쪽"));
  }
  for (const progress of [0.72, 1]) {
    assert.equal(headGuideStep("recording", progress), 2);
    assert.ok(recordingHint(challenge, progress).includes("다시 정면"));
  }
});
