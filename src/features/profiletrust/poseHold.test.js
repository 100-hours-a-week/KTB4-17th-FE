import assert from "node:assert/strict";
import test from "node:test";
import { challengeInstruction, parseChallenge } from "./challenge.js";
import { matchesPose, poseHoldProgress } from "./poseHold.js";

const fixtures = {
  v: [
    { x: 0.5, y: 0.75, z: 0.0 },
    { x: 0.53125, y: 0.7083333333333334, z: 0.0 },
    { x: 0.5075745497370575, y: 0.6578257061057228, z: -0.014205270157765463 },
    { x: 0.48784500785127216, y: 0.6157360167493806, z: -0.026042995289236683 },
    { x: 0.4720613743426439, y: 0.582064265264307, z: -0.035513175394413656 },
    { x: 0.546875, y: 0.5625, z: 0.0 },
    { x: 0.546875, y: 0.4791666666666667, z: 0.0 },
    { x: 0.546875, y: 0.4270833333333333, z: 0.0 },
    { x: 0.546875, y: 0.3854166666666667, z: 0.0 },
    { x: 0.515625, y: 0.5520833333333334, z: 0.0 },
    { x: 0.515625, y: 0.46875, z: 0.0 },
    { x: 0.515625, y: 0.4166666666666667, z: 0.0 },
    { x: 0.515625, y: 0.375, z: 0.0 },
    { x: 0.484375, y: 0.5625, z: 0.0 },
    { x: 0.484375, y: 0.5339983213895275, z: -0.05873078879911927 },
    { x: 0.484375, y: 0.5852903918589135, z: -0.06551392073923373 },
    { x: 0.484375, y: 0.6120732089291859, z: -0.041575031891765674 },
    { x: 0.45625, y: 0.5833333333333334, z: 0.0 },
    { x: 0.45625, y: 0.5605319904449554, z: -0.04698463103929541 },
    { x: 0.45625, y: 0.6015656468204641, z: -0.052411136591386985 },
    { x: 0.45625, y: 0.6229919004766821, z: -0.03326002551341254 },
  ],
  fist: [
    { x: 0.5, y: 0.75, z: 0.0 },
    { x: 0.53125, y: 0.7083333333333334, z: 0.0 },
    { x: 0.5075745497370575, y: 0.6578257061057228, z: -0.014205270157765463 },
    { x: 0.48784500785127216, y: 0.6157360167493806, z: -0.026042995289236683 },
    { x: 0.4720613743426439, y: 0.582064265264307, z: -0.035513175394413656 },
    { x: 0.546875, y: 0.5625, z: 0.0 },
    { x: 0.546875, y: 0.5339983213895275, z: -0.05873078879911927 },
    { x: 0.546875, y: 0.5852903918589135, z: -0.06551392073923373 },
    { x: 0.546875, y: 0.6120732089291859, z: -0.041575031891765674 },
    { x: 0.515625, y: 0.5520833333333334, z: 0.0 },
    { x: 0.515625, y: 0.5235816547228609, z: -0.05873078879911927 },
    { x: 0.515625, y: 0.5748737251922468, z: -0.06551392073923373 },
    { x: 0.515625, y: 0.6016565422625193, z: -0.041575031891765674 },
    { x: 0.484375, y: 0.5625, z: 0.0 },
    { x: 0.484375, y: 0.5339983213895275, z: -0.05873078879911927 },
    { x: 0.484375, y: 0.5852903918589135, z: -0.06551392073923373 },
    { x: 0.484375, y: 0.6120732089291859, z: -0.041575031891765674 },
    { x: 0.45625, y: 0.5833333333333334, z: 0.0 },
    { x: 0.45625, y: 0.5605319904449554, z: -0.04698463103929541 },
    { x: 0.45625, y: 0.6015656468204641, z: -0.052411136591386985 },
    { x: 0.45625, y: 0.6229919004766821, z: -0.03326002551341254 },
  ],
};

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
  for (let i = 0; i <= 32; i++) hold = poseHoldProgress(hold, true, i / 10);
  assert.equal(hold.done, true);
  hold = poseHoldProgress(hold, false, 3.3);
  assert.equal(hold.progress, 0);
  hold = poseHoldProgress(hold, true, 3.4);
  hold = poseHoldProgress(hold, true, 3.4);
  assert.equal(hold.done, false);
  assert.equal(hold.since, null);
  hold = poseHoldProgress(hold, true, 5);
  assert.equal(hold.progress, 0);
});
