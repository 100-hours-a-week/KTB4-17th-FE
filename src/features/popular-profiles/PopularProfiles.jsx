import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { asset } from "../../shared/assets.js";
import {
  EmptyState,
  PersonAvatar,
  PixelButton,
  ScreenHeader,
} from "../../shared/ui/components.jsx";
import { PixelIcon } from "../../shared/ui/pixel.jsx";
import { getPopularProfiles } from "./api.js";

const RANK_MEDALS = {
  1: asset("ranking/medal-gold.png"),
  2: asset("ranking/medal-silver.png"),
  3: asset("ranking/medal-bronze.png"),
};

function formatLikeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0
    ? count.toLocaleString("ko-KR")
    : "0";
}

export function PopularProfiles({ navigate }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);

  const loadProfiles = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");

    try {
      const response = await getPopularProfiles();
      if (version !== requestVersion.current) return;
      setProfiles(
        Array.isArray(response?.profiles) ? response.profiles : [],
      );
    } catch (requestError) {
      if (version !== requestVersion.current) return;
      setProfiles([]);
      setError(
        apiErrorMessage(
          requestError,
          "인기 프로필을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
        ),
      );
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfiles();
    return () => {
      requestVersion.current += 1;
    };
  }, [loadProfiles]);

  function openProfile(profile) {
    const userId = Number(profile?.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) return;
    navigate(
      `/profiles/${userId}?returnTo=${encodeURIComponent("/popular-profiles")}`,
    );
  }

  return (
    <>
      <ScreenHeader
        title="인기 프로필"
        onBack={() => navigate("/home")}
        className="popular-profiles-header"
        notificationAction
      />
      <main
        id="main-content"
        tabIndex={-1}
        className="main-scroll popular-profiles-main"
        aria-busy={loading}
      >
        {loading ? (
          <EmptyState
            icon={<PixelIcon name="trophy" scale={4} />}
            title="인기 프로필을 불러오고 있어요…"
            description="잠시만 기다려 주세요."
            role="status"
          />
        ) : error ? (
          <EmptyState
            icon="!"
            title="인기 프로필을 불러오지 못했어요"
            description={error}
            action={
              <PixelButton secondary onClick={() => void loadProfiles()}>
                다시 불러오기
              </PixelButton>
            }
          />
        ) : profiles.length === 0 ? (
          <EmptyState
            icon={<PixelIcon name="heartOutline" scale={4} />}
            title="아직 인기 프로필이 없어요"
            description="인기 프로필이 생기면 이곳에서 만날 수 있어요."
          />
        ) : (
          <div className="popular-profile-list">
            {profiles.map((profile, index) => {
              const userId = Number(profile.userId);
              const person = {
                userId,
                nickname: profile.nickname,
                photo: profile.thumbnail?.imageUrl || "",
              };
              const requestedRank = Number(profile.rank);
              const rank =
                Number.isSafeInteger(requestedRank) && requestedRank > 0
                  ? requestedRank
                  : index + 1;
              const medal = RANK_MEDALS[rank];
              const nickname = profile.nickname || "닉네임 정보 없음";

              return (
                <article className="popular-profile-card" key={profile.userId}>
                  <div className="popular-profile-row">
                    <button
                      type="button"
                      className="popular-profile-photo-button"
                      onClick={() => openProfile(profile)}
                      disabled={!Number.isSafeInteger(userId) || userId <= 0}
                      aria-label={`${rank}위 ${nickname} 프로필 보기`}
                    >
                      <span className="popular-profile-avatar">
                        <PersonAvatar person={person} size="large" />
                      </span>
                    </button>
                    <span className="popular-profile-copy">
                      <span className={`popular-profile-rank rank-${rank}`}>
                        {medal && (
                          <img
                            className="popular-profile-medal"
                            src={medal}
                            alt=""
                            aria-hidden="true"
                          />
                        )}
                        <span>{rank}위</span>
                      </span>
                      <strong className="popular-profile-name">
                        {nickname}
                      </strong>
                      {profile.region && (
                        <span className="popular-profile-region">
                          <PixelIcon name="pin" scale={1.25} />
                          {profile.region}
                        </span>
                      )}
                      <span className="popular-profile-count">
                        <PixelIcon name="heartOutline" scale={1.35} />
                        좋아요를 보낸 회원&nbsp;
                        <b>{formatLikeCount(profile.likeCount)}명</b>
                      </span>
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
      <div className="popular-profiles-sticky-intro" aria-label="인기 프로필 안내">
        <PixelIcon name="heart" scale={1.5} aria-hidden="true" />
        <span>회원들이 많이 좋아한 프로필이에요</span>
        <PixelIcon name="heart" scale={1.5} aria-hidden="true" />
      </div>
    </>
  );
}
