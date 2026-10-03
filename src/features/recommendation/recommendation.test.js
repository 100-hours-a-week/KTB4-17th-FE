import assert from "node:assert/strict";
import test from "node:test";
import {
  initialRecommendationFeedState,
  recommendationFeedReducer,
} from "./recommendationFeedState.js";

const recommendation = (id) => ({ id });

test("dismissing the last recommendation shows the previous card", () => {
  const state = {
    recommendations: [
      recommendation("A"),
      recommendation("B"),
      recommendation("C"),
    ],
    currentIndex: 2,
    exhausted: false,
  };

  const result = recommendationFeedReducer(state, { type: "dismiss" });

  assert.deepEqual(
    result.recommendations.map(({ id }) => id),
    ["A", "B"],
  );
  assert.equal(result.currentIndex, 1);
  assert.equal(result.recommendations[result.currentIndex].id, "B");
  assert.equal(result.exhausted, false);
});

test("dismissing a middle recommendation shows the next card", () => {
  const state = {
    recommendations: [
      recommendation("A"),
      recommendation("B"),
      recommendation("C"),
    ],
    currentIndex: 1,
    exhausted: false,
  };

  const result = recommendationFeedReducer(state, { type: "dismiss" });

  assert.deepEqual(
    result.recommendations.map(({ id }) => id),
    ["A", "C"],
  );
  assert.equal(result.currentIndex, 1);
  assert.equal(result.recommendations[result.currentIndex].id, "C");
  assert.equal(result.exhausted, false);
});

test("dismissing the only recommendation marks the feed as exhausted", () => {
  const state = {
    recommendations: [recommendation("A")],
    currentIndex: 0,
    exhausted: false,
  };

  const result = recommendationFeedReducer(state, { type: "dismiss" });

  assert.deepEqual(result.recommendations, []);
  assert.equal(result.currentIndex, 0);
  assert.equal(result.exhausted, true);
});

test("replacing recommendations resets the exhausted state and index", () => {
  const result = recommendationFeedReducer(
    { ...initialRecommendationFeedState, exhausted: true },
    { type: "replace", items: [recommendation("A")] },
  );

  assert.equal(result.currentIndex, 0);
  assert.equal(result.exhausted, false);
  assert.equal(result.recommendations[0].id, "A");
});
