import { apiRequest } from "../../shared/api/client.js";

export const onboarding = () => apiRequest("/api/v1/users/me/onboarding");

export const onboardingProfile = () =>
  apiRequest("/api/v1/users/me/onboarding/profile");

export const identity = (body) =>
  // The pending-registration token authenticates this endpoint and the
  // backend deliberately excludes it from CSRF validation. Avoid fetching
  // the general CSRF token first: that endpoint requires a service session,
  // which a new registrant does not have yet.
  apiRequest("/api/v1/registration/identity", {
    method: "PUT",
    body,
    skipCsrf: true,
  });

export const nickname = (nickname) =>
  apiRequest(
    `/api/v1/nicknames/availability?nickname=${encodeURIComponent(nickname)}`,
  );
