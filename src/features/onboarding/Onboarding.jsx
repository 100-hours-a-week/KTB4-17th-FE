import { useCallback, useEffect, useRef, useState } from "react";
import { storeBearerToken } from "../../shared/api/authToken.js";
import { useAppState } from "../../shared/appState.jsx";
import {
  ChoiceGroup,
  Field,
  Icon,
  PixelButton,
} from "../../shared/ui/components.jsx";
import { regions as searchActivityRegions } from "../activity-region/api.js";
import * as personaApi from "../persona/api.js";
import * as profileApi from "../profile/api.js";
import {
  bodyTypes,
  drinkings,
  educationLevels,
  mbtis,
  religions,
  smokings,
} from "../profile/data.js";
import { profilePayload } from "../profile/serialize.js";
import { getRegistrationAgeRestriction } from "../user/registrationAge.js";
import * as userApi from "../user/api.js";

const ONBOARDING_STEPS = [
  "identity",
  "region",
  "profile",
  "lifestyle",
  "questions",
  "persona-summary",
  "photo-intro",
  "photo",
];
const CHAT_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function isHangulSyllable(character) {
  const codePoint = character.codePointAt(0);
  return codePoint >= 0xac00 && codePoint <= 0xd7a3;
}

export function isValidKoreanName(value) {
  const characters = Array.from(value);
  return (
    characters.length >= 2 &&
    characters.length <= 8 &&
    characters.every(isHangulSyllable)
  );
}

export function isValidBirthDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function splitBirthDate(value) {
  const [year = "", month = "", day = ""] = (value || "").split("-");
  if (year.length > 4 || month.length > 2 || day.length > 2)
    return { year: "", month: "", day: "" };
  return { year, month, day };
}

export function BirthDateInput({ value, onChange }) {
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
    const list =
      calendarPicker === "year" ? yearList.current : monthList.current;
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
  const daysInMonth = new Date(
    calendarYear,
    calendarMonthIndex + 1,
    0,
  ).getDate();
  const calendarCells = [
    ...Array.from({ length: firstWeekday }, (_, index) => ({
      day: null,
      key: `empty-${calendarYear}-${calendarMonthIndex}-${index}`,
    })),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      return {
        day,
        key: `day-${calendarYear}-${calendarMonthIndex}-${day}`,
      };
    }),
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
      <fieldset className="birth-date-input" aria-label="생년월일">
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
      </fieldset>
      {calendarOpen && (
        <div
          className="birth-date-calendar"
          role="dialog"
          aria-label="생년월일 달력"
        >
          <div className="birth-date-calendar-header">
            <button
              type="button"
              className="birth-date-calendar-nav"
              aria-label="이전 달"
              onClick={() =>
                setCalendarMonth(
                  (month) =>
                    new Date(month.getFullYear(), month.getMonth() - 1, 1),
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
                onClick={() =>
                  setCalendarPicker((picker) =>
                    picker === "year" ? null : "year",
                  )
                }
              >
                {calendarYear}년
              </button>
              <button
                type="button"
                className="birth-date-calendar-select"
                aria-haspopup="listbox"
                aria-expanded={calendarPicker === "month"}
                onClick={() =>
                  setCalendarPicker((picker) =>
                    picker === "month" ? null : "month",
                  )
                }
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
                  (month) =>
                    new Date(month.getFullYear(), month.getMonth() + 1, 1),
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
                  className={`birth-date-calendar-option${calendarYear === year ? " selected" : ""}`}
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
                  className={`birth-date-calendar-option${calendarMonthIndex === month ? " selected" : ""}`}
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
                <span className="birth-date-weekday" key={day}>
                  {day}
                </span>
              ))}
              {calendarCells.map(({ day, key }) => {
                if (!day) return <span key={key} aria-hidden="true" />;
                const dateValue = `${calendarYear}-${String(calendarMonthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                return (
                  <button
                    type="button"
                    key={key}
                    className={`birth-date-day${selectedDate === dateValue ? " selected" : ""}`}
                    aria-pressed={selectedDate === dateValue}
                    aria-label={`${calendarYear}년 ${calendarMonthIndex + 1}월 ${day}일`}
                    onClick={() => selectCalendarDay(day)}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          )}{" "}
        </div>
      )}
    </div>
  );
}

export function profileValidation(profile, includeLifestyle = false) {
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

export function Onboarding({ navigate, toast }) {
  const { data, setData } = useAppState();
  const [error, setError] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [nameHelper, setNameHelper] = useState("");
  const [regionQuery, setRegionQuery] = useState("");
  const [regionResults, setRegionResults] = useState([]);
  const [regionSearchStatus, setRegionSearchStatus] = useState("idle");
  const [regionSearchError, setRegionSearchError] = useState("");
  const [answer, setAnswer] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [personaConversation, setPersonaConversation] = useState(null);
  const [personaBusy, setPersonaBusy] = useState(false);
  const [photoItems, setPhotoItems] = useState([]);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [draggedPhotoId, setDraggedPhotoId] = useState(null);
  const profileSaveInFlight = useRef(false);
  const personaStartInFlight = useRef(false);
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
  const advance = useCallback(
    (next) => {
      setError("");
      setData((old) => ({ ...old, onboardingStep: next }));
    },
    [setData],
  );
  const back = () => {
    if (stepIndex <= 0) {
      navigate("/login");
      return;
    }
    advance(ONBOARDING_STEPS[stepIndex - 1]);
  };

  useEffect(() => {
    if (step !== "region") return undefined;

    const query = regionQuery.trim();
    let cancelled = false;

    setRegionSearchError("");
    if (!query) {
      setRegionResults([]);
      setRegionSearchStatus("idle");
      return undefined;
    }

    setRegionResults([]);
    setRegionSearchStatus("loading");
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchActivityRegions(query);
        if (cancelled) return;

        const items = (result?.items || []).map((item) => ({
          ...item,
          name: `${item.provinceName} ${item.regionName}`,
        }));
        setRegionResults(items);
        setRegionSearchStatus(items.length ? "success" : "empty");
      } catch (requestError) {
        if (cancelled) return;

        setRegionResults([]);
        setRegionSearchStatus("error");
        setRegionSearchError(
          requestError.code === "AUTH_REQUIRED" ||
            requestError.code === "HTTP_401"
            ? "로그인이 만료되었어요. 다시 로그인해주세요."
            : "활동 지역을 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
        );
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [regionQuery, step]);
  const applyConversation = useCallback(
    async (conversation) => {
      setPersonaConversation(conversation);
      setAnswer("");
      if (!conversation?.done) return;
      if (conversation.personaDraft) {
        advance("persona-summary");
        return;
      }
      try {
        const personaDraft = await personaApi.personaBuild(
          conversation.sessionId,
        );
        setPersonaConversation((current) =>
          current?.sessionId === conversation.sessionId
            ? { ...current, personaDraft }
            : current,
        );
        advance("persona-summary");
      } catch {
        setError("가치관 요약을 불러오지 못했어요. 다시 시도해주세요.");
      }
    },
    [advance],
  );

  const startPersona = useCallback(async () => {
    if (personaStartInFlight.current) return;
    personaStartInFlight.current = true;
    setPersonaBusy(true);
    setError("");
    try {
      const conversation = await personaApi.personaStart();
      await applyConversation(conversation);
    } catch (requestError) {
      setError(
        requestError?.code === "AUTH_REQUIRED" ||
          requestError?.code === "HTTP_401"
          ? "로그인이 만료되었어요. 다시 로그인해주세요."
          : "AI 문답을 시작하지 못했어요. 잠시 후 다시 시도해주세요.",
      );
    } finally {
      personaStartInFlight.current = false;
      setPersonaBusy(false);
    }
  }, [applyConversation]);

  function restartPersona() {
    setPersonaConversation(null);
    advance("questions");
  }

  useEffect(() => {
    if (step === "questions" && !personaConversation) void startPersona();
  }, [step, personaConversation, startPersona]);

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
    if (getRegistrationAgeRestriction(profile.birthDate)) {
      setError("");
      navigate("/registration/restricted");
      return;
    }
    if (!profile.gender) return setError("성별을 선택해주세요.");

    setError("");
    try {
      const authResponse = await userApi.identity({
        name,
        birthDate: profile.birthDate,
        gender: profile.gender,
      });
      storeBearerToken(authResponse);
    } catch (e) {
      if (e.code === "USER_AGE_REQUIREMENT_NOT_MET") {
        setError("");
        navigate("/registration/restricted");
        return;
      }
      return setError(e.code || "기본 정보를 저장하지 못했어요.");
    }
    setData((old) => ({
      ...old,
      session: true,
      onboardingStep: "region",
      registrationInfoConfirmed: true,
    }));
    navigate("/onboarding");
  }

  async function nextProfile() {
    const validation = profileValidation(profile);
    if (validation) {
      if (validation.step !== step)
        setData((old) => ({ ...old, onboardingStep: validation.step }));
      setError(validation.message);
      return;
    }
    try {
      const checked = await userApi.nickname(profile.nickname);
      if (!checked?.available) return setError("이미 사용 중인 닉네임이에요.");
    } catch (e) {
      return setError(
        e.code === "AUTH_REQUIRED" || e.code === "HTTP_401"
          ? "로그인이 만료되었어요. 다시 로그인해주세요."
          : "닉네임 사용 가능 여부를 확인하지 못했어요. 잠시 후 다시 시도해주세요.",
      );
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
    profileSaveInFlight.current = true;
    setProfileSaving(true);
    setError("");
    try {
      await profileApi.profile(profilePayload(profile));
      advance("questions");
    } catch (requestError) {
      showProfileSaveError(requestError);
    } finally {
      profileSaveInFlight.current = false;
      setProfileSaving(false);
    }
  }

  async function submitPersonaAnswer() {
    const trimmedAnswer = answer.trim();
    if (trimmedAnswer.length < 2)
      return setError("답변은 두 글자 이상 입력해주세요.");
    if (!personaConversation?.sessionId || personaBusy) return;

    setPersonaBusy(true);
    setError("");
    try {
      const conversation = await personaApi.personaAnswer(
        personaConversation.sessionId,
        { answer: trimmedAnswer, turnIndex: personaConversation.turnIndex },
      );
      await applyConversation(conversation);
    } catch {
      setError("답변을 보내지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setPersonaBusy(false);
    }
  }

  async function updatePersonaConversation(action) {
    if (!personaConversation?.sessionId || personaBusy) return;
    setPersonaBusy(true);
    setError("");
    try {
      const conversation = await action(personaConversation.sessionId);
      await applyConversation(conversation);
    } catch {
      setError("AI 문답을 진행하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setPersonaBusy(false);
    }
  }

  async function confirmPersona() {
    const personaId = personaConversation?.personaDraft?.personaId;
    if (!personaId || personaBusy) return;
    setPersonaBusy(true);
    setError("");
    try {
      await personaApi.personaConfirm(personaId);
      advance("photo-intro");
    } catch {
      setError("가치관을 확정하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setPersonaBusy(false);
    }
  }

  function addPhotoItem(file, isFrontal) {
    if (!file) return;
    if (!CHAT_IMAGE_MIME_TYPES.has(file.type)) {
      setError("JPG, PNG, WEBP 형식의 사진만 등록할 수 있어요.");
      return;
    }
    if (photoItems.length >= 6) {
      setError("사진은 최대 6장까지 등록할 수 있어요.");
      return;
    }

    const localId = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);
    setPhotoItems((current) => [
      ...current,
      { localId, previewUrl, fileId: null, isFrontal, uploading: true },
    ]);
    setError("");

    const upload = async () => {
      try {
        const metadata = await profileApi.uploadProfileImage(file);
        setPhotoItems((current) =>
          current.map((item) =>
            item.localId === localId
              ? { ...item, fileId: metadata.fileId, uploading: false }
              : item,
          ),
        );
      } catch {
        URL.revokeObjectURL(previewUrl);
        setPhotoItems((current) =>
          current.filter((item) => item.localId !== localId),
        );
        setError("사진을 업로드하지 못했어요. 잠시 후 다시 시도해주세요.");
      }
    };
    void upload();
  }

  function reorderPhotos(sourceId, targetId) {
    if (!sourceId || sourceId === targetId) return;
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
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function removePhoto(localId) {
    setPhotoItems((current) => {
      const item = current.find((photo) => photo.localId === localId);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return current.filter((photo) => photo.localId !== localId);
    });
  }

  async function finishOnboarding() {
    const hasFrontPhoto = photoItems.some(
      (item) => item.isFrontal && item.fileId,
    );
    if (!hasFrontPhoto) return setError("정면 사진을 먼저 등록해주세요.");
    if (photoItems.some((item) => item.uploading || !item.fileId))
      return setError("사진 업로드가 끝난 뒤 저장해주세요.");
    if (photoSaving) return;

    setPhotoSaving(true);
    setError("");
    try {
      await profileApi.profileImages(
        photoItems.map((item) => ({
          fileId: item.fileId,
          isFrontal: item.isFrontal,
        })),
      );
      const status = await userApi.onboarding();
      if (status?.userStatus !== "ACTIVE") {
        setData((old) => ({
          ...old,
          onboardingStep: onboardingStepFromStatus(status),
        }));
        setError("온보딩을 완료하지 못했어요. 입력 정보를 다시 확인해주세요.");
        return;
      }
      setData((old) => ({
        ...old,
        onboarded: true,
        onboardingStep: "complete",
      }));
      toast("환영해요! 새로운 인연을 만나보세요.");
      navigate("/home");
    } catch {
      setError("프로필 사진을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setPhotoSaving(false);
    }
  }

  const progress = (Math.max(0, stepIndex) / ONBOARDING_STEPS.length) * 100;
  const isRegistrationInfoStep = step === "identity";
  const ageRestriction = isValidBirthDate(profile.birthDate)
    ? getRegistrationAgeRestriction(profile.birthDate)
    : null;
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
    <form
      className={`onboarding-page${isRegistrationInfoStep ? " registration-info-page" : ""}`}
      onKeyDown={handleIdentityEnter}
      onSubmit={(event) => event.preventDefault()}
      aria-label="온보딩"
    >
      {!isRegistrationInfoStep && (
        <>
          <header className="onboarding-top">
            <button
              type="button"
              className="plain-back"
              onClick={back}
              aria-label="뒤로가기"
            >
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
              "[필수] 만 19세 이상, 만 40세 미만 확인",
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
            {ageRestriction && (
              <p className="identity-age-helper" role="alert">
                {ageRestriction.helperMessage}
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
                    aria-describedby={
                      nameHelper ? "identity-name-helper" : undefined
                    }
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
              <li>
                가입 후에는 기본 정보를 변경할 수 없어요. 신중하게 입력해주세요.
              </li>
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
                onChange={(e) => setRegionQuery(e.target.value)}
                placeholder="시/군/구를 입력하세요"
              />
            </Field>
            {regionSearchStatus === "loading" && (
              <p className="region-search-state" role="status">
                활동 지역을 검색하고 있어요.
              </p>
            )}
            {regionSearchStatus === "empty" && (
              <p className="region-search-state" role="status">
                검색 결과가 없어요.
              </p>
            )}
            {regionSearchStatus === "error" && (
              <p className="field-error region-search-state" role="alert">
                {regionSearchError}
              </p>
            )}
            <div className="region-list">
              {regionResults.map((item) => (
                <button
                  type="button"
                  key={item.activityRegionId}
                  className={
                    profile.activityRegionId === item.activityRegionId
                      ? "selected"
                      : ""
                  }
                  onClick={() => {
                    setError("");
                    setData((old) => ({
                      ...old,
                      profile: {
                        ...old.profile,
                        activityRegionId: item.activityRegionId,
                        regionName: item.name,
                      },
                    }));
                  }}
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
              <span>{personaConversation?.progress || "준비 중"}</span>
            </div>
            <p className="subcopy">
              프로필만으로 알기 어려운 부분을 여쭤볼게요.
            </p>
            <div className="question-bubble">
              <Icon name="ai-avatar.svg" />
              <div>
                {(personaConversation?.segments || []).length > 0
                  ? personaConversation.segments.map((segment) => (
                      <p key={`${segment.type}-${segment.text}`}>
                        {segment.text}
                      </p>
                    ))
                  : personaConversation?.utterance || "질문을 준비하고 있어요."}
              </div>
            </div>
            {personaConversation && !personaConversation.done && (
              <>
                <Field label="나의 답변">
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="자유롭게 답해보세요"
                    maxLength={200}
                    rows={5}
                    disabled={personaBusy}
                  />
                </Field>
                <div className="persona-actions">
                  {personaConversation.canSkip && (
                    <button
                      type="button"
                      onClick={() =>
                        updatePersonaConversation(personaApi.personaSkip)
                      }
                      disabled={personaBusy}
                    >
                      이 질문 건너뛰기
                    </button>
                  )}
                  {personaConversation.canFinish && (
                    <button
                      type="button"
                      onClick={() =>
                        updatePersonaConversation(personaApi.personaFinish)
                      }
                      disabled={personaBusy}
                    >
                      여기까지 답할게요
                    </button>
                  )}
                </div>
              </>
            )}
            {!personaConversation && (
              <button
                className="persona-retry"
                type="button"
                onClick={() => void startPersona()}
                disabled={personaBusy}
              >
                {personaBusy ? "질문을 준비하고 있어요..." : "문답 다시 시작"}
              </button>
            )}
          </>
        )}
        {step === "persona-summary" && (
          <>
            <div className="question-progress">
              <strong>이렇게 이해했어요</strong>
              <span>가치관 요약</span>
            </div>
            {personaConversation?.personaDraft?.narrative ? (
              <section className="persona-summary-card">
                <h2>{personaConversation.personaDraft.narrative.headline}</h2>
                <p>{personaConversation.personaDraft.narrative.body}</p>
                <div className="persona-traits">
                  {personaConversation.personaDraft.narrative.traits?.map(
                    (trait) => (
                      <span key={trait}>{trait}</span>
                    ),
                  )}
                </div>
              </section>
            ) : (
              <p className="info-panel">
                지금까지의 답변을 바탕으로 가치관을 정리했어요.
              </p>
            )}
            <div className="persona-summary-list">
              {(personaConversation?.personaDraft?.summaries || []).map(
                (summary) => (
                  <section
                    className="persona-summary-card"
                    key={summary.category}
                  >
                    <small>{summary.category}</small>
                    <h2>{summary.title}</h2>
                    <p>{summary.content}</p>
                  </section>
                ),
              )}
            </div>
            <button
              className="persona-retry"
              type="button"
              onClick={restartPersona}
              disabled={personaBusy}
            >
              다시 답할래요
            </button>
          </>
        )}
        {step === "photo-intro" && (
          <>
            <h1>정면 사진을 먼저 등록해주세요</h1>
            <p className="subcopy">
              얼굴이 잘 보이는 사진은 신뢰할 수 있는 만남을 만드는 데 도움이
              돼요.
            </p>
            <div className="photo-guide">
              <span aria-hidden="true">◉</span>
              <strong>정면을 바라본 최근 사진을 준비해주세요.</strong>
              <ul>
                <li>얼굴이 선명하게 보여야 해요.</li>
                <li>다른 사람과 함께 찍은 사진은 피해요.</li>
                <li>필터가 강한 사진은 피해주세요.</li>
              </ul>
            </div>
          </>
        )}
        {step === "photo" && (
          <>
            <h1>사진으로 나를 소개해주세요</h1>
            <p className="subcopy">사진은 최대 6장까지 등록할 수 있어요.</p>
            {!photoItems.some((item) => item.isFrontal) && (
              <label className="photo-front-upload">
                <strong>정면 사진 등록</strong>
                <span>얼굴이 잘 보이는 정면 사진을 선택해주세요.</span>
                <small>JPG · PNG · WEBP</small>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    addPhotoItem(event.target.files?.[0], true);
                    event.target.value = "";
                  }}
                />
              </label>
            )}
            <section className="onboarding-photo-grid" aria-label="등록한 사진">
              {photoItems.map((item) => (
                <article
                  className="onboarding-photo-tile"
                  data-photo-id={item.localId}
                  draggable={!item.uploading}
                  key={item.localId}
                  onDragStart={() => setDraggedPhotoId(item.localId)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    reorderPhotos(draggedPhotoId, item.localId);
                    setDraggedPhotoId(null);
                  }}
                  onPointerDown={() => {
                    if (!item.uploading) setDraggedPhotoId(item.localId);
                  }}
                  onPointerUp={(event) => {
                    const target = document
                      .elementFromPoint(event.clientX, event.clientY)
                      ?.closest("[data-photo-id]");
                    reorderPhotos(draggedPhotoId, target?.dataset.photoId);
                    setDraggedPhotoId(null);
                  }}
                  onPointerCancel={() => setDraggedPhotoId(null)}
                >
                  <img src={item.previewUrl} alt="등록한 프로필 사진" />
                  {item.isFrontal && <b>정면 사진</b>}
                  {item.uploading && (
                    <span className="photo-uploading">업로드 중</span>
                  )}
                  <button
                    type="button"
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
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => {
                        addPhotoItem(event.target.files?.[0], false);
                        event.target.value = "";
                      }}
                    />
                  </label>
                )}
            </section>
            <div className="info-panel">
              사진을 드래그하면 순서를 바꿀 수 있어요. 정면 사진은 위치가
              바뀌어도 유지돼요.
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
          <PixelButton
            onClick={submitPersonaAnswer}
            disabled={
              !personaConversation || personaConversation.done || personaBusy
            }
          >
            {personaBusy ? "보내는 중..." : "답변 보내기"}
          </PixelButton>
        )}
        {step === "persona-summary" && (
          <PixelButton onClick={confirmPersona} disabled={personaBusy}>
            {personaBusy ? "확정 중..." : "이 내용으로 확정하기"}
          </PixelButton>
        )}
        {step === "photo-intro" && (
          <PixelButton onClick={() => advance("photo")}>
            사진 등록하기
          </PixelButton>
        )}
        {step === "photo" && (
          <PixelButton onClick={finishOnboarding} disabled={photoSaving}>
            {photoSaving ? "저장 중..." : "시작하기"}
          </PixelButton>
        )}
      </div>
    </form>
  );
}
