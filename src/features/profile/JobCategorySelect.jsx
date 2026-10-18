import { useEffect, useId, useRef } from "react";
import { Field } from "../../shared/ui/components.jsx";
import { PixelIcon } from "../../shared/ui/pixel.jsx";
import { jobCategories, normalizeJobCategory } from "./jobCategories.js";

export function JobCategorySelect({
  value,
  onChange,
  disabled = false,
  error = "",
}) {
  const id = useId();
  const selectRef = useRef(null);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const selected = normalizeJobCategory(value);
  useEffect(() => {
    if (error) selectRef.current?.focus();
  }, [error]);
  return (
    <Field label="직업군">
      <div className="job-category-control">
        <select
          id={id}
          name="job"
          autoComplete="off"
          ref={selectRef}
          className={`job-category-select${selected ? " has-value" : ""}`}
          aria-label="직업군"
          aria-describedby={`${hintId}${error ? ` ${errorId}` : ""}`}
          aria-invalid={error ? true : undefined}
          value={selected}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          required
        >
          <option value="" disabled>
            직업군을 선택해 주세요
          </option>
          {jobCategories.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        <span className="job-category-arrow" aria-hidden="true">
          <PixelIcon name="chev" scale={2} />
        </span>
      </div>
      <small className="hint" id={hintId}>
        현재 주로 하는 일이나 활동을 선택해 주세요.
      </small>
      {error && (
        <small className="field-error" id={errorId} role="alert">
          {error}
        </small>
      )}
    </Field>
  );
}
