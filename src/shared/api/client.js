const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function csrfToken() {
  const cookie = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith("XSRF-TOKEN="))
    ?.slice("XSRF-TOKEN=".length);
  return cookie ? decodeURIComponent(cookie) : null;
}

function maskedCsrfToken(token) {
  const tokenBytes = new TextEncoder().encode(token);
  const randomBytes = crypto.getRandomValues(new Uint8Array(tokenBytes.length));
  const maskedBytes = new Uint8Array(tokenBytes.length * 2);
  for (let index = 0; index < tokenBytes.length; index += 1) {
    maskedBytes[index] = randomBytes[index];
    maskedBytes[randomBytes.length + index] =
      randomBytes[index] ^ tokenBytes[index];
  }
  const binary = Array.from(maskedBytes, (byte) =>
    String.fromCharCode(byte),
  ).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_");
}

let csrfBootstrap;
async function ensureCsrfToken() {
  if (csrfToken()) return;
  if (!csrfBootstrap) {
    csrfBootstrap = fetch(`${baseUrl}/api/v1/csrf`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then((response) => {
        if (response.status === 404) return;
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "AUTH_REQUIRED"
              : `HTTP_${response.status}`,
          );
        if (!csrfToken()) throw new Error("CSRF_TOKEN_MISSING");
      })
      .finally(() => {
        csrfBootstrap = null;
      });
  }
  await csrfBootstrap;
}

export async function apiRequest(path, options = {}) {
  const { skipCsrf = false, ...requestOptions } = options;
  const method = requestOptions.method || "GET";
  const headers = { Accept: "application/json", ...requestOptions.headers };
  if (requestOptions.body && !(requestOptions.body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const isUnsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(method);
  if (isUnsafeMethod && !skipCsrf && !csrfToken()) await ensureCsrfToken();
  const csrf = csrfToken();
  if (csrf && isUnsafeMethod && !skipCsrf)
    headers["X-XSRF-TOKEN"] = maskedCsrfToken(csrf);
  const response = await fetch(`${baseUrl}${path}`, {
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
    const error = new Error(result?.errorCode || `HTTP_${response.status}`);
    error.code = result?.errorCode || `HTTP_${response.status}`;
    error.fields = result?.errors || [];
    throw error;
  }
  return result?.data ?? null;
}
