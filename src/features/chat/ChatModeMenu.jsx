export function ChatModeMenu({
  currentMode = "chat",
  targetMemberId,
  simulationStartingFor,
  onSimulation,
  onPractice,
  onChat,
}) {
  const generating =
    simulationStartingFor != null && simulationStartingFor === targetMemberId;
  return (
    <details className="chat-assistance">
      <summary aria-label="AI 대화 도우미">AI</summary>
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
          onClick={() => void onSimulation?.()}
        >
          {generating ? "생성 중…" : "AI 시뮬레이션"}
        </button>
        <button
          type="button"
          aria-current={currentMode === "practice" ? "page" : undefined}
          disabled={currentMode === "practice" || !onPractice}
          onClick={onPractice}
        >
          연습 대화
        </button>
        {onChat && (
          <button type="button" onClick={onChat}>
            채팅으로 돌아가기
          </button>
        )}
      </div>
    </details>
  );
}
