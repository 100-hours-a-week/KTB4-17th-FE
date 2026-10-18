import { useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
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
import { AiAvatar } from "../../shared/ui/pixel.jsx";
import { dateAge } from "../../shared/utils.js";
import { ActivityRegionPicker } from "../activity-region/ActivityRegionPicker.jsx";
import { useNotifications } from "../notifications/context.jsx";
import { PagerIcon } from "../notifications/NotificationControls.jsx";
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
import { JobCategorySelect } from "./JobCategorySelect.jsx";
import { isJobCategory, normalizeJobCategory } from "./jobCategories.js";
import { profilePayload } from "./serialize.js";

const NICKNAME_PATTERN = /^[가-힣A-Za-z0-9]{2,10}$/;
const NICKNAME_FORMAT_ERROR = "닉네임은 한글·영문·숫자 2~10자로 입력해주세요.";
const PROFILE_SAVE_ERROR =
  "프로필을 저장하지 못했어요. 잠시 후 다시 시도해주세요.";
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
                  person={{
                    id: "me",
                    photo: profile.photo || asset("user-avatar.png"),
                  }}
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
            <AiAvatar size={30} />내 페르소나 <span>활성　›</span>
          </button>
          <button type="button" onClick={notifications.openInbox}>
            <PagerIcon />
            알림 <span>{notifications.count || ""}　›</span>
          </button>
          <button type="button" onClick={() => navigate("/preferences")}>
            <span className="menu-glyph">⚙</span>선호 설정 <span>›</span>
          </button>
        </div>
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
  const accountActionPending = isLoggingOut || isWithdrawingUser;

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
            disabled={accountActionPending}
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

          {confirmingAction !== "logout" ? (
            <button
              type="button"
              className="settings-action settings-logout"
              onClick={() => setConfirmingAction("logout")}
              disabled={accountActionPending}
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
                  onClick={() => setConfirmingAction(null)}
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
              className="settings-action settings-withdrawal"
              onClick={() => setConfirmingAction("withdrawal")}
              disabled={accountActionPending}
            >
              <span
                className="settings-action-icon withdrawal-action-icon"
                aria-hidden="true"
              >
                ×
              </span>
              <span className="settings-action-copy">
                <strong>계정 탈퇴</strong>
                <small>계정과 프로필을 삭제하고 서비스를 떠나요.</small>
              </span>
              <span className="settings-action-chevron" aria-hidden="true">
                ›
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
                  onClick={() => setConfirmingAction(null)}
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
  const [isSaving, setIsSaving] = useState(false);
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
    setData((old) => ({ ...old, profile: { ...old.profile, [key]: value } }));
  };

  const keepLegacyPhoto = Boolean(legacyPhoto) && !replacingLegacyPhoto;
  const photosReady =
    keepLegacyPhoto ||
    photoState.ready ||
    samePhotoItems(initialPhotos, photoState.images);
  const navigateWhenIdle = (path) => {
    if (!saveInFlight.current) navigate(path);
  };

  async function save() {
    if (
      isLoadingProfile ||
      profileLoadFailed ||
      saveInFlight.current ||
      !photosReady
    )
      return;
    if (!isJobCategory(profile.job)) {
      setJobError("직업군을 선택해주세요.");
      return;
    }
    setJobError("");
    const nickname = String(profile.nickname ?? "");
    if (!NICKNAME_PATTERN.test(nickname)) {
      setNicknameError(NICKNAME_FORMAT_ERROR);
      return;
    }
    if (!profile.activityRegionId) {
      toast("검색 결과에서 활동 지역을 선택해주세요.");
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
              "닉네임 사용 가능 여부를 확인하지 못했어요. 잠시 후 다시 시도해주세요.",
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
            "프로필 정보는 저장했지만 사진을 저장하지 못했어요. 사진을 확인하고 다시 시도해주세요.",
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
          "이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해주세요.",
        );
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
      <BrandHeader navigate={navigateWhenIdle} />
      <ScreenHeader
        className="chat-room-header"
        title="프로필 수정"
        onBack={() => navigateWhenIdle(returnTo)}
      />
      <main
        className="main-scroll edit-main"
        aria-busy={isLoadingProfile || isSaving}
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
            <section className="edit-photo-section">
              {keepLegacyPhoto ? (
                <>
                  <h2>프로필 사진</h2>
                  <div className="trust-photo-grid">
                    <article className="trust-photo-tile">
                      <img src={legacyPhoto} alt="저장된 대표사진" />
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
                    최대 6장의 사진을 추가하고 순서를 정할 수 있어요. 정면 사진을
                    등록하거나 바꿀 때만 얼굴 인증을 진행해요.
                  </p>
                </>
              ) : (
                <ProfilePhotoEditor
                  initialPhotos={initialPhotos}
                  disabled={isSaving}
                  onChange={setPhotoState}
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
                value={profile.nickname}
                onChange={(e) => set("nickname", e.target.value)}
                disabled={isSaving}
                maxLength={10}
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
            <Field label="키 (cm)">
              <input
                type="number"
                value={profile.height}
                onChange={(e) => set("height", e.target.value)}
                disabled={isSaving}
                min="130"
                max="220"
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
              <PixelButton onClick={save} disabled={isSaving || !photosReady}>
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
  return (
    <>
      <ScreenHeader
        notificationAction
        title="내 페르소나"
        onBack={() => navigate("/my")}
      />
      <main className="main-scroll persona-main">
        <div className="persona-hero">
          <AiAvatar size={72} />
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
