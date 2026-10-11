import { useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { createAiSimulation } from "./api.js";
import { createSimulationLaunchCoordinator } from "./launchCoordinator.js";

export function useSimulationLaunch({ navigate, toast }) {
  const [simulationStartingFor, setSimulationStartingFor] = useState(null);
  const coordinatorRef = useRef(null);
  coordinatorRef.current ||= createSimulationLaunchCoordinator();

  useEffect(
    () => () => {
      coordinatorRef.current.cancel();
    },
    [],
  );

  function cancelSimulation(targetMemberId) {
    const memberId = Number(targetMemberId);
    if (!Number.isSafeInteger(memberId) || memberId <= 0) return false;
    const cancelled = coordinatorRef.current.cancel(memberId);
    if (!cancelled) return false;
    setSimulationStartingFor((current) =>
      current === cancelled.memberId ? null : current,
    );
    return true;
  }

  async function startSimulation(targetMemberId, chatRoomId) {
    const memberId = Number(targetMemberId);
    if (!Number.isSafeInteger(memberId) || memberId <= 0) {
      toast("시뮬레이션할 상대 정보를 찾을 수 없어요.");
      return false;
    }
    const request = coordinatorRef.current.begin(memberId);
    if (!request) return false;

    setSimulationStartingFor(memberId);
    const roomId = Number(chatRoomId);
    const chatRoomQuery =
      Number.isSafeInteger(roomId) && roomId > 0 ? `?chatRoomId=${roomId}` : "";
    try {
      const simulation = await createAiSimulation(memberId, {
        signal: request.controller.signal,
      });
      if (!coordinatorRef.current.isCurrent(request)) return false;
      if (!simulation?.simulationId) {
        const error = new Error("SIMULATION_CREATE_FAILED");
        error.code = "SIMULATION_CREATE_FAILED";
        throw error;
      }
      navigate(`/ai/simulations/${simulation.simulationId}${chatRoomQuery}`);
      return true;
    } catch (error) {
      if (
        error?.name === "AbortError" ||
        !coordinatorRef.current.isCurrent(request)
      )
        return false;
      toast(
        apiErrorMessage(
          error,
          "시뮬레이션을 만들지 못했어요. 잠시 후 다시 시도해주세요.",
        ),
      );
      return false;
    } finally {
      if (coordinatorRef.current.finish(request)) {
        setSimulationStartingFor(null);
      }
    }
  }

  return { startSimulation, cancelSimulation, simulationStartingFor };
}
