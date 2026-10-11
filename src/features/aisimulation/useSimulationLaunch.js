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

  function cancelSimulation(targetMemberId) {
    const memberId = positiveId(targetMemberId);
    if (!memberId) return false;
    tracking.removeTarget(memberId);
    const cancelled = coordinatorRef.current.cancel(memberId);
    if (!cancelled) return false;
    setSimulationStartingFor((current) =>
      current === cancelled.memberId ? null : current,
    );
    return true;
  }

  async function startSimulation(targetMemberId, chatRoomId) {
    const memberId = positiveId(targetMemberId);
    if (!memberId) {
      toast("시뮬레이션할 상대 정보를 찾을 수 없어요.");
      return false;
    }
    const request = coordinatorRef.current.begin(memberId);
    if (!request) return false;
    const sourcePath = pathRef.current;
    const isCurrent = () =>
      coordinatorRef.current.isCurrent(request) &&
      pathRef.current === sourcePath;
    setSimulationStartingFor(memberId);
    try {
      const simulation = await requestSimulation(memberId, {
        getPair: aiSimulationPair,
        create: createAiSimulation,
        signal: request.controller.signal,
      });
      if (!isCurrent()) return false;
      tracking.track(simulation, {
        targetUserId: memberId,
        chatRoomId: positiveId(chatRoomId),
      });
      navigate(simulationPath(simulation.simulationId, chatRoomId));
      return true;
    } catch (error) {
      if (error?.name === "AbortError" || !isCurrent()) return false;
      toast(
        apiErrorMessage(
          error,
          "시뮬레이션 요청을 확인하지 못했어요. 연결 상태를 확인해주세요.",
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
