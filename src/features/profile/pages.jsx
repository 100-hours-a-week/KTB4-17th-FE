import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { useAppState } from "../../shared/appState.jsx";
import { asset } from "../../shared/assets.js";
import {
  BrandHeader,
  BugReportLink,
  ChoiceGroup,
  EmptyState,
  Field,
  PersonAvatar,
  PixelButton,
  ScreenHeader,
} from "../../shared/ui/components.jsx";
import { AiAvatar, PixelIcon } from "../../shared/ui/pixel.jsx";
import { dateAge } from "../../shared/utils.js";
import { ActivityRegionPicker } from "../activity-region/ActivityRegionPicker.jsx";
import { useNotifications } from "../notifications/context.jsx";
import { notificationBadge } from "../notifications/model.js";
import { PagerIcon } from "../notifications/NotificationControls.jsx";
import { getMyPersona } from "../persona/api.js";
import { hasPersonaContent, PERSONA_AREAS } from "../persona/model.js";
import { PersonaConversationStyle } from "../persona/PersonaConversationStyle.jsx";
import { savedPhotoItems } from "../profiletrust/model.js";
import { ProfilePhotoEditor } from "../profiletrust/ProfilePhotoEditor.jsx";
import { nickname as checkNicknameAvailability } from "../user/api.js";
import {
  getMyProfile,
  profile as saveProfile,
  profileImages as saveProfileImages,
} from "./api.js";
import {
  bodyTypes,
  drinkings,
  educationLevels,
  religions,
  smokings,
} from "./data.js";
import { profileSecurityFilterErrorMessage } from "./errors.js";
import { JobCategorySelect } from "./JobCategorySelect.jsx";
import { isJobCategory, normalizeJobCategory } from "./jobCategories.js";
import { profilePayload } from "./serialize.js";
import {
  PROFILE_HEIGHT_VALIDATION_ERROR,
  profileHeightValidationError,
  profileNicknameValidationError,
} from "./validation.js";

const PROFILE_SAVE_ERROR =
  "프로필을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
const PROFILE_AI_ERROR_CODES = new Set([
  "PROFILE_NOT_FOUND",
  "PROFILE_NICKNAME_REQUIRED",
  "PROFILE_MBTI_REQUIRED",
  "SESSION_NOT_FOUND",
  "PERSONA_DRAFT_NOT_FOUND",
  "NO_PENDING_QUESTION",
  "REQUEST_IN_PROGRESS",
  "TURN_MISMATCH",
  "ACTION_NOT_ALLOWED",
  "ONBOARDING_NOT_FINISHED",
  "PERSONA_ALREADY_CONFIRMED",
  "PERSONA_CONFIRMATION_CONFLICT",
  "AI_REQUEST_REJECTED",
  "AI_SERVER_NOT_CONFIGURED",
  "AI_SERVER_UNAVAILABLE",
  "AI_SERVER_RESPONSE_INVALID",
]);

function samePhotoItems(left = [], right = []) {
  return (
    left.length === right.length &&
    left.every(
      (item, index) =>
        item.fileId === right[index]?.fileId &&
        Boolean(item.isFrontal) === Boolean(right[index]?.isFrontal),
    )
  );
}

function profileSaveErrorMessage(error) {
  if (PROFILE_AI_ERROR_CODES.has(error?.code)) return PROFILE_SAVE_ERROR;
  if (error?.code === "INVALID_REQUEST")
    return "입력한 프로필 정보를 다시 확인해 주세요.";
  const securityFilterMessage = profileSecurityFilterErrorMessage(error);
  if (securityFilterMessage) return securityFilterMessage;
  return apiErrorMessage(error, PROFILE_SAVE_ERROR);
}

export function MyPage({ navigate }) {
  const { data } = useAppState();
  const notifications = useNotifications();
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
      <BrandHeader navigate={navigate} className="my-topbar" />
      <main id="main-content" tabIndex={-1} className="main-scroll my-main">
        <div
          className={`my-identity${isProfileLoading ? " my-identity-loading" : ""}`}
        >
          <button
            type="button"
            className="my-settings-button"
            onClick={() => navigate("/settings")}
            aria-label="설정"
          >
            <span aria-hidden="true">
              <PixelIcon name="gear" scale={2} />
            </span>
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
                  person={{
                    id: "me",
                    photo: profile.photo || asset("user-avatar.png"),
                  }}
                  size="large"
                />
              </button>
              <div className="my-identity-copy">
                <span className="my-profile-kicker">나의 프로필</span>
                <h1>{profile.nickname || "닉네임 미등록"}</h1>
                <p className="my-profile-age">
                  {age > 0 ? `${age}세` : "나이 정보 없음"}
                </p>
                <p className="my-profile-region">
                  <PixelIcon name="pin" scale={2} />
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
          <button type="button" onClick={() => navigate("/my/questions")}>
            <PixelIcon
              name="chat"
              scale={3}
              colors={{ X: "var(--purple-deep)", p: "var(--pink)" }}
            />
            질문에 답하기
            <span>
              <PixelIcon name="chev" scale={1.5} />
            </span>
          </button>
          <button type="button" onClick={() => navigate("/my/persona")}>
            <img
              className="icon persona-menu-icon"
              src={asset("persona-tamagotchi.svg")}
              width="32"
              height="32"
              alt=""
              aria-hidden="true"
            />
            내 페르소나{" "}
            <span>
              <PixelIcon name="chev" scale={1.5} />
            </span>
          </button>
          <button type="button" onClick={notifications.openInbox}>
            <PagerIcon />
            알림{" "}
            <span className="my-menu-trailing">
              {notificationBadge(notifications.count) && (
                <span className="pager-badge my-menu-badge">
                  {notificationBadge(notifications.count)}
                  <span className="sr-only">개 읽지 않음</span>
                </span>
              )}
              <PixelIcon name="chev" scale={1.5} />
            </span>
          </button>
          <button type="button" onClick={() => navigate("/preferences")}>
            <img
              className="icon persona-menu-icon"
              src={asset("preferences-menu.svg")}
              width="32"
              height="32"
              alt=""
              aria-hidden="true"
            />
            선호 설정{" "}
            <span>
              <PixelIcon name="chev" scale={1.5} />
            </span>
          </button>
        </div>
        <section className="my-support" aria-label="서비스 문의">
          <BugReportLink />
        </section>
        <p className="my-footer">*23# · LITTLE PIXELS, REAL CONNECTIONS.</p>
      </main>
    </>
  );
}

export function Settings({
  navigate,
  onLogout,
  onWithdrawUser,
  isLoggingOut = false,
  isWithdrawingUser = false,
}) {
  const [confirmingAction, setConfirmingAction] = useState(null);
  const logoutActionRef = useRef(null);
  const withdrawalActionRef = useRef(null);
  function cancelAccountAction() {
    const trigger =
      confirmingAction === "logout" ? logoutActionRef : withdrawalActionRef;
    setConfirmingAction(null);
    window.requestAnimationFrame(() => trigger.current?.focus());
  }
  const accountActionPending = isLoggingOut || isWithdrawingUser;

  return (
    <>
      <ScreenHeader
        notificationAction
        className="account-header"
        title="설정"
        onBack={() => navigate("/my")}
      />
      <main
        id="main-content"
        tabIndex={-1}
        className="main-scroll settings-main"
      >
        <div className="settings-intro">
          <span className="settings-kicker">내 설정 노트</span>
          <h2>계정 설정</h2>
          <p>프로필과 로그인 상태를 관리해요.</p>
        </div>
        <section className="settings-action-list" aria-label="계정 설정">
          <button
            type="button"
            className="settings-action"
            onClick={() => navigate("/my/profile")}
            disabled={accountActionPending}
          >
            <span
              className="settings-action-icon profile-action-icon"
              aria-hidden="true"
            >
              <PixelIcon name="pencil" scale={2} />
            </span>
            <span className="settings-action-copy">
              <strong>프로필 수정</strong>
              <small>닉네임과 활동 정보를 관리해요.</small>
            </span>
            <span className="settings-action-chevron" aria-hidden="true">
              <PixelIcon name="chev" scale={1.5} />
            </span>
          </button>

          {confirmingAction !== "logout" ? (
            <button
              type="button"
              ref={logoutActionRef}
              className="settings-action settings-logout"
              onClick={() => setConfirmingAction("logout")}
              disabled={accountActionPending}
            >
              <span
                className="settings-action-icon logout-action-icon"
                aria-hidden="true"
              >
                <PixelIcon name="arrowUpRight" scale={2} />
              </span>
              <span className="settings-action-copy">
                <strong>로그아웃</strong>
                <small>계정에서 안전하게 나가요.</small>
              </span>
              <span className="settings-action-chevron" aria-hidden="true">
                <PixelIcon name="chev" scale={1.5} />
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
                  onClick={cancelAccountAction}
                  disabled={accountActionPending}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="settings-confirm-submit"
                  onClick={onLogout}
                  disabled={accountActionPending}
                >
                  {isLoggingOut ? "로그아웃 중…" : "로그아웃"}
                </button>
              </div>
            </fieldset>
          )}

          {confirmingAction !== "withdrawal" ? (
            <button
              type="button"
              ref={withdrawalActionRef}
              className="settings-action settings-withdrawal"
              onClick={() => setConfirmingAction("withdrawal")}
              disabled={accountActionPending}
            >
              <span
                className="settings-action-icon withdrawal-action-icon"
                aria-hidden="true"
              >
                <PixelIcon name="x" scale={2} />
              </span>
              <span className="settings-action-copy">
                <strong>계정 탈퇴</strong>
                <small>계정과 프로필을 삭제하고 서비스를 떠나요.</small>
              </span>
              <span className="settings-action-chevron" aria-hidden="true">
                <PixelIcon name="chev" scale={1.5} />
              </span>
            </button>
          ) : (
            <fieldset
              className="settings-withdrawal-confirm"
              aria-label="계정 탈퇴 확인"
            >
              <legend>정말 계정을 탈퇴할까요?</legend>
              <p>
                탈퇴하면 모든 서비스 이용이 종료되며, 탈퇴 후에는 되돌릴 수
                없어요.
              </p>
              <div className="settings-confirm-actions">
                <button
                  type="button"
                  className="settings-confirm-cancel"
                  onClick={cancelAccountAction}
                  disabled={accountActionPending}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="settings-confirm-submit settings-withdrawal-submit"
                  onClick={onWithdrawUser}
                  disabled={accountActionPending}
                >
                  {isWithdrawingUser ? "탈퇴 처리 중…" : "탈퇴하기"}
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
  const [initialPhotos, setInitialPhotos] = useState([]);
  const [legacyPhoto, setLegacyPhoto] = useState("");
  const [replacingLegacyPhoto, setReplacingLegacyPhoto] = useState(false);
  const [photoState, setPhotoState] = useState({
    images: [],
    ready: false,
    busy: false,
  });
  const [jobError, setJobError] = useState("");
  const [nicknameError, setNicknameError] = useState("");
  const [heightError, setHeightError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);
  const initialNickname = useRef("");
  const saveInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    setIsLoadingProfile(true);
    setProfileLoadFailed(false);

    getMyProfile()
      .then((serverProfile) => {
        if (!active) return;
        const savedPhotos = savedPhotoItems(serverProfile);
        const savedNickname = serverProfile.nickname ?? "";
        setInitialPhotos(savedPhotos);
        initialNickname.current = savedNickname;
        setLegacyPhoto(
          savedPhotos.length ? "" : serverProfile.profileImageUrl || "",
        );
        setData((old) => ({
          ...old,
          profile: {
            ...old.profile,
            nickname: savedNickname,
            birthDate: serverProfile.birthDate ?? old.profile.birthDate,
            activityRegionId: serverProfile.activityRegionId ?? null,
            regionName: serverProfile.activityRegionName ?? "",
            height:
              serverProfile.height == null ? "" : String(serverProfile.height),
            bodyType: serverProfile.bodyType ?? "",
            educationLevel: serverProfile.educationLevel ?? "",
            job: normalizeJobCategory(serverProfile.job),
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

  const set = (key, value) => {
    if (key === "nickname") setNicknameError("");
    if (key === "height") setHeightError("");
    setData((old) => ({ ...old, profile: { ...old.profile, [key]: value } }));
  };

  const keepLegacyPhoto = Boolean(legacyPhoto) && !replacingLegacyPhoto;
  const photosReady =
    keepLegacyPhoto ||
    photoState.ready ||
    samePhotoItems(initialPhotos, photoState.images);
  const saveVerifiedPhoto = useCallback(async (images) => {
    setIsSavingPhoto(true);
    try {
      await saveProfileImages(images);
      setInitialPhotos(images);
      setPhotoState({ images, ready: true, busy: false });
      setLegacyPhoto("");
      setReplacingLegacyPhoto(false);
    } finally {
      setIsSavingPhoto(false);
    }
  }, []);
  const navigateWhenIdle = (path) => {
    if (!saveInFlight.current) navigate(path);
  };

  async function save() {
    if (
      isLoadingProfile ||
      profileLoadFailed ||
      isSavingPhoto ||
      saveInFlight.current ||
      !photosReady
    )
      return;
    if (!isJobCategory(profile.job)) {
      setJobError("직업군을 선택해 주세요.");
      return;
    }
    setJobError("");
    const nickname = String(profile.nickname ?? "");
    const nicknameError = profileNicknameValidationError(nickname);
    if (nicknameError) {
      setNicknameError(nicknameError);
      return;
    }
    const invalidHeight = profileHeightValidationError(profile.height);
    if (invalidHeight) {
      setHeightError(invalidHeight);
      return;
    }
    setHeightError("");
    if (!profile.activityRegionId) {
      toast("검색 결과에서 활동 지역을 선택해 주세요.");
      return;
    }
    const nicknameChanged = nickname !== initialNickname.current;
    const photosChanged =
      !keepLegacyPhoto && !samePhotoItems(initialPhotos, photoState.images);
    saveInFlight.current = true;
    setIsSaving(true);
    let saveSucceeded = false;
    try {
      if (nicknameChanged) {
        let nicknameAvailability;
        try {
          nicknameAvailability = await checkNicknameAvailability(nickname);
        } catch (e) {
          toast(
            apiErrorMessage(
              e,
              "닉네임 사용 가능 여부를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
            ),
          );
          return;
        }
        if (!nicknameAvailability?.available) {
          setNicknameError("이미 사용 중인 닉네임이에요.");
          return;
        }
      }

      await saveProfile(profilePayload(profile));
      initialNickname.current = nickname;
      if (photosChanged) {
        try {
          await saveProfileImages(photoState.images);
        } catch {
          toast(
            "프로필 정보는 저장했지만 사진을 저장하지 못했어요. 사진을 확인하고 다시 시도해 주세요.",
          );
          return;
        }
      }

      const refreshedProfile = await getMyProfile().catch(() => null);
      setData((old) => ({
        ...old,
        profile: {
          ...old.profile,
          photo: refreshedProfile?.profileImageUrl || old.profile.photo,
        },
      }));
      saveSucceeded = true;
    } catch (e) {
      if (e?.code === "NICKNAME_ALREADY_IN_USE") {
        setNicknameError(
          "이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해 주세요.",
        );
      } else if (
        e?.code === "INVALID_REQUEST" &&
        Array.isArray(e.fields) &&
        e.fields.some((fieldError) => fieldError?.field === "height")
      ) {
        setHeightError(PROFILE_HEIGHT_VALIDATION_ERROR);
      } else {
        toast(profileSaveErrorMessage(e));
      }
      return;
    } finally {
      saveInFlight.current = false;
      setIsSaving(false);
    }
    if (saveSucceeded) {
      toast("프로필을 저장했어요.");
      navigate(returnTo);
    }
  }
  return (
    <>
      <ScreenHeader
        notificationAction
        className="account-header"
        title="프로필 수정"
        onBack={() => navigateWhenIdle(returnTo)}
      />
      <main
        id="main-content"
        tabIndex={-1}
        className="main-scroll edit-main"
        aria-busy={isLoadingProfile || isSaving || isSavingPhoto}
      >
        {isLoadingProfile ? (
          <p className="profile-load-state" role="status">
            저장된 프로필을 불러오는 중이에요…
          </p>
        ) : profileLoadFailed ? (
          <div className="profile-load-error" role="alert">
            <p>
              프로필을 불러오지 못했어요. 이전 화면으로 돌아갔다가 다시 시도해
              주세요.
            </p>
          </div>
        ) : (
          <>
            <section className="edit-photo-section">
              {keepLegacyPhoto ? (
                <>
                  <h2>프로필 사진</h2>
                  <div className="trust-photo-grid">
                    <article className="trust-photo-tile">
                      <img
                        src={legacyPhoto}
                        width="300"
                        height="400"
                        alt="저장된 대표사진"
                      />
                      <span className="trust-photo-badge">기존 대표사진</span>
                    </article>
                  </div>
                  <button
                    type="button"
                    className="trust-replace"
                    disabled={isSaving}
                    onClick={() => setReplacingLegacyPhoto(true)}
                  >
                    프로필 사진 수정
                  </button>
                  <p>
                    최대 6장의 사진을 추가하고 순서를 정할 수 있어요. 정면
                    사진을 등록하거나 바꿀 때만 얼굴 인증을 진행해요.
                  </p>
                </>
              ) : (
                <ProfilePhotoEditor
                  initialPhotos={initialPhotos}
                  compactPose
                  disabled={isSaving || isSavingPhoto}
                  onChange={setPhotoState}
                  onVerifiedPhotoSave={saveVerifiedPhoto}
                />
              )}
              {legacyPhoto && replacingLegacyPhoto && (
                <button
                  type="button"
                  className="trust-text-button"
                  disabled={isSaving}
                  onClick={() => setReplacingLegacyPhoto(false)}
                >
                  사진 수정 취소 · 기존 사진 유지
                </button>
              )}
            </section>
            <Field
              label="닉네임"
              hint="한글·영문·숫자 2~10자"
              error={nicknameError}
            >
              <input
                type="text"
                name="nickname"
                autoComplete="nickname"
                value={profile.nickname}
                onChange={(e) => set("nickname", e.target.value)}
                disabled={isSaving}
                maxLength={10}
                placeholder="예: 발신자표시제한번호"
                aria-invalid={Boolean(nicknameError)}
              />
            </Field>
            <ActivityRegionPicker
              selectedId={profile.activityRegionId}
              selectedName={profile.regionName}
              disabled={isSaving}
              onSelect={(region) =>
                setData((old) => ({
                  ...old,
                  profile: { ...old.profile, ...region },
                }))
              }
            />
            <Field label="키 (cm)" error={heightError}>
              <input
                type="number"
                name="height"
                autoComplete="off"
                inputMode="numeric"
                value={profile.height}
                onChange={(e) => set("height", e.target.value)}
                disabled={isSaving}
                min="130"
                max="220"
                placeholder="예: 175"
              />
            </Field>
            <Field label="체형">
              <ChoiceGroup
                options={bodyTypes}
                value={profile.bodyType}
                onChange={(v) => set("bodyType", v)}
                disabled={isSaving}
              />
            </Field>
            <Field label="학력">
              <ChoiceGroup
                options={educationLevels}
                value={profile.educationLevel}
                onChange={(v) => set("educationLevel", v)}
                disabled={isSaving}
              />
            </Field>
            <JobCategorySelect
              value={profile.job}
              onChange={(value) => {
                set("job", value);
                setJobError("");
              }}
              disabled={isSaving}
              error={jobError}
            />
            <Field label="종교">
              <ChoiceGroup
                options={religions}
                value={profile.religion}
                onChange={(v) => set("religion", v)}
                disabled={isSaving}
              />
            </Field>
            <Field label="음주">
              <ChoiceGroup
                options={drinkings}
                value={profile.drinking}
                onChange={(v) => set("drinking", v)}
                disabled={isSaving}
              />
            </Field>
            <Field label="흡연">
              <ChoiceGroup
                options={smokings}
                value={profile.smoking}
                onChange={(v) => set("smoking", v)}
                disabled={isSaving}
              />
            </Field>
            <div className="edit-actions">
              <PixelButton
                onClick={save}
                disabled={isSaving || isSavingPhoto || !photosReady}
              >
                {isSaving ? "저장 중…" : "저장하기"}
              </PixelButton>
            </div>
          </>
        )}
      </main>
    </>
  );
}

export function Persona({ navigate }) {
  const [state, setState] = useState({ status: "loading", persona: null });
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry explicitly reloads the saved persona.
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading", persona: null });
    getMyPersona({ signal: controller.signal })
      .then((persona) => {
        if (!controller.signal.aborted) setState({ status: "ready", persona });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            status: error?.code === "PERSONA_NOT_FOUND" ? "empty" : "error",
            persona: null,
            error,
          });
      });
    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setAttempt((current) => current + 1);
  }

  const persona = state.persona;
  const narrative = persona?.narrative;
  const preferences = persona
    ? [
        { label: "관심사", icon: "spark", items: persona.interests },
        { label: "일상과 루틴", icon: "chat", items: persona.routine },
        { label: "편안한 데이트", icon: "heart", items: persona.datePrefer },
        {
          label: "피하고 싶은 데이트",
          icon: "alert",
          items: persona.dateAvoid,
        },
      ].filter(({ items }) => items.length)
    : [];
  const hasContent = hasPersonaContent(persona);

  return (
    <>
      <ScreenHeader
        className="account-header persona-header"
        notificationAction
        title="내 페르소나"
        onBack={() => navigate("/my")}
      />
      <main
        id="main-content"
        tabIndex={-1}
        className="main-scroll persona-main"
        aria-busy={state.status === "loading"}
      >
        {state.status === "loading" ? (
          <div className="persona-loading" role="status">
            <AiAvatar size={48} />
            <p>대화에서 알아간 나의 모습을 불러오고 있어요.</p>
            <div aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : state.status === "error" ? (
          <EmptyState
            icon="!"
            title="페르소나를 불러오지 못했어요"
            description={apiErrorMessage(state.error)}
            action={
              <PixelButton secondary onClick={retry}>
                다시 확인
              </PixelButton>
            }
          />
        ) : state.status === "empty" || !hasContent ? (
          <EmptyState
            title={
              state.status === "empty"
                ? "아직 확정된 페르소나가 없어요"
                : "표시할 성향 요약이 아직 없어요"
            }
            description="가치관 문답에서 정리한 내용이 준비되면 이곳에서 볼 수 있어요."
          />
        ) : (
          <>
            <section
              className="persona-overview"
              aria-labelledby="persona-overview-title"
            >
              <div className="persona-overview-heading">
                <AiAvatar size={44} />
                <div>
                  <span>하루가 이해한 나</span>
                  <p>
                    {persona.conversationStyle
                      ? "가치관 문답과 대화에서 알아간 모습이에요."
                      : "온보딩에서 나눈 대화를 바탕으로 정리했어요."}
                  </p>
                </div>
              </div>
              <h2 id="persona-overview-title">
                {narrative?.headline || "대화로 알아간 나의 모습"}
              </h2>
              {narrative && (
                <p className="persona-narrative">{narrative.body}</p>
              )}
              {narrative?.traits?.length > 0 && (
                <ul className="persona-keywords" aria-label="나의 성향 키워드">
                  {narrative.traits.map((trait) => (
                    <li key={trait}>{trait}</li>
                  ))}
                </ul>
              )}
              {persona.mbti && (
                <span className="persona-mbti">
                  내가 알려준 MBTI · {persona.mbti}
                </span>
              )}
              {persona.conversationStyle && (
                <a className="persona-style-jump" href="#persona-style-title">
                  나의 말투 보기 <PixelIcon name="chev" scale={1.5} />
                </a>
              )}
            </section>
            <PersonaConversationStyle style={persona.conversationStyle} />
            {persona.summaries.length > 0 && (
              <section
                className="persona-values"
                aria-labelledby="persona-values-title"
              >
                <h2 id="persona-values-title">관계 속의 나</h2>
                {persona.summaries.map((summary) => (
                  <article className="persona-value" key={summary.category}>
                    <span className="persona-value-icon" aria-hidden="true">
                      <PixelIcon
                        name={PERSONA_AREAS[summary.category].icon}
                        scale={2.5}
                      />
                    </span>
                    <div>
                      <span className="persona-value-label">
                        {PERSONA_AREAS[summary.category].label}
                      </span>
                      <h3>{summary.title}</h3>
                      <p>{summary.content}</p>
                    </div>
                  </article>
                ))}
              </section>
            )}
            {preferences.length > 0 && (
              <section
                className="persona-preferences"
                aria-labelledby="persona-preferences-title"
              >
                <h2 id="persona-preferences-title">내 일상과 취향</h2>
                {preferences.map(({ label, icon, items }) => (
                  <section className="persona-preference" key={label}>
                    <h3>
                      <PixelIcon name={icon} scale={1.5} />
                      {label}
                    </h3>
                    <ul>
                      {items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </section>
            )}
            <p className="persona-use-note">
              <PixelIcon name="chat" scale={2} />이 내용은 나를 닮은 AI의
              연습대화와 시뮬레이션에 반영돼요.
            </p>
          </>
        )}
      </main>
    </>
  );
}
