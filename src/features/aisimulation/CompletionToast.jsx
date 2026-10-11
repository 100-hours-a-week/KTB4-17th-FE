import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { simulationPath } from "./model.js";

export function CompletionToast({ completion, navigate, onDismiss, blocked }) {
  const remaining = useRef(3000);
  const [interacting, setInteracting] = useState(false);
  const [hidden, setHidden] = useState(document.visibilityState === "hidden");
  const [top, setTop] = useState(72);
  const toastRef = useRef(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useLayoutEffect(() => {
    const screen = toastRef.current?.closest(".app-screen");
    const updateTop = () => {
      const header =
        screen?.querySelector(".screen-header") ||
        screen?.querySelector(".brand-header");
      if (header && screen) {
        const offset =
          header.getBoundingClientRect().bottom -
          screen.getBoundingClientRect().top;
        setTop(Math.max(16, offset + 12));
      }
    };
    updateTop();
    window.addEventListener("resize", updateTop);
    return () => window.removeEventListener("resize", updateTop);
  });

  useEffect(() => {
    const update = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (interacting || hidden || blocked) return undefined;
    const startedAt = Date.now();
    const timer = window.setTimeout(
      () => dismissRef.current(),
      remaining.current,
    );
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(
        0,
        remaining.current - (Date.now() - startedAt),
      );
    };
  }, [interacting, hidden, blocked]);

  return (
    <section
      ref={toastRef}
      aria-label="시뮬레이션 완료 안내"
      className="simulation-completion-toast"
      style={{ top, visibility: blocked || hidden ? "hidden" : "visible" }}
      onPointerEnter={() => setInteracting(true)}
      onPointerLeave={() =>
        setInteracting(
          Boolean(toastRef.current?.contains(document.activeElement)),
        )
      }
      onFocus={() => setInteracting(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setInteracting(false);
      }}
    >
      <span role="status">✦ 시뮬레이션이 완료됐어요</span>
      <button
        type="button"
        onClick={() => {
          onDismiss();
          navigate(
            simulationPath(completion.simulationId, completion.chatRoomId),
          );
        }}
      >
        결과 보기 →
      </button>
      <button
        type="button"
        className="simulation-toast-close"
        aria-label="완료 안내 닫기"
        onClick={onDismiss}
      >
        ×
      </button>
    </section>
  );
}
