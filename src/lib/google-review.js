import { GOOGLE_REVIEW_TARGET_URL } from "../../shared/google-review.js";

const DEFAULT_SITE_URL = "https://dogcitybrasil.com.br";

export { GOOGLE_REVIEW_TARGET_URL };
export const GOOGLE_REVIEW_SHORT_PATH = "/avaliar";

const configuredSiteUrl = String(import.meta.env.VITE_SITE_URL || "").trim();
const publicSiteUrl = (configuredSiteUrl || DEFAULT_SITE_URL).replace(/\/+$/, "");

export const GOOGLE_REVIEW_PUBLIC_URL = `${publicSiteUrl}${GOOGLE_REVIEW_SHORT_PATH}`;
