import { createPageUrl } from "@/utils";

const AUTH_INTERMEDIATE_PATHS = new Set([
  createPageUrl("Login"),
  createPageUrl("AuthCallback"),
  createPageUrl("CompletarCadastro"),
  createPageUrl("DefinirPin"),
  createPageUrl("ValidarPin"),
]);

function normalizePathname(pathname) {
  if (!pathname) return "/";
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

function isSafeRelativePath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

export function resolveSafeNextPath(nextValue, depth = 0) {
  const dashboardPath = createPageUrl("Dev_Dashboard");
  if (!isSafeRelativePath(nextValue) || depth > 6) {
    return dashboardPath;
  }

  try {
    const parsed = new URL(nextValue, "https://dogcity.local");
    const pathname = normalizePathname(parsed.pathname);

    if (AUTH_INTERMEDIATE_PATHS.has(pathname)) {
      const nestedNext = parsed.searchParams.get("next");
      return resolveSafeNextPath(nestedNext, depth + 1);
    }

    return `${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return dashboardPath;
  }
}

export function getSafeNextPathFromSearch(search) {
  const params = new URLSearchParams(search || "");
  return resolveSafeNextPath(params.get("next"));
}

export function getSafeRedirectTarget(pathname, search = "") {
  const normalizedPath = normalizePathname(pathname);
  if (AUTH_INTERMEDIATE_PATHS.has(normalizedPath)) {
    return getSafeNextPathFromSearch(search);
  }

  return resolveSafeNextPath(`${normalizedPath}${search || ""}`);
}

export function normalizeAppLocation(value) {
  if (!isSafeRelativePath(value)) return createPageUrl("Dev_Dashboard");

  try {
    const parsed = new URL(value, "https://dogcity.local");
    const pathname = normalizePathname(parsed.pathname);
    return `${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return createPageUrl("Dev_Dashboard");
  }
}

export function isSameAppLocation(target, pathname, search = "", hash = "") {
  const normalizedTarget = normalizeAppLocation(target);
  const current = normalizeAppLocation(`${normalizePathname(pathname)}${search || ""}${hash || ""}`);
  return normalizedTarget === current;
}
