import { apiRequest } from "./client.js";

export async function stageFile(file, { signal } = {}) {
  const uploadIntent = await apiRequest("/api/v1/files/upload-intents", {
    method: "POST",
    body: { originalName: file.name, contentType: file.type },
    signal,
  });

  if (file.size > uploadIntent.maxFileSizeBytes) {
    const error = new Error("FILE_TOO_LARGE");
    error.code = "FILE_TOO_LARGE";
    throw error;
  }

  const uploadResponse = await fetch(uploadIntent.uploadUrl, {
    method: uploadIntent.method,
    headers: uploadIntent.headers,
    body: file,
    credentials: "omit",
    signal,
  });
  if (!uploadResponse.ok) {
    const error = new Error("FILE_UPLOAD_FAILED");
    error.code = "FILE_UPLOAD_FAILED";
    throw error;
  }

  return uploadIntent;
}

export const completeFileUpload = (uploadIntentId, options = {}) =>
  apiRequest(`/api/v1/files/upload-intents/${uploadIntentId}/complete`, {
    ...options,
    method: "POST",
  });

export async function uploadFile(file) {
  const intent = await stageFile(file);
  return completeFileUpload(intent.uploadIntentId);
}
