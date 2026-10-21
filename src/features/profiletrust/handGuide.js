// 카메라 미리보기는 좌우 반전되어 있으므로 원본 x 좌표와 화면 쪽은 반대다.
export function visibleHandSide(result) {
  const sides = new Set();
  for (const points of result?.landmarks || []) {
    if (
      points.length !== 21 ||
      points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))
    )
      continue;
    const xs = points.map(({ x }) => x);
    const ys = points.map(({ y }) => y);
    if (
      Math.min(...xs) < 0 ||
      Math.max(...xs) > 1 ||
      Math.min(...ys) < 0 ||
      Math.max(...ys) > 1
    )
      continue;
    if (
      Math.max(...xs) - Math.min(...xs) < 0.035 ||
      Math.max(...ys) - Math.min(...ys) < 0.035
    )
      continue;
    const x = [0, 5, 9, 13, 17].reduce((sum, i) => sum + points[i].x, 0) / 5;
    if (x < 0.44) sides.add("right");
    else if (x > 0.56) sides.add("left");
  }
  return sides.size === 1 ? [...sides][0] : null;
}

export async function createHandTracker() {
  const { HandLandmarker, FilesetResolver } = await import(
    "@mediapipe/tasks-vision"
  );
  const root = `${import.meta.env.BASE_URL}vision/`;
  const files = await FilesetResolver.forVisionTasks(`${root}wasm`);
  return HandLandmarker.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: `${root}hand_landmarker.task`,
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });
}

export function waitForHandSide(video, { signal, create = createHandTracker }) {
  return new Promise((resolve, reject) => {
    let tracker,
      timer,
      settled = false,
      side = null,
      stable = 0,
      lastFrame = -1;
    const finish = (error, selected) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      try {
        tracker?.close();
      } catch {
        /* Cleanup must not block cancellation. */
      }
      if (error) reject(error);
      else resolve(selected);
    };
    const abort = () =>
      finish(signal.reason || new DOMException("Aborted", "AbortError"));
    const tick = () => {
      if (settled) return;
      try {
        if (video?.readyState >= 2 && video.currentTime !== lastFrame) {
          lastFrame = video.currentTime;
          const next = visibleHandSide(
            tracker.detectForVideo(video, performance.now()),
          );
          stable = next && next === side ? stable + 1 : next ? 1 : 0;
          side = next;
          if (stable >= 4) {
            finish(null, side);
            return;
          }
        }
        timer = setTimeout(tick, 150);
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
        (error) => finish(error),
      );
  });
}
