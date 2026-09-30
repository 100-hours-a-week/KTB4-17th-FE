import { apiRequest } from "../../shared/api/client.js";
import { uploadFile } from "../../shared/api/files.js";

export const getMyProfile = () => apiRequest("/api/v1/users/me/profile");

export const getMemberProfile = (memberId) =>
  apiRequest(`/api/v1/users/${encodeURIComponent(memberId)}/profile`);

export const profile = (body) =>
  apiRequest("/api/v1/users/me/profile", { method: "PUT", body });

export const uploadProfileImage = uploadFile;

export const profileImages = (images) =>
  apiRequest("/api/v1/users/me/profile/images", {
    method: "PUT",
    body: { images },
  });
