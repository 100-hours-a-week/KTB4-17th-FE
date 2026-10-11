import { positiveId, simulationError, validateHandle } from "./model.js";

export const POLL_INTERVAL_MS = 3000;
export const MAX_POLLING_MS = 16 * 60 * 1000;
export const STATUS_TIMEOUT_MS = 10000;

export function isRetryableSimulationRead(error) {
  return (
    error?.code !== "SIMULATION_RESPONSE_INVALID" &&
    (!error?.status ||
      error.status === 408 ||
      error.status === 429 ||
      error.status >= 500)
  );
}

export function boundedRequest(
  request,
  { signal, setTimer = setTimeout, clearTimer = clearTimeout },
) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimer(timer);
      signal.removeEventListener("abort", abort);
      callback(value);
    };
    const abort = () =>
      finish(reject, new DOMException("Aborted", "AbortError"));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    timer = setTimer(
      () => finish(reject, simulationError("SIMULATION_STATUS_TIMEOUT", 408)),
      STATUS_TIMEOUT_MS,
    );
    Promise.resolve()
      .then(() => {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        return request();
      })
      .then(
        (value) => finish(resolve, value),
        (error) => finish(reject, error),
      );
  });
}

export function createSimulationTracker({
  fetchState,
  storage,
  owner,
  isCurrentOwner = () => true,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  now = Date.now,
}) {
  const key = owner ? `pocket-signal:simulations:${owner}` : null;
  const records = new Map();
  const listeners = new Set();
  let running = false;
  let restoring = true;
  let snapshot = { entries: {}, completions: [] };

  function persist() {
    if (!key || restoring) return;
    try {
      const pending = [...records.values()]
        .filter(
          (record) =>
            record.seenProgress && record.state.status === "IN_PROGRESS",
        )
        .map((record) => ({ ...record.state, error: undefined }));
      if (pending.length) storage?.setItem(key, JSON.stringify(pending));
      else storage?.removeItem(key);
    } catch {}
  }

  function publish() {
    snapshot = {
      ...snapshot,
      entries: Object.fromEntries(
        [...records].map(([id, record]) => [id, record.state]),
      ),
    };
    persist();
    for (const listener of listeners) listener();
  }

  function invalidate(record) {
    record.revision += 1;
    if (record.timer != null) clearTimer(record.timer);
    record.timer = null;
    record.controller?.abort();
    record.controller = null;
    record.inFlight = false;
  }

  function schedule(record, delay) {
    if (
      !running ||
      record.inFlight ||
      record.timer != null ||
      record.state.error
    )
      return;
    record.timer = setTimer(() => {
      record.timer = null;
      void load(record);
    }, delay);
  }

  async function load(record) {
    if (!running || record.inFlight || !isCurrentOwner()) return;
    if (now() - record.startedAt >= MAX_POLLING_MS) {
      record.state = {
        ...record.state,
        error: simulationError("SIMULATION_POLLING_PAUSED"),
      };
      publish();
      return;
    }
    const revision = record.revision;
    const controller = new AbortController();
    record.controller = controller;
    record.inFlight = true;
    const current = () =>
      running &&
      isCurrentOwner() &&
      record.revision === revision &&
      records.get(record.state.simulationId) === record;
    let delay = null;
    try {
      const state = validateHandle(
        await boundedRequest(
          () =>
            fetchState(record.state.simulationId, {
              signal: controller.signal,
            }),
          { signal: controller.signal, setTimer, clearTimer },
        ),
        record.state.simulationId,
      );
      if (!current()) return;
      record.retries = 0;
      record.state = { ...record.state, ...state, error: null };
      if (state.status === "IN_PROGRESS") {
        record.seenProgress = true;
        delay = POLL_INTERVAL_MS;
      } else if (state.status === "COMPLETED" && record.seenProgress) {
        record.seenProgress = false;
        snapshot = {
          ...snapshot,
          completions: [...snapshot.completions, { ...record.state }],
        };
      }
      publish();
    } catch (error) {
      if (!current() || error?.name === "AbortError") return;
      if (isRetryableSimulationRead(error) && record.retries < 2) {
        record.retries += 1;
        delay = record.retries * 6000;
      } else {
        record.state = { ...record.state, error };
        publish();
      }
    } finally {
      controller.abort();
      if (record.revision === revision) {
        record.inFlight = false;
        record.controller = null;
        if (delay != null) schedule(record, delay);
      }
    }
  }

  function add(simulationId, metadata = {}, status = null) {
    const id = positiveId(simulationId);
    if (!id) return null;
    let record = records.get(id);
    if (record) {
      record.state = { ...record.state, ...metadata, simulationId: id };
      publish();
      return record;
    }
    record = {
      state: { ...metadata, simulationId: id, status, error: null },
      seenProgress: status === "IN_PROGRESS",
      startedAt: now(),
      retries: 0,
      revision: 0,
      controller: null,
      timer: null,
      inFlight: false,
    };
    records.set(id, record);
    publish();
    if (!status || status === "IN_PROGRESS") schedule(record, 0);
    return record;
  }

  if (key) {
    try {
      const saved = JSON.parse(storage?.getItem(key) || "[]");
      if (Array.isArray(saved)) {
        for (const item of saved.slice(0, 100)) {
          if (positiveId(item.simulationId) && item.status === "IN_PROGRESS") {
            add(
              item.simulationId,
              {
                targetUserId: positiveId(item.targetUserId),
                chatRoomId: positiveId(item.chatRoomId),
              },
              "IN_PROGRESS",
            );
          }
        }
      }
    } catch {}
  }

  restoring = false;

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      running = true;
      for (const record of records.values()) {
        if (!record.state.status || record.state.status === "IN_PROGRESS")
          schedule(record, 0);
      }
    },
    stop() {
      running = false;
      for (const record of records.values()) invalidate(record);
    },
    clear() {
      this.stop();
      records.clear();
      snapshot = { entries: {}, completions: [] };
      publish();
    },
    ensure(simulationId, metadata) {
      add(simulationId, metadata);
    },
    track(handle, metadata) {
      const value = validateHandle(handle);
      const existing = records.get(value.simulationId);
      const record = add(value.simulationId, metadata, value.status);
      if (
        existing &&
        (record.state.status !== value.status || record.state.error)
      ) {
        invalidate(record);
        record.retries = 0;
        record.startedAt = now();
        record.state = { ...record.state, ...value, error: null };
        if (value.status === "COMPLETED" && record.seenProgress) {
          record.seenProgress = false;
          snapshot = {
            ...snapshot,
            completions: [...snapshot.completions, { ...record.state }],
          };
        } else if (value.status === "IN_PROGRESS") record.seenProgress = true;
        publish();
        if (value.status === "IN_PROGRESS") schedule(record, 0);
      }
    },
    refresh(simulationId) {
      const record = records.get(positiveId(simulationId));
      if (!record) return;
      invalidate(record);
      record.retries = 0;
      record.startedAt = now();
      record.state = { ...record.state, error: null };
      publish();
      schedule(record, 0);
    },
    removeTarget(targetUserId) {
      for (const [id, record] of records) {
        if (record.state.targetUserId === positiveId(targetUserId)) {
          invalidate(record);
          records.delete(id);
          snapshot = {
            ...snapshot,
            completions: snapshot.completions.filter(
              (item) => item.simulationId !== id,
            ),
          };
        }
      }
      publish();
    },
    acknowledge(simulationId) {
      snapshot = {
        ...snapshot,
        completions: snapshot.completions.filter(
          (item) => item.simulationId !== simulationId,
        ),
      };
      publish();
    },
  };
}
