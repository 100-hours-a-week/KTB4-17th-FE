import {
  AUTH_EXPIRED_EVENT,
  clearAccessToken,
  getAccessToken,
  storeBearerToken,
} from "./authToken.js";

const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const AUTH_REFRESH_PATH = "/api/v1/auth/token/refresh";
const AUTH_LOGOUT_PATH = "/api/v1/auth/logout";

let refreshInFlight = null;

function requestError(response, result) {
  const code =
    result?.errorCode ||
    (response.status === 401 ? "AUTH_REQUIRED" : `HTTP_${response.status}`);
  const error = new Error(code);
  error.code = code;
  error.status = response.status;
  error.fields = result?.errors || [];
  return error;
}

async function readJson(response) {
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : null;
}

function buildHeaders(requestOptions, hasBody, isFormData, skipAuth) {
  const headers = new Headers(requestOptions.headers || {});
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  if (!skipAuth) {
    const accessToken = getAccessToken();
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  }

  if (hasBody && !isFormData && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");

  return headers;
}

async function sendRequest(path, requestOptions, { skipAuth = false } = {}) {
  const method = (requestOptions.method || "GET").toUpperCase();
  const hasBody = requestOptions.body != null;
  const isFormData =
    typeof FormData !== "undefined" && requestOptions.body instanceof FormData;
  const headers = buildHeaders(requestOptions, hasBody, isFormData, skipAuth);

  return fetch(`${baseUrl}${path}`, {
    ...requestOptions,
    credentials: "include",
    method,
    headers,
    body:
      hasBody && !isFormData
        ? JSON.stringify(requestOptions.body)
        : requestOptions.body,
  });
}

function unwrapData(result) {
  if (result && typeof result === "object" && Object.hasOwn(result, "data"))
    return result.data;
  return result;
}

export async function refreshAuthSession() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      clearAccessToken({ preserveSession: true });
      const response = await sendRequest(
        AUTH_REFRESH_PATH,
        { method: "POST", cache: "no-store" },
        { skipAuth: true },
      );
      const result = await readJson(response);
      if (!response.ok) {
        clearAccessToken();
        throw requestError(response, result);
      }

      try {
        return storeBearerToken(unwrapData(result));
      } catch (error) {
        clearAccessToken();
        throw error;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

function dispatchAuthExpired() {
  clearAccessToken();
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

export async function apiRequest(path, options = {}) {
  const {
    skipAuth = false,
    notifyAuthExpired = true,
    ...requestOptions
  } = options;
  let response = await sendRequest(path, requestOptions, { skipAuth });

  if (
    response.status === 401 &&
    !skipAuth &&
    path !== AUTH_REFRESH_PATH &&
    path !== AUTH_LOGOUT_PATH
  ) {
    try {
      await refreshAuthSession();
      response = await sendRequest(path, requestOptions, { skipAuth });
    } catch (refreshError) {
      if (
        refreshError?.status !== 401 &&
        refreshError?.code !== "AUTH_REQUIRED"
      )
        throw refreshError;
    }
  }

  if (response.status === 204) return null;

  const result = await readJson(response);
  if (!response.ok) {
    const error = requestError(response, result);
    if (response.status === 401 && !skipAuth && notifyAuthExpired)
      dispatchAuthExpired();
    throw error;
  }

  return unwrapData(result) ?? null;
}
