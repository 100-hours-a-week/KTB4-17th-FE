import { useEffect, useRef, useState } from "react";
import { asset } from "../../shared/assets.js";
import { PixelButton } from "../../shared/ui/components.jsx";
import { AiAvatar, PixelIcon } from "../../shared/ui/pixel.jsx";
import { uploadProfileImage } from "../profile/api.js";
import {
  createPhotoId,
  prepareProfilePhoto,
  profilePhotoErrorMessage,
} from "../profile/photoUpload.js";
import { reorderPhotos } from "./model.js";
import { useFaceVerification } from "./useFaceVerification.js";

const PHOTO_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

function PhotoPicker({
  children,
  onSelect,
  disabled,
  capture,
  className = "",
}) {
  const input = useRef(null);
  return (
    <>
      <button
        type="button"
        className={`trust-picker ${className}`}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {children}
      </button>
      <input
        ref={input}
        type="file"
        accept={PHOTO_ACCEPT}
        capture={capture}
        hidden
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onSelect(file);
        }}
      />
    </>
  );
}

function GuidePortrait({ variant = "good" }) {
  return (
    <svg
      viewBox="0 0 120 108"
      role="img"
      aria-label={
        variant === "good"
          ? "밝은 곳에서 얼굴 전체가 정면으로 보이는 좋은 촬영 예시"
          : variant === "side"
            ? "얼굴이 옆을 향한 피해야 할 촬영 예시"
            : "마스크로 얼굴이 가려진 피해야 할 촬영 예시"
      }
    >
      <rect
        width="120"
        height="108"
        fill={variant === "good" ? "#ede7ff" : "#f0edf2"}
      />
      <path d="M22 108v-12l8-12 18-7h24l18 7 8 12v12" fill="#a18bd2" />
      <path d="M50 66h20v17l-10 8-10-8" fill="#e9b89f" />
      <g
        transform={variant === "side" ? "translate(18 0) skewX(-9)" : undefined}
      >
        <path
          d="M35 35l5-17 13-7h15l14 9 4 17-4 25-10 13H49L38 61z"
          fill="#f5ceb7"
        />
        <path
          d="M35 45V28l8-13 14-6 19 6 10 15v15l-7-12-5-10-10 7-20 3-5 14z"
          fill="#44364d"
        />
        <path d="M46 46h5v5h-5zm23 0h5v5h-5z" fill="#45394b" />
        <path d="M55 61h10v3H55z" fill="#b56e78" />
        {variant === "covered" && (
          <path
            d="M39 51l21 4 21-4-5 19-16 5-16-5z"
            fill="#fff"
            stroke="#b5a9c9"
            strokeWidth="2"
          />
        )}
      </g>
      <path
        d="M12 24V12h12m72 0h12v12M12 84v12h12m72 0h12V84"
        fill="none"
        stroke={variant === "good" ? "#7c5cfa" : "#b3a8bb"}
        strokeWidth="3"
      />
      {variant === "good" && (
        <path
          d="M91 86l5 5 10-12"
          fill="none"
          stroke="#5b3fd6"
          strokeWidth="4"
        />
      )}
    </svg>
  );
}

function CaptureGuide() {
  return (
    <details className="trust-guide" open>
      <summary>이렇게 준비하면 인증이 쉬워요</summary>
      <div className="trust-examples">
        <figure className="trust-example-good">
          <GuidePortrait />
          <figcaption>✓ 밝고 선명한 정면</figcaption>
        </figure>
        <figure>
          <GuidePortrait variant="side" />
          <figcaption>옆모습은 피해주세요</figcaption>
        </figure>
        <figure>
          <GuidePortrait variant="covered" />
          <figcaption>얼굴을 가리지 않기</figcaption>
        </figure>
      </div>
      <p>
        혼자 화면에 들어와 주세요. 모자·마스크·선글라스와 강한 필터는
        피해주세요.
      </p>
    </details>
  );
}

const EMPTY_PHOTOS = [];

// Onboarding and profile editing share the complete verification/photo flow.
// Only final file IDs leave this component; video bodies stay in memory.
export function ProfilePhotoEditor({
  initialPhotos = EMPTY_PHOTOS,
  requireVerification = false,
  disabled = false,
  onChange,
}) {
  const [items, setItems] = useState(initialPhotos);
  const [verifying, setVerifying] = useState(
    requireVerification || !initialPhotos.some((item) => item.isFrontal),
  );
  const [error, setError] = useState("");
  const itemsRef = useRef(items);
  const ownedUrls = useRef(new Set());
  const removed = useRef(new Set());
  const mounted = useRef(false);
  const dragged = useRef(null);
  const heading = useRef(null);
  const trust = useFaceVerification();
  const ready =
    !verifying &&
    items.some((item) => item.isFrontal && item.fileId) &&
    items.every((item) => item.fileId && !item.uploading);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const url of ownedUrls.current) URL.revokeObjectURL(url);
      ownedUrls.current.clear();
    };
  }, []);

  useEffect(() => {
    onChange?.({
      images: items.map(({ fileId, isFrontal }) => ({ fileId, isFrontal })),
      ready,
      busy: trust.active || items.some((item) => item.uploading),
    });
  }, [items, ready, trust.active, onChange]);

  useEffect(() => {
    if (verifying && trust.phase)
      heading.current?.focus({ preventScroll: true });
  }, [trust.phase, verifying]);

  function updateItems(update) {
    const next =
      typeof update === "function" ? update(itemsRef.current) : update;
    itemsRef.current = next;
    setItems(next);
  }

  async function addPhoto(file) {
    if (disabled || itemsRef.current.length >= 6) return;
    const localId = createPhotoId();
    const previewUrl = URL.createObjectURL(file);
    ownedUrls.current.add(previewUrl);
    updateItems((photos) => [
      ...photos,
      { localId, previewUrl, fileId: null, uploading: true, isFrontal: false },
    ]);
    setError("");
    try {
      const prepared = await prepareProfilePhoto(file);
      if (!mounted.current || removed.current.has(localId)) return;
      const converted = URL.createObjectURL(prepared);
      ownedUrls.current.add(converted);
      ownedUrls.current.delete(previewUrl);
      URL.revokeObjectURL(previewUrl);
      updateItems((photos) =>
        photos.map((item) =>
          item.localId === localId ? { ...item, previewUrl: converted } : item,
        ),
      );
      const metadata = await uploadProfileImage(prepared);
      if (!mounted.current || removed.current.has(localId)) return;
      updateItems((photos) =>
        photos.map((item) =>
          item.localId === localId
            ? { ...item, fileId: metadata.fileId, uploading: false }
            : item,
        ),
      );
    } catch (uploadError) {
      if (!mounted.current || removed.current.has(localId)) return;
      removePhoto(localId);
      setError(profilePhotoErrorMessage(uploadError));
    }
  }

  function removePhoto(id) {
    if (
      disabled ||
      itemsRef.current.find((item) => item.localId === id)?.isFrontal
    )
      return;
    removed.current.add(id);
    const item = itemsRef.current.find((photo) => photo.localId === id);
    if (ownedUrls.current.has(item?.previewUrl)) {
      URL.revokeObjectURL(item.previewUrl);
      ownedUrls.current.delete(item.previewUrl);
    }
    updateItems((photos) => photos.filter((photo) => photo.localId !== id));
  }

  function movePhoto(source, target) {
    if (!disabled)
      updateItems((photos) => reorderPhotos(photos, source, target));
  }

  function acceptVerifiedPhoto() {
    if (!trust.result) return;
    const previewUrl = URL.createObjectURL(trust.result.file);
    ownedUrls.current.add(previewUrl);
    for (const item of itemsRef.current.filter((photo) => photo.isFrontal)) {
      if (ownedUrls.current.has(item.previewUrl)) {
        URL.revokeObjectURL(item.previewUrl);
        ownedUrls.current.delete(item.previewUrl);
      }
    }
    updateItems((photos) => [
      {
        localId: createPhotoId(),
        fileId: trust.result.fileId,
        previewUrl,
        isFrontal: true,
        uploading: false,
      },
      ...photos.filter((item) => !item.isFrontal).slice(0, 5),
    ]);
    setError("");
    setVerifying(false);
  }

  function beginReplacement() {
    if (disabled) return;
    trust.reset();
    setVerifying(true);
  }

  const canCancel =
    items.some((item) => item.isFrontal) && !requireVerification;
  return (
    <section
      className="profile-trust"
      data-trust-phase={verifying ? trust.phase : "photos"}
      aria-label="프로필 사진과 본인 인증"
      data-clarity-mask="true"
    >
      {verifying ? (
        <>
          {trust.phase === "photo" && (
            <>
              <span className="trust-kicker">
                <PixelIcon name="lock" /> PROFILE TRUST
              </span>
              <h1 ref={heading} tabIndex={-1}>
                본인 확인을 위한
                <br />
                <em>정면 사진</em>을 골라주세요
              </h1>
              <p className="trust-subcopy">
                사진 속 얼굴과 카메라 속 얼굴을 비교해요.
              </p>
              <div className="trust-photo-intro">
                <GuidePortrait />
                <span>내 얼굴이 잘 보이는 사진 한 장</span>
              </div>
              <div className="trust-note">
                <strong>프로필 사진은 나중에 더할 수 있어요</strong>
                <p>
                  이 사진은 본인 확인에 사용하고, 인증 후 대표사진으로 등록돼요.
                  다른 사진은 자유롭게 추가할 수 있고, 대표사진을 바꿀 때는 다시
                  인증해요.
                </p>
              </div>
              <div className="trust-actions">
                <PhotoPicker
                  className="trust-primary-picker"
                  disabled={disabled}
                  onSelect={trust.selectPhoto}
                >
                  <PixelIcon name="plus" /> 정면 사진 선택하기
                </PhotoPicker>
                <PhotoPicker
                  capture="user"
                  disabled={disabled}
                  onSelect={trust.selectPhoto}
                >
                  카메라로 사진 촬영
                </PhotoPicker>
              </div>
              <small className="trust-formats">
                JPG · PNG · WEBP · HEIC / 최대 30MB
              </small>
              <CaptureGuide />
            </>
          )}
          {trust.phase === "camera" && (
            <>
              <span className="trust-kicker">
                <PixelIcon name="lock" /> CAMERA CHECK
              </span>
              <h1 ref={heading} tabIndex={-1}>
                카메라를 보고
                <br />
                <em>정면</em>을 바라봐주세요
              </h1>
              <p className="trust-subcopy">
                확인이 끝나면 카메라는 자동으로 꺼져요.
              </p>
              {!trust.active && (
                <PixelButton
                  onClick={() => void trust.start()}
                  disabled={disabled}
                >
                  카메라 켜고 인증하기
                </PixelButton>
              )}
              <div
                className={`trust-camera ${trust.cameraOn ? "is-live" : ""}`}
              >
                <video
                  ref={trust.videoRef}
                  autoPlay
                  playsInline
                  muted
                  aria-label="본인 인증 카메라 미리보기"
                />
                {!trust.cameraOn && (
                  <div className="trust-camera-placeholder">
                    <PixelIcon name="bust" scale={8} />
                    <span>
                      {trust.active
                        ? "카메라 인증을 준비하고 있어요"
                        : "카메라를 켜면 내 얼굴이 보여요"}
                    </span>
                  </div>
                )}
                <div className="trust-face-outline" aria-hidden="true" />
                {trust.cameraOn && (
                  <span className="trust-live">
                    <i /> 카메라 인증 중
                  </span>
                )}
                {trust.previewUrl && (
                  <img
                    className="trust-reference-photo"
                    src={trust.previewUrl}
                    alt="선택한 정면 사진"
                  />
                )}
              </div>
              <p className="trust-camera-hint" role="status">
                {trust.hint}
              </p>
              <p className="trust-privacy">
                <PixelIcon name="lock" /> 인증을 위해 짧은 영상을 전송해요.
                영상은 백엔드에 저장하지 않아요.
              </p>
              <CaptureGuide />
              <details className="trust-permission-help">
                <summary>카메라가 열리지 않나요?</summary>
                <p>
                  주소창의 사이트 설정에서 카메라를 허용해주세요. 앱 안에서
                  접속했다면 메뉴에서 Safari 또는 Chrome으로 열어주세요.
                </p>
              </details>
              <button
                type="button"
                className="trust-text-button"
                onClick={trust.reset}
                disabled={disabled}
              >
                다른 정면 사진 선택
              </button>
            </>
          )}
          {trust.phase === "failure" && (
            <>
              <span className="trust-kicker">
                <PixelIcon name="alert" /> CHECK AGAIN
              </span>
              <h1 ref={heading} tabIndex={-1}>
                {trust.issue?.title}
              </h1>
              <div className="trust-result-art">
                <img src={asset("shield.svg")} alt="" />
              </div>
              <p className="trust-failure-message" role="alert">
                {trust.issue?.message}
              </p>
              {trust.issue?.kind === "system" && (
                <p className="trust-subcopy">
                  일시적인 연결 문제일 수 있어요. 얼굴 인증 실패와는 달라요.
                </p>
              )}
              <div className="trust-actions">
                {trust.issue?.kind !== "photo" && (
                  <PixelButton onClick={trust.retry} disabled={disabled}>
                    {trust.issue?.kind === "system"
                      ? "다시 확인하기"
                      : "카메라 인증 다시 하기"}
                  </PixelButton>
                )}
                <PixelButton
                  secondary={trust.issue?.kind !== "photo"}
                  onClick={trust.reset}
                  disabled={disabled}
                >
                  정면 사진 다시 선택
                </PixelButton>
              </div>
              <CaptureGuide />
              <details className="trust-permission-help">
                <summary>카메라 권한 안내</summary>
                <p>
                  브라우저의 사이트 설정에서 카메라를 허용해주세요. 앱 안에서
                  카메라가 열리지 않으면 Safari 또는 Chrome에서 서비스 주소를
                  열어주세요.
                </p>
              </details>
            </>
          )}
          {trust.phase === "success" && (
            <>
              <span className="trust-kicker">
                <PixelIcon name="check" /> VERIFIED
              </span>
              <h1 ref={heading} tabIndex={-1}>
                본인 인증을
                <br />
                <em>마쳤어요!</em>
              </h1>
              <div className="trust-success-art">
                <AiAvatar size={120} />
                <img src={asset("verified-shield.svg")} alt="본인 인증 성공" />
              </div>
              <p className="trust-subcopy">이제 사진으로 나를 소개해볼까요?</p>
              <div className="trust-note">
                <strong>나를 보여줄 사진을 더해보세요</strong>
                <p>
                  인증한 사진은 대표사진으로 등록돼요. 추가 사진은 자유롭게
                  바꾸고 순서를 정할 수 있어요.
                </p>
              </div>
              <PixelButton onClick={acceptVerifiedPhoto} disabled={disabled}>
                프로필 사진 설정하기
              </PixelButton>
            </>
          )}
          {canCancel && (
            <button
              type="button"
              className="trust-text-button"
              onClick={() => {
                trust.reset();
                setVerifying(false);
              }}
              disabled={disabled}
            >
              대표사진 변경 취소
            </button>
          )}
        </>
      ) : (
        <>
          <span className="trust-kicker">
            <PixelIcon name="spark" /> MY PHOTOS
          </span>
          <h2>사진으로 나를 소개해주세요</h2>
          <p className="trust-subcopy">사진은 최대 6장까지 등록할 수 있어요.</p>
          <section className="trust-photo-grid" aria-label="프로필 사진 목록">
            {items.map((item, index) => (
              <article
                className="trust-photo-tile"
                key={item.localId}
                draggable={index > 0 && !disabled && !item.uploading}
                onDragStart={(event) => {
                  dragged.current = item.localId;
                  event.dataTransfer.setData("text/plain", item.localId);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragEnd={() => {
                  dragged.current = null;
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  movePhoto(
                    dragged.current || event.dataTransfer.getData("text/plain"),
                    item.localId,
                  );
                  dragged.current = null;
                }}
              >
                <img
                  src={item.previewUrl}
                  alt={
                    item.isFrontal ? "인증한 대표사진" : `추가 사진 ${index}`
                  }
                  draggable={false}
                />
                {item.isFrontal && (
                  <span className="trust-photo-badge">
                    <PixelIcon name="lock" /> 대표 · 정면
                  </span>
                )}
                {item.uploading && (
                  <span className="trust-uploading" role="status">
                    업로드 중
                  </span>
                )}
                {!item.isFrontal && (
                  <>
                    <button
                      type="button"
                      className="trust-photo-remove"
                      aria-label={`사진 ${index + 1} 삭제`}
                      disabled={disabled}
                      onClick={() => removePhoto(item.localId)}
                    >
                      ×
                    </button>
                    <div className="trust-photo-order">
                      <button
                        type="button"
                        aria-label={`사진 ${index + 1} 앞으로 이동`}
                        disabled={disabled || index <= 1}
                        onClick={() =>
                          movePhoto(item.localId, items[index - 1]?.localId)
                        }
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        aria-label={`사진 ${index + 1} 뒤로 이동`}
                        disabled={disabled || index === items.length - 1}
                        onClick={() =>
                          movePhoto(item.localId, items[index + 1]?.localId)
                        }
                      >
                        →
                      </button>
                    </div>
                  </>
                )}
              </article>
            ))}
            {items.length < 6 && (
              <PhotoPicker
                className="trust-photo-add"
                disabled={disabled}
                onSelect={(file) => void addPhoto(file)}
              >
                <PixelIcon name="plus" scale={4} />
                <span>사진 추가</span>
                <small>{items.length}/6</small>
              </PhotoPicker>
            )}
          </section>
          <div className="trust-note">
            <strong>대표사진은 첫 번째 자리에 고정돼요</strong>
            <p>
              추가 사진은 화살표 버튼이나 드래그로 순서를 바꿀 수 있어요. 정면
              사진 라벨은 인증한 사진에 유지돼요.
            </p>
          </div>
          <button
            type="button"
            className="trust-replace"
            onClick={beginReplacement}
            disabled={disabled}
          >
            대표사진 변경 · 본인 인증 다시 하기
          </button>
          <p className="trust-subcopy trust-small">
            새 사진의 인증을 마친 뒤 저장하면 대표사진이 바뀌어요.
          </p>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
