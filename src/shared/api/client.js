const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const DEFAULT_CSRF_HEADER = "X-XSRF-TOKEN";

let csrfTokenValue = null;
let csrfHeaderName = DEFAULT_CSRF_HEADER;
let csrfBootstrap;
let csrfGeneration = 0;

function csrfError(response, result) {
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

export async function ensureCsrfToken({ force = false } = {}) {
  if (force) clearCsrfToken();
  if (csrfTokenValue) return csrfTokenValue;
  if (csrfBootstrap) return csrfBootstrap;

  const generation = csrfGeneration;
  const bootstrap = (async () => {
    const response = await fetch(`${baseUrl}/api/v1/csrf`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const result = await readJson(response);
    if (!response.ok) {
      if (response.status === 401 && generation === csrfGeneration)
        clearCsrfToken();
      throw csrfError(response, result);
    }
    if (!result?.token) {
      const error = new Error("CSRF_TOKEN_MISSING");
      error.code = "CSRF_TOKEN_MISSING";
      throw error;
    }
    if (generation !== csrfGeneration) return ensureCsrfToken();

    csrfTokenValue = result.token;
    csrfHeaderName = result.headerName || DEFAULT_CSRF_HEADER;
    return csrfTokenValue;
  })();
  csrfBootstrap = bootstrap;
  bootstrap.then(
    () => {
      if (csrfBootstrap === bootstrap) csrfBootstrap = null;
    },
    () => {
      if (csrfBootstrap === bootstrap) csrfBootstrap = null;
    },
  );

  return bootstrap;
}

export function clearCsrfToken() {
  csrfGeneration += 1;
  csrfTokenValue = null;
  csrfHeaderName = DEFAULT_CSRF_HEADER;
  csrfBootstrap = null;
}

export async function apiRequest(path, options = {}) {
  const { skipCsrf = false, ...requestOptions } = options;
  const method = (requestOptions.method || "GET").toUpperCase();
  const isUnsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(method);
  const hasBody = requestOptions.body != null;
  const isFormData =
    typeof FormData !== "undefined" && requestOptions.body instanceof FormData;
  const baseHeaders = {
    Accept: "application/json",
    ...requestOptions.headers,
  };
  if (hasBody && !isFormData) baseHeaders["Content-Type"] = "application/json";

  let retriedAfterCsrfRefresh = false;
  while (true) {
    const headers = { ...baseHeaders };
    if (isUnsafeMethod && !skipCsrf) {
      headers[csrfHeaderName] = await ensureCsrfToken();
    }

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
    if (response.status === 401) clearCsrfToken();
    if (!response.ok) {
      const error = csrfError(response, result);
      const csrfRejected =
        response.status === 403 && error.code === "FORBIDDEN";
      if (
        csrfRejected &&
        isUnsafeMethod &&
        !skipCsrf &&
        !retriedAfterCsrfRefresh
      ) {
        retriedAfterCsrfRefresh = true;
        await ensureCsrfToken({ force: true });
        continue;
      }
      throw error;
    }

    return result?.data ?? null;
  }
}
