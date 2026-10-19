import { useAppState } from "../../shared/appState.jsx";
import { onboarding } from "../user/api.js";
import { localTestAuthEnabled, localTestLogin } from "./api.js";

export function useLocalTestLogin({ navigate }) {
  const { setData } = useAppState();

  return async function loginWithLocalTestAccount(
    userId,
    practiceTargetUserId,
  ) {
    if (!localTestAuthEnabled) throw new Error("LOCAL_TEST_LOGIN_DISABLED");
    await localTestLogin(userId);
    const status = await onboarding();
    if (status?.userStatus !== "ACTIVE") {
      const error = new Error("TEST_ACCOUNT_ONBOARDING_INCOMPLETE");
      error.code = "TEST_ACCOUNT_ONBOARDING_INCOMPLETE";
      throw error;
    }
    setData((old) => ({
      ...old,
      session: true,
      onboarded: true,
      onboardingStep: "complete",
    }));
    navigate(`/ai/practice/${practiceTargetUserId}`);
  };
}
