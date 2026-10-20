// Heartbeats stay below the backend's 60-second room presence TTL. Re-entering
// rather than heartbeating after a suspended tab also restores expired presence.
export function watchChatPresence({
  roomId,
  send,
  documentTarget = document,
  windowTarget = window,
}) {
  let entered = false;
  const update = () => {
    const visible =
      documentTarget.visibilityState !== "hidden" &&
      windowTarget.navigator.onLine !== false;
    if (visible) entered = send(roomId, "ENTER");
    else if (entered) {
      send(roomId, "LEAVE");
      entered = false;
    }
  };
  const leave = () => {
    if (entered) send(roomId, "LEAVE");
    entered = false;
  };
  update();
  const timer = windowTarget.setInterval(() => {
    if (
      documentTarget.visibilityState !== "hidden" &&
      windowTarget.navigator.onLine !== false
    ) {
      // ENTER renews presence even after an OS suspension longer than the TTL.
      entered = send(roomId, "ENTER");
    } else leave();
  }, 20000);
  documentTarget.addEventListener("visibilitychange", update);
  windowTarget.addEventListener("online", update);
  windowTarget.addEventListener("pageshow", update);
  windowTarget.addEventListener("offline", leave);
  windowTarget.addEventListener("pagehide", leave);
  return () => {
    leave();
    windowTarget.clearInterval(timer);
    documentTarget.removeEventListener("visibilitychange", update);
    windowTarget.removeEventListener("online", update);
    windowTarget.removeEventListener("pageshow", update);
    windowTarget.removeEventListener("offline", leave);
    windowTarget.removeEventListener("pagehide", leave);
  };
}
