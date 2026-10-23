import { createFaceTracker, facePosition } from "./centering.js";
import { HEAD_NAMES } from "./challenge.js";
import { createHandTracker, visibleHandSide } from "./handGuide.js";
import { holdProgress } from "./hold.js";
import { trustError } from "./model.js";
import { insideFrame, matchesPose } from "./poseHold.js";

// 손·고개 단계는 얼굴 가운데(눈·코·입)만 가림으로 본다. 휴대폰은 얼굴이 화면을 크게 차지해
// 손을 얼굴 옆에 두면 뺨 쪽과 겹치기 쉽다. 서버(active_liveness.py)와 같은 비율을 쓴다.
const FACE_CENTER_WIDTH_RATIO = 0.6;
const FACE_CENTER_HEIGHT_RATIO = 0.7;
// 얼굴이 화면 폭의 이 비율 이상이면 옆에 손이 들어갈 자리가 거의 없다.
const CLOSE_FACE_WIDTH_RATIO = 0.45;

export function handCoversFace(face, landmarks, { centerOnly = false } = {}) {
  if (![face.x, face.y, face.width, face.height].every(Number.isFinite))
    return true;
  const width = face.width * (centerOnly ? FACE_CENTER_WIDTH_RATIO : 1);
  const height = face.height * (centerOnly ? FACE_CENTER_HEIGHT_RATIO : 1);
  const left = face.x - width / 2,
    right = face.x + width / 2;
  const top = face.y - height / 2,
    bottom = face.y + height / 2;
  return landmarks.some((points) => {
    if (!points?.length) return false;
    const xs = points.map((p) => p.x),
      ys = points.map((p) => p.y);
    const intersection =
      Math.max(
        0,
        Math.min(right, Math.max(...xs)) - Math.max(left, Math.min(...xs)),
      ) *
      Math.max(
        0,
        Math.min(bottom, Math.max(...ys)) - Math.max(top, Math.min(...ys)),
      );
    return intersection > width * height * 0.2;
  });
}

// 모델을 녹화 전에 준비하고 한 쌍을 모든 단계·손 위치 안내에 공유한다.
export async function prepareCaptureSession(
  video,
  target,
  {
    signal,
    onState = () => {},
    createFace = createFaceTracker,
    createHand = createHandTracker,
  },
) {
  const loading = new AbortController();
  const models = new Set();
  const dispose = () => {
    for (const model of models) {
      try {
        model.close();
      } catch {
        /* Best effort cleanup. */
      }
    }
    models.clear();
  };
  const load = async (create) => {
    const model = await create();
    if (signal.aborted || loading.signal.aborted) {
      model.close();
      throw signal.reason || trustError("CAMERA_MODEL_UNAVAILABLE");
    }
    models.add(model);
    return model;
  };
  signal.throwIfAborted();
  let faceTracker, handTracker;
  let loadingTimer;
  let abortLoading;
  const interrupted = new Promise((_, reject) => {
    abortLoading = () =>
      reject(signal.reason || trustError("CAMERA_INTERRUPTED"));
    signal.addEventListener("abort", abortLoading, { once: true });
    loadingTimer = setTimeout(
      () => reject(trustError("CAMERA_MODEL_UNAVAILABLE")),
      30_000,
    );
  });
  try {
    [faceTracker, handTracker] = await Promise.race([
      Promise.all([load(createFace), target.legacy ? null : load(createHand)]),
      interrupted,
    ]);
  } catch (error) {
    loading.abort();
    dispose();
    throw signal.aborted
      ? signal.reason
      : trustError("CAMERA_MODEL_UNAVAILABLE", { cause: error });
  } finally {
    clearTimeout(loadingTimer);
    signal.removeEventListener("abort", abortLoading);
  }
  let finishWaiting = null;
  let cancelWaiting = null;
  let closed = false;
  // 제한 시간이 끝났을 때 어느 단계에서 무엇 때문에 멈췄는지 알려 준다.
  let stuck = { stage: null, blocker: null };
  const close = () => {
    if (closed) return;
    closed = true;
    finishWaiting?.(signal.reason || trustError("CAMERA_INTERRUPTED"));
    dispose();
  };
  const stages = target.legacy
    ? ["centering"]
    : ["centering", "pose", ...(target.head ? ["head"] : [])];
  return {
    close,
    stuck: () => ({ ...stuck }),
    // 시간 초과 뒤 다시 촬영할 때 쓴다. 진행 중인 판정만 멈추고 모델은 닫지 않아 다음 wait()가 정면부터 바로 시작한다.
    restart: () => {
      cancelWaiting?.();
      stuck = { stage: null, blocker: null };
    },
    wait: () =>
      new Promise((resolve, reject) => {
        if (closed || signal.aborted) {
          close();
          reject(signal.reason || trustError("CAMERA_INTERRUPTED"));
          return;
        }
        let timer,
          settled = false,
          lastFrame = null,
          stageIndex = 0,
          hold = {};
        let baselineSum = 0,
          baselineCount = 0;
        let blockers = new Map();
        const completedStages = [];
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          finishWaiting = null;
          cancelWaiting = null;
          closed = true;
          dispose();
          if (error) reject(error);
          else resolve();
        };
        finishWaiting = finish;
        cancelWaiting = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          finishWaiting = null;
          cancelWaiting = null;
          reject(trustError("CAMERA_ALIGNMENT_TIMEOUT"));
        };
        const abort = () =>
          finish(signal.reason || trustError("CAMERA_INTERRUPTED"));
        const tick = () => {
          if (settled) return;
          try {
            if (
              !video ||
              video.readyState < 2 ||
              !Number.isFinite(video.currentTime)
            )
              throw trustError("CAMERA_INTERRUPTED");
            const timestamp = video.currentTime;
            if (timestamp !== lastFrame) {
              lastFrame = timestamp;
              const now = performance.now();
              const face = facePosition(faceTracker.detectForVideo(video, now));
              const handResult = handTracker?.detectForVideo(video, now) || {
                landmarks: [],
              };
              const landmarks = handResult.landmarks || [];
              // 정면 단계는 동일인 비교 사진을 고르므로 얼굴 박스 전체 기준을 유지한다.
              const covered =
                stages[stageIndex] === "centering"
                  ? handCoversFace(face, landmarks)
                  : handCoversFace(face, landmarks, { centerOnly: true });
              const frontal = face.issue == null && !covered;
              const handMatched = landmarks.some((points) =>
                matchesPose(
                  points,
                  target,
                  video.videoWidth,
                  video.videoHeight,
                ),
              );
              const stage = stages[stageIndex];
              const baseline = baselineCount
                ? baselineSum / baselineCount
                : face.pitch;
              const delta =
                target.head === "LOOK_UP"
                  ? baseline - face.pitch
                  : face.pitch - baseline;
              const faceVisible =
                Number.isFinite(face.pitch) &&
                [null, "FRONTAL", "LEVEL"].includes(face.issue) &&
                Math.abs(face.yaw) <= 35 &&
                Math.abs(face.roll) <= 30 &&
                !covered;
              const matching =
                stage === "centering"
                  ? frontal
                  : stage === "pose"
                    ? frontal && handMatched
                    : faceVisible && delta >= 12;
              hold = holdProgress(hold, matching, timestamp);
              const cropped = landmarks.some((points) =>
                points?.some((point) => !insideFrame(point)),
              );
              const blocker = matching
                ? null
                : covered
                  ? "HAND_COVERS_FACE"
                  : stage === "head"
                    ? faceVisible
                      ? "HEAD_NOT_MOVED"
                      : "FACE_NOT_VISIBLE"
                    : !frontal
                      ? "FACE_NOT_FRONTAL"
                      : !landmarks.length
                        ? "HAND_NOT_DETECTED"
                        : cropped
                          ? "HAND_CROPPED"
                          : "HAND_MISMATCH";
              if (blocker)
                blockers.set(blocker, (blockers.get(blocker) || 0) + 1);
              stuck = {
                stage,
                blocker:
                  [...blockers].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
              };
              if (stage === "centering" && matching) {
                if (hold.elapsed === 0) {
                  baselineSum = 0;
                  baselineCount = 0;
                }
                baselineSum += face.pitch;
                baselineCount++;
              }
              const label =
                stage === "centering"
                  ? "정면"
                  : stage === "pose"
                    ? "손 포즈"
                    : `고개 ${HEAD_NAMES[target.head]}`;
              const noRoom =
                stage === "pose" &&
                (covered || cropped) &&
                face.width >= CLOSE_FACE_WIDTH_RATIO;
              const issue = noRoom
                ? "휴대폰을 조금 더 멀리 들어 손이 얼굴 옆에 들어갈 자리를 만들어 주세요."
                : covered
                  ? "손을 얼굴 옆으로 옮겨 주세요."
                  : !faceVisible
                    ? "얼굴 전체가 보이도록 카메라를 봐 주세요."
                    : stage === "pose" && !frontal
                      ? "손은 그대로 두고 카메라를 정면으로 봐 주세요."
                      : stage === "pose"
                        ? "안내된 손 모양과 방향을 맞춰 주세요."
                        : stage === "head"
                          ? `고개를 ${HEAD_NAMES[target.head]} 조금 움직여 그대로 유지해 주세요.`
                          : "카메라를 정면으로 봐 주세요.";
              onState({
                stage,
                stageIndex,
                stageCount: stages.length,
                completedStages: [...completedStages],
                ...hold,
                hint: matching
                  ? `${label} 인식 중 · ${hold.remainingSeconds}초 남음`
                  : hold.paused
                    ? `잠시 멈췄어요. ${issue}`
                    : issue,
                live: {
                  faceDetected: Number.isFinite(face.pitch),
                  faceMatched: stage === "head" ? faceVisible : frontal,
                  handDetected: landmarks.length > 0,
                  handMatched,
                  handSide: visibleHandSide(handResult),
                  headStep: stage === "head" ? 1 : 0,
                  headDelta: Math.max(0, Math.round(delta || 0)),
                  headTurnProgress: stage === "head" ? hold.progress : 0,
                  headCompleted: stage === "head" && hold.done,
                },
              });
              if (hold.done) {
                completedStages.push(stage);
                if (++stageIndex === stages.length) {
                  finish();
                  return;
                }
                hold = {};
                blockers = new Map();
              }
            }
            timer = setTimeout(tick, 100);
          } catch (error) {
            finish(error);
          }
        };
        signal.addEventListener("abort", abort, { once: true });
        tick();
      }),
  };
}

// 한 번 녹화(17.5초) 안에 단계를 다 못 채우면 실패 화면 대신 카메라를 켠 채 정면부터 다시 녹화한다.
// 영상을 보내지 않으므로 서버 시도 횟수는 쓰지 않는다. 자리를 비운 채 카메라가 계속 켜져 있지 않도록 횟수 상한을 둔다.
export const MAX_AUTO_RESTARTS = 4;

export async function recordWithRestarts(
  record,
  session,
  { maxRestarts = MAX_AUTO_RESTARTS, onRestart = () => {} } = {},
) {
  for (let restarts = 0; ; restarts++) {
    try {
      return await record();
    } catch (error) {
      if (error?.code !== "CAMERA_ALIGNMENT_TIMEOUT") throw error;
      const stuck = session.stuck();
      if (restarts >= maxRestarts) throw Object.assign(error, stuck);
      session.restart();
      onRestart(stuck, restarts + 1);
    }
  }
}
