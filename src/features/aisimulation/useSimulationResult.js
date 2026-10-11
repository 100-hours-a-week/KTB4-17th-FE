import { useEffect, useState } from "react";
import { getAuthSessionSubject } from "../../shared/api/authToken.js";
import { aiSimulation } from "./api.js";
import { useSimulationTrackingContext } from "./context.jsx";
import { positiveId, simulationError, simulationForViewer } from "./model.js";

export function useSimulationResult(simulationId, chatRoomId) {
  const { manager, snapshot, subject } = useSimulationTrackingContext();
  const id = positiveId(simulationId);
  const entry = snapshot.entries[id];
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${subject}:${id}:${attempt}`;
  const status = entry?.status;

  useEffect(() => {
    if (id && subject)
      manager.ensure(id, { chatRoomId: positiveId(chatRoomId) });
  }, [manager, id, subject, chatRoomId]);

  useEffect(() => {
    if (!id || !subject || status !== "COMPLETED") return undefined;
    const controller = new AbortController();
    let active = true;
    const current = () => active && getAuthSessionSubject() === subject;
    aiSimulation(id, { signal: controller.signal })
      .then((detail) => {
        if (!current()) return;
        if (positiveId(detail?.simulationId) !== id)
          throw simulationError("SIMULATION_RESPONSE_INVALID");
        setResult({
          key,
          simulation: simulationForViewer(detail, subject),
          error: null,
        });
      })
      .catch((error) => {
        if (!current() || error?.name === "AbortError") return;
        if (error?.code === "SIMULATION_RESULT_NOT_READY") manager.refresh(id);
        setResult({ key, simulation: null, error });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, subject, status, key, manager]);

  function refresh() {
    setAttempt((current) => current + 1);
    if (id) manager.refresh(id);
  }

  return {
    status,
    simulation: result?.key === key ? result.simulation : null,
    error: !id
      ? simulationError("SIMULATION_NOT_FOUND", 404)
      : entry?.error || (result?.key === key ? result.error : null),
    refresh,
  };
}
