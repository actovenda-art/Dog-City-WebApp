import { useEffect } from "react";

export const BRANDING_EVENT = "app-branding-updated";
export const OFFICIAL_DOG_CITY_LOGO_URL = "/dog-city-brand.png?v=20260411";
export const OFFICIAL_DOG_CITY_ICON_URL = "/favicon.png?v=20260411";
export const OFFICIAL_DOG_CITY_TOUCH_ICON_URL = "/apple-touch-icon.png?v=20260411";

const BASE_BRANDING = {
  companyName: "Dog City Brasil",
  logoUrl: OFFICIAL_DOG_CITY_LOGO_URL,
  iconUrl: OFFICIAL_DOG_CITY_ICON_URL,
  touchIconUrl: OFFICIAL_DOG_CITY_TOUCH_ICON_URL,
  hasConfiguredLogo: false,
};

export const MISSING_BRANDING_IMAGE_URL = OFFICIAL_DOG_CITY_LOGO_URL;

export function notifyBrandingChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BRANDING_EVENT));
}

function getFaviconType(url) {
  if (!url) return "image/png";
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
  link.setAttribute("href", href || OFFICIAL_DOG_CITY_ICON_URL);
  link.setAttribute("type", type);
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

function buildManifestHref() {
  return "/manifest.webmanifest?v=20260411";
}

export function useBranding(options = {}) {
  const {
    updateDocument = true,
  } = options;

  useEffect(() => {
    if (typeof document === "undefined" || !updateDocument) return;

    const faviconUrl = BASE_BRANDING.iconUrl;
    const touchIconUrl = BASE_BRANDING.touchIconUrl;
    const faviconType = getFaviconType(faviconUrl);
    const touchIconType = getFaviconType(touchIconUrl);

    upsertFaviconLink("app-favicon", "icon", faviconUrl, faviconType);
    upsertFaviconLink("app-favicon-shortcut", "shortcut icon", faviconUrl, faviconType);
    upsertFaviconLink("app-apple-touch-icon", "apple-touch-icon", touchIconUrl, touchIconType);
    upsertFaviconLink("app-apple-touch-icon-precomposed", "apple-touch-icon-precomposed", touchIconUrl, touchIconType);

    let manifest = document.getElementById("app-manifest");
    if (!manifest) {
      manifest = document.querySelector('link[rel="manifest"]') || document.createElement("link");
      manifest.id = "app-manifest";
      document.head.appendChild(manifest);
    }
    manifest.setAttribute("rel", "manifest");
    manifest.setAttribute("href", buildManifestHref());

    upsertMeta("apple-mobile-web-app-title", BASE_BRANDING.companyName);
    upsertMeta("application-name", BASE_BRANDING.companyName);
    upsertMeta("theme-color", "#ffffff");
    document.title = BASE_BRANDING.companyName;
  }, [updateDocument]);

  return {
    ...BASE_BRANDING,
    isResolved: true,
  };
}
