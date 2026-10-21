import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTH_SESSION_CLEARED_EVENT,
  getAuthSessionSubject,
} from "../../shared/api/authToken.js";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { CHAT_READ_UPDATED_EVENT } from "../chat/unreadCount.js";
import * as api from "./api.js";
import { NotificationContext } from "./context.jsx";
import { isCurrentChatNotification, notificationDestination } from "./model.js";
import { NotificationToast } from "./NotificationToast.jsx";
import { createNotificationPoller } from "./polling.js";
import { createNotificationSound } from "./sound.js";

export function NotificationProvider({
  enabled,
  path,
  search,
  navigate,
  toast,
  blocked,
  children,
}) {
  const subject = enabled ? getAuthSessionSubject() : null;
  const [snapshot, setSnapshot] = useState(null);
  const [revision, setRevision] = useState(0);
  const [matchRevision, setMatchRevision] = useState(0);
  const [recent, setRecent] = useState(null);
  const [connection, setConnection] = useState("connecting");
  const tracker = useRef(null);
  const location = useRef({ path, search });
  location.current = { path, search };
  const returnPath = useRef("/home");

  const refresh = useCallback(() => {
    tracker.current?.refresh();
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !subject) return undefined;
    returnPath.current = "/home";
    let active = true;
    const isCurrent = () => active && getAuthSessionSubject() === subject;
    const sound = createNotificationSound();
    setConnection("connecting");
    const current = createNotificationPoller({
      isCurrent,
      onSnapshot: ({ count, initial, changed }) => {
        if (!isCurrent()) return;
        setSnapshot({ subject, count });
        if (changed) setRevision((value) => value + 1);
        if (initial) setMatchRevision((value) => value + 1);
      },
      onStatus: (status) => {
        if (isCurrent()) setConnection(status);
      },
      onNotification: (item) => {
        if (!isCurrent()) return;
        if (item.type === "MATCH") setMatchRevision((value) => value + 1);
        const inCurrentRoom =
          document.visibilityState !== "hidden" &&
          (isCurrentChatNotification(item, location.current.path) ||
            (item.type === "MATCH" &&
              item.targetType === "CHAT_ROOM" &&
              location.current.path === `/chats/${item.targetId}`));
        if (!item.readAt && !inCurrentRoom) sound.play();
        if (
          !item.readAt &&
          document.visibilityState !== "hidden" &&
          location.current.path !== "/notifications" &&
          !inCurrentRoom
        )
          setRecent({ subject, item });
      },
    });
    tracker.current = current;
    const synchronize = () => {
      if (isCurrent()) current.refresh();
    };
    const clear = () => {
      active = false;
      current.stop();
      sound.stop();
      setSnapshot(null);
      setRecent(null);
    };
    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, clear);
    window.addEventListener(CHAT_READ_UPDATED_EVENT, synchronize);
    window.addEventListener("focus", synchronize);
    window.addEventListener("online", synchronize);
    window.addEventListener("offline", synchronize);
    window.addEventListener("pageshow", synchronize);
    document.addEventListener("visibilitychange", synchronize);
    synchronize();
    return () => {
      active = false;
      current.stop();
      sound.stop();
      if (tracker.current === current) tracker.current = null;
      window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, clear);
      window.removeEventListener(CHAT_READ_UPDATED_EVENT, synchronize);
      window.removeEventListener("focus", synchronize);
      window.removeEventListener("online", synchronize);
      window.removeEventListener("offline", synchronize);
      window.removeEventListener("pageshow", synchronize);
      document.removeEventListener("visibilitychange", synchronize);
    };
  }, [enabled, subject]);

  useEffect(() => {
    if (enabled) refresh();
    setRecent((value) =>
      value &&
      (path === "/notifications" || isCurrentChatNotification(value.item, path))
        ? null
        : value,
    );
  }, [enabled, path, refresh]);

  const markRead = useCallback(
    async (item) => {
      if (!subject || getAuthSessionSubject() !== subject) return;
      if (!item.readAt) await api.markAsRead(item.notificationId);
      if (getAuthSessionSubject() === subject) refresh();
    },
    [subject, refresh],
  );

  const remove = useCallback(
    async (item) => {
      if (!subject || getAuthSessionSubject() !== subject) return;
      await api.deleteNotification(item.notificationId);
      if (getAuthSessionSubject() === subject) refresh();
    },
    [subject, refresh],
  );

  async function open(item) {
    try {
      await markRead(item);
      if (getAuthSessionSubject() !== subject) return;
      setRecent(null);
      if (path !== "/notifications") returnPath.current = `${path}${search}`;
      const destination = notificationDestination(item);
      if (destination) navigate(destination);
      else navigate("/notifications");
    } catch (error) {
      toast(
        apiErrorMessage(error, "알림을 열지 못했어요. 다시 시도해 주세요."),
      );
    }
  }

  const value = {
    enabled: Boolean(enabled && subject),
    subject,
    path,
    count: snapshot?.subject === subject ? snapshot.count : null,
    revision,
    matchRevision,
    connection,
    refresh,
    markRead,
    remove,
    open,
    openInbox: () => {
      if (path !== "/notifications") returnPath.current = `${path}${search}`;
      setRecent(null);
      navigate("/notifications");
    },
    returnTo: returnPath.current,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {enabled && recent?.subject === subject && (
        <NotificationToast
          key={recent.item.notificationId}
          item={recent.item}
          onOpen={open}
          onDismiss={() => setRecent(null)}
          blocked={blocked}
        />
      )}
    </NotificationContext.Provider>
  );
}
