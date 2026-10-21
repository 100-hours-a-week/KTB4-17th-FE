import { trustError } from "./model.js";

const REQUIRED_FRAMES = 15;
export const CENTER_HOLD_MS = 3_000;
const MAX_POSITION_DEVIATION = 0.02;
export const CENTER_HINTS = Object.freeze({
  NO_FACE: "얼굴 전체가 화면에 보이도록 맞춰 주세요.",
  MULTIPLE_FACES: "혼자 화면에 들어와 주세요.",
  INVALID_POSE: "얼굴이 선명하게 보이도록 카메라를 봐 주세요.",
  CROPPED: "얼굴 전체가 가이드 안에 들어오도록 맞춰 주세요.",
  CLOSER: "카메라에 조금 더 가까이 와 주세요.",
  BACK: "카메라에서 조금 멀어져 주세요.",
  LEFT: "화면 기준 왼쪽으로 조금 이동해 주세요.",
  RIGHT: "화면 기준 오른쪽으로 조금 이동해 주세요.",
  UP: "얼굴을 조금 위로 맞춰 주세요.",
  DOWN: "얼굴을 조금 아래로 맞춰 주세요.",
  FRONTAL: "고개를 들거나 숙이지 말고 카메라를 정면으로 봐 주세요.",
  LEVEL: "고개를 기울이지 말고 똑바로 해 주세요.",
  HOLD: "좋아요. 정면으로 잠깐 가만히 있어 주세요.",
  READY: "정면 확인을 마쳤어요. 다음 포즈를 준비해 주세요.",
});

export function facePosition(result) {
  if (!result?.faceLandmarks?.length) return { issue: "NO_FACE" };
  if (result.faceLandmarks.length !== 1) return { issue: "MULTIPLE_FACES" };
  const points = result.faceLandmarks[0];
  const m = result.facialTransformationMatrixes?.[0]?.data;
  if (
    !points.length ||
    m?.length !== 16 ||
    [...m].some((n) => !Number.isFinite(n)) ||
    points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))
  )
    return { issue: "INVALID_POSE" };
  if (Math.hypot(m[0], m[1], m[2]) < 1e-8 || Math.hypot(m[6], m[10]) < 1e-8)
    return { issue: "INVALID_POSE" };
  const xs = points.map((point) => point.x),
    ys = points.map((point) => point.y);
  const left = Math.min(...xs),
    right = Math.max(...xs),
    top = Math.min(...ys),
    bottom = Math.max(...ys);
  const toDeg = 180 / Math.PI;
  // JS SDK는 column-major 배열을 반환한다. Python의 4x4 행렬과 같은 축으로 읽는다.
  const pitch = Math.atan2(m[6], m[10]) * toDeg;
  const yaw = -Math.atan2(m[2], Math.hypot(m[6], m[10])) * toDeg;
  const roll = Math.atan2(-m[1], m[0]) * toDeg;
  const face = {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
    yaw,
    pitch,
    roll,
  };
  let issue = null;
  if (left < 0 || top < 0 || right > 1 || bottom > 1) issue = "CROPPED";
  else if (face.width < 0.18 || face.height < 0.3) issue = "CLOSER";
  else if (face.width > 0.5 || face.height > 0.8) issue = "BACK";
  else if (face.x < 0.38) issue = "LEFT";
  else if (face.x > 0.62) issue = "RIGHT";
  else if (face.y < 0.34) issue = "DOWN";
  else if (face.y > 0.62) issue = "UP";
  else if (Math.abs(yaw) > 15 || Math.abs(pitch) > 15) issue = "FRONTAL";
  else if (Math.abs(roll) > 12) issue = "LEVEL";
  return { ...face, issue };
}

export function centerProgress(history, result) {
  const face = facePosition(result);
  const next = face.issue ? [] : [...history, face].slice(-REQUIRED_FRAMES);
  const deviation = (key) => {
    const mean = next.reduce((sum, item) => sum + item[key], 0) / next.length;
    return Math.sqrt(
      next.reduce((sum, item) => sum + (item[key] - mean) ** 2, 0) /
        next.length,
    );
  };
  const ready =
    next.length === REQUIRED_FRAMES &&
    deviation("yaw") <= 2 &&
    deviation("pitch") <= 2 &&
    deviation("x") <= MAX_POSITION_DEVIATION &&
    deviation("y") <= MAX_POSITION_DEVIATION;
  return {
    history: next,
    ready,
    hint: CENTER_HINTS[face.issue || (ready ? "READY" : "HOLD")],
    progress: next.length / REQUIRED_FRAMES,
  };
}

// 프레임 개수가 아닌 실제 경과 시간으로 유지 시간을 계산한다.
export function centerHoldProgress(previous, result, now) {
  const state = centerProgress(previous.history, result);
  const stable =
    state.history.length > 0 &&
    (state.history.length < REQUIRED_FRAMES || state.ready);
  const since = stable ? (previous.since ?? now) : null;
  const elapsed = since == null ? 0 : Math.max(0, now - since);
  const done = state.ready && elapsed >= CENTER_HOLD_MS;
  const progress = stable ? Math.min(elapsed / CENTER_HOLD_MS, 1) : 0;
  return {
    ...state,
    since,
    done,
    progress,
    hint: done
      ? CENTER_HINTS.READY
      : stable
        ? `정면을 그대로 유지해 주세요. ${Math.max(1, Math.ceil((CENTER_HOLD_MS - elapsed) / 1000))}초 후 자동으로 넘어가요.`
        : state.hint,
  };
}

async function createTracker() {
  const { FaceLandmarker, FilesetResolver } = await import(
    "@mediapipe/tasks-vision"
  );
  const root = `${import.meta.env.BASE_URL}vision/`;
  const files = await FilesetResolver.forVisionTasks(`${root}wasm`);
  return FaceLandmarker.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: `${root}face_landmarker.task`,
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    numFaces: 2,
    outputFacialTransformationMatrixes: true,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export function waitForCenteredFace(
  video,
  { signal, onState, create = createTracker },
) {
  return new Promise((resolve, reject) => {
    let tracker,
      timer,
      settled = false,
      hold = { history: [], since: null };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(deadline);
      signal.removeEventListener("abort", abort);
      try {
        tracker?.close();
      } catch {
        /* Release is best effort after interruption. */
      }
      if (error) reject(error);
      else resolve();
    };
    const abort = () =>
      finish(signal.reason || trustError("CAMERA_INTERRUPTED"));
    const deadline = setTimeout(
      () => finish(trustError("CAMERA_ALIGNMENT_TIMEOUT")),
      60_000,
    );
    const tick = () => {
      if (settled) return;
      try {
        if (!video || video.readyState < 2)
          throw trustError("CAMERA_INTERRUPTED");
        const now = performance.now();
        hold = centerHoldProgress(
          hold,
          tracker.detectForVideo(video, now),
          now,
        );
        onState({
          ready: hold.ready,
          hint: hold.hint,
          progress: hold.progress,
        });
        if (hold.done) finish();
        else if (!settled) timer = setTimeout(tick, 100);
      } catch {
        finish(trustError("CAMERA_MODEL_UNAVAILABLE"));
      }
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    Promise.resolve()
      .then(create)
      .then(
        (created) => {
          if (settled) {
            created.close();
            return;
          }
          tracker = created;
          tick();
        },
        () => finish(trustError("CAMERA_MODEL_UNAVAILABLE")),
      );
  });
}
