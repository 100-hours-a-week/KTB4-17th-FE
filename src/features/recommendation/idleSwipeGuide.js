export const SWIPE_GUIDE_IDLE_MS = 1600;
export const SWIPE_GUIDE_VISIBLE_MS = 2800;

// Home owns consumed so changing cards or temporarily disabling the guide cannot repeat it.
export function watchIdleSwipeGuide({
  consumed,
  onVisible,
  page = document,
  timers = globalThis,
}) {
  let timer;
  let visible = false;
  let pressed = false;
  const clear = () => timers.clearTimeout(timer);
  const hide = () => {
    if (visible) consumed.current = true;
    visible = false;
    onVisible(false);
    clear();
  };
  const arm = () => {
    clear();
    if (consumed.current || pressed || page.visibilityState === "hidden")
      return;
    timer = timers.setTimeout(() => {
      if (consumed.current) return;
      visible = true;
      onVisible(true);
      timer = timers.setTimeout(hide, SWIPE_GUIDE_VISIBLE_MS);
    }, SWIPE_GUIDE_IDLE_MS);
  };
  const activity = (event) => {
    if (event.type === "visibilitychange") pressed = false;
    if (event.type === "pointerdown") pressed = true;
    if (["pointerup", "pointercancel"].includes(event.type)) pressed = false;
    hide();
    arm();
  };
  const events = [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
    "wheel",
    "keydown",
    "focusin",
    "visibilitychange",
  ];
  onVisible(false);
  for (const event of events)
    page.addEventListener(event, activity, { capture: true, passive: true });
  arm();
  return () => {
    hide();
    for (const event of events)
      page.removeEventListener(event, activity, { capture: true });
  };
}
