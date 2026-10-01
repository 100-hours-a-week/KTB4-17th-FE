const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
let photoSequence = 0;

// These IDs only identify preview tiles; they also work on mobile HTTP origins.
export function createPhotoId() {
  return `photo-${Date.now().toString(36)}-${++photoSequence}`;
}

function photoError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function detectPhotoType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => bytes[index] === byte,
    )
  )
    return "image/png";
  const text = new TextDecoder().decode(bytes);
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP")
    return "image/webp";
  if (text.slice(4, 8) === "ftyp" && /heic|heix|hevc|hevx/.test(text.slice(8)))
    return "image/heic";
  return "";
}

async function compressPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(
      1,
      2560 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw photoError("FILE_INVALID_CONTENT");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88),
    );
    if (!blob) throw photoError("FILE_INVALID_CONTENT");
    return new File(
      [blob],
      `${file.name.replace(/\.[^.]+$/, "") || "profile"}.jpg`,
      { type: "image/jpeg" },
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareProfilePhoto(file) {
  if (!file.size) throw photoError("FILE_INVALID_CONTENT");
  if (file.size > MAX_SOURCE_BYTES) throw photoError("FILE_TOO_LARGE");
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const detected = detectPhotoType(bytes);
  const isHeic =
    detected === "image/heic" ||
    /\.(heic|heif)$/i.test(file.name) ||
    /^image\/hei[cf]/i.test(file.type);
  let prepared;
  if (isHeic) {
    try {
      const { heicTo } = await import("heic-to/csp");
      const blob = await heicTo({
        blob: file,
        type: "image/jpeg",
        quality: 0.9,
      });
      prepared = new File(
        [blob],
        `${file.name.replace(/\.[^.]+$/, "") || "profile"}.jpg`,
        { type: "image/jpeg" },
      );
    } catch {
      throw photoError("PHOTO_CONVERSION_FAILED");
    }
  } else if (detected) {
    // Mobile photo pickers can return an empty or nonstandard MIME type.
    prepared = new File([file], file.name, {
      type: detected,
      lastModified: file.lastModified,
    });
  } else {
    throw photoError("FILE_TYPE_NOT_ALLOWED");
  }
  if (prepared.size > MAX_UPLOAD_BYTES)
    prepared = await compressPhoto(prepared);
  if (prepared.size > MAX_UPLOAD_BYTES) throw photoError("FILE_TOO_LARGE");
  return prepared;
}

export function profilePhotoErrorMessage(error) {
  const messages = {
    FILE_TOO_LARGE: "사진 용량이 너무 커요. 30MB 이하의 사진을 선택해주세요.",
    FILE_TYPE_NOT_ALLOWED: "JPG, PNG, WEBP, HEIC 형식의 사진을 선택해주세요.",
    FILE_INVALID_CONTENT: "사진을 읽을 수 없어요. 다른 사진을 선택해주세요.",
    PHOTO_CONVERSION_FAILED:
      "사진을 변환하지 못했어요. JPG 또는 PNG 사진으로 다시 시도해주세요.",
    FILE_UPLOAD_INTENT_EXPIRED:
      "사진 업로드 시간이 만료됐어요. 사진을 다시 선택해주세요.",
  };
  return (
    messages[error?.code] ||
    "사진을 업로드하지 못했어요. 연결을 확인한 뒤 다시 선택해주세요."
  );
}
