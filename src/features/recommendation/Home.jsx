import { useEffect, useRef, useState } from "react";
import { asset } from "../../shared/assets.js";
import {
  BrandHeader,
  EmptyState,
  Icon,
  PhotoSegments,
  PixelButton,
  ProfilePhoto,
} from "../../shared/ui/components.jsx";
import { profilePhotoUrls } from "../../shared/utils.js";
import * as matchingApi from "../matching/api.js";

export function Home({
  navigate,
  toast,
  recommendations,
  currentIndex,
  hasNext,
  recommendationStatus,
  recommendationError,
  recommendationRefreshing,
  onRetryRecommendations,
  onRefreshRecommendations,
  onAdvance,
  onLoadMore,
  onStartSimulation,
}) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const gestureStart = useRef(null);
  const wheelGesture = useRef({
    delta: 0,
    direction: 0,
    locked: false,
    resetTimer: null,
  });
  const person = recommendations[currentIndex] || null;
  const personId = person?.id;
  const nextPerson = recommendations[currentIndex + 1] || null;
  const nextPersonId = nextPerson?.id;

  useEffect(
    () => () => {
      if (wheelGesture.current.resetTimer)
        window.clearTimeout(wheelGesture.current.resetTimer);
    },
    [],
  );

  useEffect(() => {
    if (personId == null) return;
    setPhotoIndex(0);
  }, [personId]);

  useEffect(() => {
    if (personId == null || nextPersonId != null || !hasNext) return;
    void onLoadMore();
  }, [hasNext, nextPersonId, onLoadMore, personId]);

  async function advance() {
    if (currentIndex < recommendations.length - 1) {
      setPhotoIndex(0);
      onAdvance();
      return;
    }
    if (hasNext && (await onLoadMore())) {
      setPhotoIndex(0);
      onAdvance();
    }
  }
  async function refreshRecommendations() {
    if (recommendationRefreshing) return;
    try {
      const count = await onRefreshRecommendations();
      toast(
        count > 0
          ? "새로운 인연을 찾았어요."
          : "지금은 새로운 인연을 찾지 못했어요.",
      );
    } catch (error) {
      toast(error?.code || "추천 목록을 새로고침하지 못했어요.");
    }
  }
  function handleVerticalGesture(distance) {
    if (distance <= -64) {
      void advance();
      return;
    }
    if (distance >= 120) void refreshRecommendations();
  }
  function cyclePhoto(direction) {
    const count = Math.max(profilePhotoUrls(person).length, 1);
    setPhotoIndex((current) => (current + direction + count) % count);
  }
  function handlePointerDown(event) {
    if (
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
  }
  function handlePointerUp(event) {
    const start = gestureStart.current;
    gestureStart.current = null;
    if (!start || start.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (!person || actionBusy) return;

    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (Math.abs(x) >= 48 && Math.abs(x) > Math.abs(y))
      cyclePhoto(x < 0 ? 1 : -1);
    else if (Math.abs(y) > Math.abs(x)) handleVerticalGesture(y);
  }
  function handlePointerCancel(event) {
    if (gestureStart.current?.pointerId !== event.pointerId) return;
    gestureStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function handleWheel(event) {
    if (
      !person ||
      actionBusy ||
      recommendationRefreshing ||
      Math.abs(event.deltaY) <= Math.abs(event.deltaX)
    )
      return;

    event.preventDefault();
    const direction = Math.sign(event.deltaY);
    const gesture = wheelGesture.current;
    if (gesture.locked) return;
    if (gesture.direction && gesture.direction !== direction) gesture.delta = 0;

    gesture.direction = direction;
    gesture.delta += Math.abs(event.deltaY);
    if (gesture.resetTimer) window.clearTimeout(gesture.resetTimer);
    gesture.resetTimer = window.setTimeout(() => {
      gesture.delta = 0;
      gesture.direction = 0;
    }, 160);

    if (gesture.delta < 80) return;
    gesture.locked = true;
    gesture.delta = 0;
    if (direction > 0) void advance();
    else void refreshRecommendations();
    window.setTimeout(() => {
      gesture.locked = false;
    }, 450);
  }
  async function like() {
    if (!person || actionBusy) return;
    setActionBusy("like");
    try {
      await matchingApi.sendLike(person.id);
      toast(`${person.nickname}님에게 좋아요를 보냈어요`);
      await advance();
    } catch (error) {
      toast(error?.code || "좋아요를 보내지 못했어요.");
    } finally {
      setActionBusy("");
    }
  }
  function startPractice() {
    if (!person || actionBusy) return;
    navigate(`/ai/practice/${person.id}`);
  }
  async function startSimulation() {
    if (!person || actionBusy) return;
    setActionBusy("simulation");
    try {
      await onStartSimulation(person.id);
    } finally {
      setActionBusy("");
    }
  }
  return (
    <>
      <BrandHeader className="home-header">
        <span className="home-mode-label">AI 분석모드</span>
        <span className="home-header-spacer" />
        <button
          className="home-menu-button"
          type="button"
          aria-label="메뉴 열기"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          ≡
        </button>
        {menuOpen && (
          <nav className="home-menu" aria-label="홈 메뉴">
            <button type="button" onClick={() => navigate("/preferences")}>
              선호 설정
            </button>
            <button type="button" onClick={() => navigate("/notifications")}>
              알림
            </button>
          </nav>
        )}
      </BrandHeader>
      <main className="main-scroll home-main">
        {recommendationStatus === "loading" ? (
          <EmptyState
            icon="✦"
            title="추천을 불러오고 있어요"
            description="잠시만 기다려주세요."
          />
        ) : recommendationError ? (
          <EmptyState
            icon="!"
            title="추천을 불러오지 못했어요"
            description="네트워크를 확인한 뒤 다시 시도해주세요."
            action={
              <PixelButton secondary onClick={onRetryRecommendations}>
                다시 불러오기
              </PixelButton>
            }
          />
        ) : !person ? (
          <EmptyState
            icon="✦"
            title={
              recommendations.length > 0
                ? "추천을 모두 봤어요"
                : "새로운 추천을 준비하고 있어요"
            }
            description={"새로운 인연이 준비되면 이곳에서 만날 수 있어요."}
          />
        ) : (
          <div
            className={`recommendation-stack${nextPerson ? " has-next" : ""}`}
          >
            {nextPerson && (
              <article
                className="recommendation-card recommendation-card-next"
                aria-hidden="true"
              >
                <ProfilePhoto
                  className="recommendation-photo"
                  person={nextPerson}
                />
              </article>
            )}
            <article
              className="recommendation-card recommendation-card-current"
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onWheel={handleWheel}
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
              <div className="recommendation-gradient" />
              <div className="recommendation-info">
                {person.activity && (
                  <span className="online-badge">{person.activity}</span>
                )}
                <h1>
                  {person.nickname}
                  {person.age != null && `, ${person.age}`}
                  {person.verified && <Icon name="detail-shield.svg" />}
                </h1>
                {person.job && <p>{person.job}</p>}
                {(person.region || person.mbti) && (
                  <p>
                    {[person.region, person.mbti].filter(Boolean).join(" / ")}
                  </p>
                )}
                <div className="recommendation-actions">
                  {[
                    [
                      "시뮬레이션",
                      "action-simulation.svg",
                      startSimulation,
                      "simulation",
                    ],
                    [
                      "연습 대화",
                      "action-practice.svg",
                      startPractice,
                      "practice",
                    ],
                    ["좋아요", "action-like.svg", like, "like"],
                  ].map(([label, icon, action, busyKey]) => (
                    <button
                      type="button"
                      key={label}
                      className="card-action"
                      onClick={action}
                      disabled={Boolean(actionBusy)}
                    >
                      <span
                        className="action-key"
                        style={{
                          backgroundImage: `url(${asset(icon === "action-like.svg" ? "action-pink.svg" : "action-white.svg")})`,
                        }}
                      >
                        <Icon name={icon} />
                      </span>
                      <span>
                        {actionBusy === busyKey ? "처리 중..." : label}
                      </span>
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
