import { storeBearerToken } from "../../shared/api/authToken.js";
import { apiRequest } from "../../shared/api/client.js";
import { API_ERROR_MESSAGES } from "../../shared/api/errorMessages.js";

export const localTestAuthEnabled =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_LOCAL_TEST_AUTH === "true";

let oauthCallbackExchange = null;

const LOGIN_CHECK_TIMEOUT_MS = 8_000;

function loginUnavailableError() {
  const error = new Error(API_ERROR_MESSAGES.SERVER_UNAVAILABLE);
  error.code = "SERVER_UNAVAILABLE";
  return error;
}

// Leaving the app for Kakao is a full-page navigation, so a proxy error (502 etc.)
// would replace the app with a bare error page. Check the login endpoint first and
// keep users on the login screen with a friendly message when the server is down.
export async function beginKakaoLogin() {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
  const url = `${baseUrl}/api/v1/auth/kakao`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOGIN_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "manual",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status >= 500) throw loginUnavailableError();
  } catch (error) {
    if (error.code === "SERVER_UNAVAILABLE" || error.name === "AbortError")
      throw loginUnavailableError();
    // Network or CORS failures cannot be inspected here; let the browser try.
  } finally {
    clearTimeout(timer);
  }
  window.location.assign(url);
}

export const logout = () =>
  apiRequest("/api/v1/auth/logout", {
    method: "POST",
    cache: "no-store",
  });

export function completeOAuthCallback() {
  if (oauthCallbackExchange) return oauthCallbackExchange;

  const hash = window.location.hash;
  const params = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash,
  );
  const code = params.get("auth_code");
  if (!code) return null;

  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname + window.location.search,
  );

  oauthCallbackExchange = apiRequest("/api/v1/auth/token/exchange", {
    method: "POST",
    body: { code },
    skipAuth: true,
  })
    .then((response) => storeBearerToken(response))
    .finally(() => {
      oauthCallbackExchange = null;
    });

  return oauthCallbackExchange;
}

export const localTestAccounts = async () => {
  if (!localTestAuthEnabled)
    return { accounts: [], practiceTargetUserId: null };
  const result = await apiRequest("/api/v1/dev/test-auth/accounts");
  if (Array.isArray(result)) {
    return {
      accounts: result,
      practiceTargetUserId: result.some((account) => account.userId === 900002)
        ? 900002
        : null,
    };
  }
  return result || { accounts: [], practiceTargetUserId: null };
};

export async function localTestLogin(userId) {
  if (!localTestAuthEnabled) throw new Error("LOCAL_TEST_LOGIN_DISABLED");

  const response = await apiRequest(`/api/v1/dev/test-auth/${userId}/login`, {
    method: "POST",
    skipAuth: true,
  });
  storeBearerToken(response);
  return response;
}
