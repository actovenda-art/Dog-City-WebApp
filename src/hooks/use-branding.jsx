import { useEffect, useState } from "react";
import { AppAsset, AppConfig, Empresa, User } from "@/api/entities";
import { ACTIVE_UNIT_EVENT, getStoredActiveUnitId, getUnitDisplayName, resolveDogCityUnit } from "@/lib/unit-context";

export const BRANDING_EVENT = "app-branding-updated";

const BASE_BRANDING = {
  companyName: "Dog City Brasil",
  logoUrl: "/dog-city-brand.svg",
  iconUrl: "/favicon.svg",
  touchIconUrl: "/apple-touch-icon.png",
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
      if (variant === "base") {
        setBranding(BASE_BRANDING);
        return;
      }

      try {
        const [me, units, configRows, assetRows] = await Promise.all([
          User.me(),
          Empresa.list("-created_date", 200),
          AppConfig.list("-created_date", 500),
          AppAsset.list("-created_date", 500),
        ]);

        if (cancelled) return;

        const baseUnit = resolveDogCityUnit(units || []);
        const activeUnitId = variant === "base"
          ? baseUnit?.id || ""
          : (getStoredActiveUnitId() || me?.empresa_id || baseUnit?.id || "");
        const activeUnit = (units || []).find((item) => item.id === activeUnitId) || baseUnit || null;

        const companyConfig = (configRows || []).find(
          (item) => item.key === "branding.company_name" && item.empresa_id === activeUnitId
        ) || (configRows || []).find(
          (item) => item.key === "branding.company_name" && item.empresa_id === activeUnit?.id
        );

        const logoAsset = (assetRows || []).find(
          (item) => item.key === "branding.logo.primary" && item.empresa_id === activeUnitId && item.ativo !== false
        );
        const resolvedLogoUrl = logoAsset?.public_url || DEFAULT_BRANDING.logoUrl;

        setBranding({
          companyName: companyConfig?.value?.text || getUnitDisplayName(activeUnit) || DEFAULT_BRANDING.companyName,
          logoUrl: resolvedLogoUrl,
          iconUrl: resolvedLogoUrl || BASE_BRANDING.iconUrl,
          touchIconUrl: resolveTouchIconUrl(resolvedLogoUrl),
        });
      } catch (error) {
        if (!cancelled) {
          setBranding(DEFAULT_BRANDING);
        }
      }
    }

    function handleRefresh() {
      loadBranding();
    }

    function handleVisibilityChange() {
      if (!document.hidden) loadBranding();
    }

    loadBranding();
    window.addEventListener(BRANDING_EVENT, handleRefresh);
    window.addEventListener(ACTIVE_UNIT_EVENT, handleRefresh);
    window.addEventListener("focus", handleRefresh);
    window.addEventListener("storage", handleRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener(BRANDING_EVENT, handleRefresh);
      window.removeEventListener(ACTIVE_UNIT_EVENT, handleRefresh);
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
