import assert from "node:assert/strict";
import test from "node:test";
import { onboardingStepFromStatus } from "../../shared/utils.js";
import {
  openCamera,
  previewCamera,
  recordClip,
  recorderOptions,
  stopCamera,
} from "./camera.js";
import {
  cameraError,
  PHOTO_REASONS,
  reorderPhotos,
  replaceFrontalPhoto,
  savedPhotoItems,
  sessionIssue,
  trustError,
  verificationIssue,
} from "./model.js";
import {
  assertSession,
  reconcileSession,
  verifySequentially,
} from "./verification.js";

function completed(attemptNo, decision = "RETRY", reason) {
  return {
    attemptNo,
    status: "COMPLETED",
    decision,
    reasonCodes:
      decision === "VERIFIED"
        ? []
        : [
            reason ||
              (decision === "NOT_VERIFIED"
                ? "FACE_MISMATCH"
                : "LIVENESS_FAILED"),
          ],
    errorCode: null,
  };
}
function sessionWith(decisions = [], overrides = {}) {
  const attempts = decisions.map((decision, index) =>
    typeof decision === "string" ? completed(index + 1, decision) : decision,
  );
  const attemptsUsed = attempts.length;
  const last = attempts.at(-1) ?? null;
  const status =
    overrides.status ||
    (last?.decision === "VERIFIED"
      ? "VERIFIED"
      : last?.status === "PROCESSING"
        ? "PROCESSING"
        : attemptsUsed === 5
          ? "EXHAUSTED"
          : "READY");
  return {
    sessionId: 7,
    status,
    attemptsUsed,
    maxAttempts: 5,
    remainingAttempts: 5 - attemptsUsed,
    nextAttemptNo: status === "READY" ? attemptsUsed + 1 : null,
    canRetry: status === "READY",
    attempt: last,
    attempts,
    ...overrides,
  };
}
const ready = (used = 0) => sessionWith(Array(used).fill("RETRY"));
const controller = () => new AbortController();
function dependencies(overrides = {}) {
  return {
    signal: controller().signal,
    record: async () => new File(["video"], "video.mp4", { type: "video/mp4" }),
    submit: async () => sessionWith(["VERIFIED"]),
    getStatus: async () => ready(),
    pause: async () => {},
    ...overrides,
  };
}

for (const decisions of [
  Array(5).fill("RETRY"),
  Array(5).fill("NOT_VERIFIED"),
  ["NOT_VERIFIED", "RETRY", "NOT_VERIFIED", "RETRY", "RETRY"],
]) {
  test(`${decisions.join("/")} submits five distinct clips in order in the same session`, async () => {
    const submitted = [];
    let recordings = 0;
    let inFlight = false;
    const result = await verifySequentially(
      ready(),
      dependencies({
        record: async () => {
          assert.equal(inFlight, false);
          return new File([String(++recordings)], "video.mp4", {
            type: "video/mp4",
          });
        },
        submit: async (id, attempt, video) => {
          assert.equal(inFlight, false);
          inFlight = true;
          submitted.push({ id, attempt, body: await video.text() });
          await Promise.resolve();
          inFlight = false;
          return sessionWith(decisions.slice(0, attempt));
        },
      }),
    );
    assert.equal(result.status, "EXHAUSTED");
    assert.equal(result.canRetry, false);
    assert.deepEqual(
      submitted.map((item) => item.attempt),
      [1, 2, 3, 4, 5],
    );
    assert.ok(submitted.every((item) => item.id === 7));
    assert.equal(new Set(submitted.map((item) => item.body)).size, 5);
    assert.equal(result.attempts.length, 5);
  });
}

for (const successAt of [1, 2, 3, 4, 5]) {
  test(`VERIFIED at attempt ${successAt} wins over previous failures and stops recording`, async () => {
    let recordings = 0;
    const decisions = Array.from({ length: successAt - 1 }, (_, index) =>
      index % 2 ? "RETRY" : "NOT_VERIFIED",
    );
    decisions.push("VERIFIED");
    const result = await verifySequentially(
      ready(),
      dependencies({
        record: async () => ++recordings,
        submit: async (_, number) => sessionWith(decisions.slice(0, number)),
      }),
    );
    assert.equal(recordings, successAt);
    assert.equal(result.status, "VERIFIED");
    assert.equal(sessionIssue(result), null);
  });
}

test("lost POST response recovers PROCESSING then VERIFIED without resubmitting", async () => {
  let submits = 0;
  let polls = 0;
  const result = await verifySequentially(
    ready(),
    dependencies({
      submit: async () => {
        submits++;
        throw new TypeError("network");
      },
      getStatus: async () =>
        ++polls === 1
          ? sessionWith([
              {
                attemptNo: 1,
                status: "PROCESSING",
                decision: null,
                reasonCodes: [],
                errorCode: null,
              },
            ])
          : sessionWith(["VERIFIED"]),
    }),
  );
  assert.equal(result.status, "VERIFIED");
  assert.equal(submits, 1);
  assert.equal(polls, 2);
});

test("lost NOT_VERIFIED response resumes using the server's nextAttemptNo", async () => {
  const numbers = [];
  const result = await verifySequentially(
    ready(2),
    dependencies({
      submit: async (_, number) => {
        numbers.push(number);
        if (number === 3) throw new TypeError("network");
        return sessionWith(["RETRY", "RETRY", "NOT_VERIFIED", "VERIFIED"]);
      },
      getStatus: async () => sessionWith(["RETRY", "RETRY", "NOT_VERIFIED"]),
    }),
  );
  assert.equal(result.status, "VERIFIED");
  assert.deepEqual(numbers, [3, 4]);
});

test("a rejected request that was not accepted is not automatically repeated", async () => {
  const error = trustError("AI_REQUEST_REJECTED");
  let submits = 0;
  await assert.rejects(
    verifySequentially(
      ready(),
      dependencies({
        submit: async () => {
          submits++;
          throw error;
        },
      }),
    ),
    error,
  );
  assert.equal(submits, 1);
});

test("PROCESSING is reconciled before opening the camera or recording", async () => {
  let recordings = 0;
  const result = await verifySequentially(
    sessionWith([
      {
        attemptNo: 1,
        status: "PROCESSING",
        decision: null,
        reasonCodes: [],
        errorCode: null,
      },
    ]),
    dependencies({
      record: async () => recordings++,
      getStatus: async () => sessionWith(["VERIFIED"]),
    }),
  );
  assert.equal(result.status, "VERIFIED");
  assert.equal(recordings, 0);
});

for (const number of [1, 5]) {
  test(`technical error at attempt ${number} remains a service error even when EXHAUSTED`, async () => {
    const failed = sessionWith([
      ...Array(number - 1).fill("RETRY"),
      {
        attemptNo: number,
        status: "ERROR",
        decision: null,
        reasonCodes: [],
        errorCode: "AI_SERVER_RESPONSE_INVALID",
      },
    ]);
    await assert.rejects(
      verifySequentially(
        ready(number - 1),
        dependencies({
          submit: async () => {
            throw trustError("AI_SERVER_RESPONSE_INVALID");
          },
          getStatus: async () => failed,
        }),
      ),
      { code: "AI_SERVER_RESPONSE_INVALID" },
    );
    assert.equal(sessionIssue(failed).kind, "system");
    if (number === 5) assert.equal(sessionIssue(failed).action, "restart");
  });
}

test("explicit retry can continue after a previous technical error", async () => {
  const first = {
    attemptNo: 1,
    status: "ERROR",
    decision: null,
    reasonCodes: [],
    errorCode: "AI_SERVER_UNAVAILABLE",
  };
  const numbers = [];
  const result = await verifySequentially(
    sessionWith([first]),
    dependencies({
      submit: async (_, number) => {
        numbers.push(number);
        return sessionWith([first, "VERIFIED"]);
      },
    }),
  );
  assert.deepEqual(numbers, [2]);
  assert.equal(result.status, "VERIFIED");
});

test("recovery stops after bounded polling and reports a status timeout", async () => {
  const pending = sessionWith([
    {
      attemptNo: 1,
      status: "PROCESSING",
      decision: null,
      reasonCodes: [],
      errorCode: null,
    },
  ]);
  let polls = 0;
  await assert.rejects(
    reconcileSession(
      pending,
      dependencies({
        getStatus: async () => {
          polls++;
          return pending;
        },
      }),
    ),
    { code: "VERIFICATION_STATUS_TIMEOUT" },
  );
  assert.equal(polls, 30);
});

test("GET failures are surfaced without submitting another video", async () => {
  await assert.rejects(
    verifySequentially(
      ready(),
      dependencies({
        submit: async () => {
          throw new TypeError("network");
        },
        getStatus: async () => {
          throw trustError("VERIFICATION_REQUEST_TIMEOUT");
        },
      }),
    ),
    { code: "VERIFICATION_REQUEST_TIMEOUT" },
  );
});

test("server validity, not a fixed 60-second timer, bounds sequential retries", async () => {
  const originalNow = Date.now;
  let clock = originalNow();
  let submits = 0;
  Date.now = () => clock;
  try {
    const result = await verifySequentially(
      ready(),
      dependencies({
        submit: async (_, number) => {
          clock += 61_000;
          submits++;
          return sessionWith([
            ...Array(number - 1).fill("NOT_VERIFIED"),
            number === 5 ? "VERIFIED" : "NOT_VERIFIED",
          ]);
        },
      }),
    );
    assert.equal(result.status, "VERIFIED");
    assert.equal(submits, 5);
  } finally {
    Date.now = originalNow;
  }
});

test("an expired session prevents another recording", async () => {
  let recordings = 0;
  await assert.rejects(
    verifySequentially(
      { ...ready(), expiresAt: new Date(Date.now() - 1).toISOString() },
      dependencies({ record: async () => recordings++ }),
    ),
    { code: "VERIFICATION_SESSION_EXPIRED" },
  );
  assert.equal(recordings, 0);
});

test("the last capture completes before its submission and result wait", async () => {
  const events = [];
  await verifySequentially(
    ready(4),
    dependencies({
      record: async () => {
        events.push("capture");
        return "clip";
      },
      onStage: ({ stage }) => events.push(stage),
      submit: async () => {
        events.push("submit");
        return sessionWith([...Array(4).fill("RETRY"), "VERIFIED"]);
      },
    }),
  );
  assert.deepEqual(events, ["recording", "capture", "analyzing", "submit"]);
});

test("cancellation before recording and during POST cannot submit more video", async () => {
  const abort = controller();
  abort.abort();
  let submissions = 0;
  await assert.rejects(
    verifySequentially(
      ready(),
      dependencies({ signal: abort.signal, submit: async () => submissions++ }),
    ),
    { name: "AbortError" },
  );
  assert.equal(submissions, 0);
  const active = controller();
  await assert.rejects(
    verifySequentially(
      ready(),
      dependencies({
        signal: active.signal,
        submit: async () => {
          submissions++;
          active.abort(trustError("CAMERA_INTERRUPTED"));
          return sessionWith(["RETRY"]);
        },
      }),
    ),
    { code: "CAMERA_INTERRUPTED" },
  );
  assert.equal(submissions, 1);
});

test("invalid and contradictory session data cannot initiate a recording", async () => {
  const invalid = [
    null,
    { ...ready(), sessionId: 0 },
    { ...ready(), status: "UNKNOWN" },
    { ...ready(), nextAttemptNo: 6 },
    { ...ready(), canRetry: false },
    { ...ready(), attemptsUsed: -1 },
    { ...ready(), remainingAttempts: 4 },
    { ...ready(), maxAttempts: 6 },
    { ...ready(), status: "EXHAUSTED", canRetry: false, nextAttemptNo: null },
    { ...ready(1), attempts: [] },
    { ...ready(1), attempt: null },
    sessionWith([{ ...completed(1), reasonCodes: [null] }]),
    { ...ready(2), attempts: [completed(2), completed(1)] },
    {
      ...sessionWith(["VERIFIED"]),
      status: "READY",
      canRetry: true,
      nextAttemptNo: 2,
    },
  ];
  let recordings = 0;
  for (const value of invalid)
    await assert.rejects(
      verifySequentially(
        value,
        dependencies({ record: async () => recordings++ }),
      ),
      { code: "VERIFICATION_RESPONSE_INVALID" },
    );
  assert.equal(recordings, 0);
});

test("a changed session ID, backwards counter or invalid submission sequence stops the flow", async () => {
  for (const response of [
    { ...sessionWith(["VERIFIED"]), sessionId: 8 },
    ready(),
    { ...ready(1), nextAttemptNo: 1 },
  ]) {
    let submits = 0;
    await assert.rejects(
      verifySequentially(
        ready(),
        dependencies({
          submit: async () => {
            submits++;
            return response;
          },
        }),
      ),
      { code: "VERIFICATION_RESPONSE_INVALID" },
    );
    assert.equal(submits, 1);
  }
  await assert.rejects(
    reconcileSession(
      ready(2),
      dependencies({ getStatus: async () => ready(1) }),
    ),
    { code: "VERIFICATION_RESPONSE_INVALID" },
  );
});

test("older responses without history remain supported, including closed NOT_VERIFIED sessions", async () => {
  const legacy = sessionWith(["NOT_VERIFIED"], { status: "NOT_VERIFIED" });
  delete legacy.attempts;
  assertSession(legacy);
  let records = 0;
  assert.equal(
    await verifySequentially(
      legacy,
      dependencies({ record: async () => records++ }),
    ),
    legacy,
  );
  assert.equal(records, 0);
  assert.equal(sessionIssue(legacy).kind, "photo");
});

class Recorder {
  static instances = [];
  static isTypeSupported(type) {
    return type === "video/mp4";
  }
  constructor(_, options) {
    this.mimeType = options.mimeType;
    this.state = "inactive";
    Recorder.instances.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["complete-mp4"], { type: this.mimeType }),
    });
    this.onstop?.();
  }
}

test("each clip has a new recorder and retains its actual MP4 MIME and extension", async () => {
  Recorder.instances.length = 0;
  const first = await recordClip({}, { duration: 1, Recorder });
  const second = await recordClip({}, { duration: 1, Recorder });
  assert.equal(Recorder.instances.length, 2);
  assert.equal(first.type, "video/mp4");
  assert.equal(second.name, "verification.mp4");
  assert.equal(await first.text(), "complete-mp4");
});

test("WebM is selected when MP4 is unsupported; unsupported browsers fail explicitly", () => {
  assert.equal(
    recorderOptions({
      isTypeSupported: (type) => type === "video/webm;codecs=vp8",
    }).mimeType,
    "video/webm;codecs=vp8",
  );
  assert.throws(() => recorderOptions({ isTypeSupported: () => false }), {
    code: "VIDEO_TYPE_NOT_ALLOWED",
  });
  assert.throws(() => recorderOptions(null), { code: "CAMERA_NOT_SUPPORTED" });
});

test("aborting a clip stops its recorder and camera cleanup stops all tracks", async () => {
  const abort = controller();
  const recording = recordClip({}, { signal: abort.signal, Recorder });
  abort.abort(trustError("CAMERA_INTERRUPTED"));
  await assert.rejects(recording, { code: "CAMERA_INTERRUPTED" });
  assert.equal(Recorder.instances.at(-1).state, "inactive");
  let stopped = 0;
  stopCamera({
    getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }],
  });
  assert.equal(stopped, 2);
});

test("still photo camera needs no video recorder and closes streams arriving after cancellation", async () => {
  const keys = ["navigator", "isSecureContext", "MediaRecorder"];
  const originals = keys.map((key) =>
    Object.getOwnPropertyDescriptor(globalThis, key),
  );
  let release;
  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => stopped++ }] };
  try {
    Object.defineProperty(globalThis, "isSecureContext", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        },
      },
    });
    const abort = controller();
    const camera = openCamera(abort.signal, { recordVideo: false });
    abort.abort(trustError("CAMERA_INTERRUPTED"));
    await assert.rejects(camera, { code: "CAMERA_INTERRUPTED" });
    release(stream);
    await Promise.resolve();
    assert.equal(stopped, 1);
    assert.throws(() => openCamera(controller().signal), {
      code: "CAMERA_NOT_SUPPORTED",
    });
  } finally {
    keys.forEach((key, index) => {
      if (originals[index])
        Object.defineProperty(globalThis, key, originals[index]);
      else delete globalThis[key];
    });
  }
});

test("photo order selects the feed photo while frontal identity follows its file", () => {
  const photos = ["primary", "frontal", "extra"].map((localId, index) => ({
    localId,
    isFrontal: index === 1,
  }));
  const reordered = reorderPhotos(photos, "primary", "extra");
  assert.deepEqual(
    reordered.map((item) => item.localId),
    ["frontal", "extra", "primary"],
  );
  const movedFrontal = reorderPhotos(reordered, "frontal", "extra");
  assert.equal(movedFrontal[0].localId, "extra");
  assert.equal(movedFrontal[0].isFrontal, false);
  assert.equal(movedFrontal[1], photos[1]);
  assert.deepEqual(
    photos.map((item) => item.localId),
    ["primary", "frontal", "extra"],
  );
  assert.equal(reorderPhotos(photos, "missing", "primary"), photos);
});

test("loading saved photos respects display order without promoting the frontal photo", () => {
  const saved = savedPhotoItems({
    images: [
      { fileId: 2, imageUrl: "2", displayOrder: 2, isFrontal: true },
      { fileId: 1, imageUrl: "1", displayOrder: 1, isFrontal: false },
    ],
  });
  assert.deepEqual(
    saved.map(({ fileId, isFrontal }) => ({ fileId, isFrontal })),
    [
      { fileId: 1, isFrontal: false },
      { fileId: 2, isFrontal: true },
    ],
  );
});

test("replacing a verified frontal photo preserves the feed photo and all other photo positions", () => {
  const photos = Array.from({ length: 6 }, (_, index) => ({
    localId: `photo-${index}`,
    fileId: index + 1,
    isFrontal: index === 2,
  }));
  const verified = { localId: "verified", fileId: 7, isFrontal: true };
  const replaced = replaceFrontalPhoto(photos, verified);
  assert.deepEqual(
    replaced.map((photo) => photo.fileId),
    [1, 2, 7, 4, 5, 6],
  );
  assert.equal(replaced[0], photos[0]);
  assert.equal(replaced[2], verified);
  assert.equal(replaced.filter((photo) => photo.isFrontal).length, 1);
  assert.equal(photos[2].fileId, 3);
  assert.deepEqual(replaceFrontalPhoto([], verified), [verified]);
  assert.deepEqual(replaceFrontalPhoto([photos[0]], verified), [
    photos[0],
    verified,
  ]);
});

test("photo failures and service failures show distinct recovery paths", () => {
  assert.equal(
    verificationIssue(
      trustError("PRIMARY_PHOTO_REJECTED", {
        reasonCodes: ["NON_FRONTAL_FACE"],
      }),
    ).kind,
    "photo",
  );
  assert.equal(
    verificationIssue(trustError("CAMERA_PERMISSION_DENIED")).kind,
    "camera",
  );
  assert.equal(
    verificationIssue(trustError("AI_SERVER_UNAVAILABLE")).kind,
    "system",
  );
  assert.equal(
    onboardingStepFromStatus({ onboardingNextStep: "FACE_VERIFICATION" }),
    "photo-intro",
  );
});

test("native DOMException numeric codes cannot break camera error rendering", () => {
  const denied = cameraError(new DOMException("denied", "NotAllowedError"));
  const missing = cameraError(new DOMException("missing", "NotFoundError"));
  assert.equal(denied.code, "CAMERA_PERMISSION_DENIED");
  assert.equal(missing.code, "CAMERA_NOT_FOUND");
  assert.equal(
    verificationIssue(new DOMException("aborted", "AbortError")).kind,
    "system",
  );
});

test("all photo rejection reasons use photo replacement guidance without exposing raw codes", () => {
  for (const code of Object.keys(PHOTO_REASONS)) {
    const issue = verificationIssue(
      trustError("PRIMARY_PHOTO_REJECTED", { reasonCodes: [code] }),
    );
    assert.equal(issue.kind, "photo");
    assert.equal(issue.action, "replace");
    assert.equal(issue.message, PHOTO_REASONS[code]);
    assert.ok(!issue.message.includes(code));
  }
  const suspected = verificationIssue(
    trustError("PRIMARY_PHOTO_REJECTED", { reasonCodes: ["SYNTHETIC_RISK"] }),
  );
  assert.match(suspected.message, /가능성/);
  const confirmed = verificationIssue(
    trustError("PRIMARY_PHOTO_REJECTED", {
      reasonCodes: ["CONFIRMED_SYNTHETIC", "NON_FRONTAL_FACE"],
    }),
  );
  assert.match(confirmed.title, /사용할 수 없어요/);
  assert.equal(confirmed.details.length, 1);
});

test("every combination of five normal failure results retains specific additional guidance", () => {
  const codes = [
    "FACE_MISMATCH",
    "NO_FACE",
    "FACE_COMPARISON_FAILED",
    "LIVENESS_FAILED",
  ];
  for (let combination = 0; combination < 4 ** 5; combination++) {
    const reasons = Array.from(
      { length: 5 },
      (_, index) => codes[Math.floor(combination / 4 ** index) % 4],
    );
    const attempts = reasons.map((code, index) =>
      completed(
        index + 1,
        code === "FACE_MISMATCH" ? "NOT_VERIFIED" : "RETRY",
        code,
      ),
    );
    const issue = sessionIssue(sessionWith(attempts));
    assert.equal(
      issue.kind,
      reasons.includes("FACE_MISMATCH") ? "photo" : "camera",
    );
    assert.equal(issue.details.length, new Set(reasons).size - 1);
    assert.equal(
      new Set([issue.message, ...issue.details]).size,
      new Set(reasons).size,
    );
  }
});

test("a final technical error takes precedence over historic mismatch, while historic errors do not override later results", () => {
  const errorAt = (attemptNo) => ({
    attemptNo,
    status: "ERROR",
    decision: null,
    reasonCodes: [],
    errorCode: "AI_SERVER_UNAVAILABLE",
  });
  const system = sessionIssue(
    sessionWith(["NOT_VERIFIED", "RETRY", "NOT_VERIFIED", "RETRY", errorAt(5)]),
  );
  assert.equal(system.kind, "system");
  assert.equal(system.code, "AI_SERVER_UNAVAILABLE");
  assert.ok(system.details.length > 0);
  assert.equal(
    sessionIssue(sessionWith([errorAt(1), "RETRY", "RETRY", "RETRY", "RETRY"]))
      .kind,
    "camera",
  );
  assert.equal(sessionIssue(sessionWith([errorAt(1), "VERIFIED"])), null);
});

test("missing and unknown reasons use safe result-information guidance", () => {
  for (const value of [
    null,
    { status: "EXHAUSTED" },
    sessionWith([completed(1, "RETRY", "FUTURE_REASON")], {
      status: "NOT_VERIFIED",
    }),
  ]) {
    const issue = sessionIssue(value);
    assert.equal(issue.kind, "system");
    assert.equal(issue.code, "VERIFICATION_RESPONSE_INVALID");
    assert.ok(!issue.message.includes("FUTURE_REASON"));
  }
});

test("photo conversion, expired photo and invalid file errors require another photo", () => {
  for (const code of [
    "PHOTO_CONVERSION_FAILED",
    "PRIMARY_PHOTO_EXPIRED",
    "PRIMARY_PHOTO_CHANGED",
    "FILE_INVALID_CONTENT",
    "FILE_TOO_LARGE",
    "FILE_TYPE_NOT_ALLOWED",
  ]) {
    assert.equal(verificationIssue(trustError(code)).action, "replace");
  }
});

test("camera device, permission, recording and browser failures have camera recovery", () => {
  for (const code of [
    "CAMERA_HTTPS_REQUIRED",
    "CAMERA_NOT_SUPPORTED",
    "CAMERA_PERMISSION_DENIED",
    "CAMERA_NOT_FOUND",
    "CAMERA_IN_USE",
    "CAMERA_INTERRUPTED",
    "CAMERA_START_TIMEOUT",
    "CAMERA_CAPTURE_FAILED",
    "VIDEO_EMPTY",
    "VIDEO_TOO_LARGE",
    "VIDEO_TYPE_NOT_ALLOWED",
  ]) {
    const issue = verificationIssue(trustError(code));
    assert.equal(issue.kind, "camera");
    assert.equal(issue.action, "retry");
    assert.ok(issue.title && issue.message);
  }
});

test("AI response errors, frontend response errors, connection errors and backend errors have different messages", () => {
  const errors = [
    trustError("AI_SERVER_RESPONSE_INVALID"),
    trustError("VERIFICATION_RESPONSE_INVALID"),
    new TypeError("Failed to fetch"),
    trustError("INTERNAL_SERVER_ERROR"),
  ];
  const issues = errors.map(verificationIssue);
  assert.equal(new Set(issues.map((issue) => issue.title)).size, 4);
  assert.ok(issues.every((issue) => issue.kind === "system"));
  assert.match(
    verificationIssue({ code: "HTTP_502", status: 502 }).title,
    /서버/,
  );
  assert.match(verificationIssue(trustError("AUTH_REQUIRED")).title, /로그인/);
});

test("expired sessions and challenges restart the camera flow", () => {
  for (const code of [
    "VERIFICATION_SESSION_EXPIRED",
    "VERIFICATION_CHALLENGE_INVALID",
  ]) {
    assert.equal(verificationIssue(trustError(code)).kind, "camera");
  }
  assert.equal(
    sessionIssue({ status: "EXPIRED" }).code,
    "VERIFICATION_SESSION_EXPIRED",
  );
});

test("a returned ERROR response never starts another automatic recording", async () => {
  let records = 0;
  await assert.rejects(
    verifySequentially(
      ready(),
      dependencies({
        record: async () => ++records,
        submit: async () =>
          sessionWith([
            {
              attemptNo: 1,
              status: "ERROR",
              decision: null,
              reasonCodes: [],
              errorCode: "VERIFICATION_FAILED",
            },
          ]),
      }),
    ),
    { code: "VERIFICATION_FAILED" },
  );
  assert.equal(records, 1);
});

test("recording progress starts at zero and only reaches completion for a usable clip", async () => {
  const values = [];
  await recordClip(
    {},
    { duration: 210, Recorder, onProgress: (value) => values.push(value) },
  );
  assert.equal(values[0], 0);
  assert.ok(values.some((value) => value > 0 && value < 1));
  assert.equal(values.at(-1), 1);
  const abort = controller();
  const cancelled = [];
  const pending = recordClip(
    {},
    {
      duration: 500,
      Recorder,
      signal: abort.signal,
      onProgress: (value) => cancelled.push(value),
    },
  );
  abort.abort(trustError("CAMERA_INTERRUPTED"));
  await assert.rejects(pending, { code: "CAMERA_INTERRUPTED" });
  assert.deepEqual(cancelled, [0]);
});

test("all bounded RETRY/NOT_VERIFIED decision sequences continue until success or five attempts", async () => {
  for (let length = 0; length <= 5; length++) {
    for (let mask = 0; mask < 2 ** length; mask++) {
      const decisions = Array.from({ length }, (_, index) =>
        mask & (1 << index) ? "NOT_VERIFIED" : "RETRY",
      );
      if (length < 5) decisions.push("VERIFIED");
      let submitted = 0;
      const result = await verifySequentially(
        ready(),
        dependencies({
          submit: async (_, number) => {
            submitted++;
            return sessionWith(decisions.slice(0, number));
          },
        }),
      );
      assert.equal(submitted, decisions.length);
      assert.equal(result.status, length === 5 ? "EXHAUSTED" : "VERIFIED");
    }
  }
});

test("unrecognized reason names cannot access object prototype values or render raw payloads", () => {
  for (const code of [
    "__proto__",
    "constructor",
    "toString",
    "<script>alert(1)</script>",
  ]) {
    const issue = verificationIssue(
      trustError("PRIMARY_PHOTO_REJECTED", { reasonCodes: [code] }),
    );
    assert.equal(typeof issue.message, "string");
    assert.equal(issue.kind, "photo");
    assert.ok(!issue.message.includes(code));
  }
});

test("preview play failures are translated into camera guidance and cleaned up", async () => {
  const video = new EventTarget();
  video.play = () => {
    throw new Error("cannot play");
  };
  await assert.rejects(previewCamera(video, {}, controller().signal), {
    code: "CAMERA_IN_USE",
  });
});

test("synchronous camera device errors use native permission guidance", async () => {
  const keys = ["navigator", "isSecureContext", "MediaRecorder"];
  const originals = keys.map((key) =>
    Object.getOwnPropertyDescriptor(globalThis, key),
  );
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: () => {
            throw new DOMException("denied", "SecurityError");
          },
        },
      },
    });
    Object.defineProperty(globalThis, "isSecureContext", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      value: Recorder,
    });
    await assert.rejects(openCamera(controller().signal), {
      code: "CAMERA_PERMISSION_DENIED",
    });
  } finally {
    keys.forEach((key, index) => {
      if (originals[index])
        Object.defineProperty(globalThis, key, originals[index]);
      else delete globalThis[key];
    });
  }
});

test("empty, unsupported, oversized and broken recordings cannot be submitted", async () => {
  class EmptyRecorder extends Recorder {
    stop() {
      this.state = "inactive";
      this.onstop?.();
    }
  }
  class UnsupportedRecorder extends Recorder {
    constructor(stream, options) {
      super(stream, options);
      this.mimeType = "video/unknown";
    }
  }
  class LargeRecorder extends Recorder {
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({
        data: new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]),
      });
      this.onstop?.();
    }
  }
  class BrokenRecorder extends Recorder {
    start() {
      super.start();
      queueMicrotask(() => this.onerror?.());
    }
  }
  for (const [TestRecorder, code] of [
    [EmptyRecorder, "VIDEO_EMPTY"],
    [UnsupportedRecorder, "VIDEO_TYPE_NOT_ALLOWED"],
    [LargeRecorder, "VIDEO_TOO_LARGE"],
    [BrokenRecorder, "VIDEO_EMPTY"],
  ])
    await assert.rejects(
      recordClip({}, { duration: 1, Recorder: TestRecorder }),
      { code },
    );
});

test("backend session, video and request rejection codes provide explicit restart guidance", () => {
  for (const code of [
    "VERIFICATION_SESSION_NOT_FOUND",
    "VERIFICATION_SESSION_CLOSED",
    "VERIFICATION_ATTEMPT_LIMIT_REACHED",
    "VERIFICATION_DUPLICATE_VIDEO",
    "VIDEO_READ_FAILED",
    "AI_REQUEST_REJECTED",
  ]) {
    const issue = verificationIssue(trustError(code));
    assert.equal(issue.kind, "camera");
    assert.equal(issue.action, "retry");
    assert.ok(!issue.message.includes(code));
  }
  for (const code of [
    "VERIFICATION_USER_NOT_FOUND",
    "VERIFICATION_IN_PROGRESS",
    "VERIFICATION_ATTEMPT_OUT_OF_ORDER",
    "VERIFICATION_ATTEMPT_CONFLICT",
    "PRIMARY_PHOTO_UNAVAILABLE",
  ]) {
    const issue = verificationIssue(trustError(code));
    assert.equal(issue.kind, "system");
    assert.ok(!issue.message.includes(code));
  }
  assert.equal(
    verificationIssue(new SyntaxError("untrusted body")).code,
    "VERIFICATION_RESPONSE_INVALID",
  );
});
