import { notifications, unreadCount } from "./api.js";

// The shared DB is authoritative regardless of which backend handles a request.
export function createNotificationPoller({
  fetchCount = unreadCount,
  fetchPage = notifications,
  onSnapshot,
  onNotification,
  onStatus = () => {},
  isCurrent = () => true,
  canPoll = () =>
    document.visibilityState !== "hidden" && navigator.onLine !== false,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  random = Math.random,
  interval = 5000,
  timeout = 15000,
}) {
  let stopped = false;
  let inFlight = false;
  let requested = false;
  let controller;
  let timer;
  let failures = 0;
  let revision = 0;
  let previous = null;
  let intervalMs = interval;
  const seen = new Set();

  const active = () => !stopped && isCurrent() && canPoll();
  const clearScheduled = () => {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
  };
  function schedule(delay) {
    clearScheduled();
    if (active()) timer = setTimer(() => void load(), delay);
  }

  async function load() {
    timer = undefined;
    if (!active() || inFlight) return;
    inFlight = true;
    requested = false;
    const version = revision;
    const current = new AbortController();
    controller = current;
    const watchdog = setTimer(() => current.abort(), timeout);
    try {
      const [total, page] = await Promise.all([
        fetchCount(current.signal),
        fetchPage("ALL", { signal: current.signal }),
      ]);
      if (!active() || current.signal.aborted || version !== revision) return;
      if (
        !Number.isSafeInteger(total?.count) ||
        total.count < 0 ||
        !Array.isArray(page?.items)
      )
        throw new Error("Invalid notification snapshot");

      const items = page.items.filter(
        (item) => item?.notificationId && typeof item.type === "string",
      );
      const snapshot = JSON.stringify([total.count, items]);
      const initial = previous === null;
      const incoming = items.filter(
        (item) => !seen.has(String(item.notificationId)),
      );
      // Baseline the first successful snapshot; old inbox items are not arrivals.
      for (const item of items) seen.add(String(item.notificationId));
      while (seen.size > 1000) seen.delete(seen.values().next().value);
      failures = 0;
      onStatus("connected");
      onSnapshot({
        count: total.count,
        initial,
        changed: previous !== snapshot,
      });
      previous = snapshot;
      // The API returns newest first. Present the newest banner last.
      if (!initial)
        for (const item of incoming.reverse()) {
          if (!active()) break;
          onNotification(item);
        }
    } catch (error) {
      if (!active() || (current.signal.aborted && version !== revision)) return;
      if (error?.status === 401 || error?.code === "AUTH_REQUIRED") {
        stopped = true;
        onStatus("unauthenticated");
      } else {
        failures += 1;
        onStatus("reconnecting");
      }
    } finally {
      clearTimer(watchdog);
      // Cancel the other request as well when either endpoint fails.
      current.abort();
      inFlight = false;
      if (controller === current) controller = undefined;
      const retryDelay = failures
        ? Math.min(intervalMs * 2 ** Math.min(failures, 3), 30000) *
          (0.9 + random() * 0.2)
        : intervalMs;
      schedule(requested ? 0 : retryDelay);
    }
  }

  return {
    setInterval(nextInterval) {
      if (stopped || !Number.isFinite(nextInterval) || nextInterval < 0) return;
      intervalMs = nextInterval;
      if (timer !== undefined) schedule(intervalMs);
    },
    refresh() {
      if (stopped || !isCurrent()) return;
      revision += 1;
      clearScheduled();
      if (!canPoll()) {
        requested = false;
        controller?.abort();
        return;
      }
      if (inFlight) requested = true;
      else schedule(0);
    },
    stop() {
      stopped = true;
      requested = false;
      clearScheduled();
      controller?.abort();
    },
  };
}
