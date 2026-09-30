import { useCallback, useEffect, useRef, useState } from "react";
import { PhotoSegments, ProfilePhoto } from "../../shared/ui/components.jsx";
import { getMemberProfile } from "./api.js";
import "./other-profile.css";

export function OtherProfile({ memberId, returnTo, navigate }) {
  const [profile, setProfile] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const profileRequestVersion = useRef(0);
  const pointerStart = useRef(null);
  const suppressSideClick = useRef(false);
  const photos = profile?.photos || [];

  const loadProfile = useCallback(async () => {
    const requestVersion = ++profileRequestVersion.current;
    setLoading(true);
    setError("");

    try {
      const result = await getMemberProfile(memberId);
      if (requestVersion !== profileRequestVersion.current) return;

      const images = Array.isArray(result?.images) ? result.images : [];
      const orderedPhotos = images
        .slice()
        .sort(
          (first, second) =>
            Number(first?.displayOrder || 0) -
            Number(second?.displayOrder || 0),
        )
        .map((image) => image?.imageUrl)
        .filter((url) => typeof url === "string" && url);
      setProfile({
        ...result,
        id: Number(result?.memberId || memberId),
        photos: orderedPhotos,
      });
      setPhotoIndex(0);
    } catch (requestError) {
      if (requestVersion !== profileRequestVersion.current) return;
      setProfile(null);
      setError(
        requestError?.status === 404
          ? "프로필을 찾을 수 없어요."
          : "프로필을 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
      );
    } finally {
      if (requestVersion === profileRequestVersion.current) {
        setLoading(false);
      }
    }
  }, [memberId]);

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
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target.closest?.(".other-profile-back, .other-profile-segments"))
      return;
    pointerStart.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || photos.length < 2) return;

    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (Math.abs(x) < 42 || Math.abs(x) <= Math.abs(y)) return;

    cyclePhoto(x < 0 ? 1 : -1);
    if (event.target.closest?.(".other-profile-photo-side")) {
      suppressSideClick.current = true;
      window.setTimeout(() => {
        suppressSideClick.current = false;
      }, 0);
    }
  }

  function handleSideClick(direction) {
    if (suppressSideClick.current) {
      suppressSideClick.current = false;
      return;
    }
    cyclePhoto(direction);
  }

  const profileName = profile?.nickname || "상대 회원";

  return (
    <main className="other-profile-page">
      <section
        className="other-profile-hero"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          pointerStart.current = null;
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
        {profile && (
          <PhotoSegments
            person={profile}
            index={photoIndex}
            onSelect={setPhotoIndex}
            className="other-profile-segments"
          />
        )}
        {photos.length > 1 && (
          <>
            <button
              type="button"
              className="other-profile-photo-side other-profile-photo-side-left"
              aria-label="이전 사진"
              onClick={() => handleSideClick(-1)}
            />
            <button
              type="button"
              className="other-profile-photo-side other-profile-photo-side-right"
              aria-label="다음 사진"
              onClick={() => handleSideClick(1)}
            />
          </>
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
