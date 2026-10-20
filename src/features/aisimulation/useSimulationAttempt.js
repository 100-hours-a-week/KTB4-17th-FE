import { useEffect, useRef, useState } from "react";
import {
  AUTH_SESSION_CLEARED_EVENT,
  getAuthSessionSubject,
} from "../../shared/api/authToken.js";
import { attemptAiSimulation } from "./api.js";
import { useSimulationTrackingContext } from "./context.jsx";
import { createSimulationLaunchCoordinator } from "./launchCoordinator.js";
import { positiveId, simulationPath } from "./model.js";
import { requestSimulationAttempt } from "./requestSimulationAttempt.js";

export function useSimulationAttempt({ simulationId, chatRoomId, navigate }) {
  const { manager, snapshot, subject } = useSimulationTrackingContext();
  const id = positiveId(simulationId);
  const idRef = useRef(id);
  idRef.current = id;
  const coordinatorRef = useRef(null);
  coordinatorRef.current ||= createSimulationLaunchCoordinator({
    getOwner: getAuthSessionSubject,
  });
  const [requestState, setRequestState] = useState({
    id,
    subject,
    attempting: false,
    error: null,
  });

  useEffect(() => {
    const cancel = () => {
      coordinatorRef.current.cancel();
      setRequestState({ id, subject, attempting: false, error: null });
    };
    cancel();
    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, cancel);
    return () => {
      coordinatorRef.current.cancel();
      window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, cancel);
    };
  }, [id, subject]);

  async function retry() {
    if (!id || !subject) return false;
    const request = coordinatorRef.current.begin(id);
    if (!request) return false;
    const isCurrent = () =>
      coordinatorRef.current.isCurrent(request) && idRef.current === id;
    setRequestState({ id, subject, attempting: true, error: null });
    try {
      const { handle, submissionRejected } = await requestSimulationAttempt(
        id,
        {
          attempt: attemptAiSimulation,
          signal: request.controller.signal,
        },
      );
      if (!isCurrent()) return false;
      manager.track(handle, {
        targetUserId: positiveId(snapshot.entries[id]?.targetUserId),
        chatRoomId: positiveId(chatRoomId),
        submissionRejected,
      });
      navigate(simulationPath(handle.simulationId, chatRoomId), {
        replace: true,
      });
      return true;
    } catch (error) {
      if (error?.name === "AbortError" || !isCurrent()) return false;
      setRequestState({ id, subject, attempting: false, error });
      return false;
    } finally {
      if (coordinatorRef.current.finish(request))
        setRequestState((current) => ({ ...current, attempting: false }));
    }
  }

  return {
    retry,
    attempting:
      requestState.id === id &&
      requestState.subject === subject &&
      requestState.attempting,
    attemptError:
      requestState.id === id && requestState.subject === subject
        ? requestState.error
        : null,
    submissionRejected: Boolean(snapshot.entries[id]?.submissionRejected),
  };
}
