import { useEffect } from "react";
import { getAuthSessionSubject } from "../../shared/api/authToken.js";
import { useNotifications } from "./context.jsx";
import { readRoomMatchNotifications } from "./unread.js";

export function useRoomMatchRead(roomId, ready) {
  const { subject, matchRevision, refresh } = useNotifications();
  // biome-ignore lint/correctness/useExhaustiveDependencies: A newly delivered match or stream reconnection must rescan this room's match records.
  useEffect(() => {
    if (!ready || !subject) return undefined;
    const controller = new AbortController();
    let timer;
    let running = false;
    let retries = 0;
    async function sync() {
      if (
        running ||
        controller.signal.aborted ||
        document.visibilityState === "hidden" ||
        getAuthSessionSubject() !== subject
      )
        return;
      running = true;
      let changed = false;
      try {
        await readRoomMatchNotifications(roomId, {
          signal: controller.signal,
          isCurrent: () =>
            getAuthSessionSubject() === subject &&
            document.visibilityState !== "hidden",
          onRead: () => {
            changed = true;
          },
        });
        retries = 0;
      } catch (error) {
        if (
          error.name !== "AbortError" &&
          !controller.signal.aborted &&
          retries < 2
        ) {
          retries += 1;
          timer = window.setTimeout(() => {
            timer = null;
            void sync();
          }, retries * 2000);
        }
      } finally {
        running = false;
        if (changed && getAuthSessionSubject() === subject) refresh();
      }
    }
    const resume = () => {
      if (timer) window.clearTimeout(timer);
      timer = null;
      retries = 0;
      void sync();
    };
    void sync();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [roomId, ready, subject, matchRevision, refresh]);
}
