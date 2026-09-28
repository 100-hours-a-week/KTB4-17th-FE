import { apiRequest } from "../../shared/api/client.js";

export const regions = (query) =>
  apiRequest(`/api/v1/activity-regions?query=${encodeURIComponent(query)}`);
