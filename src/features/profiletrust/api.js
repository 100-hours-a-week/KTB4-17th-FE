import { apiRequest } from "../../shared/api/client.js";
import { completeFileUpload, stageFile } from "../../shared/api/files.js";
import { trustError } from "./model.js";

// Every request is bounded, including photo staging. A timed out attempt is
// reconciled through GET by verification.js before another video is submitted.
async function boundedRequest(request, signal, timeout = 45_000) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await request(controller.signal);
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted)
      throw trustError("VERIFICATION_REQUEST_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export const stagePrimaryPhoto = (file, signal) =>
  boundedRequest(
    (requestSignal) => stageFile(file, { signal: requestSignal }),
    signal,
  );

export const checkPrimaryPhoto = (id, signal) =>
  boundedRequest(
    (requestSignal) =>
      apiRequest(`/api/v1/files/upload-intents/${id}/primary-photo-check`, {
        method: "POST",
        signal: requestSignal,
      }),
    signal,
  );

export const createVerification = (uploadIntentId, signal) =>
  boundedRequest(
    (requestSignal) =>
      apiRequest("/api/v1/users/me/face-verifications", {
        method: "POST",
        body: { uploadIntentId },
        signal: requestSignal,
      }),
    signal,
  );

export const getVerification = (id, signal) =>
  boundedRequest(
    (requestSignal) =>
      apiRequest(`/api/v1/users/me/face-verifications/${id}`, {
        cache: "no-store",
        signal: requestSignal,
      }),
    signal,
    15_000,
  );

export const submitVideo = (id, attemptNo, video, signal) => {
  const form = new FormData();
  form.append("video", video, video.name);
  return boundedRequest(
    (requestSignal) =>
      apiRequest(
        `/api/v1/users/me/face-verifications/${id}/attempts?attemptNo=${attemptNo}`,
        { method: "POST", body: form, signal: requestSignal },
      ),
    signal,
  );
};

export const completePrimaryPhoto = (id, signal) =>
  boundedRequest(
    (requestSignal) => completeFileUpload(id, { signal: requestSignal }),
    signal,
  );
