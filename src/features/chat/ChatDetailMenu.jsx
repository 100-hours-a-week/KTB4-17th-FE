import { useEffect, useRef } from "react";

const UNAVAILABLE_MESSAGE = "아직 준비되지 않은 기능이에요.";

export function ChatDetailMenu({
  canBlock,
  canEndChat,
  canEndWithAi,
  blocking,
  endingChat,
  onBlock,
  onEndChat,
  toast,
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

  function select(action) {
    if (menuRef.current) menuRef.current.open = false;
    action();
  }

  const unavailable = () => toast(UNAVAILABLE_MESSAGE);

  return (
    <details ref={menuRef} className="chat-detail">
      <summary
        className="more-button chat-detail-summary"
        aria-label="채팅방 상세 메뉴"
      >
        •••
      </summary>
      <fieldset className="chat-detail-menu" aria-label="채팅방 상세 기능">
        <button
          type="button"
          className="chat-detail-menu-item chat-detail-menu-first chat-detail-unavailable"
          aria-disabled="true"
          onClick={() => select(unavailable)}
        >
          <span>채팅 알림 설정</span>
        </button>
        <button
          type="button"
          className={`chat-detail-menu-item chat-detail-unavailable${!canEndWithAi ? " chat-detail-menu-disabled" : ""}`}
          aria-disabled="true"
          disabled={!canEndWithAi}
          onClick={() => select(unavailable)}
        >
          <span>AI로 대화 종료</span>
        </button>
        <button
          type="button"
          className={`chat-detail-menu-item chat-detail-danger${!canBlock || blocking || endingChat ? " chat-detail-menu-disabled" : ""}`}
          disabled={!canBlock || blocking || endingChat}
          onClick={() => select(onBlock)}
        >
          <span>{blocking ? "차단 중…" : "회원 차단"}</span>
        </button>
        <button
          type="button"
          className={`chat-detail-menu-item chat-detail-danger${!canEndChat || blocking || endingChat ? " chat-detail-menu-disabled" : ""}`}
          disabled={!canEndChat || blocking || endingChat}
          onClick={() => select(onEndChat)}
        >
          <span>{endingChat ? "종료 중…" : "채팅 종료"}</span>
        </button>
      </fieldset>
    </details>
  );
}
