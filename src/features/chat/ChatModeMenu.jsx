import { useEffect, useRef } from "react";
import { Icon } from "../../shared/ui/components.jsx";
import { PixelIcon } from "../../shared/ui/pixel.jsx";

export function ChatModeMenu({
  currentMode = "chat",
  targetMemberId,
  simulationStartingFor,
  onSimulation,
  onPractice,
}) {
  const menuRef = useRef(null);
  useEffect(() => {
    function dismissOutside(event) {
      const menu = menuRef.current;
      if (menu?.open && !menu.contains(event.target)) menu.open = false;
    }
    function dismissWithEscape(event) {
      const menu = menuRef.current;
      if (event.key !== "Escape" || !menu?.open) return;
      event.preventDefault();
      menu.open = false;
      menu.querySelector("summary")?.focus();
    }
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, []);
  function selectMode(action) {
    if (menuRef.current) menuRef.current.open = false;
    void action?.();
  }
  const generating =
    simulationStartingFor != null && simulationStartingFor === targetMemberId;
  return (
    <details ref={menuRef} className="chat-assistance">
      <summary aria-label="발신자 제한 모드: 시뮬레이션과 연습대화">
        <PixelIcon name="spark" className="chat-assistance-spark" />
        <span className="chat-assistance-title">발신자 제한 모드</span>
        <PixelIcon name="chev" className="chat-assistance-caret" />
      </summary>
      <div className="chat-assistance-menu">
        <button
          type="button"
          aria-current={currentMode === "simulation" ? "page" : undefined}
          aria-busy={generating}
          disabled={
            currentMode === "simulation" ||
            !targetMemberId ||
            simulationStartingFor != null ||
            !onSimulation
          }
          onClick={() => selectMode(onSimulation)}
        >
          <Icon name="action-simulation.svg" />
          <span className="chat-assistance-copy">
            <span>
              {generating ? "AI 시뮬레이션 생성 중…" : "AI 시뮬레이션"}
            </span>
            <small>두 AI가 대화하고 궁합을 분석해요</small>
          </span>
        </button>
        <button
          type="button"
          aria-current={currentMode === "practice" ? "page" : undefined}
          disabled={currentMode === "practice" || !onPractice}
          onClick={() => selectMode(onPractice)}
        >
          <Icon name="action-practice.svg" />
          <span className="chat-assistance-copy">
            <span>AI 연습대화</span>
            <small>상대의 성향을 반영한 AI와 연습해요</small>
          </span>
        </button>
      </div>
    </details>
  );
}
