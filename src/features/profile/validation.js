export const PROFILE_HEIGHT_VALIDATION_ERROR =
  "키는 130~220cm의 정수로 입력해 주세요.";
export const PROFILE_UNSAFE_INPUT_ERROR =
  "허용되지 않는 특수문자나 태그가 포함되어 있습니다.";

const PROFILE_NICKNAME_PATTERN = /^[가-힣A-Za-z0-9]{2,10}$/;
const PROFILE_NICKNAME_CHARACTERS = /^[가-힣A-Za-z0-9]*$/;

export function profileNicknameValidationError(value) {
  const nickname = String(value ?? "");
  if (!PROFILE_NICKNAME_CHARACTERS.test(nickname))
    return PROFILE_UNSAFE_INPUT_ERROR;
  if (!PROFILE_NICKNAME_PATTERN.test(nickname))
    return "닉네임은 한글·영문·숫자 2~10자로 입력해 주세요.";
  return "";
}

export function profileHeightValidationError(value) {
  const height = Number(value);
  if (!Number.isInteger(height) || height < 130 || height > 220)
    return PROFILE_HEIGHT_VALIDATION_ERROR;
  return "";
}
