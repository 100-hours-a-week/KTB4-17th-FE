import { apiRequest } from "../../shared/api/client.js";

export const attemptAiSimulation = (simulationId, { signal } = {}) =>
  apiRequest(`/api/v1/ai-simulations/${simulationId}/attempts`, {
    method: "POST",
    signal,
  });

export const createAiSimulation = (targetUserId, { signal } = {}) =>
  apiRequest("/api/v1/ai-simulations", {
    method: "POST",
    body: { targetUserId },
    signal,
  });

export const aiSimulationPair = (targetUserId, { signal } = {}) =>
  apiRequest(`/api/v1/ai-simulations/targets/${targetUserId}`, {
    signal,
    cache: "no-store",
  });

export const aiSimulationState = (simulationId, { signal } = {}) =>
  apiRequest(`/api/v1/ai-simulations/${simulationId}/status`, {
    signal,
    cache: "no-store",
  });

export const aiSimulation = (simulationId, { signal } = {}) =>
  apiRequest(`/api/v1/ai-simulations/${simulationId}`, {
    signal,
    cache: "no-store",
  });
