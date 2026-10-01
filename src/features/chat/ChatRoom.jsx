import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { asset } from "../../shared/assets.js";
import {
  BrandHeader,
  EmptyState,
  ScreenHeader,
} from "../../shared/ui/components.jsx";
import * as chatApi from "./api.js";
import { ChatImage } from "./ChatImage.jsx";
import { ChatModeMenu } from "./ChatModeMenu.jsx";
import { MessageBubble } from "./MessageBubble.jsx";
import {
  formatFileSize,
  messagesAreGrouped,
  messageTimesAreGrouped,
} from "./model.js";
import { enqueueMessages, retryMessage } from "./outbox.js";
import { releasePreview, updateRoomSession } from "./session.js";
import { useChatRoom } from "./useChatRoom.js";
import { useChatScroll } from "./useChatScroll.js";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function ImageViewer({ message, entry, onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  useLayoutEffect(() => {
    closeRef.current?.focus();
  }, []);
  return (
    <div
      ref={dialogRef}
      className="image-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="사진 크게 보기"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
        if (event.key !== "Tab") return;
        const buttons = [
          ...dialogRef.current.querySelectorAll("button:not([disabled])"),
        ].filter((button) => button.tabIndex >= 0);
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <button
        type="button"
        tabIndex={-1}
        className="image-viewer-backdrop"
        aria-label="사진 닫기"
        onClick={onClose}
      />
      <button
        ref={closeRef}
        type="button"
        className="image-viewer-close"
        aria-label="사진 닫기"
        onClick={onClose}
      >
        ×
      </button>
      <ChatImage message={message} entry={entry} viewer />
    </div>
  );
}

function useKeyboardViewport(rootRef) {
  useEffect(() => {
    const screen = rootRef.current?.closest(".app-screen");
    const viewport = window.visualViewport;
    if (!screen || !viewport) return undefined;
    const originalHeight = screen.style.height;
    const originalMinHeight = screen.style.minHeight;
    const resize = () => {
      if (
        window.matchMedia("(width < 600px)").matches &&
        viewport.scale === 1
      ) {
        screen.style.height = `${viewport.height}px`;
        screen.style.minHeight = "0";
      } else {
        screen.style.height = originalHeight;
        screen.style.minHeight = originalMinHeight;
      }
    };
    resize();
    viewport.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
      screen.style.height = originalHeight;
      screen.style.minHeight = originalMinHeight;
    };
  }, [rootRef]);
}

export function ChatRoom(props) {
  const roomId = Number(window.location.pathname.split("/").pop());
  return <ChatRoomContent key={roomId} roomId={roomId} {...props} />;
}

function ChatRoomContent({
  roomId,
  navigate,
  toast,
  onStartSimulation,
  simulationStartingFor,
}) {
  const room = useChatRoom(roomId);
  const {
    entry,
    state,
    syncing,
    error,
    connection,
    loadingOlder,
    olderError,
    loadOlder,
    sync,
  } = room;
  const [viewingImage, setViewingImage] = useState(null);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const imageInputRef = useRef(null);
  const viewerOpenerRef = useRef(null);
  const scroll = useChatScroll({ ...room, viewingImage });
  const canSend = state.loaded && state.room?.status === "ACTIVE";
  const targetMemberId = state.room?.memberId;
  const closeViewer = useCallback(() => setViewingImage(null), []);
  const openViewer = useCallback((message, opener) => {
    viewerOpenerRef.current = opener;
    setViewingImage({ message, opener });
  }, []);
  useKeyboardViewport(rootRef);

  useLayoutEffect(() => {
    if (viewingImage || !viewerOpenerRef.current) return;
    const opener = viewerOpenerRef.current;
    viewerOpenerRef.current = null;
    if (opener.isConnected) opener.focus({ preventScroll: true });
  }, [viewingImage]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    const height = input.scrollHeight;
    input.style.height = `${Math.min(Math.max(height, 44), 120)}px`;
    input.style.overflowY = height > 120 ? "auto" : "hidden";
    if (!state.draft) input.scrollTop = 0;
  }, [state.draft]);

  function clearAttachment() {
    releasePreview(entry, state.attachment?.previewUrl);
    updateRoomSession(entry, { attachment: null });
  }

  function selectImage(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.has(file.type)) {
      toast("JPG, PNG, WebP 이미지만 첨부할 수 있어요.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast("사진은 10MB 이하로 첨부할 수 있어요.");
      return;
    }
    releasePreview(entry, entry.snapshot.attachment?.previewUrl);
    const previewUrl = URL.createObjectURL(file);
    entry.urls.add(previewUrl);
    updateRoomSession(entry, { attachment: { file, previewUrl } });
  }

  function send() {
    const text = entry.snapshot.draft.trim();
    const attachment = entry.snapshot.attachment;
    if ((!text && !attachment) || !canSend) return;
    scroll.scrollToLatest();
    enqueueMessages(entry, text, attachment, chatApi);
    // Keep the active composer available; do not wait for a network response or
    // focus it later when the user may already be interacting elsewhere.
    inputRef.current?.focus({ preventScroll: true });
  }

  function navigateToProfile() {
    if (targetMemberId)
      navigate(
        `/profiles/${targetMemberId}?returnTo=${encodeURIComponent(`/chats/${roomId}`)}`,
      );
  }

  const connectionMessage =
    connection === "offline"
      ? "인터넷 연결이 끊겼어요. 연결 후 다시 시도해주세요."
      : connection === "unauthenticated"
        ? "다시 로그인해주세요."
        : ["error", "reconnecting"].includes(connection)
          ? "실시간 연결을 복구하고 있어요."
          : "";
  const viewerMessage =
    viewingImage &&
    (state.messages.find(
      (message) => message.renderKey === viewingImage.message.renderKey,
    ) ||
      viewingImage.message);

  return (
    <section ref={rootRef} className="chat-room-view" aria-label="채팅방">
      <div className="chat-room-content" inert={Boolean(viewingImage)}>
        <BrandHeader navigate={navigate} />
        <ScreenHeader
          className="chat-room-header conversation-header chat-room-partner-header"
          title={
            <span className="chat-room-partner">
              <button
                type="button"
                className="chat-room-partner-profile"
                aria-label={`${state.room?.name || "상대 회원"} 프로필 보기`}
                disabled={!targetMemberId}
                onClick={navigateToProfile}
              >
                <img
                  className="chat-room-avatar chat-room-partner-photo"
                  src={
                    state.room?.image || asset("chat-avatar-heart-terminal.svg")
                  }
                  alt=""
                  onError={(event) => {
                    const fallback = asset("chat-avatar-heart-terminal.svg");
                    if (event.currentTarget.getAttribute("src") !== fallback)
                      event.currentTarget.src = fallback;
                  }}
                />
              </button>
              <span className="chat-room-partner-name">
                {state.room?.name || "채팅"}
              </span>
            </span>
          }
          onBack={() => navigate("/chats")}
          right={
            <div className="chat-header-actions">
              <ChatModeMenu
                targetMemberId={targetMemberId}
                simulationStartingFor={simulationStartingFor}
                onSimulation={() => onStartSimulation?.(targetMemberId, roomId)}
                onPractice={
                  targetMemberId
                    ? () =>
                        navigate(
                          `/ai/practice/${targetMemberId}?chatRoomId=${roomId}`,
                        )
                    : undefined
                }
              />
              <button
                type="button"
                className="more-button"
                aria-label="채팅방 더보기"
                onClick={() => toast("채팅방 설정은 준비 중이에요.")}
              >
                •••
              </button>
            </div>
          }
        />
        {connectionMessage && (
          <div className="chat-connection-status" role="status">
            {connectionMessage}
          </div>
        )}
        {error && state.loaded && (
          <div className="chat-sync-error" role="alert">
            <span>{error.message}</span>
            <button
              type="button"
              disabled={syncing}
              onClick={() => void sync()}
            >
              다시 시도
            </button>
          </div>
        )}
        <div className="chat-message-area">
          <section
            ref={scroll.containerRef}
            className="chat-messages chat-room-messages"
            aria-label="대화 메시지"
            aria-busy={!state.loaded && syncing}
            onScroll={scroll.onScroll}
          >
            {!state.loaded ? (
              error ? (
                <div className="chat-room-load-state" role="alert">
                  <p>{error.message}</p>
                  {error.code === "AUTH_REQUIRED" ? (
                    <button type="button" onClick={() => navigate("/login")}>
                      로그인하기
                    </button>
                  ) : error.code === "CHAT_ACCESS_DENIED" ||
                    error.code === "CHAT_ROOM_NOT_FOUND" ? (
                    <button type="button" onClick={() => navigate("/chats")}>
                      채팅 목록으로
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={syncing}
                      onClick={() => void sync()}
                    >
                      다시 시도
                    </button>
                  )}
                </div>
              ) : (
                <div className="chat-room-load-state" role="status">
                  대화를 불러오는 중…
                </div>
              )
            ) : (
              <>
                <div ref={scroll.topRef} className="chat-history-controls">
                  {state.pageInfo.hasNext ? (
                    loadingOlder ? (
                      <span role="status">이전 메시지를 불러오는 중…</span>
                    ) : (
                      <>
                        <button type="button" onClick={() => void loadOlder()}>
                          {olderError
                            ? "이전 메시지 다시 불러오기"
                            : "이전 메시지 보기"}
                        </button>
                        {olderError && <span role="alert">{olderError}</span>}
                      </>
                    )
                  ) : (
                    state.messages.length > 0 && <span>대화의 시작이에요.</span>
                  )}
                </div>
                <div ref={scroll.listRef} className="chat-message-list">
                  {state.messages.length ? (
                    state.messages.map((message, index) => {
                      const previous = state.messages[index - 1];
                      const grouped = messagesAreGrouped(previous, message);
                      const showTime = !messageTimesAreGrouped(
                        message,
                        state.messages[index + 1],
                      );
                      return (
                        <Fragment key={message.renderKey}>
                          {message.dateKey &&
                            message.dateKey !== previous?.dateKey && (
                              <div className="chat-date-divider">
                                <span>{message.dateLabel}</span>
                              </div>
                            )}
                          <MessageBubble
                            message={message}
                            avatar={state.room?.image || ""}
                            senderName={state.room?.name || ""}
                            chatRoom
                            grouped={grouped}
                            showTime={showTime}
                            entry={entry}
                            onViewImage={openViewer}
                            onImageLoaded={scroll.preservePosition}
                            onViewProfile={
                              targetMemberId ? navigateToProfile : undefined
                            }
                            canRetry={canSend}
                            onRetry={(clientMessageId) =>
                              retryMessage(entry, clientMessageId, chatApi)
                            }
                          />
                        </Fragment>
                      );
                    })
                  ) : (
                    <EmptyState
                      title="아직 대화가 없어요"
                      description="첫 인사를 건네보세요."
                    />
                  )}
                </div>
              </>
            )}
          </section>
          {!scroll.atBottom && state.loaded && (
            <button
              type="button"
              className="chat-latest-button"
              onClick={scroll.scrollToLatest}
            >
              {scroll.newCount
                ? `새 메시지 ${scroll.newCount}개 ↓`
                : "최신 메시지 ↓"}
            </button>
          )}
        </div>
        <div
          className="chat-sr-only"
          role="log"
          aria-live="polite"
          aria-relevant="text"
        >
          {scroll.announcement}
        </div>
        <form
          className="message-composer"
          aria-label="메시지 작성"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          {state.loaded && !canSend && (
            <p className="chat-ended-notice" role="status">
              대화가 종료되어 메시지를 보낼 수 없어요.
            </p>
          )}
          {state.attachment && (
            <div className="image-attachment-preview">
              <img
                src={state.attachment.previewUrl}
                alt="첨부할 사진 미리보기"
              />
              <div className="image-attachment-file-info">
                <strong>{state.attachment.file.name}</strong>
                <small>{formatFileSize(state.attachment.file.size)}</small>
              </div>
              <button
                type="button"
                className="image-attachment-remove"
                aria-label="첨부 사진 삭제"
                onClick={clearAttachment}
              >
                ×
              </button>
            </div>
          )}
          <div className="message-composer-controls">
            <button
              type="button"
              className="attach-image-button"
              aria-label="사진 첨부"
              disabled={!canSend}
              onClick={() => imageInputRef.current?.click()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 8h13v12H3z" />
                <circle cx="7" cy="12" r="1.25" />
                <path d="m4.5 18 3.5-4 2.5 2.5 2-2 2.5 3.5" />
                <path d="M20 1.5v5M17.5 4h5" />
              </svg>
            </button>
            <input
              ref={imageInputRef}
              className="image-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="첨부할 사진 선택"
              onChange={selectImage}
            />
            <textarea
              ref={inputRef}
              className="message-text-input"
              value={state.draft}
              onChange={(event) =>
                updateRoomSession(entry, { draft: event.currentTarget.value })
              }
              onKeyDown={(event) => {
                if (
                  event.key !== "Enter" ||
                  event.shiftKey ||
                  event.nativeEvent.isComposing ||
                  event.nativeEvent.keyCode === 229
                )
                  return;
                const desktop = window.matchMedia(
                  "(hover: hover) and (pointer: fine)",
                ).matches;
                if (!desktop && !event.ctrlKey && !event.metaKey) return;
                event.preventDefault();
                send();
              }}
              placeholder={
                state.loaded && !canSend
                  ? "종료된 대화예요"
                  : "메시지를 입력하세요"
              }
              aria-label="메시지"
              aria-describedby={
                state.draft.length >= 900 ? "chat-input-count" : undefined
              }
              enterKeyHint={
                window.matchMedia("(hover: hover) and (pointer: fine)").matches
                  ? "send"
                  : "enter"
              }
              rows={1}
              maxLength={1000}
              disabled={state.loaded && !canSend}
            />
            <button
              type="submit"
              disabled={(!state.draft.trim() && !state.attachment) || !canSend}
              aria-label="보내기"
              onPointerDown={(event) => {
                if (event.pointerType === "mouse") event.preventDefault();
              }}
            >
              ➤
            </button>
          </div>
          {state.draft.length >= 900 && (
            <small id="chat-input-count" className="chat-input-count">
              {state.draft.length}/1000
            </small>
          )}
        </form>
      </div>
      {viewingImage && (
        <ImageViewer
          message={viewerMessage}
          entry={entry}
          onClose={closeViewer}
        />
      )}
    </section>
  );
}
