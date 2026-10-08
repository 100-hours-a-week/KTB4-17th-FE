import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultPreferences,
  PREFERENCE_CHOICES,
  preferenceSummary,
  preferencesFromResponse,
  togglePreference,
  validatePreferences,
} from "./model.js";

const saved = {
  minAge: 25,
  maxAge: 32,
  minHeight: 160,
  maxHeight: 185,
  religion: ["NONE", "CATHOLIC"],
  drinking: ["NEVER", "SOCIAL"],
  smoking: ["NON_SMOKER"],
};

test("unconfigured server values retain unrestricted nulls and empty lists", () => {
  assert.deepEqual(
    preferencesFromResponse({ preference: defaultPreferences() }),
    defaultPreferences(),
  );
  assert.deepEqual(
    preferencesFromResponse({ preference: null }),
    defaultPreferences(),
  );
  assert.equal(validatePreferences(defaultPreferences()), "");
});

test("saved preferences load all seven fields and do not mutate the API response", () => {
  const result = preferencesFromResponse({ preference: saved });
  assert.deepEqual(result, saved);
  result.religion.push("OTHER");
  assert.deepEqual(saved.religion, ["NONE", "CATHOLIC"]);
});

test("editing selections preserves open-ended bounds", () => {
  const result = preferencesFromResponse({
    preference: { ...saved, minAge: null, maxHeight: null },
  });
  result.smoking = togglePreference(result.smoking, "OCCASIONAL");
  assert.equal(result.minAge, null);
  assert.equal(result.maxHeight, null);
  assert.deepEqual(result.smoking, ["NON_SMOKER", "OCCASIONAL"]);
  assert.equal(validatePreferences(result), "");
});

test("multiple choices toggle independently; any clears all constraints", () => {
  const selected = ["NONE"];
  assert.deepEqual(togglePreference(selected, "CATHOLIC"), [
    "NONE",
    "CATHOLIC",
  ]);
  assert.deepEqual(togglePreference(selected, "NONE"), []);
  assert.deepEqual(togglePreference(selected, "ANY"), []);
  assert.deepEqual(selected, ["NONE"]);
  assert.equal(
    preferenceSummary([], PREFERENCE_CHOICES[0].options),
    "상관없음",
  );
  assert.equal(
    preferenceSummary(["NONE", "CATHOLIC"], PREFERENCE_CHOICES[0].options),
    "무교, 천주교",
  );
});

test("invalid bounds cannot be submitted, including fractions and reversed ranges", () => {
  for (const [key, value] of [
    ["minAge", 18],
    ["maxAge", 40],
    ["minHeight", 129],
    ["maxHeight", 221],
    ["minAge", 25.5],
    ["minHeight", "160"],
    ["minAge", 33],
    ["minHeight", 186],
  ]) {
    assert.notEqual(
      validatePreferences({ ...saved, [key]: value }),
      "",
      `${key}: ${value}`,
    );
  }
  assert.equal(
    validatePreferences({
      ...saved,
      minAge: 19,
      maxAge: 39,
      minHeight: 130,
      maxHeight: 220,
    }),
    "",
  );
  assert.equal(validatePreferences({ ...saved, minAge: 32, maxAge: 32 }), "");
});

test("choice payloads reject unsupported enums, duplicates, null elements and scalar values", () => {
  for (const field of PREFERENCE_CHOICES) {
    for (const selected of [
      ["ANY"],
      [null],
      ["UNKNOWN"],
      [field.options[0][0], field.options[0][0]],
      "NONE",
      null,
    ]) {
      assert.notEqual(
        validatePreferences({ ...saved, [field.key]: selected }),
        "",
      );
    }
  }
});
