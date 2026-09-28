import { apiRequest } from "../../shared/api/client.js";

export const personaStart = () =>
  apiRequest("/api/v1/persona/onboarding/start", { method: "POST" });

export const personaAnswer = (sessionId, body) =>
  apiRequest(`/api/v1/persona/onboarding/${sessionId}/answer`, {
    method: "POST",
    body,
  });

export const personaSkip = (sessionId) =>
  apiRequest(`/api/v1/persona/onboarding/${sessionId}/skip`, {
    method: "POST",
  });

export const personaFinish = (sessionId) =>
  apiRequest(`/api/v1/persona/onboarding/${sessionId}/finish`, {
    method: "POST",
  });

export const personaBuild = (sessionId) =>
  apiRequest(`/api/v1/persona/${sessionId}/build`, { method: "POST" });

export const personaConfirm = (personaId) =>
  apiRequest(`/api/v1/persona/${personaId}/confirm`, { method: "POST" });
