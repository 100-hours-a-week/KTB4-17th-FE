import { useEffect, useRef, useState } from "react";
import { ScreenHeader } from "../../shared/ui/components.jsx";
import * as aiPracticeApi from "./api.js";
import { connectAiPracticeSocket } from "./socket.js";

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
    AUTH_REQUIRED: "로그인이 만료됐어요. 다시 로그인한 뒤 이용해주세요.",
    TARGET_MEMBER_NOT_FOUND: "상대 회원 정보를 찾을 수 없어요.",
    SESSION_NOT_FOUND: "연습 대화 정보를 찾을 수 없어요.",
    SESSION_ENDED: "종료된 연습 대화에는 새 메시지를 보낼 수 없어요.",
    GENERATION_IN_PROGRESS: "AI가 이전 메시지에 답변하고 있어요.",
    DAILY_LIMIT_EXCEEDED: "오늘의 연습 횟수를 모두 사용했어요.",
    CHAT_NOT_RETRYABLE: "이 답변은 다시 시도할 수 없어요.",
    AI_SERVER_NOT_CONFIGURED: "AI 응답 서버가 아직 연결되지 않았어요.",
  };
  return (
    messages[error?.code] ||
    "연습 대화를 처리하지 못했어요. 잠시 후 다시 시도해주세요."
  );
}

export function Practice({
  targetMemberId,
  navigate,
  onStartSimulation,
  simulationStartingFor,
}) {
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
  const id = Number(targetMemberId);
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
  const messagesEndRef = useRef(null);
  chatsRef.current = chats;

  useEffect(() => {
    const [memberIdValue] = sessionLoadKey.split(":");
    const memberId = Number(memberIdValue);
    let active = true;
    setLoading(true);
    setLoadError("");
    setInput("");
    setSendError("");
    requestRef.current = null;
    setSession(null);
    setChats([]);
    setUsage(null);
    if (!Number.isSafeInteger(memberId) || memberId <= 0) {
      setLoadError("상대 회원 ID가 없어 연습 대화를 시작할 수 없어요.");
      setLoading(false);
      return () => {
        active = false;
      };
    }
    (async () => {
      const startedSession = await aiPracticeApi.aiPracticeStart(memberId);
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
        if (active) setLoadError(practiceErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionLoadKey]);

  useEffect(() => {
    if (!session?.id) return undefined;
    let active = true;
    async function refresh() {
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
        if (!active) return;
        setChats((current) => mergePracticeChats(current, page?.chats || []));
        const todayUsage = await aiPracticeApi.aiPracticeUsage();
        if (active) setUsage(todayUsage);
      } catch {
        // REST history remains the recovery path if a live update was missed.
      }
    }
    refreshRef.current = refresh;
    const disconnect = connectAiPracticeSocket({
      onMessage(event) {
        if (event.sessionId !== session.id) return;
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
  }, [session?.id]);

  useEffect(() => {
    if (!session?.id || !hasGenerating) return undefined;
    const timer = window.setInterval(() => {
      void refreshRef.current();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [session?.id, hasGenerating]);

  useEffect(() => {
    const marker = messagesEndRef.current;
    if (!marker || marker.dataset.scrollKey === messageScrollKey) return;
    marker.dataset.scrollKey = messageScrollKey;
    marker.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messageScrollKey]);

  async function send() {
    const text = input.trim();
    if (!text) return;
    if (
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
        : { clientMessageId: crypto.randomUUID(), userMessage: text };
    requestRef.current = request;
    setSending(true);
    setSendError("");
    try {
      const accepted = await aiPracticeApi.aiPracticeSend(session.id, request);
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
    if (!session || retryingChatId != null) return;
    setRetryingChatId(chat.id);
    setSendError("");
    try {
      const accepted = await aiPracticeApi.aiPracticeRetry(session.id, chat.id);
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
      setSendError(practiceErrorMessage(error));
      void refreshRef.current();
    } finally {
      setRetryingChatId(null);
    }
  }

  async function endSession() {
    if (!session || ending) return;
    setEnding(true);
    setSendError("");
    try {
      setSession(await aiPracticeApi.aiPracticeEnd(session.id));
      setShowEndDialog(false);
    } catch (error) {
      setSendError(practiceErrorMessage(error));
    } finally {
      setEnding(false);
    }
  }

  const inputDisabled =
    loading ||
    !session ||
    session.status !== "ACTIVE" ||
    !usage ||
    sending ||
    hasGenerating ||
    count >= dailyLimit;
  const partnerTitle = "AI 연습 대화";
  const inputPlaceholder =
    count >= dailyLimit
      ? "오늘의 연습을 마쳤어요"
      : session?.status === "ENDED"
        ? "종료된 대화예요"
        : hasGenerating || sending
          ? "AI가 답변을 준비하고 있어요"
          : loading
            ? "대화를 불러오는 중이에요"
            : "메시지를 입력하세요";
  return (
    <>
      <ScreenHeader
        title={partnerTitle}
        onBack={() => navigate("/chats")}
        right={
          session?.status === "ACTIVE" ? (
            <button
              type="button"
              className="more-button"
              aria-label="연습 대화 메뉴"
              onClick={() => setShowEndDialog(true)}
            >
              •••
            </button>
          ) : null
        }
      />
      <div className="mode-tabs">
        <button
          type="button"
          onClick={() => void onStartSimulation(id)}
          disabled={
            !Number.isSafeInteger(id) ||
            id <= 0 ||
            simulationStartingFor != null
          }
        >
          {simulationStartingFor === id
            ? "시뮬레이션 생성 중..."
            : "시뮬레이션"}
        </button>
        <button type="button" className="active">
          연습 대화
        </button>
        <button type="button" onClick={() => navigate("/chats")}>
          채팅
        </button>
      </div>
      <div className="ai-notice">
        ⓘ　실제 상대가 아닌 AI예요. 대화 내용은 상대에게 전달되지 않아요.
        <span>
          일일 횟수 제한 ({count} / {dailyLimit})
        </span>
      </div>
      <div className="chat-messages practice-messages">
        {loading ? (
          <div className="practice-state" role="status">
            연습 대화를 불러오고 있어요…
          </div>
        ) : loadError ? (
          <div className="practice-state" role="alert">
            <p>{loadError}</p>
            <button
              type="button"
              className="practice-inline-button"
              onClick={() => setLoadAttempt((value) => value + 1)}
            >
              다시 불러오기
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
                ai
              />
              {chat.status === "COMPLETED" && chat.aiResponse && (
                <MessageBubble
                  message={{
                    id: `${chat.id}-ai`,
                    mine: false,
                    text: chat.aiResponse,
                  }}
                  ai
                />
              )}
              {chat.status === "GENERATING" && (
                <div className="typing-indicator" role="status">
                  AI가 답변을 생각하고 있어요 ···
                </div>
              )}
              {chat.status === "FAILED" && (
                <div className="practice-retry">
                  <span>답변을 만들지 못했어요. 다시 시도할 수 있어요.</span>
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
        <div ref={messagesEndRef} />
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
        <div className="practice-compose-row">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={inputPlaceholder}
            aria-label="연습 메시지"
            maxLength={500}
            disabled={inputDisabled}
          />
          <button
            type="submit"
            className="practice-send-button"
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
            className="practice-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="practice-end-title"
          >
            <h2 id="practice-end-title">연습 대화를 종료할까요?</h2>
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
    </>
  );
}
