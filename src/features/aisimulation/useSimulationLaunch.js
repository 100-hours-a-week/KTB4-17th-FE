import { useEffect, useRef, useState } from "react";
import {
  AUTH_SESSION_CLEARED_EVENT,
  getAuthSessionSubject,
} from "../../shared/api/authToken.js";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { aiSimulationPair, createAiSimulation } from "./api.js";
import { createSimulationLaunchCoordinator } from "./launchCoordinator.js";
import { positiveId, simulationPath } from "./model.js";
import { requestSimulation } from "./requestSimulation.js";

export function useSimulationLaunch({ navigate, toast, path, tracking }) {
  const [simulationStartingFor, setSimulationStartingFor] = useState(null);
  const coordinatorRef = useRef(null);
  coordinatorRef.current ||= createSimulationLaunchCoordinator({
    getOwner: getAuthSessionSubject,
  });
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    const cancel = () => {
      coordinatorRef.current.cancel();
      setSimulationStartingFor(null);
    };
    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, cancel);
    return () => {
      coordinatorRef.current.cancel();
      window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, cancel);
    };
  }, []);

  useEffect(() => {
    pathRef.current = path;
    coordinatorRef.current.cancel();
    setSimulationStartingFor(null);
  }, [path]);

  function cancelSimulation(targetUserId) {
    const userId = positiveId(targetUserId);
    if (!userId) return false;
    tracking.removeTarget(userId);
    const cancelled = coordinatorRef.current.cancel(userId);
    if (!cancelled) return false;
    setSimulationStartingFor((current) =>
      current === cancelled.userId ? null : current,
    );
    return true;
  }

  async function startSimulation(targetUserId, chatRoomId) {
    const userId = positiveId(targetUserId);
    if (!userId) {
      toast("시뮬레이션할 상대 정보를 찾을 수 없어요.");
      return false;
    }
    const request = coordinatorRef.current.begin(userId);
    if (!request) return false;
    const sourcePath = pathRef.current;
    const isCurrent = () =>
      coordinatorRef.current.isCurrent(request) &&
      pathRef.current === sourcePath;
    setSimulationStartingFor(userId);
    try {
      const simulation = await requestSimulation(userId, {
        getPair: aiSimulationPair,
        create: createAiSimulation,
        signal: request.controller.signal,
      });
      if (!isCurrent()) return false;
      tracking.track(simulation, {
        targetUserId: userId,
        chatRoomId: positiveId(chatRoomId),
      });
      navigate(simulationPath(simulation.simulationId, chatRoomId));
      return true;
    } catch (error) {
      if (error?.name === "AbortError" || !isCurrent()) return false;
      toast(
        apiErrorMessage(
          error,
          "시뮬레이션 요청을 확인하지 못했어요. 연결 상태를 확인해 주세요.",
        ),
      );
      return false;
    } finally {
      if (coordinatorRef.current.finish(request))
        setSimulationStartingFor(null);
    }
  }

  return { startSimulation, cancelSimulation, simulationStartingFor };
}
