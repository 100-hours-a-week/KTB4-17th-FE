import { useEffect, useRef, useState } from "react";
import {
  EmptyState,
  PixelButton,
  ScreenHeader,
} from "../../shared/ui/components.jsx";
import { PixelIcon } from "../../shared/ui/pixel.jsx";
import { SentenceCard } from "./SentenceCard.jsx";
import { useCardSwipe } from "./useCardSwipe.js";

export function Questions({ session, navigate }) {
  const { card, status, error, load, submitting, loadingNext, skipQuestion } =
    session;
  const [saved, setSaved] = useState(false);
  const firstVisit = useRef(true);
  const main = useRef(null);
  const swipe = useCardSwipe({
    onNext: () => {
      setSaved(false);
      void skipQuestion();
    },
    disabled: submitting || loadingNext,
    enabled: Boolean(card),
  });

  useEffect(() => {
    if (firstVisit.current || (status === "idle" && !error)) {
      firstVisit.current = false;
      void load(true);
    }
  }, [error, load, status]);

  useEffect(() => {
    if (card) main.current?.scrollTo(0, 0);
  }, [card]);

  async function handleAnswered() {
    setSaved(true);
    await load(true);
  }

  return (
    <>
      <ScreenHeader title="질문에 답하기" onBack={() => navigate("/my")} />
      <main
        id="main-content"
        ref={main}
        tabIndex={-1}
        className="main-scroll sentence-questions-main"
      >
        {saved && (
          <p className="sentence-card-saved" role="status">
            <PixelIcon name="check" /> 답변을 저장했어요. 참여해 주셔서
            고마워요.
          </p>
        )}
        {card ? (
          <div className="sentence-question-swipe" {...swipe}>
            <div className="sentence-question-page" key={card.cardId}>
              <SentenceCard
                session={session}
                onAnswered={handleAnswered}
                showSwipeHint
                swipeHint="아래로 넘겨 다음 질문 보기"
              />
            </div>
          </div>
        ) : status === "loading" || (status === "idle" && !error) ? (
          <EmptyState title="질문을 불러오고 있어요…" role="status" />
        ) : status === "empty" ? (
          <EmptyState
            icon={<PixelIcon name="check" scale={6} />}
            title="지금 답할 질문을 모두 봤어요"
            description="새 질문이 준비되면 다시 참여해 주세요."
            action={
              <PixelButton onClick={() => navigate("/home")}>
                프로필 둘러보기
              </PixelButton>
            }
          />
        ) : (
          <EmptyState
            icon="?"
            title={
              status === "error"
                ? "질문을 불러오지 못했어요"
                : "새 질문을 받아 주세요"
            }
            description={error}
            action={
              <PixelButton
                onClick={() => {
                  void load(true);
                }}
              >
                다시 불러오기
              </PixelButton>
            }
          />
        )}
      </main>
    </>
  );
}
