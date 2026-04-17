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
  return /client_registration_link|restricoes_cuidados|observacoes_gerais|castrado|contato_orcamentos|contato_alinhamentos|street|neighborhood|city|state/i.test(message);
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

function validatePayload(payload: Record<string, unknown>) {
  const responsavel = (payload?.responsavel || {}) as Record<string, unknown>;
  const financeiro = (payload?.financeiro || {}) as Record<string, unknown>;
  const caes = Array.isArray(payload?.caes) ? payload.caes as Record<string, unknown>[] : [];

  if (!sanitizeText(responsavel.nome_completo) || !sanitizeText(responsavel.cpf) || !sanitizeText(responsavel.celular) || !sanitizeText(responsavel.email)) {
    throw new Error("Preencha nome, CPF, celular e email do responsavel.");
  }

  if (caes.length === 0) {
    throw new Error("Informe ao menos um cao.");
  }

  if (caes.some((cao) => !sanitizeText(cao.nome) || !sanitizeText(cao.raca))) {
    throw new Error("Cada cao precisa ter ao menos nome e raca.");
  }

  if (!sanitizeText(financeiro.nome_razao_social) || !sanitizeText(financeiro.cpf_cnpj) || !sanitizeText(financeiro.celular) || !sanitizeText(financeiro.email)) {
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
    const { data, error } = await admin
      .from("client_registration_link")
      .insert([{
        empresa_id: empresaId,
        responsavel_nome: nullableText(payload.responsavel_nome),
        responsavel_email: nullableText(payload.responsavel_email)?.toLowerCase() || null,
        status: "pendente",
        metadata: {
          source: "cadastro",
        },
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
    validatePayload(formPayload);

    const responsavel = (formPayload.responsavel || {}) as Record<string, unknown>;
    const financeiro = (formPayload.financeiro || {}) as Record<string, unknown>;
    const caes = Array.isArray(formPayload.caes) ? formPayload.caes as Record<string, unknown>[] : [];
    const now = new Date().toISOString();

    const createdDogIds: string[] = [];
    for (const cao of caes) {
      const { data: dogRow, error: dogError } = await admin
        .from("dogs")
        .insert([{
          empresa_id: link.empresa_id,
          nome: sanitizeText(cao.nome),
          apelido: nullableText(cao.apelido),
          raca: nullableText(cao.raca),
          peso: nullableText(cao.peso),
          data_nascimento: nullableText(cao.data_nascimento),
          sexo: nullableText(cao.sexo),
          porte: nullableText(cao.porte),
          castrado: !!cao.castrado,
          alimentacao_marca_racao: nullableText(cao.alimentacao_marca_racao),
          alimentacao_sabor: nullableText(cao.alimentacao_sabor),
          alimentacao_tipo: nullableText(cao.alimentacao_tipo),
          refeicao_1_qnt: nullableText(cao.refeicao_1_qnt),
          refeicao_1_horario: nullableText(cao.refeicao_1_horario),
          refeicao_1_obs: nullableText(cao.refeicao_1_obs),
          refeicao_2_qnt: nullableText(cao.refeicao_2_qnt),
          refeicao_2_horario: nullableText(cao.refeicao_2_horario),
          refeicao_2_obs: nullableText(cao.refeicao_2_obs),
          refeicao_3_qnt: nullableText(cao.refeicao_3_qnt),
          refeicao_3_horario: nullableText(cao.refeicao_3_horario),
          refeicao_3_obs: nullableText(cao.refeicao_3_obs),
          refeicao_4_qnt: nullableText(cao.refeicao_4_qnt),
          refeicao_4_horario: nullableText(cao.refeicao_4_horario),
          refeicao_4_obs: nullableText(cao.refeicao_4_obs),
          alergias: nullableText(cao.alergias),
          restricoes_cuidados: nullableText(cao.restricoes_cuidados),
          veterinario_responsavel: nullableText(cao.veterinario_responsavel),
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

    const { data: responsavelRow, error: responsavelError } = await admin
      .from("responsavel")
      .insert([{
        empresa_id: link.empresa_id,
        nome_completo: sanitizeText(responsavel.nome_completo),
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

    const contatoOrcamentos = {
      nome: nullableText(financeiro.contato_orcamentos_nome),
      celular: nullableText(financeiro.contato_orcamentos_celular),
      email: nullableText(financeiro.contato_orcamentos_email)?.toLowerCase() || null,
    };

    const contatoAlinhamentos = {
      nome: nullableText(financeiro.contato_alinhamentos_nome),
      celular: nullableText(financeiro.contato_alinhamentos_celular),
      email: nullableText(financeiro.contato_alinhamentos_email)?.toLowerCase() || null,
    };

    const { data: carteiraRow, error: carteiraError } = await admin
      .from("carteira")
      .insert([{
        empresa_id: link.empresa_id,
        nome_razao_social: sanitizeText(financeiro.nome_razao_social),
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

    const { error: updateError } = await admin
      .from("client_registration_link")
      .update({
        status: "concluido",
        responsavel_id: responsavelRow.id,
        carteira_id: carteiraRow.id,
        dog_ids: createdDogIds,
        submitted_payload: formPayload,
        completed_at: now,
        updated_date: now,
      })
      .eq("id", link.id);

    if (updateError) {
      return jsonResponse({ error: withSchemaHint(updateError, "O cadastro foi salvo, mas nao foi possivel finalizar o link.") }, 500);
    }

    return jsonResponse({
      ok: true,
      responsavel_id: responsavelRow.id,
      carteira_id: carteiraRow.id,
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
