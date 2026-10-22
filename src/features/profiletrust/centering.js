import { trustError } from "./model.js";

const REQUIRED_FRAMES = 15;
export const CENTER_HOLD_MS = 2_000;
const MAX_POSITION_DEVIATION = 0.05;
const GUIDE_BOUNDS = { left: 0.08, right: 0.92, top: 0.06, bottom: 0.94 };
const MIN_FACE_WIDTH = 0.05;
const MIN_FACE_HEIGHT = 0.05;
const MAX_FACE_RATIO = 0.88;
const MAX_FRONTAL_ANGLE = 25;
export const HEAD_TURN_MIN_DELTA_DEG = 12;
export const HEAD_RETURN_MAX_DELTA_DEG = 6;
const HEAD_BASELINE_FRAMES = 3;
const HEAD_MIN_TURNED_FRAMES = 2;
export const CENTER_HINTS = Object.freeze({
  NO_FACE: "얼굴 전체가 화면에 보이도록 맞춰 주세요.",
  MULTIPLE_FACES: "혼자 화면에 들어와 주세요.",
  INVALID_POSE: "얼굴이 선명하게 보이도록 카메라를 봐 주세요.",
  CROPPED: "얼굴 전체가 화면에 보이도록 맞춰 주세요.",
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
  const overlapWidth = Math.max(
    0,
    Math.min(right, GUIDE_BOUNDS.right) - Math.max(left, GUIDE_BOUNDS.left),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(bottom, GUIDE_BOUNDS.bottom) - Math.max(top, GUIDE_BOUNDS.top),
  );
  const outsideGuide =
    overlapWidth * overlapHeight < face.width * face.height * 0.5 - 1e-9;
  let issue = null;
  if (left < 0 || top < 0 || right > 1 || bottom > 1) issue = "CROPPED";
  else if (face.width < MIN_FACE_WIDTH || face.height < MIN_FACE_HEIGHT)
    issue = "CLOSER";
  else if (face.width >= MAX_FACE_RATIO && face.height >= MAX_FACE_RATIO)
    issue = "BACK";
  else if (outsideGuide) {
    if (face.x < GUIDE_BOUNDS.left) issue = "LEFT";
    else if (face.x > GUIDE_BOUNDS.right) issue = "RIGHT";
    else if (face.y < GUIDE_BOUNDS.top) issue = "DOWN";
    else if (face.y > GUIDE_BOUNDS.bottom) issue = "UP";
    else issue = "BACK";
  } else if (
    Math.abs(yaw) > MAX_FRONTAL_ANGLE ||
    Math.abs(pitch) > MAX_FRONTAL_ANGLE
  )
    issue = "FRONTAL";
  else if (Math.abs(roll) > MAX_FRONTAL_ANGLE) issue = "LEVEL";
  return { ...face, issue };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function headTurnProgress(previous = {}, result, targetHead) {
  const state = {
    baselineSamples: previous.baselineSamples ?? [],
    baseline: previous.baseline ?? null,
    turnedFrames: previous.turnedFrames ?? 0,
    completedTurn: previous.completedTurn ?? false,
    returnFrames: previous.returnFrames ?? 0,
    returned: previous.returned ?? false,
    delta: previous.delta ?? 0,
    returnDelta: previous.returnDelta ?? null,
    turnProgress: previous.turnProgress ?? 0,
    faceDetected: false,
    step: previous.completedTurn ? 2 : previous.baseline ? 1 : 0,
  };
  if (!targetHead) return state;
  const face = facePosition(result);
  if (
    !Number.isFinite(face.yaw) ||
    !Number.isFinite(face.pitch) ||
    ["NO_FACE", "MULTIPLE_FACES", "INVALID_POSE", "CROPPED"].includes(
      face.issue,
    )
  ) {
    return {
      ...state,
      turnedFrames: 0,
      returnFrames: 0,
    };
  }
  state.faceDetected = true;
  if (!state.baseline) {
    if (
      Math.abs(face.yaw) <= MAX_FRONTAL_ANGLE &&
      Math.abs(face.pitch) <= MAX_FRONTAL_ANGLE &&
      Math.abs(face.roll) <= MAX_FRONTAL_ANGLE
    ) {
      const baselineSamples = [
        ...state.baselineSamples,
        { yaw: face.yaw, pitch: face.pitch },
      ].slice(-HEAD_BASELINE_FRAMES);
      const baseline =
        baselineSamples.length >= HEAD_BASELINE_FRAMES
          ? {
              yaw: median(baselineSamples.map((item) => item.yaw)),
              pitch: median(baselineSamples.map((item) => item.pitch)),
            }
          : null;
      return {
        ...state,
        baselineSamples,
        baseline,
        step: baseline ? 1 : 0,
      };
    }
    return state;
  }
  const dpitch = face.pitch - state.baseline.pitch;
  const delta = targetHead === "LOOK_UP" ? -dpitch : dpitch;
  const returnDelta = Math.abs(dpitch);
  const turnedFrames =
    delta >= HEAD_TURN_MIN_DELTA_DEG ? state.turnedFrames + 1 : 0;
  const completedTurn =
    state.completedTurn || turnedFrames >= HEAD_MIN_TURNED_FRAMES;
  const returned = completedTurn;
  const turnProgress = completedTurn
    ? 1
    : Math.min(1, Math.max(0, delta) / HEAD_TURN_MIN_DELTA_DEG);
  return {
    ...state,
    turnedFrames,
    completedTurn,
    returnFrames: completedTurn ? HEAD_MIN_TURNED_FRAMES : 0,
    returned,
    delta: Math.max(0, Math.round(delta)),
    returnDelta: Math.round(returnDelta),
    turnProgress,
    step: completedTurn ? 2 : 1,
  };
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

export async function createFaceTracker() {
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
  { signal, onState, create = createFaceTracker },
) {
  return new Promise((resolve, reject) => {
    let tracker,
      timer,
      settled = false,
      lastFrame = null,
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
        const mediaTime = Number.isFinite(video.currentTime)
          ? video.currentTime
          : null;
        if (mediaTime != null && mediaTime === lastFrame) {
          timer = setTimeout(tick, 100);
          return;
        }
        if (
          mediaTime != null &&
          lastFrame != null &&
          (mediaTime <= lastFrame || mediaTime - lastFrame > 0.35)
        ) {
          hold = { history: [], since: null };
        }
        lastFrame = mediaTime;
        const now = performance.now();
        hold = centerHoldProgress(
          hold,
          tracker.detectForVideo(video, now),
          mediaTime != null ? mediaTime * 1000 : now,
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
