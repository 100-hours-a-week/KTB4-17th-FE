import { createFaceTracker, facePosition } from "./centering.js";
import { HEAD_NAMES } from "./challenge.js";
import { createHandTracker, visibleHandSide } from "./handGuide.js";
import { holdProgress } from "./hold.js";
import { trustError } from "./model.js";
import { matchesPose } from "./poseHold.js";

export function handCoversFace(face, landmarks) {
  if (![face.x, face.y, face.width, face.height].every(Number.isFinite))
    return true;
  const left = face.x - face.width / 2,
    right = face.x + face.width / 2;
  const top = face.y - face.height / 2,
    bottom = face.y + face.height / 2;
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
    return intersection > face.width * face.height * 0.2;
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
  let closed = false;
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
        const completedStages = [];
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          finishWaiting = null;
          closed = true;
          dispose();
          if (error) reject(error);
          else resolve();
        };
        finishWaiting = finish;
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
              const covered = handCoversFace(face, landmarks);
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
              const issue = covered
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
