import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { PhotoSegments, ProfilePhoto } from "../../shared/ui/components.jsx";
import { dateAge } from "../../shared/utils.js";
import { getMemberProfile, getMyProfile } from "./api.js";
import {
  bodyTypes,
  drinkings,
  educationLevels,
  religions,
  smokings,
} from "./data.js";
import "./other-profile.css";
import { profileImageUrls } from "./imageUrls.js";

function profileChoiceLabel(options, value) {
  if (!value) return "정보 없음";
  return options.find(([option]) => option === value)?.[1] || value;
}

export function OtherProfile({ memberId, returnTo, navigate, isOwn = false }) {
  const [profile, setProfile] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const profileRequestVersion = useRef(0);
  const pointerStart = useRef(null);
  const photos = profile?.photos || [];

  const loadProfile = useCallback(async () => {
    const requestVersion = ++profileRequestVersion.current;
    setLoading(true);
    setError("");

    try {
      const result = await (isOwn
        ? getMyProfile()
        : getMemberProfile(memberId));
      if (requestVersion !== profileRequestVersion.current) return;

      setProfile({
        ...result,
        id: isOwn ? "me" : Number(result?.memberId || memberId),
        age: isOwn ? dateAge(result?.birthDate) : result?.age,
        region: isOwn ? result?.activityRegionName : result?.region,
        photos: profileImageUrls(result),
      });
      setPhotoIndex(0);
    } catch (requestError) {
      if (requestVersion !== profileRequestVersion.current) return;
      setProfile(null);
      setError(
        apiErrorMessage(
          requestError,
          "프로필을 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
        ),
      );
    } finally {
      if (requestVersion === profileRequestVersion.current) {
        setLoading(false);
      }
    }
  }, [memberId, isOwn]);

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
    <main className="other-profile-page">
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
        <button
          type="button"
          className="other-profile-back"
          aria-label="이전 화면으로"
          onClick={() => navigate(returnTo, { replace: true })}
        >
          ‹
        </button>
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
            프로필을 불러오는 중이에요.
          </p>
        )}
      </section>

      {profile ? (
        <section className="other-profile-info" aria-label="프로필 정보">
          <span className="other-profile-kicker">PROFILE</span>
          <h1>
            {profileName}
            {profile.age != null && <span>, {profile.age}</span>}
            <span className="other-profile-heart" aria-hidden="true">
              ♡
            </span>
          </h1>
          <div className="other-profile-facts">
            {profile.job && (
              <p>
                <span aria-hidden="true">▣</span>
                {profile.job}
              </p>
            )}
            {profile.region && (
              <p>
                <span aria-hidden="true">⌖</span>
                {profile.region}
              </p>
            )}
          </div>
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
            <button type="button" onClick={() => void loadProfile()}>
              다시 시도
            </button>
          </section>
        )
      )}
    </main>
  );
}
