import { GOOGLE_REVIEW_TARGET_URL } from "../shared/google-review.js";

function normalizePublicUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

async function loadConfiguredReviewUrl() {
  const environment = globalThis.process?.env || {};
  const supabaseUrl = String(environment.SUPABASE_URL || environment.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const supabaseKey = String(
    environment.SUPABASE_ANON_KEY
      || environment.VITE_SUPABASE_ANON_KEY
      || environment.VITE_SUPABASE_KEY
      || "",
  ).trim();

  if (!supabaseUrl || !supabaseKey) return "";

  const result = await fetch(`${supabaseUrl}/rest/v1/rpc/app_public_google_review_url`, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    signal: AbortSignal.timeout(3000),
  });

  if (!result.ok) return "";
  return normalizePublicUrl(await result.json());
}

export default async function handler(_request, response) {
  let targetUrl = GOOGLE_REVIEW_TARGET_URL;
  try {
    targetUrl = await loadConfiguredReviewUrl() || targetUrl;
  } catch (error) {
    console.warn("Falha ao carregar link configurado de avaliação:", error);
  }

  response.statusCode = 307;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.setHeader("Location", targetUrl);
  response.end("Redirecionando para a avaliação da Dog City Brasil no Google.");
}
