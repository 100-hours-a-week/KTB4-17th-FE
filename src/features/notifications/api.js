import { apiRequest } from "../../shared/api/client.js";

export function notifications(category = "ALL", { cursor, signal } = {}) {
  const params = new URLSearchParams({ category, size: "20" });
  if (cursor != null) params.set("cursor", String(cursor));
  return apiRequest(`/api/v1/notifications?${params}`, {
    signal,
    cache: "no-store",
  });
}

export const unreadCount = (signal) =>
  apiRequest("/api/v1/notifications/unread-count", {
    signal,
    cache: "no-store",
  });

export const markAsRead = (id, { signal } = {}) =>
  apiRequest(`/api/v1/notifications/${id}/read-receipt`, {
    method: "PUT",
    signal,
  });

export const deleteNotification = (id) =>
  apiRequest(`/api/v1/notifications/${id}`, { method: "DELETE" });

export const openNotificationStream = (signal) =>
  apiRequest("/api/v1/notifications/stream", {
    signal,
    cache: "no-store",
    headers: { Accept: "text/event-stream" },
    responseType: "stream",
  });
