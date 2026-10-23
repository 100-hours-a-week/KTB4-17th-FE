import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  API_ERROR_MESSAGES,
  apiErrorMessage,
} from "../../shared/api/errorMessages.js";
import {
  EmptyState,
  PixelButton,
  ScreenHeader,
} from "../../shared/ui/components.jsx";
import { PixelIcon } from "../../shared/ui/pixel.jsx";
import * as chatApi from "./api.js";
import {
  DELEGATION_END_TYPES,
  delegationDraftPath,
  delegationEndTypeLabel,
  delegationPathForRoom,
  delegationProgressPath,
  delegationSelectionPath,
  isDelegationDraftStatus,
  normalizeDelegationProgress,
} from "./delegation.js";
import {
  clearDelegationDraft,
  loadDelegationDraft,
  saveDelegationDraft,
} from "./delegationDraftStorage.js";
import { formatChatActivity, mapChatRoom } from "./model.js";
import { discardRoomSession, getRoomSession } from "./session.js";
import { CHAT_READ_UPDATED_EVENT } from "./unreadCount.js";

function delegationMessage(error, fallbackCode) {
  return apiErrorMessage(error, API_ERROR_MESSAGES[fallbackCode]);
}

function errorWithCode(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function fetchDelegationRoom(chatRoomId, signal) {
  const page = await chatApi.messages(chatRoomId, { size: 1, signal });
  if (!page?.chatRoom) {
    throw errorWithCode("CHAT_ROOM_NOT_FOUND");
  }
  return mapChatRoom(page.chatRoom);
}

function useDelegationRoom(chatRoomId) {
  const [state, setState] = useState({
    room: null,
    loading: true,
    error: null,
  });
  const controllerRef = useRef(null);
  const mountedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return null;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((current) => ({
      ...current,
      loading: !current.room,
      error: null,
    }));
    try {
      const room = await fetchDelegationRoom(chatRoomId, controller.signal);
      if (!mountedRef.current || controllerRef.current !== controller)
        return null;
      setState({ room, loading: false, error: null });
      return room;
    } catch (error) {
      if (
        error?.name !== "AbortError" &&
        mountedRef.current &&
        controllerRef.current === controller
      )
        setState((current) => ({ ...current, loading: false, error }));
      return null;
    }
  }, [chatRoomId]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const resume = () => {
      if (document.visibilityState !== "hidden" && navigator.onLine !== false)
        void refresh();
    };
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh]);

  return { ...state, refresh };
}

function DelegationShell({ children, onBack, className = "" }) {
  return (
    <main
      className={`chat-delegation-view ${className}`}
      aria-label="대화 정리"
    >
      <ScreenHeader title="대화 정리" onBack={onBack} />
      {children}
    </main>
  );
}

function StatusSheet({ title, description, children, role = "status" }) {
  return (
    <section className="delegation-sheet" role={role}>
      <span className="delegation-sheet-handle" aria-hidden="true" />
      <div className="delegation-sheet-icon" aria-hidden="true">
        <PixelIcon name={role === "alert" ? "alert" : "spark"} scale={2.5} />
      </div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {children}
    </section>
  );
}

function ErrorState({ error, onRetry, onBack, retrying }) {
  return (
    <StatusSheet
      role="alert"
      title="대화 정리를 시작하지 못했어요"
      description={delegationMessage(error, "CHAT_DELEGATION_REQUEST_FAILED")}
    >
      <div className="delegation-sheet-actions">
        <PixelButton secondary onClick={onBack}>
          채팅으로 돌아가기
        </PixelButton>
        <PixelButton onClick={onRetry} disabled={retrying}>
          {retrying ? "다시 시도 중…" : "다시 시도"}
        </PixelButton>
      </div>
    </StatusSheet>
  );
}

export function ChatDelegationStart({ chatRoomId, navigate }) {
  const roomState = useDelegationRoom(chatRoomId);
  const [endType, setEndType] = useState("GENTLE");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const requestRef = useRef(null);
  const room = roomState.room;
  const delegation = room?.delegation;

  useEffect(() => {
    if (delegation?.endType) setEndType(delegation.endType);
    if (delegation && !isDelegationDraftStatus(delegation.status))
      navigate(delegationPathForRoom(room), { replace: true });
  }, [delegation, navigate, room]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
      requestRef.current = null;
    },
    [],
  );

  const submit = async () => {
    if (pending || delegation?.status === "DRAFT_GENERATING") return;
    const controller = new AbortController();
    requestRef.current = controller;
    setPending(true);
    setError(null);
    try {
      const draft = delegation
        ? await chatApi.regenerateDelegationDraft(
            chatRoomId,
            delegation.delegationId,
            endType,
            { signal: controller.signal },
          )
        : await chatApi.createDelegationDraft(chatRoomId, endType, {
            signal: controller.signal,
          });
      if (requestRef.current !== controller) return;
      saveDelegationDraft(chatRoomId, draft, endType);
      navigate(delegationDraftPath(chatRoomId, draft.delegationId), {
        replace: true,
      });
    } catch (requestError) {
      if (
        requestRef.current !== controller ||
        requestError.name === "AbortError"
      )
        return;
      if (requestError.code === "CHAT_DELEGATION_ALREADY_EXISTS") {
        const refreshed = await roomState.refresh();
        if (refreshed?.delegation) {
          navigate(delegationPathForRoom(refreshed), { replace: true });
          return;
        }
      }
      setError(requestError);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setPending(false);
      }
    }
  };

  const back = () => navigate(`/chats/${chatRoomId}`);
  return (
    <DelegationShell onBack={back} className="delegation-choice-view">
      <div id="main-content" tabIndex={-1} className="delegation-main">
        <div className="delegation-intro">
          <span>AI 대화 정리</span>
          <h2>대화를 어떻게 마무리할까요?</h2>
          <p>내가 고른 방식에 맞춰 AI가 자연스럽게 대화를 정리해요.</p>
        </div>
        <fieldset className="delegation-options">
          <legend className="sr-only">대화 정리 방식</legend>
          {DELEGATION_END_TYPES.map((option) => (
            <label
              key={option.value}
              className={`delegation-option${endType === option.value ? " is-selected" : ""}`}
            >
              <input
                type="radio"
                name="delegationEndType"
                value={option.value}
                checked={endType === option.value}
                onChange={() => setEndType(option.value)}
              />
              <span>
                <strong>{option.label}</strong>
                <small className="delegation-option-description">
                  {option.description}
                </small>
              </span>
              <i aria-hidden="true" />
            </label>
          ))}
        </fieldset>
      </div>
      <div className="delegation-sticky-action">
        <PixelButton
          onClick={() => void submit()}
          disabled={
            pending ||
            roomState.loading ||
            delegation?.status === "DRAFT_GENERATING"
          }
        >
          {pending ? "초안 만드는 중…" : "초안 만들기"}
        </PixelButton>
      </div>
      {(pending || delegation?.status === "DRAFT_GENERATING") && (
        <StatusSheet
          title="대화 정리 초안을 만들고 있어요"
          description="뒤로 가도 괜찮아요. 다시 들어오면 현재 상태를 확인할게요."
        />
      )}
      {error && (
        <ErrorState
          error={error}
          onRetry={() => void submit()}
          onBack={back}
          retrying={pending}
        />
      )}
    </DelegationShell>
  );
}

export function ChatDelegationDraft({ chatRoomId, delegationId, navigate }) {
  const roomState = useDelegationRoom(chatRoomId);
  const room = roomState.room;
  const summary = room?.delegation;
  const [draft, setDraft] = useState(() =>
    loadDelegationDraft(chatRoomId, delegationId),
  );
  const [localDraftReady, setLocalDraftReady] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [error, setError] = useState(null);
  const requestRef = useRef(null);

  useEffect(() => {
    if (!room || roomState.loading) return;
    if (!summary) {
      clearDelegationDraft(chatRoomId);
      navigate(`/chats/${chatRoomId}`, { replace: true });
      return;
    }
    if (summary.delegationId !== delegationId) {
      navigate(delegationPathForRoom(room), { replace: true });
      return;
    }
    if (!isDelegationDraftStatus(summary.status)) {
      clearDelegationDraft(chatRoomId);
      navigate(delegationProgressPath(chatRoomId, delegationId), {
        replace: true,
      });
      return;
    }
    if (["DRAFT_GENERATING", "DRAFT_FAILED"].includes(summary.status)) {
      clearDelegationDraft(chatRoomId);
      setDraft(null);
      setLocalDraftReady(false);
    }
  }, [chatRoomId, delegationId, navigate, room, roomState.loading, summary]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
      requestRef.current = null;
    },
    [],
  );

  const regenerate = async () => {
    if (pendingAction || !summary) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setPendingAction("regenerate");
    setError(null);
    try {
      const nextDraft = await chatApi.regenerateDelegationDraft(
        chatRoomId,
        delegationId,
        summary.endType,
        { signal: controller.signal },
      );
      if (requestRef.current !== controller) return;
      saveDelegationDraft(chatRoomId, nextDraft, summary.endType);
      setDraft(loadDelegationDraft(chatRoomId, delegationId));
      setLocalDraftReady(true);
      void roomState.refresh();
    } catch (requestError) {
      if (
        requestRef.current === controller &&
        requestError.name !== "AbortError"
      )
        setError(requestError);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setPendingAction("");
      }
    }
  };

  const confirm = async () => {
    if (pendingAction || !draft?.draftId) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setPendingAction("confirm");
    setError(null);
    try {
      await chatApi.confirmDelegationDraft(
        chatRoomId,
        delegationId,
        draft.draftId,
        { signal: controller.signal },
      );
      if (requestRef.current !== controller) return;
      clearDelegationDraft(chatRoomId);
      navigate(delegationProgressPath(chatRoomId, delegationId), {
        replace: true,
      });
    } catch (requestError) {
      if (
        requestRef.current !== controller ||
        requestError.name === "AbortError"
      )
        return;
      if (
        [
          "CHAT_DELEGATION_INVALID_STATUS",
          "CHAT_DELEGATION_DRAFT_MISMATCH",
        ].includes(requestError.code)
      )
        await roomState.refresh();
      setError(requestError);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setPendingAction("");
      }
    }
  };

  const back = () => navigate(`/chats/${chatRoomId}`);
  const generating = summary?.status === "DRAFT_GENERATING";
  const failed =
    (summary?.status === "DRAFT_FAILED" && !localDraftReady) || error;
  const hasDraft =
    Boolean(draft) &&
    (summary?.status === "AWAITING_CONFIRMATION" || localDraftReady);

  return (
    <DelegationShell onBack={back} className="delegation-draft-view">
      <div id="main-content" tabIndex={-1} className="delegation-main">
        {roomState.loading ? (
          <div className="delegation-page-state" role="status">
            초안 상태를 확인하고 있어요…
          </div>
        ) : roomState.error ? (
          <EmptyState
            icon="!"
            title="초안 상태를 확인하지 못했어요"
            description={delegationMessage(
              roomState.error,
              "CHAT_DELEGATION_DRAFT_STATUS_UNAVAILABLE",
            )}
            action={
              <PixelButton onClick={() => void roomState.refresh()}>
                다시 확인
              </PixelButton>
            }
            role="alert"
          />
        ) : hasDraft ? (
          <>
            <div className="delegation-intro">
              <div className="delegation-draft-meta">
                <span>{delegationEndTypeLabel(summary.endType)}</span>
                <button
                  type="button"
                  className="delegation-regenerate-button"
                  onClick={() => void regenerate()}
                  disabled={Boolean(pendingAction)}
                  aria-label="대화 정리 초안 재생성"
                >
                  <PixelIcon name="spark" />
                  {pendingAction === "regenerate" ? "재생성 중…" : "재생성"}
                </button>
              </div>
              <h2>이런 분위기로 대화를 마무리할게요</h2>
              <p>초안을 확인한 뒤 AI에게 대화를 맡겨 주세요.</p>
            </div>
            <ol className="delegation-draft-messages">
              {draft.turns.map((turn, index) => (
                <li key={`${turn.turn || index}:${turn.message}`}>
                  <small className="delegation-draft-turn-label">
                    {turn.turn || index + 1}번째
                  </small>
                  <p>{turn.message}</p>
                </li>
              ))}
            </ol>
          </>
        ) : !generating && !failed ? (
          <EmptyState
            icon="✦"
            title="초안을 다시 확인해 주세요"
            description="이 기기에는 미리보기 내용이 남아 있지 않아 새 초안이 필요해요."
            action={
              <PixelButton onClick={() => void regenerate()}>
                초안 다시 만들기
              </PixelButton>
            }
          />
        ) : null}
      </div>

      {hasDraft && (
        <div className="delegation-draft-actions">
          <PixelButton
            secondary
            onClick={() => navigate(delegationSelectionPath(chatRoomId))}
          >
            방식 바꾸기
          </PixelButton>
          <PixelButton
            onClick={() => void confirm()}
            disabled={Boolean(pendingAction)}
          >
            {pendingAction === "confirm"
              ? "정리 시작 중…"
              : "이대로 정리 시작하기"}
          </PixelButton>
        </div>
      )}

      {generating && (
        <StatusSheet
          title="대화 정리 초안을 만들고 있어요"
          description="뒤로 가도 괜찮아요. 다시 들어오면 현재 상태를 확인할게요."
        >
          <PixelButton secondary onClick={() => void roomState.refresh()}>
            상태 다시 확인
          </PixelButton>
        </StatusSheet>
      )}
      {failed && (
        <ErrorState
          error={error}
          onRetry={() => void regenerate()}
          onBack={back}
          retrying={Boolean(pendingAction)}
        />
      )}
    </DelegationShell>
  );
}

function ProgressTurns({ turns }) {
  return (
    <ol className="delegation-progress-turns">
      {turns.map((turn) => (
        <li key={turn.turn} className={turn.completed ? "is-complete" : ""}>
          <span aria-hidden="true">
            {turn.completed ? (
              <PixelIcon name="check" scale={1.5} />
            ) : (
              turn.turn
            )}
          </span>
          <div>
            <strong>
              {turn.turn === 3 ? "마지막 인사" : `${turn.turn}번째 메시지`}
            </strong>
            <small className="delegation-progress-turn-status">
              {turn.completed
                ? `${formatChatActivity(turn.sentAt)} 발송 완료`
                : "대기 중"}
            </small>
          </div>
        </li>
      ))}
    </ol>
  );
}

function BlockDialog({ pending, onConfirm, onCancel, onDismiss }) {
  const dialogRef = useRef(null);

  useLayoutEffect(() => {
    dialogRef.current?.querySelector(".delegation-block-cancel")?.focus();
  }, []);

  return (
    <div className="delegation-dialog-backdrop">
      <button
        type="button"
        className="delegation-dialog-dismiss"
        aria-label="차단 확인 닫기"
        onClick={onDismiss}
      />
      <section
        ref={dialogRef}
        className="delegation-block-dialog"
        role="dialog"
        aria-modal="true"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          onDismiss();
        }}
      >
        <h2>상대방을 차단하시겠어요?</h2>
        <p>
          더 이상 서로의 프로필은 확인 불가해요.
          <br />
          상대방에게 알림은 가지 않아요.
        </p>
        <div className="delegation-block-actions">
          <PixelButton
            className="delegation-block-cancel"
            secondary
            onClick={onCancel}
            disabled={pending}
          >
            취소
          </PixelButton>
          <PixelButton onClick={onConfirm} disabled={pending}>
            확인
          </PixelButton>
        </div>
      </section>
    </div>
  );
}

export function ChatDelegationProgress({ chatRoomId, delegationId, navigate }) {
  const roomState = useDelegationRoom(chatRoomId);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [exitPending, setExitPending] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockCompleted, setBlockCompleted] = useState(false);
  const progressControllerRef = useRef(null);
  const retryControllerRef = useRef(null);
  const exitControllerRef = useRef(null);
  const mountedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;
    progressControllerRef.current?.abort();
    const controller = new AbortController();
    progressControllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const value = normalizeDelegationProgress(
        await chatApi.delegationProgress(chatRoomId, delegationId, {
          signal: controller.signal,
        }),
        delegationId,
      );
      if (!mountedRef.current || progressControllerRef.current !== controller)
        return;
      setProgress(value);
    } catch (requestError) {
      if (
        requestError.name !== "AbortError" &&
        mountedRef.current &&
        progressControllerRef.current === controller
      )
        setError(requestError);
    } finally {
      if (mountedRef.current && progressControllerRef.current === controller)
        setLoading(false);
    }
  }, [chatRoomId, delegationId]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const resume = () => {
      if (document.visibilityState !== "hidden" && navigator.onLine !== false)
        void refresh();
    };
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      mountedRef.current = false;
      progressControllerRef.current?.abort();
      retryControllerRef.current?.abort();
      exitControllerRef.current?.abort();
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh]);

  const summary = roomState.room?.delegation;
  useEffect(() => {
    if (!roomState.room || roomState.loading) return;
    if (!summary) {
      navigate(`/chats/${chatRoomId}`, { replace: true });
      return;
    }
    if (summary.delegationId !== delegationId) {
      navigate(delegationPathForRoom(roomState.room), { replace: true });
      return;
    }
    if (isDelegationDraftStatus(summary.status)) {
      navigate(delegationDraftPath(chatRoomId, delegationId), {
        replace: true,
      });
      return;
    }
    clearDelegationDraft(chatRoomId);
  }, [
    chatRoomId,
    delegationId,
    navigate,
    roomState.loading,
    roomState.room,
    summary,
  ]);

  useEffect(() => {
    if (!progress || !isDelegationDraftStatus(progress.status)) return;
    navigate(delegationDraftPath(chatRoomId, progress.delegationId), {
      replace: true,
    });
  }, [chatRoomId, navigate, progress]);

  const retry = async () => {
    if (retrying) return;
    const controller = new AbortController();
    retryControllerRef.current?.abort();
    retryControllerRef.current = controller;
    setRetrying(true);
    setError(null);
    try {
      const result = await chatApi.retryDelegation(chatRoomId, delegationId, {
        signal: controller.signal,
      });
      if (!mountedRef.current || retryControllerRef.current !== controller)
        return;
      setProgress((current) => ({ ...current, status: result.status }));
      await roomState.refresh();
    } catch (requestError) {
      if (!mountedRef.current || requestError.name === "AbortError") return;
      if (requestError.code === "CHAT_DELEGATION_INVALID_STATUS") {
        await refresh();
        return;
      }
      setError(requestError);
    } finally {
      if (mountedRef.current && retryControllerRef.current === controller) {
        retryControllerRef.current = null;
        setRetrying(false);
      }
    }
  };

  const completeExit = async (withBlock) => {
    if (exitPending || !progress) return;
    const controller = new AbortController();
    exitControllerRef.current = controller;
    setExitPending(true);
    setError(null);
    try {
      if (withBlock && !blockCompleted) {
        if (!progress.targetUserId)
          throw errorWithCode("TARGET_USER_NOT_FOUND");
        await chatApi.blockUser(progress.targetUserId, {
          signal: controller.signal,
        });
        if (!mountedRef.current || exitControllerRef.current !== controller)
          return;
        setBlockCompleted(true);
      }
      await chatApi.leaveChatRoom(chatRoomId, { signal: controller.signal });
      if (!mountedRef.current || exitControllerRef.current !== controller)
        return;
      clearDelegationDraft(chatRoomId);
      discardRoomSession(getRoomSession(chatRoomId));
      window.dispatchEvent(new Event(CHAT_READ_UPDATED_EVENT));
      navigate("/chats", { replace: true });
    } catch (requestError) {
      if (
        requestError.name !== "AbortError" &&
        mountedRef.current &&
        exitControllerRef.current === controller
      )
        setError(requestError);
    } finally {
      if (mountedRef.current && exitControllerRef.current === controller) {
        setExitPending(false);
        exitControllerRef.current = null;
      }
    }
  };

  const status = progress?.status || summary?.status;
  const isRetryRequired = ["RETRY_REQUIRED", "FAILED"].includes(status);
  const isFinished = ["COMPLETED", "INTERRUPTED"].includes(status);
  const turns =
    progress?.turns ||
    [1, 2, 3].map((turn) => ({ turn, completed: false, sentAt: null }));
  const completedCount = turns.filter((turn) => turn.completed).length;

  return (
    <DelegationShell
      onBack={() => navigate("/chats")}
      className="delegation-progress-view"
    >
      <div id="main-content" tabIndex={-1} className="delegation-main">
        {loading && !progress ? (
          <div className="delegation-page-state" role="status">
            대화 정리 상태를 확인하고 있어요…
          </div>
        ) : error && !progress ? (
          <EmptyState
            icon="!"
            title="대화 정리 상태를 확인하지 못했어요"
            description={delegationMessage(
              error,
              "CHAT_DELEGATION_PROGRESS_UNAVAILABLE",
            )}
            action={
              <PixelButton onClick={() => void refresh()}>
                다시 확인
              </PixelButton>
            }
            role="alert"
          />
        ) : progress ? (
          <>
            <div className="delegation-live-notice" role="status">
              <span aria-hidden="true" />
              {isFinished
                ? "AI 대화 정리가 끝났어요"
                : isRetryRequired
                  ? "AI 대화 정리를 다시 시작해 주세요"
                  : "AI가 대화를 마무리하는 중이에요"}
            </div>
            <div className="delegation-progress-heading">
              <h2>{roomState.room?.name || "상대방"}과의 대화</h2>
              <p>{delegationEndTypeLabel(summary?.endType)}</p>
            </div>
            <ProgressTurns turns={turns} />
          </>
        ) : null}
      </div>

      {isRetryRequired && (
        <StatusSheet
          role="alert"
          title="AI가 대화를 이어가지 못했어요"
          description="완료된 메시지는 유지돼요. 실패한 단계부터 다시 시작할 수 있어요."
        >
          {error && (
            <p className="delegation-inline-error">
              {delegationMessage(error, "CHAT_DELEGATION_RETRY_FAILED")}
            </p>
          )}
          <PixelButton onClick={() => void retry()} disabled={retrying}>
            {retrying ? "다시 시작 중…" : "다시 시도"}
          </PixelButton>
        </StatusSheet>
      )}

      {isFinished && (
        <StatusSheet
          title={
            status === "INTERRUPTED"
              ? "상대방이 먼저 대화를 종료했어요"
              : "대화를 마무리했어요"
          }
          description={
            status === "INTERRUPTED"
              ? "진행 중이던 AI 대화 정리를 종료했어요."
              : "AI가 선택한 방식으로 대화를 자연스럽게 정리했어요."
          }
        >
          <dl className="delegation-completion-summary">
            <div className="delegation-completion-row">
              <dt>정리 방식</dt>
              <dd>{delegationEndTypeLabel(summary?.endType)}</dd>
            </div>
            <div className="delegation-completion-row">
              <dt>보낸 메시지</dt>
              <dd>{completedCount}건</dd>
            </div>
          </dl>
          {error && (
            <p className="delegation-inline-error" role="alert">
              {delegationMessage(error, "CHAT_DELEGATION_EXIT_FAILED")}
            </p>
          )}
          {progress.isBlockPromptRequired ? (
            <div className="delegation-sheet-actions is-stacked">
              <PixelButton
                secondary
                onClick={() => setBlockDialogOpen(true)}
                disabled={exitPending}
              >
                상대방 차단하기
              </PixelButton>
              <PixelButton
                onClick={() => void completeExit(false)}
                disabled={exitPending}
              >
                {exitPending ? "나가는 중…" : "차단하지 않고 나가기"}
              </PixelButton>
            </div>
          ) : (
            <PixelButton onClick={() => navigate("/chats", { replace: true })}>
              채팅 목록으로
            </PixelButton>
          )}
        </StatusSheet>
      )}

      {blockDialogOpen && (
        <BlockDialog
          pending={exitPending}
          onDismiss={() => setBlockDialogOpen(false)}
          onCancel={() => void completeExit(false)}
          onConfirm={() => void completeExit(true)}
        />
      )}
    </DelegationShell>
  );
}
