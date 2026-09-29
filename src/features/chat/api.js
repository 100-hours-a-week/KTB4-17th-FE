import { apiRequest } from "../../shared/api/client.js";
import { uploadFile } from "../../shared/api/files.js";

export const rooms = ({ cursor, size = 20 } = {}) => {
  const params = new URLSearchParams({ size: String(size) });
  if (cursor) params.set("cursor", cursor);
  return apiRequest(`/api/v1/chat-rooms?${params.toString()}`);
};

export const messages = (roomId) =>
  apiRequest(`/api/v1/chat-rooms/${roomId}/messages?size=20`);

export const markAsRead = (roomId, lastReadMessageId) =>
  apiRequest(`/api/v1/chat-rooms/${roomId}/read`, {
    method: "POST",
    body: { lastReadMessageId },
  });

export const sendMessage = (roomId, text) =>
  apiRequest(`/api/v1/chat-rooms/${roomId}/messages`, {
    method: "POST",
    body: {
      clientMessageId: crypto.randomUUID(),
      messageType: "TEXT",
      textContent: text,
    },
  });

export const sendImageMessage = (roomId, imageFileId) =>
  apiRequest(`/api/v1/chat-rooms/${roomId}/messages`, {
    method: "POST",
    body: {
      clientMessageId: crypto.randomUUID(),
      messageType: "IMAGE",
      imageFileId,
    },
  });

export const chatImageAccessUrl = (roomId, fileId) =>
  apiRequest(`/api/v1/chat-rooms/${roomId}/images/${fileId}/access-url`);

export const uploadChatImage = uploadFile;
