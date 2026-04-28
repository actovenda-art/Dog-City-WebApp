import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-active-unit-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

function normalizeCpf(value: unknown) {
  return sanitizeText(value).replace(/\D/g, "").slice(0, 11);
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

function buildDogRegistrationSummary(responsavelName: string, dogNames: string[]) {
  const firstDogName = dogNames[0] || "Dog";
  const extraDogs = dogNames.length > 1 ? ` +${dogNames.length - 1}` : "";
  return `${responsavelName || "Responsável"} - ${firstDogName}${extraDogs}`;
}

function removeAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeFirstName(value: unknown) {
  const cleaned = removeAccents(sanitizeText(value))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  return cleaned[0] || "";
}

function isValidCpfFormat(cpf: string) {
  const digits = normalizeCpf(cpf);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number(digits[index]) * (10 - index);
  }
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== Number(digits[9])) return false;

  sum = 0;
  for (let index = 0; index < 10; index += 1) {
    sum += Number(digits[index]) * (11 - index);
  }
  check = (sum * 10) % 11;
  if (check === 10) check = 0;

  return check === Number(digits[10]);
}

function isMissingClientRegistrationSchema(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /client_registration_link|restricoes_cuidados|observacoes_gerais|castrado|autorizacao_uso_imagem|contato_orcamentos|contato_alinhamentos|street|neighborhood|city|state/i.test(message);
}

function withSchemaHint(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error || fallback);
  if (isMissingClientRegistrationSchema(error)) {
    return `${message}. Execute o arquivo supabase-schema-client-registration-link.sql no Supabase.`;
  }
  return message || fallback;
}

function getCpfLightConfig() {
  return {
    endpoint: Deno.env.get("CPF_LIGHT_BASE_URL")
      || "https://apigateway.conectagov.estaleiro.serpro.gov.br/api-cpf-light/v2/consulta/identificao",
    tokenUrl: Deno.env.get("CPF_LIGHT_TOKEN_URL") || "",
    clientId: Deno.env.get("CPF_LIGHT_CLIENT_ID") || "",
    clientSecret: Deno.env.get("CPF_LIGHT_CLIENT_SECRET") || "",
    bearerToken: Deno.env.get("CPF_LIGHT_BEARER_TOKEN") || "",
    scope: Deno.env.get("CPF_LIGHT_SCOPE") || "",
    grantType: Deno.env.get("CPF_LIGHT_GRANT_TYPE") || "client_credentials",
    requesterCpf: Deno.env.get("CPF_LIGHT_REQUESTER_CPF") || "",
    requesterCpfHeader: Deno.env.get("CPF_LIGHT_REQUESTER_CPF_HEADER") || "",
    extraHeaders: Deno.env.get("CPF_LIGHT_EXTRA_HEADERS") || "",
  };
}

async function getCpfLightAccessToken() {
  const config = getCpfLightConfig();
  if (config.bearerToken) {
    return config.bearerToken;
  }

  if (!config.tokenUrl || !config.clientId || !config.clientSecret) {
    return "";
  }

  const body = new URLSearchParams();
  body.set("grant_type", config.grantType);
  if (config.scope) {
    body.set("scope", config.scope);
  }

  const credentials = btoa(`${config.clientId}:${config.clientSecret}`);
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(`Falha ao obter token da API CPF Light (${response.status}). ${text || "Sem detalhes."}`);
  }

  return sanitizeText(payload.access_token);
}

function buildCpfLightHeaders(accessToken: string) {
  const config = getCpfLightConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  if (config.requesterCpf && config.requesterCpfHeader) {
    headers[config.requesterCpfHeader] = config.requesterCpf;
  }

  if (config.extraHeaders) {
    try {
      const extraHeaders = JSON.parse(config.extraHeaders) as Record<string, string>;
      Object.entries(extraHeaders || {}).forEach(([key, value]) => {
        if (key && value) headers[key] = String(value);
      });
    } catch {
      // ignore invalid header json
    }
  }

  return headers;
}

function extractCpfLightName(payload: unknown) {
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as Record<string, unknown>)?.data)
      ? (payload as Record<string, unknown>).data as unknown[]
      : Array.isArray((payload as Record<string, unknown>)?.dados)
        ? (payload as Record<string, unknown>).dados as unknown[]
        : payload && typeof payload === "object"
          ? [payload]
          : [];

  const row = candidates.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  if (!row) return "";

  return sanitizeText(
    row.NomeSocial
    || row.nomeSocial
    || row.nome_social
    || row.Nome
    || row.nome
  );
}

async function queryCpfLight(cpf: string) {
  const config = getCpfLightConfig();
  const accessToken = await getCpfLightAccessToken();

  if (!accessToken) {
    return {
      configured: false,
      payload: null,
      apiName: "",
      apiFirstName: "",
    };
  }

  const requestBodies = [
    [{ CPF: cpf }],
    [{ cpf }],
    { CPF: [cpf] },
    { cpf: [cpf] },
    { CPF: cpf },
    { cpf },
  ];

  let lastError = "";

  for (const body of requestBodies) {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: buildCpfLightHeaders(accessToken),
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    if (response.ok) {
      const apiName = extractCpfLightName(payload);
      return {
        configured: true,
        payload,
        apiName,
        apiFirstName: normalizeFirstName(apiName),
      };
    }

    lastError = `Falha na consulta CPF Light (${response.status}): ${text || "Sem detalhes."}`;
    if (response.status !== 400) {
      break;
    }
  }

  throw new Error(lastError || "Nao foi possivel consultar a API CPF Light.");
}

async function getRequestAuthUser(request: Request) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function getAllowedUnitIds(userId: string, empresaId: string | null | undefined, isPlatformAdmin: boolean) {
  if (!userId) return [];

  if (isPlatformAdmin) {
    const { data } = await admin.from("empresa").select("id").order("created_date", { ascending: true }).limit(500);
    return [...new Set((data || []).map((item) => item.id).filter(Boolean))];
  }

  const { data } = await admin
    .from("user_unit_access")
    .select("empresa_id")
    .eq("user_id", userId)
    .eq("ativo", true);

  const ids = [...new Set((data || []).map((item) => item.empresa_id).filter(Boolean))];
  if (ids.length > 0) return ids;
  return empresaId ? [empresaId] : [];
}

async function requireStaffContext(request: Request) {
  const authUser = await getRequestAuthUser(request);
  if (!authUser?.id) {
    throw new Error("Sessao invalida para gerar o link de cadastro.");
  }

  const { data: profile, error } = await admin
    .from("users")
    .select("id, email, empresa_id, is_platform_admin, active")
    .eq("id", authUser.id)
    .maybeSingle();

  if (error || !profile) {
    throw new Error("Nao foi possivel carregar o usuario atual.");
  }

  if (profile.active === false) {
    throw new Error("Este acesso esta desativado.");
  }

  const allowedUnitIds = await getAllowedUnitIds(profile.id, profile.empresa_id, !!profile.is_platform_admin);
  return {
    authUser,
    profile,
    allowedUnitIds,
  };
}

function buildDogSlots(dogIds: string[]) {
  if (dogIds.length > 8) {
    throw new Error("O cadastro por link suporta ate 8 caes por envio.");
  }

  const slots: Record<string, string | null> = {};
  for (let index = 1; index <= 8; index += 1) {
    slots[`dog_id_${index}`] = dogIds[index - 1] || null;
  }
  return slots;
}

const DOG_SLOT_SELECT = "id, empresa_id, dog_id_1, dog_id_2, dog_id_3, dog_id_4, dog_id_5, dog_id_6, dog_id_7, dog_id_8";

function getLinkMetadata(link: Record<string, unknown>) {
  return link?.metadata && typeof link.metadata === "object"
    ? link.metadata as Record<string, unknown>
    : {};
}

function getRegistrationMode(metadata: Record<string, unknown>) {
  const mode = sanitizeText(metadata.registration_mode);
  if (mode === "dog_only" || mode === "dog_and_financeiro") {
    return mode;
  }
  return "full";
}

function getLinkedDogIds(record: Record<string, unknown>) {
  return [1, 2, 3, 4, 5, 6, 7, 8]
    .map((slot) => sanitizeText(record[`dog_id_${slot}`]))
    .filter(Boolean);
}

async function loadResponsavelById(responsavelId: string, empresaId: string) {
  const { data, error } = await admin
    .from("responsavel")
    .select("id, empresa_id, nome_completo, cpf, celular, celular_alternativo, email")
    .eq("id", responsavelId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Não foi possível localizar o responsável selecionado para este link.");
  }

  return data;
}

async function loadCarteiraById(carteiraId: string, empresaId: string) {
  const { data, error } = await admin
    .from("carteira")
    .select("id, empresa_id, nome_razao_social, cpf_cnpj, celular, email, cep, numero_residencia, street, neighborhood, city, state, vencimento_planos, contato_orcamentos, contato_alinhamentos")
    .eq("id", carteiraId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Não foi possível localizar o responsável financeiro selecionado para este link.");
  }

  return data;
}

async function appendDogsToExistingRecord(table: "responsavel" | "carteira", recordId: string, empresaId: string, dogIds: string[]) {
  const { data, error } = await admin
    .from(table)
    .select(DOG_SLOT_SELECT)
    .eq("id", recordId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Não foi possível localizar o cadastro existente em ${table}.`);
  }

  const existingDogIds = getLinkedDogIds(data);
  const nextDogIds = [...new Set([...existingDogIds, ...dogIds.filter(Boolean)])];

  if (nextDogIds.length > 8) {
    throw new Error("O cadastro selecionado já atingiu o limite de 8 cães vinculados.");
  }

  const { error: updateError } = await admin
    .from(table)
    .update({
      ...buildDogSlots(nextDogIds),
      updated_date: new Date().toISOString(),
    })
    .eq("id", recordId)
    .eq("empresa_id", empresaId);

  if (updateError) {
    throw new Error(updateError.message || `Não foi possível vincular o novo cão em ${table}.`);
  }
}

function sanitizeContinuousMedications(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => ({
      especificacoes: nullableText((item as Record<string, unknown>)?.especificacoes),
      cuidados: nullableText((item as Record<string, unknown>)?.cuidados),
      horario: nullableText((item as Record<string, unknown>)?.horario),
      dose: nullableText((item as Record<string, unknown>)?.dose),
    }))
    .filter((item) => item.especificacoes || item.cuidados || item.horario || item.dose);
}

function isNaturalFoodSelection(value: unknown) {
  return sanitizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes("natural");
}

function buildDogMealSlots(cao: Record<string, unknown>) {
  const rawMeals = Array.isArray(cao.refeicoes)
    ? cao.refeicoes.slice(0, 4)
    : [];

  const normalizedMeals = rawMeals.length > 0
    ? rawMeals.map((item) => ({
      qnt: nullableText((item as Record<string, unknown>)?.qnt),
      horario: nullableText((item as Record<string, unknown>)?.horario),
      obs: nullableText((item as Record<string, unknown>)?.obs),
    }))
    : [1, 2, 3, 4].map((index) => ({
      qnt: nullableText(cao[`refeicao_${index}_qnt`]),
      horario: nullableText(cao[`refeicao_${index}_horario`]),
      obs: nullableText(cao[`refeicao_${index}_obs`]),
    }));

  return {
    refeicao_1_qnt: normalizedMeals[0]?.qnt || null,
    refeicao_1_horario: normalizedMeals[0]?.horario || null,
    refeicao_1_obs: normalizedMeals[0]?.obs || null,
    refeicao_2_qnt: normalizedMeals[1]?.qnt || null,
    refeicao_2_horario: normalizedMeals[1]?.horario || null,
    refeicao_2_obs: normalizedMeals[1]?.obs || null,
    refeicao_3_qnt: normalizedMeals[2]?.qnt || null,
    refeicao_3_horario: normalizedMeals[2]?.horario || null,
    refeicao_3_obs: normalizedMeals[2]?.obs || null,
    refeicao_4_qnt: normalizedMeals[3]?.qnt || null,
    refeicao_4_horario: normalizedMeals[3]?.horario || null,
    refeicao_4_obs: normalizedMeals[3]?.obs || null,
  };
}

async function loadLinkByToken(token: string) {
  const normalizedToken = sanitizeText(token);
  if (!normalizedToken) {
    throw new Error("Token de cadastro invalido.");
  }

  const { data, error } = await admin
    .from("client_registration_link")
    .select("*")
    .eq("token", normalizedToken)
    .maybeSingle();

  if (error) {
    throw new Error(withSchemaHint(error, "Nao foi possivel localizar o link de cadastro."));
  }

  if (!data) {
    throw new Error("Link de cadastro nao localizado.");
  }

  return data;
}

async function loadEmpresaSummary(empresaId: string) {
  const { data, error } = await admin
    .from("empresa")
    .select("id, nome_fantasia, razao_social")
    .eq("id", empresaId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Nao foi possivel carregar a unidade.");
  }

  return data || null;
}

function validatePayload(payload: Record<string, unknown>, registrationMode = "full") {
  const responsavel = (payload?.responsavel || {}) as Record<string, unknown>;
  const financeiro = (payload?.financeiro || {}) as Record<string, unknown>;
  const caes = Array.isArray(payload?.caes) ? payload.caes as Record<string, unknown>[] : [];

  if (registrationMode === "full" && (!sanitizeText(responsavel.nome_completo) || !sanitizeText(responsavel.cpf) || !sanitizeText(responsavel.celular) || !sanitizeText(responsavel.email))) {
    throw new Error("Preencha nome, CPF, celular e email do responsavel.");
  }

  if (caes.length === 0) {
    throw new Error("Informe ao menos um cao.");
  }

  if (caes.some((cao) => !sanitizeText(cao.nome) || !sanitizeText(cao.raca))) {
    throw new Error("Cada cao precisa ter ao menos nome e raca.");
  }

  if ((registrationMode === "full" || registrationMode === "dog_and_financeiro") && (!sanitizeText(financeiro.nome_razao_social) || !sanitizeText(financeiro.cpf_cnpj) || !sanitizeText(financeiro.celular) || !sanitizeText(financeiro.email))) {
    throw new Error("Preencha os dados principais do responsavel financeiro.");
  }
}

async function handleCreateLink(request: Request, payload: Record<string, unknown>) {
  const ctx = await requireStaffContext(request);
  const empresaId = sanitizeText(payload.empresa_id) || sanitizeText(ctx.profile.empresa_id);
  if (!empresaId) {
    return jsonResponse({ error: "Selecione a unidade para gerar o link." }, 400);
  }

  if (!ctx.profile.is_platform_admin && !ctx.allowedUnitIds.includes(empresaId)) {
    return jsonResponse({ error: "Voce nao tem acesso para gerar link nesta unidade." }, 403);
  }

  try {
    const now = new Date().toISOString();
    const registrationMode = sanitizeText(payload.registration_mode) || "full";
    const metadata: Record<string, unknown> = {
      source: "cadastro",
    };
    let responsavelNome = nullableText(payload.responsavel_nome);
    let responsavelEmail = nullableText(payload.responsavel_email)?.toLowerCase() || null;

    if (registrationMode === "dog_only" || registrationMode === "dog_and_financeiro") {
      const responsavelId = sanitizeText(payload.responsavel_id);
      if (!responsavelId) {
        return jsonResponse({ error: "Selecione o responsável para gerar este link." }, 400);
      }

      const responsavel = await loadResponsavelById(responsavelId, empresaId);
      responsavelNome = nullableText(responsavel.nome_completo);
      responsavelEmail = nullableText(responsavel.email)?.toLowerCase() || null;
      metadata.registration_mode = registrationMode;
      metadata.existing_responsavel_id = responsavel.id;
      metadata.prefill = {
        responsavel: {
          nome_completo: responsavel.nome_completo || "",
          cpf: responsavel.cpf || "",
          celular: responsavel.celular || "",
          celular_alternativo: responsavel.celular_alternativo || "",
          email: responsavel.email || "",
        },
      };

      if (registrationMode === "dog_only") {
        const carteiraId = sanitizeText(payload.carteira_id);
        if (!carteiraId) {
          return jsonResponse({ error: "Selecione o responsável financeiro para gerar o link apenas do cão." }, 400);
        }

        const carteira = await loadCarteiraById(carteiraId, empresaId);
        metadata.existing_carteira_id = carteira.id;
        metadata.prefill = {
          ...(metadata.prefill as Record<string, unknown>),
          financeiro: {
            nome_razao_social: carteira.nome_razao_social || "",
            cpf_cnpj: carteira.cpf_cnpj || "",
            celular: carteira.celular || "",
            email: carteira.email || "",
            cep: carteira.cep || "",
            number: carteira.numero_residencia || "",
            street: carteira.street || "",
            neighborhood: carteira.neighborhood || "",
            city: carteira.city || "",
            state: carteira.state || "",
            vencimento_planos: carteira.vencimento_planos || "",
            contato_orcamentos_nome: (carteira.contato_orcamentos as Record<string, unknown> | null)?.nome || "",
            contato_orcamentos_celular: (carteira.contato_orcamentos as Record<string, unknown> | null)?.celular || "",
            contato_orcamentos_email: (carteira.contato_orcamentos as Record<string, unknown> | null)?.email || "",
            contato_alinhamentos_nome: (carteira.contato_alinhamentos as Record<string, unknown> | null)?.nome || "",
            contato_alinhamentos_celular: (carteira.contato_alinhamentos as Record<string, unknown> | null)?.celular || "",
            contato_alinhamentos_email: (carteira.contato_alinhamentos as Record<string, unknown> | null)?.email || "",
          },
        };
      }
    }

    const { data, error } = await admin
      .from("client_registration_link")
      .insert([{
        empresa_id: empresaId,
        responsavel_nome: responsavelNome,
        responsavel_email: responsavelEmail,
        status: "pendente",
        metadata,
        created_by_user_id: ctx.profile.id,
        created_date: now,
        updated_date: now,
      }])
      .select("*")
      .maybeSingle();

    if (error) {
      return jsonResponse({ error: withSchemaHint(error, "Nao foi possivel gerar o link de cadastro.") }, 500);
    }

    return jsonResponse({ ok: true, link: data });
  } catch (error) {
    return jsonResponse({ error: withSchemaHint(error, "Nao foi possivel gerar o link de cadastro.") }, 500);
  }
}

async function handleGetContext(payload: Record<string, unknown>) {
  try {
    const link = await loadLinkByToken(sanitizeText(payload.token));
    const empresa = await loadEmpresaSummary(link.empresa_id);

    if (!link.opened_at && link.status === "pendente") {
      await admin
        .from("client_registration_link")
        .update({ opened_at: new Date().toISOString(), updated_date: new Date().toISOString() })
        .eq("id", link.id);
    }

    if (link.cancelled_at || link.status === "cancelado") {
      return jsonResponse({ error: "Este link de cadastro foi cancelado." }, 410);
    }

    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: "Este link de cadastro expirou. Solicite um novo link." }, 410);
    }

    if (link.status === "concluido") {
      return jsonResponse({ error: "Este link de cadastro ja foi utilizado." }, 409);
    }

    return jsonResponse({
      ok: true,
      link,
      empresa,
    });
  } catch (error) {
    return jsonResponse({ error: withSchemaHint(error, "Nao foi possivel carregar o link de cadastro.") }, 500);
  }
}

async function handleVerifyCpf(payload: Record<string, unknown>) {
  try {
    const cpf = normalizeCpf(payload.cpf);
    const fullName = sanitizeText(payload.full_name);

    if (!cpf || !fullName) {
      return jsonResponse({ error: "Informe CPF e nome para validar." }, 400);
    }

    if (!isValidCpfFormat(cpf)) {
      return jsonResponse({
        ok: true,
        configured: true,
        valid_format: false,
        first_name_matches: false,
        api_name: "",
        api_first_name: "",
      });
    }

    const apiResult = await queryCpfLight(cpf);
    if (!apiResult.configured) {
      return jsonResponse({
        ok: true,
        configured: false,
        valid_format: true,
        first_name_matches: null,
        api_name: "",
        api_first_name: "",
      });
    }

    const inputFirstName = normalizeFirstName(fullName);
    const apiFirstName = apiResult.apiFirstName;
    const firstNameMatches = !!inputFirstName && !!apiFirstName && inputFirstName === apiFirstName;

    return jsonResponse({
      ok: true,
      configured: true,
      valid_format: true,
      first_name_matches: firstNameMatches,
      api_name: apiResult.apiName,
      api_first_name: apiFirstName,
      input_first_name: inputFirstName,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

async function handleSubmit(payload: Record<string, unknown>) {
  try {
    const link = await loadLinkByToken(sanitizeText(payload.token));

    if (link.cancelled_at || link.status === "cancelado") {
      return jsonResponse({ error: "Este link de cadastro foi cancelado." }, 410);
    }

    if (link.status === "concluido") {
      return jsonResponse({ error: "Este link ja foi utilizado." }, 409);
    }

    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: "Este link de cadastro expirou. Solicite um novo link." }, 410);
    }

    const formPayload = (payload?.payload || {}) as Record<string, unknown>;
    const metadata = getLinkMetadata(link as Record<string, unknown>);
    const registrationMode = getRegistrationMode(metadata);
    validatePayload(formPayload, registrationMode);

    const responsavel = (formPayload.responsavel || {}) as Record<string, unknown>;
    const financeiro = (formPayload.financeiro || {}) as Record<string, unknown>;
    const caes = Array.isArray(formPayload.caes) ? formPayload.caes as Record<string, unknown>[] : [];
    const now = new Date().toISOString();

    const createdDogIds: string[] = [];
    for (const cao of caes) {
      const dogMeals = buildDogMealSlots(cao);
      const isNaturalFood = Boolean(cao.alimentacao_natural) || isNaturalFoodSelection(cao.alimentacao_tipo);

      const { data: dogRow, error: dogError } = await admin
        .from("dogs")
        .insert([{
          empresa_id: link.empresa_id,
          nome: formatDisplayName(cao.nome),
          apelido: nullableText(formatDisplayName(cao.apelido)),
          raca: nullableText(cao.raca),
          peso: nullableText(cao.peso),
          data_nascimento: nullableText(cao.data_nascimento),
          sexo: nullableText(cao.sexo),
          porte: nullableText(cao.porte),
          cores_pelagem: nullableText(cao.cores_pelagem),
          pelagem: nullableText(cao.pelagem),
          castrado: !!cao.castrado,
          autorizacao_uso_imagem: !!cao.autorizacao_uso_imagem,
          data_revacinacao_1: nullableText(cao.data_revacinacao_1),
          nome_vacina_revacinacao_1: nullableText(cao.nome_vacina_revacinacao_1),
          data_revacinacao_2: nullableText(cao.data_revacinacao_2),
          nome_vacina_revacinacao_2: nullableText(cao.nome_vacina_revacinacao_2),
          data_revacinacao_3: nullableText(cao.data_revacinacao_3),
          nome_vacina_revacinacao_3: nullableText(cao.nome_vacina_revacinacao_3),
          alimentacao_marca_racao: isNaturalFood ? null : nullableText(cao.alimentacao_marca_racao),
          alimentacao_sabor: isNaturalFood ? null : nullableText(cao.alimentacao_sabor),
          alimentacao_tipo: isNaturalFood ? "Alimentação natural" : nullableText(cao.alimentacao_tipo),
          ...dogMeals,
          alergias: nullableText(cao.alergias),
          restricoes_cuidados: nullableText(cao.restricoes_cuidados),
          veterinario_responsavel: nullableText(cao.veterinario_responsavel),
          veterinario_horario_atendimento: nullableText(cao.veterinario_horario_atendimento),
          veterinario_telefone: nullableText(cao.veterinario_telefone),
          veterinario_clinica_telefone: nullableText(cao.veterinario_clinica_telefone),
          veterinario_endereco: nullableText(cao.veterinario_endereco),
          observacoes_gerais: nullableText(cao.observacoes_gerais),
          medicamentos_continuos: sanitizeContinuousMedications(cao.medicamentos_continuos),
          ativo: true,
          created_date: now,
          updated_date: now,
        }])
        .select("id")
        .maybeSingle();

      if (dogError || !dogRow?.id) {
        return jsonResponse({ error: withSchemaHint(dogError, "Nao foi possivel criar o cadastro do cao.") }, 500);
      }

      createdDogIds.push(dogRow.id);
    }

    const dogSlots = buildDogSlots(createdDogIds);
    let responsavelId = sanitizeText(metadata.existing_responsavel_id);

    if (registrationMode === "full") {
      const { data: responsavelRow, error: responsavelError } = await admin
        .from("responsavel")
        .insert([{
          empresa_id: link.empresa_id,
          nome_completo: formatDisplayName(responsavel.nome_completo),
          cpf: nullableText(responsavel.cpf),
          celular: nullableText(responsavel.celular),
          celular_alternativo: nullableText(responsavel.celular_alternativo),
          email: nullableText(responsavel.email)?.toLowerCase() || null,
          ativo: true,
          created_date: now,
          updated_date: now,
          ...dogSlots,
        }])
        .select("id")
        .maybeSingle();

      if (responsavelError || !responsavelRow?.id) {
        return jsonResponse({ error: withSchemaHint(responsavelError, "Nao foi possivel criar o responsavel.") }, 500);
      }

      responsavelId = responsavelRow.id;
    } else {
      if (!responsavelId) {
        return jsonResponse({ error: "Este link nao possui um responsavel existente vinculado." }, 400);
      }

      await appendDogsToExistingRecord("responsavel", responsavelId, link.empresa_id, createdDogIds);
    }

    const contatoOrcamentos = {
      nome: nullableText(formatDisplayName(financeiro.contato_orcamentos_nome)),
      celular: nullableText(financeiro.contato_orcamentos_celular),
      email: nullableText(financeiro.contato_orcamentos_email)?.toLowerCase() || null,
    };

    const contatoAlinhamentos = {
      nome: nullableText(formatDisplayName(financeiro.contato_alinhamentos_nome)),
      celular: nullableText(financeiro.contato_alinhamentos_celular),
      email: nullableText(financeiro.contato_alinhamentos_email)?.toLowerCase() || null,
    };
    let carteiraId = sanitizeText(metadata.existing_carteira_id);

    if (registrationMode === "dog_only") {
      if (!carteiraId) {
        return jsonResponse({ error: "Este link nao possui um responsavel financeiro existente vinculado." }, 400);
      }

      await appendDogsToExistingRecord("carteira", carteiraId, link.empresa_id, createdDogIds);
    } else {
      const { data: carteiraRow, error: carteiraError } = await admin
        .from("carteira")
        .insert([{
          empresa_id: link.empresa_id,
          nome_razao_social: formatDisplayName(financeiro.nome_razao_social),
          cpf_cnpj: nullableText(financeiro.cpf_cnpj),
          celular: nullableText(financeiro.celular),
          email: nullableText(financeiro.email)?.toLowerCase() || null,
          cep: nullableText(financeiro.cep),
          numero_residencia: nullableText(financeiro.number),
          street: nullableText(financeiro.street),
          neighborhood: nullableText(financeiro.neighborhood),
          city: nullableText(financeiro.city),
          state: nullableText(financeiro.state),
          vencimento_planos: nullableText(financeiro.vencimento_planos),
          contato_orcamentos: contatoOrcamentos,
          contato_alinhamentos: contatoAlinhamentos,
          ativo: true,
          created_date: now,
          updated_date: now,
          ...dogSlots,
        }])
        .select("id")
        .maybeSingle();

      if (carteiraError || !carteiraRow?.id) {
        return jsonResponse({ error: withSchemaHint(carteiraError, "Nao foi possivel criar o responsavel financeiro.") }, 500);
      }

      carteiraId = carteiraRow.id;
    }

    const { error: updateError } = await admin
      .from("client_registration_link")
      .update({
        status: "concluido",
        responsavel_id: responsavelId,
        carteira_id: carteiraId,
        dog_ids: createdDogIds,
        submitted_payload: formPayload,
        completed_at: now,
        updated_date: now,
      })
      .eq("id", link.id);

    if (updateError) {
      return jsonResponse({ error: withSchemaHint(updateError, "O cadastro foi salvo, mas nao foi possivel finalizar o link.") }, 500);
    }

    const dogNames = caes.map((cao) => formatDisplayName(cao.nome)).filter(Boolean);
    const prefill = (metadata.prefill || {}) as Record<string, unknown>;
    const prefillResponsavel = (prefill.responsavel || {}) as Record<string, unknown>;
    const responsavelName = registrationMode === "full"
      ? formatDisplayName(responsavel.nome_completo)
      : formatDisplayName(prefillResponsavel.nome_completo || responsavel.nome_completo);
    const firstDogId = createdDogIds[0] || null;

    await createRegistrationCompletedNotifications({
      empresaId: link.empresa_id,
      mensagem: buildDogRegistrationSummary(responsavelName, dogNames),
      link: firstDogId ? `/perfil-cao?id=${encodeURIComponent(firstDogId)}` : `/perfis?tab=responsaveis&id=${encodeURIComponent(responsavelId)}&perfil=responsavel`,
      entityType: firstDogId ? "dog" : "responsavel",
      entityId: firstDogId || responsavelId,
      payload: {
        registration_mode: registrationMode,
        responsavel_id: responsavelId,
        carteira_id: carteiraId,
        dog_ids: createdDogIds,
        responsavel_nome: responsavelName,
        dog_names: dogNames,
      },
    });

    return jsonResponse({
      ok: true,
      responsavel_id: responsavelId,
      carteira_id: carteiraId,
      dog_ids: createdDogIds,
    });
  } catch (error) {
    return jsonResponse({ error: withSchemaHint(error, "Nao foi possivel concluir o cadastro.") }, 500);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const payload = await request.json();
    const action = sanitizeText(payload?.action);

    if (action === "create_link") {
      return await handleCreateLink(request, payload || {});
    }

    if (action === "get_context") {
      return await handleGetContext(payload || {});
    }

    if (action === "verify_cpf") {
      return await handleVerifyCpf(payload || {});
    }

    if (action === "submit") {
      return await handleSubmit(payload || {});
    }

    return jsonResponse({ error: "Acao invalida." }, 400);
  } catch (error) {
    return jsonResponse({
      error: withSchemaHint(error, "Falha ao processar o cadastro do cliente."),
    }, 500);
  }
});
