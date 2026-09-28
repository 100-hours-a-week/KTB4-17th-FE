import {
  AUTH_EXPIRED_EVENT,
  clearAccessToken,
  getAccessToken,
} from "./authToken.js";

const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function requestError(response, result) {
  const code =
    result?.errorCode ||
    (response.status === 401 ? "AUTH_REQUIRED" : `HTTP_${response.status}`);
  const error = new Error(code);
  error.code = code;
  error.fields = result?.errors || [];
  return error;
}

async function readJson(response) {
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : null;
}

export async function apiRequest(path, options = {}) {
  const { skipAuth = false, ...requestOptions } = options;
  const method = (requestOptions.method || "GET").toUpperCase();
  const hasBody = requestOptions.body != null;
  const isFormData =
    typeof FormData !== "undefined" && requestOptions.body instanceof FormData;
  const headers = {
    Accept: "application/json",
    ...requestOptions.headers,
  };
  const accessToken = skipAuth ? null : getAccessToken();

  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (hasBody && !isFormData) headers["Content-Type"] = "application/json";

  const response = await fetch(`${baseUrl}${path}`, {
    ...requestOptions,
    credentials: "include",
    method,
    headers,
    body:
      hasBody && !isFormData
        ? JSON.stringify(requestOptions.body)
        : requestOptions.body,
  });

  if (response.status === 204) return null;

  const result = await readJson(response);
  if (!response.ok) {
    const error = requestError(response, result);
    if (response.status === 401 && accessToken) {
      clearAccessToken();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    throw error;
  }

  if (result && typeof result === "object" && Object.hasOwn(result, "data"))
    return result.data;
  return result ?? null;
}
