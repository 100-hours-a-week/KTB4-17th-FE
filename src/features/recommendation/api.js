import { apiRequest } from "../../shared/api/client.js";

export const createRecommendationBatch = () =>
  apiRequest("/api/v1/recommendation-batches", { method: "POST" });

export const activeBatch = () =>
  apiRequest("/api/v1/recommendation-batches/active");

export const recommendationItems = (batchId, cursor) => {
  const params = new URLSearchParams();
  if (cursor != null) params.set("cursor", String(cursor));
  const query = params.size ? `?${params.toString()}` : "";
  return apiRequest(`/api/v1/recommendation-batches/${batchId}/items${query}`);
};
