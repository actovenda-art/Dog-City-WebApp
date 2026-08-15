import { useEffect } from "react";
import { User } from "@/api/entities";
import { getSafeRedirectTarget } from "@/lib/auth-navigation";
import {
  clearSessionActivity,
  getSessionActivityKey,
  readSessionActivity,
  recordSessionActivity,
  SESSION_INACTIVITY_TIMEOUT_MS,
} from "@/lib/session-inactivity";
import { createPageUrl } from "@/utils";

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel", "scroll"];
const ACTIVITY_THROTTLE_MS = 1000;
const STORAGE_SYNC_THROTTLE_MS = 5000;

export default function SessionInactivityGuard({ enabled, user }) {
  useEffect(() => {
    const userId = user?.id;
    if (!enabled || !userId || typeof window === "undefined") return undefined;

    const storageKey = getSessionActivityKey(userId);
    let lastActivityAt = readSessionActivity(userId);
    let lastPersistedAt = lastActivityAt;
    let timeoutId = null;
    let isLoggingOut = false;

    const redirectToLogin = () => {
      const nextPath = getSafeRedirectTarget(window.location.pathname, window.location.search);
      const loginUrl = `${createPageUrl("Login")}?reason=inactivity&next=${encodeURIComponent(nextPath)}`;
      window.location.replace(loginUrl);
    };

    const expireSession = async () => {
      if (isLoggingOut) return;
      isLoggingOut = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      clearSessionActivity(userId);

      try {
        await User.logout?.();
      } catch (error) {
        console.warn("Nao foi possivel encerrar a sessao inativa no servidor:", error);
      } finally {
        redirectToLogin();
      }
    };

    const scheduleExpiration = () => {
      if (isLoggingOut) return;
      if (timeoutId) window.clearTimeout(timeoutId);
      const remainingTime = SESSION_INACTIVITY_TIMEOUT_MS - (Date.now() - lastActivityAt);
      if (remainingTime <= 0) {
        void expireSession();
        return;
      }
      timeoutId = window.setTimeout(() => {
        const sharedActivityAt = readSessionActivity(userId);
        if (sharedActivityAt > lastActivityAt) lastActivityAt = sharedActivityAt;
        scheduleExpiration();
      }, remainingTime);
    };

    const handleActivity = (event) => {
      if (event?.isTrusted === false || isLoggingOut) return;
      const now = Date.now();
      if (now - lastActivityAt < ACTIVITY_THROTTLE_MS) return;

      lastActivityAt = now;
      if (now - lastPersistedAt >= STORAGE_SYNC_THROTTLE_MS) {
        recordSessionActivity(userId, now);
        lastPersistedAt = now;
      }
      scheduleExpiration();
    };

    const handleStorage = (event) => {
      if (event.key !== storageKey) return;
      const sharedActivityAt = Number(event.newValue || 0);
      if (!sharedActivityAt) {
        void expireSession();
        return;
      }
      if (sharedActivityAt > lastActivityAt) {
        lastActivityAt = sharedActivityAt;
        lastPersistedAt = sharedActivityAt;
        scheduleExpiration();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const sharedActivityAt = readSessionActivity(userId);
      if (sharedActivityAt > lastActivityAt) lastActivityAt = sharedActivityAt;
      scheduleExpiration();
    };

    if (!lastActivityAt) {
      lastActivityAt = Date.now();
      lastPersistedAt = lastActivityAt;
      recordSessionActivity(userId, lastActivityAt);
    }

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    scheduleExpiration();

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, user?.id]);

  return null;
}
