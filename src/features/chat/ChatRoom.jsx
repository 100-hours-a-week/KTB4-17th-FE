import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { asset } from "../../shared/assets.js";
import {
  BrandHeader,
  EmptyState,
  ScreenHeader,
} from "../../shared/ui/components.jsx";
import {
  prepareProfilePhoto,
  profilePhotoErrorMessage,
} from "../profile/photoUpload.js";
import * as chatApi from "./api.js";
import { ChatDetailMenu } from "./ChatDetailMenu.jsx";
import { ChatImage } from "./ChatImage.jsx";
import { ChatModeMenu } from "./ChatModeMenu.jsx";
import { MessageBubble } from "./MessageBubble.jsx";
import {
  formatFileSize,
  messagesAreGrouped,
  messageTimesAreGrouped,
} from "./model.js";
import { enqueueMessages, retryMessage } from "./outbox.js";
import {
  endRoomAfterBlock,
  isSessionActive,
  releasePreview,
  updateRoomSession,
} from "./session.js";
import { useChatRoom } from "./useChatRoom.js";
import { useChatScroll } from "./useChatScroll.js";

function BlockConfirmationDialog({
  memberName,
  blocking,
  onCancel,
  onConfirm,
}) {
  const cancelRef = useRef(null);

  useLayoutEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div className="chat-block-dialog-backdrop">
      <button
        type="button"
        className="chat-block-dialog-dismiss"
        aria-label="회원 차단 취소"
        tabIndex={-1}
        onClick={onCancel}
        disabled={blocking}
      />
      <section
        className="chat-block-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-block-title"
        aria-describedby="chat-block-description"
        onKeyDown={(event) => {
          if (event.key !== "Escape" || blocking) return;
          event.preventDefault();
          onCancel();
        }}
      >
        <h2 id="chat-block-title">{memberName}님을 차단할까요?</h2>
        <p id="chat-block-description">
          차단하면 더 이상 메시지를 주고받을 수 없으며, 차단은 되돌릴 수 없어요.
        </p>
        <div>
          <button
            ref={cancelRef}
            type="button"
            className="chat-block-dialog-button"
            onClick={onCancel}
            disabled={blocking}
          >
            취소
          </button>
          <button
            type="button"
            className="chat-block-dialog-button chat-block-dialog-primary"
            onClick={onConfirm}
            disabled={blocking}
          >
            {blocking ? "차단 중…" : "차단하기"}
          </button>
        </div>
      </section>
    </div>
  );
}

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

function useKeyboardViewport(rootRef, preservePosition) {
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
    visit,
    syncing,
    error,
    connection,
    loadingOlder,
    olderError,
    loadOlder,
    sync,
  } = room;
  const [viewingImage, setViewingImage] = useState(null);
  const [preparingImage, setPreparingImage] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const imageSelectionVersion = useRef(0);
  const imagePreparationPending = useRef(false);
  const blockRequestRef = useRef(null);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const imageInputRef = useRef(null);
  const viewerOpenerRef = useRef(null);
  const scroll = useChatScroll({ ...room, viewingImage });
  const canSend = Boolean(visit) && state.room?.status === "ACTIVE";
  const targetMemberId = state.room?.memberId;
  const parsedTargetMemberId = Number(targetMemberId);
  const canBlockMember =
    Number.isSafeInteger(parsedTargetMemberId) && parsedTargetMemberId > 0;
  const closeViewer = useCallback(() => setViewingImage(null), []);
  const openViewer = useCallback((message, opener) => {
    viewerOpenerRef.current = opener;
    setViewingImage({ message, opener });
  }, []);
  useKeyboardViewport(rootRef, scroll.preservePosition);

  useEffect(
    () => () => {
      imageSelectionVersion.current += 1;
      const blockRequest = blockRequestRef.current;
      blockRequestRef.current = null;
      blockRequest?.abort();
    },
    [],
  );

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
    imageSelectionVersion.current += 1;
    imagePreparationPending.current = false;
    setPreparingImage(false);
    releasePreview(entry, state.attachment?.previewUrl);
    updateRoomSession(entry, { attachment: null });
  }

  async function selectImage(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !canSend) return;
    const version = ++imageSelectionVersion.current;
    imagePreparationPending.current = true;
    setPreparingImage(true);
    try {
      const prepared = await prepareProfilePhoto(file);
      if (version !== imageSelectionVersion.current || !isSessionActive(entry))
        return;
      releasePreview(entry, entry.snapshot.attachment?.previewUrl);
      const previewUrl = URL.createObjectURL(prepared);
      entry.urls.add(previewUrl);
      updateRoomSession(entry, { attachment: { file: prepared, previewUrl } });
    } catch (error) {
      if (version === imageSelectionVersion.current && isSessionActive(entry))
        toast(profilePhotoErrorMessage(error));
    } finally {
      if (version === imageSelectionVersion.current) {
        imagePreparationPending.current = false;
        setPreparingImage(false);
      }
    }
  }

  function send() {
    const text = entry.snapshot.draft.trim();
    const attachment = entry.snapshot.attachment;
    if ((!text && !attachment) || !canSend || imagePreparationPending.current)
      return;
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

  async function blockMember() {
    if (!canBlockMember || blocking) return;

    const controller = new AbortController();
    blockRequestRef.current = controller;
    setBlocking(true);
    try {
      await chatApi.blockUser(parsedTargetMemberId, {
        signal: controller.signal,
      });
      if (blockRequestRef.current !== controller || !isSessionActive(entry))
        return;

      imageSelectionVersion.current += 1;
      imagePreparationPending.current = false;
      setPreparingImage(false);
      endRoomAfterBlock(entry);
      setBlockDialogOpen(false);
      toast("회원을 차단했어요.");
    } catch (requestError) {
      if (
        requestError.name !== "AbortError" &&
        blockRequestRef.current === controller
      )
        toast(
          apiErrorMessage(
            requestError,
            "회원을 차단하지 못했어요. 잠시 후 다시 시도해주세요.",
          ),
        );
    } finally {
      if (blockRequestRef.current === controller) {
        blockRequestRef.current = null;
        setBlocking(false);
      }
    }
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
      <div
        className="chat-room-content"
        inert={Boolean(viewingImage || blockDialogOpen)}
      >
        <BrandHeader navigate={navigate}>
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
        </BrandHeader>
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
              <ChatDetailMenu
                canBlock={canBlockMember}
                blocking={blocking}
                onBlock={() => setBlockDialogOpen(true)}
                toast={toast}
              />
            </div>
          }
        />
        {connectionMessage && (
          <div className="chat-connection-status" role="status">
            {connectionMessage}
          </div>
        )}
        {scroll.readError && (
          <div className="chat-sync-error" role="alert">
            <span>읽음 상태를 갱신하지 못했어요.</span>
            <button type="button" onClick={scroll.retryRead}>
              다시 시도
            </button>
          </div>
        )}
        {error && state.loaded && visit && (
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
            aria-busy={!visit && syncing}
            onScroll={scroll.onScroll}
          >
            {!visit ? (
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
                      const startsUnread =
                        Number(message.id) === visit.unreadBoundaryId;
                      const grouped =
                        !startsUnread && messagesAreGrouped(previous, message);
                      const showTime =
                        Number(state.messages[index + 1]?.id) ===
                          visit.unreadBoundaryId ||
                        !messageTimesAreGrouped(
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
                          {startsUnread && (
                            <div
                              className="chat-unread-divider"
                              data-unread-message-id={message.id}
                              role="status"
                            >
                              <span>여기까지 읽었습니다.</span>
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
          {preparingImage && (
            <p className="image-upload-status" role="status">
              사진을 준비하고 있어요…
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
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
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
              disabled={
                preparingImage ||
                (!state.draft.trim() && !state.attachment) ||
                !canSend
              }
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
      {blockDialogOpen && (
        <BlockConfirmationDialog
          memberName={state.room?.name || "상대 회원"}
          blocking={blocking}
          onCancel={() => setBlockDialogOpen(false)}
          onConfirm={() => void blockMember()}
        />
      )}
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
