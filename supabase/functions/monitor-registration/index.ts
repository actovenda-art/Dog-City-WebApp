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

function generateSignatureCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 10000).padStart(4, "0");
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

const COMMERCIAL_NOTIFICATION_PERMISSIONS = [
  "orcamentos:*",
  "orcamentos:read",
  "orcamentos:update",
];

const MANAGERIAL_NOTIFICATION_PERMISSIONS = [
  "financeiro:*",
  "financeiro:read",
  "financeiro:update",
  "usuarios:*",
  "usuarios:read",
  "usuarios:update",
  "empresa:*",
  "empresa:read",
  "empresa:update",
  "precos:*",
  "branding:*",
  "storage:*",
  "platform:*",
];

function normalizePermission(value: unknown) {
  return sanitizeText(value).toLowerCase();
}

function normalizePermissions(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => normalizePermission(item)).filter(Boolean))]
    : [];
}

function permissionMatches(granted: string, required: string) {
  const normalizedGranted = normalizePermission(granted);
  const normalizedRequired = normalizePermission(required);
  if (!normalizedGranted || !normalizedRequired) return false;
  if (normalizedGranted === "*" || normalizedGranted === normalizedRequired) return true;
  if (normalizedGranted.endsWith("*")) return normalizedRequired.startsWith(normalizedGranted.slice(0, -1));
  if (normalizedRequired.endsWith("*")) return normalizedGranted.startsWith(normalizedRequired.slice(0, -1));
  return false;
}

function buildAccessHaystack(user: Record<string, unknown>, profile: Record<string, unknown> | null) {
  return [
    user?.profile,
    user?.company_role,
    profile?.codigo,
    profile?.nome,
  ]
    .map((item) => normalizePermission(item))
    .filter(Boolean)
    .join(" ");
}

function isCommercialRecipient(user: Record<string, unknown>, profile: Record<string, unknown> | null, permissions: string[]) {
  const hasCommercialPermission = permissions.some((permission) =>
    COMMERCIAL_NOTIFICATION_PERMISSIONS.some((required) => permissionMatches(permission, required))
  );
  if (hasCommercialPermission) return true;

  const haystack = buildAccessHaystack(user, profile);
  return ["comercial", "venda", "vendas", "orcamento", "orcamentos", "cadastro"].some((token) => haystack.includes(token));
}

function isManagerialRecipient(user: Record<string, unknown>, profile: Record<string, unknown> | null, permissions: string[]) {
  if (user?.is_platform_admin === true || user?.company_role === "platform_admin") return true;

  const hasManagerialPermission = permissions.some((permission) =>
    MANAGERIAL_NOTIFICATION_PERMISSIONS.some((required) => permissionMatches(permission, required))
  );
  if (hasManagerialPermission) return true;

  const haystack = buildAccessHaystack(user, profile);
  return [
    "gerencia",
    "gerencial",
    "administracao",
    "administração",
    "administrativo",
    "financeiro",
    "financas",
    "finanças",
    "contabilidade",
    "backoffice",
    "diretoria",
    "gestao",
    "gestão",
    "gerente",
    "adm",
  ].some((token) => haystack.includes(token));
}

async function loadRegistrationNotificationRecipients(empresaId: string | null | undefined) {
  const normalizedEmpresaId = sanitizeText(empresaId);
  if (!normalizedEmpresaId) return [];

  const [usersResult, profilesResult, accessResult] = await Promise.all([
    admin
      .from("users")
      .select("id, email, full_name, profile, empresa_id, access_profile_id, company_role, is_platform_admin, active")
      .limit(1000),
    admin
      .from("perfil_acesso")
      .select("id, codigo, nome, permissoes, ativo")
      .limit(1000),
    admin
      .from("user_unit_access")
      .select("user_id, empresa_id, access_profile_id, papel, ativo")
      .eq("empresa_id", normalizedEmpresaId)
      .eq("ativo", true)
      .limit(2000),
  ]);

  if (usersResult.error) {
    console.warn("Nao foi possivel carregar usuarios para notificacao:", usersResult.error.message);
    return [];
  }

  const profileById = new Map(
    (profilesResult.data || []).map((profile) => [sanitizeText(profile.id), profile as Record<string, unknown>])
  );
  const accessByUserId = new Map(
    (accessResult.data || []).map((access) => [sanitizeText(access.user_id), access as Record<string, unknown>])
  );

  return (usersResult.data || []).filter((user) => {
    if (!user?.id || user.active === false) return false;

    const accessRow = accessByUserId.get(sanitizeText(user.id));
    const hasUnitAccess = user.is_platform_admin === true
      || sanitizeText(user.empresa_id) === normalizedEmpresaId
      || Boolean(accessRow);
    if (!hasUnitAccess) return false;

    const accessProfileId = sanitizeText(accessRow?.access_profile_id) || sanitizeText(user.access_profile_id);
    const accessProfile = profileById.get(accessProfileId) || null;
    const hydratedUser = {
      ...user,
      company_role: sanitizeText(accessRow?.papel) || user.company_role,
    };
    const permissions = normalizePermissions(accessProfile?.permissoes);
    return isCommercialRecipient(hydratedUser, accessProfile, permissions)
      || isManagerialRecipient(hydratedUser, accessProfile, permissions);
  });
}

async function createRegistrationCompletedNotifications({
  empresaId,
  mensagem,
  link,
  entityType,
  entityId,
  payload = {},
}: {
  empresaId: string | null | undefined;
  mensagem: string;
  link: string;
  entityType: string;
  entityId: string | null;
  payload?: Record<string, unknown>;
}) {
  try {
    const recipients = await loadRegistrationNotificationRecipients(empresaId);
    if (!recipients.length) return;

    const now = new Date().toISOString();
    const rows = recipients.map((recipient) => ({
      empresa_id: sanitizeText(empresaId) || null,
      user_id: recipient.id,
      tipo: "cadastro_concluido",
      titulo: "Cadastro concluído com sucesso!",
      mensagem,
      link,
      lido: false,
      payload: {
        notification_scope: "cadastro",
        entity_type: entityType,
        entity_id: entityId,
        action_label: "Ver perfil",
        ...payload,
      },
      created_date: now,
    }));

    const { error } = await admin.from("notificacao").insert(rows);
    if (error) {
      console.warn("Nao foi possivel criar notificacao de cadastro concluido:", error.message);
    }
  } catch (error) {
    console.warn("Nao foi possivel criar notificacao de cadastro concluido:", error);
  }
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
      signature_code: sanitizeText(provider.signature_code) || generateSignatureCode(),
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

    await createRegistrationCompletedNotifications({
      empresaId: updated.empresa_id || provider.empresa_id,
      mensagem: formatDisplayName(updated.nome || profile.nome),
      link: `/escalacao?tab=funcionarios&provider_id=${encodeURIComponent(updated.id)}`,
      entityType: "funcionario",
      entityId: updated.id,
      payload: {
        provider_id: updated.id,
        funcionario_nome: formatDisplayName(updated.nome || profile.nome),
      },
    });

    return jsonResponse({ ok: true, provider: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Erro inesperado.");
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
