import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { initialProfile } from "../features/profile/data.js";

const APP_STORAGE_VERSION = "3";
const APP_STORAGE_PREFIX = "pocket-signal-v3";
const STORAGE_VERSION_KEY = "pocket-signal-storage-version";
const LEGACY_STORAGE_KEYS = [
  "pocket-signal-v1-demo",
  "pocket-signal-v1-api",
  "pocket-signal-v1",
  "pocket-signal-v2-demo:account",
  "pocket-signal-v2-demo:profile",
  "pocket-signal-v2-demo:matching",
  "pocket-signal-v2-demo:chat",
  "pocket-signal-v2-demo:aipractice",
  "pocket-signal-v2-demo:aisimulation",
  "pocket-signal-v2-demo:notifications",
  "pocket-signal-v2-demo:preferences",
  "pocket-signal-v2-api:account",
  "pocket-signal-v2-api:profile",
  "pocket-signal-v2-api:matching",
  "pocket-signal-v2-api:chat",
  "pocket-signal-v2-api:aipractice",
  "pocket-signal-v2-api:aisimulation",
  "pocket-signal-v2-api:notifications",
  "pocket-signal-v2-api:preferences",
];

const AppStateContext = createContext(null);

export function makeInitialState() {
  return {
    session: false,
    onboarded: false,
    onboardingStep: "identity",
    registrationInfoConfirmed: false,
    agreed: false,
    terms: [false, false, false, false],
    profile: { ...initialProfile },
    notifications: [],
  };
}

function clearLegacyStateOnce() {
  if (localStorage.getItem(STORAGE_VERSION_KEY) === APP_STORAGE_VERSION) return;
  for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key);
  localStorage.setItem(STORAGE_VERSION_KEY, APP_STORAGE_VERSION);
}

export function loadInitialState() {
  const initial = makeInitialState();
  try {
    clearLegacyStateOnce();
    const stored = JSON.parse(
      localStorage.getItem(`${APP_STORAGE_PREFIX}:app`) || "null",
    );
    if (stored && typeof stored === "object") {
      if (stored.profile && typeof stored.profile === "object")
        initial.profile = { ...initial.profile, ...stored.profile };
      if (Array.isArray(stored.notifications))
        initial.notifications = stored.notifications;
      // Only a successful server session check can confirm registration.
      initial.registrationInfoConfirmed = false;
      initial.onboardingStep = "identity";
      initial.agreed = Boolean(stored.agreed);
      if (Array.isArray(stored.terms) && stored.terms.length === 4)
        initial.terms = stored.terms.map(Boolean);
    }
  } catch {
    // Keep the app usable when browser storage is unavailable or malformed.
  }
  return initial;
}

export function AppStateProvider({ children }) {
  const [data, setData] = useState(loadInitialState);
  useEffect(() => {
    const hasConfirmedIdentity =
      data.registrationInfoConfirmed || data.onboarded;
    const storedData = hasConfirmedIdentity
      ? data
      : {
          ...data,
          profile: { ...data.profile, name: "", birthDate: "", gender: "" },
        };
    try {
      const persisted = {
        onboardingStep: storedData.onboardingStep,
        registrationInfoConfirmed: storedData.registrationInfoConfirmed,
        agreed: storedData.agreed,
        terms: storedData.terms,
        profile: storedData.profile,
        notifications: storedData.notifications,
      };
      localStorage.setItem(
        `${APP_STORAGE_PREFIX}:app`,
        JSON.stringify(persisted),
      );
    } catch {
      // Keep the app usable when browser storage is unavailable.
    }
  }, [data]);
  const value = useMemo(() => ({ data, setData }), [data]);
  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const value = useContext(AppStateContext);
  if (!value)
    throw new Error("useAppState must be used inside AppStateProvider");
  return value;
}
