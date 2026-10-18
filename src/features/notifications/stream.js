import { openNotificationStream } from "./api.js";

// An SSE event can span arbitrary UTF-8 network chunks and several data lines.
export function createSseParser(onEvent) {
  let buffer = "";
  let event = "message";
  let data = [];
  return (chunk) => {
    buffer += chunk;
    if (buffer.length > 1048576) throw new Error("SSE frame too large");
    while (true) {
      const match = /\r\n|\n|\r/.exec(buffer);
      if (!match) break;
      if (match[0] === "\r" && match.index === buffer.length - 1) break;
      const line = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      if (!line) {
        if (data.length) onEvent({ event, data: data.join("\n") });
        event = "message";
        data = [];
      } else if (!line.startsWith(":")) {
        const colon = line.indexOf(":");
        const field = colon < 0 ? line : line.slice(0, colon);
        const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "event") event = value;
        if (field === "data") data.push(value);
      }
    }
  };
}

export function connectNotificationStream({
  onNotification,
  onConnected,
  onStatus = () => {},
  openStream = openNotificationStream,
}) {
  let stopped = false;
  let controller;
  let retryTimer;
  let watchdog;
  let delay = 1000;

  async function connect() {
    if (stopped) return;
    controller = new AbortController();
    const current = controller;
    let reader;
    const touch = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => current.abort(), 75000);
    };
    onStatus("connecting");
    touch();
    try {
      const response = await openStream(current.signal);
      if (stopped || current.signal.aborted) return;
      if (!response.headers.get("content-type")?.includes("text/event-stream"))
        throw new Error("Invalid notification stream");
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parse = createSseParser(({ event, data }) => {
        if (event === "connected") {
          delay = 1000;
          onStatus("connected");
          onConnected();
        } else if (event === "notification") {
          try {
            const item = JSON.parse(data);
            if (item?.notificationId && typeof item.type === "string")
              onNotification(item);
          } catch {
            // A malformed event must not terminate delivery of later events.
          }
        }
      });
      while (!stopped && !current.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        touch();
        parse(decoder.decode(value, { stream: true }));
      }
    } catch (error) {
      if (error?.status === 401 || error?.code === "AUTH_REQUIRED")
        stopped = true;
    } finally {
      current.abort();
      await reader?.cancel().catch(() => {});
      reader?.releaseLock();
      clearTimeout(watchdog);
      if (!stopped) {
        onStatus("reconnecting");
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void connect();
        }, delay);
        delay = Math.min(delay * 2, 30000);
      }
    }
  }

  void connect();
  return () => {
    stopped = true;
    controller?.abort();
    clearTimeout(retryTimer);
    clearTimeout(watchdog);
  };
}
