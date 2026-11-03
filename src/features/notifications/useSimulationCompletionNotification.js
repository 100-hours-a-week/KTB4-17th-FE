import { useEffect, useState } from "react";
import { getAuthSessionSubject } from "../../shared/api/authToken.js";
import { aiSimulation } from "../aisimulation/api.js";
import { getUserProfile } from "../profile/api.js";
import { loadSimulationCompletionNotification } from "./simulationNotification.js";

export function useSimulationCompletionNotification(item, subject) {
  const simulationId = item?.targetId == null ? null : String(item.targetId);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(null);
  const key = `${subject || ""}:${item?.notificationId || ""}:${simulationId || ""}:${attempt}`;
  const isCompletion = item?.type === "AI_SIMULATION_REPORT_COMPLETED";

  useEffect(() => {
    if (!isCompletion || !subject) return undefined;
    const controller = new AbortController();
    let active = true;
    const isCurrent = () =>
      active &&
      !controller.signal.aborted &&
      getAuthSessionSubject() === subject;

    loadSimulationCompletionNotification({ targetId: simulationId }, subject, {
      loadSimulation: aiSimulation,
      loadProfile: getUserProfile,
      signal: controller.signal,
    }).then(
      (value) => {
        if (isCurrent()) setLoaded({ key, status: "ready", value });
      },
      (error) => {
        if (!isCurrent() || error?.name === "AbortError") return;
        setLoaded({
          key,
          status:
            error?.code === "SIMULATION_RESULT_NOT_READY" ? "pending" : "error",
          error,
        });
      },
    );

    return () => {
      active = false;
      controller.abort();
    };
  }, [isCompletion, key, simulationId, subject]);

  const current = loaded?.key === key ? loaded : null;
  return {
    status: !isCompletion ? "idle" : current?.status || "loading",
    role: current?.value?.role || null,
    requesterId: current?.value?.requesterId || null,
    profile: current?.value?.profile || null,
    error: current?.error || null,
    retry: () => setAttempt((value) => value + 1),
  };
}
