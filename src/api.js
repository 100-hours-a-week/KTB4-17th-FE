export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE !== "false";
const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function csrfToken() {
  return document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith("XSRF-TOKEN="))
    ?.split("=")[1];
}

export async function apiRequest(path, options = {}) {
  const method = options.method || "GET";
  const headers = { Accept: "application/json", ...options.headers };
  if (options.body && !(options.body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const csrf = csrfToken();
  if (csrf && !["GET", "HEAD", "OPTIONS"].includes(method))
    headers["X-XSRF-TOKEN"] = decodeURIComponent(csrf);
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: "include",
    ...options,
    method,
    headers,
    body:
      options.body && !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body,
  });
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  const result = contentType.includes("application/json")
    ? await response.json()
    : null;
  if (!response.ok) {
    const error = new Error(result?.errorCode || `HTTP_${response.status}`);
    error.code = result?.errorCode || `HTTP_${response.status}`;
    error.fields = result?.errors || [];
    throw error;
  }
  return result?.data ?? null;
}

export function beginKakaoLogin() {
  window.location.assign(`${baseUrl}/api/v1/auth/kakao`);
}

export const backend = {
  onboarding: () => apiRequest("/api/v1/users/me/onboarding"),
  onboardingProfile: () => apiRequest("/api/v1/users/me/onboarding/profile"),
  identity: (body) =>
    apiRequest("/api/v1/registration/identity", { method: "PUT", body }),
  nickname: (nickname) =>
    apiRequest(
      `/api/v1/nicknames/availability?nickname=${encodeURIComponent(nickname)}`,
    ),
  regions: (query) =>
    apiRequest(`/api/v1/activity-regions?query=${encodeURIComponent(query)}`),
  profile: (body) =>
    apiRequest("/api/v1/users/me/profile", { method: "PUT", body }),
  createRecommendationBatch: () =>
    apiRequest("/api/v1/recommendation-batches", { method: "POST" }),
  sendLike: (receiverId) =>
    apiRequest("/api/v1/likes", { method: "POST", body: { receiverId } }),
  // The remaining V1 contracts are described in the API workbook and can be enabled as controllers land.
  activeBatch: () => apiRequest("/api/v1/recommendation-batches/active"),
  recommendationItems: (batchId) =>
    apiRequest(`/api/v1/recommendation-batches/${batchId}/items?size=20`),
  receivedLikes: () => apiRequest("/api/v1/likes/received?size=20"),
  sentLikes: () => apiRequest("/api/v1/likes/sent?size=20"),
  rooms: () => apiRequest("/api/v1/chat-rooms?size=20"),
  messages: (roomId) =>
    apiRequest(`/api/v1/chat-rooms/${roomId}/messages?size=20`),
  sendMessage: (roomId, text) =>
    apiRequest(`/api/v1/chat-rooms/${roomId}/messages`, {
      method: "POST",
      body: {
        clientMessageId: crypto.randomUUID(),
        messageType: "TEXT",
        textContent: text,
      },
    }),
  notifications: (category = "ALL") =>
    apiRequest(`/api/v1/notifications?category=${category}&size=20`),
};
