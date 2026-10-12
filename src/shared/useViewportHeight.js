import { useLayoutEffect } from "react";

export function useViewportHeight(rootRef) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    const viewport = window.visualViewport;
    if (!root) return undefined;
    let frame = null;
    const update = () => {
      if (viewport && viewport.scale !== 1) return;
      const height = viewport?.height || window.innerHeight;
      root.style.setProperty("--app-viewport-height", `${height}px`);
      root.toggleAttribute("data-short-viewport", height < 500);
    };
    const schedule = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        update();
      });
    };
    update();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      root.style.removeProperty("--app-viewport-height");
      root.removeAttribute("data-short-viewport");
    };
  }, [rootRef]);
}
