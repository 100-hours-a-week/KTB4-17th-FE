import { useEffect, useRef } from "react";

const UNAVAILABLE_MESSAGE = "아직 준비되지 않은 기능이에요.";

export function ChatDetailMenu({ canBlock, blocking, onBlock, toast }) {
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
          <small className="chat-detail-menu-note">준비 중</small>
        </button>
        <button
          type="button"
          className="chat-detail-menu-item chat-detail-unavailable"
          aria-disabled="true"
          onClick={() => select(unavailable)}
        >
          <span>신고하기</span>
          <small className="chat-detail-menu-note">준비 중</small>
        </button>
        <button
          type="button"
          className={`chat-detail-menu-item chat-detail-danger${!canBlock || blocking ? " chat-detail-menu-disabled" : ""}`}
          disabled={!canBlock || blocking}
          onClick={() => select(onBlock)}
        >
          <span>{blocking ? "차단 중…" : "회원 차단"}</span>
        </button>
        <button
          type="button"
          className="chat-detail-menu-item chat-detail-unavailable"
          aria-disabled="true"
          onClick={() => select(unavailable)}
        >
          <span>채팅방 나가기</span>
          <small className="chat-detail-menu-note">준비 중</small>
        </button>
      </fieldset>
    </details>
  );
}
