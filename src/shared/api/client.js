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

export async function apiRequest(path, requestOptions = {}) {
  const method = (requestOptions.method || "GET").toUpperCase();
  const hasBody = requestOptions.body != null;
  const isFormData =
    typeof FormData !== "undefined" && requestOptions.body instanceof FormData;
  const headers = {
    Accept: "application/json",
    ...requestOptions.headers,
  };
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
  if (!response.ok) throw requestError(response, result);
  return result?.data ?? null;
}
