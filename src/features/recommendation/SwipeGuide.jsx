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
        <span className="home-swipe-guide-arrow">
          <PixelIcon name="arrowDown" scale={2} />
        </span>
        <span className="home-swipe-guide-hand">
          <PixelIcon
            name="swipeHand"
            scale={2}
            colors={{ X: "#f4edff", W: "#b8a4df" }}
          />
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
