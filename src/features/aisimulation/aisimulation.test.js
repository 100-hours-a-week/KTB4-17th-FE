import assert from "node:assert/strict";
import test from "node:test";
import { attemptAiSimulation, createAiSimulation } from "./api.js";
import { createSimulationLaunchCoordinator } from "./launchCoordinator.js";
import { requestSimulationAttempt } from "./requestSimulationAttempt.js";

test("simulation creation forwards its abort signal", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let requestOptions;
  globalThis.fetch = async (_url, options) => {
    requestOptions = options;
    return new Response(
      JSON.stringify({ data: { simulationId: 17, status: "IN_PROGRESS" } }),
      {
        status: 202,
        headers: { "content-type": "application/json" },
      },
    );
  };

  try {
    assert.equal(
      (await createAiSimulation(23, { signal: controller.signal }))
        .simulationId,
      17,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestOptions.signal, controller.signal);
  assert.equal(requestOptions.method, "POST");
});

test("cancelling a matching simulation invalidates every late result", () => {
  const coordinator = createSimulationLaunchCoordinator();
  const request = coordinator.begin(23);

  assert.ok(request);
  assert.equal(coordinator.isCurrent(request), true);
  assert.equal(coordinator.cancel(99), null);
  assert.equal(coordinator.isCurrent(request), true);

  const cancelled = coordinator.cancel(23);
  assert.equal(cancelled, request);
  assert.equal(request.controller.signal.aborted, true);
  assert.equal(coordinator.isCurrent(request), false);
  assert.equal(coordinator.finish(request), false);

  const nextRequest = coordinator.begin(24);
  assert.ok(nextRequest);
  assert.equal(coordinator.isCurrent(nextRequest), true);
});

import { aiSimulation, aiSimulationPair, aiSimulationState } from "./api.js";
import {
  simulationForViewer,
  simulationPath,
  validateHandle,
  validatePair,
} from "./model.js";
import { createSimulationTracker, MAX_POLLING_MS } from "./polling.js";
import { requestSimulation } from "./requestSimulation.js";

test("a failed simulation attempt uses the source ID without a target body", async () => {
  const previous = globalThis.fetch;
  const controller = new AbortController();
  let url;
  let options;
  globalThis.fetch = async (path, request) => {
    url = path;
    options = request;
    return Response.json(
      { data: { simulationId: 33, status: "IN_PROGRESS" } },
      { status: 202 },
    );
  };
  try {
    const result = await requestSimulationAttempt(32, {
      attempt: attemptAiSimulation,
      signal: controller.signal,
    });
    assert.deepEqual(result, {
      handle: { simulationId: 33, status: "IN_PROGRESS" },
      submissionRejected: false,
    });
    assert.match(url, /\/api\/v1\/ai-simulations\/32\/attempts$/);
    assert.equal(options.method, "POST");
    assert.equal(options.body, undefined);
    assert.equal(options.signal, controller.signal);
  } finally {
    globalThis.fetch = previous;
  }
});

test("repeated attempt responses can resolve to a newer completed or failed session", async () => {
  for (const status of ["IN_PROGRESS", "COMPLETED", "FAILED"]) {
    const result = await requestSimulationAttempt(32, {
      attempt: async () => ({ simulationId: 33, status }),
    });
    assert.equal(result.handle.simulationId, 33);
    assert.equal(result.handle.status, status);
  }
});

test("capacity rejection preserves the new failed session ID for the next attempt", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json(
      {
        errorCode: "SIMULATION_CAPACITY_EXCEEDED",
        simulationId: 33,
        status: "FAILED",
      },
      { status: 503 },
    );
  try {
    const result = await requestSimulationAttempt(32, {
      attempt: attemptAiSimulation,
    });
    assert.equal(result.handle.simulationId, 33);
    assert.equal(result.handle.status, "FAILED");
    assert.equal(result.submissionRejected, true);
  } finally {
    globalThis.fetch = previous;
  }
});

test("attempts reject invalid IDs and malformed capacity responses", async () => {
  for (const value of [
    { simulationId: 31, status: "IN_PROGRESS" },
    { simulationId: 33, status: "UNKNOWN" },
    { simulationId: null, status: "FAILED" },
  ]) {
    await assert.rejects(
      requestSimulationAttempt(32, { attempt: async () => value }),
      { code: "SIMULATION_RESPONSE_INVALID" },
    );
  }
  for (const simulationId of [31, 32, null]) {
    const error = Object.assign(new Error("capacity"), {
      code: "SIMULATION_CAPACITY_EXCEEDED",
      status: 503,
      details: { simulationId, status: "FAILED" },
    });
    await assert.rejects(
      requestSimulationAttempt(32, {
        attempt: async () => {
          throw error;
        },
      }),
      { code: "SIMULATION_RESPONSE_INVALID" },
    );
  }
});

test("an uncertain attempt is not automatically submitted again", async () => {
  let calls = 0;
  const error = new TypeError("Failed to fetch");
  await assert.rejects(
    requestSimulationAttempt(32, {
      attempt: async () => {
        calls += 1;
        throw error;
      },
    }),
    (actual) => actual === error,
  );
  assert.equal(calls, 1);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

function setupTracker(fetchState, options = {}) {
  let clock = 0;
  let sequence = 0;
  const timers = new Map();
  const storage = options.storage || memoryStorage();
  const tracker = createSimulationTracker({
    owner: "11",
    storage,
    fetchState,
    now: () => clock,
    setTimer(callback, delay) {
      const id = ++sequence;
      timers.set(id, { callback, time: clock + delay });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    ...options,
  });
  async function flush() {
    for (let index = 0; index < 16; index += 1) await Promise.resolve();
  }
  return {
    tracker,
    storage,
    timers,
    flush,
    async advance(milliseconds = 0) {
      clock += milliseconds;
      for (let index = 0; index < 100; index += 1) {
        const ready = [...timers].find(([, timer]) => timer.time <= clock);
        if (!ready) break;
        timers.delete(ready[0]);
        ready[1].callback();
        await flush();
      }
      await flush();
    },
  };
}

const handle = (status, simulationId = 17) => ({ simulationId, status });
const absent = { targetUserId: 23, simulationId: null, status: null };

for (const status of ["IN_PROGRESS", "COMPLETED", "FAILED", "CANCELED"]) {
  test(`existing ${status} pair never triggers a POST`, async () => {
    let creates = 0;
    const value = await requestSimulation(23, {
      getPair: async () => ({ targetUserId: 23, ...handle(status) }),
      create: async () => {
        creates += 1;
      },
    });
    assert.equal(value.status, status);
    assert.equal(creates, 0);
  });
}

test("a missing pair creates once and accepts an asynchronous handle", async () => {
  const controller = new AbortController();
  let creates = 0;
  const value = await requestSimulation(23, {
    signal: controller.signal,
    getPair: async (_id, { signal }) => {
      assert.equal(signal, controller.signal);
      return absent;
    },
    create: async (_id, { signal }) => {
      assert.equal(signal, controller.signal);
      creates += 1;
      return handle("IN_PROGRESS");
    },
  });
  assert.equal(value.status, "IN_PROGRESS");
  assert.equal(creates, 1);
});

test("a concurrently admitted completed handle is reused", async () => {
  const value = await requestSimulation(23, {
    getPair: async () => absent,
    create: async () => handle("COMPLETED"),
  });
  assert.equal(value.status, "COMPLETED");
});

for (const status of [404, 500]) {
  test(`failed pair lookup ${status} never means an absent pair`, async () => {
    let creates = 0;
    await assert.rejects(
      requestSimulation(23, {
        getPair: async () => {
          throw Object.assign(new Error("unavailable"), { status });
        },
        create: async () => {
          creates += 1;
        },
      }),
    );
    assert.equal(creates, 0);
  });
}

test("lost POST response recovers the admitted job with GET without retrying POST", async () => {
  let reads = 0;
  let creates = 0;
  const value = await requestSimulation(23, {
    getPair: async () =>
      ++reads === 1 ? absent : { targetUserId: 23, ...handle("IN_PROGRESS") },
    create: async () => {
      creates += 1;
      throw new TypeError("network disconnected");
    },
  });
  assert.equal(value.simulationId, 17);
  assert.equal(reads, 2);
  assert.equal(creates, 1);
});

test("capacity rejection recovers FAILED and does not offer generation retry", async () => {
  let reads = 0;
  const value = await requestSimulation(23, {
    getPair: async () =>
      ++reads === 1 ? absent : { targetUserId: 23, ...handle("FAILED") },
    create: async () => {
      throw Object.assign(new Error("capacity"), { status: 503 });
    },
  });
  assert.equal(value.status, "FAILED");
});

test("aborted creation does not perform a recovery request", async () => {
  const controller = new AbortController();
  let reads = 0;
  await assert.rejects(
    requestSimulation(23, {
      signal: controller.signal,
      getPair: async () => {
        reads += 1;
        return absent;
      },
      create: async () => {
        controller.abort();
        throw new DOMException("Aborted", "AbortError");
      },
    }),
    { name: "AbortError" },
  );
  assert.equal(reads, 1);
});

test("lookup, status and detail use GET, no-store and the caller's signal", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ data: handle("COMPLETED") }), {
      headers: { "content-type": "application/json" },
    });
  };
  try {
    await aiSimulationPair(23, { signal: controller.signal });
    await aiSimulationState(17, { signal: controller.signal });
    await aiSimulation(17, { signal: controller.signal });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(
    requests.map((request) => request.url),
    [
      "/api/v1/ai-simulations/targets/23",
      "/api/v1/ai-simulations/17/status",
      "/api/v1/ai-simulations/17",
    ],
  );
  for (const { options } of requests) {
    assert.equal(options.method, "GET");
    assert.equal(options.cache, "no-store");
    assert.equal(options.signal, controller.signal);
  }
});

test("invalid handles and inconsistent pairs are never accepted", () => {
  for (const value of [{}, handle("UNKNOWN"), handle("COMPLETED", -1)])
    assert.throws(() => validateHandle(value));
  assert.throws(() => validateHandle(handle("COMPLETED", 18), 17));
  assert.throws(() => validatePair({ ...absent, status: "COMPLETED" }, 23));
  assert.throws(() => validatePair({ ...absent, targetUserId: 99 }, 23));
});

test("shared result swaps participant labels, own speaker and dimension values for B", () => {
  const detail = {
    simulationId: 17,
    me: { userId: 11, nickname: "A" },
    partner: { userId: 23, nickname: "B" },
    transcript: [{ index: 1, speaker: "a", text: "A의 대화" }],
    report: { areas: [{ dimensions: [{ a: 2, b: 5 }] }] },
  };
  const a = simulationForViewer(detail, "11");
  const b = simulationForViewer(detail, "23");
  assert.equal(a.mySpeaker, "a");
  assert.equal(b.mySpeaker, "b");
  assert.equal(b.me.userId, 23);
  assert.equal(b.partner.userId, 11);
  assert.equal(b.report.areas[0].dimensions[0].mine, 5);
  assert.equal(b.report.areas[0].dimensions[0].partner, 2);
  assert.equal(b.transcript, detail.transcript);
  assert.equal(detail.me.userId, 11);
  assert.equal(detail.report.areas[0].dimensions[0].mine, undefined);
  assert.throws(() => simulationForViewer(detail, "99"));
  assert.throws(() => simulationForViewer(detail, "invalid-token"));
  assert.equal(simulationPath(17, 42), "/ai/simulations/17?chatRoomId=42");
  assert.equal(simulationPath(17, null), "/ai/simulations/17");
});

test("launch coordinator invalidates responses after an account change", () => {
  let owner = "11";
  const coordinator = createSimulationLaunchCoordinator({
    getOwner: () => owner,
  });
  const request = coordinator.begin(23);
  owner = "99";
  assert.equal(coordinator.isCurrent(request), false);
});

test("tracking a job twice and repeated start never overlap status requests", async () => {
  const pending = deferred();
  let reads = 0;
  const { tracker, advance, flush } = setupTracker(() => {
    reads += 1;
    return pending.promise;
  });
  tracker.start();
  tracker.track(handle("IN_PROGRESS"));
  tracker.ensure(17);
  tracker.start();
  await advance();
  await advance(9000);
  tracker.ensure(17);
  tracker.start();
  assert.equal(reads, 1);
  pending.resolve(handle("IN_PROGRESS"));
  await flush();
  await advance(2999);
  assert.equal(reads, 1);
  await advance(1);
  assert.equal(reads, 2);
  tracker.stop();
});

test("completion stops polling and publishes one completion event", async () => {
  let reads = 0;
  const { tracker, advance, timers } = setupTracker(async () => {
    reads += 1;
    return handle(reads === 1 ? "IN_PROGRESS" : "COMPLETED");
  });
  tracker.start();
  tracker.track(handle("IN_PROGRESS"), { targetUserId: 23, chatRoomId: 42 });
  await advance();
  await advance(3000);
  assert.equal(tracker.getSnapshot().entries[17].status, "COMPLETED");
  assert.equal(tracker.getSnapshot().completions.length, 1);
  assert.equal(tracker.getSnapshot().completions[0].chatRoomId, 42);
  assert.equal(timers.size, 0);
  await advance(60000);
  assert.equal(reads, 2);
  tracker.acknowledge(17);
  tracker.refresh(17);
  await advance();
  assert.equal(tracker.getSnapshot().completions.length, 0);
});

for (const status of ["FAILED", "CANCELED"]) {
  test(`${status} is terminal and produces no completion toast`, async () => {
    const { tracker, advance, timers } = setupTracker(async () =>
      handle(status),
    );
    tracker.start();
    tracker.track(handle("IN_PROGRESS"));
    await advance();
    assert.equal(tracker.getSnapshot().entries[17].status, status);
    assert.equal(tracker.getSnapshot().completions.length, 0);
    assert.equal(timers.size, 0);
  });
}

test("opening an already completed result does not publish a completion event", async () => {
  const { tracker, advance } = setupTracker(async () => handle("COMPLETED"));
  tracker.start();
  tracker.ensure(17);
  await advance();
  assert.equal(tracker.getSnapshot().completions.length, 0);
});

test("transient GET failures stop after two retries and preserve IN_PROGRESS", async () => {
  let reads = 0;
  const { tracker, advance, timers } = setupTracker(async () => {
    reads += 1;
    throw new TypeError("offline");
  });
  tracker.start();
  tracker.track(handle("IN_PROGRESS"));
  await advance();
  await advance(6000);
  await advance(12000);
  assert.equal(reads, 3);
  assert.equal(tracker.getSnapshot().entries[17].status, "IN_PROGRESS");
  assert.ok(tracker.getSnapshot().entries[17].error);
  assert.equal(timers.size, 0);
  tracker.refresh(17);
  await advance();
  assert.equal(reads, 4);
  tracker.stop();
});

for (const failure of [
  Object.assign(new Error("not found"), { status: 404 }),
  Object.assign(new Error("unauthorized"), { status: 401 }),
]) {
  test(`permanent GET failure ${failure.status} does not retry`, async () => {
    let reads = 0;
    const { tracker, advance, timers } = setupTracker(async () => {
      reads += 1;
      throw failure;
    });
    tracker.start();
    tracker.ensure(17);
    await advance();
    assert.equal(reads, 1);
    assert.equal(timers.size, 0);
    assert.equal(tracker.getSnapshot().entries[17].error, failure);
  });
}

test("unknown state cannot create an endless polling loop", async () => {
  const { tracker, advance, timers } = setupTracker(async () =>
    handle("UNKNOWN"),
  );
  tracker.start();
  tracker.ensure(17);
  await advance();
  assert.equal(
    tracker.getSnapshot().entries[17].error.code,
    "SIMULATION_RESPONSE_INVALID",
  );
  assert.equal(timers.size, 0);
});

test("pause aborts reads, rejects late responses and resumes with one new request", async () => {
  const old = deferred();
  let reads = 0;
  let oldSignal;
  const { tracker, advance, flush } = setupTracker((_id, { signal }) => {
    reads += 1;
    if (reads === 1) {
      oldSignal = signal;
      return old.promise;
    }
    return handle("IN_PROGRESS");
  });
  tracker.start();
  tracker.track(handle("IN_PROGRESS"));
  await advance();
  tracker.stop();
  assert.equal(oldSignal.aborted, true);
  old.resolve(handle("COMPLETED"));
  await flush();
  assert.equal(tracker.getSnapshot().entries[17].status, "IN_PROGRESS");
  assert.equal(tracker.getSnapshot().completions.length, 0);
  tracker.start();
  await advance();
  assert.equal(reads, 2);
  tracker.stop();
});

test("pending metadata survives refresh, is isolated by account and removed on completion", async () => {
  const storage = memoryStorage();
  const first = setupTracker(async () => handle("IN_PROGRESS"), { storage });
  first.tracker.track(handle("IN_PROGRESS"), {
    targetUserId: 23,
    chatRoomId: 42,
  });
  const saved = storage.getItem("pocket-signal:simulations:11");
  const second = setupTracker(async () => handle("COMPLETED"), { storage });
  assert.equal(storage.getItem("pocket-signal:simulations:11"), saved);
  assert.equal(second.tracker.getSnapshot().entries[17].chatRoomId, 42);
  const other = setupTracker(async () => handle("COMPLETED"), {
    storage,
    owner: "99",
  });
  assert.equal(other.tracker.getSnapshot().entries[17], undefined);
  second.tracker.start();
  await second.advance();
  assert.equal(second.tracker.getSnapshot().completions.length, 1);
  assert.equal(storage.getItem("pocket-signal:simulations:11"), null);
});

test("logout clears pending requests, metadata and queued completions", async () => {
  const pending = deferred();
  const { tracker, advance, flush, storage } = setupTracker(
    () => pending.promise,
  );
  tracker.start();
  tracker.track(handle("IN_PROGRESS"));
  await advance();
  tracker.clear();
  pending.resolve(handle("COMPLETED"));
  await flush();
  assert.deepEqual(tracker.getSnapshot(), { entries: {}, completions: [] });
  assert.equal(storage.getItem("pocket-signal:simulations:11"), null);
});

test("a changed account cannot receive a late completion", async () => {
  let validOwner = true;
  const pending = deferred();
  const { tracker, advance, flush } = setupTracker(() => pending.promise, {
    isCurrentOwner: () => validOwner,
  });
  tracker.start();
  tracker.track(handle("IN_PROGRESS"));
  await advance();
  validOwner = false;
  pending.resolve(handle("COMPLETED"));
  await flush();
  assert.equal(tracker.getSnapshot().completions.length, 0);
  tracker.stop();
});

test("client polling limit stops reads without marking the server job FAILED", async () => {
  const { tracker, advance } = setupTracker(async () => handle("IN_PROGRESS"));
  tracker.start();
  tracker.track(handle("IN_PROGRESS"));
  await advance();
  await advance(MAX_POLLING_MS);
  assert.equal(tracker.getSnapshot().entries[17].status, "IN_PROGRESS");
  assert.equal(
    tracker.getSnapshot().entries[17].error.code,
    "SIMULATION_POLLING_PAUSED",
  );
  tracker.refresh(17);
  await advance();
  assert.equal(tracker.getSnapshot().entries[17].error, null);
  tracker.stop();
});

test("a hung status request is aborted before a retry can overlap it", async () => {
  let signal;
  const { tracker, advance } = setupTracker((_id, options) => {
    signal = options.signal;
    return new Promise(() => {});
  });
  tracker.start();
  tracker.track(handle("IN_PROGRESS"));
  await advance();
  await advance(10000);
  assert.equal(signal.aborted, true);
  tracker.stop();
});

test("blocking a target removes its tracked jobs and pending notices", async () => {
  const { tracker, advance, storage } = setupTracker(async () =>
    handle("COMPLETED"),
  );
  tracker.start();
  tracker.track(handle("IN_PROGRESS"), { targetUserId: 23 });
  await advance();
  tracker.removeTarget(23);
  assert.equal(tracker.getSnapshot().entries[17], undefined);
  assert.equal(tracker.getSnapshot().completions.length, 0);
  assert.equal(storage.getItem("pocket-signal:simulations:11"), null);
});

test("disabled browser storage does not prevent tracking", async () => {
  const { tracker, advance } = setupTracker(async () => handle("COMPLETED"), {
    storage: {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
      removeItem() {
        throw new Error("denied");
      },
    },
  });
  tracker.start();
  tracker.track(handle("IN_PROGRESS"));
  await advance();
  assert.equal(tracker.getSnapshot().entries[17].status, "COMPLETED");
});

test("a fresh pair lookup replaces a paused local state with the completed server state", async () => {
  const { tracker, advance, timers } = setupTracker(async () => {
    throw Object.assign(new Error("missing"), { status: 404 });
  });
  tracker.start();
  tracker.track(handle("IN_PROGRESS"));
  await advance();
  assert.ok(tracker.getSnapshot().entries[17].error);
  tracker.track(handle("COMPLETED"), { targetUserId: 23 });
  assert.equal(tracker.getSnapshot().entries[17].status, "COMPLETED");
  assert.equal(tracker.getSnapshot().entries[17].error, null);
  assert.equal(tracker.getSnapshot().completions.length, 1);
  assert.equal(timers.size, 0);
});

test("duplicate registration while polling keeps the original request", async () => {
  const pending = deferred();
  let reads = 0;
  const { tracker, advance } = setupTracker(() => {
    reads += 1;
    return pending.promise;
  });
  tracker.start();
  tracker.track(handle("IN_PROGRESS"));
  await advance();
  tracker.track(handle("IN_PROGRESS"), { chatRoomId: 42 });
  await advance();
  assert.equal(reads, 1);
  tracker.stop();
});
