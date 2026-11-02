import { apiRequest } from "../../shared/api/client.js";

export const getPopularProfiles = () =>
  apiRequest("/api/v1/popular-profiles", { cache: "no-store" });
