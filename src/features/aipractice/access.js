export const PRACTICE_UNAVAILABLE_MESSAGE =
  "더 이상 이용할 수 없는 AI 연습대화예요.";

export function isPracticeAccessUnavailable(error) {
  return (
    ["SESSION_NOT_FOUND", "TARGET_USER_NOT_FOUND"].includes(error?.code) ||
    error?.status === 404
  );
}
