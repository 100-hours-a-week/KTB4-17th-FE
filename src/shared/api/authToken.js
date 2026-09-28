const LEGACY_ACCESS_TOKEN_KEY = "pocket-signal-access-token";

export const AUTH_EXPIRED_EVENT = "pocket-signal:auth-expired";

export function clearAccessToken() {
  try {
    window.sessionStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  } catch {
    // Keep logout usable when session storage is unavailable.
  }
}
