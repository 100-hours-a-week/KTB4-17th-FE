import { useEffect, useMemo, useRef, useState } from "react";
import { connectAiPracticeSocket } from "./aiPracticeSocket.js";
import { backend, beginKakaoLogin, DEMO_MODE } from "./api.js";
import {
  asset,
  bodyTypes,
  demoRecommendations,
  drinkings,
  educationLevels,
  makeInitialState,
  mbtis,
  questions,
  religions,
  simulationScript,
  smokings,
} from "./data.js";

const STORAGE_KEY = DEMO_MODE
  ? "pocket-signal-v1-demo"
  : "pocket-signal-v1-api";
const ONBOARDING_STEPS = [
  "identity",
  "region",
  "profile",
  "lifestyle",
  "questions",
  "photo",
];
const tabItems = [
  ["HOME", "/home", "nav-home.svg"],
  ["LIKES", "/likes", "nav-heart.svg"],
  ["CHAT", "/chats", "nav-chat.svg"],
  ["MY", "/my", "nav-person.svg"],
];
// Chat APIs currently serialize LocalDateTime without an offset; those values are KST.
const CHAT_TIME_ZONE = "Asia/Seoul";
const CHAT_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const CHAT_CLOCK_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: CHAT_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h12",
});
const CHAT_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: CHAT_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
const CHAT_ACTIVITY_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: CHAT_TIME_ZONE,
  month: "numeric",
  day: "numeric",
});
const CHAT_DATE_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CHAT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function initialState() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ||
        (DEMO_MODE ? localStorage.getItem("pocket-signal-v1") : null),
    );
    if (saved && typeof saved === "object") {
      const merged = { ...makeInitialState(), ...saved };
      if (
        !ONBOARDING_STEPS.includes(merged.onboardingStep) &&
        !merged.onboarded
      )
        merged.onboardingStep = "identity";
      return merged;
    }
  } catch {
    /* use initial state */
  }
  return makeInitialState();
}

function dateAge(value) {
  if (!value) return 0;
  const birth = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return 0;
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  )
    years--;
  return years;
}

function profilePhotoUrls(person) {
  const photos = Array.isArray(person?.photos)
    ? person.photos.filter((photo) => typeof photo === "string" && photo)
    : [];
  if (photos.length) return photos;
  return person?.photo ? [person.photo] : [];
}

function mapRecommendationItem(item) {
  const candidate = item?.candidate;
  const id = candidate?.memberId;
  if (id == null) return null;
  const photos = (Array.isArray(candidate.images) ? candidate.images : [])
    .filter((image) => typeof image?.imageUrl === "string" && image.imageUrl)
    .sort((first, second) => first.displayOrder - second.displayOrder)
    .map((image) => image.imageUrl);
  return {
    id,
    nickname: candidate.nickname || "닉네임 정보 없음",
    age: Number.isFinite(candidate.age) ? candidate.age : null,
    job: candidate.job || "",
    region: candidate.region || "",
    mbti: candidate.mbti || "",
    verified: candidate.verified === true,
    activity: candidate.activity || "",
    photos,
    photo: photos[0] || "",
    bio: candidate.bio || "",
  };
}

function isHangulSyllable(character) {
  const codePoint = character.codePointAt(0);
  return codePoint >= 0xac00 && codePoint <= 0xd7a3;
}

function isValidKoreanName(value) {
  const characters = Array.from(value);
  return (
    characters.length >= 2 &&
    characters.length <= 8 &&
    characters.every(isHangulSyllable)
  );
}

function isValidBirthDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function splitBirthDate(value) {
  const [year = "", month = "", day = ""] = (value || "").split("-");
  if (year.length > 4 || month.length > 2 || day.length > 2)
    return { year: "", month: "", day: "" };
  return { year, month, day };
}

function BirthDateInput({ value, onChange }) {
  const [parts, setParts] = useState(() => splitBirthDate(value));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarPicker, setCalendarPicker] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear() - 25, today.getMonth(), 1);
  });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const yearInput = useRef(null);
  const monthInput = useRef(null);
  const dayInput = useRef(null);
  const yearList = useRef(null);
  const monthList = useRef(null);

  useEffect(() => {
    const [year = "", month = "", day = ""] = (value || "").split("-");
    setParts(splitBirthDate(value));
    if (year.length > 4 || month.length > 2 || day.length > 2)
      onChangeRef.current("");
  }, [value]);

  function updatePart(part, rawValue) {
    const maxLength = part === "year" ? 4 : 2;
    const next = {
      ...parts,
      [part]: rawValue.replace(/\D/g, "").slice(0, maxLength),
    };
    setParts(next);
    onChange(`${next.year}-${next.month}-${next.day}`);

    if (part === "year" && next.year.length === 4) monthInput.current?.focus();
    if (part === "month" && next.month.length === 2) dayInput.current?.focus();
  }

  useEffect(() => {
    if (!calendarPicker) return;
    const list = calendarPicker === "year" ? yearList.current : monthList.current;
    list?.querySelector(".selected")?.scrollIntoView({ block: "center" });
  }, [calendarPicker]);

  function toggleCalendar() {
    setCalendarPicker(null);
    if (!calendarOpen && isValidBirthDate(value)) {
      const [year, month] = value.split("-").map(Number);
      setCalendarMonth(new Date(year, month - 1, 1));
    }
    setCalendarOpen((open) => !open);
  }

  function selectCalendarYear(year) {
    setCalendarMonth((month) => new Date(year, month.getMonth(), 1));
    setCalendarPicker(null);
  }

  function selectCalendarMonth(monthIndex) {
    setCalendarMonth((month) => new Date(month.getFullYear(), monthIndex, 1));
    setCalendarPicker(null);
  }

  function selectCalendarDay(day) {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth() + 1;
    const nextValue = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setParts(splitBirthDate(nextValue));
    onChange(nextValue);
    setCalendarOpen(false);
  }

  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIndex = calendarMonth.getMonth();
  const firstWeekday = new Date(calendarYear, calendarMonthIndex, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonthIndex + 1, 0).getDate();
  const calendarDays = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const selectedDate = isValidBirthDate(value) ? value : "";
  const currentYear = new Date().getFullYear();
  const calendarYears = Array.from(
    { length: currentYear - 1899 },
    (_, index) => currentYear - index,
  );

  return (
    <div className="birth-date-picker">
      <div className="birth-date-heading">
        <span className="field-label">생년월일</span>
        <button
          type="button"
          className="birth-date-calendar-toggle"
          aria-label="달력에서 생년월일 선택"
          aria-expanded={calendarOpen}
          onClick={toggleCalendar}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="2.5" y="4" width="15" height="13" rx="1" />
            <path d="M6 2.5v3M14 2.5v3M2.5 8h15" />
          </svg>
        </button>
      </div>
      <div className="birth-date-input" role="group" aria-label="생년월일">
        <div className="birth-date-part birth-date-year">
          <input
            ref={yearInput}
            type="text"
            inputMode="numeric"
            autoComplete="bday-year"
            aria-label="연도 네 자리"
            placeholder="1998"
            maxLength={4}
            value={parts.year}
            onChange={(event) => updatePart("year", event.target.value)}
          />
          <span className="birth-date-unit">년</span>
        </div>
        <div className="birth-date-part">
          <input
            ref={monthInput}
            type="text"
            inputMode="numeric"
            autoComplete="bday-month"
            aria-label="월 두 자리"
            placeholder="03"
            maxLength={2}
            value={parts.month}
            onChange={(event) => updatePart("month", event.target.value)}
          />
          <span className="birth-date-unit">월</span>
        </div>
        <div className="birth-date-part">
          <input
            ref={dayInput}
            type="text"
            inputMode="numeric"
            autoComplete="bday-day"
            aria-label="일 두 자리"
            placeholder="21"
            maxLength={2}
            value={parts.day}
            onChange={(event) => updatePart("day", event.target.value)}
          />
          <span className="birth-date-unit">일</span>
        </div>
      </div>
      {calendarOpen && (
        <div className="birth-date-calendar" role="dialog" aria-label="생년월일 달력">
          <div className="birth-date-calendar-header">
            <button
              type="button"
              className="birth-date-calendar-nav"
              aria-label="이전 달"
              onClick={() =>
                setCalendarMonth(
                  (month) => new Date(month.getFullYear(), month.getMonth() - 1, 1),
                )
              }
            >
              ‹
            </button>
            <div className="birth-date-calendar-selectors">
              <button
                type="button"
                className="birth-date-calendar-select"
                aria-haspopup="listbox"
                aria-expanded={calendarPicker === "year"}
                onClick={() => setCalendarPicker((picker) => picker === "year" ? null : "year")}
              >
                {calendarYear}년
              </button>
              <button
                type="button"
                className="birth-date-calendar-select"
                aria-haspopup="listbox"
                aria-expanded={calendarPicker === "month"}
                onClick={() => setCalendarPicker((picker) => picker === "month" ? null : "month")}
              >
                {calendarMonthIndex + 1}월
              </button>
            </div>
            <button
              type="button"
              className="birth-date-calendar-nav"
              aria-label="다음 달"
              onClick={() =>
                setCalendarMonth(
                  (month) => new Date(month.getFullYear(), month.getMonth() + 1, 1),
                )
              }
            >
              ›
            </button>
          </div>
          {calendarPicker === "year" ? (
            <div
              className="birth-date-calendar-list"
              role="listbox"
              aria-label="연도 선택"
              ref={yearList}
            >
              {calendarYears.map((year) => (
                <button
                  type="button"
                  role="option"
                  key={year}
                  className={"birth-date-calendar-option" + (calendarYear === year ? " selected" : "")}
                  aria-selected={calendarYear === year}
                  onClick={() => selectCalendarYear(year)}
                >
                  {year}년
                </button>
              ))}
            </div>
          ) : calendarPicker === "month" ? (
            <div
              className="birth-date-calendar-list"
              role="listbox"
              aria-label="월 선택"
              ref={monthList}
            >
              {Array.from({ length: 12 }, (_, month) => month).map((month) => (
                <button
                  type="button"
                  role="option"
                  key={month}
                  className={"birth-date-calendar-option" + (calendarMonthIndex === month ? " selected" : "")}
                  aria-selected={calendarMonthIndex === month}
                  onClick={() => selectCalendarMonth(month)}
                >
                  {month + 1}월
                </button>
              ))}
            </div>
          ) : (
            <div className="birth-date-calendar-grid">
              {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                <span className="birth-date-weekday" key={day}>{day}</span>
              ))}
              {calendarDays.map((day, index) => {
                if (!day) return <span key={"empty-" + index} />;
                const dateValue = calendarYear + "-" + String(calendarMonthIndex + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
                return (
                  <button
                    type="button"
                    key={dateValue}
                    className={"birth-date-day" + (selectedDate === dateValue ? " selected" : "")}
                    aria-pressed={selectedDate === dateValue}
                    aria-label={calendarYear + "년 " + (calendarMonthIndex + 1) + "월 " + day + "일"}
                    onClick={() => selectCalendarDay(day)}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          )}        </div>
      )}
    </div>
  );
}

function profilePayload(profile) {
  return {
    nickname: profile.nickname || null,
    activityRegionId: profile.activityRegionId || null,
    height: profile.height ? Number(profile.height) : null,
    bodyType: profile.bodyType || null,
    educationLevel: profile.educationLevel || null,
    job: profile.job || null,
    religion: profile.religion || null,
    drinking: profile.drinking || null,
    smoking: profile.smoking || null,
    mbti: profile.mbti || null,
  };
}

function readPhoto(file, onReady, onError) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    onError("2MB 이하의 사진을 선택해주세요.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => onReady(String(reader.result));
  reader.onerror = () => onError("사진을 불러오지 못했어요.");
  reader.readAsDataURL(file);
}

function Icon({ name, className = "" }) {
  return (
    <img
      className={`icon ${className}`}
      src={asset(name)}
      alt=""
      aria-hidden="true"
    />
  );
}

function PixelButton({
  children,
  onClick,
  disabled = false,
  secondary = false,
  quiet = false,
  className = "",
  type = "button",
}) {
  return (
    <button
      type={type}
      className={`pixel-button ${secondary ? "secondary" : ""} ${quiet ? "quiet" : ""} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function ScreenHeader({ title, onBack, right, className = "" }) {
  return (
    <header className={`screen-header ${className}`}>
      <button className="header-back" onClick={onBack} aria-label="뒤로가기">
        ‹
      </button>
      <strong>{title}</strong>
      <div className="header-right">{right}</div>
    </header>
  );
}

function BottomNav({ path, navigate }) {
  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {tabItems.map(([label, href, icon]) => (
        <button
          key={href}
          className={path.startsWith(href) ? "active" : ""}
          onClick={() => navigate(href)}
          aria-current={path.startsWith(href) ? "page" : undefined}
        >
          <Icon name={icon} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function Field({ label, children, hint, error }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

function ChoiceGroup({ options, value, onChange, className = "" }) {
  return (
    <div className={`choice-group ${className}`}>
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={`choice ${value === key ? "selected" : ""}`}
          onClick={() => onChange(key)}
          aria-pressed={value === key}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ icon = "♡", title, description, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

function PersonAvatar({ person, size = "medium" }) {
  return person?.photo || person?.image ? (
    <img
      className={`person-avatar ${size}`}
      src={person.photo || person.image}
      alt=""
    />
  ) : (
    <span className={`person-avatar generated ${size}`} aria-hidden="true">
      ♥
    </span>
  );
}

function ProfilePhoto({ person, index = 0, className = "" }) {
  const source = profilePhotoUrls(person)[index] || "";
  const [failedSources, setFailedSources] = useState(() => new Set());

  if (!source || failedSources.has(source)) {
    return (
      <div
        className={`${className} recommendation-placeholder`}
        role="img"
        aria-label={`${person?.nickname || "프로필"}님의 사진이 없어요`}
      >
        <span aria-hidden="true">♥</span>
      </div>
    );
  }

  return (
    <img
      className={className}
      src={source}
      alt={`${person?.nickname || "프로필"}님의 프로필 사진`}
      onError={() =>
        setFailedSources((previous) => new Set(previous).add(source))
      }
    />
  );
}

function PhotoSegments({ person, index, onSelect, className = "" }) {
  const photos = profilePhotoUrls(person);
  if (!photos.length) return null;

  return (
    <nav className={`photo-steps ${className}`} aria-label="프로필 사진">
      {photos.map((photo, photoIndex) => (
        <button
          key={`${person.id}-${photo}`}
          type="button"
          className={photoIndex === index ? "active" : ""}
          aria-label={`사진 ${photoIndex + 1} 보기`}
          aria-pressed={photoIndex === index}
          onClick={() => onSelect(photoIndex)}
        />
      ))}
    </nav>
  );
}

function Login({ onLogin, onLocalTestLogin }) {
  const localTestAuthEnabled = import.meta.env.DEV && !DEMO_MODE;
  const [testAccounts, setTestAccounts] = useState([]);
  const [testTargetMemberId, setTestTargetMemberId] = useState(null);
  const [testAccountsLoading, setTestAccountsLoading] = useState(
    localTestAuthEnabled,
  );
  const [testLoginPending, setTestLoginPending] = useState(false);
  const [testLoginError, setTestLoginError] = useState("");

  useEffect(() => {
    if (!localTestAuthEnabled) return undefined;
    let active = true;
    backend
      .localTestAccounts()
      .then((result) => {
        if (!active) return;
        setTestAccounts(Array.isArray(result?.accounts) ? result.accounts : []);
        setTestTargetMemberId(result?.practiceTargetMemberId || null);
      })
      .catch((error) => {
        if (active) setTestLoginError(error?.code || "TEST_AUTH_UNAVAILABLE");
      })
      .finally(() => {
        if (active) setTestAccountsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [localTestAuthEnabled]);

  async function startPractice(account) {
    setTestLoginPending(true);
    setTestLoginError("");
    try {
      await onLocalTestLogin(account.memberId, testTargetMemberId);
    } catch (error) {
      setTestLoginError(error?.code || "TEST_LOGIN_FAILED");
    } finally {
      setTestLoginPending(false);
    }
  }

  return (
    <div className={`login-page${localTestAuthEnabled ? " local-test-login-page" : ""}`}>
      <div className="login-top-space" aria-hidden="true" />
      <div className="login-illustration">
        <img src={asset("logo-login.png")} alt="*23#" />
      </div>
      <h1>
        좋아하는 사람 앞에서는,
        <br />
        누구나 연습이 필요하니까.
      </h1>
      <button
        className="kakao-login-button"
        type="button"
        aria-label="카카오 로그인"
        onClick={onLogin}
      >
        <img src={asset("kakao_login_kr_large.svg")} alt="" aria-hidden="true" />
      </button>
      {localTestAuthEnabled && (
        <section className="local-test-login-card" aria-labelledby="local-test-login-title">
          <h2 id="local-test-login-title">개발용 테스트 계정</h2>
          <p>카카오 로그인과 온보딩 없이 AI 연습 대화를 바로 확인해요.</p>
          {testAccountsLoading ? (
            <div className="local-test-login-status" role="status">
              테스트 계정을 확인하고 있어요…
            </div>
          ) : testAccounts.length ? (
            testAccounts.map((account) => (
              <button
                className="local-test-login-button"
                key={account.memberId}
                type="button"
                disabled={testLoginPending || !testTargetMemberId}
                onClick={() => startPractice(account)}
              >
                {testLoginPending ? "로그인 중…" : "테스트 계정으로 연습 시작"}
              </button>
            ))
          ) : (
            <div className="local-test-login-status" role="status">
              활성 테스트 계정이 없어요. 테스트 사용자 900001을 준비해주세요.
            </div>
          )}
          {testLoginError && (
            <div className="local-test-login-error" role="alert">
              테스트 로그인을 처리하지 못했어요 ({testLoginError})
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function RegistrationRestricted({ profile, onConfirm }) {
  const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate || "")
    ? profile.birthDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1. $2. $3")
    : "-";

  return (
    <main className="registration-restricted-page">
      <div className="registration-restricted-top-space" aria-hidden="true" />
      <h1>
        만 19세 이상만
        <br />
        이용할 수 있어요
      </h1>
      <p className="registration-restricted-subtitle">
        이 서비스는 청소년유해매체물로 분류되어 만 19세 미만은 가입할 수 없어요.
      </p>
      <dl className="registration-restricted-card">
        <div className="registration-restricted-row">
          <dt>확인된 계정</dt>
          <dd>카카오</dd>
        </div>
        <div className="registration-restricted-row">
          <dt>본명</dt>
          <dd>{profile.name || "-"}</dd>
        </div>
        <div className="registration-restricted-row">
          <dt>생년월일</dt>
          <dd>{birthDate}</dd>
        </div>
      </dl>
      <ul className="registration-restricted-notes">
        <li>카카오 계정에 등록된 생년월일 기준이에요</li>
        <li>입력한 정보는 저장되지 않고 즉시 폐기돼요</li>
        <li>기본 정보가 다르면 수정 후 다시 시도해주세요</li>
      </ul>
      <button
        className="registration-restricted-confirm"
        type="button"
        onClick={onConfirm}
      >
        확인
      </button>
    </main>
  );
}

function Onboarding({ data, setData, navigate, toast }) {
  const [error, setError] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [nameHelper, setNameHelper] = useState("");
  const [regionQuery, setRegionQuery] = useState("");
  const [regions, setRegions] = useState([]);
  const [answer, setAnswer] = useState("");
  const profile = data.profile;
  const step = data.onboardingStep;
  const stepIndex = ONBOARDING_STEPS.indexOf(step);
  const updateProfile = (key, value) =>
    setData((old) => ({ ...old, profile: { ...old.profile, [key]: value } }));
  function applyKoreanName(rawName) {
    const characters = Array.from(rawName);
    const hangulCharacters = characters.filter(isHangulSyllable);
    const nextName = hangulCharacters.slice(0, 8).join("");
    const hasInvalidCharacters = hangulCharacters.length !== characters.length;
    const exceededLength = hangulCharacters.length > 8;

    updateProfile("name", nextName);
    setError("");
    if (
      hasInvalidCharacters ||
      exceededLength ||
      (nameTouched && nextName.length < 2)
    )
      setNameHelper("이름은 한글 2~8자 이내로 입력해주세요");
    else setNameHelper("");
  }

  function handleNameChange(event) {
    const rawName = event.currentTarget.value;
    setError("");
    if (event.nativeEvent.isComposing) {
      updateProfile("name", rawName);
      return;
    }
    applyKoreanName(rawName);
  }

  function handleNameCompositionEnd(event) {
    applyKoreanName(event.currentTarget.value);
  }

  function handleNameBlur() {
    setNameTouched(true);
    if (!isValidKoreanName(profile.name))
      setNameHelper("이름은 한글 2~8자 이내로 입력해주세요");
  }
  const advance = (next) => {
    setError("");
    setData((old) => ({ ...old, onboardingStep: next }));
  };
  const back = () => {
    if (stepIndex <= 0) {
      navigate("/login");
      return;
    }
    advance(ONBOARDING_STEPS[stepIndex - 1]);
  };

  async function submitIdentity() {
    const name = profile.name;
    if (!isValidBirthDate(profile.birthDate))
      return setError("생년월일을 연도, 월, 일 순서로 정확히 입력해주세요.");
    if (!isValidKoreanName(name)) {
      setError("");
      setNameTouched(true);
      setNameHelper("이름은 한글 2~8자 이내로 입력해주세요");
      return;
    }
    if (dateAge(profile.birthDate) < 19) {
      setError("");
      navigate("/registration/restricted");
      return;
    }
    if (!profile.gender) return setError("성별을 선택해주세요.");

    setError("");
    if (!DEMO_MODE) {
      try {
        await backend.identity({
          name,
          birthDate: profile.birthDate,
          gender: profile.gender,
        });
      } catch (e) {
        return setError(e.code || "기본 정보를 저장하지 못했어요.");
      }
    }
    setData((old) => ({
      ...old,
      session: true,
      onboardingStep: "region",
      registrationInfoConfirmed: true,
    }));
    navigate("/onboarding");
  }

  async function searchRegions(query) {
    setRegionQuery(query);
    if (!query.trim()) {
      setRegions([]);
      return;
    }
    if (DEMO_MODE) {
      const names = [
        "서울 마포구",
        "서울 강남구",
        "서울 강동구",
        "경기 성남시",
        "경기 수원시",
      ];
      setRegions(
        names
          .filter((name) => name.includes(query.trim()))
          .map((name, index) => ({ activityRegionId: 100 + index, name })),
      );
    } else {
      try {
        const result = await backend.regions(query.trim());
        setRegions(
          (result?.items || []).map((item) => ({
            ...item,
            name: `${item.provinceName} ${item.regionName}`,
          })),
        );
      } catch {
        setRegions([]);
      }
    }
  }

  async function nextProfile() {
    if (!profile.nickname || !/^[가-힣A-Za-z0-9]{2,10}$/.test(profile.nickname))
      return setError("닉네임은 한글·영문·숫자 2~10자로 입력해주세요.");
    if (
      !profile.height ||
      Number(profile.height) < 130 ||
      Number(profile.height) > 220
    )
      return setError("키는 130~220cm로 입력해주세요.");
    if (!profile.bodyType || !profile.educationLevel || !profile.job.trim())
      return setError("체형, 학력, 직업을 입력해주세요.");
    if (!DEMO_MODE) {
      try {
        const checked = await backend.nickname(profile.nickname);
        if (!checked?.available)
          return setError("이미 사용 중인 닉네임이에요.");
        await backend.profile(profilePayload(profile));
      } catch (e) {
        return setError(e.code || "프로필을 저장하지 못했어요.");
      }
    }
    advance("lifestyle");
  }

  async function nextLifestyle() {
    if (
      !profile.religion ||
      !profile.drinking ||
      !profile.smoking ||
      !profile.mbti
    )
      return setError("라이프스타일과 MBTI를 모두 선택해주세요.");
    if (!DEMO_MODE) {
      try {
        await backend.profile(profilePayload(profile));
      } catch (e) {
        return setError(e.code || "라이프스타일을 저장하지 못했어요.");
      }
    }
    advance("questions");
  }

  function submitAnswer() {
    if (!answer.trim()) return setError("답변을 입력해주세요.");
    setData((old) => ({
      ...old,
      answers: [...old.answers, answer.trim()],
      questionIndex: Math.min(old.questionIndex + 1, 9),
    }));
    setAnswer("");
    setError("");
    if (data.questionIndex === 9) advance("photo");
  }

  function finish() {
    if (!profile.photo) return setError("대표 사진을 추가해주세요.");
    setData((old) => ({ ...old, onboarded: true, onboardingStep: "complete" }));
    toast("환영해요! 새로운 인연을 만나보세요.");
    navigate("/home");
  }

  const progress = (Math.max(0, stepIndex) / ONBOARDING_STEPS.length) * 100;
  const isRegistrationInfoStep = step === "identity";
  const isUnderage =
    isValidBirthDate(profile.birthDate) && dateAge(profile.birthDate) < 19;
  function handleIdentityEnter(event) {
    if (
      !isRegistrationInfoStep ||
      event.key !== "Enter" ||
      event.nativeEvent.isComposing ||
      !(event.target instanceof HTMLInputElement)
    )
      return;

    const focusableElements = Array.from(
      event.currentTarget.querySelectorAll(
        `input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])`,
      ),
    ).filter((element) => element.getClientRects().length > 0);
    const currentIndex = focusableElements.indexOf(event.target);
    const nextElement = focusableElements[currentIndex + 1];

    if (nextElement) {
      event.preventDefault();
      nextElement.focus();
    }
  }

  return (
    <div
      className={`onboarding-page${isRegistrationInfoStep ? " registration-info-page" : ""}`}
      onKeyDown={handleIdentityEnter}
    >
      {!isRegistrationInfoStep && (
        <>
          <header className="onboarding-top">
            <button className="plain-back" onClick={back} aria-label="뒤로가기">
              ←
            </button>
            <span>
              {stepIndex + 1} / {ONBOARDING_STEPS.length}
            </span>
          </header>
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
        </>
      )}
      <div
        className={`onboarding-body${isRegistrationInfoStep ? " registration-info-body" : ""}`}
        key={step}
      >
        {step === "terms" && (
          <>
            <h1>이용약관에 동의해주세요</h1>
            <p className="subcopy">안전하고 편안한 만남을 위해 확인해주세요.</p>
            <label className="agreement all">
              <input
                type="checkbox"
                checked={(data.terms || []).every(Boolean)}
                onChange={(e) =>
                  setData((old) => ({
                    ...old,
                    agreed: e.target.checked,
                    terms: Array(4).fill(e.target.checked),
                  }))
                }
              />
              전체 동의
            </label>
            {[
              "[필수] 서비스 이용약관",
              "[필수] 개인정보 처리방침",
              "[필수] 만 19세 이상 확인",
              "[선택] 알림 및 이벤트 수신",
            ].map((item, index) => (
              <label className="agreement" key={item}>
                <input
                  type="checkbox"
                  checked={Boolean(data.terms?.[index])}
                  onChange={(e) =>
                    setData((old) => {
                      const terms = [
                        ...(old.terms || [false, false, false, false]),
                      ];
                      terms[index] = e.target.checked;
                      return {
                        ...old,
                        terms,
                        agreed: terms.slice(0, 3).every(Boolean),
                      };
                    })
                  }
                />
                {item}
                <span>›</span>
              </label>
            ))}
            <p className="hint">필수 약관 동의는 가입을 위해 필요해요.</p>
          </>
        )}
        {step === "identity" && (
          <>
            <h1>기본 정보를 알려주세요</h1>
            <BirthDateInput
              value={profile.birthDate}
              onChange={(value) => {
                updateProfile("birthDate", value);
                setError("");
              }}
            />
            {isUnderage && (
              <p className="identity-age-helper" role="alert">
                만 19세 미만은 이용할 수 없어요. 생년월일이 맞는지 확인해주세요
              </p>
            )}
            <div className="registration-info-fields">
              <Field label="본명">
                <div className="pixel-field-frame">
                  <input
                    type="text"
                    autoComplete="name"
                    value={profile.name}
                    onChange={handleNameChange}
                    onCompositionEnd={handleNameCompositionEnd}
                    onBlur={handleNameBlur}
                    aria-invalid={!isValidKoreanName(profile.name)}
                    aria-describedby={nameHelper ? "identity-name-helper" : undefined}
                    placeholder="본명을 입력해주세요"
                  />
                </div>
                {nameHelper && (
                  <small
                    id="identity-name-helper"
                    className="identity-name-helper"
                    role="status"
                  >
                    {nameHelper}
                  </small>
                )}
              </Field>
              <Field label="성별">
                <ChoiceGroup
                  options={[
                    ["FEMALE", "여성"],
                    ["MALE", "남성"],
                  ]}
                  value={profile.gender}
                  onChange={(v) => updateProfile("gender", v)}
                />
              </Field>
            </div>
            <ul className="birth-date-help">
              <li>입력한 생년월일은 성인 확인과 프로필 생일에 사용돼요.</li>
              <li>가입 후에는 기본 정보를 변경할 수 없어요. 신중하게 입력해주세요.</li>
            </ul>
          </>
        )}
        {step === "region" && (
          <>
            <h1>활동 지역을 알려주세요</h1>
            <p className="subcopy">가까운 사람들을 추천해드려요.</p>
            <Field label="지역 검색">
              <input
                value={regionQuery}
                onChange={(e) => searchRegions(e.target.value)}
                placeholder="시/군/구를 입력하세요"
              />
            </Field>
            <div className="region-list">
              {regions.map((item) => (
                <button
                  key={item.activityRegionId}
                  className={
                    profile.activityRegionId === item.activityRegionId
                      ? "selected"
                      : ""
                  }
                  onClick={() =>
                    setData((old) => ({
                      ...old,
                      profile: {
                        ...old.profile,
                        activityRegionId: item.activityRegionId,
                        regionName: item.name,
                      },
                    }))
                  }
                >
                  {item.name}
                  <span>
                    {profile.activityRegionId === item.activityRegionId
                      ? "●"
                      : "○"}
                  </span>
                </button>
              ))}
            </div>
            {profile.regionName && (
              <div className="selected-region">
                선택한 지역 <strong>{profile.regionName}</strong>
              </div>
            )}
          </>
        )}
        {step === "profile" && (
          <>
            <h1>프로필을 알려주세요</h1>
            <p className="subcopy">나를 표현할 수 있는 정보를 입력해주세요.</p>
            <Field label="닉네임" hint="한글·영문·숫자 2~10자">
              <input
                value={profile.nickname}
                onChange={(e) => updateProfile("nickname", e.target.value)}
                placeholder="프로필에 소개될 이름이에요"
                maxLength={10}
              />
            </Field>
            <Field label="키">
              <input
                type="number"
                inputMode="numeric"
                min="130"
                max="220"
                value={profile.height}
                onChange={(e) => updateProfile("height", e.target.value)}
                placeholder="키를 입력해주세요 (cm)"
              />
            </Field>
            <Field label="체형">
              <ChoiceGroup
                options={bodyTypes}
                value={profile.bodyType}
                onChange={(v) => updateProfile("bodyType", v)}
              />
            </Field>
            <Field label="학력">
              <ChoiceGroup
                options={educationLevels}
                value={profile.educationLevel}
                onChange={(v) => updateProfile("educationLevel", v)}
              />
            </Field>
            <Field label="직업">
              <input
                value={profile.job}
                onChange={(e) => updateProfile("job", e.target.value)}
                placeholder="직업을 입력해주세요"
                maxLength={50}
              />
            </Field>
          </>
        )}
        {step === "lifestyle" && (
          <>
            <h1>라이프스타일을 알려주세요</h1>
            <p className="subcopy">서로의 일상을 이해하는 데 도움이 돼요.</p>
            <Field label="종교">
              <ChoiceGroup
                options={religions}
                value={profile.religion}
                onChange={(v) => updateProfile("religion", v)}
              />
            </Field>
            <Field label="음주">
              <ChoiceGroup
                options={drinkings}
                value={profile.drinking}
                onChange={(v) => updateProfile("drinking", v)}
              />
            </Field>
            <Field label="흡연">
              <ChoiceGroup
                options={smokings}
                value={profile.smoking}
                onChange={(v) => updateProfile("smoking", v)}
              />
            </Field>
            <Field label="MBTI">
              <ChoiceGroup
                options={mbtis.map((v) => [v, v])}
                value={profile.mbti}
                onChange={(v) => updateProfile("mbti", v)}
              />
            </Field>
          </>
        )}
        {step === "questions" && (
          <>
            <div className="question-progress">
              <strong>가치관 문답</strong>
              <span>{data.questionIndex + 1} / 10</span>
            </div>
            <p className="subcopy">
              프로필만으로 알기 어려운 부분을 여쭤볼게요.
            </p>
            <div className="question-bubble">
              <Icon name="ai-avatar.svg" />
              {questions[data.questionIndex]}
            </div>
            <Field label="나의 답변">
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="자유롭게 답해보세요"
                maxLength={200}
                rows={5}
              />
            </Field>
          </>
        )}
        {step === "photo" && (
          <>
            <h1>대표 사진을 추가해주세요</h1>
            <p className="subcopy">얼굴이 잘 보이는 사진으로 나를 소개해요.</p>
            <label className="photo-upload">
              {profile.photo ? (
                <img src={profile.photo} alt="선택한 대표 사진" />
              ) : (
                <>
                  <span>＋</span>
                  <strong>사진 선택하기</strong>
                  <small>JPG · PNG · WEBP</small>
                </>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) =>
                  readPhoto(
                    e.target.files?.[0],
                    (url) => updateProfile("photo", url),
                    setError,
                  )
                }
              />
            </label>
            <div className="info-panel">
              사진은 상대에게 공개되는 대표 이미지예요.
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="field-error screen-error">
            {error}
          </p>
        )}
      </div>
      <div
        className={`onboarding-action${isRegistrationInfoStep ? " registration-info-action" : ""}`}
      >
        {step === "identity" && (
          <PixelButton onClick={submitIdentity}>확인</PixelButton>
        )}
        {step === "terms" && (
          <PixelButton
            onClick={() =>
              data.agreed
                ? advance("identity")
                : setError("필수 약관에 동의해주세요.")
            }
          >
            다음
          </PixelButton>
        )}
        {step === "region" && (
          <PixelButton
            onClick={() =>
              profile.activityRegionId
                ? advance("profile")
                : setError("활동 지역을 선택해주세요.")
            }
          >
            다음
          </PixelButton>
        )}
        {step === "profile" && (
          <PixelButton onClick={nextProfile}>다음</PixelButton>
        )}
        {step === "lifestyle" && (
          <PixelButton onClick={nextLifestyle}>다음</PixelButton>
        )}
        {step === "questions" && (
          <PixelButton onClick={submitAnswer}>
            {data.questionIndex === 9 ? "문답 완료" : "답변 보내기"}
          </PixelButton>
        )}
        {step === "photo" && (
          <PixelButton onClick={finish}>시작하기</PixelButton>
        )}
      </div>
    </div>
  );
}

function Home({
  data,
  setData,
  navigate,
  toast,
  recommendations,
  recommendationStatus,
  recommendationError,
  onRetryRecommendations,
}) {
  const [photoSelection, setPhotoSelection] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const person = recommendations.find(
    (item) => !data.passedIds.includes(item.id),
  );
  const photoIndex =
    person && photoSelection?.personId === person.id
      ? photoSelection.index
      : 0;
  const liked = person && data.sentLikes.includes(person.id);
  const allRecommendationsPassed =
    recommendations.length > 0 && !person;

  function pass() {
    if (person)
      setData((old) => ({
        ...old,
        passedIds: old.passedIds.includes(person.id)
          ? old.passedIds
          : [...old.passedIds, person.id],
      }));
  }
  async function like() {
    if (!person || liked) return;
    if (!DEMO_MODE) {
      try {
        await backend.sendLike(person.id);
      } catch (e) {
        return toast(e.code || "좋아요를 보내지 못했어요.");
      }
    }
    setData((old) => ({ ...old, sentLikes: [...old.sentLikes, person.id] }));
    toast(`${person.nickname}님에게 좋아요를 보냈어요`);
  }
  return (
    <>
      <header className="home-header">
        <img className="home-brand-logo" src={asset("logo-login.png")} alt="*23#" />
        <span className="home-mode-label">AI 분석모드</span>
        <span className="home-header-spacer" />
        <button
          className="home-menu-button"
          type="button"
          aria-label="메뉴 열기"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          ≡
        </button>
        {menuOpen && (
          <nav className="home-menu" aria-label="홈 메뉴">
            <button type="button" onClick={() => navigate("/preferences")}>
              선호 설정
            </button>
            <button
              type="button"
              onClick={() => navigate("/notifications")}
            >
              알림
            </button>
          </nav>
        )}
      </header>
      <main className="main-scroll home-main">
        {recommendationStatus === "loading" ? (
          <EmptyState
            icon="✦"
            title="추천을 불러오고 있어요"
            description="잠시만 기다려주세요."
          />
        ) : recommendationError ? (
          <EmptyState
            icon="!"
            title="추천을 불러오지 못했어요"
            description="네트워크를 확인한 뒤 다시 시도해주세요."
            action={
              <PixelButton secondary onClick={onRetryRecommendations}>
                다시 불러오기
              </PixelButton>
            }
          />
        ) : !person ? (
          <EmptyState
            icon="✦"
            title={
              allRecommendationsPassed
                ? "추천을 모두 봤어요"
                : "새로운 추천을 준비하고 있어요"
            }
            description={
              allRecommendationsPassed
                ? "지나친 프로필을 다시 확인할 수 있어요."
                : "새로운 인연이 준비되면 이곳에서 만날 수 있어요."
            }
            action={allRecommendationsPassed ? (
              <PixelButton
                secondary
                onClick={() => setData((old) => ({ ...old, passedIds: [] }))}
              >
                다시 보기
              </PixelButton>
            ) : null}
          />
        ) : (
          <article className="recommendation-card">
            <ProfilePhoto
              className="recommendation-photo"
              person={person}
              index={photoIndex}
            />
            <PhotoSegments
              person={person}
              index={photoIndex}
              onSelect={(index) =>
                setPhotoSelection({ personId: person.id, index })
              }
            />
            <div className="recommendation-gradient" />
            <div className="recommendation-info">
              {person.activity && (
                <span className="online-badge">{person.activity}</span>
              )}
              <h1>
                {person.nickname}
                {person.age != null && `, ${person.age}`}
                {person.verified && <Icon name="detail-shield.svg" />}
              </h1>
              {person.job && <p>{person.job}</p>}
              {(person.region || person.mbti) && (
                <p>
                  {[person.region, person.mbti].filter(Boolean).join(" / ")}
                </p>
              )}
              <div className="recommendation-actions">
                {[
                  ["패스", "action-pass.svg", pass, false],
                  [
                    "시뮬레이션",
                    "action-simulation.svg",
                    () => navigate(`/ai/simulation/${person.id}`),
                    false,
                  ],
                  [
                    "연습 대화",
                    "action-practice.svg",
                    () => navigate(`/ai/practice/${person.id}`),
                    false,
                  ],
                  [liked ? "보냄" : "좋아요", "action-like.svg", like, liked],
                ].map(([label, icon, action, disabled]) => (
                  <button
                    type="button"
                    key={label}
                    className="card-action"
                    onClick={action}
                    disabled={disabled}
                  >
                    <span
                      className="action-key"
                      style={{
                        backgroundImage: `url(${asset(icon === "action-like.svg" ? "action-pink.svg" : "action-white.svg")})`,
                      }}
                    >
                      <Icon name={icon} />
                    </span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              className="card-detail-link"
              type="button"
              onClick={() => navigate(`/profiles/${person.id}`)}
              aria-label={`${person.nickname} 프로필 자세히 보기`}
            />
          </article>
        )}
        {person && (
          <p className="home-tip">프로필을 탭하면 더 자세히 볼 수 있어요.</p>
        )}
      </main>
    </>
  );
}

function ProfileDetail({ person, navigate, data, setData, toast }) {
  const [photoSelection, setPhotoSelection] = useState(null);
  const photoIndex =
    person && photoSelection?.personId === person.id
      ? photoSelection.index
      : 0;

  if (!person)
    return (
      <EmptyState
        title="프로필을 찾을 수 없어요"
        description="추천 목록으로 돌아가 다시 확인해주세요."
      />
    );
  const liked = data.sentLikes.includes(person.id);
  async function like() {
    if (liked) return;
    if (!DEMO_MODE) {
      try {
        await backend.sendLike(person.id);
      } catch (e) {
        return toast(e.code || "좋아요를 보내지 못했어요.");
      }
    }
    setData((old) => ({ ...old, sentLikes: [...old.sentLikes, person.id] }));
    toast("좋아요를 보냈어요");
  }
  return (
    <main className="main-scroll profile-detail-main">
      <div className="detail-photo">
        <ProfilePhoto
          className="detail-photo-image"
          person={person}
          index={photoIndex}
        />
        <button
          className="detail-back-button"
          type="button"
          aria-label="추천으로 돌아가기"
          onClick={() => navigate("/home")}
        >
          ‹
        </button>
        <PhotoSegments
          className="detail-photo-steps"
          person={person}
          index={photoIndex}
          onSelect={(index) =>
            setPhotoSelection({ personId: person.id, index })
          }
        />
      </div>
      <section className="detail-content">
          {person.activity && (
            <span className="online-badge">{person.activity}</span>
          )}
          <h1>
            {person.nickname}
            {person.age != null && `, ${person.age}`}
            {person.verified && <Icon name="detail-shield.svg" />}
          </h1>
          {person.job && (
            <div className="profile-detail-row">
              <Icon name="detail-work.svg" />
              <span>{person.job}</span>
            </div>
          )}
          {person.region && (
            <div className="profile-detail-row">
              <Icon name="detail-location.svg" />
              <span>{person.region}</span>
            </div>
          )}
          {person.bio && (
            <div className="profile-detail-bio">
              <p>안녕하세요!</p>
              <p>{person.bio}</p>
            </div>
          )}
          <div className="detail-actions">
            <PixelButton
              secondary
              onClick={() => navigate(`/ai/practice/${person.id}`)}
            >
              연습 대화
            </PixelButton>
            <PixelButton onClick={like} disabled={liked}>
              {liked ? "좋아요 보냄" : "좋아요"}
            </PixelButton>
          </div>
      </section>
    </main>
  );
}

function Likes({ data, setData, navigate, toast }) {
  const [tab, setTab] = useState("received");
  const ids = tab === "received" ? data.receivedLikes : data.sentLikes;
  const people = ids
    .map((id) => demoRecommendations.find((person) => person.id === id))
    .filter(Boolean);
  function reject(id) {
    setData((old) => ({
      ...old,
      receivedLikes: old.receivedLikes.filter((value) => value !== id),
    }));
    toast("관심 없음으로 정리했어요.");
  }
  function accept(id) {
    const person = demoRecommendations.find((item) => item.id === id);
    setData((old) => ({
      ...old,
      receivedLikes: old.receivedLikes.filter((value) => value !== id),
      matches: old.matches.includes(id) ? old.matches : [...old.matches, id],
      sentLikes: old.sentLikes.includes(id)
        ? old.sentLikes
        : [...old.sentLikes, id],
      rooms: old.rooms.some((room) => room.personId === id)
        ? old.rooms
        : [
            {
              id: 1000 + id,
              personId: id,
              name: person?.nickname || "새 인연",
              image: person?.photo || "",
              last: "서로 좋아요! 첫 인사를 보내보세요.",
              time: "방금",
              unread: 0,
            },
            ...old.rooms,
          ],
    }));
    toast("서로 좋아요! 채팅에서 만나요.");
  }
  return (
    <>
      <div className="segmented-tabs">
        <button
          className={tab === "received" ? "active" : ""}
          onClick={() => setTab("received")}
        >
          받은 좋아요
        </button>
        <button
          className={tab === "sent" ? "active" : ""}
          onClick={() => setTab("sent")}
        >
          보낸 좋아요
        </button>
      </div>
      <main className="main-scroll likes-main">
        <div className="section-heading">
          <h1>{tab === "received" ? "받은 좋아요" : "보낸 좋아요"}</h1>
          <span>최신순⌄</span>
        </div>
        {people.length === 0 ? (
          <EmptyState
            icon="♡"
            title={
              tab === "received"
                ? "아직 받은 좋아요가 없어요"
                : "아직 보낸 좋아요가 없어요"
            }
            description="홈에서 새로운 인연을 만나보세요."
            action={
              <PixelButton secondary onClick={() => navigate("/home")}>
                홈으로 가기
              </PixelButton>
            }
          />
        ) : (
          <div className="like-list">
            {people.map((person) => (
              <article className="like-card" key={person.id}>
                <button
                  className="like-person"
                  onClick={() => navigate(`/profiles/${person.id}`)}
                >
                  <PersonAvatar person={person} />
                  <span>
                    <strong>
                      {person.nickname}, {person.age}
                    </strong>
                    <small>
                      {person.job} · {person.region}
                    </small>
                  </span>
                </button>
                {tab === "received" ? (
                  <div className="like-actions">
                    <PixelButton secondary onClick={() => reject(person.id)}>
                      관심 없음
                    </PixelButton>
                    <PixelButton onClick={() => accept(person.id)}>
                      좋아요
                    </PixelButton>
                  </div>
                ) : (
                  <p className="like-status">
                    {data.matches.includes(person.id)
                      ? "서로 좋아요"
                      : "상대의 답변을 기다리고 있어요"}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function formatChatActivity(value) {
  const date = parseChatDate(value);
  if (!date) return "";

  const dateKey = chatDateKey(date);
  const todayKey = chatDateKey(new Date());
  if (dateKey === todayKey) return CHAT_CLOCK_FORMATTER.format(date);

  const [year, month, day] = todayKey.split("-").map(Number);
  const yesterday = new Date(Date.UTC(year, month - 1, day - 1));
  if (dateKey === yesterday.toISOString().slice(0, 10)) return "어제";

  return dateKey.startsWith(`${todayKey.slice(0, 4)}-`)
    ? CHAT_ACTIVITY_DATE_FORMATTER.format(date)
    : CHAT_DATE_FORMATTER.format(date);
}

function formatChatMessageTime(value) {
  const date = parseChatDate(value);
  return date ? CHAT_CLOCK_FORMATTER.format(date) : "";
}

function parseChatDate(value) {
  if (!value) return null;

  const source = String(value).trim();
  const localDateTime = source.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?$/,
  );
  let date;
  if (localDateTime) {
    const [, year, month, day, hour = "0", minute = "0", second = "0", fraction = ""] =
      localDateTime;
    const milliseconds = Number(`${fraction}000`.slice(0, 3));
    date = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour) - 9,
        Number(minute),
        Number(second),
        milliseconds,
      ),
    );
  } else {
    date = new Date(source);
  }

  return Number.isNaN(date.getTime()) ? null : date;
}

function chatDateKey(date) {
  const parts = Object.fromEntries(
    CHAT_DATE_PARTS_FORMATTER.formatToParts(date).map(({ type, value }) => [
      type,
      value,
    ]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function chatListErrorMessage(error) {
  if (error?.code === "AUTH_REQUIRED")
    return "로그인이 만료됐어요. 다시 로그인한 뒤 이용해주세요.";
  return "채팅 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.";
}

function chatSendErrorMessage(error) {
  if (error?.code === "AUTH_REQUIRED")
    return "로그인이 만료됐어요. 다시 로그인한 뒤 이용해주세요.";
  if (error?.code === "FILE_TOO_LARGE")
    return "사진은 10MB 이하로 첨부할 수 있어요.";
  if (error?.code === "FILE_TYPE_NOT_ALLOWED")
    return "JPG, PNG, WebP 이미지만 첨부할 수 있어요.";
  if (
    [
      "FILE_UPLOAD_FAILED",
      "FILE_UPLOAD_NOT_COMPLETE",
      "FILE_INVALID_CONTENT",
    ].includes(error?.code)
  )
    return "사진 업로드에 실패했어요. 잠시 후 다시 시도해주세요.";
  return "메시지를 보내지 못했어요. 잠시 후 다시 시도해주세요.";
}

function getChatImageAccessUrl(cache, roomId, fileId) {
  const key = `${roomId}:${fileId}`;
  const cached = cache.get(key);
  if (cached?.url && cached.expiresAt > Date.now() + 30_000)
    return Promise.resolve(cached.url);
  if (cached?.pending) return cached.pending;

  const pending = backend
    .chatImageAccessUrl(roomId, fileId)
    .then((result) => {
      const url = result?.accessUrl || "";
      const expiration = Date.parse(result?.expiresAt || "");
      cache.set(key, {
        url,
        expiresAt: Number.isFinite(expiration)
          ? expiration
          : Date.now() + 4 * 60_000,
      });
      return url;
    })
    .catch(() => {
      cache.delete(key);
      return "";
    });
  cache.set(key, { pending, expiresAt: 0 });
  return pending;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function mapChatRoom(item) {
  const previewType = item.preview?.type;
  const previewText =
    previewType === "IMAGE"
      ? "사진"
      : item.preview?.text || "아직 대화가 없어요.";

  return {
    id: item.chatRoomId,
    name: item.otherParticipant?.nickname || "상대 회원",
    image: item.otherParticipant?.profileImageUrl || "",
    last: previewText,
    time: formatChatActivity(item.activityAt),
    chatNotification: item.chatNotification,
    unread: Number(item.unreadCount) || 0,
  };
}

function mapChatMessage(item) {
  const image = item.messageType === "IMAGE" || item.type === "IMAGE";
  return {
    id: item.messageId ?? item.id,
    mine: Boolean(item.mine),
    type: image ? "IMAGE" : "TEXT",
    imageFileId: item.imageFileId ?? null,
    imageUrl: item.imageUrl || "",
    text: image ? "" : item.textContent || item.text || "",
    time: formatChatMessageTime(item.createdAt) || "방금",
  };
}

function mergeChatMessages(current, incoming) {
  const messagesById = new Map();
  for (const message of [...current, ...incoming]) {
    messagesById.set(String(message.id), message);
  }
  return [...messagesById.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

function ChatList({ data, setData, navigate, previewMode = false, toast }) {
  const isDemoMode = DEMO_MODE || previewMode;
  const [rooms, setRooms] = useState(() =>
    isDemoMode ? data.rooms.map((room) => ({ ...room })) : [],
  );
  const [loading, setLoading] = useState(!isDemoMode);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasNext, setHasNext] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(false);
  const mainRef = useRef(null);
  const sentinelRef = useRef(null);
  const pagingRef = useRef(false);

  useEffect(() => {
    if (isDemoMode) return undefined;
    let active = true;
    setLoading(true);
    setError("");
    backend
      .rooms({ size: 20 })
      .then((page) => {
        if (!active) return;
        setRooms((page?.items || []).map(mapChatRoom));
        setNextCursor(page?.pageInfo?.nextCursor || null);
        setHasNext(Boolean(page?.pageInfo?.hasNext));
      })
      .catch((requestError) => {
        if (active) setError(chatListErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isDemoMode, retryCount]);

  async function loadNextPage() {
    if (
      isDemoMode ||
      !hasNext ||
      !nextCursor ||
      loadingMore ||
      pagingRef.current
    )
      return;
    pagingRef.current = true;
    setLoadingMore(true);
    setPageError(false);
    try {
      const page = await backend.rooms({ cursor: nextCursor, size: 20 });
      setRooms((current) => [
        ...current,
        ...(page?.items || []).map(mapChatRoom),
      ]);
      setNextCursor(page?.pageInfo?.nextCursor || null);
      setHasNext(Boolean(page?.pageInfo?.hasNext));
    } catch {
      setPageError(true);
    } finally {
      pagingRef.current = false;
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    const main = mainRef.current;
    const sentinel = sentinelRef.current;
    if (
      !main ||
      !sentinel ||
      !hasNext ||
      loadingMore ||
      pageError ||
      typeof IntersectionObserver === "undefined"
    )
      return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadNextPage();
      },
      { root: main, rootMargin: "120px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNext, loadingMore, nextCursor, pageError]);

  function openRoom(room) {
    if (previewMode) {
      toast?.("미리보기에서는 채팅방 이동을 지원하지 않아요.");
      return;
    }
    if (DEMO_MODE) {
      setData((old) => ({
        ...old,
        rooms: old.rooms.map((item) =>
          item.id === room.id ? { ...item, unread: 0 } : item,
        ),
      }));
    }
    navigate(`/chats/${room.id}`);
  }

  return (
    <>
      <header className="simple-topbar">
        <img className="chat-brand-logo" src={asset("logo-login.png")} alt="*23#" />
      </header>
      <main ref={mainRef} className="main-scroll chat-list-main">
        {loading ? (
          <div className="chat-list-loading" role="status">
            채팅 목록을 불러오고 있어요.
          </div>
        ) : error ? (
          <div className="chat-list-error" role="alert">
            <p>{error}</p>
            {error.includes("로그인") ? (
              <PixelButton onClick={() => navigate("/login")}>
                로그인하기
              </PixelButton>
            ) : (
              <PixelButton onClick={() => setRetryCount((count) => count + 1)}>
                다시 시도
              </PixelButton>
            )}
          </div>
        ) : rooms.length ? (
          <>
            <div className="chat-list-items">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  className="chat-list-item"
                  onClick={() => openRoom(room)}
                  aria-label={`${room.name}, ${room.last}, ${room.time}`}
                >
                  <img
                    className={`chat-room-avatar ${room.image ? "has-photo" : ""}`}
                    src={room.image || asset("chat-avatar-heart-terminal.svg")}
                    alt=""
                  />
                  <span className="chat-room-copy">
                    <span className="chat-room-name">
                      <strong>{room.name}</strong>
                      {room.chatNotification === false && (
                        <img
                          className="chat-notification-muted"
                          src={asset("chat-notification-muted.svg")}
                          alt="알림 끔"
                        />
                      )}
                    </span>
                    <small>{room.last}</small>
                  </span>
                  <span className="chat-room-meta">
                    {room.time && <small>{room.time}</small>}
                    {room.unread > 0 && (
                      <b aria-label={`읽지 않은 메시지 ${room.unread}개`}>
                        {room.unread > 99 ? "99+" : room.unread}
                      </b>
                    )}
                  </span>
                </button>
              ))}
            </div>
            {hasNext && (
              <div ref={sentinelRef} className="chat-list-pagination">
                {loadingMore && <small role="status">이전 대화를 불러오는 중…</small>}
                {pageError && (
                  <PixelButton quiet onClick={loadNextPage}>
                    이전 대화 다시 불러오기
                  </PixelButton>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="chat-empty-state">
            <img
              className="chat-empty-illustration"
              src={asset("chat-empty-illustration.svg")}
              alt=""
            />
            <strong>좋아요를 수락하면 여기서 대화할 수 있어요</strong>
            <PixelButton onClick={() => navigate("/likes")}>
              받은 좋아요 보기
            </PixelButton>
          </div>
        )}
      </main>
    </>
  );
}

function MessageBubble({
  message,
  ai = false,
  avatar = "",
  senderName = "",
  chatRoom = false,
  onViewImage,
  onImageLoaded,
}) {
  const isImage = message.type === "IMAGE";
  return (
    <div
      className={`message-row ${message.mine ? "mine" : "theirs"} ${chatRoom ? "chat-message-row" : ""}`}
    >
      {ai && !message.mine && (
        <Icon name="ai-avatar.svg" className="bubble-avatar" />
      )}
      {!ai && !message.mine && (
        <img
          className="bubble-avatar profile-bubble-avatar"
          src={avatar || asset("chat-avatar-heart-terminal.svg")}
          alt=""
          onError={(event) => {
            event.currentTarget.src = asset("chat-avatar-heart-terminal.svg");
          }}
        />
      )}
      <div className={`bubble-group ${chatRoom ? "chat-bubble-group" : ""}`}>
        {chatRoom && !message.mine && !ai && senderName && (
          <span className="message-sender-name">{senderName}</span>
        )}
        <div className={chatRoom ? "chat-bubble-content" : undefined}>
          <div className={`message-bubble ${isImage ? "is-image" : ""}`}>
            <span className="message-bubble-tail" aria-hidden="true" />
            {isImage ? (
              message.imageUrl ? (
                <button
                  type="button"
                  className="message-image-button"
                  aria-label="사진 크게 보기"
                  onClick={() => onViewImage?.(message.imageUrl)}
                >
                  <img
                    src={message.imageUrl}
                    alt="채팅 첨부 사진"
                    onLoad={onImageLoaded}
                  />
                </button>
              ) : (
                <span className="message-image-placeholder" role="status">
                  사진을 불러오고 있어요.
                </span>
              )
            ) : (
              <span className="message-bubble-text">{message.text}</span>
            )}
          </div>
          {message.time && <small>{message.time}</small>}
        </div>
      </div>
    </div>
  );
}

function ChatRoom({ room, data, setData, navigate, toast }) {
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [sending, setSending] = useState(false);
  const [viewingImage, setViewingImage] = useState("");
  const [targetMemberId, setTargetMemberId] = useState(room?.personId || null);
  const [serverRoom, setServerRoom] = useState(null);
  const [serverMessages, setServerMessages] = useState([]);
  const [roomLoading, setRoomLoading] = useState(!DEMO_MODE);
  const [roomError, setRoomError] = useState("");
  const imageInputRef = useRef(null);
  const messagesScrollRef = useRef(null);
  const lastScrolledMessageIdRef = useRef(null);
  const imageUrlCacheRef = useRef(new Map());
  const roomId = DEMO_MODE
    ? room?.id
    : Number(window.location.pathname.split("/").pop());
  const activeRoom = DEMO_MODE ? room : serverRoom;
  const messages = DEMO_MODE
    ? data.messages[roomId] || []
    : serverMessages;
  const latestMessage = messages[messages.length - 1];
  const latestMessageKey = latestMessage ? String(latestMessage.id) : "";

  useEffect(() => {
    if (
      !latestMessageKey ||
      latestMessageKey === lastScrolledMessageIdRef.current
    )
      return;

    const container = messagesScrollRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: lastScrolledMessageIdRef.current ? "smooth" : "auto",
    });
    lastScrolledMessageIdRef.current = latestMessageKey;
  }, [latestMessageKey]);

  function scrollToLatestMessage() {
    const container = messagesScrollRef.current;
    container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }

  useEffect(() => {
    const previewUrl = selectedImage?.previewUrl;
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [selectedImage?.previewUrl]);

  useEffect(() => {
    if (!viewingImage) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setViewingImage("");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [viewingImage]);

  useEffect(() => {
    if (DEMO_MODE) {
      setTargetMemberId(room?.personId || null);
      return undefined;
    }
    if (!Number.isFinite(roomId)) return undefined;
    let active = true;
    setTargetMemberId(null);
    setRoomLoading(true);
    setRoomError("");
    backend
      .rooms({ size: 100 })
      .then((page) => {
        if (!active) return;
        const found = (page?.items || [])
          .map(mapChatRoom)
          .find((item) => String(item.id) === String(roomId));
        setServerRoom(found || null);
        if (!found) setRoomError("채팅 목록에서 방을 찾을 수 없어요.");
      })
      .catch((error) => {
        if (!active) return;
        setRoomError(
          error?.code === "AUTH_REQUIRED"
            ? "로그인이 만료됐어요. 다시 로그인한 뒤 이용해주세요."
            : "채팅방을 불러오지 못했어요. 다시 시도해주세요.",
        );
      })
      .finally(() => {
        if (active) setRoomLoading(false);
      });
    return () => {
      active = false;
    };
  }, [roomId, room?.personId]);

  useEffect(() => {
    if (DEMO_MODE || !Number.isFinite(roomId)) return undefined;
    let active = true;
    let hasLoaded = false;
    const loadMessages = async () => {
      try {
        const page = await backend.messages(roomId);
        if (!active) return;
        setTargetMemberId(page?.chatRoom?.otherParticipant?.memberId || null);
        const incoming = await Promise.all(
          (page?.messages || []).map(async (item) => {
            const message = mapChatMessage(item);
            if (message.type === "IMAGE" && message.imageFileId) {
              message.imageUrl = await getChatImageAccessUrl(
                imageUrlCacheRef.current,
                roomId,
                message.imageFileId,
              );
            }
            return message;
          }),
        );
        if (!active) return;
        setServerMessages((current) => mergeChatMessages(current, incoming));
        hasLoaded = true;
      } catch (error) {
        if (!active || hasLoaded) return;
        setRoomError(
          error?.code === "AUTH_REQUIRED"
            ? "로그인이 만료됐어요. 다시 로그인한 뒤 이용해주세요."
            : "메시지를 불러오지 못했어요. 채팅방 접근 권한을 확인해주세요.",
        );
      }
    };
    loadMessages();
    const timer = window.setInterval(loadMessages, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [roomId]);

  function selectImage(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!CHAT_IMAGE_MIME_TYPES.has(file.type)) {
      toast("JPG, PNG, WebP 이미지만 첨부할 수 있어요.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast("사진은 10MB 이하로 첨부할 수 있어요.");
      return;
    }
    setSelectedImage({ file, previewUrl: URL.createObjectURL(file) });
  }

  function clearSelectedImage() {
    setSelectedImage(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  async function send() {
    const text = input.trim();
    const image = selectedImage;
    if ((!text && !image) || !activeRoom || sending) return;
    if (!DEMO_MODE) {
      setSending(true);
      try {
        if (image) {
          const uploaded = image.fileId
            ? { fileId: image.fileId }
            : await backend.uploadChatImage(image.file);
          if (!image.fileId) {
            setSelectedImage((current) =>
              current ? { ...current, fileId: uploaded.fileId } : current,
            );
          }
          const created = await backend.sendImageMessage(
            roomId,
            uploaded.fileId,
          );
          const imageMessage = mapChatMessage({
            messageId: created?.messageId ?? `pending-${Date.now()}`,
            mine: true,
            messageType: "IMAGE",
            imageFileId: created?.imageFileId ?? uploaded.fileId,
            createdAt: created?.createdAt,
          });
          imageMessage.imageUrl = await getChatImageAccessUrl(
            imageUrlCacheRef.current,
            roomId,
            imageMessage.imageFileId,
          );
          setServerMessages((current) =>
            mergeChatMessages(current, [imageMessage]),
          );
          clearSelectedImage();
        }

        if (text) {
          const created = await backend.sendMessage(roomId, text);
          setServerMessages((current) =>
            mergeChatMessages(current, [
              mapChatMessage({
                messageId: created?.messageId ?? `pending-${Date.now()}`,
                mine: true,
                messageType: "TEXT",
                textContent: text,
                createdAt: created?.createdAt,
              }),
            ]),
          );
        }
        setInput("");
      } catch (e) {
        toast(chatSendErrorMessage(e));
      } finally {
        setSending(false);
      }
      return;
    }
    const timestamp = Date.now();
    const localMessages = [];
    if (image) {
      try {
        localMessages.push({
          id: timestamp,
          mine: true,
          type: "IMAGE",
          imageUrl: await readFileAsDataUrl(image.file),
          time: "방금",
        });
      } catch {
        toast("사진 미리보기를 읽지 못했어요. 다시 선택해주세요.");
        return;
      }
    }
    if (text) {
      localMessages.push({
        id: timestamp + 1,
        mine: true,
        type: "TEXT",
        text,
        time: "방금",
      });
    }
    setData((old) => ({
      ...old,
      messages: {
        ...old.messages,
        [roomId]: [...(old.messages[roomId] || []), ...localMessages],
      },
      rooms: old.rooms.map((item) =>
        item.id === roomId
          ? { ...item, last: text || "사진", time: "방금" }
          : item,
      ),
    }));
    setInput("");
    clearSelectedImage();
  }
  return (
    <>
      <ScreenHeader
        title={activeRoom?.name || "채팅"}
        onBack={() => navigate("/chats")}
        right={
          <button
            type="button"
            className="more-button"
            onClick={() => toast("채팅방 설정은 준비 중이에요.")}
          >
            •••
          </button>
        }
      />
      <div className="mode-tabs">
        <button
          type="button"
          disabled={!targetMemberId}
          onClick={() => navigate(`/ai/simulation/${targetMemberId}`)}
        >
          시뮬레이션
        </button>
        <button
          type="button"
          disabled={!targetMemberId}
          onClick={() => navigate(`/ai/practice/${targetMemberId}`)}
        >
          연습 대화
        </button>
        <button type="button" className="active">채팅</button>
      </div>
      <div
        ref={messagesScrollRef}
        className={`chat-messages chat-room-messages ${selectedImage ? "has-composer-preview" : ""} ${sending && selectedImage ? "is-uploading" : ""}`}
      >
        {roomLoading ? (
          <p role="status">채팅방을 불러오고 있어요.</p>
        ) : roomError ? (
          <p role="alert">{roomError}</p>
        ) : !activeRoom ? (
          <EmptyState
            title="채팅방을 찾을 수 없어요"
            description="채팅 목록에서 다시 확인해주세요."
          />
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              avatar={activeRoom?.image || ""}
              senderName={activeRoom?.name || ""}
              chatRoom
              onViewImage={setViewingImage}
              onImageLoaded={
                String(message.id) === latestMessageKey
                  ? scrollToLatestMessage
                  : undefined
              }
            />
          ))
        )}
      </div>
      <form
        className={`message-composer ${selectedImage ? "has-image" : ""} ${sending && selectedImage ? "is-uploading" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {selectedImage && (
          <div className="image-attachment-preview">
            <img src={selectedImage.previewUrl} alt="첨부할 사진 미리보기" />
            <div className="image-attachment-file-info">
              <strong>{selectedImage.file.name}</strong>
              <small>{formatFileSize(selectedImage.file.size)}</small>
            </div>
            <button
              type="button"
              className="image-attachment-remove"
              aria-label="첨부 사진 삭제"
              disabled={sending}
              onClick={clearSelectedImage}
            >
              ×
            </button>
          </div>
        )}
        <div className="message-composer-controls">
          <button
            type="button"
            className="attach-image-button"
            aria-label="사진 첨부"
            disabled={!activeRoom || sending}
            onClick={() => imageInputRef.current?.click()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 5h16v14H4z" />
              <circle cx="9" cy="10" r="1.5" />
              <path d="m5 17 5-5 3 3 2-2 4 4" />
              <path d="M18 3v5M15.5 5.5h5" />
            </svg>
          </button>
          <input
            ref={imageInputRef}
            className="image-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="첨부할 사진 선택"
            onChange={selectImage}
          />
          <input
            className="message-text-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="메시지를 입력하세요"
            aria-label="메시지"
            maxLength={1000}
            disabled={sending}
          />
          <button
            type="submit"
            disabled={(!input.trim() && !selectedImage) || !activeRoom || sending}
            aria-label={sending ? "전송 중" : "보내기"}
          >
            {sending ? "…" : "➤"}
          </button>
        </div>
        {sending && selectedImage && (
          <small className="image-upload-status" role="status">
            사진을 전송하고 있어요.
          </small>
        )}
      </form>
      {viewingImage && (
        <div
          className="image-viewer"
          role="dialog"
          aria-modal="true"
          aria-label="사진 크게 보기"
        >
          <button
            type="button"
            className="image-viewer-backdrop"
            aria-label="사진 닫기"
            onClick={() => setViewingImage("")}
          />
          <button
            type="button"
            className="image-viewer-close"
            aria-label="사진 닫기"
            onClick={() => setViewingImage("")}
          >
            ×
          </button>
          <img
            src={viewingImage}
            alt="채팅 첨부 사진 크게 보기"
          />
        </div>
      )}
    </>
  );
}

function mergePracticeChats(current, incoming) {
  const chatsById = new Map(current.map((chat) => [chat.id, chat]));
  for (const chat of incoming) {
    chatsById.set(chat.id, { ...chatsById.get(chat.id), ...chat });
  }
  return [...chatsById.values()].sort((left, right) => left.id - right.id);
}

async function loadPracticeHistory(sessionId) {
  let cursor;
  let session = null;
  let chats = [];
  for (let pageIndex = 0; pageIndex < 100; pageIndex++) {
    const page = await backend.aiPracticeHistory(sessionId, { cursor, size: 100 });
    session ||= page?.session || null;
    chats = mergePracticeChats(chats, page?.chats || []);
    if (!page?.hasNext || page.nextCursor == null) break;
    cursor = page.nextCursor;
  }
  return { session, chats };
}

function practiceErrorMessage(error) {
  const messages = {
    AUTH_REQUIRED: "로그인이 만료됐어요. 다시 로그인한 뒤 이용해주세요.",
    TARGET_MEMBER_NOT_FOUND: "상대 회원 정보를 찾을 수 없어요.",
    SESSION_NOT_FOUND: "연습 대화 정보를 찾을 수 없어요.",
    SESSION_ENDED: "종료된 연습 대화에는 새 메시지를 보낼 수 없어요.",
    GENERATION_IN_PROGRESS: "AI가 이전 메시지에 답변하고 있어요.",
    DAILY_LIMIT_EXCEEDED: "오늘의 연습 횟수를 모두 사용했어요.",
    CHAT_NOT_RETRYABLE: "이 답변은 다시 시도할 수 없어요.",
    AI_SERVER_NOT_CONFIGURED: "AI 응답 서버가 아직 연결되지 않았어요.",
  };
  return messages[error?.code] || "연습 대화를 처리하지 못했어요. 잠시 후 다시 시도해주세요.";
}

function Practice({ person, targetMemberId, data, setData, navigate }) {
  const [input, setInput] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [session, setSession] = useState(null);
  const [chats, setChats] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(!DEMO_MODE);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [sending, setSending] = useState(false);
  const [retryingChatId, setRetryingChatId] = useState(null);
  const [sendError, setSendError] = useState("");
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [ending, setEnding] = useState(false);
  const id = Number(targetMemberId || person?.id || (DEMO_MODE ? 12 : 0));
  const demoMessages = data.practice[id] || [
    {
      id: "welcome",
      mine: false,
      text: "안녕하세요! 프로필 보고 반가워서 인사드려요",
    },
  ];
  const demoCount = demoMessages.filter((item) => item.mine).length;
  const count = DEMO_MODE ? demoCount : (usage?.used || 0) + (usage?.reserved || 0);
  const dailyLimit = DEMO_MODE ? 30 : usage?.dailyLimit || 30;
  const sessionLoadKey = `${id}:${loadAttempt}`;
  const messageScrollKey = `${demoMessages.length}:${waiting}:${chats
    .map((chat) => `${chat.id}:${chat.status}`)
    .join(",")}`;
  const hasGenerating = chats.some((chat) => chat.status === "GENERATING");
  const chatsRef = useRef(chats);
  const refreshRef = useRef(() => Promise.resolve());
  const requestRef = useRef(null);
  const messagesEndRef = useRef(null);
  chatsRef.current = chats;

  useEffect(() => {
    const [memberIdValue] = sessionLoadKey.split(":");
    const memberId = Number(memberIdValue);
    if (DEMO_MODE) return undefined;
    let active = true;
    setLoading(true);
    setLoadError("");
    setInput("");
    setSendError("");
    requestRef.current = null;
    setSession(null);
    setChats([]);
    setUsage(null);
    if (!Number.isSafeInteger(memberId) || memberId <= 0) {
      setLoadError("상대 회원 ID가 없어 연습 대화를 시작할 수 없어요.");
      setLoading(false);
      return () => {
        active = false;
      };
    }
    (async () => {
      const startedSession = await backend.aiPracticeStart(memberId);
      const [history, todayUsage] = await Promise.all([
        loadPracticeHistory(startedSession.id),
        backend.aiPracticeUsage(),
      ]);
      if (!active) return;
      setSession(history.session || startedSession);
      setChats(history.chats);
      setUsage(todayUsage);
    })()
      .catch((error) => {
        if (active) setLoadError(practiceErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionLoadKey]);

  useEffect(() => {
    if (DEMO_MODE || !session?.id) return undefined;
    let active = true;
    async function refresh() {
      try {
        const currentChats = chatsRef.current;
        const pendingChat = currentChats.find(
          (chat) => chat.status === "GENERATING",
        );
        const lastChat = currentChats.at(-1);
        const cursor = pendingChat
          ? pendingChat.id > 1
            ? pendingChat.id - 1
            : undefined
          : lastChat?.id;
        const page = await backend.aiPracticeHistory(session.id, {
          cursor,
          size: 100,
        });
        if (!active) return;
        setChats((current) => mergePracticeChats(current, page?.chats || []));
        const todayUsage = await backend.aiPracticeUsage();
        if (active) setUsage(todayUsage);
      } catch {
        // REST history remains the recovery path if a live update was missed.
      }
    }
    refreshRef.current = refresh;
    const disconnect = connectAiPracticeSocket({
      onMessage(event) {
        if (event.sessionId !== session.id) return;
        setChats((current) =>
          current.map((chat) =>
            chat.id === event.chatId
              ? {
                  ...chat,
                  status: event.status,
                  aiResponse: event.aiResponse || null,
                  failureCode: event.failureCode || null,
                  completedAt: event.completedAt || null,
                }
              : chat,
          ),
        );
        void refresh();
      },
      onStatus(status) {
        if (status === "connected") void refresh();
      },
    });
    return () => {
      active = false;
      disconnect();
      refreshRef.current = () => Promise.resolve();
    };
  }, [session?.id]);

  useEffect(() => {
    if (DEMO_MODE || !session?.id || !hasGenerating) return undefined;
    const timer = window.setInterval(() => {
      void refreshRef.current();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [session?.id, hasGenerating]);

  useEffect(() => {
    const marker = messagesEndRef.current;
    if (!marker || marker.dataset.scrollKey === messageScrollKey) return;
    marker.dataset.scrollKey = messageScrollKey;
    marker.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messageScrollKey]);

  function sendDemo(text) {
    if (!text || waiting || demoCount >= 30) return;
    const sent = { id: Date.now(), mine: true, text };
    setData((old) => ({
      ...old,
      practice: {
        ...old.practice,
        [id]: [...(old.practice[id] || demoMessages), sent],
      },
    }));
    setInput("");
    setWaiting(true);
    window.setTimeout(() => {
      const reply = {
        id: Date.now() + 1,
        mine: false,
        text: [
          "오, 재밌겠다. 조금 더 이야기해줄 수 있어요?",
          "저도 그런 순간을 좋아해요. 주말에는 주로 뭘 하세요?",
          "그렇군요! 대화가 편안해서 좋아요.",
        ][demoCount % 3],
      };
      setData((old) => ({
        ...old,
        practice: {
          ...old.practice,
          [id]: [...(old.practice[id] || demoMessages), reply],
        },
      }));
      setWaiting(false);
    }, 900);
  }

  async function send() {
    const text = input.trim();
    if (!text) return;
    if (DEMO_MODE) {
      sendDemo(text);
      return;
    }
    if (
      sending ||
      hasGenerating ||
      !session ||
      session.status !== "ACTIVE" ||
      !usage ||
      count >= dailyLimit
    )
      return;

    const request =
      requestRef.current?.userMessage === text
        ? requestRef.current
        : { clientMessageId: crypto.randomUUID(), userMessage: text };
    requestRef.current = request;
    setSending(true);
    setSendError("");
    try {
      const accepted = await backend.aiPracticeSend(session.id, request);
      requestRef.current = null;
      setChats((current) =>
        mergePracticeChats(current, [
          {
            id: accepted.chatId,
            clientMessageId: request.clientMessageId,
            userMessage: text,
            aiResponse: null,
            status: accepted.status || "GENERATING",
            isRetry: false,
            failureCode: null,
            createdAt: accepted.createdAt,
            completedAt: null,
          },
        ]),
      );
      setInput("");
      const todayUsage = await backend.aiPracticeUsage().catch(() => null);
      if (todayUsage) setUsage(todayUsage);
    } catch (error) {
      setSendError(practiceErrorMessage(error));
      void refreshRef.current();
      if (error?.code === "DAILY_LIMIT_EXCEEDED") {
        backend.aiPracticeUsage().then(setUsage).catch(() => {});
      }
    } finally {
      setSending(false);
    }
  }

  async function retry(chat) {
    if (!session || retryingChatId != null) return;
    setRetryingChatId(chat.id);
    setSendError("");
    try {
      const accepted = await backend.aiPracticeRetry(session.id, chat.id);
      setChats((current) =>
        current.map((item) =>
          item.id === chat.id
            ? {
                ...item,
                status: accepted.status || "GENERATING",
                aiResponse: null,
                failureCode: null,
                isRetry: true,
              }
            : item,
        ),
      );
      setUsage(await backend.aiPracticeUsage());
    } catch (error) {
      setSendError(practiceErrorMessage(error));
      void refreshRef.current();
    } finally {
      setRetryingChatId(null);
    }
  }

  async function endSession() {
    if (!session || ending) return;
    setEnding(true);
    setSendError("");
    try {
      setSession(await backend.aiPracticeEnd(session.id));
      setShowEndDialog(false);
    } catch (error) {
      setSendError(practiceErrorMessage(error));
    } finally {
      setEnding(false);
    }
  }

  const inputDisabled =
    DEMO_MODE
      ? demoCount >= 30
      : loading ||
        !session ||
        session.status !== "ACTIVE" ||
        !usage ||
        sending ||
        hasGenerating ||
        count >= dailyLimit;
  const partnerTitle = DEMO_MODE
    ? person?.nickname || "연습 대화"
    : "AI 연습 대화";
  const inputPlaceholder = DEMO_MODE
    ? count >= dailyLimit
      ? "오늘의 연습을 마쳤어요"
      : "메시지를 입력하세요"
    : count >= dailyLimit
      ? "오늘의 연습을 마쳤어요"
      : session?.status === "ENDED"
        ? "종료된 대화예요"
        : hasGenerating || sending
          ? "AI가 답변을 준비하고 있어요"
          : loading
            ? "대화를 불러오는 중이에요"
            : "메시지를 입력하세요";
  return (
    <>
      <ScreenHeader
        title={partnerTitle}
        onBack={() => navigate("/chats")}
        right={
          DEMO_MODE ? (
            <Icon name="ai-avatar.svg" />
          ) : session?.status === "ACTIVE" ? (
            <button
              type="button"
              className="more-button"
              aria-label="연습 대화 메뉴"
              onClick={() => setShowEndDialog(true)}
            >
              •••
            </button>
          ) : null
        }
      />
      <div className="mode-tabs">
        <button type="button" onClick={() => navigate(`/ai/simulation/${id}`)}>
          시뮬레이션
        </button>
        <button type="button" className="active">연습 대화</button>
        <button type="button" onClick={() => navigate("/chats")}>채팅</button>
      </div>
      <div className="ai-notice">
        ⓘ　실제 상대가 아닌 AI예요. 대화 내용은 상대에게 전달되지 않아요.
        <span>일일 횟수 제한 ({count} / {dailyLimit})</span>
      </div>
      <div className="chat-messages practice-messages">
        {DEMO_MODE ? (
          <>
            {demoMessages.map((message) => (
              <MessageBubble key={message.id} message={message} ai />
            ))}
            {waiting && (
              <div className="typing-indicator" role="status">
                AI가 답변을 생각하고 있어요 ···
              </div>
            )}
          </>
        ) : loading ? (
          <div className="practice-state" role="status">
            연습 대화를 불러오고 있어요…
          </div>
        ) : loadError ? (
          <div className="practice-state" role="alert">
            <p>{loadError}</p>
            <button
              type="button"
              className="practice-inline-button"
              onClick={() => setLoadAttempt((value) => value + 1)}
            >
              다시 불러오기
            </button>
          </div>
        ) : chats.length === 0 ? (
          <div className="practice-state">
            상대 AI와 편하게 대화를 시작해보세요.
          </div>
        ) : (
          chats.map((chat) => (
            <div className="practice-turn" key={chat.id}>
              <MessageBubble
                message={{ id: `${chat.id}-user`, mine: true, text: chat.userMessage }}
                ai
              />
              {chat.status === "COMPLETED" && chat.aiResponse && (
                <MessageBubble
                  message={{ id: `${chat.id}-ai`, mine: false, text: chat.aiResponse }}
                  ai
                />
              )}
              {chat.status === "GENERATING" && (
                <div className="typing-indicator" role="status">
                  AI가 답변을 생각하고 있어요 ···
                </div>
              )}
              {chat.status === "FAILED" && (
                <div className="practice-retry">
                  <span>답변을 만들지 못했어요. 다시 시도할 수 있어요.</span>
                  <button
                    type="button"
                    className="practice-retry-button"
                    disabled={retryingChatId === chat.id || count >= dailyLimit || session?.status !== "ACTIVE"}
                    onClick={() => retry(chat)}
                  >
                    {retryingChatId === chat.id ? "요청 중…" : "다시 시도"}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      <form
        className="message-composer practice-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        {sendError && (
          <p className="practice-send-error" role="alert">
            {sendError}
          </p>
        )}
        {!DEMO_MODE && session?.status === "ENDED" && (
          <p className="practice-send-error">종료된 대화의 기록을 보고 있어요.</p>
        )}
        <div className="practice-compose-row">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={inputPlaceholder}
            aria-label="연습 메시지"
            maxLength={500}
            disabled={inputDisabled}
          />
          <button
            type="submit"
            className="practice-send-button"
            disabled={!input.trim() || inputDisabled}
            aria-label="보내기"
          >
            ➤
          </button>
        </div>
      </form>
      {showEndDialog && (
        <div className="practice-dialog-backdrop">
          <section
            className="practice-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="practice-end-title"
          >
            <h2 id="practice-end-title">연습 대화를 종료할까요?</h2>
            <p>종료한 뒤에도 대화 기록은 다시 확인할 수 있어요.</p>
            <div>
              <button
                type="button"
                className="practice-dialog-button"
                onClick={() => setShowEndDialog(false)}
                disabled={ending}
              >
                계속 대화하기
              </button>
              <button
                type="button"
                className="practice-dialog-button is-primary"
                onClick={() => void endSession()}
                disabled={ending}
              >
                {ending ? "종료 중…" : "종료하기"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function Simulation({ person, data, setData, navigate }) {
  const id = person?.id || 12;
  const simulation = data.simulations[id] || { status: "READY", messages: [] };
  useEffect(() => {
    if (simulation.status !== "PROCESSING") return undefined;
    const timer = window.setTimeout(() => {
      setData((old) => {
        const current = old.simulations[id];
        if (!current || current.status !== "PROCESSING") return old;
        const next = simulationScript[current.messages.length];
        if (!next)
          return {
            ...old,
            simulations: {
              ...old.simulations,
              [id]: { ...current, status: "COMPLETED" },
            },
          };
        const messages = [
          ...current.messages,
          { id: messagesId(), mine: next[0] === "mine", text: next[1] },
        ];
        return {
          ...old,
          simulations: {
            ...old.simulations,
            [id]: {
              status:
                messages.length === simulationScript.length
                  ? "COMPLETED"
                  : "PROCESSING",
              messages,
            },
          },
        };
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [simulation.status, simulation.messages.length, id, setData]);
  function start() {
    setData((old) => ({
      ...old,
      simulations: {
        ...old.simulations,
        [id]: { status: "PROCESSING", messages: [] },
      },
    }));
  }
  function stop() {
    setData((old) => ({
      ...old,
      simulations: {
        ...old.simulations,
        [id]: { ...simulation, status: "CANCELED" },
      },
    }));
  }
  return (
    <>
      <ScreenHeader
        title={person?.nickname || "시뮬레이션"}
        onBack={() => navigate("/home")}
        right={<Icon name="ai-avatar.svg" />}
      />
      <div className="mode-tabs">
        <button className="active">시뮬레이션</button>
        <button onClick={() => navigate(`/ai/practice/${id}`)}>
          연습 대화
        </button>
        <button onClick={() => navigate("/chats/101")}>채팅</button>
      </div>
      <div className="ai-notice">
        ⓘ　실제 상대가 아닌 AI예요. 대화 내용은 상대에게 전달되지 않아요.
      </div>
      <div className="simulation-body">
        <div className="simulation-participants">
          <div>
            <Icon name="ai-avatar.svg" />
            <span>
              {person?.nickname || "상대"} AI
              <small>
                {person?.mbti || "ENFP"} · {person?.job || "개발자"}
              </small>
            </span>
          </div>
          <b>↔</b>
          <div>
            <Icon name="ai-avatar.svg" />
            <span>
              나의 AI<small>내 성향 반영</small>
            </span>
          </div>
        </div>
        {simulation.status === "READY" ? (
          <EmptyState
            icon="✦"
            title="AI끼리 먼저 만나볼까요?"
            description="서로의 AI가 대화하고 대화 호흡을 살펴봐요."
          />
        ) : (
          <>
            <div className="simulation-live">
              ●　{simulation.status === "PROCESSING" ? "실시간 · " : ""}대화{" "}
              {simulation.messages.length} / {simulationScript.length}
            </div>
            <div className="simulation-messages">
              {simulation.messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="simulation-footer">
        <div>
          대화 진행률{" "}
          <span>
            {simulation.messages.length} / {simulationScript.length} 라운드
          </span>
        </div>
        <div className="progress-track">
          <span
            style={{
              width: `${(simulation.messages.length / simulationScript.length) * 100}%`,
            }}
          />
        </div>
        {simulation.status === "READY" && (
          <PixelButton onClick={start}>시뮬레이션 시작</PixelButton>
        )}
        {simulation.status === "PROCESSING" && (
          <PixelButton onClick={stop}>시뮬레이션 중단</PixelButton>
        )}
        {simulation.status === "COMPLETED" && (
          <PixelButton onClick={() => navigate(`/ai/report/${id}`)}>
            리포트 확인하기 ↗
          </PixelButton>
        )}
        {simulation.status === "CANCELED" && (
          <PixelButton onClick={start}>다시 시작하기</PixelButton>
        )}
      </div>
    </>
  );
}

function messagesId() {
  return Date.now() + Math.random();
}

function Report({ person, navigate }) {
  return (
    <>
      <ScreenHeader
        title="궁합 리포트"
        onBack={() => navigate(`/ai/simulation/${person?.id || 12}`)}
      />
      <main className="main-scroll report-main">
        <div className="report-intro">
          <span>AI SIMULATION REPORT</span>
          <h1>
            {person?.nickname || "상대"}님과의
            <br />
            대화 호흡은?
          </h1>
          <p>AI가 나눈 대화를 바탕으로 살펴봤어요.</p>
        </div>
        <div className="score-card">
          <strong>82</strong>
          <span>/ 100</span>
          <p>질문을 자연스럽게 주고받으며 대화가 편안하게 이어졌어요.</p>
        </div>
        {[
          ["대화 흐름", "A", "서로의 이야기를 자연스럽게 이어갔어요."],
          ["질문 주고받기", "A", "궁금한 점을 균형 있게 나눴어요."],
          ["호감 표현", "B", "차분하게 관심을 표현했어요."],
          ["주도권 균형", "B", "한쪽에 치우치지 않았어요."],
        ].map(([label, grade, body]) => (
          <div className="report-metric" key={label}>
            <span>
              {label}
              <small>{body}</small>
            </span>
            <b>{grade}</b>
          </div>
        ))}
        <p className="report-disclaimer">
          AI가 대화 방식을 분석한 결과예요. 실제 관계의 성공을 보장하지 않아요.
        </p>
        <PixelButton onClick={() => navigate("/home")}>
          새로운 인연 보기
        </PixelButton>
      </main>
    </>
  );
}

function MyPage({ data, navigate }) {
  const profile = data.profile;
  return (
    <>
      <header className="my-topbar">
        <span>*23#</span>
        <button onClick={() => navigate("/notifications")} aria-label="알림">
          <Icon name="bell.svg" />
          {data.notifications.some((item) => !item.read) && <i />}
        </button>
      </header>
      <main className="main-scroll my-main">
        <div className="my-identity">
          <PersonAvatar
            person={{ photo: profile.photo || asset("user-avatar.png") }}
            size="large"
          />
          <div>
            <h1>
              {profile.nickname || "노엘"}, {dateAge(profile.birthDate) || 28}
            </h1>
            <p>
              {profile.job || "개발자"} · {profile.regionName || "서울 마포구"}
            </p>
          </div>
        </div>
        <PixelButton
          secondary
          className="my-edit"
          onClick={() => navigate("/my/profile")}
        >
          프로필 수정
        </PixelButton>
        <div className="my-menu">
          <button onClick={() => navigate("/my/persona")}>
            <Icon name="ai-avatar.svg" />내 페르소나 <span>활성　›</span>
          </button>
          <button onClick={() => navigate("/notifications")}>
            <Icon name="bell.svg" />
            알림{" "}
            <span>
              {data.notifications.filter((item) => !item.read).length || ""}　›
            </span>
          </button>
          <button onClick={() => navigate("/preferences")}>
            <span className="menu-glyph">⚙</span>선호 설정 <span>›</span>
          </button>
        </div>
        <p className="my-footer">*23# · LITTLE PIXELS, REAL CONNECTIONS.</p>
      </main>
    </>
  );
}

function MyProfile({ data, setData, navigate, toast }) {
  const profile = data.profile;
  const set = (key, value) =>
    setData((old) => ({ ...old, profile: { ...old.profile, [key]: value } }));
  async function save() {
    if (!DEMO_MODE) {
      try {
        await backend.profile(profilePayload(profile));
      } catch (e) {
        return toast(e.code || "프로필을 저장하지 못했어요.");
      }
    }
    toast("프로필을 저장했어요.");
    navigate("/my");
  }
  return (
    <>
      <ScreenHeader title="프로필 수정" onBack={() => navigate("/my")} />
      <main className="main-scroll edit-main">
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
              readPhoto(e.target.files?.[0], (url) => set("photo", url), toast)
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
      </main>
    </>
  );
}

function Persona({ data, navigate }) {
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
        <small>답변 {data.answers.length}개가 반영되어 있어요.</small>
      </main>
    </>
  );
}

function Preferences({ data, setData, navigate, toast }) {
  const p = data.preferences;
  const set = (key, value) =>
    setData((old) => ({
      ...old,
      preferences: { ...old.preferences, [key]: value },
    }));
  return (
    <>
      <ScreenHeader title="선호 설정" onBack={() => navigate("/home")} />
      <main className="main-scroll preferences-main">
        <h1>어떤 사람이 편한가요?</h1>
        <p className="subcopy">추천받고 싶은 상대의 조건을 설정해요.</p>
        <Field label={`나이 ${p.minAge}~${p.maxAge}세`}>
          <div className="range-row">
            <input
              type="number"
              min="19"
              max="39"
              value={p.minAge}
              onChange={(e) => set("minAge", e.target.value)}
            />
            <span>~</span>
            <input
              type="number"
              min="19"
              max="39"
              value={p.maxAge}
              onChange={(e) => set("maxAge", e.target.value)}
            />
          </div>
        </Field>
        <Field label={`키 ${p.minHeight}~${p.maxHeight}cm`}>
          <div className="range-row">
            <input
              type="number"
              min="130"
              max="220"
              value={p.minHeight}
              onChange={(e) => set("minHeight", e.target.value)}
            />
            <span>~</span>
            <input
              type="number"
              min="130"
              max="220"
              value={p.maxHeight}
              onChange={(e) => set("maxHeight", e.target.value)}
            />
          </div>
        </Field>
        <Field label="종교">
          <ChoiceGroup
            options={[["ANY", "상관없음"], ...religions]}
            value={p.religion || "ANY"}
            onChange={(v) => set("religion", v)}
          />
        </Field>
        <Field label="음주">
          <ChoiceGroup
            options={[["ANY", "상관없음"], ...drinkings]}
            value={p.drinking || "ANY"}
            onChange={(v) => set("drinking", v)}
          />
        </Field>
        <Field label="흡연">
          <ChoiceGroup
            options={[["ANY", "상관없음"], ...smokings]}
            value={p.smoking || "ANY"}
            onChange={(v) => set("smoking", v)}
          />
        </Field>
        <PixelButton
          onClick={() => {
            toast("선호 조건을 저장했어요.");
            navigate("/home");
          }}
        >
          저장하기
        </PixelButton>
      </main>
    </>
  );
}

function Notifications({ data, setData, navigate, toast }) {
  const [category, setCategory] = useState("ALL");
  const types = {
    ALL: "전체",
    LIKE: "관심",
    CHAT_MESSAGE: "채팅",
    SYSTEM: "시스템",
  };
  const matches = (item) =>
    category === "ALL" ||
    (category === "SYSTEM"
      ? !["LIKE", "CHAT_MESSAGE"].includes(item.type)
      : item.type === category);
  const items = data.notifications.filter(matches);
  function open(item) {
    setData((old) => ({
      ...old,
      notifications: old.notifications.map((v) =>
        v.id === item.id ? { ...v, read: true } : v,
      ),
    }));
    navigate(item.target || "/my");
  }
  return (
    <>
      <ScreenHeader
        title="알림"
        onBack={() => navigate("/my")}
        right={
          <button
            className="text-action"
            onClick={() => {
              setData((old) => ({
                ...old,
                notifications: old.notifications.filter(
                  (item) => !matches(item),
                ),
              }));
              toast("알림을 삭제했어요.");
            }}
          >
            전체 삭제
          </button>
        }
      />
      <div className="notification-tabs">
        {Object.entries(types).map(([key, label]) => (
          <button
            key={key}
            className={category === key ? "active" : ""}
            onClick={() => setCategory(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <main className="main-scroll notifications-main">
        {items.length ? (
          items.map((item) => (
            <div
              className={`notification-card ${item.read ? "read" : ""}`}
              key={item.id}
            >
              <button className="notification-open" onClick={() => open(item)}>
                <span className="notification-glyph">
                  {item.type === "LIKE"
                    ? "♥"
                    : item.type === "CHAT_MESSAGE"
                      ? "▣"
                      : "✦"}
                </span>
                <span>
                  <strong>
                    {item.title}
                    {!item.read && <i />}
                  </strong>
                  <small>{item.body}</small>
                  <em>{item.when}</em>
                </span>
              </button>
              <button
                className="notification-delete"
                onClick={() =>
                  setData((old) => ({
                    ...old,
                    notifications: old.notifications.filter(
                      (v) => v.id !== item.id,
                    ),
                  }))
                }
                aria-label={`${item.title} 삭제`}
              >
                ×
              </button>
            </div>
          ))
        ) : (
          <EmptyState
            icon="♧"
            title="알림이 없어요"
            description="새로운 소식이 생기면 이곳에 알려드릴게요."
          />
        )}
      </main>
    </>
  );
}

export default function App() {
  const [data, setData] = useState(initialState);
  const [path, setPath] = useState(window.location.pathname);
  const [toastText, setToastText] = useState("");
  const [loading, setLoading] = useState(!DEMO_MODE);
  const [sessionCheckError, setSessionCheckError] = useState(false);
  const [recommendations, setRecommendations] = useState(() =>
    DEMO_MODE ? demoRecommendations : [],
  );
  const [recommendationStatus, setRecommendationStatus] = useState(
    DEMO_MODE ? "ready" : "idle",
  );
  const [recommendationError, setRecommendationError] = useState("");
  const [recommendationReload, setRecommendationReload] = useState(0);
  useEffect(() => {
    const hasConfirmedIdentity = data.registrationInfoConfirmed || data.onboarded;
    const storedData = hasConfirmedIdentity
      ? data
      : {
          ...data,
          profile: {
            ...data.profile,
            name: "",
            birthDate: "",
            gender: "",
          },
        };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedData));
  }, [data]);
  useEffect(() => {
    const pop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (DEMO_MODE) return;
    if (
      import.meta.env.DEV &&
      window.location.pathname === "/chats/preview"
    ) {
      setLoading(false);
      return;
    }
    if (window.location.pathname.startsWith("/registration")) {
      if (window.location.pathname === "/registration") {
        setData((old) => ({
          ...old,
          onboardingStep: "identity",
          registrationInfoConfirmed: false,
        }));
      }
      setLoading(false);
      return;
    }
    backend
      .onboarding()
      .then((status) => {
        setData((old) => ({
          ...old,
          session: true,
          onboarded: status?.userStatus === "ACTIVE",
        }));
      })
      .catch((error) => {
        if (error?.code === "AUTH_REQUIRED") {
          setData((old) => ({ ...old, session: false }));
          return;
        }
        setSessionCheckError(true);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (DEMO_MODE) return undefined;
    if (loading) return undefined;
    if (!data.session || !data.onboarded) {
      setRecommendations([]);
      setRecommendationError("");
      setRecommendationStatus("idle");
      return undefined;
    }

    let active = true;
    setRecommendationStatus("loading");
    setRecommendationError("");

    async function loadRecommendations() {
      let batch = await backend.activeBatch();
      let batchId = batch?.batchId;
      if (!batchId) {
        const created = await backend.createRecommendationBatch();
        batchId = created?.batchId;
        if (!batchId) {
          batch = await backend.activeBatch();
          batchId = batch?.batchId;
        }
      }

      if (!batchId) {
        if (active) setRecommendations([]);
        return;
      }

      const result = await backend.recommendationItems(batchId);
      const items = Array.isArray(result?.items) ? result.items : [];
      const nextRecommendations = items
        .map(mapRecommendationItem)
        .filter(Boolean);
      if (active) setRecommendations(nextRecommendations);
    }

    loadRecommendations()
      .catch((error) => {
        if (active)
          setRecommendationError(
            error?.code || "RECOMMENDATIONS_UNAVAILABLE",
          );
      })
      .finally(() => {
        if (active) setRecommendationStatus("ready");
      });

    return () => {
      active = false;
    };
  }, [loading, data.session, data.onboarded, recommendationReload]);
  useEffect(() => {
    if (!toastText) return undefined;
    const timer = window.setTimeout(() => setToastText(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toastText]);
  function navigate(to) {
    if (window.location.pathname !== to) window.history.pushState({}, "", to);
    setPath(to);
    window.scrollTo(0, 0);
  }
  function toast(message) {
    setToastText(message);
  }
  async function loginWithLocalTestAccount(memberId, practiceTargetMemberId) {
    if (!import.meta.env.DEV || DEMO_MODE) {
      throw new Error("LOCAL_TEST_LOGIN_DISABLED");
    }

    await backend.localTestLogin(memberId);
    const status = await backend.onboarding();
    if (status?.userStatus !== "ACTIVE") {
      const error = new Error("TEST_ACCOUNT_ONBOARDING_INCOMPLETE");
      error.code = "TEST_ACCOUNT_ONBOARDING_INCOMPLETE";
      throw error;
    }

    setData((old) => ({
      ...old,
      session: true,
      onboarded: true,
      onboardingStep: "complete",
    }));
    navigate(`/ai/practice/${practiceTargetMemberId}`);
  }
  const personId = Number(path.split("/").pop());
  const person = useMemo(
    () => recommendations.find((item) => item.id === personId),
    [personId, recommendations],
  );
  const room = data.rooms.find((item) => item.id === personId);
  const chatPreview = import.meta.env.DEV && path === "/chats/preview";
  const showNav =
    (data.onboarded || chatPreview) &&
    (["/home", "/likes", "/chats", "/my"].includes(path) || chatPreview);
  let page;
  if (loading)
    page = (
      <div className="loading-page">
        <img src={asset("logo.png")} alt="" />
        <span>잠시만 기다려주세요</span>
      </div>
    );
  else if (sessionCheckError)
    page = (
      <div className="loading-page">
        <img src={asset("logo.png")} alt="" />
        <span>서버에 연결하지 못해 로그인 상태를 확인할 수 없어요.</span>
        <PixelButton onClick={() => window.location.reload()}>
          다시 시도
        </PixelButton>
      </div>
    );
  else if (path === "/registration/restricted")
    page = (
      <RegistrationRestricted
        profile={data.profile}
        onConfirm={() => navigate("/registration")}
      />
    );
  else if (path === "/registration")
    page = (
      <Onboarding
        data={
          data.registrationInfoConfirmed
            ? data
            : { ...data, onboardingStep: "identity" }
        }
        setData={setData}
        navigate={navigate}
        toast={toast}
      />
    );
  else if (chatPreview)
    page = (
      <ChatList
        data={makeInitialState()}
        setData={() => {}}
        navigate={navigate}
        previewMode
        toast={toast}
      />
    );
  else if (
    import.meta.env.DEV &&
    DEMO_MODE &&
    path === "/ai/practice/preview"
  )
    page = (
      <Practice
        person={demoRecommendations[0]}
        targetMemberId={demoRecommendations[0].id}
        data={data}
        setData={setData}
        navigate={navigate}
      />
    );
  else if (!data.session || path === "/login")
    page = (
      <Login
        onLocalTestLogin={loginWithLocalTestAccount}
        onLogin={() => {
          if (DEMO_MODE) {
            setData((old) => ({
              ...old,
              session: true,
              onboarded: false,
              onboardingStep: "identity",
              registrationInfoConfirmed: false,
            }));
            navigate("/onboarding");
          } else beginKakaoLogin();
        }}
      />
    );
  else if (!data.onboarded)
    page = (
      <Onboarding
        data={data}
        setData={setData}
        navigate={navigate}
        toast={toast}
      />
    );
  else if (path === "/home" || path === "/")
    page = (
      <Home
        data={data}
        setData={setData}
        navigate={navigate}
        toast={toast}
        recommendations={recommendations}
        recommendationStatus={recommendationStatus}
        recommendationError={recommendationError}
        onRetryRecommendations={() =>
          setRecommendationReload((reload) => reload + 1)
        }
      />
    );
  else if (path.startsWith("/profiles/"))
    page = (
      <ProfileDetail
        person={person}
        data={data}
        setData={setData}
        navigate={navigate}
        toast={toast}
      />
    );
  else if (path === "/likes")
    page = (
      <Likes data={data} setData={setData} navigate={navigate} toast={toast} />
    );
  else if (path === "/chats")
    page = <ChatList data={data} setData={setData} navigate={navigate} />;
  else if (path.startsWith("/chats/"))
    page = (
      <ChatRoom
        room={room}
        data={data}
        setData={setData}
        navigate={navigate}
        toast={toast}
      />
    );
  else if (path.startsWith("/ai/practice/"))
    page = (
      <Practice
        person={person}
        targetMemberId={personId}
        data={data}
        setData={setData}
        navigate={navigate}
      />
    );
  else if (path.startsWith("/ai/simulation/"))
    page = (
      <Simulation
        person={person}
        data={data}
        setData={setData}
        navigate={navigate}
      />
    );
  else if (path.startsWith("/ai/report/"))
    page = <Report person={person} navigate={navigate} />;
  else if (path === "/my") page = <MyPage data={data} navigate={navigate} />;
  else if (path === "/my/profile")
    page = (
      <MyProfile
        data={data}
        setData={setData}
        navigate={navigate}
        toast={toast}
      />
    );
  else if (path === "/my/persona")
    page = <Persona data={data} navigate={navigate} />;
  else if (path === "/preferences")
    page = (
      <Preferences
        data={data}
        setData={setData}
        navigate={navigate}
        toast={toast}
      />
    );
  else if (path === "/notifications")
    page = (
      <Notifications
        data={data}
        setData={setData}
        navigate={navigate}
        toast={toast}
      />
    );
  else
    page = (
      <EmptyState
        title="화면을 찾을 수 없어요"
        description="홈으로 돌아가 다시 시작해주세요."
        action={
          <PixelButton onClick={() => navigate("/home")}>
            홈으로 가기
          </PixelButton>
        }
      />
    );
  return (
    <div className="app-shell">
      <div className="app-screen">
        {page}
        {showNav && <BottomNav path={path} navigate={navigate} />}
        {toastText && (
          <div className="toast" role="status">
            {toastText}
          </div>
        )}
      </div>
    </div>
  );
}
