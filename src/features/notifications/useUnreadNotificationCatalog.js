import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthSessionSubject } from "../../shared/api/authToken.js";
import { loadUnreadNotifications } from "./unread.js";

export function useUnreadNotificationCatalog(subject, count) {
  const [snapshot, setSnapshot] = useState({
    subject: null,
    items: [],
    loading: false,
    complete: false,
  });
  const snapshotRef = useRef(snapshot);

  useEffect(() => {
    if (!subject || count == null) return undefined;
    const current = snapshotRef.current;
    const knownUnreadCount = current.items.filter((item) => !item.readAt).length;
    if (
      current.subject === subject &&
      current.complete &&
      knownUnreadCount === count
    )
      return undefined;

    const controller = new AbortController();
    const isCurrent = () =>
      !controller.signal.aborted && getAuthSessionSubject() === subject;
    const loadingSnapshot = {
      subject,
      items: current.subject === subject ? current.items : [],
      loading: count > 0,
      complete: false,
    };
    snapshotRef.current = loadingSnapshot;
    setSnapshot(loadingSnapshot);

    void loadUnreadNotifications(count, {
      signal: controller.signal,
      isCurrent,
    })
      .then(({ items, complete }) => {
        if (!complete || !isCurrent()) return;
        const unreadIds = new Set(items.map((item) => String(item.notificationId)));
        const readAt = new Date().toISOString();
        const previous = snapshotRef.current;
        const byId = new Map();
        if (previous.subject === subject) {
          for (const item of previous.items) {
            const id = String(item.notificationId);
            byId.set(
              id,
              unreadIds.has(id) || item.readAt
                ? item
                : { ...item, readAt },
            );
          }
        }
        for (const item of items) {
          const id = String(item.notificationId);
          const known = byId.get(id);
          byId.set(id, known?.readAt ? known : item);
        }
        const next = {
          subject,
          items: [...byId.values()],
          loading: false,
          complete: true,
        };
        snapshotRef.current = next;
        setSnapshot(next);
      })
      .catch((error) => {
        if (error.name !== "AbortError" && isCurrent()) {
          const previous = snapshotRef.current;
          const next = {
            subject,
            items: previous.subject === subject ? previous.items : [],
            loading: false,
            complete: false,
          };
          snapshotRef.current = next;
          setSnapshot(next);
        }
      });

    return () => controller.abort();
  }, [subject, count]);

  const markRead = useCallback(
    (item) => {
      if (!subject || getAuthSessionSubject() !== subject) return;
      const current = snapshotRef.current;
      const byId = new Map(
        current.subject === subject
          ? current.items.map((entry) => [String(entry.notificationId), entry])
          : [],
      );
      const id = String(item.notificationId);
      const known = byId.get(id);
      byId.set(id, {
        ...(known || item),
        readAt: known?.readAt || item.readAt || new Date().toISOString(),
      });
      const next = {
        subject,
        items: [...byId.values()],
        loading: current.subject === subject && current.loading,
        complete: current.subject === subject && current.complete,
      };
      snapshotRef.current = next;
      setSnapshot(next);
    },
    [subject],
  );

  return {
    items: snapshot.subject === subject ? snapshot.items : [],
    loading: snapshot.subject === subject && snapshot.loading,
    markRead,
  };
}
