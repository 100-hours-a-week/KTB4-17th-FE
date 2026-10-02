import {
  AUTH_SESSION_CLEARED_EVENT,
  getAuthSessionSubject,
} from "../../shared/api/authToken.js";
import { apiRequest } from "../../shared/api/client.js";
import { createLikeRequestGuard } from "./requestGuard.js";

const likeRequests = createLikeRequestGuard();
window.addEventListener(AUTH_SESSION_CLEARED_EVENT, likeRequests.clear);

export const sendLike = (receiverId) =>
  likeRequests.run(`${getAuthSessionSubject()}:send:${receiverId}`, () =>
    apiRequest("/api/v1/likes", { method: "POST", body: { receiverId } }),
  );

export const rejectLike = (likeId) =>
  likeRequests.run(`${getAuthSessionSubject()}:reject:${likeId}`, () =>
    apiRequest(`/api/v1/likes/${likeId}`, { method: "POST" }),
  );
// The remaining V1 contracts are described in the API workbook and can be enabled as controllers land.

export const sentLikes = (cursor) =>
  apiRequest(
    `/api/v1/likes/sent${cursor != null ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    { cache: "no-store" },
  );

export const receivedLikes = (cursor) =>
  apiRequest(
    `/api/v1/likes/received${cursor != null ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    { cache: "no-store" },
  );
