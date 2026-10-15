import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { profilePhotoErrorMessage } from "../profile/photoUpload.js";

export const MAX_ATTEMPTS = 5;
export const CAMERA_DURATION_MS = 60_000;
export const CLIP_DURATION_MS = 5_000;
export const MAX_VIDEO_BYTES = 5 * 1024 * 1024;

export function trustError(code, extra = {}) {
  return Object.assign(new Error(code), { code, ...extra });
}

export const PHOTO_REASONS = Object.freeze({
  NO_FACE: "사진에서 얼굴을 찾지 못했어요.",
  MULTIPLE_FACES: "혼자 나온 사진을 선택해주세요.",
  NON_FRONTAL_FACE: "얼굴이 정면을 향한 사진을 선택해주세요.",
  IMAGE_TOO_SMALL: "얼굴이 더 크고 선명하게 나온 사진을 선택해주세요.",
  IMAGE_TOO_BLURRY: "흔들리거나 흐리지 않은 사진을 선택해주세요.",
  IMAGE_TOO_DARK: "얼굴이 밝게 보이는 사진을 선택해주세요.",
  IMAGE_TOO_BRIGHT: "빛에 얼굴이 가려지지 않은 사진을 선택해주세요.",
  SYNTHETIC_RISK:
    "AI 생성·합성 가능성이 있어요. 직접 찍은 원본 사진을 선택해주세요.",
  CONFIRMED_SYNTHETIC:
    "AI 생성·합성 사진은 사용할 수 없어요. 직접 찍은 사진을 선택해주세요.",
});

const MESSAGES = Object.freeze({
  CAMERA_HTTPS_REQUIRED:
    "카메라는 보안 연결(HTTPS)에서 사용할 수 있어요. 서비스의 HTTPS 주소로 접속해주세요.",
  CAMERA_NOT_SUPPORTED:
    "이 브라우저에서는 카메라 인증을 사용할 수 없어요. 최신 Safari 또는 Chrome에서 열어주세요.",
  CAMERA_PERMISSION_DENIED:
    "카메라 권한이 필요해요. 브라우저의 사이트 설정에서 카메라를 허용한 뒤 다시 눌러주세요.",
  CAMERA_NOT_FOUND:
    "사용 가능한 카메라를 찾지 못했어요. 카메라가 연결된 기기로 접속해주세요.",
  CAMERA_IN_USE:
    "카메라를 열지 못했어요. 다른 앱의 카메라를 닫고 다시 시도해주세요.",
  CAMERA_INTERRUPTED:
    "촬영이 중단됐어요. 이 화면을 열어둔 상태에서 다시 인증해주세요.",
  CAMERA_TIME_LIMIT:
    "이번 촬영에서 인증을 마치지 못했어요. 밝은 곳에서 얼굴을 정면으로 맞추고 다시 시도해주세요.",
  CAMERA_START_TIMEOUT:
    "카메라를 열지 못했어요. 권한 안내를 확인하고 다시 시도해주세요.",
  CAMERA_CAPTURE_FAILED:
    "사진을 촬영하지 못했어요. 카메라 화면이 보이면 다시 촬영해주세요.",
  VIDEO_EMPTY: "촬영된 영상을 읽지 못했어요. 카메라 인증을 다시 시작해주세요.",
  VIDEO_TYPE_NOT_ALLOWED:
    "이 브라우저의 영상 형식으로 인증하지 못했어요. 최신 Safari 또는 Chrome에서 다시 시도해주세요.",
  VIDEO_TOO_LARGE: "촬영 영상이 너무 커요. 카메라 인증을 다시 시작해주세요.",
  VERIFICATION_STATUS_TIMEOUT:
    "인증 결과가 늦어지고 있어요. 잠시 후 결과를 다시 확인해주세요.",
  VERIFICATION_REQUEST_TIMEOUT:
    "서버 응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.",
  VERIFICATION_SESSION_EXPIRED:
    "인증 시간이 만료됐어요. 카메라 인증을 다시 시작해주세요.",
  VERIFICATION_CHALLENGE_INVALID:
    "인증 시간이 만료됐어요. 카메라 인증을 다시 시작해주세요.",
  VERIFICATION_RESPONSE_INVALID:
    "인증 상태를 확인하지 못했어요. 잠시 후 다시 시도해주세요.",
});

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
  if (error?.code === "PRIMARY_PHOTO_REJECTED") {
    return {
      kind: "photo",
      title: "정면 사진을 다시 선택해주세요",
      message:
        error.reasonCodes
          ?.map((code) => PHOTO_REASONS[code])
          .filter(Boolean)
          .join(" ") || "얼굴이 선명하게 나온 본인의 정면 사진을 선택해주세요.",
    };
  }
  if (
    /^(PRIMARY_PHOTO_(NOT_FOUND|NOT_READY|CHANGED|EXPIRED)|FILE_UPLOAD_INTENT_(EXPIRED|NOT_FOUND)|FILE_INVALID_CONTENT|FILE_TYPE_NOT_ALLOWED|FILE_TOO_LARGE)$/.test(
      error?.code || "",
    )
  ) {
    return {
      kind: "photo",
      title: "정면 사진을 다시 선택해주세요",
      message: profilePhotoErrorMessage(error),
    };
  }
  const code = typeof error?.code === "string" ? error.code : "";
  return {
    kind:
      code?.startsWith("CAMERA_") ||
      code === "VIDEO_EMPTY" ||
      code === "VIDEO_TOO_LARGE"
        ? "camera"
        : "system",
    title: code?.startsWith("CAMERA_")
      ? "카메라를 확인해주세요"
      : "인증을 마치지 못했어요",
    message:
      MESSAGES[code] ||
      apiErrorMessage(
        error,
        "연결을 확인한 뒤 다시 시도해주세요. 인증 결과가 있으면 이어서 확인할게요.",
      ),
  };
}

export function sessionIssue(session) {
  if (session?.status === "NOT_VERIFIED")
    return {
      kind: "mismatch",
      title: "사진과 얼굴을 확인해주세요",
      message:
        "정면 사진과 카메라 속 얼굴이 일치하는지 확인하지 못했어요. 본인의 사진인지 확인하고 다시 인증해주세요.",
    };
  if (session?.status === "EXPIRED")
    return verificationIssue(trustError("VERIFICATION_SESSION_EXPIRED"));
  return {
    kind: "camera",
    title: "카메라 인증을 다시 해주세요",
    message:
      "얼굴을 충분히 확인하지 못했어요. 모자·마스크·선글라스를 벗고 밝은 곳에서 정면을 바라봐주세요.",
  };
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
