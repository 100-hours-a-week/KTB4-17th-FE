// Share one transport across the app badge, room list, and open room.
export function createChatSocketSubscriptions(connectTransport) {
  const listeners = new Set();
  let disconnect;
  let status = "disconnected";
  let generation = 0;

  function emit(callback, value) {
    for (const listener of [...listeners]) {
      if (!listeners.has(listener)) continue;
      try {
        listener[callback]?.(value);
      } catch (error) {
        globalThis.reportError?.(error);
      }
    }
  }

  function clear() {
    generation += 1;
    disconnect?.();
    disconnect = null;
    status = "disconnected";
    listeners.clear();
  }

  function subscribe(callbacks) {
    const listener = { ...callbacks };
    listeners.add(listener);
    if (!disconnect) {
      const startedGeneration = ++generation;
      const forward = (callback, value) => {
        if (generation === startedGeneration) emit(callback, value);
      };
      disconnect = connectTransport({
        onMessage: (event) => forward("onMessage", event),
        onReadReceipt: (event) => forward("onReadReceipt", event),
        onStatus: (next) => {
          if (generation !== startedGeneration) return;
          status = next;
          emit("onStatus", next);
        },
        onConnected: () => forward("onConnected"),
      });
    } else {
      listener.onStatus?.(status);
      if (status === "connected") listener.onConnected?.();
    }
    return () => {
      listeners.delete(listener);
      if (!listeners.size) clear();
    };
  }

  return { subscribe, clear };
}
