import { useCallback, useEffect, useRef, useState } from "react";
import { storeBearerToken } from "../../shared/api/authToken.js";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { useAppState } from "../../shared/appState.jsx";
import { asset } from "../../shared/assets.js";
import {
  ChoiceGroup,
  Field,
  PixelButton,
} from "../../shared/ui/components.jsx";
import { PixelIcon } from "../../shared/ui/pixel.jsx";
import { onboardingStepFromStatus } from "../../shared/utils.js";
import { regions as searchActivityRegions } from "../activity-region/api.js";
import { beginKakaoLogin } from "../auth/api.js";
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
import {
  createPhotoId,
  prepareProfilePhoto,
  profilePhotoErrorMessage,
} from "../profile/photoUpload.js";
import { profilePayload } from "../profile/serialize.js";
import * as userApi from "../user/api.js";
import { isValidBirthDate, normalizeBirthDate } from "../user/birthDate.js";
import { getRegistrationAgeRestriction } from "../user/registrationAge.js";

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
const STEP_LABELS = {
  identity: "기본 정보",
  region: "활동 지역",
  profile: "프로필",
  lifestyle: "라이프스타일",
  questions: "가치관 문답",
  "persona-summary": "가치관 요약",
  "photo-intro": "사진 준비",
  photo: "사진",
};
const PERSONA_ANSWER_LIMIT = 200;
const pad2 = (value) => String(value).padStart(2, "0");
const formatPersonaProgress = (progress) =>
  progress ? progress.replace(/\d+/g, (value) => pad2(value)) : "";
const chatTime = () =>
  new Date().toLocaleTimeString("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
  });
const PERSONA_FLOW_STEPS = new Set([
  "questions",
  "persona-summary",
  "photo-intro",
  "photo",
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

export { isValidBirthDate } from "../user/birthDate.js";

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
  const selectedDate = normalizeBirthDate(value);
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
            aria-label="월 한 자리 또는 두 자리"
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
            aria-label="일 한 자리 또는 두 자리"
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
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityAuthExpired, setIdentityAuthExpired] = useState(false);
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
  const [personaLog, setPersonaLog] = useState([]);
  const personaChatRef = useRef(null);
  const [photoItems, setPhotoItems] = useState([]);
  const [photoSaving, setPhotoSaving] = useState(false);
  const draggedPhotoId = useRef(null);
  const localPhotoUrls = useRef(new Set());
  const removedPhotoIds = useRef(new Set());
  const mounted = useRef(false);
  const identitySubmitInFlight = useRef(false);
  const profileSaveInFlight = useRef(false);
  const personaStartInFlight = useRef(false);
  const profile = data.profile;
  const hasRegisteredIdentity = data.session && data.registrationInfoConfirmed;
  const step = !hasRegisteredIdentity
    ? "identity"
    : data.onboardingStep === "identity"
      ? "region"
      : data.onboardingStep;
  const stepIndex = ONBOARDING_STEPS.indexOf(step);
  const isPersonaFlowStep = PERSONA_FLOW_STEPS.has(step);
  const canGoBack = stepIndex > (hasRegisteredIdentity ? 1 : 0);
  const updateProfile = (key, value) =>
    setData((old) => ({ ...old, profile: { ...old.profile, [key]: value } }));
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const url of localPhotoUrls.current) URL.revokeObjectURL(url);
      localPhotoUrls.current.clear();
    };
  }, []);
  function handleNameChange(event) {
    const nextName = event.currentTarget.value;
    updateProfile("name", nextName);
    setError("");
    if (nameTouched) {
      setNameHelper(
        isValidKoreanName(nextName)
          ? ""
          : "이름은 한글 2~8자 이내로 입력해주세요",
      );
    }
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
    if (hasRegisteredIdentity && stepIndex <= 1) return;
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
          apiErrorMessage(
            requestError,
            "활동 지역을 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
          ),
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
      if (!conversation?.done) {
        const lines = conversation?.segments?.length
          ? conversation.segments
          : [{ type: "question", text: conversation?.utterance || "" }];
        setPersonaLog((log) => [
          ...log,
          {
            id: `haru-${conversation?.turnIndex ?? log.length}-${log.length}`,
            from: "haru",
            turn: (conversation?.turnIndex ?? 0) + 1,
            lines: lines.filter((line) => line.text),
            time: chatTime(),
          },
        ]);
        return;
      }
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
      } catch (requestError) {
        setError(
          apiErrorMessage(
            requestError,
            "가치관 요약을 불러오지 못했어요. 다시 시도해주세요.",
          ),
        );
      }
    },
    [advance],
  );

  const startPersona = useCallback(async () => {
    if (personaStartInFlight.current) return;
    personaStartInFlight.current = true;
    setPersonaBusy(true);
    setError("");
    setPersonaLog([]);
    try {
      const conversation = await personaApi.personaStart();
      await applyConversation(conversation);
    } catch (requestError) {
      setError(
        apiErrorMessage(
          requestError,
          "AI 문답을 시작하지 못했어요. 잠시 후 다시 시도해주세요.",
        ),
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

  useEffect(() => {
    const chat = personaChatRef.current;
    if (chat && personaLog.length) chat.scrollTop = chat.scrollHeight;
  }, [personaLog]);

  function handlePersonaKeyDown(event) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    void submitPersonaAnswer();
  }

  async function submitIdentity() {
    if (identitySubmitInFlight.current || identityAuthExpired) return;
    if (hasRegisteredIdentity) {
      advance("region");
      navigate("/onboarding", { replace: true });
      return;
    }
    const name = profile.name;
    const birthDate = normalizeBirthDate(profile.birthDate);
    if (!birthDate)
      return setError(
        "실제로 존재하는 생년월일을 입력해주세요. 월과 일은 한 자리로 입력해도 돼요.",
      );
    if (!isValidKoreanName(name)) {
      setError("");
      setNameTouched(true);
      setNameHelper("이름은 한글 2~8자 이내로 입력해주세요");
      return;
    }
    if (getRegistrationAgeRestriction(birthDate)) {
      setError("");
      navigate("/registration/restricted");
      return;
    }
    if (!profile.gender) return setError("성별을 선택해주세요.");

    identitySubmitInFlight.current = true;
    setIdentitySaving(true);
    setError("");
    try {
      const authResponse = await userApi.identity({
        name,
        birthDate,
        gender: profile.gender,
      });
      storeBearerToken(authResponse);
      setData((old) => ({
        ...old,
        session: true,
        onboardingStep: "region",
        registrationInfoConfirmed: true,
        profile: {
          ...old.profile,
          name,
          birthDate,
          gender: profile.gender,
        },
      }));
      navigate("/onboarding", { replace: true });
    } catch (e) {
      if (e.code === "USER_AGE_REQUIREMENT_NOT_MET") {
        setError("");
        navigate("/registration/restricted");
        return;
      }
      if (e.code === "AUTH_REQUIRED" || e.status === 401) {
        setIdentityAuthExpired(true);
        setError(
          "가입 상태를 확인할 수 없어요. 카카오 인증을 다시 진행해주세요.",
        );
        return;
      }
      setError(
        apiErrorMessage(
          e,
          "기본 정보를 저장하지 못했어요. 잠시 후 다시 시도해주세요.",
        ),
      );
    } finally {
      identitySubmitInFlight.current = false;
      setIdentitySaving(false);
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
    try {
      const checked = await userApi.nickname(profile.nickname);
      if (!checked?.available) return setError("이미 사용 중인 닉네임이에요.");
    } catch (e) {
      return setError(
        apiErrorMessage(
          e,
          "닉네임 사용 가능 여부를 확인하지 못했어요. 잠시 후 다시 시도해주세요.",
        ),
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

    setError(
      apiErrorMessage(
        requestError,
        "프로필을 저장하지 못했어요. 잠시 후 다시 시도해주세요.",
      ),
    );
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

    const messageId = `me-${personaConversation.turnIndex}-${Date.now()}`;
    setPersonaBusy(true);
    setError("");
    setAnswer("");
    setPersonaLog((log) => [
      ...log,
      { id: messageId, from: "me", text: trimmedAnswer, pending: true },
    ]);
    try {
      const conversation = await personaApi.personaAnswer(
        personaConversation.sessionId,
        { answer: trimmedAnswer, turnIndex: personaConversation.turnIndex },
      );
      setPersonaLog((log) =>
        log.map((entry) =>
          entry.id === messageId
            ? { ...entry, pending: false, time: chatTime() }
            : entry,
        ),
      );
      await applyConversation(conversation);
    } catch (requestError) {
      setPersonaLog((log) => log.filter((entry) => entry.id !== messageId));
      setAnswer(trimmedAnswer);
      setError(
        apiErrorMessage(
          requestError,
          "답변을 보내지 못했어요. 잠시 후 다시 시도해주세요.",
        ),
      );
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
    } catch (requestError) {
      setError(
        apiErrorMessage(
          requestError,
          "AI 문답을 진행하지 못했어요. 잠시 후 다시 시도해주세요.",
        ),
      );
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
    } catch (requestError) {
      setError(
        apiErrorMessage(
          requestError,
          "가치관을 확정하지 못했어요. 잠시 후 다시 시도해주세요.",
        ),
      );
    } finally {
      setPersonaBusy(false);
    }
  }

  function addPhotoItem(file, isFrontal) {
    if (!file || photoSaving) return;
    if (photoItems.length >= 6) {
      setError("사진은 최대 6장까지 등록할 수 있어요.");
      return;
    }

    const localId = createPhotoId();
    const previewUrl = URL.createObjectURL(file);
    localPhotoUrls.current.add(previewUrl);
    setPhotoItems((current) => [
      ...current,
      { localId, previewUrl, fileId: null, isFrontal, uploading: true },
    ]);
    setError("");

    const upload = async () => {
      let currentPreview = previewUrl;
      try {
        const prepared = await prepareProfilePhoto(file);
        if (!mounted.current || removedPhotoIds.current.has(localId)) return;
        currentPreview = URL.createObjectURL(prepared);
        localPhotoUrls.current.add(currentPreview);
        URL.revokeObjectURL(previewUrl);
        localPhotoUrls.current.delete(previewUrl);
        setPhotoItems((current) =>
          current.map((item) =>
            item.localId === localId
              ? { ...item, previewUrl: currentPreview }
              : item,
          ),
        );
        const metadata = await profileApi.uploadProfileImage(prepared);
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
        setError(profilePhotoErrorMessage(error));
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
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
        localPhotoUrls.current.delete(item.previewUrl);
      }
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
    } catch (requestError) {
      setError(
        apiErrorMessage(
          requestError,
          "프로필 사진을 저장하지 못했어요. 잠시 후 다시 시도해주세요.",
        ),
      );
    } finally {
      setPhotoSaving(false);
    }
  }

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
      className={`onboarding-page onboarding-step-${step}`}
      onKeyDown={handleIdentityEnter}
      onSubmit={(event) => event.preventDefault()}
      aria-label="온보딩"
    >
      <header className="brand-header onboarding-brand">
        <img
          className="brand-header-logo"
          src={asset("logo-header.png?v=6cf477a")}
          alt="*23#"
        />
        <span className="brand-signal" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="brand-battery" aria-hidden="true" />
      </header>
      <div className="onboarding-top">
        <i className="onboarding-dot left" aria-hidden="true" />
        {isPersonaFlowStep || !canGoBack ? (
          <span className="onboarding-back-placeholder" aria-hidden="true" />
        ) : (
          <button
            type="button"
            className="onboarding-back"
            onClick={back}
            aria-label="뒤로가기"
          >
            <PixelIcon name="back" />
          </button>
        )}
        <div
          className="onboarding-progress"
          role="progressbar"
          aria-label="온보딩 진행도"
          aria-valuemin={1}
          aria-valuemax={ONBOARDING_STEPS.length}
          aria-valuenow={stepIndex + 1}
        >
          {ONBOARDING_STEPS.map((item, index) => (
            <i
              key={item}
              className={
                index < stepIndex ? "on" : index === stepIndex ? "cur" : ""
              }
            />
          ))}
        </div>
        <span className="onboarding-count">
          {pad2(stepIndex + 1)}/{pad2(ONBOARDING_STEPS.length)}
        </span>
        <i className="onboarding-dot right" aria-hidden="true" />
      </div>
      <p className="onboarding-eyebrow">
        ✦ STEP {pad2(stepIndex + 1)} <em>· {STEP_LABELS[step]}</em>
      </p>
      <div className="onboarding-body" key={step}>
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
            <p className="subcopy">본인 확인을 위한 정보예요.</p>
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
            <section className="onboarding-note tint">
              <strong className="onboarding-note-label">
                <PixelIcon name="lock" />
                PRIVATE MODE
              </strong>
              <ul>
                <li>입력한 생년월일은 성인 확인과 프로필 생일에 사용돼요.</li>
                <li>
                  가입 후에는 기본 정보를 변경할 수 없어요. 신중하게
                  입력해주세요.
                </li>
              </ul>
            </section>
          </>
        )}
        {step === "region" && (
          <>
            <h1>활동 지역을 알려주세요</h1>
            <p className="subcopy">
              가까운 사람들을 추천해드려요. 활동 지역은 시·군·구 단위까지 검색할
              수 있어요.
            </p>
            <Field label="지역 검색">
              <div className="input-affix">
                <span className="input-lead" aria-hidden="true">
                  <PixelIcon name="search" />
                </span>
                <input
                  value={regionQuery}
                  onChange={(e) => setRegionQuery(e.target.value)}
                  placeholder="시·군·구 검색 (예: 수원시, 강남구)"
                />
              </div>
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
            <div
              className={`region-list${regionResults.length ? " has-items" : ""}${regionResults.some((item) => item.activityRegionId === profile.activityRegionId) ? " has-selection" : ""}`}
            >
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
                  <PixelIcon
                    name={
                      profile.activityRegionId === item.activityRegionId
                        ? "radioOn"
                        : "radio"
                    }
                  />
                </button>
              ))}
            </div>
            {profile.regionName && (
              <section className="onboarding-note tint">
                <strong className="onboarding-note-label">
                  <PixelIcon name="pin" />
                  SELECTED AREA
                </strong>
                <p>
                  선택한 지역 · <b>{profile.regionName}</b>
                </p>
              </section>
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
              <div className="input-affix">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={3}
                  value={profile.height}
                  onChange={(e) =>
                    updateProfile(
                      "height",
                      e.target.value.replace(/\D/g, "").slice(0, 3),
                    )
                  }
                  placeholder="키를 입력해주세요"
                />
                <span className="input-suffix">cm</span>
              </div>
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
            <h1 className="onboarding-title">
              하루와의 대화
              <small>
                {formatPersonaProgress(personaConversation?.progress) ||
                  "준비 중"}
              </small>
            </h1>
            <div
              className="persona-chat"
              ref={personaChatRef}
              aria-live="polite"
            >
              {personaLog.map((entry, index) =>
                entry.from === "haru" ? (
                  <div className="persona-chat-group" key={entry.id}>
                    <p className="persona-chat-system">
                      <b>Q.{pad2(entry.turn)}</b>
                      {index === 0
                        ? "프로필만으로 알기 어려운 부분을 여쭤볼게요"
                        : "다음 질문"}
                    </p>
                    <div className="persona-chat-who">
                      <span className="persona-chat-avatar">
                        <PixelIcon name="robot" />
                      </span>
                      하루
                      <small>AI MATE</small>
                    </div>
                    {entry.lines.map((line) => (
                      <p
                        className={`persona-bubble left${line.type === "question" ? " question" : ""}`}
                        key={`${entry.id}-${line.type}-${line.text}`}
                      >
                        {line.text}
                      </p>
                    ))}
                    <small className="persona-chat-meta left">
                      {entry.time}
                    </small>
                  </div>
                ) : (
                  <div className="persona-chat-group mine" key={entry.id}>
                    <p
                      className={`persona-bubble right${entry.pending ? " sending" : ""}`}
                    >
                      {entry.text}
                    </p>
                    <small className="persona-chat-meta right">
                      {entry.pending ? "전송 중" : `읽음 · ${entry.time}`}
                    </small>
                  </div>
                ),
              )}
              {personaBusy && (
                <p
                  className="persona-bubble left typing"
                  role="status"
                  aria-label="하루가 입력하고 있어요"
                >
                  <i />
                  <i />
                  <i />
                </p>
              )}
              {personaConversation &&
                !personaConversation.done &&
                (personaConversation.canSkip ||
                  personaConversation.canFinish) && (
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
                )}
              {!personaConversation && !personaBusy && (
                <button
                  className="persona-retry"
                  type="button"
                  onClick={() => void startPersona()}
                >
                  문답 다시 시작
                </button>
              )}
            </div>
          </>
        )}
        {step === "persona-summary" && (
          <>
            <h1>이렇게 이해했어요</h1>
            <p className="subcopy">답변을 바탕으로 정리한 나의 가치관이에요.</p>
            <div className="persona-summary-list">
              {personaConversation?.personaDraft?.narrative ? (
                <section className="persona-summary-card holo">
                  <small>MY TYPE</small>
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
              {(personaConversation?.personaDraft?.summaries || []).map(
                (summary) => (
                  <section
                    className="persona-summary-card"
                    key={summary.category}
                  >
                    <small>{summary.category}</small>
                    <h3>{summary.title}</h3>
                    <p>{summary.content}</p>
                  </section>
                ),
              )}
            </div>
          </>
        )}
        {step === "photo-intro" && (
          <>
            <h1>정면 사진을 먼저 등록해주세요</h1>
            <p className="subcopy">
              얼굴이 잘 보이는 사진은 신뢰할 수 있는 만남을 만드는 데 도움이
              돼요.
            </p>
            <div className="photo-viewfinder" aria-hidden="true">
              <i className="corner tl" />
              <i className="corner tr" />
              <i className="corner bl" />
              <i className="corner br" />
              <span>FRONT VIEW</span>
              <PixelIcon name="bust" scale={11} />
            </div>
            <section className="onboarding-note">
              <strong className="onboarding-note-label">
                <PixelIcon name="target" />
                PHOTO GUIDE
              </strong>
              <ul>
                <li>얼굴이 선명하게 보여야 해요.</li>
                <li>다른 사람과 함께 찍은 사진은 피해요.</li>
                <li>필터가 강한 사진은 피해주세요.</li>
              </ul>
            </section>
          </>
        )}
        {step === "photo" && (
          <>
            <h1>사진으로 나를 소개해주세요</h1>
            <p className="subcopy">사진은 최대 6장까지 등록할 수 있어요.</p>
            {!photoItems.some((item) => item.isFrontal) && (
              <label className="photo-front-upload">
                <span className="photo-front-plus" aria-hidden="true">
                  <PixelIcon name="plus" scale={3} />
                </span>
                <strong>정면 사진 등록</strong>
                <span>얼굴이 잘 보이는 정면 사진을 선택해주세요.</span>
                <small className="photo-formats">
                  <span>JPG</span>
                  <span>PNG</span>
                  <span>WEBP</span>
                  <span>HEIC</span>
                </small>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif"
                  disabled={photoSaving}
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
                  draggable={!item.uploading && !photoSaving}
                  key={item.localId}
                  onDragStart={(event) => {
                    draggedPhotoId.current = item.localId;
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", item.localId);
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
                    event.currentTarget.setPointerCapture(event.pointerId);
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
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                  }}
                  onPointerCancel={() => {
                    draggedPhotoId.current = null;
                  }}
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
                    disabled={photoSaving}
                  >
                    <PixelIcon name="x" />
                  </button>
                </article>
              ))}
              {photoItems.length < 6 &&
                photoItems.some((item) => item.isFrontal) && (
                  <label className="onboarding-photo-add">
                    <PixelIcon name="plus" />
                    <small>추가 사진</small>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif"
                      disabled={photoSaving}
                      onChange={(event) => {
                        addPhotoItem(event.target.files?.[0], false);
                        event.target.value = "";
                      }}
                    />
                  </label>
                )}
            </section>
            <section className="onboarding-note tint">
              <strong className="onboarding-note-label">
                <PixelIcon name="spark" />
                TIP
              </strong>
              <p>
                사진을 드래그하면 순서를 바꿀 수 있어요. 정면 사진은 위치가
                바뀌어도 유지돼요.
              </p>
            </section>
          </>
        )}
        {error && (
          <p role="alert" className="field-error screen-error onboarding-error">
            <PixelIcon name="alert" />
            {error}
          </p>
        )}
      </div>
      <div className="onboarding-action">
        {step === "identity" && (
          <PixelButton
            onClick={identityAuthExpired ? beginKakaoLogin : submitIdentity}
            disabled={identitySaving}
          >
            {identitySaving
              ? "저장 중..."
              : identityAuthExpired
                ? "카카오 인증 다시 하기"
                : "다음"}
          </PixelButton>
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
          <div className="persona-composer">
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={handlePersonaKeyDown}
              placeholder={
                personaBusy ? "답변을 보내고 있어요" : "자유롭게 답해보세요"
              }
              maxLength={PERSONA_ANSWER_LIMIT}
              rows={1}
              aria-label="나의 답변"
              disabled={
                !personaConversation || personaConversation.done || personaBusy
              }
            />
            <button
              type="button"
              className="persona-send"
              onClick={submitPersonaAnswer}
              aria-label="답변 보내기"
              disabled={
                !personaConversation ||
                personaConversation.done ||
                personaBusy ||
                !answer.trim()
              }
            >
              <PixelIcon name="send" />
            </button>
            <small className="persona-composer-count">
              {answer.length}/{PERSONA_ANSWER_LIMIT}
            </small>
            <small className="persona-composer-hint">
              Enter 보내기 · Shift+Enter 줄바꿈
            </small>
          </div>
        )}
        {step === "persona-summary" && (
          <>
            <PixelButton
              secondary
              className="onboarding-ghost"
              onClick={restartPersona}
              disabled={personaBusy}
            >
              다시 답할래요
            </PixelButton>
            <PixelButton onClick={confirmPersona} disabled={personaBusy}>
              {personaBusy ? "확정 중..." : "이 내용으로 확정"}
            </PixelButton>
          </>
        )}
        {step === "photo-intro" && (
          <PixelButton className="pink" onClick={() => advance("photo")}>
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
