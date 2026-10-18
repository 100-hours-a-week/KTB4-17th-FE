import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import {
  defaultPreferences,
  PREFERENCE_CHOICES,
  preferenceSummary,
  preferencesFromResponse,
  preferencesPayload,
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

test("older saved age limits are brought back into the visible 19–39 range", () => {
  const previous = { ...saved, minAge: 40, maxAge: 45 };
  const result = preferencesFromResponse({ preference: previous });
  assert.equal(result.minAge, 39);
  assert.equal(result.maxAge, 39);
  assert.equal(previous.maxAge, 45);
  assert.equal(validatePreferences(result), "");
  const result2 = preferencesFromResponse({
    preference: { ...saved, maxAge: 45 },
  });
  assert.equal(result2.minAge, 25);
  assert.equal(result2.maxAge, 39);
});

test("saving an unrestricted age caps the actual payload at 39 and preserves other open bounds", () => {
  const preference = defaultPreferences();
  assert.deepEqual(preferencesPayload(preference), {
    ...preference,
    maxAge: 39,
  });
  assert.equal(preference.maxAge, null);
  assert.deepEqual(preferencesPayload(saved), saved);
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

const preferencesSource = readFileSync(
  new URL("./Preferences.jsx", import.meta.url),
  "utf8",
);
const saveStart = preferencesSource.indexOf("  async function save(event)");
const saveEnd = preferencesSource.indexOf("\n  return (", saveStart);
const createSave = new Function(
  "context",
  `const { status, saveInFlight, preference, validatePreferences, setSaveError,
    setSaving, preferencesApi, mounted, onSaved, toast, navigate, apiErrorMessage, preferencesPayload } = context;
  ${preferencesSource.slice(saveStart, saveEnd)}
  return save;`,
);

function saveHarness(savePreferences) {
  const events = [];
  const saveInFlight = { current: false };
  const mounted = { current: true };
  const save = createSave({
    status: "ready",
    saveInFlight,
    preference: saved,
    validatePreferences,
    preferencesPayload,
    setSaveError: (error) => {
      if (error) events.push(["error", error]);
    },
    setSaving: (saving) => events.push(["saving", saving]),
    preferencesApi: { savePreferences },
    mounted,
    onSaved: () => events.push(["reload"]),
    toast: () => events.push(["toast"]),
    navigate: (path) => events.push(["navigate", path]),
    apiErrorMessage,
  });
  return {
    save: () => save({ preventDefault() {} }),
    events,
    saveInFlight,
    mounted,
  };
}

test("successful saving reloads recommendations before navigating home", async () => {
  let completeSave;
  const pending = new Promise((resolve) => {
    completeSave = resolve;
  });
  const harness = saveHarness(() => pending);
  const saving = harness.save();
  assert.deepEqual(harness.events, [["saving", true]]);
  completeSave();
  await saving;
  assert.deepEqual(harness.events, [
    ["saving", true],
    ["reload"],
    ["toast"],
    ["navigate", "/home"],
    ["saving", false],
  ]);
  assert.equal(harness.saveInFlight.current, false);
});

test("failed saving stays on preferences and does not reload recommendations", async () => {
  const harness = saveHarness(async () => {
    throw new Error("offline");
  });
  await harness.save();
  assert.equal(
    harness.events.some(
      ([event]) => event === "reload" || event === "navigate",
    ),
    false,
  );
  assert.equal(
    harness.events.some(([event]) => event === "error"),
    true,
  );
  assert.equal(harness.saveInFlight.current, false);
});

test("saving does not navigate or reload after leaving preferences", async () => {
  let completeSave;
  const pending = new Promise((resolve) => {
    completeSave = resolve;
  });
  const harness = saveHarness(() => pending);
  const saving = harness.save();
  harness.mounted.current = false;
  completeSave();
  await saving;
  assert.deepEqual(harness.events, [["saving", true]]);
  assert.equal(harness.saveInFlight.current, false);
});
