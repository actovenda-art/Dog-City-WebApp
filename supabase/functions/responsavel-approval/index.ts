import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-active-unit-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
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

function normalizeLogin(value: unknown) {
  return sanitizeText(value).toLowerCase();
}

function randomToken(bytes = 24) {
  const buffer = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buffer).map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string, salt: string) {
  return sha256Hex(`${salt}:${password}`);
}

function buildRequestHeaders(request: Request) {
  return {
    ip_address: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "",
    user_agent: request.headers.get("user-agent") || "",
  };
}

async function getAuthenticatedStaff(request: Request) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user?.id) return null;

  const { data: profile } = await admin
    .from("users")
    .select("id, email, full_name, empresa_id, active")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (!profile || profile.active === false) return null;
  return profile;
}

async function writeAuditLog(payload: {
  empresaId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  newValue?: Record<string, unknown> | null;
  oldValue?: Record<string, unknown> | null;
  reason?: string | null;
}) {
  try {
    await admin.from("audit_logs").insert([{
      empresa_id: payload.empresaId || null,
      user_id: payload.userId || null,
      action: payload.action,
      entity_type: payload.entityType,
      entity_id: payload.entityId || null,
      old_value: payload.oldValue || null,
      new_value: payload.newValue || null,
      reason: payload.reason || null,
      created_at: new Date().toISOString(),
      created_date: new Date().toISOString(),
    }]);
  } catch (error) {
    console.warn("Nao foi possivel registrar auditoria:", error);
  }
}

async function createNotifications(userIds: string[], data: {
  empresaId?: string | null;
  tipo: string;
  titulo: string;
  mensagem: string;
  link?: string | null;
  payload?: Record<string, unknown>;
}) {
  const recipients = [...new Set(userIds.filter(Boolean))];
  if (!recipients.length) return;

  const now = new Date().toISOString();
  await admin.from("notificacao").insert(
    recipients.map((userId) => ({
      user_id: userId,
      empresa_id: data.empresaId || null,
      tipo: data.tipo,
      titulo: data.titulo,
      mensagem: data.mensagem,
      link: data.link || null,
      payload: data.payload || {},
      created_date: now,
      updated_date: now,
    })),
  );
}

async function loadCommercialRecipients(empresaId: string | null | undefined) {
  if (!empresaId) return [];
  const { data: rows } = await admin
    .from("users")
    .select("id, empresa_id, active, is_platform_admin, access_profile_id")
    .eq("empresa_id", empresaId)
    .eq("active", true)
    .limit(200);

  return (rows || []).map((item) => item.id).filter(Boolean);
}

async function loadRequestContextByToken(token: string) {
  const normalizedToken = sanitizeText(token);
  if (!normalizedToken) {
    throw new Error("Link de aprovacao invalido.");
  }

  const { data: requestRow, error } = await admin
    .from("responsavel_approval_request")
    .select("*")
    .eq("access_link_token", normalizedToken)
    .maybeSingle();

  if (error) throw new Error(error.message || "Nao foi possivel localizar a solicitacao.");
  if (!requestRow) throw new Error("Solicitacao de aprovacao nao localizada.");

  const now = Date.now();
  if (requestRow.expires_at && new Date(requestRow.expires_at).getTime() < now && requestRow.status === "pendente") {
    await admin
      .from("responsavel_approval_request")
      .update({ status: "expirado", updated_at: new Date().toISOString() })
      .eq("id", requestRow.id);
    requestRow.status = "expirado";
  }

  const [responsavelResult, orcamentoResult] = await Promise.all([
    admin.from("responsavel").select("*").eq("id", requestRow.responsavel_id).maybeSingle(),
    requestRow.orcamento_id
      ? admin.from("orcamento").select("*").eq("id", requestRow.orcamento_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const dogIds = Array.isArray(requestRow.dog_ids) ? requestRow.dog_ids.filter(Boolean) : [];
  let dogs: Array<Record<string, unknown>> = [];
  if (dogIds.length) {
    const { data } = await admin.from("dogs").select("id, nome, raca, foto_url").in("id", dogIds);
    dogs = data || [];
  }

  return {
    request: requestRow,
    responsavel: responsavelResult.data || null,
    orcamento: orcamentoResult.data || null,
    dogs,
  };
}

async function handleUpsertAccess(request: Request, body: Record<string, unknown>) {
  const staff = await getAuthenticatedStaff(request);
  if (!staff) return jsonResponse({ error: "Sessao obrigatoria para configurar o acesso do responsavel." }, 401);

  const responsavelId = sanitizeText(body.responsavel_id);
  const login = normalizeLogin(body.login);
  const password = sanitizeText(body.password);
  if (!responsavelId || !login || password.length < 6) {
    return jsonResponse({ error: "Informe responsavel, login e uma senha com pelo menos 6 caracteres." }, 400);
  }

  const { data: responsavel } = await admin
    .from("responsavel")
    .select("id, nome_completo, empresa_id")
    .eq("id", responsavelId)
    .maybeSingle();

  if (!responsavel) return jsonResponse({ error: "Responsavel nao encontrado." }, 404);

  const { data: existingLogin } = await admin
    .from("responsavel_portal_access")
    .select("id, responsavel_id")
    .eq("login", login)
    .maybeSingle();

  if (existingLogin && existingLogin.responsavel_id !== responsavelId) {
    return jsonResponse({ error: "Este login ja esta sendo usado por outro responsavel." }, 409);
  }

  const salt = randomToken(16);
  const passwordHash = await hashPassword(password, salt);
  const now = new Date().toISOString();

  const { data: currentAccess } = await admin
    .from("responsavel_portal_access")
    .select("*")
    .eq("responsavel_id", responsavelId)
    .maybeSingle();

  const payload = {
    empresa_id: responsavel.empresa_id || staff.empresa_id || null,
    responsavel_id: responsavelId,
    login,
    password_hash: passwordHash,
    password_salt: salt,
    ativo: true,
    updated_at: now,
  };

  const query = currentAccess
    ? admin.from("responsavel_portal_access").update(payload).eq("id", currentAccess.id).select("*").single()
    : admin.from("responsavel_portal_access").insert([{ ...payload, created_at: now }]).select("*").single();

  const { data, error } = await query;
  if (error) return jsonResponse({ error: error.message || "Nao foi possivel salvar o acesso do responsavel." }, 400);

  await writeAuditLog({
    empresaId: responsavel.empresa_id || staff.empresa_id || null,
    userId: staff.id,
    action: currentAccess ? "responsavel_access_updated" : "responsavel_access_created",
    entityType: "responsavel_portal_access",
    entityId: data.id,
    newValue: { responsavel_id: responsavelId, login },
  });

  return jsonResponse({ ok: true, access: data });
}

async function handleCreateRequest(request: Request, body: Record<string, unknown>) {
  const staff = await getAuthenticatedStaff(request);
  if (!staff) return jsonResponse({ error: "Sessao obrigatoria para solicitar aprovacao." }, 401);

  const orcamentoId = sanitizeText(body.orcamento_id);
  const responsavelId = sanitizeText(body.responsavel_id);
  if (!orcamentoId || !responsavelId) {
    return jsonResponse({ error: "Informe o orcamento e o responsavel que deve aprovar." }, 400);
  }

  const [{ data: orcamento }, { data: responsavel }, { data: access }] = await Promise.all([
    admin.from("orcamento").select("*").eq("id", orcamentoId).maybeSingle(),
    admin.from("responsavel").select("*").eq("id", responsavelId).maybeSingle(),
    admin.from("responsavel_portal_access").select("*").eq("responsavel_id", responsavelId).maybeSingle(),
  ]);

  if (!orcamento) return jsonResponse({ error: "Orcamento nao encontrado." }, 404);
  if (!responsavel) return jsonResponse({ error: "Responsavel nao encontrado." }, 404);
  if (!access || access.ativo === false) {
    return jsonResponse({ error: "Este responsavel ainda nao possui login liberado no cadastro." }, 409);
  }

  const dogIds = Array.isArray(body.dog_ids) && body.dog_ids.length
    ? body.dog_ids.map((item) => sanitizeText(item)).filter(Boolean)
    : Array.isArray(orcamento.caes)
      ? orcamento.caes.map((item: Record<string, unknown>) => sanitizeText(item?.dog_id)).filter(Boolean)
      : [];

  const expiresHours = Math.max(1, Math.min(72, Number(body.expires_hours) || 24));
  const linkToken = randomToken(24);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresHours * 60 * 60 * 1000).toISOString();
  const sourceContext = typeof body.source_context === "object" && body.source_context
    ? body.source_context
    : {
      valor_total: Number(orcamento.valor_total || 0),
      data_validade: orcamento.data_validade || null,
      status_orcamento: orcamento.status || null,
    };

  const { data, error } = await admin
    .from("responsavel_approval_request")
    .insert([{
      empresa_id: orcamento.empresa_id || responsavel.empresa_id || staff.empresa_id || null,
      responsavel_id: responsavelId,
      orcamento_id: orcamentoId,
      appointment_id: sanitizeText(body.appointment_id) || null,
      requested_by_user_id: staff.id,
      dog_ids: dogIds,
      source_context: sourceContext,
      requested_channel: sanitizeText(body.requested_channel) || "manual",
      requester_note: sanitizeText(body.requester_note) || null,
      access_link_token: linkToken,
      expires_at: expiresAt,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }])
    .select("*")
    .single();

  if (error) return jsonResponse({ error: error.message || "Nao foi possivel criar a solicitacao de aprovacao." }, 400);

  await writeAuditLog({
    empresaId: data.empresa_id,
    userId: staff.id,
    action: "responsavel_approval_requested",
    entityType: "responsavel_approval_request",
    entityId: data.id,
    newValue: { orcamento_id: orcamentoId, responsavel_id: responsavelId, requested_channel: data.requested_channel },
  });

  const approvalUrl = `${supabaseUrl.replace(/\/+$/, "").replace(/\/rest\/v1$/, "")}`;

  return jsonResponse({
    ok: true,
    request: data,
    approval_url: `${Deno.env.get("APP_PUBLIC_URL") || "http://localhost:5173"}/aprovacao-responsavel?token=${encodeURIComponent(linkToken)}`,
    responsavel: {
      id: responsavel.id,
      nome_completo: responsavel.nome_completo || "",
      celular: responsavel.celular || "",
      email: responsavel.email || "",
      login: access.login || "",
    },
    debug_origin: approvalUrl,
  });
}

async function handleGetContext(body: Record<string, unknown>) {
  try {
    const context = await loadRequestContextByToken(sanitizeText(body.token));
    return jsonResponse({ ok: true, ...context, authenticated: false });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Nao foi possivel carregar a solicitacao." }, 400);
  }
}

async function handleAuthenticate(request: Request, body: Record<string, unknown>) {
  try {
    const context = await loadRequestContextByToken(sanitizeText(body.token));
    if (context.request.status !== "pendente") {
      return jsonResponse({ error: "Esta solicitacao nao aceita mais aprovacoes." }, 409);
    }

    const login = normalizeLogin(body.login);
    const password = sanitizeText(body.password);
    if (!login || !password) {
      return jsonResponse({ error: "Informe login e senha do responsavel." }, 400);
    }

    const { data: access } = await admin
      .from("responsavel_portal_access")
      .select("*")
      .eq("responsavel_id", context.request.responsavel_id)
      .eq("login", login)
      .eq("ativo", true)
      .maybeSingle();

    if (!access) return jsonResponse({ error: "Login ou senha invalidos para este responsavel." }, 401);

    const passwordHash = await hashPassword(password, access.password_salt);
    if (passwordHash !== access.password_hash) {
      return jsonResponse({ error: "Login ou senha invalidos para este responsavel." }, 401);
    }

    const headers = buildRequestHeaders(request);
    const sessionToken = randomToken(24);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    const { data: session, error } = await admin
      .from("responsavel_approval_session")
      .insert([{
        request_id: context.request.id,
        access_id: access.id,
        session_token: sessionToken,
        expires_at: expiresAt,
        ip_address: headers.ip_address || null,
        user_agent: headers.user_agent || null,
        created_at: now.toISOString(),
      }])
      .select("*")
      .single();

    if (error) return jsonResponse({ error: error.message || "Nao foi possivel abrir a sessao de aprovacao." }, 400);

    await admin
      .from("responsavel_portal_access")
      .update({ last_login_at: now.toISOString() })
      .eq("id", access.id);

    await writeAuditLog({
      empresaId: context.request.empresa_id,
      action: "responsavel_approval_authenticated",
      entityType: "responsavel_approval_request",
      entityId: context.request.id,
      newValue: { login, session_id: session.id },
    });

    return jsonResponse({
      ok: true,
      session_token: sessionToken,
      authenticated: true,
      ...context,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Nao foi possivel autenticar o responsavel." }, 400);
  }
}

async function handleDecision(request: Request, body: Record<string, unknown>, action: "approve" | "decline") {
  try {
    const context = await loadRequestContextByToken(sanitizeText(body.token));
    if (context.request.status !== "pendente") {
      return jsonResponse({ error: "Esta solicitacao ja foi encerrada." }, 409);
    }

    const sessionToken = sanitizeText(body.session_token);
    if (!sessionToken) {
      return jsonResponse({ error: "Sessao de aprovacao obrigatoria." }, 401);
    }

    const { data: session } = await admin
      .from("responsavel_approval_session")
      .select("*")
      .eq("request_id", context.request.id)
      .eq("session_token", sessionToken)
      .maybeSingle();

    if (!session) return jsonResponse({ error: "Sessao de aprovacao invalida." }, 401);
    if (session.used_at) return jsonResponse({ error: "Esta sessao ja foi utilizada." }, 409);
    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: "A sessao de aprovacao expirou. Abra o link novamente." }, 401);
    }

    const headers = buildRequestHeaders(request);
    const now = new Date().toISOString();
    const nextStatus = action === "approve" ? "aprovado" : "recusado";
    const updatePayload = {
      status: nextStatus,
      used_at: now,
      approved_at: action === "approve" ? now : null,
      declined_at: action === "decline" ? now : null,
      ip_address: headers.ip_address || null,
      user_agent: headers.user_agent || null,
      updated_at: now,
    };

    const { data: updatedRequest, error } = await admin
      .from("responsavel_approval_request")
      .update(updatePayload)
      .eq("id", context.request.id)
      .select("*")
      .single();

    if (error) return jsonResponse({ error: error.message || "Nao foi possivel registrar a decisao." }, 400);

    await admin
      .from("responsavel_approval_session")
      .update({ used_at: now, last_seen_at: now })
      .eq("id", session.id);

    const recipients = [
      sanitizeText(context.request.requested_by_user_id),
      ...(await loadCommercialRecipients(context.request.empresa_id)),
    ].filter(Boolean);

    await createNotifications(recipients, {
      empresaId: context.request.empresa_id,
      tipo: action === "approve" ? "orcamento_aprovado_responsavel" : "orcamento_recusado_responsavel",
      titulo: action === "approve" ? "Responsável aprovou o orçamento" : "Responsável recusou o orçamento",
      mensagem: `${context.responsavel?.nome_completo || "O responsável"} ${action === "approve" ? "aprovou" : "recusou"} a solicitação autenticada.`,
      link: context.request.orcamento_id ? `/orcamentos?orcamentoId=${encodeURIComponent(context.request.orcamento_id)}` : "/orcamentos",
      payload: {
        orcamento_id: context.request.orcamento_id,
        responsavel_id: context.request.responsavel_id,
        request_id: context.request.id,
      },
    });

    await writeAuditLog({
      empresaId: context.request.empresa_id,
      action: action === "approve" ? "responsavel_approval_approved" : "responsavel_approval_declined",
      entityType: "responsavel_approval_request",
      entityId: context.request.id,
      newValue: { status: nextStatus, orcamento_id: context.request.orcamento_id },
    });

    return jsonResponse({
      ok: true,
      request: updatedRequest,
      responsavel: context.responsavel,
      orcamento: context.orcamento,
      dogs: context.dogs,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Nao foi possivel registrar a decisao." }, 400);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = sanitizeText(body.action);

    switch (action) {
      case "upsert_access":
        return handleUpsertAccess(request, body);
      case "create_request":
        return handleCreateRequest(request, body);
      case "get_context":
        return handleGetContext(body);
      case "authenticate":
        return handleAuthenticate(request, body);
      case "approve":
        return handleDecision(request, body, "approve");
      case "decline":
        return handleDecision(request, body, "decline");
      default:
        return jsonResponse({ error: "Acao invalida para a aprovacao do responsavel." }, 400);
    }
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Falha inesperada." }, 500);
  }
});
