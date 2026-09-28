import { apiRequest } from "../../shared/api/client.js";

export const createAiSimulation = (targetMemberId) =>
  apiRequest("/api/v1/ai-simulations", {
    method: "POST",
    body: { targetMemberId },
  });

export const aiSimulation = (simulationId) =>
  apiRequest(`/api/v1/ai-simulations/${simulationId}`);

export const aiSimulationReport = (simulationId) =>
  apiRequest(`/api/v1/ai-simulations/${simulationId}/report`);
