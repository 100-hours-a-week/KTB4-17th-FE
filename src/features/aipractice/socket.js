import {
  AUTH_EXPIRED_EVENT,
  clearAccessToken,
  getAccessToken,
} from "../../shared/api/authToken.js";

const FRAME_END = "\0";
const SUBSCRIPTION_ID = "ai-practice-updates";

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

export function connectAiPracticeSocket({ onMessage, onStatus = () => {} }) {
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
      connect();
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
        sendFrame("SUBSCRIBE", {
          id: SUBSCRIPTION_ID,
          destination: "/user/queue/ai-practice",
          ack: "auto",
        });
        heartbeatTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send("\n");
        }, 10000);
      } else if (frame.command === "MESSAGE") {
        try {
          onMessage(JSON.parse(frame.body));
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

  function connect() {
    if (stopped) return;
    const accessToken = getAccessToken();
    if (!accessToken) {
      failAuthentication();
      return;
    }

    connected = false;
    buffer = "";
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(
      protocol + "//" + window.location.host + "/ws/chat",
    );
    socket.onopen = () => {
      sendFrame("CONNECT", {
        "accept-version": "1.2",
        host: window.location.host,
        "heart-beat": "10000,10000",
        Authorization: "Bearer " + accessToken,
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
  connect();
  return () => {
    stopped = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    if (connected) {
      sendFrame("UNSUBSCRIBE", { id: SUBSCRIPTION_ID });
      sendFrame("DISCONNECT", { receipt: "ai-practice-disconnect" });
    }
    socket?.close();
  };
}
