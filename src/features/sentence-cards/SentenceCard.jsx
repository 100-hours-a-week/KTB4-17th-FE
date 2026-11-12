import { useEffect, useId, useRef } from "react";
import { PixelIcon } from "../../shared/ui/pixel.jsx";
import { useCardSwipe } from "./useCardSwipe.js";

export function SentenceCard({
  session,
  onAnswered,
  showSwipeHint = false,
  swipeHint = "아래로 넘겨 다음 프로필 보기",
  onOpenQuestions,
  preview = false,
  disabled = false,
}) {
  const titleId = useId();
  const errorId = useId();
  const heading = useRef(null);
  const sending = useRef(false);
  const mounted = useRef(false);
  const {
    card,
    selectedChoice,
    submitting,
    loadingNext,
    error,
    select,
    answer,
  } = session;
  const busy = submitting || loadingNext || disabled || preview;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (card && !preview) heading.current?.focus({ preventScroll: true });
  }, [card, preview]);

  async function handleAnswer(choiceId) {
    if (busy || sending.current) return;
    sending.current = true;
    select(choiceId);
    try {
      if ((await answer()) && mounted.current) onAnswered();
    } finally {
      sending.current = false;
    }
  }

  if (!card) return null;
  return (
    <section
      className="sentence-card"
      aria-labelledby={titleId}
      aria-busy={submitting}
    >
      <div className="sentence-card-context">
        {card.contextQuestion && (
          <div className="sentence-card-context-row">
            <span className="sentence-card-context-label" aria-hidden="true">
              Q.
            </span>
            <p>
              <span className="sr-only">원래 질문 </span>
              {card.contextQuestion}
            </p>
          </div>
        )}
        <div className="sentence-card-context-row">
          <span className="sentence-card-context-label" aria-hidden="true">
            A.
          </span>
          <p className="sentence-card-context-answer">
            <span className="sr-only">답변 </span>“{card.sentence}”
          </p>
        </div>
      </div>
      <h2
        className="sentence-card-prompt"
        id={titleId}
        tabIndex={-1}
        ref={heading}
      >
        {card.question}
      </h2>
      <fieldset
        className="sentence-card-choices"
        disabled={busy}
        aria-labelledby={titleId}
        aria-describedby={error ? errorId : undefined}
      >
        {card.choices.map(({ choiceId, label }) => (
          <button
            type="button"
            className="sentence-card-choice"
            key={choiceId}
            data-choice-id={choiceId}
            aria-pressed={selectedChoice === choiceId}
            disabled={busy}
            onClick={() => {
              void handleAnswer(choiceId);
            }}
          >
            {label}
          </button>
        ))}
      </fieldset>
      <div className="sentence-card-feedback">
        {submitting && <p role="status">답변을 저장하고 있어요…</p>}
        {loadingNext && <p role="status">다음 질문을 불러오고 있어요…</p>}
        {error && (
          <p className="sentence-card-error" id={errorId} role="alert">
            {error}
          </p>
        )}
      </div>
      {(showSwipeHint || onOpenQuestions) && (
        <div className="sentence-card-navigation">
          {showSwipeHint && (
            <p className="sentence-card-swipe-hint">
              <PixelIcon name="chev" scale={1.5} />
              {swipeHint}
            </p>
          )}
          {onOpenQuestions && (
            <button
              type="button"
              className="sentence-card-more"
              disabled={busy}
              onClick={onOpenQuestions}
            >
              마이페이지에서 이어서 답하기 <PixelIcon name="chev" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export function FeedSentenceCard({
  session,
  onContinue,
  onReturn,
  navigate,
  preview = false,
  disabled = false,
}) {
  const leaving = useRef(false);
  function skip() {
    if (
      disabled ||
      session.submitting ||
      session.loadingNext ||
      leaving.current
    )
      return;
    leaving.current = true;
    session.skipInFeed();
    onContinue();
  }
  function returnToProfile() {
    if (
      disabled ||
      session.submitting ||
      session.loadingNext ||
      leaving.current
    )
      return;
    leaving.current = true;
    onReturn();
  }
  const swipe = useCardSwipe({
    onNext: skip,
    onPrevious: returnToProfile,
    disabled: disabled || session.submitting || session.loadingNext,
    enabled: !preview,
  });

  return (
    <div className="sentence-feed-card" {...swipe}>
      <SentenceCard
        session={session}
        onAnswered={onContinue}
        showSwipeHint
        onOpenQuestions={() => navigate("/my/questions")}
        preview={preview}
        disabled={disabled}
      />
    </div>
  );
}
