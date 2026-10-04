export const CHAT_READ_UPDATED_EVENT = "pocket-signal:chat-read-updated";

export function formatUnreadCount(count) {
  if (!Number.isSafeInteger(count) || count <= 0) return "";
  return count > 999 ? "999+" : String(count);
}

// Fetch authoritative totals instead of incrementing on potentially repeated
// socket events. An event during a request invalidates its older snapshot.
export function createUnreadCountTracker({
  fetchCount,
  onCount,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  delay = 200,
}) {
  const controller = new AbortController();
  let stopped = false;
  let inFlight = false;
  let timer = null;
  let revision = 0;
  let retries = 0;

  function schedule(wait = delay) {
    if (!stopped && timer === null && !inFlight)
      timer = setTimer(() => void load(), wait);
  }

  async function load() {
    timer = null;
    if (stopped || inFlight) return;
    inFlight = true;
    const startedRevision = revision;
    let failed = false;
    try {
      const count = await fetchCount(controller.signal);
      if (!Number.isSafeInteger(count) || count < 0)
        throw new Error("Invalid total unread count");
      if (!stopped && startedRevision === revision) {
        retries = 0;
        onCount(count);
      }
    } catch {
      // Keep the last successful value on transient errors.
      failed = true;
    } finally {
      inFlight = false;
      if (startedRevision !== revision) schedule();
      else if (failed && retries < 2) {
        retries += 1;
        schedule(retries * 2000);
      }
    }
  }

  return {
    refresh() {
      if (stopped) return;
      revision += 1;
      retries = 0;
      schedule();
    },
    stop() {
      stopped = true;
      controller.abort();
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
