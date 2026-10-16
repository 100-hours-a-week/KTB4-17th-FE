export function isProfileAccessUnavailable(error) {
  return error?.status === 404 || error?.code === "PROFILE_NOT_FOUND";
}
