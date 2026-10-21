import assert from "node:assert/strict";
import { test } from "node:test";
import { setAccessToken } from "../../shared/api/authToken.js";
import * as api from "./api.js";
import {
  isCurrentChatNotification,
  mergeNotifications,
  notificationBadge,
  notificationCopy,
  notificationDay,
  notificationDestination,
  notificationTime,
} from "./model.js";
import { createNotificationPoller } from "./polling.js";
import { connectNotificationStream, createSseParser } from "./stream.js";
import { loadUnreadCategories, readRoomMatchNotifications } from "./unread.js";

async function settlePolling() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

function pollingFixture(t, options = {}) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let items = [{ notificationId: 10, type: "LIKE", readAt: null }];
  let count = 1;
  const snapshots = [];
  const arrivals = [];
  const statuses = [];
  const poller = createNotificationPoller({
    fetchCount: async () => ({ count }),
    fetchPage: async () => ({ items }),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onNotification: (item) => arrivals.push(item.notificationId),
    onStatus: (status) => statuses.push(status),
    canPoll: () => true,
    random: () => 0.5,
    ...options,
  });
  t.after(() => poller.stop());
  return {
    poller,
    snapshots,
    arrivals,
    statuses,
    update(nextItems, nextCount = count) {
      items = nextItems;
      count = nextCount;
    },
    async tick(ms = 0) {
      t.mock.timers.tick(ms);
      await settlePolling();
    },
  };
}

test("polling baselines old records and finds new IDs even when unread totals stay equal", async (t) => {
  const state = pollingFixture(t);
  state.poller.refresh();
  await state.tick();
  assert.deepEqual(state.arrivals, []);
  assert.deepEqual(state.snapshots[0], {
    count: 1,
    initial: true,
    changed: true,
  });
  // A lower ID can commit late. Do not use max(id) as an arrival cursor.
  state.update([
    { notificationId: "10", type: "LIKE", readAt: "read" },
    { notificationId: 9, type: "CHAT_MESSAGE", readAt: null },
  ]);
  await state.tick(4999);
  assert.equal(state.snapshots.length, 1);
  await state.tick(1);
  assert.deepEqual(state.arrivals, [9]);
  assert.equal(state.snapshots[1].count, 1);
  await state.tick(5000);
  assert.deepEqual(state.arrivals, [9]);
  assert.equal(state.snapshots[2].changed, false);
});

test("polling detects read and delete state without repeating arrival banners", async (t) => {
  const state = pollingFixture(t);
  state.poller.refresh();
  await state.tick();
  state.update([{ notificationId: 10, type: "LIKE", readAt: "read" }], 0);
  await state.tick(5000);
  state.update([], 0);
  await state.tick(5000);
  assert.deepEqual(state.arrivals, []);
  assert.equal(state.snapshots[1].changed, true);
  assert.equal(state.snapshots[2].changed, true);
});

test("new polling arrivals are delivered oldest first so the newest banner wins", async (t) => {
  const state = pollingFixture(t);
  state.poller.refresh();
  await state.tick();
  state.update([
    { notificationId: 12, type: "MATCH" },
    { notificationId: 11, type: "CHAT_MESSAGE" },
    { notificationId: 10, type: "LIKE" },
  ]);
  await state.tick(5000);
  assert.deepEqual(state.arrivals, [11, 12]);
});

test("refreshes coalesce behind a request and discard its outdated snapshot", async (t) => {
  let resolveCount;
  let calls = 0;
  const state = pollingFixture(t, {
    fetchCount: () => {
      calls += 1;
      return calls === 1
        ? new Promise((resolve) => {
            resolveCount = resolve;
          })
        : Promise.resolve({ count: 2 });
    },
  });
  state.poller.refresh();
  await state.tick();
  state.poller.refresh();
  state.poller.refresh();
  assert.equal(calls, 1);
  resolveCount({ count: 1 });
  await settlePolling();
  assert.equal(state.snapshots.length, 0);
  await state.tick();
  assert.equal(calls, 2);
  assert.equal(state.snapshots[0].count, 2);
});

test("hidden or offline clients abort polling and resume with an immediate refresh", async (t) => {
  let available = true;
  let calls = 0;
  let signal;
  let finish;
  const state = pollingFixture(t, {
    canPoll: () => available,
    fetchCount: (currentSignal) => {
      calls += 1;
      signal = currentSignal;
      return calls === 1
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve({ count: 1 });
    },
  });
  state.poller.refresh();
  await state.tick();
  available = false;
  state.poller.refresh();
  assert.equal(signal.aborted, true);
  finish({ count: 1 });
  await settlePolling();
  await state.tick(60000);
  assert.equal(calls, 1);
  assert.equal(state.snapshots.length, 0);
  available = true;
  state.poller.refresh();
  await state.tick();
  assert.equal(calls, 2);
  assert.equal(state.snapshots.length, 1);
});

test("logout and account changes suppress pending results and future polling", async (t) => {
  let current = true;
  let finish;
  let signal;
  let calls = 0;
  const state = pollingFixture(t, {
    isCurrent: () => current,
    fetchCount: (currentSignal) => {
      calls += 1;
      signal = currentSignal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  state.poller.refresh();
  await state.tick();
  current = false;
  state.poller.stop();
  finish({ count: 4 });
  await settlePolling();
  state.poller.refresh();
  await state.tick(60000);
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
  assert.deepEqual(state.snapshots, []);
  assert.deepEqual(state.arrivals, []);
});

test("temporary failures retain the confirmed snapshot and back off before recovery", async (t) => {
  let fails = false;
  const state = pollingFixture(t, {
    fetchCount: async () => {
      if (fails) throw Object.assign(new Error("Unavailable"), { status: 503 });
      return { count: 1 };
    },
  });
  state.poller.refresh();
  await state.tick();
  fails = true;
  await state.tick(5000);
  assert.equal(state.snapshots.length, 1);
  assert.equal(state.statuses.at(-1), "reconnecting");
  fails = false;
  await state.tick(9999);
  assert.equal(state.snapshots.length, 1);
  await state.tick(1);
  assert.equal(state.snapshots.length, 2);
  assert.equal(state.statuses.at(-1), "connected");
  assert.deepEqual(state.arrivals, []);
});

test("polling stops after authentication is rejected", async (t) => {
  let calls = 0;
  const state = pollingFixture(t, {
    fetchCount: async () => {
      calls += 1;
      throw Object.assign(new Error("Unauthorized"), { status: 401 });
    },
  });
  state.poller.refresh();
  await state.tick();
  state.poller.refresh();
  await state.tick(60000);
  assert.equal(calls, 1);
  assert.deepEqual(state.statuses, ["unauthenticated"]);
});

test("a stalled polling request is aborted and can recover on the next attempt", async (t) => {
  let calls = 0;
  let signal;
  const state = pollingFixture(t, {
    fetchCount: (currentSignal) => {
      calls += 1;
      signal = currentSignal;
      if (calls > 1) return Promise.resolve({ count: 1 });
      return new Promise((_resolve, reject) => {
        currentSignal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    },
  });
  state.poller.refresh();
  await state.tick();
  await state.tick(15000);
  assert.equal(signal.aborted, true);
  assert.equal(state.statuses.at(-1), "reconnecting");
  await state.tick(10000);
  assert.equal(calls, 2);
  assert.equal(state.snapshots.length, 1);
});

test("the default poller reads authenticated REST snapshots without opening SSE", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  window.sessionStorage = { getItem: () => null, setItem() {} };
  setAccessToken("polling-token");
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    assert.doesNotMatch(url, /\/stream/);
    const data = url.endsWith("/unread-count")
      ? { count: 7 }
      : { items: [{ notificationId: 1, type: "MATCH" }] };
    return new Response(JSON.stringify({ data }), {
      headers: { "content-type": "application/json" },
    });
  });
  const snapshots = [];
  const poller = createNotificationPoller({
    canPoll: () => true,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onNotification() {
      assert.fail("Old records must not become new arrivals");
    },
  });
  try {
    poller.refresh();
    t.mock.timers.tick(0);
    await settlePolling();
    assert.equal(calls.length, 2);
    assert.equal(snapshots[0].count, 7);
    assert.match(calls[1].url, /notifications\?category=ALL&size=20$/);
    for (const call of calls) {
      assert.equal(
        call.options.headers.get("Authorization"),
        "Bearer polling-token",
      );
      assert.equal(call.options.cache, "no-store");
      assert.equal(call.options.headers.get("Accept"), "application/json");
    }
  } finally {
    poller.stop();
    globalThis.window = previousWindow;
  }
});

test("category dots include old unread items beyond a fully read first page", async () => {
  const cursors = [];
  const flags = await loadUnreadCategories({
    fetchPage: async (category, { cursor }) => {
      assert.equal(category, "ALL");
      cursors.push(cursor);
      return cursor == null
        ? {
            items: Array.from({ length: 20 }, (_, index) => ({
              notificationId: 50 - index,
              type: "LIKE",
              readAt: "read",
            })),
            pageInfo: { hasNext: true, nextCursor: 31 },
          }
        : {
            items: [
              { type: "MATCH", readAt: null },
              { type: "CHAT_MESSAGE", readAt: null },
              { type: "AI_SIMULATION_REPORT_COMPLETED", readAt: null },
            ],
            pageInfo: { hasNext: false },
          };
    },
  });
  assert.deepEqual(cursors, [undefined, 31]);
  assert.deepEqual(flags, {
    ALL: true,
    INTEREST: true,
    CHAT: true,
    SYSTEM: true,
  });
});

test("category dots exclude read entries and stop once all categories are known", async () => {
  let calls = 0;
  const flags = await loadUnreadCategories({
    fetchPage: async () => {
      calls += 1;
      return {
        items: [{ type: "LIKE" }, { type: "CHAT_MESSAGE" }, { type: "NOTICE" }],
        pageInfo: { hasNext: true, nextCursor: 10 },
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(flags.SYSTEM, true);
  const readOnly = await loadUnreadCategories({
    fetchPage: async () => ({
      items: [{ type: "MATCH", readAt: "read" }],
      pageInfo: {},
    }),
  });
  assert.deepEqual(readOnly, {
    ALL: false,
    INTEREST: false,
    CHAT: false,
    SYSTEM: false,
  });
});

test("room entry reads only that room's unread matches, including older cursor pages", async () => {
  const receipts = [];
  const notified = [];
  await readRoomMatchNotifications(77, {
    fetchPage: async (category, { cursor }) => {
      assert.equal(category, "INTEREST");
      return cursor == null
        ? {
            items: [
              {
                notificationId: 12,
                type: "MATCH",
                targetType: "CHAT_ROOM",
                targetId: 88,
              },
              {
                notificationId: 11,
                type: "LIKE",
                targetType: "PROFILE",
                targetId: 77,
              },
              {
                notificationId: 10,
                type: "MATCH",
                targetType: "CHAT_ROOM",
                targetId: 77,
                readAt: "read",
              },
            ],
            pageInfo: { hasNext: true, nextCursor: 10 },
          }
        : {
            items: [
              {
                notificationId: 9,
                type: "MATCH",
                targetType: "CHAT_ROOM",
                targetId: 77,
              },
              {
                notificationId: 8,
                type: "CHAT_MESSAGE",
                targetType: "CHAT_ROOM",
                targetId: 77,
              },
            ],
            pageInfo: {},
          };
    },
    readNotification: async (id) => {
      receipts.push(id);
    },
    onRead: (item) => notified.push(item.notificationId),
  });
  assert.deepEqual(receipts, [9]);
  assert.deepEqual(notified, [9]);
});

test("account changes abort room receipts before the next record can use another account", async () => {
  let current = true;
  const receipts = [];
  await assert.rejects(
    readRoomMatchNotifications(77, {
      isCurrent: () => current,
      fetchPage: async () => ({
        items: [1, 2].map((id) => ({
          notificationId: id,
          type: "MATCH",
          targetType: "CHAT_ROOM",
          targetId: 77,
        })),
        pageInfo: {},
      }),
      readNotification: async (id) => {
        receipts.push(id);
        current = false;
      },
    }),
    { name: "AbortError" },
  );
  assert.deepEqual(receipts, [1]);
});

test("repeated notification cursors and cancelled scans stop instead of looping", async () => {
  await assert.rejects(
    loadUnreadCategories({
      fetchPage: async () => ({
        items: [],
        pageInfo: { hasNext: true, nextCursor: 7 },
      }),
    }),
    /Repeated notification cursor/,
  );
  const controller = new AbortController();
  controller.abort();
  let fetched = false;
  await assert.rejects(
    loadUnreadCategories({
      signal: controller.signal,
      fetchPage: async () => {
        fetched = true;
      },
    }),
    { name: "AbortError" },
  );
  assert.equal(fetched, false);
});

test("approved copy preserves sender information without inventing a chat preview", () => {
  assert.equal(
    notificationCopy({ type: "LIKE" }).title,
    "새로운 인연이 도착했어요",
  );
  assert.equal(
    notificationCopy({ type: "MATCH" }).title,
    "두근두근, 서로 좋아요를 주고받았어요!",
  );
  assert.equal(
    notificationCopy({
      type: "CHAT_MESSAGE",
      body: "민지님에게서 메시지가 도착했어요.",
    }).body,
    "민지님에게서 메시지가 도착했어요.",
  );
  assert.equal(
    notificationCopy({ type: "NOTICE", title: "공지", body: "내용" }).body,
    "내용",
  );
});

test("only supported server targets can navigate, and the profile returns to the inbox", () => {
  assert.equal(
    notificationDestination({ targetType: "PROFILE", targetId: 2 }),
    "/profiles/2?returnTo=%2Fnotifications",
  );
  assert.equal(
    notificationDestination({ targetType: "CHAT_ROOM", targetId: 7 }),
    "/chats/7",
  );
  assert.equal(
    notificationDestination({ targetType: "AI_SIMULATION", targetId: 8 }),
    "/ai/simulations/8",
  );
  for (const item of [
    { targetType: "PROFILE", targetId: "../settings" },
    { targetType: "URL", targetId: "https://example.com" },
    { type: "AI_PRACTICE_CHAT_COMPLETED", targetId: 1 },
  ])
    assert.equal(notificationDestination(item), null);
  assert.equal(
    notificationDestination({ type: "PERSONA_TRAINING_COMPLETED" }),
    "/my/persona",
  );
});

test("chat notifications suppress a banner only in the same real chat room", () => {
  const item = { type: "CHAT_MESSAGE", targetType: "CHAT_ROOM", targetId: 2 };
  assert.equal(isCurrentChatNotification(item, "/chats/2"), true);
  assert.equal(isCurrentChatNotification(item, "/chats/3"), false);
  assert.equal(isCurrentChatNotification(item, "/ai/practice/2"), false);
  assert.equal(
    isCurrentChatNotification({ ...item, type: "MATCH" }, "/chats/2"),
    false,
  );
});

test("notification count is capped independently from the chat message count", () => {
  for (const count of [null, undefined, 0, -1, NaN, 1.1, "2"])
    assert.equal(notificationBadge(count), "");
  assert.equal(notificationBadge(1), "1");
  assert.equal(notificationBadge(99), "99");
  assert.equal(notificationBadge(100), "99+");
});

test("UTC LocalDateTime timestamps follow the chat convention and group in Korea time", () => {
  const now = new Date("2026-10-18T00:10:00+09:00");
  assert.equal(notificationDay("2026-10-17T15:00:00", now), "오늘");
  assert.equal(notificationDay("2026-10-17T14:59:00", now), "어제");
  assert.equal(notificationTime("2026-10-17T17:14:00"), "오전 2:14");
  assert.equal(notificationDay("invalid", now), "이전 소식");
  assert.equal(notificationTime(null), "");
});

test("paging and repeated events merge by server id with fresh read state", () => {
  const result = mergeNotifications(
    [{ notificationId: 3, readAt: null }, { notificationId: 2 }],
    [{ notificationId: 3, readAt: "now" }, { notificationId: 4 }],
  );
  assert.deepEqual(
    result.map((item) => item.notificationId),
    [4, 3, 2],
  );
  assert.equal(result[1].readAt, "now");
});

test("SSE handles split CRLF, comments, multiple data lines and consecutive events", () => {
  const events = [];
  const parse = createSseParser((event) => events.push(event));
  parse(": heartbeat\r");
  parse('\nevent: notification\r\ndata: {\r\ndata: "type":"LIKE"}\r\n\r');
  assert.equal(events.length, 0);
  parse("\nevent: connected\ndata: {}\n\n");
  assert.deepEqual(events, [
    { event: "notification", data: '{\n"type":"LIKE"}' },
    { event: "connected", data: "{}" },
  ]);
});

test("live stream preserves split Korean UTF-8, skips malformed data, and aborts on cleanup", async () => {
  let channel;
  let signal;
  let connected = 0;
  const events = [];
  const stop = connectNotificationStream({
    onConnected: () => {
      connected += 1;
    },
    onNotification: (item) => events.push(item),
    openStream: async (currentSignal) => {
      signal = currentSignal;
      const body = new ReadableStream({
        start(controller) {
          channel = controller;
          currentSignal.addEventListener("abort", () =>
            controller.error(new DOMException("Aborted", "AbortError")),
          );
        },
      });
      return new Response(body, {
        headers: { "content-type": "text/event-stream" },
      });
    },
  });
  const bytes = new TextEncoder().encode(
    'event: connected\ndata: {}\n\nevent: notification\ndata: invalid\n\nevent: notification\ndata: {"notificationId":1,"type":"LIKE","body":"좋아요가 도착했어요"}\n\n',
  );
  for (let index = 0; index < bytes.length; index += 2)
    channel.enqueue(bytes.slice(index, index + 2));
  for (let index = 0; index < bytes.length; index += 1) await Promise.resolve();
  assert.equal(connected, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].body, "좋아요가 도착했어요");
  stop();
  assert.equal(signal.aborted, true);
});

test("REST endpoints use backend category names, cursor, real receipts and Bearer SSE", async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  globalThis.window = new EventTarget();
  window.sessionStorage = { getItem: () => null, setItem() {} };
  const calls = [];
  setAccessToken("test-token");
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/read-receipt") || options.method === "DELETE")
      return new Response(null, { status: 204 });
    if (url.endsWith("/stream"))
      return new Response("event: connected\ndata: {}\n\n", {
        headers: { "content-type": "text/event-stream" },
      });
    return new Response(JSON.stringify({ data: { count: 7, items: [] } }), {
      headers: { "content-type": "application/json" },
    });
  };
  try {
    await api.notifications("INTEREST", { cursor: 42 });
    assert.match(calls[0].url, /category=INTEREST&size=20&cursor=42$/);
    await api.markAsRead(1);
    assert.equal(calls[1].options.method, "PUT");
    assert.match(calls[1].url, /\/1\/read-receipt$/);
    await api.deleteNotification(1);
    assert.equal(calls[2].options.method, "DELETE");
    assert.equal((await api.unreadCount()).count, 7);
    const response = await api.openNotificationStream();
    assert.equal(
      calls[4].options.headers.get("Authorization"),
      "Bearer test-token",
    );
    assert.equal(calls[4].options.headers.get("Accept"), "text/event-stream");
    assert.match(await response.text(), /event: connected/);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.window = previousWindow;
  }
});

test("stream reconnects with backoff and cleanup cancels future connections", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let attempts = 0;
  let connected = 0;
  const stop = connectNotificationStream({
    onNotification() {},
    onConnected: () => {
      connected += 1;
    },
    openStream: async () => {
      attempts += 1;
      if (attempts === 1)
        throw Object.assign(new Error("Unavailable"), { status: 503 });
      return new Response("event: connected\ndata: {}\n\n", {
        headers: { "content-type": "text/event-stream" },
      });
    },
  });
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
  assert.equal(attempts, 1);
  t.mock.timers.tick(999);
  assert.equal(attempts, 1);
  t.mock.timers.tick(1);
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
  assert.equal(attempts, 2);
  assert.equal(connected, 1);
  stop();
  t.mock.timers.tick(100000);
  assert.equal(attempts, 2);
});

test("an unauthenticated stream does not keep reconnecting", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let attempts = 0;
  const stop = connectNotificationStream({
    onNotification() {},
    onConnected() {},
    openStream: async () => {
      attempts += 1;
      throw Object.assign(new Error("Unauthorized"), { status: 401 });
    },
  });
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
  t.mock.timers.tick(100000);
  assert.equal(attempts, 1);
  stop();
});
