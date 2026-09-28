export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE !== "false";
const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function csrfToken() {
  const cookie = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith("XSRF-TOKEN="))
    ?.slice("XSRF-TOKEN=".length);
  return cookie ? decodeURIComponent(cookie) : null;
}

function maskedCsrfToken(token) {
  const tokenBytes = new TextEncoder().encode(token);
  const randomBytes = crypto.getRandomValues(new Uint8Array(tokenBytes.length));
  const maskedBytes = new Uint8Array(tokenBytes.length * 2);
  for (let index = 0; index < tokenBytes.length; index += 1) {
    maskedBytes[index] = randomBytes[index];
    maskedBytes[randomBytes.length + index] =
      randomBytes[index] ^ tokenBytes[index];
  }
  const binary = Array.from(maskedBytes, (byte) =>
    String.fromCharCode(byte),
  ).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_");
}

let csrfBootstrap;
async function ensureCsrfToken() {
  if (csrfToken()) return;
  if (!csrfBootstrap) {
    csrfBootstrap = fetch(`${baseUrl}/api/v1/csrf`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then((response) => {
        if (response.status === 404) return;
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "AUTH_REQUIRED"
              : `HTTP_${response.status}`,
          );
        if (!csrfToken()) throw new Error("CSRF_TOKEN_MISSING");
      })
      .finally(() => {
        csrfBootstrap = null;
      });
  }
  await csrfBootstrap;
}

export async function apiRequest(path, options = {}) {
  const { skipCsrf = false, ...requestOptions } = options;
  const method = requestOptions.method || "GET";
  const headers = { Accept: "application/json", ...requestOptions.headers };
  if (requestOptions.body && !(requestOptions.body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const isUnsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(method);
  if (isUnsafeMethod && !skipCsrf && !csrfToken()) await ensureCsrfToken();
  const csrf = csrfToken();
  if (csrf && isUnsafeMethod && !skipCsrf)
    headers["X-XSRF-TOKEN"] = maskedCsrfToken(csrf);
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: "include",
    ...requestOptions,
    method,
    headers,
    body:
      requestOptions.body && !(requestOptions.body instanceof FormData)
        ? JSON.stringify(requestOptions.body)
        : requestOptions.body,
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

async function uploadChatImage(file) {
  const uploadIntent = await apiRequest("/api/v1/files/upload-intents", {
    method: "POST",
    body: { originalName: file.name, contentType: file.type },
  });

  if (file.size > uploadIntent.maxFileSizeBytes) {
    const error = new Error("FILE_TOO_LARGE");
    error.code = "FILE_TOO_LARGE";
    throw error;
  }

  const uploadResponse = await fetch(uploadIntent.uploadUrl, {
    method: uploadIntent.method,
    headers: uploadIntent.headers,
    body: file,
    credentials: "omit",
  });
  if (!uploadResponse.ok) {
    const error = new Error("FILE_UPLOAD_FAILED");
    error.code = "FILE_UPLOAD_FAILED";
    throw error;
  }

  return apiRequest(
    `/api/v1/files/upload-intents/${uploadIntent.uploadIntentId}/complete`,
    { method: "POST" },
  );
}

export function beginKakaoLogin() {
  window.location.assign(`${baseUrl}/api/v1/auth/kakao`);
}

const localTestAuthEnabled = import.meta.env.DEV && !DEMO_MODE;

export const backend = {
  localTestAccounts: async () => {
    if (!localTestAuthEnabled)
      return { accounts: [], practiceTargetMemberId: null };
    const result = await apiRequest("/api/v1/dev/test-auth/accounts");
    if (Array.isArray(result)) {
      return {
        accounts: result,
        practiceTargetMemberId: result.some(
          (account) => account.memberId === 900002,
        )
          ? 900002
          : null,
      };
    }
    return result || { accounts: [], practiceTargetMemberId: null };
  },
  localTestLogin: (memberId) =>
    localTestAuthEnabled
      ? apiRequest(`/api/v1/dev/test-auth/${memberId}/login`, {
          method: "POST",
          skipCsrf: true,
        })
      : Promise.reject(new Error("LOCAL_TEST_LOGIN_DISABLED")),
  onboarding: () => apiRequest("/api/v1/users/me/onboarding"),
  onboardingProfile: () => apiRequest("/api/v1/users/me/onboarding/profile"),
  identity: (body) =>
    // The pending-registration token authenticates this endpoint and the
    // backend deliberately excludes it from CSRF validation. Avoid fetching
    // the general CSRF token first: that endpoint requires a service session,
    // which a new registrant does not have yet.
    apiRequest("/api/v1/registration/identity", {
      method: "PUT",
      body,
      skipCsrf: true,
    }),
  nickname: (nickname) =>
    apiRequest(
      `/api/v1/nicknames/availability?nickname=${encodeURIComponent(nickname)}`,
    ),
  regions: (query) =>
    apiRequest(`/api/v1/activity-regions?query=${encodeURIComponent(query)}`),
  profile: (body) =>
    apiRequest("/api/v1/users/me/profile", { method: "PUT", body }),
  personaStart: () =>
    apiRequest("/api/v1/persona/onboarding/start", { method: "POST" }),
  personaAnswer: (sessionId, body) =>
    apiRequest(`/api/v1/persona/onboarding/${sessionId}/answer`, {
      method: "POST",
      body,
    }),
  personaSkip: (sessionId) =>
    apiRequest(`/api/v1/persona/onboarding/${sessionId}/skip`, {
      method: "POST",
    }),
  personaFinish: (sessionId) =>
    apiRequest(`/api/v1/persona/onboarding/${sessionId}/finish`, {
      method: "POST",
    }),
  personaBuild: (sessionId) =>
    apiRequest(`/api/v1/persona/${sessionId}/build`, { method: "POST" }),
  personaConfirm: (personaId) =>
    apiRequest(`/api/v1/persona/${personaId}/confirm`, { method: "POST" }),
  uploadProfileImage: uploadChatImage,
  profileImages: (images) =>
    apiRequest("/api/v1/users/me/profile/images", {
      method: "PUT",
      body: { images },
    }),
  createRecommendationBatch: () =>
    apiRequest("/api/v1/recommendation-batches", { method: "POST" }),
  sendLike: (receiverId) =>
    apiRequest("/api/v1/likes", { method: "POST", body: { receiverId } }),
  rejectLike: (likeId) =>
    apiRequest(`/api/v1/likes/${likeId}`, { method: "POST" }),
  // The remaining V1 contracts are described in the API workbook and can be enabled as controllers land.
  activeBatch: () => apiRequest("/api/v1/recommendation-batches/active"),
  recommendationItems: (batchId, cursor) => {
    const params = new URLSearchParams();
    if (cursor != null) params.set("cursor", String(cursor));
    const query = params.size ? `?${params.toString()}` : "";
    return apiRequest(
      `/api/v1/recommendation-batches/${batchId}/items${query}`,
    );
  },
  sentLikes: (cursor) =>
    apiRequest(
      `/api/v1/likes/sent${cursor != null ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  receivedLikes: (cursor) =>
    apiRequest(
      `/api/v1/likes/received${cursor != null ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  createAiSimulation: (targetMemberId) =>
    apiRequest("/api/v1/ai-simulations", {
      method: "POST",
      body: { targetMemberId },
    }),
  aiSimulation: (simulationId) =>
    apiRequest(`/api/v1/ai-simulations/${simulationId}`),
  aiSimulationReport: (simulationId) =>
    apiRequest(`/api/v1/ai-simulations/${simulationId}/report`),
  rooms: ({ cursor, size = 20 } = {}) => {
    const params = new URLSearchParams({ size: String(size) });
    if (cursor) params.set("cursor", cursor);
    return apiRequest(`/api/v1/chat-rooms?${params.toString()}`);
  },
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
  uploadChatImage,
  sendImageMessage: (roomId, imageFileId) =>
    apiRequest(`/api/v1/chat-rooms/${roomId}/messages`, {
      method: "POST",
      body: {
        clientMessageId: crypto.randomUUID(),
        messageType: "IMAGE",
        imageFileId,
      },
    }),
  chatImageAccessUrl: (roomId, fileId) =>
    apiRequest(`/api/v1/chat-rooms/${roomId}/images/${fileId}/access-url`),
  notifications: (category = "ALL") =>
    apiRequest(`/api/v1/notifications?category=${category}&size=20`),
  aiPracticeStart: (targetMemberId) =>
    apiRequest("/api/v1/ai-practice/sessions", {
      method: "POST",
      body: { targetMemberId },
    }),
  aiPracticeHistory: (sessionId, { cursor, size = 100 } = {}) => {
    const params = new URLSearchParams({ size: String(size) });
    if (cursor != null) params.set("cursor", String(cursor));
    return apiRequest(
      `/api/v1/ai-practice/sessions/${sessionId}/chats?${params.toString()}`,
    );
  },
  aiPracticeSend: (sessionId, body) =>
    apiRequest(`/api/v1/ai-practice/sessions/${sessionId}/chats`, {
      method: "POST",
      body,
    }),
  aiPracticeRetry: (sessionId, chatId) =>
    apiRequest(
      `/api/v1/ai-practice/sessions/${sessionId}/chats/${chatId}/retry`,
      { method: "POST" },
    ),
  aiPracticeEnd: (sessionId) =>
    apiRequest(`/api/v1/ai-practice/sessions/${sessionId}/end`, {
      method: "POST",
    }),
  aiPracticeUsage: () => apiRequest("/api/v1/ai-practice/usage/today"),
};
