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
  TURN_LEFT: "본인 기준 왼쪽으로",
  TURN_RIGHT: "본인 기준 오른쪽으로",
  LOOK_UP: "위로",
  LOOK_DOWN: "아래로",
});
export const HAND_DIRECTION_NAMES = Object.freeze({
  UP: "위쪽",
  DOWN: "아래쪽",
  SIDEWAYS: "가로",
});

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
    codes.length !== 4 ||
    codes[0] !== "LOOK_STRAIGHT" ||
    !Object.hasOwn(HAND_NAMES, codes[1]) ||
    !["HAND_UP", "HAND_DOWN", "HAND_SIDEWAYS"].includes(codes[2]) ||
    !Object.hasOwn(HEAD_NAMES, codes[3])
  )
    throw trustError("VERIFICATION_RESPONSE_INVALID");
  return {
    legacy: false,
    hand: codes[1],
    direction: codes[2].slice("HAND_".length),
    head: codes[3],
  };
}

export function challengeInstruction(challenge) {
  if (challenge.legacy) return "촬영하는 동안 정면을 유지해 주세요.";
  const direction =
    challenge.direction === "UP"
      ? "위를"
      : challenge.direction === "DOWN"
        ? "아래를"
        : "가로(왼쪽 또는 오른쪽)를";
  return `${HAND_NAMES[challenge.hand]} 모양이 ${direction} 향하도록 얼굴 옆에 유지하세요. 고개는 ${HEAD_NAMES[challenge.head]} 살짝 움직였다가 정면으로 돌아오세요.`;
}

// 안내 단계는 촬영 시간 기준이며 자세 인식 성공 여부를 뜻하지 않는다.
export function headGuideStep(stage, progress = 0) {
  if (stage !== "recording") return 0;
  return progress < 0.18 ? 0 : progress < 0.72 ? 1 : 2;
}

export const HEAD_MOTIONS = Object.freeze({
  TURN_LEFT: {
    label: "내 왼쪽으로 돌리기",
    detail: "어깨는 그대로 두고 코가 내 왼쪽을 향하도록 천천히 돌려 주세요.",
    icon: "arrowLeft",
  },
  TURN_RIGHT: {
    label: "내 오른쪽으로 돌리기",
    detail: "어깨는 그대로 두고 코가 내 오른쪽을 향하도록 천천히 돌려 주세요.",
    icon: "arrowRight",
  },
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

export function recordingHint(challenge, progress) {
  if (challenge.legacy) return "정면을 유지해 주세요.";
  const step = headGuideStep("recording", progress);
  if (step === 0)
    return "손 모양을 유지하고, 먼저 카메라를 정면으로 봐 주세요.";
  if (step === 1)
    return `손은 그대로, 고개를 ${HEAD_NAMES[challenge.head]} 살짝 움직여 주세요.`;
  return "손 모양을 유지하면서 다시 정면을 봐 주세요.";
}
