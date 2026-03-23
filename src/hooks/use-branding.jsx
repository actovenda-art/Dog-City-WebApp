import { useEffect, useState } from "react";
import { AppAsset, AppConfig, Empresa, User } from "@/api/entities";
import { getStoredActiveUnitId, resolveDogCityUnit } from "@/lib/unit-context";

export const BRANDING_EVENT = "app-branding-updated";

const DEFAULT_BRANDING = {
  companyName: "Dog City Brasil",
  logoUrl: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' rx='24' fill='%23fff7ed'/%3E%3Cpath d='M34 79c0-11 9-20 20-20h12c11 0 20 9 20 20v7H34z' fill='%23ea580c'/%3E%3Ccircle cx='47' cy='42' r='7' fill='%23111827'/%3E%3Ccircle cx='73' cy='42' r='7' fill='%23111827'/%3E%3Cpath d='M40 18l14 18H38zM80 18l-14 18h16z' fill='%23fb923c'/%3E%3Ccircle cx='60' cy='66' r='9' fill='%23f59e0b'/%3E%3C/svg%3E",
};
const DEFAULT_FAVICON_URL = "/favicon.svg";
const DEFAULT_TOUCH_ICON_URL = "/apple-touch-icon.png";

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
      try {
        const [me, units, configRows, assetRows] = await Promise.all([
          variant === "active" ? User.me() : Promise.resolve(null),
          Empresa.list("-created_date", 200),
          AppConfig.list("-created_date", 500),
          AppAsset.list("-created_date", 500),
        ]);

        if (cancelled) return;

        const baseUnit = resolveDogCityUnit(units || []);
        const activeUnitId = variant === "base"
          ? baseUnit?.id || ""
          : (getStoredActiveUnitId() || me?.empresa_id || baseUnit?.id || "");

        const companyConfig = (configRows || []).find(
          (item) => item.key === "branding.company_name" && item.empresa_id === activeUnitId
        ) || (configRows || []).find(
          (item) => item.key === "branding.company_name" && !item.empresa_id
        );

        const logoAsset = (assetRows || []).find(
          (item) => item.key === "branding.logo.primary" && item.empresa_id === activeUnitId && item.ativo !== false
        ) || (assetRows || []).find(
          (item) => item.key === "branding.logo.primary" && !item.empresa_id && item.ativo !== false
        );

        setBranding({
          companyName: companyConfig?.value?.text || baseUnit?.nome_fantasia || DEFAULT_BRANDING.companyName,
          logoUrl: logoAsset?.public_url || DEFAULT_BRANDING.logoUrl,
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

    const faviconType = getFaviconType(branding.logoUrl);
    const touchIconUrl = resolveTouchIconUrl(branding.logoUrl);
    const touchIconType = getFaviconType(touchIconUrl);
    upsertFaviconLink("app-favicon", "icon", branding.logoUrl, faviconType);
    upsertFaviconLink("app-favicon-shortcut", "shortcut icon", branding.logoUrl, faviconType);
    upsertFaviconLink("app-apple-touch-icon", "apple-touch-icon", touchIconUrl, touchIconType);
    upsertFaviconLink("app-apple-touch-icon-precomposed", "apple-touch-icon-precomposed", touchIconUrl, touchIconType);
    upsertMeta("apple-mobile-web-app-title", branding.companyName || DEFAULT_BRANDING.companyName);
    upsertMeta("application-name", branding.companyName || DEFAULT_BRANDING.companyName);
    upsertMeta("theme-color", "#ffffff");
    document.title = branding.companyName || DEFAULT_BRANDING.companyName;
  }, [branding.companyName, branding.logoUrl, updateDocument]);

  return branding;
}
