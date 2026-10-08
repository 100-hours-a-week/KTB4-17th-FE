import { useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { EmptyState, PixelButton } from "../../shared/ui/components.jsx";
import * as preferencesApi from "./api.js";
import {
  defaultPreferences,
  PREFERENCE_CHOICES,
  PREFERENCE_RANGES,
  preferenceSummary,
  preferencesFromResponse,
  togglePreference,
  validatePreferences,
} from "./model.js";

function RangeField({ name, preference, onChange }) {
  const { min, max, label, unit } = PREFERENCE_RANGES[name];
  const suffix = name === "age" ? "Age" : "Height";
  const lowerKey = `min${suffix}`;
  const upperKey = `max${suffix}`;
  const lower = preference[lowerKey] ?? min;
  const upper = preference[upperKey] ?? max;
  return (
    <fieldset className="preference-range-field">
      <legend className="preference-range-label">
        <span>{label}</span>
        <span>
          {lower} ~ {upper}
          {unit}
        </span>
      </legend>
      <div
        className="preference-range"
        style={{
          "--range-start": `${((lower - min) / (max - min)) * 100}%`,
          "--range-end": `${((upper - min) / (max - min)) * 100}%`,
        }}
      >
        <div className="preference-range-track" aria-hidden="true" />
        <input
          type="range"
          className="preference-range-lower"
          min={min}
          max={max}
          step="1"
          value={lower}
          aria-label={`최소 ${label}`}
          aria-valuetext={`${lower}${unit}`}
          style={{ zIndex: lower === max ? 4 : 2 }}
          onChange={(event) =>
            onChange(lowerKey, Math.min(Number(event.target.value), upper))
          }
        />
        <input
          type="range"
          min={min}
          max={max}
          step="1"
          value={upper}
          aria-label={`최대 ${label}`}
          aria-valuetext={`${upper}${unit}`}
          onChange={(event) =>
            onChange(upperKey, Math.max(Number(event.target.value), lower))
          }
        />
      </div>
    </fieldset>
  );
}

function PreferenceSheet({ field, selected, onDone, onClose }) {
  const dialogRef = useRef(null);
  const [draft, setDraft] = useState(() => [...selected]);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="preference-sheet"
      aria-labelledby="preference-sheet-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <div className="preference-sheet-handle" aria-hidden="true" />
      <button
        type="button"
        className="preference-sheet-close"
        aria-label="선택 취소"
        onClick={onClose}
      >
        ×
      </button>
      <h1 id="preference-sheet-title">
        {field.label}
        {field.key === "religion" ? "를 선택해주세요" : ""}
      </h1>
      <div className="preference-sheet-options">
        {[["ANY", "상관없음"], ...field.options].map(([value, label]) => (
          <label className="preference-sheet-option" key={value}>
            <span>{label}</span>
            <input
              type="checkbox"
              checked={
                value === "ANY" ? draft.length === 0 : draft.includes(value)
              }
              onChange={() => setDraft((old) => togglePreference(old, value))}
            />
          </label>
        ))}
      </div>
      <PixelButton
        className="preferences-primary"
        onClick={() => onDone(draft)}
      >
        완료
      </PixelButton>
    </dialog>
  );
}

export function Preferences({ navigate, toast, onSaved }) {
  const [preference, setPreference] = useState(defaultPreferences);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [sheet, setSheet] = useState(null);
  const saveInFlight = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Explicit retries must reload the server settings.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setStatus("loading");
    setError("");
    preferencesApi
      .getPreferences({ signal: controller.signal })
      .then((response) => {
        if (!active) return;
        setPreference(preferencesFromResponse(response));
        setStatus("ready");
      })
      .catch((requestError) => {
        if (!active) return;
        setError(
          apiErrorMessage(
            requestError,
            "선호 설정을 불러오지 못했어요. 다시 시도해주세요.",
          ),
        );
        setStatus("error");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [loadAttempt]);

  function set(key, value) {
    setPreference((old) => ({ ...old, [key]: value }));
    setSaveError("");
  }

  async function save(event) {
    event.preventDefault();
    if (status !== "ready" || saveInFlight.current) return;
    const validation = validatePreferences(preference);
    if (validation) {
      setSaveError(validation);
      return;
    }
    saveInFlight.current = true;
    setSaving(true);
    setSaveError("");
    try {
      await preferencesApi.savePreferences(preference);
      if (!mounted.current) return;
      void onSaved();
      toast("선호 조건을 저장했어요.");
      navigate("/home");
    } catch (requestError) {
      if (mounted.current)
        setSaveError(
          apiErrorMessage(
            requestError,
            "선호 조건을 저장하지 못했어요. 다시 시도해주세요.",
          ),
        );
    } finally {
      saveInFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <>
      <header className="screen-header preferences-header">
        <strong>선호 설정</strong>
        <button
          type="button"
          className="preferences-close"
          aria-label="선호 설정 닫기"
          disabled={saving}
          onClick={() => navigate("/home")}
        >
          ×
        </button>
      </header>
      <main
        className="main-scroll preferences-main"
        aria-busy={status === "loading" || saving}
      >
        {status === "loading" ? (
          <div role="status">
            <EmptyState
              icon="✦"
              title="선호 설정을 불러오고 있어요"
              description="잠시만 기다려주세요."
            />
          </div>
        ) : status === "error" ? (
          <EmptyState
            icon="!"
            title="선호 설정을 불러오지 못했어요"
            description={error}
            action={
              <PixelButton
                secondary
                onClick={() => setLoadAttempt((old) => old + 1)}
              >
                다시 불러오기
              </PixelButton>
            }
          />
        ) : (
          <form onSubmit={save}>
            <fieldset className="preferences-controls" disabled={saving}>
              <RangeField name="age" preference={preference} onChange={set} />
              <RangeField
                name="height"
                preference={preference}
                onChange={set}
              />
              <div className="preference-choice-rows">
                {PREFERENCE_CHOICES.map((field) => (
                  <button
                    type="button"
                    className="preference-choice-row"
                    key={field.key}
                    onClick={() => setSheet(field)}
                    aria-haspopup="dialog"
                  >
                    <span>{field.label}</span>
                    <span className="preference-choice-summary">
                      {preferenceSummary(preference[field.key], field.options)}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
            {saveError && (
              <p className="field-error preferences-error" role="alert">
                {saveError}
              </p>
            )}
            <PixelButton
              type="submit"
              className="preferences-primary preferences-save"
              disabled={saving}
            >
              {saving ? "저장 중..." : "저장하기"}
            </PixelButton>
          </form>
        )}
      </main>
      {sheet && (
        <PreferenceSheet
          field={sheet}
          selected={preference[sheet.key]}
          onClose={() => setSheet(null)}
          onDone={(selected) => {
            set(sheet.key, selected);
            setSheet(null);
          }}
        />
      )}
    </>
  );
}
