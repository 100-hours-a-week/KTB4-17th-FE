import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { PhotoSegments, ProfilePhoto } from "../../shared/ui/components.jsx";
import { PixelIcon } from "../../shared/ui/pixel.jsx";
import { dateAge } from "../../shared/utils.js";
import { NotificationButton } from "../notifications/NotificationControls.jsx";
import { isProfileAccessUnavailable } from "./access.js";
import { getMyProfile, getUserProfile } from "./api.js";
import {
  bodyTypes,
  drinkings,
  educationLevels,
  religions,
  smokings,
} from "./data.js";
import "./other-profile.css";
import { profileImageUrls } from "./imageUrls.js";
import { jobCategoryLabel } from "./jobCategories.js";

function profileChoiceLabel(options, value) {
  if (!value) return "정보 없음";
  return options.find(([option]) => option === value)?.[1] || value;
}

export function OtherProfile({
  userId,
  returnTo,
  navigate,
  isOwn = false,
  onStartSimulation,
  simulationStartingFor,
}) {
  const [profile, setProfile] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accessUnavailable, setAccessUnavailable] = useState(false);
  const profileRequestVersion = useRef(0);
  const pointerStart = useRef(null);
  const photos = profile?.photos || [];
  const [simulationBusy, setSimulationBusy] = useState(false);
  const showAiActions = !isOwn && returnTo?.split("?")[0] === "/likes";
  const startingSimulation = simulationBusy || simulationStartingFor != null;

  async function startSimulation() {
    if (!profile || startingSimulation || !onStartSimulation) return;
    setSimulationBusy(true);
    try {
      await onStartSimulation(profile.id);
    } finally {
      setSimulationBusy(false);
    }
  }

  const loadProfile = useCallback(async () => {
    const requestVersion = ++profileRequestVersion.current;
    setLoading(true);
    setError("");
    setAccessUnavailable(false);

    try {
      const result = await (isOwn ? getMyProfile() : getUserProfile(userId));
      if (requestVersion !== profileRequestVersion.current) return;

      setProfile({
        ...result,
        id: isOwn ? "me" : Number(result?.userId || userId),
        age: isOwn ? dateAge(result?.birthDate) : result?.age,
        region: isOwn ? result?.activityRegionName : result?.region,
        photos: profileImageUrls(result),
      });
      setPhotoIndex(0);
    } catch (requestError) {
      if (requestVersion !== profileRequestVersion.current) return;
      setProfile(null);
      if (!isOwn && isProfileAccessUnavailable(requestError)) {
        setAccessUnavailable(true);
        setError("더 이상 확인할 수 없는 프로필이에요.");
      } else {
        setError(
          apiErrorMessage(
            requestError,
            "프로필을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
          ),
        );
      }
    } finally {
      if (requestVersion === profileRequestVersion.current) {
        setLoading(false);
      }
    }
  }, [userId, isOwn]);

  useEffect(() => {
    void loadProfile();
    return () => {
      profileRequestVersion.current += 1;
    };
  }, [loadProfile]);

  function cyclePhoto(direction) {
    if (photos.length < 2) return;
    setPhotoIndex(
      (current) => (current + direction + photos.length) % photos.length,
    );
  }

  function handlePointerDown(event) {
    if (
      event.isPrimary === false ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return;
    if (event.target.closest?.("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }

  function handlePointerUp(event) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (photos.length < 2) return;

    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (Math.abs(x) <= 8 && Math.abs(y) <= 8) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const direction = event.clientX < bounds.left + bounds.width / 2 ? -1 : 1;
      setPhotoIndex((current) =>
        Math.max(0, Math.min(current + direction, photos.length - 1)),
      );
    } else if (Math.abs(x) >= 48 && Math.abs(x) > Math.abs(y)) {
      cyclePhoto(x < 0 ? 1 : -1);
    }
  }

  const profileName = profile?.nickname || (isOwn ? "내 프로필" : "상대 회원");
  const profileDetails = profile
    ? [
        {
          label: "키",
          value:
            profile.height == null || profile.height === ""
              ? "정보 없음"
              : `${profile.height} cm`,
        },
        {
          label: "체형",
          value: profileChoiceLabel(bodyTypes, profile.bodyType),
        },
        {
          label: "학력",
          value: profileChoiceLabel(educationLevels, profile.educationLevel),
        },
      ]
    : [];
  const lifestyleDetails = profile
    ? [
        {
          label: "종교",
          value: profileChoiceLabel(religions, profile.religion),
        },
        {
          label: "음주",
          value: profileChoiceLabel(drinkings, profile.drinking),
        },
        {
          label: "흡연",
          value: profileChoiceLabel(smokings, profile.smoking),
        },
        { label: "MBTI", value: profile.mbti || "정보 없음" },
      ]
    : [];

  return (
    <main id="main-content" tabIndex={-1} className="other-profile-page">
      {profile && (
        <div className="other-profile-backdrop" aria-hidden="true">
          <ProfilePhoto
            person={profile}
            index={photoIndex}
            className="other-profile-backdrop-photo"
          />
        </div>
      )}
      <header className="other-profile-toolbar">
        <button
          type="button"
          className="other-profile-back"
          aria-label="이전 화면으로"
          onClick={() => navigate(returnTo, { replace: true })}
        >
          <PixelIcon name="back" scale={3} />
        </button>
        <NotificationButton className="profile-pager" />
        {isOwn && (
          <button
            type="button"
            className="other-profile-settings"
            aria-label="프로필 설정"
            title="프로필 설정"
            onClick={() => navigate("/my/profile?returnTo=/my/profile/view")}
          >
            <span aria-hidden="true">⚙︎</span>
          </button>
        )}
        {profile && photos.length > 0 && (
          <span
            className="other-profile-photo-count"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="sr-only">사진 </span>
            {photoIndex + 1}/{photos.length}
          </span>
        )}
      </header>
      <section
        className="other-profile-hero"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={(event) => {
          pointerStart.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onDragStart={(event) => event.preventDefault()}
        tabIndex={photos.length > 1 ? 0 : undefined}
        aria-label="프로필 사진. 양쪽을 터치하거나 좌우로 스와이프해 사진을 볼 수 있어요."
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            cyclePhoto(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
      >
        {profile ? (
          <ProfilePhoto
            person={profile}
            index={photoIndex}
            className="other-profile-photo"
          />
        ) : (
          <div className="other-profile-hero-placeholder" aria-hidden="true" />
        )}
        {profile && (
          <PhotoSegments
            person={profile}
            index={photoIndex}
            onSelect={setPhotoIndex}
            className="other-profile-segments"
          />
        )}
        {loading && (
          <p className="other-profile-loading" role="status">
            프로필을 불러오는 중이에요…
          </p>
        )}
      </section>

      {profile ? (
        <section className="other-profile-info" aria-label="프로필 정보">
          <span className="other-profile-kicker">
            {isOwn ? "MY PROFILE" : "PROFILE"}
          </span>
          <h1>
            {profileName}
            {profile.age != null && (
              <span className="other-profile-age">, {profile.age}</span>
            )}
            <span className="other-profile-heart" aria-hidden="true">
              ♡
            </span>
          </h1>
          <div className="other-profile-facts">
            {profile.job && (
              <p>
                <span aria-hidden="true">
                  <PixelIcon name="briefcase" />
                </span>
                {jobCategoryLabel(profile.job)}
              </p>
            )}
            {profile.region && (
              <p>
                <span aria-hidden="true">
                  <PixelIcon name="pin" />
                </span>
                {profile.region}
              </p>
            )}
          </div>
          {showAiActions && (
            <section
              className="other-profile-ai-actions"
              aria-label="대화 시작 전 알아보기"
            >
              <button
                type="button"
                disabled={startingSimulation || !onStartSimulation}
                aria-busy={
                  simulationBusy || simulationStartingFor === profile.id
                }
                onClick={() => void startSimulation()}
              >
                <PixelIcon name="sim" scale={3} />
                <span>
                  <strong>AI 시뮬레이션</strong>
                  <small>
                    {simulationBusy || simulationStartingFor === profile.id
                      ? "대화를 준비하고 있어요…"
                      : "두 사람의 대화 호흡 알아보기"}
                  </small>
                </span>
                <PixelIcon name="chev" />
              </button>
              <button
                type="button"
                onClick={() => navigate(`/ai/practice/${profile.id}`)}
              >
                <PixelIcon name="chat" scale={3} />
                <span>
                  <strong>AI 연습대화</strong>
                  <small>첫 메시지를 편하게 연습하기</small>
                </span>
                <PixelIcon name="chev" />
              </button>
            </section>
          )}
          <section
            className="other-profile-detail-section"
            aria-label="프로필 상세 정보"
          >
            <h2 className="other-profile-section-title">
              <span aria-hidden="true">01</span> 기본 정보
            </h2>
            <dl className="other-profile-detail-grid">
              {profileDetails.map(({ label, value }) => (
                <div className="other-profile-detail-tile" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section
            className="other-profile-detail-section"
            aria-label="라이프스타일"
          >
            <h2 className="other-profile-section-title">
              <span aria-hidden="true">02</span> 라이프스타일
            </h2>
            <dl className="other-profile-detail-grid other-profile-lifestyle-grid">
              {lifestyleDetails.map(({ label, value }) => (
                <div className="other-profile-detail-tile" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </section>
      ) : (
        !loading && (
          <section className="other-profile-error" role="alert">
            <p>{error}</p>
            {accessUnavailable ? (
              <button
                type="button"
                onClick={() => navigate(returnTo, { replace: true })}
              >
                이전 화면으로
              </button>
            ) : (
              <button type="button" onClick={() => void loadProfile()}>
                다시 시도
              </button>
            )}
          </section>
        )
      )}
    </main>
  );
}
