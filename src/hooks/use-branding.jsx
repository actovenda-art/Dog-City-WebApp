import { useEffect, useState } from "react";
import { AppAsset, AppConfig, User } from "@/api/entities";

const DEFAULT_BRANDING = {
  companyName: "Dog City Brasil",
  logoUrl: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' rx='24' fill='%23fff7ed'/%3E%3Cpath d='M34 79c0-11 9-20 20-20h12c11 0 20 9 20 20v7H34z' fill='%23ea580c'/%3E%3Ccircle cx='47' cy='42' r='7' fill='%23111827'/%3E%3Ccircle cx='73' cy='42' r='7' fill='%23111827'/%3E%3Cpath d='M40 18l14 18H38zM80 18l-14 18h16z' fill='%23fb923c'/%3E%3Ccircle cx='60' cy='66' r='9' fill='%23f59e0b'/%3E%3C/svg%3E",
};

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
  link.setAttribute("href", href || "/favicon.svg");
  link.setAttribute("type", type);
}

export function useBranding() {
  const [branding, setBranding] = useState(DEFAULT_BRANDING);

  useEffect(() => {
    let cancelled = false;

    async function loadBranding() {
      try {
        const me = await User.me();
        const empresaId = me?.empresa_id || null;

        const [configRows, assetRows] = await Promise.all([
          AppConfig.list("-created_date", 200),
          AppAsset.list("-created_date", 200),
        ]);

        if (cancelled) return;

        const companyConfig = (configRows || []).find(
          (item) => item.key === "branding.company_name" && item.empresa_id === empresaId
        ) || (configRows || []).find(
          (item) => item.key === "branding.company_name" && !item.empresa_id
        );

        const logoAsset = (assetRows || []).find(
          (item) => item.key === "branding.logo.primary" && item.empresa_id === empresaId && item.ativo !== false
        ) || (assetRows || []).find(
          (item) => item.key === "branding.logo.primary" && !item.empresa_id && item.ativo !== false
        );

        setBranding({
          companyName: companyConfig?.value?.text || DEFAULT_BRANDING.companyName,
          logoUrl: logoAsset?.public_url || DEFAULT_BRANDING.logoUrl,
        });
      } catch (error) {
        if (!cancelled) {
          setBranding(DEFAULT_BRANDING);
        }
      }
    }

    loadBranding();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const faviconType = getFaviconType(branding.logoUrl);
    upsertFaviconLink("app-favicon", "icon", branding.logoUrl, faviconType);
    upsertFaviconLink("app-favicon-shortcut", "shortcut icon", branding.logoUrl, faviconType);
  }, [branding.logoUrl]);

  return branding;
}
