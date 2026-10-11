import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  AUTH_SESSION_CLEARED_EVENT,
  getAuthSessionSubject,
} from "../../shared/api/authToken.js";
import { aiSimulationState } from "./api.js";
import { createSimulationTracker } from "./polling.js";

export function useSimulationTracking({ enabled }) {
  const subject = enabled ? getAuthSessionSubject() : null;
  const manager = useMemo(() => {
    let storage;
    try {
      storage = window.sessionStorage;
    } catch {}
    return createSimulationTracker({
      fetchState: aiSimulationState,
      storage,
      owner: subject,
      isCurrentOwner: () =>
        Boolean(subject) && getAuthSessionSubject() === subject,
    });
  }, [subject]);
  const snapshot = useSyncExternalStore(manager.subscribe, manager.getSnapshot);

  useEffect(() => {
    const clear = () => manager.clear();
    const updateActivity = () => {
      if (!enabled || !subject) return;
      if (document.visibilityState === "hidden" || navigator.onLine === false)
        manager.stop();
      else manager.start();
    };
    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, clear);
    window.addEventListener("online", updateActivity);
    window.addEventListener("offline", updateActivity);
    window.addEventListener("pageshow", updateActivity);
    document.addEventListener("visibilitychange", updateActivity);
    updateActivity();
    return () => {
      manager.stop();
      window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, clear);
      window.removeEventListener("online", updateActivity);
      window.removeEventListener("offline", updateActivity);
      window.removeEventListener("pageshow", updateActivity);
      document.removeEventListener("visibilitychange", updateActivity);
    };
  }, [enabled, subject, manager]);

  return { manager, snapshot, subject };
}
