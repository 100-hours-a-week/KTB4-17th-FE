export const HOLD_SECONDS = 3;
// 균등 서버 샘플의 양 끝 경계 오차를 흡수한다. 화면에는 3초 유지로 안내한다.
export const CAPTURE_HOLD_SECONDS = 3.4;
export const MAX_SAMPLE_GAP_SECONDS = 0.75;
export const DETECTION_GRACE_SECONDS = 0.8;

export function holdProgress(
  previous = {},
  matching,
  timestamp,
  seconds = CAPTURE_HOLD_SECONDS,
) {
  let elapsed = previous.elapsed ?? 0;
  let lastMatch = previous.lastMatch ?? null;
  const gap = previous.last == null ? 0 : timestamp - previous.last;
  const invalid =
    !Number.isFinite(timestamp) || gap < 0 || gap > MAX_SAMPLE_GAP_SECONDS;
  const interrupted =
    lastMatch != null &&
    timestamp - lastMatch > DETECTION_GRACE_SECONDS + 1e-9 &&
    (!matching || !previous.matching);
  if (invalid || interrupted) {
    elapsed = 0;
    lastMatch = null;
  }
  if (matching && !invalid) {
    if (lastMatch != null && previous.matching && gap > 0) elapsed += gap;
    lastMatch = timestamp;
  }
  const progress = Math.min(elapsed / seconds, 1);
  return {
    elapsed,
    last: timestamp,
    lastMatch,
    matching: Boolean(matching && !invalid),
    paused: !matching && elapsed > 0,
    progress,
    done: Boolean(matching && elapsed + 1e-9 >= seconds),
    remainingSeconds: Math.max(0, Math.ceil((1 - progress) * HOLD_SECONDS)),
  };
}
