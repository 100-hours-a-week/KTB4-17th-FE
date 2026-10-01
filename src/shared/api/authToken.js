const ACCESS_TOKEN_KEY = "pocket-signal-access-token";

export const AUTH_EXPIRED_EVENT = "pocket-signal:auth-expired";
export const AUTH_SESSION_CLEARED_EVENT = "pocket-signal:auth-session-cleared";

let memoryAccessToken = null;
let sessionSubject = null;

export function getAuthSessionSubject() {
  const token = getAccessToken();
  if (token) {
    try {
      const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      sessionSubject = String(JSON.parse(atob(payload)).sub || token);
    } catch {
      sessionSubject = token;
    }
  }
  return sessionSubject;
}

export function getAccessToken() {
  try {
    return window.sessionStorage.getItem(ACCESS_TOKEN_KEY) || memoryAccessToken;
  } catch {
    return memoryAccessToken;
  }
}

export function setAccessToken(token) {
  if (typeof token !== "string" || !token.trim()) {
    const error = new Error("AUTH_TOKEN_MISSING");
    error.code = "AUTH_TOKEN_MISSING";
    throw error;
  }

  const previousSubject = getAuthSessionSubject();
  memoryAccessToken = token;
  try {
    window.sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
  } catch {
    // Keep the current page usable when session storage is unavailable.
  }
  const nextSubject = getAuthSessionSubject();
  if (previousSubject && previousSubject !== nextSubject)
    window.dispatchEvent(new Event(AUTH_SESSION_CLEARED_EVENT));
}

export function clearAccessToken({ preserveSession = false } = {}) {
  if (preserveSession) getAuthSessionSubject();
  memoryAccessToken = null;
  try {
    window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // Keep logout usable when session storage is unavailable.
  }
  if (!preserveSession) {
    sessionSubject = null;
    window.dispatchEvent(new Event(AUTH_SESSION_CLEARED_EVENT));
  }
}

export function storeBearerToken(response) {
  if (
    response?.tokenType !== "Bearer" ||
    typeof response.accessToken !== "string" ||
    !response.accessToken.trim()
  ) {
    const error = new Error("AUTH_TOKEN_MISSING");
    error.code = "AUTH_TOKEN_MISSING";
    throw error;
  }

  setAccessToken(response.accessToken);
  return response.accessToken;
}
