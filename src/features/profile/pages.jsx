import { useEffect, useState } from "react";
import { useAppState } from "../../shared/appState.jsx";
import { asset } from "../../shared/assets.js";
import { readPhoto } from "../../shared/fileUtils.js";
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
import { getMyProfile, profile as saveProfile } from "./api.js";
import {
  bodyTypes,
  drinkings,
  educationLevels,
  religions,
  smokings,
} from "./data.js";
import { profilePayload } from "./serialize.js";

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
      <BrandHeader className="my-topbar">
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
              <PersonAvatar
                person={{ photo: profile.photo || asset("user-avatar.png") }}
                size="large"
              />
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
      <BrandHeader />
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

export function MyProfile({ navigate, toast }) {
  const { data, setData } = useAppState();
  const profile = data.profile;
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoadingProfile(true);
    setProfileLoadFailed(false);

    getMyProfile()
      .then((serverProfile) => {
        if (!active) return;
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
  async function save() {
    try {
      await saveProfile(profilePayload(profile));
    } catch (e) {
      return toast(e.code || "프로필을 저장하지 못했어요.");
    }
    toast("프로필을 저장했어요.");
    navigate("/settings");
  }
  return (
    <>
      <BrandHeader />
      <ScreenHeader
        className="chat-room-header"
        title="프로필 수정"
        onBack={() => navigate("/settings")}
      />
      <main className="main-scroll edit-main" aria-busy={isLoadingProfile}>
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
            <label className="edit-avatar">
              <PersonAvatar
                person={{ photo: profile.photo || asset("user-avatar.png") }}
                size="large"
              />
              <span>사진 변경</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) =>
                  readPhoto(
                    e.target.files?.[0],
                    (url) => set("photo", url),
                    toast,
                  )
                }
              />
            </label>
            <Field label="닉네임">
              <input
                value={profile.nickname}
                onChange={(e) => set("nickname", e.target.value)}
                maxLength={10}
              />
            </Field>
            <Field label="활동 지역">
              <input
                value={profile.regionName}
                onChange={(e) => set("regionName", e.target.value)}
              />
            </Field>
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
              <PixelButton onClick={save}>저장하기</PixelButton>
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
            가치관 문답을 바탕으로 상대와의 연습 대화와 시뮬레이션에 참여해요.
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
