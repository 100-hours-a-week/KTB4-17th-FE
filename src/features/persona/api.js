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

export const kakaoInspect = (file, { signal } = {}) => {
  const body = new FormData();
  body.append("file", file);
  return apiRequest("/api/v1/persona/kakao/inspect", {
    method: "POST",
    body,
    signal,
  });
};

export const kakaoExtract = (file, speakerName) => {
  const body = new FormData();
  body.append("file", file);
  body.append("speakerName", speakerName);
  return apiRequest("/api/v1/persona/kakao/extract", {
    method: "POST",
    body,
  });
};
