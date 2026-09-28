import { apiRequest } from "../../shared/api/client.js";

export const sendLike = (receiverId) =>
  apiRequest("/api/v1/likes", { method: "POST", body: { receiverId } });

export const rejectLike = (likeId) =>
  apiRequest(`/api/v1/likes/${likeId}`, { method: "POST" });
// The remaining V1 contracts are described in the API workbook and can be enabled as controllers land.

export const sentLikes = (cursor) =>
  apiRequest(
    `/api/v1/likes/sent${cursor != null ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
  );

export const receivedLikes = (cursor) =>
  apiRequest(
    `/api/v1/likes/received${cursor != null ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
