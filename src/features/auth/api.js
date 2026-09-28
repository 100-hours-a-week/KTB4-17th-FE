import { apiRequest } from "../../shared/api/client.js";
import { storeBearerToken } from "../../shared/api/authToken.js";

export const localTestAuthEnabled =
  import.meta.env.DEV &&
  import.meta.env.VITE_ENABLE_LOCAL_TEST_AUTH === "true";
let oauthCallbackExchange = null;

export function beginKakaoLogin() {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
  window.location.assign(baseUrl + "/api/v1/auth/kakao");
}

export function completeOAuthCallback() {
  if (oauthCallbackExchange) return oauthCallbackExchange;

  const hash = window.location.hash;
  const hashParams = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash,
  );
  const code = hashParams.get("auth_code");
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
};

export const localTestLogin = async (memberId) => {
  if (!localTestAuthEnabled)
    throw new Error("LOCAL_TEST_LOGIN_DISABLED");

  const response = await apiRequest(
    "/api/v1/dev/test-auth/" + memberId + "/login",
    {
      method: "POST",
      skipAuth: true,
    },
  );
  storeBearerToken(response);
  return response;
};
