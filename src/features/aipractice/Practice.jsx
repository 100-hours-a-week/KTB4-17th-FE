import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { createMessageId } from "../../shared/messageId.js";
import { ScreenHeader } from "../../shared/ui/components.jsx";
import { AiAvatar } from "../../shared/ui/pixel.jsx";
import { MessageBubble } from "../chat/Chat.jsx";
import { ChatModeMenu } from "../chat/ChatModeMenu.jsx";
import { useKeyboardViewport } from "../chat/useKeyboardViewport.js";
import { getUserProfile } from "../profile/api.js";
import {
  isPracticeAccessUnavailable,
  PRACTICE_UNAVAILABLE_MESSAGE,
} from "./access.js";
import * as aiPracticeApi from "./api.js";
import { connectAiPracticeSocket } from "./socket.js";
import { usePracticeScroll } from "./usePracticeScroll.js";

export function mergePracticeChats(current, incoming) {
  const chatsById = new Map(current.map((chat) => [chat.id, chat]));
  for (const chat of incoming) {
    chatsById.set(chat.id, { ...chatsById.get(chat.id), ...chat });
  }
  return [...chatsById.values()].sort((left, right) => left.id - right.id);
}

export async function loadPracticeHistory(sessionId) {
  let cursor;
  let session = null;
  let chats = [];
  for (let pageIndex = 0; pageIndex < 100; pageIndex++) {
    const page = await aiPracticeApi.aiPracticeHistory(sessionId, {
      cursor,
      size: 100,
    });
    session ||= page?.session || null;
    chats = mergePracticeChats(chats, page?.chats || []);
    if (!page?.hasNext || page.nextCursor == null) break;
    cursor = page.nextCursor;
  }
  return { session, chats };
}

export function practiceErrorMessage(error) {
  const messages = {
    AUTH_REQUIRED: "로그인이 만료됐어요. 다시 로그인한 뒤 이용해 주세요.",
    TARGET_USER_NOT_FOUND: "상대 회원 정보를 찾을 수 없어요.",
    SESSION_NOT_FOUND: "AI 연습대화 정보를 찾을 수 없어요.",
    SESSION_ENDED: "종료된 AI 연습대화에는 새 메시지를 보낼 수 없어요.",
    GENERATION_IN_PROGRESS: "AI가 이전 메시지에 답변하고 있어요.",
    DAILY_LIMIT_EXCEEDED: "오늘의 연습 횟수를 모두 사용했어요.",
    CHAT_NOT_RETRYABLE: "이 답변은 다시 시도할 수 없어요.",
    AI_SERVER_NOT_CONFIGURED: "AI 응답 서버가 아직 연결되지 않았어요.",
  };
  return (
    (Object.hasOwn(messages, error?.code) && messages[error.code]) ||
    apiErrorMessage(
      error,
      "AI 연습대화를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
    )
  );
}

export function Practice({
  targetUserId,
  chatRoomId,
  navigate,
  onStartSimulation,
  simulationStartingFor,
}) {
  const [partner, setPartner] = useState(null);
  const rootRef = useRef(null);
  const endDialogRef = useRef(null);
  const [input, setInput] = useState("");
  const [session, setSession] = useState(null);
  const [chats, setChats] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [sending, setSending] = useState(false);
  const [retryingChatId, setRetryingChatId] = useState(null);
  const [sendError, setSendError] = useState("");
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [ending, setEnding] = useState(false);
  const [accessUnavailable, setAccessUnavailable] = useState(false);
  const id = Number(targetUserId);
  const backPath = chatRoomId ? `/chats/${chatRoomId}` : "/home";
  const count = (usage?.used || 0) + (usage?.reserved || 0);
  const dailyLimit = usage?.dailyLimit || 30;
  const sessionLoadKey = `${id}:${loadAttempt}`;
  const messageScrollKey = `${chats
    .map((chat) => `${chat.id}:${chat.status}`)
    .join(",")}`;
  const hasGenerating = chats.some((chat) => chat.status === "GENERATING");
  const chatsRef = useRef(chats);
  const refreshRef = useRef(() => Promise.resolve());
  const requestRef = useRef(null);
  const accessUnavailableRef = useRef(false);
  const composerInputRef = useRef(null);
  const focusAfterSendRef = useRef(false);
  chatsRef.current = chats;
  const scroll = usePracticeScroll(messageScrollKey, session?.id);
  useKeyboardViewport(rootRef, scroll.preservePosition);
  const partnerName = partner?.nickname || "상대 회원";

  useEffect(() => {
    let active = true;
    setPartner(null);
    if (Number.isSafeInteger(id) && id > 0) {
      getUserProfile(id)
        .then((profile) => {
          if (active) setPartner(profile);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [id]);

  useLayoutEffect(() => {
    const inputElement = composerInputRef.current;
    if (!inputElement) return;
    inputElement.style.height = "auto";
    const height = inputElement.scrollHeight;
    inputElement.style.height = `${Math.min(Math.max(height, 44), 120)}px`;
    inputElement.style.overflowY = height > 120 ? "auto" : "hidden";
    if (!input) inputElement.scrollTop = 0;
    scroll.preservePosition();
  }, [input, scroll.preservePosition]);

  useEffect(() => {
    if (!showEndDialog) return undefined;
    const opener = document.activeElement;
    endDialogRef.current
      ?.querySelector("button")
      ?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [showEndDialog]);

  const markAccessUnavailable = useCallback(() => {
    accessUnavailableRef.current = true;
    requestRef.current = null;
    focusAfterSendRef.current = false;
    setSession(null);
    setChats([]);
    setInput("");
    setLoadError(PRACTICE_UNAVAILABLE_MESSAGE);
    setSendError("");
    setShowEndDialog(false);
    setSending(false);
    setRetryingChatId(null);
    setEnding(false);
    setAccessUnavailable(true);
  }, []);

  useEffect(() => {
    const [userIdValue] = sessionLoadKey.split(":");
    const userId = Number(userIdValue);
    let active = true;
    setLoading(true);
    setLoadError("");
    setInput("");
    setSendError("");
    setAccessUnavailable(false);
    accessUnavailableRef.current = false;
    focusAfterSendRef.current = false;
    requestRef.current = null;
    setSession(null);
    setChats([]);
    setUsage(null);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      setLoadError("상대 회원 ID가 없어 AI 연습대화를 시작할 수 없어요.");
      setLoading(false);
      return () => {
        active = false;
      };
    }
    (async () => {
      const startedSession = await aiPracticeApi.aiPracticeStart(userId);
      const [history, todayUsage] = await Promise.all([
        loadPracticeHistory(startedSession.id),
        aiPracticeApi.aiPracticeUsage(),
      ]);
      if (!active) return;
      setSession(history.session || startedSession);
      setChats(history.chats);
      setUsage(todayUsage);
    })()
      .catch((error) => {
        if (!active) return;
        if (isPracticeAccessUnavailable(error)) markAccessUnavailable();
        else setLoadError(practiceErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [markAccessUnavailable, sessionLoadKey]);

  useEffect(() => {
    if (!session?.id) return undefined;
    let active = true;
    async function refresh() {
      if (accessUnavailableRef.current) return;
      try {
        const currentChats = chatsRef.current;
        const pendingChat = currentChats.find(
          (chat) => chat.status === "GENERATING",
        );
        const lastChat = currentChats.at(-1);
        const cursor = pendingChat
          ? pendingChat.id > 1
            ? pendingChat.id - 1
            : undefined
          : lastChat?.id;
        const page = await aiPracticeApi.aiPracticeHistory(session.id, {
          cursor,
          size: 100,
        });
        if (!active || accessUnavailableRef.current) return;
        setChats((current) => mergePracticeChats(current, page?.chats || []));
        const todayUsage = await aiPracticeApi.aiPracticeUsage();
        if (active && !accessUnavailableRef.current) setUsage(todayUsage);
      } catch (error) {
        if (active && isPracticeAccessUnavailable(error))
          markAccessUnavailable();
        // REST history remains the recovery path if a live update was missed.
      }
    }
    refreshRef.current = refresh;
    const disconnect = connectAiPracticeSocket({
      onMessage(event) {
        if (accessUnavailableRef.current || event.sessionId !== session.id)
          return;
        setChats((current) =>
          current.map((chat) =>
            chat.id === event.chatId
              ? {
                  ...chat,
                  status: event.status,
                  aiResponse: event.aiResponse || null,
                  failureCode: event.failureCode || null,
                  completedAt: event.completedAt || null,
                }
              : chat,
          ),
        );
        void refresh();
      },
      onStatus(status) {
        if (status === "connected") void refresh();
      },
    });
    return () => {
      active = false;
      disconnect();
      refreshRef.current = () => Promise.resolve();
    };
  }, [markAccessUnavailable, session?.id]);

  useEffect(() => {
    if (!session?.id || !hasGenerating) return undefined;
    const timer = window.setInterval(() => {
      void refreshRef.current();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [session?.id, hasGenerating]);

  async function send() {
    const text = input.trim();
    if (!text) return;
    if (
      accessUnavailable ||
      sending ||
      hasGenerating ||
      !session ||
      session.status !== "ACTIVE" ||
      !usage ||
      count >= dailyLimit
    )
      return;

    const request =
      requestRef.current?.userMessage === text
        ? requestRef.current
        : { clientMessageId: createMessageId(), userMessage: text };
    requestRef.current = request;
    scroll.scrollToLatest();
    setSending(true);
    setSendError("");
    try {
      const accepted = await aiPracticeApi.aiPracticeSend(session.id, request);
      if (accessUnavailableRef.current) return;
      focusAfterSendRef.current = true;
      requestRef.current = null;
      setChats((current) =>
        mergePracticeChats(current, [
          {
            id: accepted.chatId,
            clientMessageId: request.clientMessageId,
            userMessage: text,
            aiResponse: null,
            status: accepted.status || "GENERATING",
            isRetry: false,
            failureCode: null,
            createdAt: accepted.createdAt,
            completedAt: null,
          },
        ]),
      );
      setInput("");
      const todayUsage = await aiPracticeApi
        .aiPracticeUsage()
        .catch(() => null);
      if (todayUsage) setUsage(todayUsage);
    } catch (error) {
      if (isPracticeAccessUnavailable(error)) {
        markAccessUnavailable();
        return;
      }
      setSendError(practiceErrorMessage(error));
      void refreshRef.current();
      if (error?.code === "DAILY_LIMIT_EXCEEDED") {
        aiPracticeApi
          .aiPracticeUsage()
          .then(setUsage)
          .catch(() => {});
      }
    } finally {
      setSending(false);
    }
  }

  async function retry(chat) {
    if (accessUnavailable || !session || retryingChatId != null) return;
    setRetryingChatId(chat.id);
    setSendError("");
    try {
      const accepted = await aiPracticeApi.aiPracticeRetry(session.id, chat.id);
      if (accessUnavailableRef.current) return;
      setChats((current) =>
        current.map((item) =>
          item.id === chat.id
            ? {
                ...item,
                status: accepted.status || "GENERATING",
                aiResponse: null,
                failureCode: null,
                isRetry: true,
              }
            : item,
        ),
      );
      setUsage(await aiPracticeApi.aiPracticeUsage());
    } catch (error) {
      if (isPracticeAccessUnavailable(error)) {
        markAccessUnavailable();
        return;
      }
      setSendError(practiceErrorMessage(error));
      void refreshRef.current();
    } finally {
      setRetryingChatId(null);
    }
  }

  async function endSession() {
    if (accessUnavailable || !session || ending) return;
    setEnding(true);
    setSendError("");
    try {
      const endedSession = await aiPracticeApi.aiPracticeEnd(session.id);
      if (accessUnavailableRef.current) return;
      setSession(endedSession);
      setShowEndDialog(false);
    } catch (error) {
      if (isPracticeAccessUnavailable(error)) {
        markAccessUnavailable();
        return;
      }
      setSendError(practiceErrorMessage(error));
    } finally {
      setEnding(false);
    }
  }

  const inputDisabled =
    accessUnavailable ||
    loading ||
    !session ||
    session.status !== "ACTIVE" ||
    !usage ||
    sending ||
    hasGenerating ||
    count >= dailyLimit;
  useEffect(() => {
    if (!focusAfterSendRef.current || inputDisabled) return;
    focusAfterSendRef.current = false;
    composerInputRef.current?.focus({ preventScroll: true });
  }, [inputDisabled]);
  const partnerTitle = (
    <span className="practice-partner">
      <AiAvatar size={34} />
      <span className="practice-partner-copy">
        <span>{partnerName}</span>
        <small>AI 연습대화</small>
      </span>
    </span>
  );
  const inputPlaceholder = accessUnavailable
    ? "이용할 수 없는 대화예요"
    : count >= dailyLimit
      ? "오늘의 연습을 마쳤어요"
      : session?.status === "ENDED"
        ? "종료된 대화예요"
        : hasGenerating || sending
          ? "AI가 답변을 준비하고 있어요…"
          : loading
            ? "대화를 불러오는 중이에요…"
            : "메시지를 입력해 주세요…";
  return (
    <main
      ref={rootRef}
      className="ai-conversation-view practice-view"
      aria-label="AI 연습대화"
    >
      <ScreenHeader
        className="chat-room-header conversation-header"
        title={partnerTitle}
        onBack={() => navigate(backPath)}
        right={
          <div className="chat-header-actions">
            <ChatModeMenu
              currentMode="practice"
              targetUserId={Number.isSafeInteger(id) && id > 0 ? id : null}
              simulationStartingFor={simulationStartingFor}
              disabled={accessUnavailable}
              onSimulation={() => onStartSimulation(id, chatRoomId)}
            />

            {session?.status === "ACTIVE" && !accessUnavailable && (
              <button
                type="button"
                className="more-button"
                aria-label="AI 연습대화 메뉴"
                onClick={() => setShowEndDialog(true)}
              >
                •••
              </button>
            )}
          </div>
        }
      />
      <div className="ai-notice">
        <AiAvatar size={22} />
        <div className="practice-ai-notice-copy">
          <div>
            실제 상대가 아닌 AI예요. 대화 내용은 상대에게 전달되지 않아요.
          </div>
          <span>
            일일 횟수 제한 ({count} / {dailyLimit})
          </span>
        </div>
      </div>
      <div className="practice-message-area">
        <section
          ref={scroll.containerRef}
          onScroll={scroll.onScroll}
          aria-label="AI 연습대화 메시지"
          id="main-content"
          tabIndex={-1}
          className="chat-messages practice-messages"
        >
          <div className="practice-message-list">
            {loading ? (
              <div className="practice-state" role="status">
                AI 연습대화를 불러오고 있어요…
              </div>
            ) : loadError ? (
              <div className="practice-state" role="alert">
                <p>{loadError}</p>
                <button
                  type="button"
                  className="practice-inline-button"
                  onClick={() =>
                    accessUnavailable
                      ? navigate(backPath)
                      : setLoadAttempt((value) => value + 1)
                  }
                >
                  {accessUnavailable
                    ? chatRoomId
                      ? "채팅방으로 돌아가기"
                      : "홈으로 가기"
                    : "다시 불러오기"}
                </button>
              </div>
            ) : chats.length === 0 ? (
              <div className="practice-state">
                상대 AI와 편하게 대화를 시작해보세요.
              </div>
            ) : (
              chats.map((chat) => (
                <div className="practice-turn" key={chat.id}>
                  <MessageBubble
                    message={{
                      id: `${chat.id}-user`,
                      mine: true,
                      text: chat.userMessage,
                    }}
                    showTime={false}
                  />
                  {chat.status === "COMPLETED" && chat.aiResponse && (
                    <MessageBubble
                      message={{
                        id: `${chat.id}-ai`,
                        mine: false,
                        text: chat.aiResponse,
                      }}
                      ai
                      showTime={false}
                    />
                  )}
                  {chat.status === "GENERATING" && (
                    <div className="typing-indicator" role="status">
                      AI가 답변을 생각하고 있어요…
                    </div>
                  )}
                  {chat.status === "FAILED" && (
                    <div className="practice-retry">
                      <span>
                        답변을 만들지 못했어요. 다시 시도할 수 있어요.
                      </span>
                      <button
                        type="button"
                        className="practice-retry-button"
                        disabled={
                          retryingChatId === chat.id ||
                          count >= dailyLimit ||
                          session?.status !== "ACTIVE"
                        }
                        onClick={() => retry(chat)}
                      >
                        {retryingChatId === chat.id ? "요청 중…" : "다시 시도"}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
        {!scroll.atBottom && chats.length > 0 && (
          <button
            type="button"
            className="chat-latest-button"
            onClick={scroll.scrollToLatest}
          >
            최신 메시지 ↓
          </button>
        )}
      </div>
      <form
        className="message-composer practice-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        {sendError && (
          <p className="practice-send-error" role="alert">
            {sendError}
          </p>
        )}
        {session?.status === "ENDED" && (
          <p className="practice-send-error">
            종료된 대화의 기록을 보고 있어요.
          </p>
        )}
        <div className="message-composer-controls">
          <textarea
            ref={composerInputRef}
            className="message-text-input"
            name="message"
            autoComplete="off"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={inputPlaceholder}
            aria-label="연습 메시지"
            maxLength={500}
            rows={1}
            disabled={
              accessUnavailable ||
              loading ||
              !session ||
              session.status !== "ACTIVE" ||
              !usage ||
              count >= dailyLimit
            }
            readOnly={sending || hasGenerating}
            onFocus={scroll.preservePosition}
            onKeyDown={(event) => {
              if (
                event.key !== "Enter" ||
                event.shiftKey ||
                event.nativeEvent.isComposing
              )
                return;
              event.preventDefault();
              void send();
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || inputDisabled}
            aria-label="보내기"
          >
            ➤
          </button>
        </div>
      </form>
      {showEndDialog && (
        <div className="practice-dialog-backdrop">
          <section
            ref={endDialogRef}
            className="practice-dialog"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !ending) {
                event.preventDefault();
                setShowEndDialog(false);
              }
              if (event.key !== "Tab") return;
              const buttons = [
                ...event.currentTarget.querySelectorAll(
                  "button:not([disabled])",
                ),
              ];
              const first = buttons[0];
              const last = buttons.at(-1);
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="practice-end-title"
          >
            <h2 id="practice-end-title">AI 연습대화를 종료할까요?</h2>
            <p>종료한 뒤에도 대화 기록은 다시 확인할 수 있어요.</p>
            <div>
              <button
                type="button"
                className="practice-dialog-button"
                onClick={() => setShowEndDialog(false)}
                disabled={ending}
              >
                계속 대화하기
              </button>
              <button
                type="button"
                className="practice-dialog-button is-primary"
                onClick={() => void endSession()}
                disabled={ending}
              >
                {ending ? "종료 중…" : "종료하기"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
