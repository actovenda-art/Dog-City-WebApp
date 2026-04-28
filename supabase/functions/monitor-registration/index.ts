import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-active-unit-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const privateBucket = Deno.env.get("SUPABASE_PRIVATE_BUCKET") || "private-files";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios na function.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

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

function nullableText(value: unknown) {
  const normalized = sanitizeText(value);
  return normalized || null;
}

function sanitizeDisplayNameInput(value: unknown) {
  return sanitizeText(value)
    .replace(/[^\p{L}' -]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDisplayName(value: unknown) {
  return sanitizeDisplayNameInput(value)
    .split(" ")
    .filter(Boolean)
    .map((word) =>
      word
        .split(/([-'])/)
        .map((part) => (/^[-']$/.test(part) ? part : `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`))
        .join("")
    )
    .join(" ");
}

function normalizeCpf(value: unknown) {
  return sanitizeText(value).replace(/\D/g, "").slice(0, 11);
}

function normalizeBoolean(value: unknown) {
  return value === true || value === "true" || value === "sim";
}

function decodeBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function safeFilename(value: unknown, fallback: string) {
  return sanitizeText(value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

async function uploadAttachment({
  providerId,
  empresaId,
  attachment,
}: {
  providerId: string;
  empresaId: string;
  attachment: Record<string, unknown>;
}) {
  const field = safeFilename(attachment.field, "arquivo");
  const fileName = safeFilename(attachment.fileName, "arquivo");
  const contentType = sanitizeText(attachment.contentType) || "application/octet-stream";
  const base64 = sanitizeText(attachment.base64);
  if (!base64) return "";

  const path = `${empresaId || "sem-unidade"}/escalacao/funcionarios/${providerId}/${Date.now()}_${field}_${fileName}`;
  const { error } = await admin.storage.from(privateBucket).upload(path, decodeBase64(base64), {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Falha ao enviar ${field}: ${error.message}`);
  }

  return path;
}

async function findProviderByToken(token: string) {
  const { data, error } = await admin
    .from("serviceproviders")
    .select("*")
    .eq("registration_token", token)
    .maybeSingle();

  if (error) throw error;
  return data;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = sanitizeText(body.action);
    const token = sanitizeText(body.token);

    if (!token) {
      return jsonResponse({ ok: false, error: "Token obrigatório." }, 400);
    }

    const provider = await findProviderByToken(token);
    if (!provider) {
      return jsonResponse({ ok: false, error: "Link de cadastro de funcionário não localizado." }, 404);
    }

    if (action === "get_context") {
      return jsonResponse({
        ok: true,
        provider: {
          id: provider.id,
          nome: provider.nome || "",
          registration_status: provider.registration_status || "pendente",
        },
      });
    }

    if (action !== "submit") {
      return jsonResponse({ ok: false, error: "Ação inválida." }, 400);
    }

    const profile = body.profile || {};
    const cpf = normalizeCpf(profile.cpf);

    if (!sanitizeText(profile.nome)) {
      return jsonResponse({ ok: false, error: "Informe o nome completo." }, 400);
    }

    if (cpf) {
      const { data: duplicated, error: duplicateError } = await admin
        .from("serviceproviders")
        .select("id, cpf")
        .eq("empresa_id", provider.empresa_id)
        .neq("id", provider.id)
        .limit(500);

      if (duplicateError) throw duplicateError;
      if ((duplicated || []).some((item) => normalizeCpf(item.cpf) === cpf)) {
        return jsonResponse({ ok: false, error: "Já existe um funcionário cadastrado com este CPF." }, 409);
      }
    }

    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    const attachmentPaths: Record<string, string> = {};
    for (const attachment of attachments) {
      if (!attachment || typeof attachment !== "object") continue;
      const field = sanitizeText((attachment as Record<string, unknown>).field);
      if (!field) continue;
      attachmentPaths[field] = await uploadAttachment({
        providerId: provider.id,
        empresaId: provider.empresa_id || "sem-unidade",
        attachment: attachment as Record<string, unknown>,
      });
    }

    const updatePayload = {
      nome: formatDisplayName(profile.nome),
      nome_pai: nullableText(formatDisplayName(profile.nome_pai)),
      nome_mae: nullableText(formatDisplayName(profile.nome_mae)),
      cpf: cpf || null,
      data_nascimento: nullableText(profile.data_nascimento),
      cep: nullableText(profile.cep),
      rua: nullableText(profile.rua),
      numero: nullableText(profile.numero),
      bairro: nullableText(profile.bairro),
      cidade: nullableText(profile.cidade),
      estado: nullableText(profile.estado),
      pix_key_type: nullableText(profile.pix_key_type),
      pix_key: nullableText(profile.pix_key),
      emergency_contact_name: nullableText(formatDisplayName(profile.emergency_contact_name)),
      emergency_contact: nullableText(profile.emergency_contact),
      cpf_anexo_url: attachmentPaths.cpf_anexo_url || provider.cpf_anexo_url || null,
      rg_anexo_url: attachmentPaths.rg_anexo_url || provider.rg_anexo_url || null,
      profile_photo_url: attachmentPaths.profile_photo_url || provider.profile_photo_url || null,
      selfie_url: attachmentPaths.profile_photo_url || provider.selfie_url || null,
      health_issue: normalizeBoolean(profile.health_issue),
      health_issue_description: nullableText(profile.health_issue_description),
      controlled_medication: normalizeBoolean(profile.controlled_medication),
      registration_status: "concluido",
      completed_at: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    };

    const { data: updated, error: updateError } = await admin
      .from("serviceproviders")
      .update(updatePayload)
      .eq("id", provider.id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    return jsonResponse({ ok: true, provider: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Erro inesperado.");
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
