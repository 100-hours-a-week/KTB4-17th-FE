const ACCESS_TOKEN_KEY = "pocket-signal-access-token";

export const AUTH_EXPIRED_EVENT = "pocket-signal:auth-expired";

let memoryAccessToken = null;

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

  memoryAccessToken = token;
  try {
    window.sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
  } catch {
    // Keep the current page usable when session storage is unavailable.
  }
}

export function clearAccessToken() {
  memoryAccessToken = null;
  try {
    window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // Keep logout usable when session storage is unavailable.
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
