import { useEffect, useRef, useState } from "react";
import { PixelIcon } from "../../shared/ui/pixel.jsx";
import { notificationCopy } from "./model.js";
import { NotificationIllustration } from "./NotificationControls.jsx";

export function NotificationToast({ item, onOpen, onDismiss, blocked }) {
  const copy = notificationCopy(item);
  const [interacting, setInteracting] = useState(false);
  const [hidden, setHidden] = useState(document.visibilityState === "hidden");
  const root = useRef(null);
  const remaining = useRef(6000);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    const update = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (hidden || blocked || interacting) return undefined;
    const start = Date.now();
    const timer = window.setTimeout(() => dismiss.current(), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - start));
    };
  }, [hidden, blocked, interacting]);
  return (
    <section
      className="notification-toast"
      aria-label="새 알림"
      ref={root}
      style={{ visibility: hidden || blocked ? "hidden" : "visible" }}
      onPointerEnter={() => setInteracting(true)}
      onPointerLeave={() =>
        setInteracting(Boolean(root.current?.contains(document.activeElement)))
      }
      onFocus={() => setInteracting(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setInteracting(false);
      }}
    >
      <span className="sr-only" role="status">
        {copy.title}. {copy.body}
      </span>
      <button
        type="button"
        className="notification-toast-open"
        onClick={() => onOpen(item)}
      >
        <NotificationIllustration kind={copy.illustration} />
        <span>
          <small>삐삐! 새로운 소식</small>
          <strong>{copy.title}</strong>
          <span>{copy.body}</span>
        </span>
      </button>
      <button
        type="button"
        className="notification-toast-close"
        onClick={onDismiss}
        aria-label="새 알림 닫기"
      >
        <PixelIcon name="x" scale={2} />
      </button>
    </section>
  );
}
