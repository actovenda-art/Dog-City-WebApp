const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-active-unit-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

const gatewayUrl = sanitizeText(Deno.env.get("WHATSAPP_GATEWAY_URL"));
const gatewayToken = sanitizeText(Deno.env.get("WHATSAPP_GATEWAY_TOKEN"));

async function forwardToGateway(body: Record<string, unknown>) {
  if (!gatewayUrl) {
    throw new Error("Configure WHATSAPP_GATEWAY_URL na Edge Function whatsapp-bridge.");
  }

  const response = await fetch(`${gatewayUrl.replace(/\/+$/, "")}/api/bridge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(gatewayToken ? { Authorization: `Bearer ${gatewayToken}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || payload?.details || `Falha no gateway do WhatsApp (${response.status}).`);
  }

  return payload;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = sanitizeText(body.action);
    if (!action) {
      return jsonResponse({ error: "Informe a ação do WhatsApp." }, 400);
    }

    const result = await forwardToGateway(body);
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Falha inesperada no gateway do WhatsApp.",
    }, 500);
  }
});
