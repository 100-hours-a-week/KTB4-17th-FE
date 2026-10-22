import assert from "node:assert/strict";
import test from "node:test";
import { challengeInstruction, parseChallenge } from "./challenge.js";
import { poseFixtures as fixtures } from "./poseHold.fixtures.js";
import { matchesPose, poseHoldProgress } from "./poseHold.js";

test("basic pose has no head task and preserves shape/direction checks", () => {
  const target = parseChallenge(["LOOK_STRAIGHT", "HAND_TWO", "HAND_UP"]);
  assert.equal(target.head, null);
  assert.match(challengeInstruction(target), /3초/);
  assert.equal(matchesPose(fixtures.v, target, 640, 480), true);
  assert.equal(matchesPose(fixtures.fist, target, 640, 480), false);
  const down = fixtures.v.map((p) => ({ ...p, y: 1 - p.y }));
  assert.equal(matchesPose(down, target, 640, 480), false);
  assert.equal(
    matchesPose(down, { ...target, direction: "DOWN" }, 640, 480),
    true,
  );
});

test("pose hold requires continuous distinct frames and resets on mismatch or gap", () => {
  let hold = { since: null, last: null };
  for (let i = 0; i <= 34; i++) hold = poseHoldProgress(hold, true, i / 10);
  assert.equal(hold.done, true);
  hold = poseHoldProgress(hold, false, 3.5);
  assert.equal(hold.paused, true);
  hold = poseHoldProgress(hold, true, 3.6);
  hold = poseHoldProgress(hold, true, 3.6);
  assert.equal(hold.progress, 1);
  hold = poseHoldProgress(hold, true, 5);
  assert.equal(hold.progress, 0);
});
