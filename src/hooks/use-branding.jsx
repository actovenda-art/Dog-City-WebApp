import { useEffect, useState } from "react";
import { AppAsset } from "@/api/entities";

export const BRANDING_EVENT = "app-branding-updated";

const MISSING_BRANDING_IMAGE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#fff4f2"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-size="58">\u25b6\ufe0f</text></svg>';

export const MISSING_BRANDING_IMAGE_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(MISSING_BRANDING_IMAGE_SVG)}`;

const BASE_BRANDING = {
  companyName: "Dog City Brasil",
  logoUrl: MISSING_BRANDING_IMAGE_URL,
  iconUrl: MISSING_BRANDING_IMAGE_URL,
  touchIconUrl: MISSING_BRANDING_IMAGE_URL,
};
const DEFAULT_BRANDING = BASE_BRANDING;
const DEFAULT_FAVICON_URL = BASE_BRANDING.iconUrl;
const DEFAULT_TOUCH_ICON_URL = BASE_BRANDING.touchIconUrl;
let dynamicManifestUrl = "";

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

function upsertManifestLink(branding) {
  let link = document.getElementById("app-manifest");
  if (!link) {
    link = document.querySelector('link[rel="manifest"]') || document.createElement("link");
    link.id = "app-manifest";
    document.head.appendChild(link);
  }

  const iconUrl = branding.touchIconUrl || branding.iconUrl || branding.logoUrl || DEFAULT_FAVICON_URL;
  const iconType = getFaviconType(iconUrl);
  const manifest = {
    name: branding.companyName || BASE_BRANDING.companyName,
    short_name: "Dog City",
    description: "Gestao operacional e financeira da Dog City Brasil.",
    id: "/",
    start_url: "/",
    scope: "/",
    display_override: ["standalone", "minimal-ui"],
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    orientation: "portrait",
    icons: [
      {
        src: iconUrl,
        sizes: iconType === "image/svg+xml" ? "any" : "512x512",
        type: iconType,
        purpose: "any maskable",
      },
    ],
  };

  if (typeof Blob !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    if (dynamicManifestUrl) URL.revokeObjectURL(dynamicManifestUrl);
    dynamicManifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }));
    link.setAttribute("href", dynamicManifestUrl);
  } else {
    link.setAttribute("href", `data:application/manifest+json;charset=utf-8,${encodeURIComponent(JSON.stringify(manifest))}`);
  }

  link.setAttribute("rel", "manifest");
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

function withAssetVersion(url, asset) {
  if (!url) return "";
  const version = asset?.updated_date || asset?.created_date || asset?.id || "1";
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}brand_v=${encodeURIComponent(version)}`;
}

async function loadFranchiseLogoUrl() {
  try {
    const assets = await AppAsset.list("-created_date", 100);
    const franchiseLogo = (assets || []).find((item) => (
      item?.key === "branding.franchise.logo"
      && item?.ativo !== false
      && !item?.empresa_id
      && item?.public_url
    ));
    return withAssetVersion(franchiseLogo?.public_url || "", franchiseLogo);
  } catch {
    return "";
  }
}

async function buildFranchiseBranding() {
  const logoUrl = await loadFranchiseLogoUrl();
  if (!logoUrl) return buildBranding();

  return {
    companyName: BASE_BRANDING.companyName,
    logoUrl,
    iconUrl: logoUrl,
    touchIconUrl: logoUrl,
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
      const nextBranding = await buildFranchiseBranding();
      if (!cancelled) setBranding(nextBranding);
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
    upsertManifestLink({
      ...branding,
      iconUrl: faviconUrl,
      touchIconUrl,
    });
    upsertMeta("apple-mobile-web-app-title", branding.companyName || BASE_BRANDING.companyName);
    upsertMeta("application-name", branding.companyName || BASE_BRANDING.companyName);
    upsertMeta("theme-color", "#ffffff");
    document.title = branding.companyName || BASE_BRANDING.companyName;
  }, [branding.companyName, branding.iconUrl, branding.logoUrl, branding.touchIconUrl, updateDocument]);

  return branding;
}
