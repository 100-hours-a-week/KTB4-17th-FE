export const IMAGE_REFRESH_BUFFER_MS = 30_000;
export const IMAGE_REFRESH_FALLBACK_MS = 4 * 60_000;

export function isHomePath(path) {
  return path === "/" || path === "/home";
}

export function nextRecommendationImageRefreshAt(recommendations) {
  const refreshTimes = [];

  for (const recommendation of recommendations) {
    for (const image of recommendation?.images || []) {
      if (!image?.imageUrl) continue;
      const receivedAt = Number.isFinite(image.receivedAt)
        ? image.receivedAt
        : Date.now();
      const expiresAt = Date.parse(image.expiresAt || "");
      if (!Number.isFinite(expiresAt)) {
        refreshTimes.push(receivedAt + IMAGE_REFRESH_FALLBACK_MS);
        continue;
      }

      const refreshAt = expiresAt - IMAGE_REFRESH_BUFFER_MS;
      refreshTimes.push(
        refreshAt > receivedAt
          ? refreshAt
          : receivedAt + IMAGE_REFRESH_FALLBACK_MS,
      );
    }
  }

  return refreshTimes.length ? Math.min(...refreshTimes) : null;
}
