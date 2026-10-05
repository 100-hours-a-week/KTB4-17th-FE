import assert from "node:assert/strict";
import test from "node:test";
import { mapRecommendationItem } from "./mapRecommendationItem.js";
import {
  initialRecommendationFeedState,
  recommendationFeedReducer,
} from "./recommendationFeedState.js";
import {
  IMAGE_REFRESH_FALLBACK_MS,
  isHomePath,
  nextRecommendationImageRefreshAt,
} from "./recommendationRefresh.js";
import { wheelNavigationIntent } from "./wheelNavigation.js";

const recommendation = (id) => ({ id });

test("wheel down advances and wheel up returns to the previous card", () => {
  assert.equal(wheelNavigationIntent(120), "next");
  assert.equal(wheelNavigationIntent(-120), "previous");
  assert.equal(wheelNavigationIntent(0), null);
});

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

test("revalidating recommendations keeps the current member", () => {
  const result = recommendationFeedReducer(
    {
      recommendations: [
        recommendation("A"),
        recommendation("B"),
        recommendation("C"),
      ],
      currentIndex: 2,
      exhausted: false,
    },
    {
      type: "revalidate",
      items: [recommendation("C"), recommendation("B"), recommendation("A")],
    },
  );

  assert.equal(result.currentIndex, 0);
  assert.equal(result.recommendations[result.currentIndex].id, "C");
});

test("revalidating without the current member uses the closest valid index", () => {
  const result = recommendationFeedReducer(
    {
      recommendations: [
        recommendation("A"),
        recommendation("B"),
        recommendation("C"),
      ],
      currentIndex: 2,
      exhausted: false,
    },
    {
      type: "revalidate",
      items: [recommendation("A"), recommendation("B")],
    },
  );

  assert.equal(result.currentIndex, 1);
  assert.equal(result.recommendations[result.currentIndex].id, "B");
});

test("recommendation images retain their expiry metadata", () => {
  const receivedAt = Date.parse("2026-10-05T12:00:00Z");
  const recommendation = mapRecommendationItem(
    {
      candidate: {
        memberId: 21,
        images: [
          {
            fileId: 701,
            displayOrder: 1,
            imageUrl: "https://example.com/701",
            expiresAt: "2026-10-05T12:05:00Z",
          },
        ],
      },
    },
    receivedAt,
  );

  assert.deepEqual(recommendation.images, [
    {
      fileId: 701,
      displayOrder: 1,
      imageUrl: "https://example.com/701",
      expiresAt: "2026-10-05T12:05:00Z",
      receivedAt,
    },
  ]);
  assert.deepEqual(recommendation.photos, ["https://example.com/701"]);
});

test("image refresh is scheduled thirty seconds before expiry", () => {
  const receivedAt = Date.parse("2026-10-05T12:00:00Z");
  const refreshAt = nextRecommendationImageRefreshAt([
    {
      images: [
        {
          imageUrl: "https://example.com/701",
          expiresAt: "2026-10-05T12:05:00Z",
          receivedAt,
        },
      ],
    },
  ]);

  assert.equal(refreshAt, Date.parse("2026-10-05T12:04:30Z"));
});

test("invalid expiry metadata uses the four minute fallback", () => {
  const receivedAt = Date.parse("2026-10-05T12:00:00Z");
  const refreshAt = nextRecommendationImageRefreshAt([
    {
      images: [
        {
          imageUrl: "https://example.com/701",
          expiresAt: "invalid",
          receivedAt,
        },
      ],
    },
  ]);

  assert.equal(refreshAt, receivedAt + IMAGE_REFRESH_FALLBACK_MS);
});

test("home routes are identified consistently", () => {
  assert.equal(isHomePath("/"), true);
  assert.equal(isHomePath("/home"), true);
  assert.equal(isHomePath("/likes"), false);
  assert.equal(isHomePath("/profiles/21"), false);
});
