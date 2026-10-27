import { useEffect, useState } from "react";
import { PixelIcon } from "../../shared/ui/pixel.jsx";
import { watchIdleSwipeGuide } from "./idleSwipeGuide.js";

export function useSwipeGuide({ enabled, consumed }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    return watchIdleSwipeGuide({ consumed, onVisible: setVisible });
  }, [enabled, consumed]);

  return enabled && visible && !consumed.current;
}

export function SwipeGuide({ direction, canRetreat = false }) {
  const up = direction === "up";
  return (
    <div className={`home-swipe-guide is-${direction}`} aria-hidden="true">
      <div className="home-swipe-guide-track">
        <span className="home-swipe-guide-arrows">
          {[0, 1, 2].map((index) => (
            <PixelIcon key={index} name="back" scale={2} />
          ))}
        </span>
      </div>
      <span className="home-swipe-guide-label">
        <span>{up ? "위로 스와이프" : "아래로 스와이프"}</span>
        <span className="home-swipe-guide-detail">
          {up ? "다음 프로필" : canRetreat ? "이전 프로필" : "새로고침"}
        </span>
      </span>
    </div>
  );
}
