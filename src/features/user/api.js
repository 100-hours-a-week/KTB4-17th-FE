import { apiRequest } from "../../shared/api/client.js";

export const onboarding = () => apiRequest("/api/v1/users/me/onboarding");

export const onboardingProfile = () =>
  apiRequest("/api/v1/users/me/onboarding/profile");

export const identity = (body) =>
  apiRequest("/api/v1/registration/identity", {
    method: "PUT",
    body,
    skipAuth: true,
  });

export const nickname = (nickname) =>
  apiRequest(
    `/api/v1/nicknames/availability?nickname=${encodeURIComponent(nickname)}`,
  );
