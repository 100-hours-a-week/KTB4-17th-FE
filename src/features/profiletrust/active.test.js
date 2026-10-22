import assert from "node:assert/strict";
import test from "node:test";
import {
  centerHoldProgress,
  centerProgress,
  facePosition,
  headTurnProgress,
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

test("all 60 challenge combinations preserve hand, up/down/sideways and vertical head direction", () => {
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
        if (
          ["HAND_FIST", "HAND_LOVE_YOU", "HAND_CALL_ME"].includes(hand) ||
          direction === "DOWN"
        ) {
          assert.match(challengeInstruction(challenge), /방향에 상관없이/);
          count++;
          continue;
        }
        assert.ok(
          challengeInstruction(challenge).includes(
            direction === "UP" ? "위를" : "가로(왼쪽 또는 오른쪽)를",
          ),
        );
        count++;
      }
    }
  }
  assert.equal(count, 60);
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
  shifted.faceLandmarks[0] = [
    { x: 0.0, y: 0.23 },
    { x: 0.15, y: 0.73 },
  ];
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

test("a photo-approved pose stays frontal during camera verification", () => {
  const frame = neutral();
  const radians = (18 * Math.PI) / 180;
  frame.facialTransformationMatrixes[0].data[5] = Math.cos(radians);
  frame.facialTransformationMatrixes[0].data[6] = Math.sin(radians);
  frame.facialTransformationMatrixes[0].data[9] = -Math.sin(radians);
  frame.facialTransformationMatrixes[0].data[10] = Math.cos(radians);
  let hold = { history: [], since: null };
  for (let index = 0; index <= 20; index++) {
    hold = centerHoldProgress(hold, frame, index * 100);
  }
  assert.equal(hold.done, true);
});

test("guide overlap tolerates offsets and size changes until over half is outside", () => {
  for (const [left, top, right, bottom, expected] of [
    [0.47, 0.23, 0.77, 0.73, null],
    [0.23, 0.23, 0.53, 0.73, null],
    [0.35, 0.35, 0.65, 0.85, null],
    [0.35, 0.03, 0.65, 0.53, null],
    [0.23, 0.05, 0.77, 0.95, null],
    [0.54, 0.23, 0.84, 0.73, null],
    [0.16, 0.23, 0.46, 0.73, null],
    [0.35, 0.55, 0.65, 1, null],
    [0.35, 0.6, 0.65, 1, null],
    [0.85, 0.23, 1.0, 0.73, "RIGHT"],
    [0.0, 0.23, 0.15, 0.73, "LEFT"],
    [0.35, 0.89, 0.65, 1, "UP"],
    [0.85, 0.55, 1.0, 1, "RIGHT"],
  ]) {
    const frame = neutral();
    frame.faceLandmarks[0] = [
      { x: left, y: top },
      { x: right, y: bottom },
    ];
    assert.equal(
      facePosition(frame).issue,
      expected,
      `${left},${top},${right},${bottom}`,
    );
  }
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

test("the camera advances automatically after two seconds and releases the local model", async () => {
  const signal = new AbortController().signal;
  let frames = 0,
    closed = 0,
    lastProgress = 0;
  const started = performance.now();
  const waiting = waitForCenteredFace(
    { readyState: 2 },
    {
      signal,
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
        lastProgress = state.progress;
      },
    },
  );
  await waiting;
  assert.ok(performance.now() - started >= 2000);
  assert.ok(frames >= 15);
  assert.equal(closed, 1);
  assert.equal(lastProgress, 1);
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

test("recording guidance starts neutral, moves once and completes without return", () => {
  const target = parseChallenge([
    "LOOK_STRAIGHT",
    "HAND_TWO",
    "HAND_DOWN",
    "LOOK_UP",
  ]);
  assert.ok(recordingHint(target, 0).includes("먼저"));
  assert.ok(recordingHint(target, 0.5).includes("위로"));
  assert.ok(recordingHint(target, 0.9).includes("확인됐어요"));
});

test("head guide and spoken instructions change together at recording boundaries", () => {
  const challenge = parseChallenge([
    "LOOK_STRAIGHT",
    "HAND_TWO",
    "HAND_UP",
    "LOOK_DOWN",
  ]);
  assert.equal(headGuideStep("pose", 1), 0);
  for (const progress of [0, 0.179]) {
    assert.equal(headGuideStep("recording", progress), 0);
    assert.ok(recordingHint(challenge, progress).includes("먼저"));
  }
  for (const progress of [0.18, 0.719]) {
    assert.equal(headGuideStep("recording", progress), 1);
    assert.ok(recordingHint(challenge, progress).includes("아래로"));
  }
  for (const progress of [0.72, 1]) {
    assert.equal(headGuideStep("recording", progress), 2);
    assert.ok(recordingHint(challenge, progress).includes("확인됐어요"));
  }
});

test("two-second hold resets when the face is lost or no longer frontal", () => {
  let state = { history: [], since: null };
  for (let time = 0; time <= 1900; time += 100)
    state = centerHoldProgress(state, neutral(), time);
  assert.equal(state.done, false);
  state = centerHoldProgress(state, {}, 3000);
  assert.equal(state.progress, 0);
  assert.equal(state.since, null);
  for (let time = 4100; time <= 6000; time += 100)
    state = centerHoldProgress(state, neutral(), time);
  assert.equal(state.done, false);
  state = centerHoldProgress(state, neutral(), 6100);
  assert.equal(state.done, true);
  const turned = neutral();
  turned.facialTransformationMatrixes[0].data[2] = Math.sin(Math.PI / 4);
  state = centerHoldProgress(state, turned, 6200);
  assert.equal(state.done, false);
  assert.equal(state.progress, 0);
});

test("unstable movement resets the automatic hold even within the guide", () => {
  let state = { history: [], since: null };
  for (let time = 0; time <= 3000; time += 100) {
    const frame = neutral();
    frame.faceLandmarks[0].forEach((p) => {
      p.x += time % 200 ? -0.055 : 0.055;
    });
    state = centerHoldProgress(state, frame, time);
  }
  assert.equal(state.done, false);
  assert.equal(state.progress, 0);
});

test("real-time head turn recognition tracks baseline, 12-degree turn and return to center", () => {
  const challenge = parseChallenge([
    "LOOK_STRAIGHT",
    "HAND_TWO",
    "HAND_UP",
    "LOOK_DOWN",
  ]);
  let state = {};
  for (let index = 0; index < 3; index++) {
    state = headTurnProgress(state, neutral(), "LOOK_DOWN");
  }
  assert.equal(state.step, 1);
  assert.equal(state.completedTurn, false);
  const partialDown = neutral();
  const rad8 = (8 * Math.PI) / 180;
  partialDown.facialTransformationMatrixes[0].data[6] = Math.sin(rad8);
  partialDown.facialTransformationMatrixes[0].data[10] = Math.cos(rad8);
  state = headTurnProgress(state, partialDown, "LOOK_DOWN");
  assert.equal(state.completedTurn, false);
  assert.equal(state.delta, 8);
  assert.match(
    recordingHint(challenge, 0.3, {
      headStep: state.step,
      headDelta: state.delta,
      headCompleted: state.completedTurn,
      headReturned: state.returned,
    }),
    /8° \/ 12°/,
  );
  const fullDown = neutral();
  const rad15 = (15 * Math.PI) / 180;
  fullDown.facialTransformationMatrixes[0].data[6] = Math.sin(rad15);
  fullDown.facialTransformationMatrixes[0].data[10] = Math.cos(rad15);
  state = headTurnProgress(state, fullDown, "LOOK_DOWN");
  state = headTurnProgress(state, fullDown, "LOOK_DOWN");
  assert.equal(state.completedTurn, true);
  assert.equal(state.returned, true);
  assert.equal(state.step, 2);
  assert.equal(
    headGuideStep("recording", 0.35, {
      headStep: state.step,
      headCompleted: state.completedTurn,
    }),
    2,
  );
  assert.match(
    recordingHint(challenge, 0.35, {
      headStep: state.step,
      headCompleted: state.completedTurn,
      headReturned: state.returned,
    }),
    /고개 동작이 확인됐어요/,
  );
  assert.match(
    recordingHint(challenge, 0.6, {
      handMatched: true,
      headStep: state.step,
      headCompleted: state.completedTurn,
      headReturned: state.returned,
    }),
    /모두 확인됐어요/,
  );
});
