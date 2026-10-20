import { apiRequest } from "../../shared/api/client.js";

export const getPreferences = (options = {}) =>
  apiRequest("/api/v1/users/me/preferences", { ...options, cache: "no-store" });

export const savePreferences = (body) =>
  apiRequest("/api/v1/users/me/preferences", { method: "PUT", body });
