import { apiRequest } from "../../shared/api/client.js";

const localTestAuthEnabled = import.meta.env.DEV;

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
  await apiRequest(`/api/v1/dev/test-auth/${memberId}/login`, {
    method: "POST",
  });
}
