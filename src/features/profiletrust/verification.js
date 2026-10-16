import {
  captureHint,
  latestAttempt,
  MAX_ATTEMPTS,
  trustError,
} from "./model.js";

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

const STATUSES = [
  "READY",
  "PROCESSING",
  "VERIFIED",
  "NOT_VERIFIED",
  "EXHAUSTED",
  "EXPIRED",
];
const DECISIONS = ["VERIFIED", "RETRY", "NOT_VERIFIED"];

function assertAttempt(attempt, used) {
  if (
    !attempt ||
    !Number.isInteger(attempt.attemptNo) ||
    attempt.attemptNo < 1 ||
    attempt.attemptNo > used ||
    !["PROCESSING", "COMPLETED", "ERROR"].includes(attempt.status) ||
    !Array.isArray(attempt.reasonCodes) ||
    attempt.reasonCodes.some((code) => typeof code !== "string" || !code) ||
    (attempt.errorCode != null &&
      (typeof attempt.errorCode !== "string" || !attempt.errorCode))
  )
    throw trustError("VERIFICATION_RESPONSE_INVALID");
  if (attempt.status === "COMPLETED") {
    if (
      !DECISIONS.includes(attempt.decision) ||
      attempt.errorCode ||
      (attempt.decision === "VERIFIED"
        ? attempt.reasonCodes.length !== 0
        : attempt.reasonCodes.length === 0)
    )
      throw trustError("VERIFICATION_RESPONSE_INVALID");
  } else if (
    attempt.decision != null ||
    attempt.reasonCodes.length ||
    (attempt.status === "ERROR"
      ? !attempt.errorCode
      : attempt.errorCode != null)
  )
    throw trustError("VERIFICATION_RESPONSE_INVALID");
}

export function assertSession(session, expectedId) {
  const max = session?.maxAttempts;
  const used = session?.attemptsUsed;
  if (
    !Number.isSafeInteger(session?.sessionId) ||
    session.sessionId < 1 ||
    (expectedId != null && session.sessionId !== expectedId) ||
    !STATUSES.includes(session.status) ||
    !Number.isInteger(max) ||
    max < 1 ||
    max > MAX_ATTEMPTS ||
    !Number.isInteger(used) ||
    used < 0 ||
    used > max ||
    session.remainingAttempts !== max - used ||
    typeof session.canRetry !== "boolean"
  )
    throw trustError("VERIFICATION_RESPONSE_INVALID");
  if (session.status === "READY") {
    if (!session.canRetry || used >= max || session.nextAttemptNo !== used + 1)
      throw trustError("VERIFICATION_RESPONSE_INVALID");
  } else if (
    session.canRetry ||
    session.nextAttemptNo != null ||
    (["PROCESSING", "VERIFIED", "NOT_VERIFIED"].includes(session.status) &&
      used === 0) ||
    (session.status === "EXHAUSTED" && used !== max)
  )
    throw trustError("VERIFICATION_RESPONSE_INVALID");
  if (used > 0) assertAttempt(session.attempt, used);
  else if (session.attempt != null)
    throw trustError("VERIFICATION_RESPONSE_INVALID");
  if (session.attempts != null) {
    if (!Array.isArray(session.attempts) || session.attempts.length !== used)
      throw trustError("VERIFICATION_RESPONSE_INVALID");
    session.attempts.forEach((attempt, index) => {
      assertAttempt(attempt, used);
      if (attempt.attemptNo !== index + 1)
        throw trustError("VERIFICATION_RESPONSE_INVALID");
    });
    if (session.attempt) {
      const stored = session.attempts[session.attempt.attemptNo - 1];
      if (
        stored.status !== session.attempt.status ||
        stored.decision !== session.attempt.decision ||
        stored.errorCode !== session.attempt.errorCode ||
        stored.reasonCodes.length !== session.attempt.reasonCodes.length ||
        stored.reasonCodes.some(
          (code, index) => code !== session.attempt.reasonCodes[index],
        )
      )
        throw trustError("VERIFICATION_RESPONSE_INVALID");
    }
  }
  const last = latestAttempt(session);
  if (
    last?.attemptNo === used &&
    ((session.status === "VERIFIED" && last.decision !== "VERIFIED") ||
      (session.status !== "VERIFIED" && last.decision === "VERIFIED") ||
      (session.status === "PROCESSING" && last.status !== "PROCESSING") ||
      (["READY", "EXHAUSTED", "NOT_VERIFIED"].includes(session.status) &&
        last.status === "PROCESSING"))
  )
    throw trustError("VERIFICATION_RESPONSE_INVALID");
  return session;
}

export async function reconcileSession(
  session,
  { getStatus, signal, onSession = () => {}, pause = delay },
) {
  const initial = assertSession(session);
  const deadline = Date.now() + 45_000;
  for (let poll = 0; poll < 30 && Date.now() < deadline; poll++) {
    signal.throwIfAborted();
    const latest = assertSession(
      await getStatus(initial.sessionId, signal),
      initial.sessionId,
    );
    signal.throwIfAborted();
    if (
      latest.attemptsUsed < initial.attemptsUsed ||
      latest.maxAttempts !== initial.maxAttempts
    )
      throw trustError("VERIFICATION_RESPONSE_INVALID");
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
    onSession = () => {},
    onStage = () => {},
    onHint = () => {},
    pause = delay,
  },
) {
  let session = assertSession(initial);
  let sent = 0;
  const stage = (
    name,
    attemptNo = session.nextAttemptNo ?? session.attemptsUsed,
  ) =>
    onStage({
      stage: name,
      attemptNo,
      maxAttempts: session.maxAttempts,
      attemptsUsed: session.attemptsUsed,
    });
  onSession(session);
  while (true) {
    signal.throwIfAborted();
    if (session.status === "PROCESSING") {
      stage("recovering");
      session = await reconcileSession(session, {
        getStatus,
        signal,
        onSession,
        pause,
      });
      if (session.status !== "VERIFIED" && latestAttempt(session)?.errorCode)
        throw trustError(latestAttempt(session).errorCode);
    }
    if (session.status !== "READY") return session;
    if (sent >= MAX_ATTEMPTS) throw trustError("VERIFICATION_RESPONSE_INVALID");
    if (session.expiresAt && Date.parse(session.expiresAt) <= Date.now())
      throw trustError("VERIFICATION_SESSION_EXPIRED");
    const attemptNo = session.nextAttemptNo;
    const before = session.attemptsUsed;
    stage("recording", attemptNo);
    onHint(captureHint(session));
    let video = await record({ attemptNo, maxAttempts: session.maxAttempts });
    signal.throwIfAborted();
    sent++;
    stage("analyzing", attemptNo);
    try {
      let next;
      try {
        next = assertSession(
          await submit(session.sessionId, attemptNo, video, signal),
          session.sessionId,
        );
        if (
          next.attemptsUsed !== attemptNo ||
          next.maxAttempts !== session.maxAttempts
        )
          throw trustError("VERIFICATION_RESPONSE_INVALID");
      } catch (error) {
        if (signal.aborted) throw error;
        if (
          error?.code?.startsWith("PRIMARY_PHOTO_") ||
          [
            "VERIFICATION_RESPONSE_INVALID",
            "VERIFICATION_SESSION_EXPIRED",
            "VERIFICATION_SESSION_NOT_FOUND",
            "VIDEO_TYPE_NOT_ALLOWED",
            "VIDEO_TOO_LARGE",
            "VERIFICATION_CHALLENGE_INVALID",
            "AUTH_REQUIRED",
            "AUTH_TOKEN_MISSING",
          ].includes(error?.code)
        )
          throw error;
        stage("recovering", attemptNo);
        next = await reconcileSession(session, {
          getStatus,
          signal,
          onSession,
          pause,
        });
        if (next.status !== "VERIFIED" && next.attemptsUsed === before)
          throw error;
        if (
          next.attemptsUsed !== attemptNo ||
          next.maxAttempts !== session.maxAttempts
        )
          throw trustError("VERIFICATION_RESPONSE_INVALID");
      }
      signal.throwIfAborted();
      session = next;
      onSession(session);
      if (session.status !== "VERIFIED" && latestAttempt(session)?.errorCode)
        throw trustError(latestAttempt(session).errorCode);
    } finally {
      video = null;
    }
  }
}
