import {
  AUTH_EXPIRED_EVENT,
  clearAccessToken,
  getAccessToken,
} from "../../shared/api/authToken.js";
import { refreshAuthSession } from "../../shared/api/client.js";

const FRAME_END = "\0";
const SUBSCRIPTIONS = [
  {
    id: "chat-messages",
    destination: "/user/queue/chat-messages",
    onMessage: "message",
  },
  {
    id: "chat-read-receipts",
    destination: "/user/queue/chat-read-receipts",
    onMessage: "readReceipt",
  },
];

function unescapeHeader(value) {
  return value
    .replace(/\\c/g, ":")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\\\/g, "\\");
}

function parseFrame(rawFrame) {
  const content = rawFrame.replace(/^\n+/, "").replace(/\r/g, "");
  if (!content) return null;
  const separator = content.indexOf("\n\n");
  if (separator < 0) return null;
  const lines = content.slice(0, separator).split("\n");
  const command = lines.shift();
  if (!command) return null;
  const headers = {};
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = unescapeHeader(line.slice(0, colon));
    if (!(key in headers)) headers[key] = unescapeHeader(line.slice(colon + 1));
  }
  return { command, headers, body: content.slice(separator + 2) };
}

export function connectChatSocket({
  onMessage,
  onReadReceipt = () => {},
  onStatus = () => {},
  onConnected = () => {},
}) {
  let socket;
  let stopped = false;
  let buffer = "";
  let reconnectTimer;
  let heartbeatTimer;
  let reconnectDelay = 1000;
  let connected = false;

  function sendFrame(command, headers = {}, body = "") {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const lines = [
      command,
      ...Object.entries(headers).map(([key, value]) => `${key}:${value}`),
    ];
    socket.send(`${lines.join("\n")}\n\n${body}${FRAME_END}`);
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    onStatus("reconnecting");
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 15000);
  }

  function failAuthentication() {
    if (stopped) return;
    stopped = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    clearAccessToken();
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    onStatus("unauthenticated");
    socket?.close();
  }

  function processFrames(payload) {
    buffer += payload;
    const frames = buffer.split(FRAME_END);
    buffer = frames.pop() || "";
    for (const rawFrame of frames) {
      const frame = parseFrame(rawFrame);
      if (!frame) continue;
      if (frame.command === "CONNECTED") {
        connected = true;
        reconnectDelay = 1000;
        onStatus("connected");
        for (const subscription of SUBSCRIPTIONS) {
          sendFrame("SUBSCRIBE", {
            id: subscription.id,
            destination: subscription.destination,
            ack: "auto",
          });
        }
        heartbeatTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send("\n");
        }, 10000);
        onConnected();
      } else if (frame.command === "MESSAGE") {
        try {
          const subscription =
            SUBSCRIPTIONS.find(
              (candidate) =>
                candidate.id === frame.headers.subscription ||
                candidate.destination === frame.headers.destination,
            ) || (SUBSCRIPTIONS.length === 1 ? SUBSCRIPTIONS[0] : null);
          if (subscription?.onMessage === "message")
            onMessage?.(JSON.parse(frame.body));
          else if (subscription?.onMessage === "readReceipt")
            onReadReceipt(JSON.parse(frame.body));
        } catch {
          onStatus("error");
        }
      } else if (frame.command === "ERROR") {
        const message = frame.body.toLowerCase();
        if (
          message.includes("authorization") ||
          message.includes("bearer") ||
          message.includes("token")
        ) {
          failAuthentication();
        } else {
          onStatus("error");
        }
      }
    }
  }

  async function connect() {
    if (stopped) return;
    try {
      await refreshAuthSession();
    } catch (error) {
      if (stopped) return;
      if (error?.status === 401 || error?.code === "AUTH_REQUIRED") {
        failAuthentication();
      } else {
        onStatus("error");
        scheduleReconnect();
      }
      return;
    }
    if (stopped) return;

    connected = false;
    buffer = "";
    const socketUrl = new URL(
      "/ws/chat",
      import.meta.env.VITE_API_BASE_URL || window.location.origin,
    );
    socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";

    const accessToken = getAccessToken();
    if (!accessToken) {
      failAuthentication();
      return;
    }

    socket = new WebSocket(socketUrl.toString());
    socket.onopen = () => {
      sendFrame("CONNECT", {
        Authorization: `Bearer ${accessToken}`,
        "accept-version": "1.2",
        host: socketUrl.host,
        "heart-beat": "10000,10000",
      });
    };
    socket.onmessage = async (event) => {
      const payload =
        typeof event.data === "string" ? event.data : await event.data.text();
      processFrames(payload);
    };
    socket.onerror = () => onStatus("error");
    socket.onclose = () => {
      connected = false;
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      scheduleReconnect();
    };
  }

  onStatus("connecting");
  void connect();
  return () => {
    stopped = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    if (connected) {
      for (const subscription of SUBSCRIPTIONS) {
        sendFrame("UNSUBSCRIBE", { id: subscription.id });
      }
      sendFrame("DISCONNECT", { receipt: "chat-disconnect" });
    }
    socket?.close();
  };
}
