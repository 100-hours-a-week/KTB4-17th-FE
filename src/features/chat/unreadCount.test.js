import assert from "node:assert/strict";
import { test } from "node:test";
import { createChatSocketSubscriptions } from "./socketSubscriptions.js";
import { createUnreadCountTracker, formatUnreadCount } from "./unreadCount.js";

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function fixture(fetchCount) {
  const timers = new Map();
  const values = [];
  let id = 0;
  const tracker = createUnreadCountTracker({
    fetchCount,
    onCount: (count) => values.push(count),
    setTimer: (callback, delay) => {
      timers.set(++id, { callback, delay });
      return id;
    },
    clearTimer: (key) => timers.delete(key),
  });
  return {
    tracker,
    values,
    timers,
    async tick() {
      const [key, timer] = timers.entries().next().value;
      timers.delete(key);
      timer.callback();
      await settle();
    },
  };
}

test("badge hides zero and invalid totals, preserves 154, and caps at 999+", () => {
  for (const count of [null, undefined, 0, -1, NaN, 1.5, "154"])
    assert.equal(formatUnreadCount(count), "");
  assert.equal(formatUnreadCount(1), "1");
  assert.equal(formatUnreadCount(154), "154");
  assert.equal(formatUnreadCount(999), "999");
  assert.equal(formatUnreadCount(1000), "999+");
});

test("message bursts share one request and use the full server total", async () => {
  let calls = 0;
  const state = fixture(async () => {
    calls += 1;
    return 154;
  });
  for (let i = 0; i < 10; i += 1) state.tracker.refresh();
  assert.equal(state.timers.size, 1);
  await state.tick();
  assert.equal(calls, 1);
  assert.deepEqual(state.values, [154]);
  state.tracker.stop();
});

test("a read or arrival during a request cannot publish the older total", async () => {
  let resolve;
  let calls = 0;
  const state = fixture(() => {
    calls += 1;
    return calls === 1
      ? new Promise((done) => {
          resolve = done;
        })
      : Promise.resolve(0);
  });
  state.tracker.refresh();
  await state.tick();
  state.tracker.refresh();
  state.tracker.refresh();
  resolve(154);
  await settle();
  assert.deepEqual(state.values, []);
  assert.equal(state.timers.size, 1);
  await state.tick();
  assert.deepEqual(state.values, [0]);
  assert.equal(calls, 2);
  state.tracker.stop();
});

test("temporary errors retain the previous count and retry only twice", async () => {
  let fail = false;
  let calls = 0;
  const state = fixture(async () => {
    calls += 1;
    if (fail) throw new Error("offline");
    return 12;
  });
  state.tracker.refresh();
  await state.tick();
  fail = true;
  state.tracker.refresh();
  await state.tick();
  assert.equal([...state.timers.values()][0].delay, 2000);
  await state.tick();
  assert.equal([...state.timers.values()][0].delay, 4000);
  await state.tick();
  assert.equal(calls, 4);
  assert.equal(state.timers.size, 0);
  assert.deepEqual(state.values, [12]);
  fail = false;
  state.tracker.refresh();
  await state.tick();
  assert.deepEqual(state.values, [12, 12]);
  state.tracker.stop();
});

test("malformed totals never turn into a fabricated zero", async () => {
  const state = fixture(async () => undefined);
  state.tracker.refresh();
  await state.tick();
  assert.deepEqual(state.values, []);
  state.tracker.stop();
  assert.equal(state.timers.size, 0);
});

test("logout aborts the request and ignores its late response", async () => {
  let resolve;
  let signal;
  const state = fixture((requestSignal) => {
    signal = requestSignal;
    return new Promise((done) => {
      resolve = done;
    });
  });
  state.tracker.refresh();
  await state.tick();
  state.tracker.stop();
  assert.equal(signal.aborted, true);
  resolve(154);
  await settle();
  state.tracker.refresh();
  assert.deepEqual(state.values, []);
  assert.equal(state.timers.size, 0);
});

test("badge and chat screens share a socket and route changes keep it open", () => {
  let callbacks;
  let opened = 0;
  let closed = 0;
  const hub = createChatSocketSubscriptions((listeners) => {
    opened += 1;
    callbacks = listeners;
    listeners.onStatus("connecting");
    return () => {
      closed += 1;
    };
  });
  const badge = [];
  const list = [];
  const room = [];
  const stopBadge = hub.subscribe({ onMessage: (event) => badge.push(event) });
  callbacks.onStatus("connected");
  callbacks.onConnected();
  let connected = 0;
  const stopList = hub.subscribe({
    onMessage: (event) => list.push(event),
    onConnected: () => {
      connected += 1;
    },
  });
  assert.equal(connected, 1);
  callbacks.onMessage(1);
  stopList();
  const stopRoom = hub.subscribe({ onMessage: (event) => room.push(event) });
  callbacks.onMessage(2);
  assert.equal(opened, 1);
  assert.equal(closed, 0);
  assert.deepEqual(badge, [1, 2]);
  assert.deepEqual(list, [1]);
  assert.deepEqual(room, [2]);
  stopRoom();
  stopBadge();
  assert.equal(closed, 1);
  stopBadge();
  assert.equal(closed, 1);
});

test("reconnection reaches all screens and old account events are discarded", () => {
  const connections = [];
  const hub = createChatSocketSubscriptions((callbacks) => {
    connections.push(callbacks);
    return () => {};
  });
  const values = [];
  let connected = 0;
  const previous = hub.subscribe({
    onMessage: (value) => values.push(value),
    onConnected: () => {
      connected += 1;
    },
  });
  connections[0].onConnected();
  connections[0].onConnected();
  assert.equal(connected, 2);
  hub.clear();
  const stop = hub.subscribe({ onMessage: (value) => values.push(value) });
  previous();
  connections[0].onMessage("old account");
  connections[1].onMessage("current account");
  assert.deepEqual(values, ["current account"]);
  stop();
});
