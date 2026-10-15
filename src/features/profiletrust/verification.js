import { MAX_ATTEMPTS, trustError } from "./model.js";

export function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(signal.reason || new DOMException("Aborted", "AbortError"));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

export const delay = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });

function assertSession(session) {
  if (
    !session?.sessionId ||
    ![
      "READY",
      "PROCESSING",
      "VERIFIED",
      "NOT_VERIFIED",
      "EXHAUSTED",
      "EXPIRED",
    ].includes(session.status)
  )
    throw trustError("VERIFICATION_RESPONSE_INVALID");
  return session;
}

export async function reconcileSession(
  session,
  { getStatus, signal, onSession = () => {}, pause = delay },
) {
  // A lost POST response does not mean that the server failed to accept it.
  // Never resubmit a different clip with the same attempt number.
  let latest = session;
  const deadline = Date.now() + 45_000;
  for (let poll = 0; poll < 30 && Date.now() < deadline; poll++) {
    signal.throwIfAborted();
    latest = assertSession(await getStatus(session.sessionId, signal));
    onSession(latest);
    if (latest.status !== "PROCESSING") return latest;
    await pause(1_500, signal);
  }
  throw trustError("VERIFICATION_STATUS_TIMEOUT");
}

export async function verifySequentially(
  initial,
  {
    record,
    submit,
    getStatus,
    signal,
    canRecord = () => true,
    onSession = () => {},
    onHint = () => {},
    pause = delay,
  },
) {
  let session = assertSession(initial);
  let sent = 0;
  while (true) {
    signal.throwIfAborted();
    if (session.status === "PROCESSING")
      session = await reconcileSession(session, {
        getStatus,
        signal,
        onSession,
        pause,
      });
    if (session.status !== "READY") return session;
    if (
      sent >= MAX_ATTEMPTS ||
      !Number.isInteger(session.nextAttemptNo) ||
      session.nextAttemptNo < 1 ||
      session.nextAttemptNo > MAX_ATTEMPTS
    )
      throw trustError("VERIFICATION_RESPONSE_INVALID");
    if (!canRecord()) throw trustError("CAMERA_TIME_LIMIT");
    onHint(
      session.attempt?.reasonCodes?.includes("NO_FACE")
        ? "얼굴 전체가 화면 안에 들어오도록 맞춰주세요."
        : "얼굴을 가운데 맞추고 정면을 바라봐주세요.",
    );
    let video = await record();
    signal.throwIfAborted();
    sent++;
    const attemptNo = session.nextAttemptNo;
    const before = session.attemptsUsed;
    try {
      session = assertSession(
        await submit(session.sessionId, attemptNo, video, signal),
      );
      onSession(session);
    } catch (error) {
      if (signal.aborted) throw error;
      if (
        error?.code?.startsWith("PRIMARY_PHOTO_") ||
        [
          "VIDEO_TYPE_NOT_ALLOWED",
          "VIDEO_TOO_LARGE",
          "VERIFICATION_CHALLENGE_INVALID",
        ].includes(error?.code)
      )
        throw error;
      session = await reconcileSession(session, {
        getStatus,
        signal,
        onSession,
        pause,
      });
      if (session.status === "READY") {
        // Reconciliation is for recovering results, not automatically repeating
        // requests that the server rejected before accepting the video.
        if (session.attemptsUsed === before || session.attempt?.errorCode)
          throw session.attempt?.errorCode
            ? trustError(session.attempt.errorCode)
            : error;
      }
    } finally {
      video = null;
    }
    if (session.status === "READY" && session.nextAttemptNo <= attemptNo)
      throw trustError("VERIFICATION_RESPONSE_INVALID");
  }
}
