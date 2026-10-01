import { useEffect, useRef, useState } from "react";
import { useAppState } from "../../shared/appState.jsx";
import { asset } from "../../shared/assets.js";
import {
  BrandHeader,
  ChoiceGroup,
  Field,
  Icon,
  PersonAvatar,
  PixelButton,
  ScreenHeader,
} from "../../shared/ui/components.jsx";
import { dateAge } from "../../shared/utils.js";
import { ActivityRegionPicker } from "../activity-region/ActivityRegionPicker.jsx";
import {
  getMyProfile,
  profile as saveProfile,
  profileImages as saveProfileImages,
  uploadProfileImage,
} from "./api.js";
import {
  bodyTypes,
  drinkings,
  educationLevels,
  religions,
  smokings,
} from "./data.js";
import {
  createPhotoId,
  prepareProfilePhoto,
  profilePhotoErrorMessage,
} from "./photoUpload.js";
import { profilePayload } from "./serialize.js";

function profilePhotoItems(serverProfile) {
  return (Array.isArray(serverProfile?.images) ? serverProfile.images : [])
    .slice()
    .sort(
      (first, second) =>
        Number(first?.displayOrder || 0) - Number(second?.displayOrder || 0),
    )
    .filter(
      (image) =>
        image?.fileId != null &&
        typeof image?.imageUrl === "string" &&
        image.imageUrl,
    )
    .map((image) => ({
      localId: `saved-${image.fileId}`,
      previewUrl: image.imageUrl,
      fileId: image.fileId,
      isFrontal: image.isFrontal === true,
      uploading: false,
    }));
}

export function MyPage({ navigate, toast }) {
  const { data } = useAppState();
  const [serverProfile, setServerProfile] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getMyProfile()
      .then((profile) => {
        if (!active) return;
        if (profile) setServerProfile(profile);
        else setProfileLoadFailed(true);
      })
      .catch(() => {
        if (active) setProfileLoadFailed(true);
      })
      .finally(() => {
        if (active) setIsProfileLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const profile = serverProfile
    ? {
        ...data.profile,
        nickname: serverProfile.nickname || "",
        birthDate: serverProfile.birthDate || "",
        regionName: serverProfile.activityRegionName || "",
        photo: serverProfile.profileImageUrl || "",
      }
    : data.profile;
  const age = dateAge(profile.birthDate);
  return (
    <>
      <BrandHeader navigate={navigate} className="my-topbar">
        <div className="my-header-actions">
          <button
            type="button"
            aria-disabled="true"
            onClick={() => toast("알림 기능은 준비 중이에요.")}
            aria-label="알림"
          >
            <Icon name="bell.svg" />
            {data.notifications.some((item) => !item.read) && <i />}
          </button>
        </div>
      </BrandHeader>
      <main className="main-scroll my-main">
        <div
          className={`my-identity${isProfileLoading ? " my-identity-loading" : ""}`}
        >
          <button
            type="button"
            className="my-settings-button"
            onClick={() => navigate("/settings")}
            aria-label="설정"
          >
            <span aria-hidden="true">⚙︎</span>
          </button>
          {isProfileLoading ? (
            <div
              className="my-identity-loading-content"
              role="status"
              aria-label="프로필 불러오는 중"
              aria-busy="true"
            >
              <span className="my-profile-skeleton-avatar" aria-hidden="true" />
              <div className="my-identity-copy" aria-hidden="true">
                <span className="my-profile-skeleton my-profile-skeleton-kicker" />
                <span className="my-profile-skeleton my-profile-skeleton-name" />
                <span className="my-profile-skeleton my-profile-skeleton-age" />
                <span className="my-profile-skeleton my-profile-skeleton-region" />
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="my-profile-avatar-button"
                aria-label="내 프로필 상세 보기"
                onClick={() => navigate("/my/profile/view")}
              >
                <PersonAvatar
                  person={{ photo: profile.photo || asset("user-avatar.png") }}
                  size="large"
                />
              </button>
              <div className="my-identity-copy">
                <span className="my-profile-kicker">MY PLAYER CARD</span>
                <h1>{profile.nickname || "닉네임 미등록"}</h1>
                <p className="my-profile-age">
                  {age > 0 ? `${age}세` : "나이 정보 없음"}
                </p>
                <p className="my-profile-region">
                  <Icon name="detail-location.svg" />
                  {profile.regionName || "활동 지역 미설정"}
                </p>
              </div>
            </>
          )}
        </div>
        {profileLoadFailed && (
          <p className="my-profile-message" role="status">
            최신 프로필을 불러오지 못해 저장된 정보를 표시하고 있어요.
          </p>
        )}
        <div className="my-menu">
          <button type="button" onClick={() => navigate("/my/persona")}>
            <Icon name="ai-avatar.svg" />내 페르소나 <span>활성　›</span>
          </button>
          <button
            type="button"
            aria-disabled="true"
            onClick={() => toast("알림 기능은 준비 중이에요.")}
          >
            <Icon name="bell.svg" />
            알림{" "}
            <span>
              {data.notifications.filter((item) => !item.read).length || ""}　›
            </span>
          </button>
          <button
            type="button"
            aria-disabled="true"
            onClick={() => toast("선호 설정은 준비 중이에요.")}
          >
            <span className="menu-glyph">⚙</span>선호 설정 <span>›</span>
          </button>
        </div>
        <p className="my-footer">*23# · LITTLE PIXELS, REAL CONNECTIONS.</p>
      </main>
    </>
  );
}

export function Settings({ navigate, onLogout, isLoggingOut = false }) {
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  return (
    <>
      <BrandHeader navigate={navigate} />
      <ScreenHeader
        className="chat-room-header"
        title="설정"
        onBack={() => navigate("/my")}
      />
      <main className="main-scroll settings-main">
        <div className="settings-intro">
          <span className="settings-kicker">내 설정 노트</span>
          <h1>계정 설정</h1>
          <p>프로필과 로그인 상태를 관리해요.</p>
        </div>
        <section className="settings-action-list" aria-label="계정 설정">
          <button
            type="button"
            className="settings-action"
            onClick={() => navigate("/my/profile")}
          >
            <span
              className="settings-action-icon profile-action-icon"
              aria-hidden="true"
            >
              ✎
            </span>
            <span className="settings-action-copy">
              <strong>프로필 수정</strong>
              <small>닉네임과 활동 정보를 관리해요.</small>
            </span>
            <span className="settings-action-chevron" aria-hidden="true">
              ›
            </span>
          </button>

          {!confirmingLogout ? (
            <button
              type="button"
              className="settings-action settings-logout"
              onClick={() => setConfirmingLogout(true)}
            >
              <span
                className="settings-action-icon logout-action-icon"
                aria-hidden="true"
              >
                ↗
              </span>
              <span className="settings-action-copy">
                <strong>로그아웃</strong>
                <small>계정에서 안전하게 나가요.</small>
              </span>
              <span className="settings-action-chevron" aria-hidden="true">
                ›
              </span>
            </button>
          ) : (
            <fieldset
              className="settings-logout-confirm"
              aria-label="로그아웃 확인"
            >
              <legend>정말 로그아웃할까요?</legend>
              <p>다음에 다시 로그인할 수 있어요.</p>
              <div className="settings-confirm-actions">
                <button
                  type="button"
                  className="settings-confirm-cancel"
                  onClick={() => setConfirmingLogout(false)}
                  disabled={isLoggingOut}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="settings-confirm-submit"
                  onClick={onLogout}
                  disabled={isLoggingOut}
                >
                  {isLoggingOut ? "로그아웃 중…" : "로그아웃"}
                </button>
              </div>
            </fieldset>
          )}
        </section>
      </main>
    </>
  );
}

export function MyProfile({ navigate, toast, returnTo = "/settings" }) {
  const { data, setData } = useAppState();
  const profile = data.profile;
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  const [photoItems, setPhotoItems] = useState([]);
  const [existingProfilePhoto, setExistingProfilePhoto] = useState("");
  const [isReplacingPhotos, setIsReplacingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [photoSaving, setPhotoSaving] = useState(false);
  const draggedPhotoId = useRef(null);
  const localPhotoUrls = useRef(new Set());
  const removedPhotoIds = useRef(new Set());
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const url of localPhotoUrls.current) URL.revokeObjectURL(url);
      localPhotoUrls.current.clear();
    };
  }, []);

  useEffect(() => {
    let active = true;
    setIsLoadingProfile(true);
    setProfileLoadFailed(false);

    getMyProfile()
      .then((serverProfile) => {
        if (!active) return;
        const savedPhotos = profilePhotoItems(serverProfile);
        setPhotoItems(savedPhotos);
        setExistingProfilePhoto(
          savedPhotos.length ? "" : serverProfile.profileImageUrl || "",
        );
        setIsReplacingPhotos(
          savedPhotos.length > 0 || !serverProfile.profileImageUrl,
        );
        setData((old) => ({
          ...old,
          profile: {
            ...old.profile,
            nickname: serverProfile.nickname ?? "",
            birthDate: serverProfile.birthDate ?? old.profile.birthDate,
            activityRegionId: serverProfile.activityRegionId ?? null,
            regionName: serverProfile.activityRegionName ?? "",
            height:
              serverProfile.height == null ? "" : String(serverProfile.height),
            bodyType: serverProfile.bodyType ?? "",
            educationLevel: serverProfile.educationLevel ?? "",
            job: serverProfile.job ?? "",
            religion: serverProfile.religion ?? "",
            drinking: serverProfile.drinking ?? "",
            smoking: serverProfile.smoking ?? "",
            mbti: serverProfile.mbti ?? "",
            photo: serverProfile.profileImageUrl ?? "",
          },
        }));
      })
      .catch(() => {
        if (active) setProfileLoadFailed(true);
      })
      .finally(() => {
        if (active) setIsLoadingProfile(false);
      });

    return () => {
      active = false;
    };
  }, [setData]);

  const set = (key, value) =>
    setData((old) => ({ ...old, profile: { ...old.profile, [key]: value } }));

  function addPhotoItem(file, isFrontal) {
    if (!file || photoSaving) return;
    if (photoItems.length >= 6) {
      setPhotoError("사진은 최대 6장까지 등록할 수 있어요.");
      return;
    }

    const localId = createPhotoId();
    const previewUrl = URL.createObjectURL(file);
    localPhotoUrls.current.add(previewUrl);
    setPhotoItems((current) => [
      ...current,
      { localId, previewUrl, fileId: null, isFrontal, uploading: true },
    ]);
    setPhotoError("");

    const upload = async () => {
      let currentPreview = previewUrl;
      try {
        const prepared = await prepareProfilePhoto(file);
        if (!mounted.current || removedPhotoIds.current.has(localId)) return;
        const convertedPreview = URL.createObjectURL(prepared);
        currentPreview = convertedPreview;
        localPhotoUrls.current.add(convertedPreview);
        URL.revokeObjectURL(previewUrl);
        localPhotoUrls.current.delete(previewUrl);
        setPhotoItems((current) =>
          current.map((item) =>
            item.localId === localId
              ? { ...item, previewUrl: convertedPreview }
              : item,
          ),
        );
        const metadata = await uploadProfileImage(prepared);
        if (!mounted.current || removedPhotoIds.current.has(localId)) return;
        setPhotoItems((current) =>
          current.map((item) =>
            item.localId === localId
              ? { ...item, fileId: metadata.fileId, uploading: false }
              : item,
          ),
        );
      } catch (error) {
        URL.revokeObjectURL(currentPreview);
        localPhotoUrls.current.delete(currentPreview);
        if (!mounted.current || removedPhotoIds.current.has(localId)) return;
        setPhotoItems((current) =>
          current.filter((item) => item.localId !== localId),
        );
        setPhotoError(profilePhotoErrorMessage(error));
      }
    };
    void upload();
  }

  function reorderPhotos(sourceId, targetId) {
    if (photoSaving || !sourceId || sourceId === targetId) return;
    setPhotoItems((current) => {
      const sourceIndex = current.findIndex(
        (item) => item.localId === sourceId,
      );
      const targetIndex = current.findIndex(
        (item) => item.localId === targetId,
      );
      if (sourceIndex < 0 || targetIndex < 0) return current;

      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      const targetIndexAfterRemoval = next.findIndex(
        (item) => item.localId === targetId,
      );
      const insertIndex =
        targetIndexAfterRemoval + (sourceIndex < targetIndex ? 1 : 0);
      next.splice(insertIndex, 0, moved);
      return next;
    });
  }

  function removePhoto(localId) {
    if (photoSaving) return;
    removedPhotoIds.current.add(localId);
    setPhotoItems((current) => {
      const item = current.find((photo) => photo.localId === localId);
      if (item?.previewUrl && localPhotoUrls.current.has(item.previewUrl)) {
        URL.revokeObjectURL(item.previewUrl);
        localPhotoUrls.current.delete(item.previewUrl);
      }
      return current.filter((photo) => photo.localId !== localId);
    });
    setPhotoError("");
  }

  async function save() {
    if (!profile.activityRegionId) {
      toast("검색 결과에서 활동 지역을 선택해주세요.");
      return;
    }
    if (isReplacingPhotos && !photoItems.length) {
      setPhotoError("프로필 사진을 한 장 이상 등록해주세요.");
      return;
    }
    if (
      isReplacingPhotos &&
      !photoItems.some((item) => item.isFrontal && item.fileId)
    ) {
      setPhotoError("정면 사진을 등록해주세요.");
      return;
    }
    if (
      isReplacingPhotos &&
      photoItems.some((item) => item.uploading || !item.fileId)
    ) {
      setPhotoError("사진 업로드가 끝난 뒤 저장해주세요.");
      return;
    }
    if (photoSaving) return;

    setPhotoSaving(true);
    setPhotoError("");
    try {
      await saveProfile(profilePayload(profile));
      if (isReplacingPhotos) {
        await saveProfileImages(
          photoItems.map((item) => ({
            fileId: item.fileId,
            isFrontal: item.isFrontal,
          })),
        );
      }
    } catch (e) {
      toast(e.code || "프로필을 저장하지 못했어요.");
      setPhotoSaving(false);
      return;
    }
    const refreshedProfile = await getMyProfile().catch(() => null);
    setData((old) => ({
      ...old,
      profile: {
        ...old.profile,
        photo: refreshedProfile?.profileImageUrl || old.profile.photo,
      },
    }));
    toast("프로필을 저장했어요.");
    navigate(returnTo);
  }
  return (
    <>
      <BrandHeader navigate={navigate} />
      <ScreenHeader
        className="chat-room-header"
        title="프로필 수정"
        onBack={() => navigate(returnTo)}
      />
      <main
        className="main-scroll edit-main"
        aria-busy={isLoadingProfile || photoSaving}
      >
        {isLoadingProfile ? (
          <p className="profile-load-state" role="status">
            저장된 프로필을 불러오는 중이에요.
          </p>
        ) : profileLoadFailed ? (
          <div className="profile-load-error" role="alert">
            <p>
              프로필을 불러오지 못했어요. 이전 화면으로 돌아갔다가 다시
              시도해주세요.
            </p>
          </div>
        ) : (
          <>
            <section
              className="edit-photo-section"
              aria-labelledby="edit-photo-title"
            >
              <div className="edit-photo-heading">
                <strong className="edit-photo-title" id="edit-photo-title">
                  프로필 사진
                </strong>
                <span>
                  {isReplacingPhotos ? `${photoItems.length}/6` : "기존 사진"}
                </span>
              </div>
              {!isReplacingPhotos && existingProfilePhoto ? (
                <>
                  <p>
                    저장된 대표 사진이에요. 다른 프로필 정보를 저장해도 기존
                    사진은 유지돼요.
                  </p>
                  <div className="onboarding-photo-grid edit-photo-grid">
                    <article className="onboarding-photo-tile edit-photo-current">
                      <img src={existingProfilePhoto} alt="저장된 대표 사진" />
                      <b>기존 사진</b>
                    </article>
                  </div>
                  <div className="info-panel edit-photo-help">
                    사진을 바꾸면 기존 사진 전체가 새 사진으로 교체돼요.
                  </div>
                  <button
                    type="button"
                    className="edit-photo-replace-button"
                    onClick={() => {
                      setIsReplacingPhotos(true);
                      setPhotoError("");
                    }}
                  >
                    사진 전체 교체
                  </button>
                </>
              ) : (
                <>
                  <p>정면 사진이 대표 사진으로 표시돼요.</p>
                  {existingProfilePhoto && (
                    <button
                      type="button"
                      className="edit-photo-replace-button"
                      onClick={() => {
                        for (const item of photoItems) {
                          removedPhotoIds.current.add(item.localId);
                          if (localPhotoUrls.current.has(item.previewUrl)) {
                            URL.revokeObjectURL(item.previewUrl);
                            localPhotoUrls.current.delete(item.previewUrl);
                          }
                        }
                        setPhotoItems([]);
                        setIsReplacingPhotos(false);
                        setPhotoError("");
                      }}
                    >
                      사진 교체 취소
                    </button>
                  )}
                  {!photoItems.some((item) => item.isFrontal) && (
                    <label className="photo-front-upload edit-photo-front-upload">
                      <strong>정면 사진 등록</strong>
                      <span>얼굴이 잘 보이는 정면 사진을 선택해주세요.</span>
                      <small>JPG · PNG · WEBP · HEIC</small>
                      <input
                        type="file"
                        disabled={photoSaving}
                        accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif"
                        onChange={(event) => {
                          addPhotoItem(event.target.files?.[0], true);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  )}
                  <section
                    className="onboarding-photo-grid edit-photo-grid"
                    aria-label="등록한 사진"
                  >
                    {photoItems.map((item) => (
                      <article
                        className="onboarding-photo-tile"
                        data-photo-id={item.localId}
                        draggable={!item.uploading && !photoSaving}
                        key={item.localId}
                        onDragStart={(event) => {
                          draggedPhotoId.current = item.localId;
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(
                            "text/plain",
                            item.localId,
                          );
                        }}
                        onDragEnd={() => {
                          draggedPhotoId.current = null;
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          const sourceId =
                            draggedPhotoId.current ||
                            event.dataTransfer.getData("text/plain");
                          reorderPhotos(sourceId, item.localId);
                          draggedPhotoId.current = null;
                        }}
                        onPointerDown={(event) => {
                          if (
                            event.pointerType === "mouse" ||
                            photoSaving ||
                            item.uploading ||
                            event.target.closest("button")
                          )
                            return;
                          draggedPhotoId.current = item.localId;
                          event.currentTarget.setPointerCapture(
                            event.pointerId,
                          );
                        }}
                        onPointerUp={(event) => {
                          if (event.pointerType === "mouse") return;
                          const target = document
                            .elementFromPoint(event.clientX, event.clientY)
                            ?.closest("[data-photo-id]");
                          reorderPhotos(
                            draggedPhotoId.current,
                            target?.dataset.photoId,
                          );
                          draggedPhotoId.current = null;
                          if (
                            event.currentTarget.hasPointerCapture(
                              event.pointerId,
                            )
                          )
                            event.currentTarget.releasePointerCapture(
                              event.pointerId,
                            );
                        }}
                        onPointerCancel={() => {
                          draggedPhotoId.current = null;
                        }}
                      >
                        <img src={item.previewUrl} alt="등록한 프로필 사진" />
                        <div className="profile-photo-labels">
                          {item.isFrontal && <b>대표 · 정면 사진</b>}
                        </div>
                        {item.uploading && (
                          <span className="photo-uploading">업로드 중</span>
                        )}
                        <button
                          type="button"
                          disabled={photoSaving}
                          onClick={() => removePhoto(item.localId)}
                          aria-label="사진 삭제"
                        >
                          ×
                        </button>
                      </article>
                    ))}
                    {photoItems.length < 6 &&
                      photoItems.some((item) => item.isFrontal) && (
                        <label className="onboarding-photo-add">
                          <span>＋</span>
                          <small>추가 사진</small>
                          <input
                            type="file"
                            disabled={photoSaving}
                            accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif"
                            onChange={(event) => {
                              addPhotoItem(event.target.files?.[0], false);
                              event.target.value = "";
                            }}
                          />
                        </label>
                      )}
                  </section>
                  <div className="info-panel edit-photo-help">
                    사진을 드래그하면 순서를 바꿀 수 있어요. 정면 사진 라벨은
                    순서를 바꿔도 해당 사진에 유지돼요.
                  </div>
                </>
              )}
              {photoError && (
                <p className="field-error edit-photo-error" role="alert">
                  {photoError}
                </p>
              )}
            </section>
            <Field label="닉네임">
              <input value={profile.nickname} disabled />
            </Field>
            <ActivityRegionPicker
              selectedId={profile.activityRegionId}
              selectedName={profile.regionName}
              disabled={photoSaving}
              onSelect={(region) =>
                setData((old) => ({
                  ...old,
                  profile: { ...old.profile, ...region },
                }))
              }
            />
            <Field label="키 (cm)">
              <input
                type="number"
                value={profile.height}
                onChange={(e) => set("height", e.target.value)}
                min="130"
                max="220"
              />
            </Field>
            <Field label="체형">
              <ChoiceGroup
                options={bodyTypes}
                value={profile.bodyType}
                onChange={(v) => set("bodyType", v)}
              />
            </Field>
            <Field label="학력">
              <ChoiceGroup
                options={educationLevels}
                value={profile.educationLevel}
                onChange={(v) => set("educationLevel", v)}
              />
            </Field>
            <Field label="직업">
              <input
                value={profile.job}
                onChange={(e) => set("job", e.target.value)}
                maxLength={50}
              />
            </Field>
            <Field label="종교">
              <ChoiceGroup
                options={religions}
                value={profile.religion}
                onChange={(v) => set("religion", v)}
              />
            </Field>
            <Field label="음주">
              <ChoiceGroup
                options={drinkings}
                value={profile.drinking}
                onChange={(v) => set("drinking", v)}
              />
            </Field>
            <Field label="흡연">
              <ChoiceGroup
                options={smokings}
                value={profile.smoking}
                onChange={(v) => set("smoking", v)}
              />
            </Field>
            <div className="edit-actions">
              <PixelButton onClick={save} disabled={photoSaving}>
                {photoSaving ? "저장 중…" : "저장하기"}
              </PixelButton>
            </div>
          </>
        )}
      </main>
    </>
  );
}

export function Persona({ navigate }) {
  return (
    <>
      <ScreenHeader title="내 페르소나" onBack={() => navigate("/my")} />
      <main className="main-scroll persona-main">
        <div className="persona-hero">
          <Icon name="ai-avatar.svg" />
          <h1>나를 닮은 AI가 준비됐어요</h1>
          <p>
            가치관 문답을 바탕으로 상대와의 AI 연습대화와 시뮬레이션에 참여해요.
          </p>
        </div>
        <h2>나의 성향</h2>
        {[
          ["관계 속도", "천천히 가까워지는 편"],
          ["갈등 대응", "차분히 이야기하는 편"],
          ["여가 성향", "함께하는 시간도, 혼자만의 시간도 소중해요"],
          ["연락 빈도", "필요할 때 충분히 소통해요"],
        ].map(([label, value]) => (
          <div className="persona-trait" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
        <small>온보딩에서 확정한 가치관이 반영되어 있어요.</small>
      </main>
    </>
  );
}
