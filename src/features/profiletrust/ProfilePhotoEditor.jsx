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
import { reorderPhotos, replaceFrontalPhoto } from "./model.js";
import { PhotoCapture } from "./PhotoCapture.jsx";
import { useFaceVerification } from "./useFaceVerification.js";

const PHOTO_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

function PhotoPicker({ children, onSelect, disabled, className = "" }) {
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
        name="profilePhoto"
        accept={PHOTO_ACCEPT}
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
  const descriptions = {
    good: "밝은 곳에서 얼굴 전체가 정면으로 보이는 좋은 촬영 예시",
    side: "얼굴이 옆을 향한 피해야 할 촬영 예시",
    covered: "마스크로 얼굴이 가려진 피해야 할 촬영 예시",
  };
  return (
    <img
      src={asset(`profiletrust/guide-${variant}.jpg`)}
      alt={descriptions[variant]}
      width={640}
      height={640}
      loading="lazy"
    />
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
          <figcaption>옆모습은 피해 주세요</figcaption>
        </figure>
        <figure>
          <GuidePortrait variant="covered" />
          <figcaption>얼굴을 가리지 않기</figcaption>
        </figure>
      </div>
      <p>
        혼자 화면에 들어와 주세요. 모자·마스크·선글라스와 강한 필터는 피해
        주세요.
      </p>
    </details>
  );
}

function VerificationProgress({ progress, active }) {
  const { stage, attemptNo, completedAttempts, maxAttempts, clipProgress } =
    progress;
  const waiting = ["analyzing", "recovering", "finalizing"].includes(stage);
  const message =
    stage === "recording"
      ? `${attemptNo}/${maxAttempts}번째 얼굴 확인을 위해 촬영하고 있어요.`
      : stage === "analyzing"
        ? `${attemptNo}/${maxAttempts}번째 영상을 확인하고 있어요.`
        : stage === "recovering"
          ? "전달한 영상의 인증 결과를 다시 확인하고 있어요."
          : stage === "finalizing"
            ? "얼굴 인증을 마쳤어요. 사진을 저장하고 있어요."
            : stage === "preparing"
              ? "카메라 인증을 준비하고 있어요."
              : "얼굴을 점선 안에 맞추고 화면을 바라봐주세요.";
  return (
    <div className="trust-camera-guidance">
      <p role="status">{message}</p>
      <div
        className="trust-attempt-progress"
        role="progressbar"
        aria-label="얼굴 확인 진행 횟수"
        aria-valuemin={0}
        aria-valuemax={maxAttempts}
        aria-valuenow={completedAttempts}
        aria-valuetext={`${maxAttempts}회 중 ${completedAttempts}회 진행`}
      >
        {Array.from({ length: maxAttempts }, (_, index) => index + 1).map(
          (number) => (
            <span
              key={`attempt-${number}`}
              data-state={
                number <= completedAttempts
                  ? "done"
                  : active && number === attemptNo
                    ? "current"
                    : "pending"
              }
            />
          ),
        )}
      </div>
      <small>
        {completedAttempts}/{maxAttempts}회 진행
      </small>
      {stage === "recording" && (
        <>
          <div
            className="trust-camera-progress"
            role="progressbar"
            aria-label="현재 5초 촬영 진행"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(clipProgress * 100)}
          >
            <span style={{ transform: `scaleX(${clipProgress})` }} />
          </div>
          <small>이번 촬영은 약 5초 동안 진행돼요. 정면을 유지해 주세요.</small>
        </>
      )}
      {waiting && (
        <div className="trust-waiting">
          <span aria-hidden="true">…</span> 확인 중이에요. 잠시만 기다려 주세요…
        </div>
      )}
      <small>
        최대 {maxAttempts}회 확인하고, 인증에 성공하면 바로 끝나요. 전송과 분석
        시간은 연결 상태에 따라 달라질 수 있어요.
      </small>
    </div>
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
  const [verifying, setVerifying] = useState(requireVerification);
  const [error, setError] = useState("");
  const [takingPhoto, setTakingPhoto] = useState(false);
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
    updateItems((photos) =>
      replaceFrontalPhoto(photos, {
        localId: createPhotoId(),
        fileId: trust.result.fileId,
        previewUrl,
        isFrontal: true,
        uploading: false,
      }),
    );
    setError("");
    setVerifying(false);
  }

  function beginReplacement() {
    if (disabled) return;
    setTakingPhoto(false);
    trust.reset();
    setVerifying(true);
  }

  const hasFrontalPhoto = items.some((item) => item.isFrontal);
  const canCancel = !requireVerification;
  const verificationCancelLabel = hasFrontalPhoto
    ? "정면 사진 변경 취소"
    : "정면 사진 인증 취소";
  const frontalPhotoAction = hasFrontalPhoto
    ? "정면 사진 변경 · 본인 인증 다시 하기"
    : "정면 사진 등록 · 본인 인증하기";
  const frontalPhotoHelp = hasFrontalPhoto
    ? "정면 사진을 교체할 때만 사진 확인과 카메라 인증을 다시 진행해요. 순서만 바꿀 때는 다시 인증하지 않아요."
    : "사진을 저장하려면 정면 사진을 등록해야 해요. 선택한 정면 사진은 얼굴 인증을 마친 뒤 갤러리에 추가돼요.";
  return (
    <section
      className="profile-trust"
      data-trust-phase={verifying ? trust.phase : "photos"}
      aria-label="프로필 사진과 본인 인증"
      data-clarity-mask="true"
    >
      {verifying ? (
        <>
          {trust.phase === "photo" && !takingPhoto && (
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
                  이 사진은 본인 확인에 사용해요. 인증 후 사진을 추가하고 순서를
                  바꿔 대표사진을 정할 수 있어요. 정면 사진 자체를 교체할 때는
                  다시 인증해요.
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
                <button
                  type="button"
                  className="trust-picker"
                  disabled={disabled}
                  onClick={() => setTakingPhoto(true)}
                >
                  카메라로 사진 촬영
                </button>
              </div>
              <small className="trust-formats">
                JPG · PNG · WEBP · HEIC / 최대 30MB
              </small>
              <CaptureGuide />
            </>
          )}
          {trust.phase === "photo" && takingPhoto && (
            <PhotoCapture
              disabled={disabled}
              onCancel={() => setTakingPhoto(false)}
              onCapture={(file) => {
                setTakingPhoto(false);
                trust.selectPhoto(file);
              }}
            />
          )}
          {trust.phase === "checking" && (
            <>
              <span className="trust-kicker">
                <PixelIcon name="lock" /> PHOTO CHECK
              </span>
              <h1 ref={heading} tabIndex={-1}>
                선택한 사진을
                <br />
                <em>확인하고 있어요</em>
              </h1>
              {trust.previewUrl && (
                <img
                  className="trust-check-photo"
                  src={trust.previewUrl}
                  width="200"
                  height="240"
                  alt="확인 중인 정면 사진"
                />
              )}
              <p className="trust-subcopy" role="status">
                얼굴이 정면인지, 직접 촬영한 사진인지 확인하고 있어요. 확인을
                마치면 카메라 인증을 시작할 수 있어요.
              </p>
              <button
                type="button"
                className="trust-text-button"
                onClick={trust.reset}
                disabled={disabled}
              >
                취소하고 다른 사진 선택
              </button>
            </>
          )}
          {trust.phase === "camera" && (
            <>
              <span className="trust-kicker">
                <PixelIcon name="lock" /> CAMERA CHECK
              </span>
              <h1 ref={heading} tabIndex={-1}>
                {["analyzing", "recovering", "finalizing"].includes(
                  trust.progress.stage,
                ) ? (
                  "인증 결과를 확인하고 있어요"
                ) : (
                  <>
                    카메라를 보고
                    <br />
                    <em>정면</em>을 바라봐주세요
                  </>
                )}
              </h1>
              <VerificationProgress
                progress={trust.progress}
                active={trust.active}
              />
              {!trust.active && (
                <PixelButton
                  onClick={() => void trust.start()}
                  disabled={disabled}
                >
                  {trust.progress.attemptsUsed > 0
                    ? "카메라 켜고 이어서 인증하기"
                    : "카메라 켜고 인증하기"}
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
                      {trust.progress.stage === "finalizing"
                        ? "인증한 사진을 저장하고 있어요"
                        : ["analyzing", "recovering"].includes(
                              trust.progress.stage,
                            )
                          ? "인증 결과를 확인하고 있어요"
                          : trust.active
                            ? "카메라 인증을 준비하고 있어요"
                            : "카메라를 켜면 내 얼굴이 보여요"}
                    </span>
                  </div>
                )}
                {trust.cameraOn && (
                  <div className="trust-face-outline" aria-hidden="true" />
                )}
                {trust.cameraOn && (
                  <span className="trust-live">
                    <i />{" "}
                    {trust.progress.stage === "recording"
                      ? "정면 얼굴 촬영 중"
                      : "촬영 영상 확인 중"}
                  </span>
                )}
                {trust.previewUrl && (
                  <img
                    className="trust-reference-photo"
                    src={trust.previewUrl}
                    width="52"
                    height="64"
                    alt="선택한 정면 사진"
                  />
                )}
              </div>
              <p className="trust-camera-hint" role="status">
                {["analyzing", "recovering", "finalizing"].includes(
                  trust.progress.stage,
                )
                  ? trust.cameraOn
                    ? "촬영한 영상을 확인하고 있어요. 다음 촬영을 위해 정면을 유지해 주세요."
                    : "카메라를 껐어요. 결과 확인이 끝날 때까지 기다려 주세요."
                  : trust.hint}
              </p>
              <p className="trust-privacy">
                <PixelIcon name="lock" /> 인증을 위해 짧은 영상을 전송해요.
                영상은 백엔드에 저장하지 않아요.
              </p>
              <CaptureGuide />
              <details className="trust-permission-help">
                <summary>카메라가 열리지 않나요?</summary>
                <p>
                  주소창의 사이트 설정에서 카메라를 허용해 주세요. 앱 안에서
                  접속했다면 메뉴에서 Safari 또는 Chrome으로 열어 주세요.
                </p>
              </details>
              <button
                type="button"
                className="trust-text-button"
                onClick={trust.reset}
                disabled={disabled}
              >
                {trust.active
                  ? "인증 중단 · 다른 정면 사진 선택"
                  : "다른 정면 사진 선택"}
              </button>
            </>
          )}
          {trust.phase === "failure" && (
            <>
              <span className="trust-kicker">
                <PixelIcon name="alert" />{" "}
                {trust.issue?.kind === "photo"
                  ? "PHOTO CHECK"
                  : trust.issue?.kind === "camera"
                    ? "CAMERA CHECK"
                    : "CONNECTION CHECK"}
              </span>
              <h1 ref={heading} tabIndex={-1}>
                {trust.issue?.title}
              </h1>
              <div className="trust-result-art">
                <PixelIcon name="alert" scale={12} />
              </div>
              <p className="trust-failure-message" role="alert">
                {trust.issue?.message}
              </p>
              {trust.issue?.kind === "system" && (
                <p className="trust-subcopy">
                  {trust.issue.notice ||
                    "서비스 또는 연결 상태를 확인해야 해요. 이 오류만으로 사진이나 얼굴의 일치 여부를 판단하지 않아요."}
                </p>
              )}
              <div className="trust-actions">
                <PixelButton
                  onClick={
                    trust.issue?.action === "replace"
                      ? trust.reset
                      : trust.retry
                  }
                  disabled={disabled}
                >
                  {trust.issue?.actionLabel || "다시 시도하기"}
                </PixelButton>
                {trust.issue?.action !== "replace" && (
                  <PixelButton
                    secondary
                    onClick={trust.reset}
                    disabled={disabled}
                  >
                    정면 사진 다시 선택
                  </PixelButton>
                )}
              </div>
              {trust.issue?.details?.length > 0 && (
                <details className="trust-failure-details">
                  <summary>
                    {trust.issue.kind === "system"
                      ? "이전 촬영에서 확인한 사항"
                      : "함께 확인할 사항"}{" "}
                    {trust.issue.details.length}개
                  </summary>
                  <ul>
                    {trust.issue.details.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </details>
              )}
              {trust.issue?.kind !== "system" && <CaptureGuide />}
              {trust.issue?.kind === "camera" && (
                <details className="trust-permission-help">
                  <summary>카메라 권한 안내</summary>
                  <p>
                    브라우저의 사이트 설정에서 카메라를 허용해 주세요. 앱 안에서
                    카메라가 열리지 않으면 Safari 또는 Chrome에서 서비스 주소를
                    열어 주세요.
                  </p>
                </details>
              )}
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
                <img
                  src={asset("verified-shield.svg")}
                  width="42"
                  height="42"
                  alt="본인 인증 성공"
                />
              </div>
              <p className="trust-subcopy">이제 사진으로 나를 소개해볼까요?</p>
              <div className="trust-note">
                <strong>나를 보여줄 사진을 더해보세요</strong>
                <p>
                  인증한 사진에는 정면 사진 표시가 붙어요. 사진 순서를 바꿔 추천
                  피드에 보여줄 대표사진을 정할 수 있어요.
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
                setTakingPhoto(false);
                trust.reset();
                setVerifying(false);
              }}
              disabled={disabled}
            >
              {verificationCancelLabel}
            </button>
          )}
        </>
      ) : (
        <>
          <span className="trust-kicker">
            <PixelIcon name="spark" /> MY PHOTOS
          </span>
          <h2>사진으로 나를 소개해 주세요</h2>
          <p className="trust-subcopy">사진은 최대 6장까지 등록할 수 있어요.</p>
          <section className="trust-photo-grid" aria-label="프로필 사진 목록">
            {items.map((item, index) => (
              <article
                className="trust-photo-tile"
                key={item.localId}
                draggable={!disabled && !item.uploading}
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
                  width="300"
                  height="400"
                  loading="lazy"
                  alt={`${index === 0 ? "대표사진" : `프로필 사진 ${index + 1}`}${item.isFrontal ? " · 인증한 정면 사진" : ""}`}
                  draggable={false}
                />
                <div className="trust-photo-badges">
                  {index === 0 && (
                    <span className="trust-photo-badge">대표사진</span>
                  )}
                  {item.isFrontal && (
                    <span className="trust-photo-badge">
                      <PixelIcon name="lock" /> 정면 사진
                    </span>
                  )}
                </div>
                {item.uploading && (
                  <span className="trust-uploading" role="status">
                    업로드 중…
                  </span>
                )}
                {!item.isFrontal && (
                  <button
                    type="button"
                    className="trust-photo-remove"
                    aria-label={`사진 ${index + 1} 삭제`}
                    disabled={disabled}
                    onClick={() => removePhoto(item.localId)}
                  >
                    ×
                  </button>
                )}
                <div className="trust-photo-order">
                  <button
                    type="button"
                    aria-label={`사진 ${index + 1} 앞으로 이동`}
                    disabled={disabled || item.uploading || index === 0}
                    onClick={() =>
                      movePhoto(item.localId, items[index - 1]?.localId)
                    }
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    aria-label={`사진 ${index + 1} 뒤로 이동`}
                    disabled={
                      disabled || item.uploading || index === items.length - 1
                    }
                    onClick={() =>
                      movePhoto(item.localId, items[index + 1]?.localId)
                    }
                  >
                    →
                  </button>
                </div>
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
            <strong>첫 번째 사진이 추천 피드에 노출돼요</strong>
            <p>
              화살표 버튼이나 드래그로 대표사진과 사진 순서를 정해 주세요. 정면
              사진도 이동할 수 있고, 인증 표시는 그대로 유지돼요.
            </p>
          </div>
          <button
            type="button"
            className="trust-replace"
            onClick={beginReplacement}
            disabled={disabled}
          >
            {frontalPhotoAction}
          </button>
          <p className="trust-subcopy trust-small">{frontalPhotoHelp}</p>
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
