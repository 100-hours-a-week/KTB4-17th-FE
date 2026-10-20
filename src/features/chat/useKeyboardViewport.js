import { useLayoutEffect } from "react";

export function useKeyboardViewport(rootRef, preservePosition) {
  useLayoutEffect(() => {
    const screen = rootRef.current?.closest(".app-screen");
    const viewport = window.visualViewport;
    if (!screen) return undefined;
    const properties = [
      "height",
      "minHeight",
      "position",
      "top",
      "left",
      "transform",
    ];
    const originalStyles = Object.fromEntries(
      properties.map((name) => [name, screen.style[name]]),
    );
    screen.classList.add("app-screen-chat");
    let frame = null;
    const restoreStyles = () => {
      for (const name of properties) screen.style[name] = originalStyles[name];
    };
    const resize = () => {
      if (
        window.matchMedia("(width < 600px)").matches &&
        (!viewport || viewport.scale === 1)
      ) {
        screen.style.height = `${viewport?.height || window.innerHeight}px`;
        screen.style.minHeight = "0";
        screen.style.position = "fixed";
        screen.style.top = `${viewport?.offsetTop || 0}px`;
        screen.style.left = "50%";
        screen.style.transform = "translateX(-50%)";
      } else {
        restoreStyles();
      }
      preservePosition();
    };
    const scheduleResize = () => {
      if (frame != null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        resize();
      });
    };
    resize();
    viewport?.addEventListener("resize", scheduleResize);
    viewport?.addEventListener("scroll", scheduleResize);
    window.addEventListener("resize", scheduleResize);
    return () => {
      if (frame != null) window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", scheduleResize);
      viewport?.removeEventListener("scroll", scheduleResize);
      window.removeEventListener("resize", scheduleResize);
      screen.classList.remove("app-screen-chat");
      restoreStyles();
    };
  }, [rootRef, preservePosition]);
}
