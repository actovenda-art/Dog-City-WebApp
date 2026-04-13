import { createPageUrl } from "@/utils";

const NAVIGATION_GUARD_KEY = "dogcity_auth_navigation_guard_v1";
const RECOVERY_MARKER_KEY = "dogcity_auth_recovery_marker_v1";
const DEVICE_ID_KEY = "dogcity_device_id";
const TRUSTED_USERS_KEY = "dogcity_trusted_users_v1";
const ACTIVE_UNIT_STORAGE_KEY = "dogcity_active_unit_id";
const ACTIVE_UNIT_SELECTION_STORAGE_KEY = "dogcity_unit_selection_v1";

const NAVIGATION_WINDOW_MS = 8000;
const NAVIGATION_LIMIT = 8;
const RECOVERY_COOLDOWN_MS = 15000;

function canUseStorage() {
  return typeof window !== "undefined"
    && typeof window.localStorage !== "undefined"
    && typeof window.sessionStorage !== "undefined";
}

function readSessionJson(key, fallback) {
  if (!canUseStorage()) return fallback;

  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeSessionJson(key, value) {
  if (!canUseStorage()) return;
  window.sessionStorage.setItem(key, JSON.stringify(value));
}

export function recordNavigationSample(pathname, search = "") {
  if (!canUseStorage()) return [];

  const now = Date.now();
  const target = `${pathname || "/"}${search || ""}`;
  const previous = readSessionJson(NAVIGATION_GUARD_KEY, []);
  const next = [...previous, { at: now, target }]
    .filter((item) => now - Number(item?.at || 0) <= NAVIGATION_WINDOW_MS)
    .slice(-20);

  writeSessionJson(NAVIGATION_GUARD_KEY, next);
  return next;
}

export function shouldTriggerAuthRecovery(samples = []) {
  if (!Array.isArray(samples) || samples.length < NAVIGATION_LIMIT) return false;

  const recentSamples = samples.slice(-NAVIGATION_LIMIT);
  const uniqueTargets = new Set(recentSamples.map((item) => item?.target).filter(Boolean));
  return uniqueTargets.size >= 2;
}

export function wasRecentlyRecovered() {
  if (!canUseStorage()) return false;
  const marker = readSessionJson(RECOVERY_MARKER_KEY, null);
  const at = Number(marker?.at || 0);
  return at > 0 && Date.now() - at < RECOVERY_COOLDOWN_MS;
}

export function markAuthRecovery(reason = "loop_detected") {
  if (!canUseStorage()) return;
  writeSessionJson(RECOVERY_MARKER_KEY, {
    at: Date.now(),
    reason,
  });
}

export function clearRecordedNavigationSamples() {
  if (!canUseStorage()) return;
  window.sessionStorage.removeItem(NAVIGATION_GUARD_KEY);
}

export function clearCorruptedBrowserAuthState() {
  if (!canUseStorage()) return;

  const authStorageKeys = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
      authStorageKeys.push(key);
    }
  }

  authStorageKeys.forEach((key) => window.localStorage.removeItem(key));
  window.localStorage.removeItem(DEVICE_ID_KEY);
  window.localStorage.removeItem(TRUSTED_USERS_KEY);
  window.localStorage.removeItem(ACTIVE_UNIT_STORAGE_KEY);
  window.localStorage.removeItem(ACTIVE_UNIT_SELECTION_STORAGE_KEY);

  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (!key) continue;
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore sessionStorage access issues and proceed with local cleanup.
  }

  clearRecordedNavigationSamples();
  markAuthRecovery();
}

export function buildRecoveredLoginUrl() {
  return `${createPageUrl("Login")}?recovered=1`;
}
