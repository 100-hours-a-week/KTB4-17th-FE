import {
  CLIP_DURATION_MS,
  cameraError,
  MAX_VIDEO_BYTES,
  trustError,
} from "./model.js";

const VIDEO_TYPES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
  "video/webm;codecs=vp8",
  "video/webm",
];

export function recorderOptions(Recorder = globalThis.MediaRecorder) {
  if (!Recorder || typeof Recorder.isTypeSupported !== "function")
    throw trustError("CAMERA_NOT_SUPPORTED");
  const mimeType = VIDEO_TYPES.find((type) => Recorder.isTypeSupported(type));
  if (!mimeType) throw trustError("VIDEO_TYPE_NOT_ALLOWED");
  return { mimeType, videoBitsPerSecond: 1_000_000 };
}

export function stopCamera(stream) {
  for (const track of stream?.getTracks() || []) track.stop();
}

// Permission prompts cannot be cancelled by getUserMedia. If the user leaves
// while a prompt is open, dispose of any stream that arrives afterwards.
export function openCamera(signal, { recordVideo = true } = {}) {
  if (!globalThis.isSecureContext)
    return Promise.reject(trustError("CAMERA_HTTPS_REQUIRED"));
  if (!globalThis.navigator?.mediaDevices?.getUserMedia)
    return Promise.reject(trustError("CAMERA_NOT_SUPPORTED"));
  if (recordVideo) recorderOptions();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, stream) => {
      if (settled) {
        stopCamera(stream);
        return;
      }
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(stream);
    };
    const abort = () =>
      finish(signal.reason || new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(
      () => finish(trustError("CAMERA_START_TIMEOUT")),
      30_000,
    );
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    try {
      Promise.resolve(
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 24 },
          },
        }),
      ).then(
        (stream) => finish(null, stream),
        (error) => finish(cameraError(error)),
      );
    } catch (error) {
      finish(cameraError(error));
    }
  });
}

export function capturePhoto(video) {
  return new Promise((resolve, reject) => {
    if (
      !video ||
      video.readyState < 2 ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      reject(trustError("CAMERA_CAPTURE_FAILED"));
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw trustError("CAMERA_CAPTURE_FAILED");
      context.drawImage(video, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (!blob?.size) reject(trustError("CAMERA_CAPTURE_FAILED"));
          else
            resolve(new File([blob], "frontal-photo.jpg", { type: blob.type }));
        },
        "image/jpeg",
        0.92,
      );
    } catch {
      reject(trustError("CAMERA_CAPTURE_FAILED"));
    }
  });
}

export function previewCamera(video, stream, signal) {
  if (!video) return Promise.reject(trustError("CAMERA_INTERRUPTED"));
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", ready);
      video.removeEventListener("error", failed);
      signal.removeEventListener("abort", abort);
    };
    const ready = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(trustError("CAMERA_IN_USE"));
    };
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    const timer = setTimeout(failed, 15_000);
    video.addEventListener("loadeddata", ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    try {
      Promise.resolve(video.play()).then(() => {
        if (video.readyState >= 2) ready();
      }, failed);
    } catch {
      failed();
    }
  });
}

// Recreate the recorder for each attempt. Individual timeslice chunks from a
// single long recording are not necessarily standalone video files.
export function recordClip(
  stream,
  {
    signal,
    duration = CLIP_DURATION_MS,
    Recorder = globalThis.MediaRecorder,
    onProgress = () => {},
  } = {},
) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    let recorder;
    try {
      recorder = new Recorder(stream, recorderOptions(Recorder));
    } catch {
      reject(trustError("VIDEO_TYPE_NOT_ALLOWED"));
      return;
    }
    let settled = false;
    let bytes = 0;
    let stopTimer;
    let watchdog;
    let progressTimer;
    const chunks = [];
    const finish = (error, file) => {
      if (settled) return;
      settled = true;
      clearTimeout(stopTimer);
      clearTimeout(watchdog);
      clearInterval(progressTimer);
      signal?.removeEventListener("abort", abort);
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          /* Already stopped by the device. */
        }
      }
      chunks.length = 0;
      if (error) reject(error);
      else resolve(file);
    };
    const abort = () =>
      finish(signal.reason || new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    recorder.ondataavailable = (event) => {
      if (!event.data?.size) return;
      bytes += event.data.size;
      if (bytes > MAX_VIDEO_BYTES) {
        finish(trustError("VIDEO_TOO_LARGE"));
        return;
      }
      chunks.push(event.data);
    };
    recorder.onerror = () => finish(trustError("VIDEO_EMPTY"));
    recorder.onstop = () => {
      const mimeType = recorder.mimeType || chunks[0]?.type || "";
      const baseType = mimeType.split(";", 1)[0].toLowerCase();
      if (!["video/mp4", "video/webm", "video/quicktime"].includes(baseType)) {
        finish(trustError("VIDEO_TYPE_NOT_ALLOWED"));
        return;
      }
      if (!bytes) {
        finish(trustError("VIDEO_EMPTY"));
        return;
      }
      const file = new File(
        chunks,
        `verification.${baseType === "video/webm" ? "webm" : baseType === "video/quicktime" ? "mov" : "mp4"}`,
        { type: mimeType },
      );
      onProgress(1);
      finish(null, file);
    };
    try {
      recorder.start(1_000);
      const startedAt = Date.now();
      onProgress(0);
      progressTimer = setInterval(
        () => onProgress(Math.min((Date.now() - startedAt) / duration, 1)),
        100,
      );
      stopTimer = setTimeout(() => {
        try {
          if (recorder.state !== "inactive") recorder.stop();
        } catch {
          finish(trustError("VIDEO_EMPTY"));
        }
      }, duration);
      watchdog = setTimeout(
        () => finish(trustError("CAMERA_INTERRUPTED")),
        duration + 10_000,
      );
    } catch {
      finish(trustError("VIDEO_EMPTY"));
    }
  });
}
