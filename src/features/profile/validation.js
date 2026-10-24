export const PROFILE_HEIGHT_VALIDATION_ERROR =
  "키는 130~220cm의 정수로 입력해 주세요.";

export function profileHeightValidationError(value) {
  const height = Number(value);
  if (!Number.isInteger(height) || height < 130 || height > 220)
    return PROFILE_HEIGHT_VALIDATION_ERROR;
  return "";
}
