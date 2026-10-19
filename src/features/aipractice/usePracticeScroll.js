import { useCallback, useLayoutEffect, useRef, useState } from "react";

// Keep scrolling inside the message list. scrollIntoView can also move the
// document while a mobile keyboard changes the visual viewport.
export function usePracticeScroll(messageKey, resetKey) {
  const containerRef = useRef(null);
  const followLatest = useRef(true);
  const initialized = useRef(false);
  const previousTop = useRef(0);
  const [atBottom, setAtBottom] = useState(true);

  const preservePosition = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTop = followLatest.current
      ? container.scrollHeight
      : previousTop.current;
    previousTop.current = container.scrollTop;
  }, []);

  const scrollToLatest = useCallback(() => {
    followLatest.current = true;
    setAtBottom(true);
    preservePosition();
  }, [preservePosition]);

  const onScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const nearBottom =
      container.scrollHeight - container.clientHeight - container.scrollTop <
      48;
    followLatest.current = nearBottom;
    previousTop.current = container.scrollTop;
    setAtBottom(nearBottom);
  }, []);

  useLayoutEffect(() => {
    if (!resetKey) return;
    initialized.current = false;
    followLatest.current = true;
    previousTop.current = 0;
    setAtBottom(true);
  }, [resetKey]);

  useLayoutEffect(() => {
    if (!messageKey || !resetKey) return;
    if (!initialized.current) {
      initialized.current = true;
      followLatest.current = true;
    }
    preservePosition();
  }, [messageKey, resetKey, preservePosition]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(preservePosition);
    observer?.observe(container);
    if (container.firstElementChild)
      observer?.observe(container.firstElementChild);
    return () => observer?.disconnect();
  }, [preservePosition]);

  return { containerRef, atBottom, onScroll, preservePosition, scrollToLatest };
}
