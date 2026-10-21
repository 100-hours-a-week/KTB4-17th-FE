import { requiresHandDirection } from "./challenge.js";
import { createHandTracker } from "./handGuide.js";
import { trustError } from "./model.js";

const PATTERNS = {
  "00000": "HAND_FIST",
  "01000": "HAND_ONE",
  "01100": "HAND_TWO",
  "01110": "HAND_THREE",
  11100: "HAND_THREE",
  "01111": "HAND_FOUR",
  11111: "HAND_OPEN_PALM",
  10000: "HAND_THUMBS_UP",
  11000: "HAND_L_SHAPE",
  11001: "HAND_LOVE_YOU",
  10001: "HAND_CALL_ME",
};
const sub = (a, b) => a.map((value, i) => value - b[i]);
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const length = (a) => Math.hypot(...a);
const angle = (a, b) => {
  const norm = length(a) * length(b);
  return norm > 1e-12
    ? (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / norm))) * 180) / Math.PI
    : 0;
};

// 서버와 같은 손가락 굽힘·엄지 뻗음·방향 조건을 사용한다. 최종 판정은 서버에서 수행한다.
export function matchesPose(landmarks, target, width, height) {
  if (landmarks?.length !== 21 || !width || !height) return false;
  if (
    landmarks.some(
      ({ x, y, z }) =>
        ![x, y, z].every(Number.isFinite) || x < 0 || x > 1 || y < 0 || y > 1,
    )
  )
    return false;
  const p = landmarks.map(({ x, y, z }) => [x * width, y * height, z * width]);
  const chains = [
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 16],
    [17, 18, 19, 20],
  ];
  const across = sub(p[5], p[17]);
  if (length(across) < 1e-9) return false;
  const extended = chains.map((chain) => {
    const indices = [0, ...chain];
    const segments = indices
      .slice(1)
      .map((index, i) => sub(p[index], p[indices[i]]));
    return (
      segments
        .slice(1)
        .reduce((sum, segment, i) => sum + angle(segments[i], segment), 0) < 80
    );
  });
  const thumb = dot(sub(p[4], p[5]), across) / dot(across, across) >= 0.3;
  const pattern = [thumb, ...extended].map(Number).join("");
  const hand = PATTERNS[pattern];
  if (
    hand !== target.hand ||
    (hand === "HAND_L_SHAPE" && angle(sub(p[4], p[2]), sub(p[8], p[5])) < 45)
  )
    return false;
  if (!requiresHandDirection(hand, target.direction)) return true;
  const vectors = chains
    .filter((_, i) => extended[i])
    .map(([start, , , end]) => sub(p[end], p[start]).slice(0, 2));
  if (!vectors.length)
    vectors.push(sub(p[thumb ? 4 : 9], p[thumb ? 2 : 0]).slice(0, 2));
  if (vectors.some((vector) => length(vector) < 1e-9)) return false;
  const direction = [0, 1].map(
    (axis) =>
      vectors.reduce((sum, vector) => sum + vector[axis] / length(vector), 0) /
      vectors.length,
  );
  if (length(direction) < 1e-9) return false;
  const tilt = angle(direction, [0, -1]);
  return (
    target.direction === (tilt <= 60 ? "UP" : tilt >= 120 ? "DOWN" : "SIDEWAYS")
  );
}

export function poseHoldProgress(previous, matching, timestamp) {
  const continuous =
    matching &&
    (previous.last == null ||
      (timestamp > previous.last && timestamp - previous.last <= 0.35));
  const since = continuous ? (previous.since ?? timestamp) : null;
  const elapsed = since == null ? 0 : timestamp - since;
  // 서버 샘플 경계의 오차를 고려해 조금 더 유지한다.
  return {
    since,
    last: timestamp,
    progress: Math.min(elapsed / 3.2, 1),
    done: elapsed >= 3.2,
  };
}

export function waitForPoseHold(
  video,
  target,
  { signal, onState = () => {}, create = createHandTracker },
) {
  return new Promise((resolve, reject) => {
    let tracker,
      timer,
      settled = false,
      lastFrame = -1,
      hold = { since: null, last: null };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      try {
        tracker?.close();
      } catch {
        /* Best effort cleanup. */
      }
      if (error) reject(error);
      else resolve();
    };
    const abort = () =>
      finish(signal.reason || trustError("CAMERA_INTERRUPTED"));
    const tick = () => {
      if (settled) return;
      try {
        if (!video || video.readyState < 2)
          throw trustError("CAMERA_INTERRUPTED");
        if (video.currentTime !== lastFrame) {
          lastFrame = video.currentTime;
          const result = tracker.detectForVideo(video, performance.now());
          const matching = (result.landmarks || []).some((points) =>
            matchesPose(points, target, video.videoWidth, video.videoHeight),
          );
          hold = poseHoldProgress(hold, matching, lastFrame);
          onState(hold);
          if (hold.done) {
            finish();
            return;
          }
        }
        timer = setTimeout(tick, 100);
      } catch (error) {
        finish(error);
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
