import { trustError } from "./model.js";

export const HAND_NAMES = Object.freeze({
  HAND_FIST: "주먹",
  HAND_ONE: "숫자 1",
  HAND_TWO: "V(숫자 2)",
  HAND_THREE: "숫자 3",
  HAND_FOUR: "숫자 4",
  HAND_OPEN_PALM: "손바닥 펴기",
  HAND_THUMBS_UP: "엄지만 펴기",
  HAND_L_SHAPE: "엄지와 검지로 L",
  HAND_LOVE_YOU: "엄지·검지·새끼 펴기",
  HAND_CALL_ME: "엄지·새끼 펴기",
});
export const HEAD_NAMES = Object.freeze({
  LOOK_UP: "위로",
  LOOK_DOWN: "아래로",
});
export const HAND_DIRECTION_NAMES = Object.freeze({
  UP: "위쪽",
  DOWN: "방향 무관",
  SIDEWAYS: "가로",
});

export function requiresHandDirection(hand, direction) {
  return (
    direction !== "DOWN" &&
    !["HAND_FIST", "HAND_LOVE_YOU", "HAND_CALL_ME"].includes(hand)
  );
}

export function parseChallenge(codes) {
  if (
    Array.isArray(codes) &&
    codes.length === 1 &&
    codes[0] === "LOOK_STRAIGHT"
  ) {
    return { legacy: true, hand: null, direction: null, head: null };
  }
  if (
    !Array.isArray(codes) ||
    ![3, 4].includes(codes.length) ||
    codes[0] !== "LOOK_STRAIGHT" ||
    !Object.hasOwn(HAND_NAMES, codes[1]) ||
    !["HAND_UP", "HAND_DOWN", "HAND_SIDEWAYS"].includes(codes[2]) ||
    (codes.length === 4 && !Object.hasOwn(HEAD_NAMES, codes[3]))
  )
    throw trustError("VERIFICATION_RESPONSE_INVALID");
  return {
    legacy: false,
    hand: codes[1],
    direction: codes[2].slice("HAND_".length),
    head: codes[3] || null,
  };
}

export function challengeInstruction(challenge) {
  if (challenge.legacy) return "촬영하는 동안 정면을 유지해 주세요.";
  const head = challenge.head
    ? `손 포즈 확인 후 고개를 ${HEAD_NAMES[challenge.head]} 움직여 3초 유지해 주세요.`
    : "정면을 바라보며 손 모양을 3초 유지하면 자동으로 촬영을 마쳐요.";
  if (!requiresHandDirection(challenge.hand, challenge.direction))
    return `${HAND_NAMES[challenge.hand]} 모양은 방향에 상관없이 화면 안 편한 위치에 유지하세요. 왼손·오른손, 손바닥·손등 모두 괜찮아요. 얼굴은 가리지 마세요. ${head}`;
  const direction =
    challenge.direction === "UP" ? "위를" : "가로(왼쪽 또는 오른쪽)를";
  return `${HAND_NAMES[challenge.hand]} 모양이 ${direction} 향하도록 화면 안 편한 위치에 유지하세요. 왼손·오른손, 손바닥·손등 모두 괜찮아요. 얼굴은 가리지 마세요. ${head}`;
}

// 단계·실제 인식 결과로만 안내한다. 촬영 시간만으로 완료를 추정하지 않는다.
export function headGuideStep(stage, _progress = 0, live = null) {
  if (live?.headCompleted) return 2;
  if (stage === "head") return 1;
  if (stage !== "recording") return 0;
  return live?.headStep > 0 ? live.headStep : 0;
}

export const HEAD_MOTIONS = Object.freeze({
  LOOK_UP: {
    label: "고개 위로 들기",
    detail: "몸은 그대로 두고 턱을 살짝 들어 위로 바라봐 주세요.",
    icon: "arrowDown",
  },
  LOOK_DOWN: {
    label: "고개 아래로 숙이기",
    detail: "몸은 그대로 두고 턱을 살짝 내려 아래로 바라봐 주세요.",
    icon: "arrowDown",
  },
});

export function recordingHint(challenge, progress, live = null) {
  if (challenge.legacy) return "정면을 유지해 주세요.";
  if (!challenge.head)
    return "정면을 바라보며 안내된 손 모양을 3초 유지해 주세요.";
  if (live?.headCompleted) {
    return live.handMatched
      ? "고개 동작과 손 모양이 모두 확인됐어요! 잠시만 그대로 유지해 주세요."
      : "고개 동작이 확인됐어요! 안내된 손 모양을 맞춰 주세요.";
  }
  const step = headGuideStep("recording", progress, live);
  if (step === 0)
    return "손 모양을 유지하고, 먼저 카메라를 정면으로 봐 주세요.";
  if (step === 1) {
    if (live?.headDelta > 0) {
      return `손은 그대로, 고개를 ${HEAD_NAMES[challenge.head]} 조금만 더 움직여 주세요. (${live.headDelta}° / 12°)`;
    }
    return `손은 그대로, 고개를 ${HEAD_NAMES[challenge.head]} 살짝 움직여 주세요.`;
  }
  return "고개 동작이 확인됐어요! 잠시만 그대로 유지해 주세요.";
}
