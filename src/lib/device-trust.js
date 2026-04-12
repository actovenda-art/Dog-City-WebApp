const DEVICE_ID_KEY = "dogcity_device_id";
const TRUSTED_USERS_KEY = "dogcity_trusted_users_v1";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readTrustedUsers() {
  if (!canUseStorage()) return {};

  try {
    const raw = window.localStorage.getItem(TRUSTED_USERS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeTrustedUsers(value) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(TRUSTED_USERS_KEY, JSON.stringify(value || {}));
}

export function getOrCreateDeviceId() {
  if (!canUseStorage()) return "";

  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const nextId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  window.localStorage.setItem(DEVICE_ID_KEY, nextId);
  return nextId;
}

export function isDeviceTrustedForUser(user) {
  const userId = user?.id || user?.user_id || "";
  if (!userId || !canUseStorage()) return false;

  const deviceId = getOrCreateDeviceId();
  if (!deviceId) return false;

  const trustedUsers = readTrustedUsers();
  const trustedDeviceIds = Array.isArray(trustedUsers[userId]) ? trustedUsers[userId] : [];
  return trustedDeviceIds.includes(deviceId);
}

export function markDeviceTrustedForUser(user) {
  const userId = user?.id || user?.user_id || "";
  if (!userId || !canUseStorage()) return;

  const deviceId = getOrCreateDeviceId();
  if (!deviceId) return;

  const trustedUsers = readTrustedUsers();
  const currentDeviceIds = Array.isArray(trustedUsers[userId]) ? trustedUsers[userId] : [];
  trustedUsers[userId] = [...new Set([...currentDeviceIds, deviceId])];
  writeTrustedUsers(trustedUsers);
}

export function revokeTrustedDeviceForUser(user) {
  const userId = user?.id || user?.user_id || "";
  if (!userId || !canUseStorage()) return;

  const deviceId = getOrCreateDeviceId();
  if (!deviceId) return;

  const trustedUsers = readTrustedUsers();
  const currentDeviceIds = Array.isArray(trustedUsers[userId]) ? trustedUsers[userId] : [];
  trustedUsers[userId] = currentDeviceIds.filter((item) => item !== deviceId);
  writeTrustedUsers(trustedUsers);
}
