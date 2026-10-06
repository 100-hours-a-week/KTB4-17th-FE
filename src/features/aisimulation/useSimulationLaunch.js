import { useRef, useState } from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { createAiSimulation } from "./api.js";

export function useSimulationLaunch({ navigate, toast }) {
  const [simulationStartingFor, setSimulationStartingFor] = useState(null);
  const simulationStartRef = useRef(false);

  async function startSimulation(targetMemberId, chatRoomId) {
    const memberId = Number(targetMemberId);
    if (!Number.isSafeInteger(memberId) || memberId <= 0) {
      toast("시뮬레이션할 상대 정보를 찾을 수 없어요.");
      return false;
    }
    if (simulationStartRef.current) return false;

    simulationStartRef.current = true;
    setSimulationStartingFor(memberId);
    const roomId = Number(chatRoomId);
    const chatRoomQuery =
      Number.isSafeInteger(roomId) && roomId > 0 ? `?chatRoomId=${roomId}` : "";
    try {
      const simulation = await createAiSimulation(memberId);
      if (!simulation?.simulationId) {
        const error = new Error("SIMULATION_CREATE_FAILED");
        error.code = "SIMULATION_CREATE_FAILED";
        throw error;
      }
      navigate(`/ai/simulations/${simulation.simulationId}${chatRoomQuery}`);
      return true;
    } catch (error) {
      toast(
        apiErrorMessage(
          error,
          "시뮬레이션을 만들지 못했어요. 잠시 후 다시 시도해주세요.",
        ),
      );
      return false;
    } finally {
      simulationStartRef.current = false;
      setSimulationStartingFor(null);
    }
  }

  return { startSimulation, simulationStartingFor };
}
