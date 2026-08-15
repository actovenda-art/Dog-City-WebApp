export const SESSION_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

const SESSION_ACTIVITY_PREFIX = "dog_city_session_activity:";

export function getSessionActivityKey(userId) {
  const normalizedUserId = String(userId || "").trim();
  return normalizedUserId ? `${SESSION_ACTIVITY_PREFIX}${normalizedUserId}` : "";
}

export function readSessionActivity(userId) {
  if (typeof window === "undefined") return 0;
  const storageKey = getSessionActivityKey(userId);
  if (!storageKey) return 0;

  try {
    const timestamp = Number(window.localStorage.getItem(storageKey) || 0);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
  } catch {
    return 0;
  }
}

export function recordSessionActivity(userId, timestamp = Date.now()) {
  if (typeof window === "undefined") return;
  const storageKey = getSessionActivityKey(userId);
  if (!storageKey) return;

  try {
    window.localStorage.setItem(storageKey, String(timestamp));
  } catch {
    // The in-memory timer still protects the current tab when storage is unavailable.
  }
}

export function clearSessionActivity(userId) {
  if (typeof window === "undefined") return;

  try {
    if (userId) {
      const storageKey = getSessionActivityKey(userId);
      if (storageKey) window.localStorage.removeItem(storageKey);
      return;
    }

    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(SESSION_ACTIVITY_PREFIX)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Logout must continue even when localStorage is unavailable.
  }
}
