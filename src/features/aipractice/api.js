import { apiRequest } from "../../shared/api/client.js";

export const aiPracticeStart = (targetMemberId) =>
  apiRequest("/api/v1/ai-practice/sessions", {
    method: "POST",
    body: { targetMemberId },
  });

export const aiPracticeHistory = (sessionId, { cursor, size = 100 } = {}) => {
  const params = new URLSearchParams({ size: String(size) });
  if (cursor != null) params.set("cursor", String(cursor));
  return apiRequest(
    `/api/v1/ai-practice/sessions/${sessionId}/chats?${params.toString()}`,
  );
};

export const aiPracticeSend = (sessionId, body) =>
  apiRequest(`/api/v1/ai-practice/sessions/${sessionId}/chats`, {
    method: "POST",
    body,
  });

export const aiPracticeRetry = (sessionId, chatId) =>
  apiRequest(
    `/api/v1/ai-practice/sessions/${sessionId}/chats/${chatId}/retry`,
    { method: "POST" },
  );

export const aiPracticeEnd = (sessionId) =>
  apiRequest(`/api/v1/ai-practice/sessions/${sessionId}/end`, {
    method: "POST",
  });

export const aiPracticeUsage = () =>
  apiRequest("/api/v1/ai-practice/usage/today");
