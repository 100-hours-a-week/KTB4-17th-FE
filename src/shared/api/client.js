import {
  AUTH_EXPIRED_EVENT,
  clearAccessToken,
} from "./authToken.js";

const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const AUTH_REFRESH_PATH = "/api/v1/auth/token/refresh";
const AUTH_LOGOUT_PATH = "/api/v1/auth/logout";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

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

function readCookie(name) {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  if (!cookie) return null;

  try {
    return decodeURIComponent(cookie.slice(prefix.length));
  } catch {
    return cookie.slice(prefix.length);
  }
}

function maskedCsrfToken(token) {
  const tokenBytes = new TextEncoder().encode(token);
  const randomBytes = crypto.getRandomValues(new Uint8Array(tokenBytes.length));
  const maskedBytes = new Uint8Array(tokenBytes.length * 2);

  maskedBytes.set(randomBytes);
  tokenBytes.forEach((byte, index) => {
    maskedBytes[tokenBytes.length + index] = randomBytes[index] ^ byte;
  });

  const binary = Array.from(maskedBytes, (byte) => String.fromCharCode(byte)).join(
    "",
  );
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_");
}

function buildHeaders(requestOptions, method, hasBody, isFormData) {
  const headers = new Headers(requestOptions.headers || {});
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  if (hasBody && !isFormData && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");

  if (!SAFE_METHODS.has(method) && !headers.has("X-XSRF-TOKEN")) {
    const csrfToken = readCookie("XSRF-TOKEN");
    if (csrfToken) headers.set("X-XSRF-TOKEN", maskedCsrfToken(csrfToken));
  }

  return headers;
}

async function sendRequest(path, requestOptions) {
  const method = (requestOptions.method || "GET").toUpperCase();
  const hasBody = requestOptions.body != null;
  const isFormData =
    typeof FormData !== "undefined" && requestOptions.body instanceof FormData;
  const hadCsrfCookie = Boolean(readCookie("XSRF-TOKEN"));

  const send = () => {
    const headers = buildHeaders(requestOptions, method, hasBody, isFormData);
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
  };

  const response = await send();
  if (response.status === 403 && !SAFE_METHODS.has(method) && !hadCsrfCookie) {
    // The first unsafe request may cause Spring to issue its CSRF cookie.
    // Retry once with that cookie after the browser has stored it.
    if (readCookie("XSRF-TOKEN")) return send();
  }
  return response;
}

export async function refreshAuthSession() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      clearAccessToken();
      const response = await sendRequest(
        AUTH_REFRESH_PATH,
        { method: "POST", cache: "no-store" },
      );
      if (response.status === 204) return true;

      const result = await readJson(response);
      clearAccessToken();
      throw requestError(response, result);
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
  const { skipAuth = false, ...requestOptions } = options;
  let response = await sendRequest(path, requestOptions);

  if (
    response.status === 401 &&
    !skipAuth &&
    path !== AUTH_REFRESH_PATH &&
    path !== AUTH_LOGOUT_PATH
  ) {
    try {
      await refreshAuthSession();
      response = await sendRequest(path, requestOptions);
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
    if (response.status === 401 && !skipAuth) dispatchAuthExpired();
    throw error;
  }

  if (result && typeof result === "object" && Object.hasOwn(result, "data"))
    return result.data;
  return result ?? null;
}
