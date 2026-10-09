import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
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

test("dismissing a requested member keeps another current card in place", () => {
  const result = recommendationFeedReducer(
    {
      recommendations: [
        recommendation(11),
        recommendation(12),
        recommendation(13),
      ],
      currentIndex: 1,
      exhausted: false,
    },
    { type: "dismiss", memberId: 11 },
  );
  assert.deepEqual(
    result.recommendations.map(({ id }) => id),
    [12, 13],
  );
  assert.equal(result.recommendations[result.currentIndex].id, 12);
});

test("a repeated dismissal of an absent member cannot remove the next card", () => {
  const state = {
    recommendations: [recommendation(12)],
    currentIndex: 0,
    exhausted: false,
  };
  assert.equal(
    recommendationFeedReducer(state, { type: "dismiss", memberId: 11 }),
    state,
  );
});

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

const hookSource = readFileSync(
  new URL("./useRecommendationFeed.js", import.meta.url),
  "utf8",
)
  .replace(/^import[\s\S]*?;\n/gm, "")
  .replace(
    "export function useRecommendationFeed",
    "function useRecommendationFeed",
  );
const createFeedHook = new Function(
  "hooks",
  "apiErrorMessage",
  "recommendationApi",
  "mapRecommendationItem",
  "initialRecommendationFeedState",
  "recommendationFeedReducer",
  "IMAGE_REFRESH_FALLBACK_MS",
  "nextRecommendationImageRefreshAt",
  `const { useCallback, useEffect, useReducer, useRef, useState } = hooks;
  ${hookSource}
  return useRecommendationFeed;`,
);

function feedHarness(api) {
  const slots = [];
  let cursor = 0;
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in slots))
      slots[index] = typeof initial === "function" ? initial() : initial;
    return [
      slots[index],
      (value) => {
        slots[index] =
          typeof value === "function" ? value(slots[index]) : value;
      },
    ];
  };
  const invokeFeed = createFeedHook(
    {
      useCallback: (callback) => callback,
      useEffect: () => {},
      useReducer: (reducer, initial) => {
        const [state, setState] = useState(initial);
        return [
          state,
          (action) => setState((previous) => reducer(previous, action)),
        ];
      },
      useRef: (initial) => useState(() => ({ current: initial }))[0],
      useState,
    },
    apiErrorMessage,
    api,
    mapRecommendationItem,
    initialRecommendationFeedState,
    recommendationFeedReducer,
    IMAGE_REFRESH_FALLBACK_MS,
    nextRecommendationImageRefreshAt,
  );
  return {
    render() {
      cursor = 0;
      return invokeFeed({ enabled: true, isHome: true });
    },
  };
}

const feedPage = (ids, hasNext = false) => ({
  items: ids.map((memberId) => ({ candidate: { memberId } })),
  pageInfo: { hasNext, nextCursor: hasNext ? "next-page" : null },
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}

test("a pass keeps the current card until the server succeeds, then shows the next member", async () => {
  const pending = deferred();
  const requests = [];
  const harness = feedHarness({
    activeBatch: async () => ({ batchId: 1 }),
    recommendationItems: async () => feedPage([11, 12]),
    saveRecommendationPass: (memberId) => {
      requests.push(memberId);
      return pending.promise;
    },
  });
  await harness.render().load();
  const passing = harness.render().pass(11);
  assert.deepEqual(
    harness.render().recommendations.map(({ id }) => id),
    [11, 12],
  );
  pending.resolve({ targetMemberId: 11, permanent: true });
  assert.equal(await passing, true);
  const feed = harness.render();
  assert.deepEqual(requests, [11]);
  assert.deepEqual(
    feed.recommendations.map(({ id }) => id),
    [12],
  );
  assert.equal(feed.recommendations[feed.currentIndex].id, 12);
});

test("failed passes keep the card and can be retried", async () => {
  let requests = 0;
  const failure = Object.assign(new Error("unavailable"), { status: 500 });
  const harness = feedHarness({
    activeBatch: async () => ({ batchId: 1 }),
    recommendationItems: async () => feedPage([11, 12]),
    saveRecommendationPass: async () => {
      requests++;
      if (requests === 1) throw failure;
      return { targetMemberId: 11, permanent: true };
    },
  });
  await harness.render().load();
  await assert.rejects(harness.render().pass(11), (error) => error === failure);
  assert.deepEqual(
    harness.render().recommendations.map(({ id }) => id),
    [11, 12],
  );
  assert.equal(await harness.render().pass(11), true);
  assert.deepEqual(
    harness.render().recommendations.map(({ id }) => id),
    [12],
  );
  assert.equal(requests, 2);
});

test("a pass response removes its requested member after card navigation", async () => {
  const pending = deferred();
  const harness = feedHarness({
    activeBatch: async () => ({ batchId: 1 }),
    recommendationItems: async () => feedPage([11, 12, 13]),
    saveRecommendationPass: () => pending.promise,
  });
  await harness.render().load();
  const passing = harness.render().pass(11);
  harness.render().advance();
  pending.resolve({ targetMemberId: 11, permanent: true });
  await passing;
  const feed = harness.render();
  assert.deepEqual(
    feed.recommendations.map(({ id }) => id),
    [12, 13],
  );
  assert.equal(feed.recommendations[feed.currentIndex].id, 12);
});

test("a stale revalidation cannot bring back a successfully passed member", async () => {
  let reads = 0;
  const pending = deferred();
  const harness = feedHarness({
    activeBatch: async () => ({ batchId: 1 }),
    recommendationItems: () =>
      ++reads === 1 ? feedPage([11, 12]) : pending.promise,
    saveRecommendationPass: async () => ({
      targetMemberId: 11,
      permanent: true,
    }),
  });
  await harness.render().load();
  const revalidating = harness.render().revalidate();
  await Promise.resolve();
  await harness.render().pass(11);
  pending.resolve(feedPage([11, 12]));
  await revalidating;
  assert.deepEqual(
    harness.render().recommendations.map(({ id }) => id),
    [12],
  );
});

test("a page requested before passing cannot append that member again", async () => {
  const pending = deferred();
  const harness = feedHarness({
    activeBatch: async () => ({ batchId: 1 }),
    recommendationItems: (_, cursor) =>
      cursor ? pending.promise : feedPage([11], true),
    saveRecommendationPass: async () => ({
      targetMemberId: 11,
      permanent: true,
    }),
  });
  await harness.render().load();
  const loading = harness.render().loadMore();
  await harness.render().pass(11);
  pending.resolve(feedPage([11, 12]));
  await loading;
  assert.deepEqual(
    harness.render().recommendations.map(({ id }) => id),
    [12],
  );
});

test("passing the final candidate does not create a new recommendation batch", async () => {
  let created = 0;
  const harness = feedHarness({
    activeBatch: async () => ({ batchId: 1 }),
    recommendationItems: async () => feedPage([11]),
    createRecommendationBatch: async () => {
      created++;
    },
    saveRecommendationPass: async () => ({
      targetMemberId: 11,
      permanent: true,
    }),
  });
  await harness.render().load();
  await harness.render().pass(11);
  const feed = harness.render();
  assert.deepEqual(feed.recommendations, []);
  assert.equal(feed.exhausted, true);
  assert.equal(feed.hasNext, false);
  assert.equal(created, 0);
});

test("saving preferences clears the old feed while reading the new batch and resets the card index", async () => {
  let batchId = 1;
  let created = 0;
  const pending = deferred();
  const api = {
    activeBatch: async () => ({ batchId }),
    createRecommendationBatch: async () => {
      created++;
    },
    recommendationItems: async (id) =>
      id === 1 ? feedPage([11, 12]) : pending.promise,
  };
  const harness = feedHarness(api);
  await harness.render().load();
  harness.render().advance();
  assert.equal(harness.render().currentIndex, 1);
  batchId = 2;

  const loading = harness.render().reloadAfterPreferences();
  assert.equal(harness.render().status, "loading");
  assert.deepEqual(harness.render().recommendations, []);
  assert.equal(harness.render().hasNext, false);
  pending.resolve(feedPage([21, 12]));
  await loading;

  const feed = harness.render();
  assert.deepEqual(
    feed.recommendations.map(({ id }) => id),
    [21, 12],
  );
  assert.equal(feed.currentIndex, 0);
  assert.equal(feed.status, "ready");
  assert.equal(created, 0);
});

test("saving preferences with no candidates empties the feed without creating another batch", async () => {
  let batchId = 1;
  let created = 0;
  let itemRequests = 0;
  const harness = feedHarness({
    activeBatch: async () => ({ batchId }),
    createRecommendationBatch: async () => {
      created++;
    },
    recommendationItems: async () => {
      itemRequests++;
      return feedPage([11], true);
    },
  });
  await harness.render().load();
  batchId = null;
  await harness.render().reloadAfterPreferences();

  const feed = harness.render();
  assert.deepEqual(feed.recommendations, []);
  assert.equal(feed.currentIndex, 0);
  assert.equal(feed.hasNext, false);
  assert.equal(feed.status, "ready");
  assert.equal(created, 0);
  assert.equal(itemRequests, 1);
});

test("returning home with no active batch also clears the old feed", async () => {
  let batchId = 1;
  const harness = feedHarness({
    activeBatch: async () => ({ batchId }),
    recommendationItems: async () => feedPage([11], true),
  });
  await harness.render().load();
  batchId = null;

  assert.equal(await harness.render().revalidate(), true);
  assert.deepEqual(harness.render().recommendations, []);
  assert.equal(harness.render().hasNext, false);
});

test("a revalidation started before saving cannot overwrite the new feed", async () => {
  let batchId = 1;
  let itemRequests = 0;
  const pending = deferred();
  const harness = feedHarness({
    activeBatch: async () => ({ batchId }),
    recommendationItems: async (id) => {
      itemRequests++;
      if (id === 2) return feedPage([21]);
      if (itemRequests === 1) return feedPage([11]);
      return pending.promise;
    },
  });
  await harness.render().load();
  const oldRevalidation = harness.render().revalidate();
  await Promise.resolve();
  batchId = 2;
  await harness.render().reloadAfterPreferences();
  pending.resolve(feedPage([11]));

  assert.equal(await oldRevalidation, false);
  assert.deepEqual(
    harness.render().recommendations.map(({ id }) => id),
    [21],
  );
});

test("an old pagination response neither appends old members nor unlocks new pagination", async () => {
  let batchId = 1;
  const oldPage = deferred();
  const newPage = deferred();
  let newPageRequests = 0;
  const harness = feedHarness({
    activeBatch: async () => ({ batchId }),
    recommendationItems: async (id, cursor) => {
      if (!cursor) return feedPage([id === 1 ? 11 : 21], true);
      if (id === 1) return oldPage.promise;
      newPageRequests++;
      return newPage.promise;
    },
  });
  await harness.render().load();
  const oldLoading = harness.render().loadMore();
  batchId = 2;
  await harness.render().reloadAfterPreferences();
  const newLoading = harness.render().loadMore();
  oldPage.resolve(feedPage([12]));
  assert.equal(await oldLoading, false);
  assert.equal(await harness.render().loadMore(), false);
  assert.equal(newPageRequests, 1);
  newPage.resolve(feedPage([22]));
  assert.equal(await newLoading, true);
  assert.deepEqual(
    harness.render().recommendations.map(({ id }) => id),
    [21, 22],
  );
});

test("a failed feed reload keeps saved preferences separate and shows a retryable feed error", async () => {
  const harness = feedHarness({
    activeBatch: async () => {
      throw new Error("offline");
    },
  });
  await harness.render().reloadAfterPreferences();
  assert.equal(harness.render().status, "ready");
  assert.notEqual(harness.render().error, "");
  assert.deepEqual(harness.render().recommendations, []);
});

test("initial loading still creates a batch when one does not exist", async () => {
  let created = 0;
  const harness = feedHarness({
    activeBatch: async () => ({ batchId: null }),
    createRecommendationBatch: async () => {
      created++;
      return { batchId: 3 };
    },
    recommendationItems: async () => feedPage([31]),
  });
  await harness.render().load();
  assert.equal(created, 1);
  assert.deepEqual(
    harness.render().recommendations.map(({ id }) => id),
    [31],
  );
});

test("an old initial batch lookup cannot create a redundant batch after saving", async () => {
  const pending = deferred();
  let batchRequests = 0;
  let created = 0;
  const harness = feedHarness({
    activeBatch: async () => {
      batchRequests++;
      return batchRequests === 1 ? pending.promise : { batchId: 2 };
    },
    createRecommendationBatch: async () => {
      created++;
      return { batchId: 3 };
    },
    recommendationItems: async () => feedPage([21]),
  });
  const oldLoad = harness.render().load();
  await harness.render().reloadAfterPreferences();
  pending.resolve({ batchId: null });
  await oldLoad;
  assert.equal(created, 0);
  assert.deepEqual(
    harness.render().recommendations.map(({ id }) => id),
    [21],
  );
});
