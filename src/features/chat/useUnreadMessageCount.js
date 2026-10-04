import { useEffect, useRef, useState } from "react";
import {
  AUTH_SESSION_CLEARED_EVENT,
  getAuthSessionSubject,
} from "../../shared/api/authToken.js";
import { rooms } from "./api.js";
import { connectChatSocket } from "./socket.js";
import {
  CHAT_READ_UPDATED_EVENT,
  createUnreadCountTracker,
} from "./unreadCount.js";

export function useUnreadMessageCount({ enabled, path }) {
  const subject = enabled ? getAuthSessionSubject() : null;
  const [snapshot, setSnapshot] = useState(null);
  const tracker = useRef(null);

  useEffect(() => {
    if (!enabled || !subject) return undefined;
    let active = true;
    const current = createUnreadCountTracker({
      fetchCount: async (signal) => {
        const page = await rooms({ size: 1, signal });
        return page.totalUnreadCount;
      },
      onCount: (count) => {
        if (active && getAuthSessionSubject() === subject)
          setSnapshot({ subject, count });
      },
    });
    tracker.current = current;
    const refresh = () => {
      if (document.visibilityState !== "hidden" && navigator.onLine !== false)
        current.refresh();
    };
    const disconnect = connectChatSocket({
      onMessage: refresh,
      onReadReceipt: refresh,
      onConnected: refresh,
    });
    const clear = () => {
      active = false;
      current.stop();
      disconnect();
      setSnapshot(null);
    };
    window.addEventListener(CHAT_READ_UPDATED_EVENT, refresh);
    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, clear);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    // The existing read-receipt queue reports the other participant's reads.
    // Resync visible tabs for reads made by this user on another device.
    const interval = window.setInterval(refresh, 30000);
    refresh();
    return () => {
      active = false;
      current.stop();
      disconnect();
      if (tracker.current === current) tracker.current = null;
      window.clearInterval(interval);
      window.removeEventListener(CHAT_READ_UPDATED_EVENT, refresh);
      window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, clear);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled, subject]);

  // Returning from a room or leaving a match must refresh the nav total too.
  useEffect(() => {
    if (enabled && path) tracker.current?.refresh();
  }, [enabled, path]);

  return enabled && subject && snapshot?.subject === subject
    ? snapshot.count
    : null;
}
