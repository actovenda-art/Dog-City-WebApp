export const PRIVACY_NOTICE_VERSION = "2026-07-30";
export const TERMS_VERSION = "2026-07-30";
export const COOKIE_POLICY_VERSION = "2026-07-30";

export const PRIVACY_PREFERENCES_KEY = "dogcity_privacy_preferences_v1";
export const PRIVACY_PREFERENCES_EVENT = "dogcity:privacy-preferences-changed";
const PREFERENCE_LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;

export const privacyContact = {
  controllerName: import.meta.env.VITE_PRIVACY_CONTROLLER_NAME || "Dog City Brasil",
  email: import.meta.env.VITE_PRIVACY_CONTACT_EMAIL || "",
};

function isBrowser() {
  return typeof window !== "undefined";
}

export function getPrivacyPreferences() {
  if (!isBrowser()) return null;

  try {
    const stored = JSON.parse(window.localStorage.getItem(PRIVACY_PREFERENCES_KEY) || "null");
    if (!stored?.decidedAt || stored.policyVersion !== COOKIE_POLICY_VERSION) return null;
    if (Date.now() - new Date(stored.decidedAt).getTime() > PREFERENCE_LIFETIME_MS) return null;

    return {
      necessary: true,
      preferences: stored.preferences === true,
      analytics: false,
      marketing: false,
      decidedAt: stored.decidedAt,
      policyVersion: stored.policyVersion,
    };
  } catch {
    return null;
  }
}

export function savePrivacyPreferences({ preferences = false } = {}) {
  if (!isBrowser()) return null;

  const value = {
    necessary: true,
    preferences: preferences === true,
    analytics: false,
    marketing: false,
    decidedAt: new Date().toISOString(),
    policyVersion: COOKIE_POLICY_VERSION,
  };

  window.localStorage.setItem(PRIVACY_PREFERENCES_KEY, JSON.stringify(value));

  if (!value.preferences) {
    document.cookie = "sidebar_state=; path=/; max-age=0; SameSite=Lax";
  }

  window.dispatchEvent(new CustomEvent(PRIVACY_PREFERENCES_EVENT, { detail: value }));
  return value;
}

export function canUsePreferenceStorage() {
  return getPrivacyPreferences()?.preferences === true;
}

export function openPrivacyPreferences() {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent("dogcity:open-privacy-preferences"));
}
