import { useEffect, useRef } from "react";

export function useCardSwipe({
  onNext,
  onPrevious,
  disabled = false,
  enabled = true,
}) {
  const container = useRef(null);
  const pointer = useRef(null);
  const callbacks = useRef(null);
  const wheel = useRef({ distance: 0, locked: false, timer: null });
  callbacks.current = { onNext, onPrevious, disabled };

  useEffect(() => {
    if (!enabled) return;
    const element = container.current;
    const gesture = wheel.current;
    function handleWheel(event) {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      window.clearTimeout(gesture.timer);
      gesture.timer = window.setTimeout(() => {
        gesture.distance = 0;
        gesture.locked = false;
      }, 220);
      const { onNext, onPrevious, disabled } = callbacks.current;
      if (disabled || (event.deltaY < 0 && !onPrevious)) return;
      const scroll = element.closest(".main-scroll");
      if (
        scroll &&
        (event.deltaY > 0
          ? scroll.scrollTop + scroll.clientHeight < scroll.scrollHeight - 1
          : scroll.scrollTop > 0)
      )
        return;

      event.preventDefault();
      if (gesture.locked) return;
      if (Math.sign(event.deltaY) !== Math.sign(gesture.distance))
        gesture.distance = 0;
      gesture.distance += event.deltaY;
      if (Math.abs(gesture.distance) < 80) return;
      gesture.locked = true;
      if (gesture.distance > 0) onNext();
      else onPrevious();
    }
    function handleKeyDown(event) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      if (
        event.target.closest?.(
          "input, button, a, textarea, select, [contenteditable]",
        )
      )
        return;
      const { onNext, onPrevious, disabled } = callbacks.current;
      if (disabled) return;
      if (event.key === "ArrowUp") {
        event.preventDefault();
        onNext();
      } else if (event.key === "ArrowDown" && onPrevious) {
        event.preventDefault();
        onPrevious();
      }
    }
    element.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      element.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(gesture.timer);
    };
  }, [enabled]);

  return {
    ref: container,
    onPointerDown(event) {
      if (
        !enabled ||
        callbacks.current.disabled ||
        event.isPrimary === false ||
        event.button !== 0 ||
        event.target.closest?.("button, input, textarea, label, a")
      )
        return;
      pointer.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerUp(event) {
      const start = pointer.current;
      pointer.current = null;
      if (!start || start.id !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      const { onNext, onPrevious, disabled } = callbacks.current;
      if (disabled) return;
      const distance = start.y - event.clientY;
      if (
        Math.abs(distance) < 64 ||
        Math.abs(distance) <= Math.abs(start.x - event.clientX)
      )
        return;
      if (distance > 0) onNext();
      else onPrevious?.();
    },
    onPointerCancel() {
      pointer.current = null;
    },
  };
}
