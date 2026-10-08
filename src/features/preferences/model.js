import { drinkings, religions, smokings } from "../profile/data.js";

export const PREFERENCE_RANGES = {
  age: { min: 19, max: 39, label: "나이", unit: "세" },
  height: { min: 130, max: 220, label: "키", unit: "cm" },
};

export const PREFERENCE_CHOICES = [
  { key: "religion", label: "종교", options: religions },
  { key: "drinking", label: "음주", options: drinkings },
  { key: "smoking", label: "흡연", options: smokings },
];

export function defaultPreferences() {
  return {
    minAge: null,
    maxAge: null,
    minHeight: null,
    maxHeight: null,
    religion: [],
    drinking: [],
    smoking: [],
  };
}

// Preserve unrestricted bounds when only another field is edited.
// Sliders display the service's full supported range for null bounds.
export function preferencesFromResponse(response) {
  const preference = response?.preference || defaultPreferences();
  return {
    minAge: preference.minAge ?? null,
    maxAge: preference.maxAge ?? null,
    minHeight: preference.minHeight ?? null,
    maxHeight: preference.maxHeight ?? null,
    ...Object.fromEntries(
      PREFERENCE_CHOICES.map(({ key }) => [key, [...(preference[key] || [])]]),
    ),
  };
}

export function togglePreference(selected, value) {
  if (value === "ANY") return [];
  return selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value];
}

export function preferenceSummary(selected, options) {
  const labels = options
    .filter(([key]) => selected.includes(key))
    .map(([, label]) => label);
  return labels.length ? labels.join(", ") : "상관없음";
}

export function validatePreferences(preference) {
  for (const [name, { min, max, label, unit }] of Object.entries(
    PREFERENCE_RANGES,
  )) {
    const suffix = name === "age" ? "Age" : "Height";
    const lower = preference[`min${suffix}`];
    const upper = preference[`max${suffix}`];
    if (
      [lower, upper].some(
        (value) =>
          value != null &&
          (!Number.isInteger(value) || value < min || value > max),
      )
    )
      return `${label} 범위는 ${min}~${max}${unit}로 설정해주세요.`;
    if (lower != null && upper != null && lower > upper)
      return `최소 ${label}는 최대 ${label}보다 클 수 없어요.`;
  }
  for (const { key, label, options } of PREFERENCE_CHOICES) {
    const selected = preference[key];
    if (
      !Array.isArray(selected) ||
      selected.some((value) => !options.some(([key]) => key === value)) ||
      new Set(selected).size !== selected.length
    )
      return `${label} 선택을 다시 확인해주세요.`;
  }
  return "";
}
