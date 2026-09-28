import { useRef, useState } from "react";
import { createAiSimulation } from "./api.js";

export function useSimulationLaunch({ navigate, toast }) {
  const [simulationStartingFor, setSimulationStartingFor] = useState(null);
  const simulationStartRef = useRef(false);

  async function startSimulation(targetMemberId) {
    const memberId = Number(targetMemberId);
    if (!Number.isSafeInteger(memberId) || memberId <= 0) {
      toast("시뮬레이션할 상대 정보를 찾을 수 없어요.");
      return false;
    }
    if (simulationStartRef.current) return false;

    simulationStartRef.current = true;
    setSimulationStartingFor(memberId);
    try {
      const simulation = await createAiSimulation(memberId);
      if (!simulation?.simulationId) {
        const error = new Error("SIMULATION_CREATE_FAILED");
        error.code = "SIMULATION_CREATE_FAILED";
        throw error;
      }
      navigate(`/ai/simulations/${simulation.simulationId}`);
      return true;
    } catch (error) {
      const messages = {
        ME_PERSONA_NOT_FOUND:
          "내 AI 성향 정보가 없어 시뮬레이션을 만들 수 없어요.",
        TARGET_PERSONA_NOT_FOUND:
          "상대의 AI 성향 정보가 없어 시뮬레이션을 만들 수 없어요.",
        SIMULATION_ALREADY_RUNNING:
          "시뮬레이션을 만들고 있어요. 잠시만 기다려주세요.",
        AI_SERVER_NOT_CONFIGURED: "AI 서버가 아직 연결되지 않았어요.",
        AI_SERVER_UNAVAILABLE:
          "AI 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.",
      };
      toast(messages[error?.code] || "시뮬레이션을 만들지 못했어요.");
      return false;
    } finally {
      simulationStartRef.current = false;
      setSimulationStartingFor(null);
    }
  }

  return { startSimulation, simulationStartingFor };
}
