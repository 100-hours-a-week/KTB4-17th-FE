import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { asset } from "../../shared/assets.js";
import {
  BrandHeader,
  EmptyState,
  Icon,
  PhotoSegments,
  PixelButton,
  ProfilePhoto,
} from "../../shared/ui/components.jsx";
import { PixelIcon } from "../../shared/ui/pixel.jsx";
import { profilePhotoUrls } from "../../shared/utils.js";
import * as matchingApi from "../matching/api.js";
import { jobCategoryLabel } from "../profile/jobCategories.js";
import { SwipeGuide, useSwipeGuide } from "./SwipeGuide.jsx";
import { wheelNavigationIntent } from "./wheelNavigation.js";

const NEXT_CARD_DISTANCE = 64;
const PREVIOUS_CARD_DISTANCE = 64;
const REFRESH_DISTANCE = 360;
const WHEEL_NEXT_DISTANCE = 80;
const WHEEL_PREVIOUS_DISTANCE = 80;
const WHEEL_REFRESH_DISTANCE = 360;
const CARD_TRANSITION_MS = 180;
const WHEEL_GESTURE_END_MS = 220;

export function Home({
  navigate,
  toast,
  recommendations,
  currentIndex,
  recommendationExhausted,
  hasNext,
  recommendationStatus,
  recommendationError,
  recommendationRefreshing,
  onRetryRecommendations,
  onRefreshRecommendations,
  onPrepareNextBatch,
  onActivatePreparedBatch,
  nextBatchReady,
  onAdvance,
  onRetreat,
  onDismiss,
  onPass,
  onLoadMore,
  onStartSimulation,
}) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [actionBusy, setActionBusy] = useState("");
  const [isContinuing, setIsContinuing] = useState(false);
  const actionInFlight = useRef(false);
  const nextNavigationInFlight = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isCardSettling, setIsCardSettling] = useState(false);
  const [previewDirection, setPreviewDirection] = useState("next");
  const gestureStart = useRef(null);
  const cardRef = useRef(null);
  const swipeGuideConsumed = useRef(false);
  const cardTransitionTimer = useRef(null);
  const wheelHandlerRef = useRef(null);
  const nativeWheelListener = useRef((event) =>
    wheelHandlerRef.current?.(event),
  );
  const wheelGesture = useRef({
    delta: 0,
    direction: null,
    locked: false,
    resetTimer: null,
  });
  const person = recommendations[currentIndex] || null;
  const personId = person?.id;
  const previousPerson = recommendations[currentIndex - 1] || null;
  const nextPerson = recommendations[currentIndex + 1] || null;
  const previewPerson =
    previewDirection === "previous"
      ? previousPerson
      : previewDirection === "next"
        ? nextPerson
        : null;
  const showSwipeGuide = useSwipeGuide({
    enabled:
      Boolean(person) &&
      recommendationStatus === "ready" &&
      !recommendationError &&
      !actionBusy &&
      !isCardSettling &&
      !isContinuing &&
      !recommendationRefreshing,
    consumed: swipeGuideConsumed,
  });

  useEffect(
    () => () => {
      if (wheelGesture.current.resetTimer)
        window.clearTimeout(wheelGesture.current.resetTimer);
      if (cardTransitionTimer.current)
        window.clearTimeout(cardTransitionTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (personId == null) return;
    setPhotoIndex(0);
  }, [personId]);

  useEffect(() => {
    if (recommendationStatus !== "ready" || recommendationRefreshing) return;
    if (personId == null) {
      if (recommendations.length === 0 && hasNext) void onLoadMore();
      return;
    }
    if (recommendations.length - currentIndex > 2) return;

    if (hasNext) void onLoadMore();
    else void onPrepareNextBatch();
  }, [
    currentIndex,
    hasNext,
    onLoadMore,
    onPrepareNextBatch,
    personId,
    recommendationRefreshing,
    recommendationStatus,
    recommendations.length,
  ]);
  async function refreshRecommendations() {
    if (recommendationRefreshing) return;
    toast("새로운 인연을 찾고 있어요.");
    try {
      const count = await onRefreshRecommendations();
      toast(
        count > 0
          ? "새로운 인연을 찾았어요."
          : "지금은 새로운 인연을 찾지 못했어요.",
      );
    } catch (error) {
      toast(apiErrorMessage(error, "추천 목록을 새로고침하지 못했어요."));
    }
  }
  function resetCardPosition() {
    setIsCardSettling(true);
    setDragOffset(0);
    if (cardTransitionTimer.current)
      window.clearTimeout(cardTransitionTimer.current);
    cardTransitionTimer.current = window.setTimeout(() => {
      setIsCardSettling(false);
      setPreviewDirection("next");
      cardTransitionTimer.current = null;
    }, CARD_TRANSITION_MS);
  }
  const transitionCard = useCallback((direction, action) => {
    if (cardTransitionTimer.current) return;
    swipeGuideConsumed.current = true;
    setPreviewDirection(direction);
    setIsCardSettling(true);
    setDragOffset(
      direction === "next" ? -window.innerHeight : window.innerHeight,
    );
    cardTransitionTimer.current = window.setTimeout(() => {
      action();
      setIsCardSettling(false);
      setDragOffset(0);
      setPreviewDirection("next");
      cardTransitionTimer.current = null;
    }, CARD_TRANSITION_MS);
  }, []);

  const advanceToNextRecommendation = useCallback(async () => {
    if (
      !person ||
      nextNavigationInFlight.current ||
      cardTransitionTimer.current ||
      actionInFlight.current ||
      isCardSettling ||
      actionBusy ||
      recommendationRefreshing
    )
      return;

    nextNavigationInFlight.current = true;
    setIsContinuing(true);
    let transitionScheduled = false;
    const scheduleNextCard = (action) => {
      transitionCard("next", () => {
        try {
          setPhotoIndex(0);
          action();
        } finally {
          nextNavigationInFlight.current = false;
          setIsContinuing(false);
        }
      });
      transitionScheduled = true;
    };

    try {
      if (currentIndex < recommendations.length - 1) {
        scheduleNextCard(onAdvance);
        return;
      }
      if (nextBatchReady) {
        scheduleNextCard(onActivatePreparedBatch);
        return;
      }

      setIsCardSettling(true);
      setDragOffset(0);
      await new Promise((resolve) =>
        window.requestAnimationFrame(() => resolve()),
      );
      setIsCardSettling(false);
      await new Promise((resolve) =>
        window.requestAnimationFrame(() => resolve()),
      );

      if (hasNext && (await onLoadMore())) {
        scheduleNextCard(onAdvance);
        return;
      }
      if (await onPrepareNextBatch()) scheduleNextCard(onActivatePreparedBatch);
    } finally {
      if (!transitionScheduled) {
        nextNavigationInFlight.current = false;
        setIsContinuing(false);
        setIsCardSettling(false);
        setDragOffset(0);
      }
    }
  }, [
    actionBusy,
    currentIndex,
    hasNext,
    isCardSettling,
    nextBatchReady,
    onActivatePreparedBatch,
    onAdvance,
    onLoadMore,
    onPrepareNextBatch,
    person,
    recommendationRefreshing,
    recommendations.length,
    transitionCard,
  ]);
  function handleVerticalGesture(distance) {
    if (distance <= -NEXT_CARD_DISTANCE) {
      if (person) void advanceToNextRecommendation();
      else resetCardPosition();
      return;
    }
    if (distance >= PREVIOUS_CARD_DISTANCE && previousPerson) {
      transitionCard("previous", onRetreat);
      return;
    }
    resetCardPosition();
    if (distance >= REFRESH_DISTANCE) void refreshRecommendations();
  }
  function cyclePhoto(direction) {
    const count = Math.max(profilePhotoUrls(person).length, 1);
    setPhotoIndex((current) => (current + direction + count) % count);
  }
  const selectAdjacentPhoto = useCallback(
    (direction) => {
      const count = profilePhotoUrls(person).length;
      if (count <= 1) return;
      setPhotoIndex((current) =>
        Math.max(0, Math.min(current + direction, count - 1)),
      );
    },
    [person],
  );
  function handlePointerDown(event) {
    if (
      isCardSettling ||
      isContinuing ||
      nextNavigationInFlight.current ||
      actionInFlight.current ||
      recommendationRefreshing ||
      event.isPrimary === false ||
      (event.pointerType === "mouse" && event.button !== 0) ||
      event.target.closest?.("button")
    )
      return;

    event.currentTarget.setPointerCapture(event.pointerId);
    gestureStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    setPreviewDirection("next");
  }
  function handlePointerUp(event) {
    const start = gestureStart.current;
    gestureStart.current = null;
    if (!start || start.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (actionBusy || isContinuing) return;

    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (!person) {
      if (Math.abs(y) > Math.abs(x) && y >= REFRESH_DISTANCE)
        void refreshRecommendations();
      return;
    }
    if (Math.abs(x) <= 8 && Math.abs(y) <= 8) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const direction = event.clientX < bounds.left + bounds.width / 2 ? -1 : 1;
      resetCardPosition();
      selectAdjacentPhoto(direction);
    } else if (Math.abs(x) >= 48 && Math.abs(x) > Math.abs(y)) {
      resetCardPosition();
      cyclePhoto(x < 0 ? 1 : -1);
    } else if (Math.abs(y) > Math.abs(x)) handleVerticalGesture(y);
    else resetCardPosition();
  }
  function handlePointerMove(event) {
    const start = gestureStart.current;
    if (!start || start.pointerId !== event.pointerId) return;

    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (Math.abs(y) > Math.abs(x)) {
      event.preventDefault();
      if (person) {
        setDragOffset(Math.max(-240, Math.min(y, 240)));
        if (y > 0) setPreviewDirection(previousPerson ? "previous" : "none");
        else if (y < 0) setPreviewDirection("next");
      }
    }
  }
  function handlePointerCancel(event) {
    if (gestureStart.current?.pointerId !== event.pointerId) return;
    gestureStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (person) resetCardPosition();
  }
  function handleWheel(event) {
    if (
      actionInFlight.current ||
      actionBusy ||
      isContinuing ||
      recommendationRefreshing ||
      Math.abs(event.deltaY) <= Math.abs(event.deltaX)
    )
      return;

    event.preventDefault();
    const direction = wheelNavigationIntent(event.deltaY);
    const gesture = wheelGesture.current;
    const resetWheelGesture = () => {
      gesture.locked = false;
      gesture.delta = 0;
      gesture.direction = null;
      gesture.resetTimer = null;
    };
    const finishWheelGestureAfterIdle = () => {
      if (gesture.resetTimer) window.clearTimeout(gesture.resetTimer);
      gesture.resetTimer = window.setTimeout(
        resetWheelGesture,
        WHEEL_GESTURE_END_MS,
      );
    };
    if (gesture.locked) {
      finishWheelGestureAfterIdle();
      return;
    }
    if (gesture.direction && gesture.direction !== direction) gesture.delta = 0;

    gesture.direction = direction;
    gesture.delta += Math.abs(event.deltaY);
    if (gesture.resetTimer) window.clearTimeout(gesture.resetTimer);
    if (
      person &&
      direction === "next" &&
      gesture.delta >= WHEEL_NEXT_DISTANCE
    ) {
      gesture.locked = true;
      gesture.delta = 0;
      void advanceToNextRecommendation();
      finishWheelGestureAfterIdle();
      return;
    }

    if (
      person &&
      direction === "previous" &&
      currentIndex > 0 &&
      gesture.delta >= WHEEL_PREVIOUS_DISTANCE
    ) {
      gesture.locked = true;
      gesture.delta = 0;
      transitionCard("previous", onRetreat);
      finishWheelGestureAfterIdle();
      return;
    }

    if (direction === "previous" && (!person || currentIndex === 0)) {
      gesture.resetTimer = window.setTimeout(() => {
        const distance = gesture.delta;
        gesture.delta = 0;
        gesture.direction = null;
        if (gesture.locked) return;
        if (distance >= WHEEL_REFRESH_DISTANCE) {
          gesture.locked = true;
          finishWheelGestureAfterIdle();
          void refreshRecommendations();
        } else {
          return;
        }
      }, WHEEL_GESTURE_END_MS);
    } else {
      finishWheelGestureAfterIdle();
    }
  }
  wheelHandlerRef.current = handleWheel;
  const setCardElement = useCallback((card) => {
    if (cardRef.current === card) return;
    cardRef.current?.removeEventListener("wheel", nativeWheelListener.current);
    cardRef.current = card;
    card?.addEventListener("wheel", nativeWheelListener.current, {
      passive: false,
    });
  }, []);

  async function pass() {
    if (
      !person ||
      actionInFlight.current ||
      isCardSettling ||
      isContinuing ||
      recommendationRefreshing
    )
      return;
    actionInFlight.current = true;
    setActionBusy("pass");
    try {
      if (await onPass(person.id)) toast(`${person.nickname}님을 패스했어요.`);
    } catch (error) {
      toast(
        apiErrorMessage(
          error,
          "패스하지 못했어요. 잠시 후 다시 시도해 주세요.",
        ),
      );
    } finally {
      actionInFlight.current = false;
      setActionBusy("");
    }
  }
  async function like() {
    if (!person || actionInFlight.current || isContinuing) return;
    actionInFlight.current = true;
    setActionBusy("like");
    try {
      await matchingApi.sendLike(person.id);
      toast(`${person.nickname}님에게 좋아요를 보냈어요`);
      onDismiss(person.id);
    } catch (error) {
      toast(apiErrorMessage(error, "좋아요를 보내지 못했어요."));
    } finally {
      actionInFlight.current = false;
      setActionBusy("");
    }
  }
  function startPractice() {
    if (!person || actionBusy || isContinuing) return;
    navigate(`/ai/practice/${person.id}`);
  }
  async function startSimulation() {
    if (!person || actionInFlight.current || isContinuing) return;
    actionInFlight.current = true;
    setActionBusy("simulation");
    try {
      await onStartSimulation(person.id);
    } finally {
      actionInFlight.current = false;
      setActionBusy("");
    }
  }
  useEffect(() => {
    function isInteractiveTarget(target) {
      return (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest(
            'input, select, textarea, [contenteditable="true"], [role="dialog"], [role="listbox"], [role="menu"], [role="textbox"]',
          ))
      );
    }

    function handleKeyDown(event) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isInteractiveTarget(event.target) ||
        !person ||
        (event.key !== "ArrowUp" &&
          event.key !== "ArrowDown" &&
          event.key !== "ArrowLeft" &&
          event.key !== "ArrowRight")
      )
        return;

      event.preventDefault();
      if (
        actionBusy ||
        actionInFlight.current ||
        isCardSettling ||
        isContinuing ||
        recommendationRefreshing
      )
        return;

      if (event.key === "ArrowUp") {
        void advanceToNextRecommendation();
      } else if (event.key === "ArrowDown") {
        if (previousPerson) transitionCard("previous", onRetreat);
      } else {
        const photos = profilePhotoUrls(person);
        if (photos.length > 1)
          selectAdjacentPhoto(event.key === "ArrowLeft" ? -1 : 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    actionBusy,
    advanceToNextRecommendation,
    isCardSettling,
    isContinuing,
    onRetreat,
    person,
    previousPerson,
    recommendationRefreshing,
    selectAdjacentPhoto,
    transitionCard,
  ]);

  return (
    <>
      <BrandHeader navigate={navigate} className="home-header">
        <button
          className="home-preference-action"
          type="button"
          onClick={() => navigate("/preferences")}
          aria-label="선호 설정"
          title="선호 설정"
        >
          <img
            src={asset("preferences/preference-heart.svg")}
            width="28"
            height="28"
            alt=""
            aria-hidden="true"
          />
        </button>
      </BrandHeader>
      <main id="main-content" tabIndex={-1} className="main-scroll home-main">
        {!person && <h1 className="sr-only">오늘의 추천</h1>}
        {recommendationStatus === "loading" ? (
          <EmptyState
            icon={
              <img
                src={asset("illust/pager.svg")}
                width="190"
                height="160"
                alt=""
              />
            }
            title="추천을 불러오고 있어요…"
            description="잠시만 기다려 주세요…"
            role="status"
            action={
              <span className="empty-loader" aria-hidden="true">
                <i />
              </span>
            }
          />
        ) : recommendationError ? (
          <EmptyState
            icon="!"
            title="추천을 불러오지 못했어요"
            description={recommendationError}
            action={
              <PixelButton secondary onClick={onRetryRecommendations}>
                다시 불러오기
              </PixelButton>
            }
          />
        ) : !person ? (
          <div
            ref={setCardElement}
            className="recommendation-empty-refresh"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            <EmptyState
              icon={
                <img
                  src={asset("illust/pager.svg")}
                  width="190"
                  height="160"
                  alt=""
                />
              }
              title={
                recommendationExhausted || recommendations.length > 0
                  ? "추천을 모두 봤어요"
                  : "새로운 추천을 준비하고 있어요"
              }
              description={"새로운 인연이 준비되면 이곳에서 만날 수 있어요."}
              action={
                recommendationExhausted || recommendations.length > 0 ? (
                  <button
                    type="button"
                    className="recommendation-empty-refresh-button"
                    aria-label="새 추천 목록 생성"
                    aria-busy={recommendationRefreshing}
                    disabled={recommendationRefreshing}
                    onClick={() => void refreshRecommendations()}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="24"
                      height="24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M20 7v5h-5" />
                      <path d="M4 17v-5h5" />
                      <path d="M5.64 5.64a9 9 0 0 1 12.72 0L20 7" />
                      <path d="M18.36 18.36a9 9 0 0 1-12.72 0L4 17" />
                    </svg>
                  </button>
                ) : null
              }
            />
          </div>
        ) : (
          <div className="recommendation-stack">
            {previewPerson && (
              <article
                className={`recommendation-card recommendation-card-preview is-${previewDirection}`}
                aria-hidden="true"
              >
                <ProfilePhoto
                  className="recommendation-photo"
                  person={previewPerson}
                />
              </article>
            )}
            <article
              ref={setCardElement}
              className={`recommendation-card recommendation-card-current${isCardSettling ? " is-settling" : ""}`}
              style={{ transform: `translate3d(0, ${dragOffset}px, 0)` }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onDragStart={(event) => event.preventDefault()}
            >
              <ProfilePhoto
                className="recommendation-photo"
                person={person}
                index={photoIndex}
              />
              <PhotoSegments
                person={person}
                index={photoIndex}
                onSelect={setPhotoIndex}
              />
              {showSwipeGuide &&
                Boolean(nextPerson || hasNext || nextBatchReady) && (
                  <SwipeGuide direction="up" />
                )}
              <div className="recommendation-gradient" />
              <div className="recommendation-info">
                {showSwipeGuide && (
                  <SwipeGuide
                    direction="down"
                    canRetreat={Boolean(previousPerson)}
                  />
                )}
                {person.activity && (
                  <span className="recommendation-keyword recommendation-status">
                    <i aria-hidden="true" />
                    {person.activity}
                  </span>
                )}
                <h1>
                  {person.nickname}
                  {person.age != null && <span>{person.age}</span>}
                  {person.verified && (
                    <Icon
                      name="verified-shield.svg"
                      className="verified-shield"
                    />
                  )}
                </h1>
                {(person.region || person.job || person.mbti) && (
                  <p className="recommendation-meta">
                    {[
                      person.region,
                      person.job ? jobCategoryLabel(person.job) : "",
                      person.mbti,
                    ]
                      .filter(Boolean)
                      .map((item, index) => (
                        <span key={item}>
                          {index > 0 && <i aria-hidden="true" />}
                          {item}
                        </span>
                      ))}
                  </p>
                )}
                <button
                  type="button"
                  className="recommendation-profile-link"
                  aria-label={`${person.nickname} 프로필 상세 보기`}
                  disabled={
                    Boolean(actionBusy) || isCardSettling || isContinuing
                  }
                  onClick={() =>
                    navigate(`/profiles/${person.id}?returnTo=/home`)
                  }
                >
                  프로필 상세 보기 <PixelIcon name="chev" />
                </button>
                <div className="recommendation-actions">
                  {[
                    ["패스", "action-pass.svg", 3, pass, "pass"],
                    ["시뮬레이션", "sim", 3, startSimulation, "simulation"],
                    ["연습 대화", "chat", 3, startPractice, "practice"],
                    ["좋아요", "heart", 3, like, "like"],
                  ].map(([label, icon, scale, action, busyKey]) => (
                    <button
                      type="button"
                      key={label}
                      className="card-action"
                      onClick={action}
                      disabled={
                        Boolean(actionBusy) ||
                        isCardSettling ||
                        isContinuing ||
                        recommendationRefreshing
                      }
                      aria-busy={actionBusy === busyKey}
                    >
                      <span
                        className={`action-key${busyKey === "like" ? " action-key-like" : ""}${busyKey === "pass" ? " action-key-pass" : ""}`}
                      >
                        {busyKey === "pass" ? (
                          <Icon name={icon} />
                        ) : (
                          <PixelIcon name={icon} scale={scale} />
                        )}
                      </span>
                      <span>{actionBusy === busyKey ? "처리 중…" : label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </article>
          </div>
        )}
      </main>
    </>
  );
}

export function LegacyProfileRedirect({ navigate }) {
  useEffect(() => navigate("/home"), [navigate]);
  return null;
}
