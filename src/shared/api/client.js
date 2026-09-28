import {
  AUTH_EXPIRED_EVENT,
  clearAccessToken,
  getAccessToken,
} from "./authToken.js";

const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export async function apiRequest(path, options = {}) {
  const { skipAuth = false, ...requestOptions } = options;
  const method = requestOptions.method || "GET";
  const headers = { Accept: "application/json", ...requestOptions.headers };
  const accessToken = skipAuth ? null : getAccessToken();

  if (accessToken) headers.Authorization = "Bearer " + accessToken;
  if (requestOptions.body && !(requestOptions.body instanceof FormData))
    headers["Content-Type"] = "application/json";

  const response = await fetch(baseUrl + path, {
    credentials: "include",
    ...requestOptions,
    method,
    headers,
    body:
      requestOptions.body && !(requestOptions.body instanceof FormData)
        ? JSON.stringify(requestOptions.body)
        : requestOptions.body,
  });

  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  const result = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    const code = result?.errorCode || "HTTP_" + response.status;
    const error = new Error(code);
    error.code = code;
    error.fields = result?.errors || [];

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
