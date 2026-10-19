import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { profilePhotoErrorMessage } from "../profile/photoUpload.js";

export const MAX_ATTEMPTS = 5;
export const CLIP_DURATION_MS = 5_000;
export const MAX_VIDEO_BYTES = 5 * 1024 * 1024;

export function trustError(code, extra = {}) {
  return Object.assign(new Error(code), { code, ...extra });
}

export const PHOTO_REASONS = Object.freeze({
  NO_FACE: "사진에서 얼굴을 찾지 못했어요.",
  MULTIPLE_FACES: "혼자 나온 사진을 선택해 주세요.",
  NON_FRONTAL_FACE: "얼굴이 정면을 향한 사진을 선택해 주세요.",
  IMAGE_TOO_SMALL: "얼굴이 더 크고 선명하게 나온 사진을 선택해 주세요.",
  IMAGE_TOO_BLURRY: "흔들리거나 흐리지 않은 사진을 선택해 주세요.",
  IMAGE_TOO_DARK: "얼굴이 밝게 보이는 사진을 선택해 주세요.",
  IMAGE_TOO_BRIGHT: "빛에 얼굴이 가려지지 않은 사진을 선택해 주세요.",
  SYNTHETIC_RISK:
    "AI 생성·합성 가능성이 있어요. 직접 찍은 원본 사진을 선택해 주세요.",
  CONFIRMED_SYNTHETIC:
    "AI 생성·합성 사진은 사용할 수 없어요. 직접 찍은 사진을 선택해 주세요.",
});

const CAMERA_MESSAGES = Object.freeze({
  VIDEO_READ_FAILED: [
    "촬영 영상을 읽지 못했어요",
    "영상을 전달하는 중 문제가 발생했어요. 카메라 인증을 다시 시작해 주세요.",
  ],
  VERIFICATION_DUPLICATE_VIDEO: [
    "새로운 촬영 영상이 필요해요",
    "이미 확인한 영상이에요. 카메라를 켜고 다시 촬영해 주세요.",
  ],
  VERIFICATION_SESSION_NOT_FOUND: [
    "진행 중인 인증을 찾지 못했어요",
    "인증 정보를 찾을 수 없어요. 카메라 인증을 다시 시작해 주세요.",
  ],
  VERIFICATION_SESSION_CLOSED: [
    "이번 인증이 종료됐어요",
    "현재 인증을 더 진행할 수 없어요. 결과를 확인하거나 카메라 인증을 다시 시작해 주세요.",
  ],
  VERIFICATION_ATTEMPT_LIMIT_REACHED: [
    "이번 인증의 확인 횟수를 모두 사용했어요",
    "촬영 조건을 확인한 뒤 카메라 인증을 다시 시작해 주세요.",
  ],
  AI_REQUEST_REJECTED: [
    "촬영 영상을 처리하지 못했어요",
    "이 영상으로 인증을 진행하지 못했어요. 다시 촬영하고, 계속되면 다른 정면 사진을 선택해 주세요.",
  ],

  CAMERA_HTTPS_REQUIRED: [
    "보안 연결로 접속해 주세요",
    "카메라는 HTTPS 연결에서 사용할 수 있어요. 서비스의 HTTPS 주소로 접속해 주세요.",
  ],
  CAMERA_NOT_SUPPORTED: [
    "다른 브라우저로 접속해 주세요",
    "이 브라우저에서는 카메라 인증을 사용할 수 없어요. 최신 Safari 또는 Chrome에서 열어 주세요.",
  ],
  CAMERA_PERMISSION_DENIED: [
    "카메라 권한을 허용해 주세요",
    "브라우저의 사이트 설정에서 카메라를 허용한 뒤 다시 시도해 주세요.",
  ],
  CAMERA_NOT_FOUND: [
    "카메라를 찾지 못했어요",
    "카메라가 연결된 기기로 접속해 주세요.",
  ],
  CAMERA_IN_USE: [
    "카메라를 열지 못했어요",
    "다른 앱의 카메라를 닫고 다시 시도해 주세요.",
  ],
  CAMERA_INTERRUPTED: [
    "촬영이 중단됐어요",
    "이 화면을 열어둔 상태에서 카메라 인증을 다시 시작해 주세요.",
  ],
  CAMERA_START_TIMEOUT: [
    "카메라 연결이 늦어지고 있어요",
    "카메라 권한과 기기 연결을 확인한 뒤 다시 시도해 주세요.",
  ],
  CAMERA_CAPTURE_FAILED: [
    "사진을 촬영하지 못했어요",
    "카메라 화면이 보이면 다시 촬영해 주세요.",
  ],
  VIDEO_EMPTY: [
    "촬영 영상을 읽지 못했어요",
    "카메라가 정상적으로 보이는지 확인한 뒤 다시 인증해 주세요.",
  ],
  VIDEO_TYPE_NOT_ALLOWED: [
    "영상 형식을 지원하지 않아요",
    "최신 Safari 또는 Chrome에서 카메라 인증을 다시 시도해 주세요.",
  ],
  VIDEO_TOO_LARGE: [
    "촬영 영상의 용량이 너무 커요",
    "카메라 인증을 다시 시작해 주세요. 계속되면 다른 브라우저로 시도해 주세요.",
  ],
});

const SERVICE_MESSAGES = Object.freeze({
  VERIFICATION_USER_NOT_FOUND: [
    "회원 정보를 확인하지 못했어요",
    "로그인 상태를 다시 확인한 뒤 인증을 진행해 주세요.",
  ],
  VERIFICATION_IN_PROGRESS: [
    "이미 인증 결과를 확인하고 있어요",
    "전달한 영상의 확인이 진행 중이에요. 잠시 후 결과를 다시 확인해 주세요.",
  ],
  VERIFICATION_ATTEMPT_OUT_OF_ORDER: [
    "인증 진행 정보를 다시 확인해 주세요",
    "서버의 확인 순서와 달라요. 결과를 다시 확인한 뒤 인증을 이어가주세요.",
  ],
  VERIFICATION_ATTEMPT_CONFLICT: [
    "인증 진행 정보를 다시 확인해 주세요",
    "이미 전달한 영상의 정보와 달라요. 결과를 다시 확인해 주세요.",
  ],
  PRIMARY_PHOTO_UNAVAILABLE: [
    "선택한 사진을 불러오지 못했어요",
    "서버에서 사진을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
  ],

  AI_SERVER_UNAVAILABLE: [
    "얼굴 확인 서비스에 연결하지 못했어요",
    "일시적인 서비스 연결 문제예요. 잠시 후 다시 시도해 주세요.",
  ],
  AI_SERVER_NOT_CONFIGURED: [
    "얼굴 확인 서비스를 준비하고 있어요",
    "잠시 후 다시 시도해 주세요.",
  ],
  AI_SERVER_RESPONSE_INVALID: [
    "인증 서비스의 응답을 확인하지 못했어요",
    "인증 서비스가 올바른 결과를 전달하지 못했어요. 잠시 후 다시 시도해 주세요.",
  ],
  VERIFICATION_RESPONSE_INVALID: [
    "인증 정보를 확인하지 못했어요",
    "인증 상태 정보가 올바르지 않아요. 결과를 다시 확인해 주세요.",
  ],
  VERIFICATION_STATUS_TIMEOUT: [
    "인증 결과가 늦어지고 있어요",
    "이미 전달한 영상을 확인 중일 수 있어요. 잠시 후 결과를 다시 확인해 주세요.",
  ],
  VERIFICATION_REQUEST_TIMEOUT: [
    "서버 응답이 늦어지고 있어요",
    "요청이 접수됐을 수 있어요. 영상을 다시 보내기 전에 결과를 확인해 주세요.",
  ],
  VERIFICATION_FAILED: [
    "인증 서버에서 문제가 발생했어요",
    "서버에서 인증을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
  ],
  INTERNAL_SERVER_ERROR: [
    "인증 서버에서 문제가 발생했어요",
    "서버에서 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
  ],
  AUTH_REQUIRED: [
    "로그인 상태를 확인해 주세요",
    "로그인이 만료됐어요. 다시 로그인한 뒤 인증을 진행해 주세요.",
  ],
  AUTH_TOKEN_MISSING: [
    "로그인 상태를 확인해 주세요",
    "로그인 정보를 확인하지 못했어요. 다시 로그인한 뒤 인증을 진행해 주세요.",
  ],
});

const FACE_REASONS = Object.freeze({
  FACE_MISMATCH: {
    kind: "photo",
    title: "사진과 얼굴의 일치를 확인하지 못했어요",
    message:
      "선택한 사진과 카메라 속 얼굴의 일치를 확인하지 못했어요. 본인이 직접 촬영한 정면 사진으로 바꿔주세요.",
  },
  NO_FACE: {
    kind: "camera",
    title: "영상에서 얼굴을 찾지 못했어요",
    message:
      "얼굴 전체가 점선 안에 들어오도록 맞추고 밝은 곳에서 다시 인증해 주세요.",
  },
  FACE_COMPARISON_FAILED: {
    kind: "camera",
    title: "사진과 영상의 얼굴을 비교하지 못했어요",
    message:
      "얼굴 비교에 필요한 정보를 확인하지 못했어요. 얼굴이 선명하게 보이도록 다시 촬영해 주세요. 계속되면 다른 정면 사진을 선택해 주세요.",
  },
  LIVENESS_FAILED: {
    kind: "camera",
    title: "촬영 조건을 확인하지 못했어요",
    message:
      "혼자 화면에 들어와 얼굴을 정면으로 맞춰주세요. 모자·마스크·선글라스를 벗고 밝은 곳에서 다시 인증해 주세요.",
  },
});

function issueWithAction(issue) {
  return {
    details: [],
    action: issue.kind === "photo" ? "replace" : "retry",
    actionLabel:
      issue.kind === "photo"
        ? "정면 사진 다시 선택"
        : issue.kind === "camera"
          ? "카메라 인증 다시 하기"
          : "다시 시도하기",
    ...issue,
  };
}

export function cameraError(error) {
  const codes = {
    NotAllowedError: "CAMERA_PERMISSION_DENIED",
    SecurityError: "CAMERA_PERMISSION_DENIED",
    NotFoundError: "CAMERA_NOT_FOUND",
    NotReadableError: "CAMERA_IN_USE",
    AbortError: "CAMERA_INTERRUPTED",
  };
  return typeof error?.code === "string"
    ? error
    : trustError(codes[error?.name] || "CAMERA_IN_USE");
}

export function verificationIssue(error) {
  const code =
    typeof error?.code === "string"
      ? error.code
      : error instanceof SyntaxError
        ? "VERIFICATION_RESPONSE_INVALID"
        : "";
  if (code === "PRIMARY_PHOTO_REJECTED") {
    const reasons = Array.isArray(error.reasonCodes) ? error.reasonCodes : [];
    const messages = [
      ...new Set(
        reasons
          .map((reason) =>
            Object.hasOwn(PHOTO_REASONS, reason) ? PHOTO_REASONS[reason] : null,
          )
          .filter(Boolean),
      ),
    ];
    const title = reasons.includes("CONFIRMED_SYNTHETIC")
      ? "AI 생성·합성 사진은 사용할 수 없어요"
      : reasons.includes("SYNTHETIC_RISK")
        ? "직접 촬영한 원본 사진을 선택해 주세요"
        : reasons.includes("NON_FRONTAL_FACE")
          ? "얼굴이 정면인 사진을 선택해 주세요"
          : "정면 사진을 다시 선택해 주세요";
    return issueWithAction({
      kind: "photo",
      title,
      message:
        messages[0] || "얼굴이 선명하게 나온 본인의 정면 사진을 선택해 주세요.",
      details: messages.slice(1),
      code,
    });
  }
  if (
    /^(PRIMARY_PHOTO_(NOT_FOUND|NOT_READY|CHANGED|EXPIRED)|FILE_UPLOAD_INTENT_(EXPIRED|NOT_FOUND|CONFLICT)|FILE_(INVALID_CONTENT|TYPE_NOT_ALLOWED|TOO_LARGE)|PHOTO_CONVERSION_FAILED)$/.test(
      code,
    )
  )
    return issueWithAction({
      kind: "photo",
      title: "정면 사진을 다시 선택해 주세요",
      message: profilePhotoErrorMessage(error),
      code,
    });
  if (Object.hasOwn(CAMERA_MESSAGES, code)) {
    const [title, message] = CAMERA_MESSAGES[code];
    return issueWithAction({ kind: "camera", title, message, code });
  }
  if (
    ["VERIFICATION_SESSION_EXPIRED", "VERIFICATION_CHALLENGE_INVALID"].includes(
      code,
    )
  )
    return issueWithAction({
      kind: "camera",
      title: "인증 시간이 만료됐어요",
      message:
        "인증 시간이 지나 촬영을 이어갈 수 없어요. 카메라 인증을 다시 시작해 주세요.",
      code,
    });
  let title = "인증을 마치지 못했어요";
  let message = apiErrorMessage(
    error,
    "연결을 확인한 뒤 다시 시도해 주세요. 인증 결과가 있으면 이어서 확인할게요.",
  );
  if (Object.hasOwn(SERVICE_MESSAGES, code))
    [title, message] = SERVICE_MESSAGES[code];
  else if (error instanceof TypeError || code === "NETWORK_ERROR") {
    title = "연결을 확인해 주세요";
    message =
      "서버와 연결하지 못했어요. 인터넷 연결을 확인한 뒤 결과를 다시 확인해 주세요.";
  } else if (error?.status >= 500 || /^HTTP_5\d{2}$/.test(code))
    title = "인증 서버에서 문제가 발생했어요";
  return issueWithAction({ kind: "system", title, message, code });
}

export function attemptHistory(session) {
  return Array.isArray(session?.attempts) && session.attempts.length
    ? session.attempts
    : session?.attempt
      ? [session.attempt]
      : [];
}

export function latestAttempt(session) {
  return attemptHistory(session).reduce(
    (latest, attempt) =>
      !latest || attempt.attemptNo > latest.attemptNo ? attempt : latest,
    null,
  );
}

export function sessionIssue(session) {
  if (session?.status === "VERIFIED") return null;
  if (session?.status === "EXPIRED")
    return verificationIssue(trustError("VERIFICATION_SESSION_EXPIRED"));
  const attempts = attemptHistory(session);
  const last = latestAttempt(session);
  const reasonCodes = new Set(
    attempts
      .filter((attempt) => attempt.status !== "ERROR" && !attempt.errorCode)
      .flatMap((attempt) =>
        Array.isArray(attempt.reasonCodes) ? attempt.reasonCodes : [],
      ),
  );
  const reasons = Object.keys(FACE_REASONS).filter((code) =>
    reasonCodes.has(code),
  );
  if (last?.status === "ERROR" || last?.errorCode) {
    const issue = verificationIssue(
      trustError(last.errorCode || "VERIFICATION_FAILED"),
    );
    return {
      ...issue,
      ...(session.status === "EXHAUSTED"
        ? { action: "restart", actionLabel: "카메라 인증 다시 시작" }
        : {}),
      details: reasons.map((code) => FACE_REASONS[code].message),
    };
  }
  if (reasons.length)
    return issueWithAction({
      ...FACE_REASONS[reasons[0]],
      code: reasons[0],
      details: reasons.slice(1).map((code) => FACE_REASONS[code].message),
    });
  return verificationIssue(trustError("VERIFICATION_RESPONSE_INVALID"));
}

export function captureHint(session) {
  const reasons = latestAttempt(session)?.reasonCodes ?? [];
  if (reasons.includes("NO_FACE"))
    return "얼굴 전체가 점선 안에 들어오도록 맞춰주세요.";
  if (reasons.includes("LIVENESS_FAILED"))
    return "혼자 화면에 들어와 밝은 곳에서 정면을 유지해 주세요.";
  if (reasons.includes("FACE_COMPARISON_FAILED"))
    return "얼굴이 선명하게 보이도록 카메라와 거리를 맞춰주세요.";
  return "얼굴을 점선 안에 맞추고 화면을 바라봐주세요.";
}

export function reorderPhotos(items, sourceId, targetId) {
  const from = items.findIndex((item) => item.localId === sourceId);
  const to = items.findIndex((item) => item.localId === targetId);
  if (from < 0 || to < 0 || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function replaceFrontalPhoto(items, verifiedPhoto) {
  const index = items.findIndex((item) => item.isFrontal);
  if (index < 0) return [...items, verifiedPhoto];
  return items.map((item, position) =>
    position === index ? verifiedPhoto : item,
  );
}

export function savedPhotoItems(profile) {
  return (Array.isArray(profile?.images) ? profile.images : [])
    .filter(
      (image) =>
        image?.fileId != null &&
        typeof image.imageUrl === "string" &&
        image.imageUrl,
    )
    .sort((a, b) => Number(a.displayOrder) - Number(b.displayOrder))
    .map((image) => ({
      localId: `saved-${image.fileId}`,
      fileId: image.fileId,
      previewUrl: image.imageUrl,
      isFrontal: image.isFrontal === true,
      uploading: false,
    }));
}
