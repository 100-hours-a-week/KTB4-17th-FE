import { PROFILE_UNSAFE_INPUT_ERROR } from "./validation.js";

export function profileSecurityFilterErrorMessage(error) {
  const code = typeof error === "string" ? error : error?.code;
  if (code === "HTTP_403" || (error?.status === 403 && !code))
    return PROFILE_UNSAFE_INPUT_ERROR;
  return "";
}
