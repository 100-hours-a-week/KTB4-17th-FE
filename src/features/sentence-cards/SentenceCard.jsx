import { useEffect, useId, useRef, useState } from "react";
import { PixelIcon } from "../../shared/ui/pixel.jsx";
import { CORRECTION_MAX_LENGTH, normalizeCorrection } from "./model.js";
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
  const correctionId = useId();
  const correctionInputId = useId();
  const counterId = useId();
  const heading = useRef(null);
  const sending = useRef(false);
  const mounted = useRef(false);
  const [correction, setCorrection] = useState("");
  const { card, selectedChoice, submitting, error, select, answer } = session;
  const busy = submitting || disabled || preview;
  const cardId = card?.cardId;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (cardId && !preview) heading.current?.focus({ preventScroll: true });
    setCorrection("");
  }, [cardId, preview]);

  async function submit(choice, correctionText = null) {
    if (busy || sending.current) return;
    sending.current = true;
    select(choice);
    try {
      if ((await answer(correctionText)) && mounted.current) onAnswered();
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
            <span className="sr-only">답변 </span>“{card.utterance}”
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
        {/* 순서 고정: 예 → 아니오 (순서가 바뀌면 응답 분포가 달라진다) */}
        <button
          type="button"
          className="sentence-card-choice"
          data-choice-id="YES"
          aria-pressed={selectedChoice === "YES"}
          disabled={busy}
          onClick={() => {
            void submit("YES");
          }}
        >
          예
        </button>
        <button
          type="button"
          className="sentence-card-choice"
          data-choice-id="NO"
          aria-pressed={selectedChoice === "NO"}
          aria-expanded={selectedChoice === "NO"}
          aria-controls={correctionId}
          disabled={busy}
          onClick={() => select("NO")}
        >
          아니오
        </button>
      </fieldset>
      {selectedChoice === "NO" && (
        <div className="sentence-card-correction" id={correctionId}>
          <label htmlFor={correctionInputId}>실제 당신의 답변은?</label>
          <textarea
            id={correctionInputId}
            rows={3}
            maxLength={CORRECTION_MAX_LENGTH}
            value={correction}
            placeholder="선택 사항이에요"
            aria-describedby={counterId}
            disabled={busy}
            onChange={(event) => setCorrection(event.target.value)}
          />
          <small id={counterId} className="sentence-card-correction-count">
            {correction.length}/{CORRECTION_MAX_LENGTH}
          </small>
          <div className="sentence-card-correction-actions">
            <button
              type="button"
              className="sentence-card-correction-skip"
              disabled={busy}
              onClick={() => {
                void submit("NO", null);
              }}
            >
              건너뛰고 보내기
            </button>
            <button
              type="button"
              className="sentence-card-correction-send"
              disabled={busy || !normalizeCorrection(correction)}
              onClick={() => {
                void submit("NO", correction);
              }}
            >
              보내기
            </button>
          </div>
        </div>
      )}
      <div className="sentence-card-feedback">
        {submitting && <p role="status">답변을 저장하고 있어요…</p>}
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
    if (disabled || session.submitting || leaving.current) return;
    leaving.current = true;
    session.skipInFeed();
    onContinue();
  }
  function returnToProfile() {
    if (disabled || session.submitting || leaving.current) return;
    leaving.current = true;
    onReturn();
  }
  const swipe = useCardSwipe({
    onNext: skip,
    onPrevious: returnToProfile,
    disabled: disabled || session.submitting,
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
