import { useEffect, useState } from "react";
import { waitForHandSide } from "./handGuide.js";

export function useHandGuideSide({ videoRef, enabled, attemptKey }) {
  const [side, setSide] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    setSide(null);
    setUnavailable(false);
    if (!enabled || !attemptKey) return undefined;
    const controller = new AbortController();
    void waitForHandSide(videoRef.current, { signal: controller.signal }).then(
      (selected) => {
        if (!controller.signal.aborted) setSide(selected);
      },
      () => {
        if (!controller.signal.aborted) setUnavailable(true);
      },
    );
    return () => controller.abort();
  }, [videoRef, enabled, attemptKey]);
  return { side, unavailable };
}
