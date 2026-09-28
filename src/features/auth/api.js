import { apiRequest } from "../../shared/api/client.js";

export const localTestAuthEnabled =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_LOCAL_TEST_AUTH === "true";

export function beginKakaoLogin() {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
  window.location.assign(`${baseUrl}/api/v1/auth/kakao`);
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

export async function localTestLogin(memberId) {
  if (!localTestAuthEnabled) throw new Error("LOCAL_TEST_LOGIN_DISABLED");

  return apiRequest(`/api/v1/dev/test-auth/${memberId}/login`, {
    method: "POST",
    skipAuth: true,
  });
}
