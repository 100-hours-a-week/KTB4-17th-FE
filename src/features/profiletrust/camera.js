import {
  CLIP_DURATION_MS,
  cameraError,
  MAX_VIDEO_BYTES,
  trustError,
} from "./model.js";

// 서버 프록시가 요청 본문을 1MB 안팎으로 막아도 최대 17.5초 영상이 들어가게 한다.
// 서버는 최대 48장만 샘플링하므로 15fps면 단계 유지 판정에 충분하다.
export const RECORDING_BITS_PER_SECOND = 400_000;
export const RECORDING_FRAME_RATE = 15;

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
  return { mimeType, videoBitsPerSecond: RECORDING_BITS_PER_SECOND };
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
            frameRate: { ideal: RECORDING_FRAME_RATE },
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

const newCanvas = () => document.createElement("canvas");

// 미리보기처럼 거울 방향(좌우 반전)으로 그린다. 아이폰 셀카도 거울 방향으로 저장되므로 사진·녹화 영상의 방향을 맞춘다.
function drawMirrored(context, video, width, height) {
  context.setTransform(-1, 0, 0, 1, width, 0);
  context.drawImage(video, 0, 0, width, height);
}

export function capturePhoto(video, { createCanvas = newCanvas } = {}) {
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
      const canvas = createCanvas();
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw trustError("CAMERA_CAPTURE_FAILED");
      drawMirrored(context, video, canvas.width, canvas.height);
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

// 미리보기 <video>를 거울 방향으로 캔버스에 옮겨 그 캔버스를 녹화한다. <video>에서 그리면 휴대폰 회전 정보도
// 반영된 바로 선 화면이 된다. 캔버스 녹화를 지원하지 않으면 null을 돌려주고 호출부는 원본 스트림을 녹화한다.
export function mirrorVideoStream(
  video,
  { createCanvas = newCanvas, frameRate = RECORDING_FRAME_RATE } = {},
) {
  if (!video?.videoWidth || !video?.videoHeight) return null;
  const canvas = createCanvas();
  const context = canvas.getContext?.("2d");
  if (!context || typeof canvas.captureStream !== "function") return null;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  // requestVideoFrameCallback은 미리보기가 화면에 그려질 때만 불려(Chromium 측정: 원본 43장 동안 2번)
  // 빈 영상이 될 수 있다. 화면 표시와 무관하게 녹화 프레임 수만큼 타이머로 그린다.
  const draw = () => drawMirrored(context, video, canvas.width, canvas.height);
  draw();
  const timer = setInterval(draw, 1000 / frameRate);
  const stream = canvas.captureStream(frameRate);
  return {
    stream,
    stop() {
      clearInterval(timer);
      for (const track of stream.getTracks()) track.stop();
    },
  };
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
    until,
    mirrorFrom,
    createCanvas = newCanvas,
  } = {},
) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const mirrored = mirrorFrom
      ? mirrorVideoStream(mirrorFrom, { createCanvas })
      : null;
    let recorder;
    try {
      recorder = new Recorder(
        mirrored?.stream ?? stream,
        recorderOptions(Recorder),
      );
    } catch {
      mirrored?.stop();
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
      mirrored?.stop();
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
      if (until) {
        Promise.resolve()
          .then(until)
          .then(
            () => {
              try {
                if (!settled && recorder.state !== "inactive") recorder.stop();
              } catch {
                finish(trustError("VIDEO_EMPTY"));
              }
            },
            (error) => finish(error),
          );
      }
      const startedAt = Date.now();
      onProgress(0);
      progressTimer = setInterval(
        () => onProgress(Math.min((Date.now() - startedAt) / duration, 1)),
        100,
      );
      stopTimer = setTimeout(() => {
        if (until) {
          finish(trustError("CAMERA_ALIGNMENT_TIMEOUT"));
          return;
        }
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
