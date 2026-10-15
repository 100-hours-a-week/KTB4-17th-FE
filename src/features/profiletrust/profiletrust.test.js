import assert from "node:assert/strict";
import test from "node:test";
import { onboardingStepFromStatus } from "../../shared/utils.js";
import {
  openCamera,
  recordClip,
  recorderOptions,
  stopCamera,
} from "./camera.js";
import {
  cameraError,
  reorderPhotos,
  replaceFrontalPhoto,
  savedPhotoItems,
  sessionIssue,
  trustError,
  verificationIssue,
} from "./model.js";
import { verifySequentially } from "./verification.js";

const ready = (used = 0) => ({
  sessionId: 7,
  status: "READY",
  attemptsUsed: used,
  nextAttemptNo: used + 1,
  canRetry: true,
});
const controller = () => new AbortController();

function dependencies(overrides = {}) {
  return {
    signal: controller().signal,
    record: async () => new File(["video"], "video.mp4", { type: "video/mp4" }),
    submit: async () => ({
      ...ready(1),
      status: "VERIFIED",
      nextAttemptNo: null,
    }),
    getStatus: async () => ready(),
    pause: async () => {},
    ...overrides,
  };
}

test("RETRY submits distinct clips sequentially, stops at the fifth attempt", async () => {
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
        return {
          ...ready(attempt),
          status: attempt === 5 ? "EXHAUSTED" : "READY",
          attempt: { decision: "RETRY", reasonCodes: ["LIVENESS_FAILED"] },
        };
      },
    }),
  );
  assert.equal(result.status, "EXHAUSTED");
  assert.deepEqual(
    submitted.map((item) => item.attempt),
    [1, 2, 3, 4, 5],
  );
  assert.equal(new Set(submitted.map((item) => item.body)).size, 5);
});

test("VERIFIED ends immediately without recording another clip", async () => {
  let recordings = 0;
  const result = await verifySequentially(
    ready(),
    dependencies({ record: async () => ++recordings }),
  );
  assert.equal(result.status, "VERIFIED");
  assert.equal(recordings, 1);
});

test("face mismatch terminates the session without automatic retries", async () => {
  let submits = 0;
  const result = await verifySequentially(
    ready(),
    dependencies({
      submit: async () => {
        submits++;
        return {
          ...ready(1),
          status: "NOT_VERIFIED",
          attempt: { reasonCodes: ["FACE_MISMATCH"] },
        };
      },
    }),
  );
  assert.equal(submits, 1);
  assert.equal(sessionIssue(result).kind, "mismatch");
});

test("lost POST response recovers VERIFIED via GET without resubmitting", async () => {
  let submits = 0;
  let polls = 0;
  const result = await verifySequentially(
    ready(),
    dependencies({
      submit: async () => {
        submits++;
        throw new TypeError("network");
      },
      getStatus: async () => ({
        ...ready(1),
        status: ++polls === 1 ? "PROCESSING" : "VERIFIED",
      }),
    }),
  );
  assert.equal(result.status, "VERIFIED");
  assert.equal(submits, 1);
  assert.equal(polls, 2);
});

test("lost RETRY response uses server nextAttemptNo instead of repeating a number", async () => {
  const attempts = [];
  const result = await verifySequentially(
    ready(2),
    dependencies({
      submit: async (_, attempt) => {
        attempts.push(attempt);
        if (attempt === 3) throw new TypeError("network");
        return { ...ready(4), status: "VERIFIED" };
      },
      getStatus: async () => ({
        ...ready(3),
        attempt: { decision: "RETRY", reasonCodes: ["NO_FACE"] },
      }),
    }),
  );
  assert.equal(result.status, "VERIFIED");
  assert.deepEqual(attempts, [3, 4]);
});

test("unknown server rejection is surfaced when GET shows no accepted attempt", async () => {
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

test("processing session is reconciled before any new recording", async () => {
  let recordings = 0;
  const result = await verifySequentially(
    { ...ready(1), status: "PROCESSING" },
    dependencies({
      record: async () => recordings++,
      getStatus: async () => ({ ...ready(1), status: "VERIFIED" }),
    }),
  );
  assert.equal(result.status, "VERIFIED");
  assert.equal(recordings, 0);
});

test("camera deadline prevents a new clip but allows a pending success", async () => {
  await assert.rejects(
    verifySequentially(ready(), dependencies({ canRecord: () => false })),
    { code: "CAMERA_TIME_LIMIT" },
  );
  let withinBudget = true;
  const result = await verifySequentially(
    ready(),
    dependencies({
      canRecord: () => withinBudget,
      submit: async () => {
        withinBudget = false;
        return { ...ready(1), status: "VERIFIED" };
      },
    }),
  );
  assert.equal(result.status, "VERIFIED");
});

test("cancellation and invalid server sequencing cannot submit more video", async () => {
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
  await assert.rejects(
    verifySequentially({ ...ready(), nextAttemptNo: 6 }, dependencies()),
    { code: "VERIFICATION_RESPONSE_INVALID" },
  );
  assert.equal(submissions, 0);
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
