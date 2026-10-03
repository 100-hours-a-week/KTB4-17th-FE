export function wheelNavigationIntent(deltaY) {
  if (deltaY > 0) return "next";
  if (deltaY < 0) return "previous";
  return null;
}
