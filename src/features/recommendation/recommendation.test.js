import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { watchIdleSwipeGuide } from "./idleSwipeGuide.js";
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

function swipeGuideHarness(t, visibilityState = "visible") {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const page = new EventTarget();
  page.visibilityState = visibilityState;
  const consumed = { current: false };
  const updates = [];
  const stop = watchIdleSwipeGuide({
    page,
    consumed,
    onVisible: (visible) => updates.push(visible),
  });
  t.after(stop);
  return {
    page,
    consumed,
    updates,
    stop,
    tick: (ms) => t.mock.timers.tick(ms),
    event: (name) => page.dispatchEvent(new Event(name)),
  };
}

test("swipe guide waits for 1.6 seconds of inactivity and disappears after 2.8 seconds without repeating", (t) => {
  const guide = swipeGuideHarness(t);
  guide.tick(1599);
  assert.deepEqual(guide.updates, [false]);
  guide.event("pointermove");
  guide.tick(1599);
  assert.equal(guide.updates.at(-1), false);
  guide.tick(1);
  assert.equal(guide.updates.at(-1), true);
  guide.tick(2799);
  assert.equal(guide.updates.at(-1), true);
  guide.tick(1);
  assert.equal(guide.updates.at(-1), false);
  assert.equal(guide.consumed.current, true);
  guide.event("pointermove");
  guide.tick(10000);
  assert.equal(guide.updates.filter(Boolean).length, 1);
});

test("a held touch prevents the guide, and touching the visible guide dismisses it immediately", (t) => {
  const guide = swipeGuideHarness(t);
  guide.event("pointerdown");
  guide.tick(5000);
  assert.equal(guide.updates.includes(true), false);
  guide.event("pointerup");
  guide.tick(1600);
  assert.equal(guide.updates.at(-1), true);
  guide.event("pointerdown");
  assert.equal(guide.updates.at(-1), false);
  guide.event("pointerup");
  guide.tick(5000);
  assert.equal(guide.updates.filter(Boolean).length, 1);
});

test("the guide remains hidden in background tabs and starts a fresh idle interval when returning", (t) => {
  const guide = swipeGuideHarness(t, "hidden");
  guide.tick(5000);
  assert.equal(guide.updates.includes(true), false);
  guide.page.visibilityState = "visible";
  guide.event("visibilitychange");
  guide.tick(1599);
  assert.equal(guide.updates.at(-1), false);
  guide.tick(1);
  assert.equal(guide.updates.at(-1), true);
  guide.page.visibilityState = "hidden";
  guide.event("visibilitychange");
  assert.equal(guide.updates.at(-1), false);
});

test("navigating before the hint appears suppresses it, and cleanup removes pending timers and listeners", (t) => {
  const guide = swipeGuideHarness(t);
  guide.consumed.current = true;
  guide.tick(1600);
  assert.equal(guide.updates.includes(true), false);
  guide.consumed.current = false;
  guide.event("wheel");
  guide.stop();
  const count = guide.updates.length;
  guide.event("pointerup");
  guide.tick(10000);
  assert.equal(guide.updates.length, count);
});

test("dismissing a requested user keeps another current card in place", () => {
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
    { type: "dismiss", userId: 11 },
  );
  assert.deepEqual(
    result.recommendations.map(({ id }) => id),
    [12, 13],
  );
  assert.equal(result.recommendations[result.currentIndex].id, 12);
});

test("a repeated dismissal of an absent user cannot remove the next card", () => {
  const state = {
    recommendations: [recommendation(12)],
    currentIndex: 0,
    exhausted: false,
  };
  assert.equal(
    recommendationFeedReducer(state, { type: "dismiss", userId: 11 }),
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

test("revalidating recommendations keeps the current user", () => {
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

test("revalidating without the current user uses the closest valid index", () => {
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
        userId: 21,
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
  // This test harness intentionally provides hook implementations outside React.
  const stateSlot = (initial) => {
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
        const [state, setState] = stateSlot(initial);
        return [
          state,
          (action) => setState((previous) => reducer(previous, action)),
        ];
      },
      useRef: (initial) => stateSlot(() => ({ current: initial }))[0],
      useState: stateSlot,
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
  items: ids.map((userId) => ({ candidate: { userId } })),
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

test("a pass keeps the current card until the server succeeds, then shows the next user", async () => {
  const pending = deferred();
  const requests = [];
  const harness = feedHarness({
    activeBatch: async () => ({ batchId: 1 }),
    recommendationItems: async () => feedPage([11, 12]),
    saveRecommendationPass: (userId) => {
      requests.push(userId);
      return pending.promise;
    },
  });
  await harness.render().load();
  const passing = harness.render().pass(11);
  assert.deepEqual(
    harness.render().recommendations.map(({ id }) => id),
    [11, 12],
  );
  pending.resolve({ targetUserId: 11, permanent: true });
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
      return { targetUserId: 11, permanent: true };
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

test("a pass response removes its requested user after card navigation", async () => {
  const pending = deferred();
  const harness = feedHarness({
    activeBatch: async () => ({ batchId: 1 }),
    recommendationItems: async () => feedPage([11, 12, 13]),
    saveRecommendationPass: () => pending.promise,
  });
  await harness.render().load();
  const passing = harness.render().pass(11);
  harness.render().advance();
  pending.resolve({ targetUserId: 11, permanent: true });
  await passing;
  const feed = harness.render();
  assert.deepEqual(
    feed.recommendations.map(({ id }) => id),
    [12, 13],
  );
  assert.equal(feed.recommendations[feed.currentIndex].id, 12);
});

test("a stale revalidation cannot bring back a successfully passed user", async () => {
  let reads = 0;
  const pending = deferred();
  const harness = feedHarness({
    activeBatch: async () => ({ batchId: 1 }),
    recommendationItems: () =>
      ++reads === 1 ? feedPage([11, 12]) : pending.promise,
    saveRecommendationPass: async () => ({
      targetUserId: 11,
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

test("a page requested before passing cannot append that user again", async () => {
  const pending = deferred();
  const harness = feedHarness({
    activeBatch: async () => ({ batchId: 1 }),
    recommendationItems: (_, cursor) =>
      cursor ? pending.promise : feedPage([11], true),
    saveRecommendationPass: async () => ({
      targetUserId: 11,
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
      targetUserId: 11,
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

test("an old pagination response neither appends old users nor unlocks new pagination", async () => {
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
  const duplicateNewLoading = harness.render().loadMore();
  assert.equal(duplicateNewLoading, newLoading);
  assert.equal(newPageRequests, 1);
  newPage.resolve(feedPage([22]));
  assert.equal(await newLoading, true);
  assert.equal(await duplicateNewLoading, true);
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

test("a regenerated batch reuses another eligible user when every candidate was already shown", async () => {
  const harness = feedHarness({
    activeBatch: async () => ({ batchId: 1 }),
    createRecommendationBatch: async () => ({ batchId: 2 }),
    recommendationItems: async () => feedPage([11, 12]),
  });
  await harness.render().load();
  harness.render().advance();

  assert.equal(await harness.render().prepareNextBatch(), true);
  assert.equal(harness.render().nextBatchReady, true);
  assert.equal(harness.render().activatePreparedBatch(), true);

  const feed = harness.render();
  assert.deepEqual(
    feed.recommendations.map(({ id }) => id),
    [11],
  );
  assert.equal(feed.recommendations[feed.currentIndex].id, 11);
  assert.equal(feed.exhausted, false);
});

test("an empty regenerated batch cycles through previously loaded eligible users", async () => {
  const harness = feedHarness({
    activeBatch: async () => ({ batchId: 1 }),
    createRecommendationBatch: async () => null,
    recommendationItems: async () => feedPage([11, 12]),
  });
  await harness.render().load();
  harness.render().advance();

  assert.equal(await harness.render().prepareNextBatch(), true);
  assert.equal(harness.render().activatePreparedBatch(), true);
  assert.deepEqual(
    harness.render().recommendations.map(({ id }) => id),
    [11],
  );

  assert.equal(await harness.render().prepareNextBatch(), true);
  assert.equal(harness.render().activatePreparedBatch(), true);
  assert.deepEqual(
    harness.render().recommendations.map(({ id }) => id),
    [12],
  );
});

test("an empty regenerated batch remains exhausted when no alternate eligible user exists", async () => {
  const harness = feedHarness({
    activeBatch: async () => ({ batchId: 1 }),
    createRecommendationBatch: async () => null,
    recommendationItems: async () => feedPage([11]),
  });
  await harness.render().load();

  assert.equal(await harness.render().prepareNextBatch(), true);
  assert.equal(harness.render().activatePreparedBatch(), true);

  const feed = harness.render();
  assert.deepEqual(feed.recommendations, []);
  assert.equal(feed.exhausted, true);
});

test("a regenerated batch searches later pages for unseen candidates before cycling", async () => {
  const requests = [];
  const harness = feedHarness({
    activeBatch: async () => ({ batchId: 1 }),
    createRecommendationBatch: async () => ({ batchId: 2 }),
    recommendationItems: async (batchId, cursor) => {
      requests.push([batchId, cursor ?? null]);
      if (batchId === 1) return feedPage([11]);
      return cursor
        ? feedPage([12])
        : {
            items: [{ candidate: { userId: 11 } }],
            pageInfo: { hasNext: true, nextCursor: "next-page" },
          };
    },
  });
  await harness.render().load();

  assert.equal(await harness.render().prepareNextBatch(), true);
  harness.render().activatePreparedBatch();

  const feed = harness.render();
  assert.deepEqual(
    feed.recommendations.map(({ id }) => id),
    [12],
  );
  assert.deepEqual(requests, [
    [1, null],
    [2, null],
    [2, "next-page"],
  ]);
});

test("a failed final pagination page still falls through to a regenerated batch", async () => {
  const createdBatchIds = [];
  const harness = feedHarness({
    activeBatch: async () => ({ batchId: 1 }),
    createRecommendationBatch: async () => {
      createdBatchIds.push(2);
      return { batchId: 2 };
    },
    recommendationItems: async (batchId, cursor) => {
      if (batchId === 2) return feedPage([12]);
      return cursor ? feedPage([], true) : feedPage([11], true);
    },
  });
  await harness.render().load();
  assert.equal(await harness.render().loadMore(), false);

  assert.equal(await harness.render().prepareNextBatch(), true);
  assert.equal(harness.render().activatePreparedBatch(), true);
  const feed = harness.render();

  assert.deepEqual(createdBatchIds, [2]);
  assert.deepEqual(
    feed.recommendations.map(({ id }) => id),
    [12],
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
