import { useEffect, useRef } from "react";

export function useComposerAutofocus(inputRef, roomId, ready, blocked) {
  const focusedVisit = useRef(null);
  useEffect(() => {
    if (!ready || blocked || focusedVisit.current === roomId) return undefined;
    let frame;
    const focus = () => {
      if (
        document.visibilityState === "hidden" ||
        focusedVisit.current === roomId
      )
        return;
      if (frame != null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const input = inputRef.current;
        if (
          focusedVisit.current === roomId ||
          document.visibilityState === "hidden" ||
          !input ||
          input.disabled ||
          document.querySelector('dialog[open], [aria-modal="true"]')
        )
          return;
        input.focus({ preventScroll: true });
        if (document.activeElement === input) {
          input.setSelectionRange(input.value.length, input.value.length);
          focusedVisit.current = roomId;
        }
      });
    };
    focus();
    document.addEventListener("visibilitychange", focus);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [inputRef, roomId, ready, blocked]);
}
