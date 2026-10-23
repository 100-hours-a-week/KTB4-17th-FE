import { useEffect, useState } from "react";
import { PixelIcon } from "../../shared/ui/pixel.jsx";
import { watchIdleSwipeGuide } from "./idleSwipeGuide.js";

export function SwipeGuide({ enabled, consumed, canAdvance, canRetreat }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    return watchIdleSwipeGuide({ consumed, onVisible: setVisible });
  }, [enabled, consumed]);

  if (!enabled || !visible || consumed.current) return null;
  return (
    <div className="home-swipe-guide" aria-hidden="true">
      <span className="home-swipe-guide-caption">SWIPE</span>
      <div className="home-swipe-guide-track">
        {canAdvance && (
          <span className="home-swipe-guide-up">
            <PixelIcon name="arrowDown" scale={2} />
          </span>
        )}
        <span className="home-swipe-guide-hand">
          <PixelIcon
            name="swipeHand"
            scale={2}
            colors={{ X: "#f4edff", W: "#b8a4df" }}
          />
        </span>
        <span className="home-swipe-guide-down">
          <PixelIcon name="arrowDown" scale={2} />
        </span>
      </div>
      <span className="home-swipe-guide-label">
        {canAdvance && <span>위로 다음</span>}
        <span>{canRetreat ? "아래로 이전" : "아래로 새로고침"}</span>
      </span>
    </div>
  );
}
