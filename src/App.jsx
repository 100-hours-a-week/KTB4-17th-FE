import { useEffect, useMemo, useRef, useState } from "react";
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
    job: profile.job.trim() || null,
    religion: profile.religion || null,
    drinking: profile.drinking || null,
    smoking: profile.smoking || null,
    mbti: profile.mbti || null,
  };
}

function profileValidation(profile, includeLifestyle = false) {
  if (!profile.activityRegionId)
    return {
      step: "region",
      message: "활동 지역을 다시 선택해주세요.",
    };
  if (!profile.nickname || !/^[가-힣A-Za-z0-9]{2,10}$/.test(profile.nickname))
    return {
      step: "profile",
      message: "닉네임은 한글·영문·숫자 2~10자로 입력해주세요.",
    };

  const height = Number(profile.height);
  if (!Number.isInteger(height) || height < 130 || height > 220)
    return {
      step: "profile",
      message: "키는 130~220cm의 정수로 입력해주세요.",
    };
  if (!profile.bodyType || !profile.educationLevel || !profile.job.trim())
    return {
      step: "profile",
      message: "체형, 학력, 직업을 입력해주세요.",
    };
  if (
    includeLifestyle &&
    (!profile.religion ||
      !profile.drinking ||
      !profile.smoking ||
      !profile.mbti)
  )
    return {
      step: "lifestyle",
      message: "라이프스타일과 MBTI를 모두 선택해주세요.",
    };

  return null;
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

function Login({ onLogin }) {
  return (
    <div className="login-page">
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
  const [profileSaving, setProfileSaving] = useState(false);
  const profileSaveInFlight = useRef(false);
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
    const validation = profileValidation(profile);
    if (validation) {
      if (validation.step !== step)
        setData((old) => ({ ...old, onboardingStep: validation.step }));
      setError(validation.message);
      return;
    }
    if (!DEMO_MODE) {
      try {
        const checked = await backend.nickname(profile.nickname);
        if (!checked?.available)
          return setError("이미 사용 중인 닉네임이에요.");
      } catch (e) {
        return setError(
          e.code === "AUTH_REQUIRED" || e.code === "HTTP_401"
            ? "로그인이 만료되었어요. 다시 로그인해주세요."
            : "닉네임 사용 가능 여부를 확인하지 못했어요. 잠시 후 다시 시도해주세요.",
        );
      }
    }
    advance("lifestyle");
  }

  function showProfileSaveError(requestError) {
    if (requestError.code === "NICKNAME_ALREADY_IN_USE") {
      setData((old) => ({ ...old, onboardingStep: "profile" }));
      setError("이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해주세요.");
      return;
    }
    if (
      requestError.code === "AUTH_REQUIRED" ||
      requestError.code === "HTTP_401"
    ) {
      setError("로그인이 만료되었어요. 다시 로그인해주세요.");
      return;
    }

    const field = requestError.fields?.[0]?.field;
    const fieldErrors = {
      activityRegionId: [
        "region",
        "활동 지역이 유효하지 않아요. 다시 선택해주세요.",
      ],
      nickname: ["profile", "닉네임을 다시 확인해주세요."],
      height: ["profile", "키는 130~220cm의 정수로 입력해주세요."],
      bodyType: ["profile", "체형을 다시 선택해주세요."],
      educationLevel: ["profile", "학력을 다시 선택해주세요."],
      job: ["profile", "직업을 다시 입력해주세요."],
      religion: ["lifestyle", "종교를 다시 선택해주세요."],
      drinking: ["lifestyle", "음주 정보를 다시 선택해주세요."],
      smoking: ["lifestyle", "흡연 정보를 다시 선택해주세요."],
      mbti: ["lifestyle", "MBTI를 다시 선택해주세요."],
    };
    const fieldError = fieldErrors[field];
    if (requestError.code === "INVALID_REQUEST" && fieldError) {
      setData((old) => ({ ...old, onboardingStep: fieldError[0] }));
      setError(fieldError[1]);
      return;
    }

    setError("프로필을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
  }

  async function nextLifestyle() {
    if (profileSaveInFlight.current) return;

    const validation = profileValidation(profile, true);
    if (validation) {
      if (validation.step !== step)
        setData((old) => ({ ...old, onboardingStep: validation.step }));
      setError(validation.message);
      return;
    }
    if (DEMO_MODE) {
      advance("questions");
      return;
    }

    profileSaveInFlight.current = true;
    setProfileSaving(true);
    setError("");
    try {
      await backend.profile(profilePayload(profile));
      advance("questions");
    } catch (requestError) {
      showProfileSaveError(requestError);
    } finally {
      profileSaveInFlight.current = false;
      setProfileSaving(false);
    }
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
          <PixelButton onClick={nextLifestyle} disabled={profileSaving}>
            {profileSaving ? "저장 중..." : "다음"}
          </PixelButton>
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

function Home({ data, setData, navigate, toast }) {
  const person = demoRecommendations.find(
    (item) => !data.passedIds.includes(item.id),
  );
  const liked = person && data.sentLikes.includes(person.id);
  function pass() {
    if (person)
      setData((old) => ({ ...old, passedIds: [...old.passedIds, person.id] }));
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
        <strong>*23#</strong>
        <button onClick={() => navigate("/preferences")}>선호 설정</button>
        <button aria-label="알림" onClick={() => navigate("/notifications")}>
          <Icon name="bell.svg" />
        </button>
      </header>
      <main className="main-scroll home-main">
        {!person ? (
          <EmptyState
            icon="✦"
            title="추천을 모두 봤어요"
            description="새로운 인연이 준비되면 이곳에서 만날 수 있어요."
            action={
              <PixelButton
                secondary
                onClick={() => setData((old) => ({ ...old, passedIds: [] }))}
              >
                다시 보기
              </PixelButton>
            }
          />
        ) : (
          <article className="recommendation-card">
            {person.photo ? (
              <img
                className="recommendation-photo"
                src={person.photo}
                alt={`${person.nickname}님의 프로필 사진`}
              />
            ) : (
              <div className="recommendation-placeholder">
                <span>♥</span>
              </div>
            )}
            <div className="photo-steps">
              <span className="active" />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="recommendation-gradient" />
            <div className="recommendation-info">
              <span className="online-badge">{person.activity}</span>
              <h1>
                {person.nickname}, {person.age}{" "}
                {person.verified && <Icon name="shield.svg" />}
              </h1>
              <p>{person.job}</p>
              <p>
                {person.region} / {person.mbti}
              </p>
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
              onClick={() => navigate(`/profiles/${person.id}`)}
              aria-label={`${person.nickname} 프로필 자세히 보기`}
            />
          </article>
        )}
        <p className="home-tip">프로필을 탭하면 더 자세히 볼 수 있어요.</p>
      </main>
    </>
  );
}

function ProfileDetail({ person, navigate, data, setData, toast }) {
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
    <>
      <ScreenHeader title="프로필" onBack={() => navigate("/home")} />
      <main className="main-scroll detail-main">
        <div className="detail-photo">
          {person.photo ? (
            <img src={person.photo} alt="프로필 사진" />
          ) : (
            <div className="recommendation-placeholder">♥</div>
          )}
        </div>
        <section className="detail-content">
          <span className="online-badge">{person.activity}</span>
          <h1>
            {person.nickname}, {person.age}{" "}
            {person.verified && <Icon name="shield.svg" />}
          </h1>
          <p>
            {person.job} · {person.region} · {person.mbti}
          </p>
          <h2>안녕하세요!</h2>
          <p className="bio">{person.bio}</p>
          <h2>함께 알아가요</h2>
          <div className="detail-tags">
            <span>편안한 대화</span>
            <span>서로 존중</span>
            <span>새로운 인연</span>
          </div>
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
    </>
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
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday)
    return new Intl.DateTimeFormat("ko-KR", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "어제";

  if (date.getFullYear() === now.getFullYear())
    return new Intl.DateTimeFormat("ko-KR", {
      month: "numeric",
      day: "numeric",
    }).format(date);

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function chatListErrorMessage(error) {
  if (error?.code === "AUTH_REQUIRED")
    return "로그인이 만료됐어요. 다시 로그인한 뒤 이용해주세요.";
  return "채팅 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.";
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
  };
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
        <h1>채팅</h1>
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
                    className="chat-room-avatar"
                    src={room.image || asset("chat-avatar-placeholder.svg")}
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
                    {isDemoMode && room.unread > 0 && (
                      <b aria-label={`읽지 않은 메시지 ${room.unread}개`}>
                        {room.unread}
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

function MessageBubble({ message, ai = false }) {
  return (
    <div className={`message-row ${message.mine ? "mine" : "theirs"}`}>
      {ai && !message.mine && (
        <Icon name="ai-avatar.svg" className="bubble-avatar" />
      )}
      <div className="bubble-group">
        <div className="message-bubble">{message.text}</div>
        {message.time && <small>{message.time}</small>}
      </div>
    </div>
  );
}

function ChatRoom({ room, data, setData, navigate, toast }) {
  const [input, setInput] = useState("");
  if (!room)
    return (
      <EmptyState
        title="채팅방을 찾을 수 없어요"
        description="채팅 목록에서 다시 확인해주세요."
      />
    );
  const messages = data.messages[room.id] || [];
  async function send() {
    const text = input.trim();
    if (!text) return;
    if (!DEMO_MODE) {
      try {
        await backend.sendMessage(room.id, text);
      } catch (e) {
        return toast(e.code || "메시지를 보내지 못했어요.");
      }
    }
    const message = { id: Date.now(), mine: true, text, time: "방금" };
    setData((old) => ({
      ...old,
      messages: {
        ...old.messages,
        [room.id]: [...(old.messages[room.id] || []), message],
      },
      rooms: old.rooms.map((item) =>
        item.id === room.id ? { ...item, last: text, time: "방금" } : item,
      ),
    }));
    setInput("");
  }
  return (
    <>
      <ScreenHeader
        title={room.name}
        onBack={() => navigate("/chats")}
        right={
          <button
            className="more-button"
            onClick={() => toast("채팅방 설정은 준비 중이에요.")}
          >
            •••
          </button>
        }
      />
      <div className="mode-tabs">
        <button onClick={() => navigate(`/ai/simulation/${room.personId}`)}>
          시뮬레이션
        </button>
        <button onClick={() => navigate(`/ai/practice/${room.personId}`)}>
          연습 대화
        </button>
        <button className="active">채팅</button>
      </div>
      <div className="chat-messages">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>
      <form
        className="message-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="메시지를 입력하세요"
          aria-label="메시지"
          maxLength={1000}
        />
        <button disabled={!input.trim()} aria-label="보내기">
          ➤
        </button>
      </form>
    </>
  );
}

function Practice({ person, data, setData, navigate }) {
  const [input, setInput] = useState("");
  const [waiting, setWaiting] = useState(false);
  const id = person?.id || 12;
  const messages = data.practice[id] || [
    {
      id: "welcome",
      mine: false,
      text: "안녕하세요! 프로필 보고 반가워서 인사드려요",
    },
  ];
  const count = messages.filter((item) => item.mine).length;
  function send() {
    const text = input.trim();
    if (!text || waiting || count >= 30) return;
    const sent = { id: Date.now(), mine: true, text };
    setData((old) => ({
      ...old,
      practice: {
        ...old.practice,
        [id]: [...(old.practice[id] || messages), sent],
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
        ][count % 3],
      };
      setData((old) => ({
        ...old,
        practice: {
          ...old.practice,
          [id]: [...(old.practice[id] || messages), reply],
        },
      }));
      setWaiting(false);
    }, 900);
  }
  return (
    <>
      <ScreenHeader
        title={person?.nickname || "연습 대화"}
        onBack={() => navigate("/chats")}
        right={<Icon name="ai-avatar.svg" />}
      />
      <div className="mode-tabs">
        <button onClick={() => navigate(`/ai/simulation/${id}`)}>
          시뮬레이션
        </button>
        <button className="active">연습 대화</button>
        <button onClick={() => navigate("/chats/101")}>채팅</button>
      </div>
      <div className="ai-notice">
        ⓘ　실제 상대가 아닌 AI예요. 대화 내용은 상대에게 전달되지 않아요.
        <span>일일 횟수 ({count} / 30)</span>
      </div>
      <div className="chat-messages practice-messages">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} ai />
        ))}
        {waiting && (
          <div className="typing-indicator">
            AI가 답변을 생각하고 있어요 ···
          </div>
        )}
      </div>
      <form
        className="message-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            count >= 30 ? "오늘의 연습을 마쳤어요" : "메시지를 입력하세요"
          }
          aria-label="연습 메시지"
          maxLength={1000}
          disabled={count >= 30}
        />
        <button
          disabled={!input.trim() || waiting || count >= 30}
          aria-label="보내기"
        >
          ➤
        </button>
      </form>
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
      .catch(() => setData((old) => ({ ...old, session: false })))
      .finally(() => setLoading(false));
  }, []);
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
  const personId = Number(path.split("/").pop());
  const person = useMemo(
    () => demoRecommendations.find((item) => item.id === personId),
    [personId],
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
  else if (!data.session || path === "/login")
    page = (
      <Login
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
      <Home data={data} setData={setData} navigate={navigate} toast={toast} />
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
