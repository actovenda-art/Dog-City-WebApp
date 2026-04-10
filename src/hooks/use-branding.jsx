import { useEffect, useState } from "react";

export const BRANDING_EVENT = "app-branding-updated";
export const OFFICIAL_DOG_CITY_LOGO_URL = "/dog-city-brand.svg?v=20260410";
export const OFFICIAL_DOG_CITY_ICON_URL = "/favicon.svg?v=20260410";
export const OFFICIAL_DOG_CITY_TOUCH_ICON_URL = "/apple-touch-icon.png?v=20260410";

const BASE_BRANDING = {
  companyName: "Dog City Brasil",
  logoUrl: OFFICIAL_DOG_CITY_LOGO_URL,
  iconUrl: OFFICIAL_DOG_CITY_ICON_URL,
  touchIconUrl: OFFICIAL_DOG_CITY_TOUCH_ICON_URL,
};
const DEFAULT_BRANDING = BASE_BRANDING;
const DEFAULT_FAVICON_URL = BASE_BRANDING.iconUrl;
const DEFAULT_TOUCH_ICON_URL = BASE_BRANDING.touchIconUrl;

export function notifyBrandingChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BRANDING_EVENT));
}

function getFaviconType(url) {
  if (!url) return "image/svg+xml";
  if (url.startsWith("data:image/")) {
    return url.slice(5, url.indexOf(";")) || "image/png";
  }
  if (url.includes(".svg")) return "image/svg+xml";
  if (url.includes(".ico")) return "image/x-icon";
  if (url.includes(".jpg") || url.includes(".jpeg")) return "image/jpeg";
  if (url.includes(".webp")) return "image/webp";
  return "image/png";
}

function upsertFaviconLink(id, rel, href, type) {
  let link = document.getElementById(id);
  if (!link) {
    link = document.createElement("link");
    link.id = id;
    document.head.appendChild(link);
  }

  link.setAttribute("rel", rel);
  link.setAttribute("href", href || DEFAULT_FAVICON_URL);
  link.setAttribute("type", type);
}

function resolveTouchIconUrl(url) {
  const type = getFaviconType(url);
  return type === "image/svg+xml" ? DEFAULT_TOUCH_ICON_URL : (url || DEFAULT_TOUCH_ICON_URL);
}

function buildBranding() {
  return {
    companyName: BASE_BRANDING.companyName,
    logoUrl: BASE_BRANDING.logoUrl,
    iconUrl: BASE_BRANDING.iconUrl,
    touchIconUrl: BASE_BRANDING.touchIconUrl,
  };
}

function upsertMeta(name, content) {
  let meta = document.querySelector(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", name);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}

export function useBranding(options = {}) {
  const {
    variant = "active",
    updateDocument = true,
  } = options;
  const [branding, setBranding] = useState(DEFAULT_BRANDING);

  useEffect(() => {
    let cancelled = false;

    async function loadBranding() {
      if (!cancelled) setBranding(buildBranding());
    }

    function handleRefresh() {
      loadBranding();
    }

    function handleVisibilityChange() {
      if (!document.hidden) loadBranding();
    }

    loadBranding();
    window.addEventListener(BRANDING_EVENT, handleRefresh);
    window.addEventListener("focus", handleRefresh);
    window.addEventListener("storage", handleRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener(BRANDING_EVENT, handleRefresh);
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener("storage", handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [variant]);

  useEffect(() => {
    if (typeof document === "undefined" || !updateDocument) return;

    const faviconUrl = branding.iconUrl || branding.logoUrl || DEFAULT_FAVICON_URL;
    const touchIconUrl = branding.touchIconUrl || resolveTouchIconUrl(faviconUrl);
    const faviconType = getFaviconType(faviconUrl);
    const touchIconType = getFaviconType(touchIconUrl);
    upsertFaviconLink("app-favicon", "icon", faviconUrl, faviconType);
    upsertFaviconLink("app-favicon-shortcut", "shortcut icon", faviconUrl, faviconType);
    upsertFaviconLink("app-apple-touch-icon", "apple-touch-icon", touchIconUrl, touchIconType);
    upsertFaviconLink("app-apple-touch-icon-precomposed", "apple-touch-icon-precomposed", touchIconUrl, touchIconType);
    upsertMeta("apple-mobile-web-app-title", branding.companyName || BASE_BRANDING.companyName);
    upsertMeta("application-name", branding.companyName || BASE_BRANDING.companyName);
    upsertMeta("theme-color", "#ffffff");
    document.title = branding.companyName || BASE_BRANDING.companyName;
  }, [branding.companyName, branding.iconUrl, branding.logoUrl, branding.touchIconUrl, updateDocument]);

  return branding;
}
