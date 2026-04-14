import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-active-unit-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_BOOTSTRAP_PIN = "654321";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? serviceRoleKey;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios na function.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

type AppUserRow = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  empresa_id?: string | null;
  access_profile_id?: string | null;
  company_role?: string | null;
  is_platform_admin?: boolean | null;
  active?: boolean | null;
  pin_bootstrap_status?: string | null;
};

type UserUnitAccessRow = {
  id: string;
  user_id: string;
  empresa_id: string;
  ativo?: boolean | null;
};

type RequestContext = {
  authUser: { id: string; email?: string | null } | null;
  profile: AppUserRow | null;
  permissions: string[];
  allowedUnitIds: string[];
};

type InviteRow = {
  id: string;
  token?: string | null;
  email?: string | null;
  full_name?: string | null;
  empresa_id?: string | null;
  access_profile_id?: string | null;
  company_role?: string | null;
  is_platform_admin?: boolean | null;
  status?: string | null;
  accepted_at?: string | null;
  onboarding_completed_at?: string | null;
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

function normalizePin(value: unknown) {
  return sanitizeText(value).replace(/\D/g, "").slice(0, 6);
}

function isSequentialPin(pin: string) {
  if (pin.length !== 6) return false;

  let ascending = true;
  let descending = true;

  for (let index = 1; index < pin.length; index += 1) {
    const current = Number(pin[index]);
    const previous = Number(pin[index - 1]);

    if (current !== previous + 1) ascending = false;
    if (current !== previous - 1) descending = false;
  }

  return ascending || descending;
}

function validatePin(pin: string) {
  if (pin.length !== 6) {
    return "A senha deve conter 6 numeros.";
  }

  if (isSequentialPin(pin)) {
    return "A senha nao pode ser sequencial.";
  }

  return "";
}

function validateBootstrapPin(pin: string) {
  if (pin.length !== 6) {
    return "O PIN inicial deve conter 6 numeros.";
  }

  return "";
}

function uniqueTextList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => sanitizeText(item)).filter(Boolean))];
}

function normalizeSelectedPairs(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => Array.isArray(item)
      ? [...new Set(item.map((digit) => sanitizeText(digit).replace(/\D/g, "").slice(0, 1)).filter(Boolean))]
      : [])
    .filter((pair) => pair.length === 2);
}

function buildPinCandidates(selectedPairs: string[][]) {
  if (!selectedPairs.length) return [];

  let candidates = [""];
  for (const pair of selectedPairs) {
    const nextCandidates: string[] = [];
    for (const base of candidates) {
      for (const digit of pair) {
        nextCandidates.push(`${base}${digit}`);
      }
    }
    candidates = nextCandidates;
  }

  return [...new Set(candidates.map((candidate) => normalizePin(candidate)).filter((candidate) => candidate.length === 6))];
}

function hasPermission(permissions: string[], requiredPermission: string) {
  const resource = requiredPermission.split(":")[0];
  return permissions.includes(requiredPermission)
    || permissions.includes(`${resource}:*`)
    || permissions.includes("platform:*");
}

async function resolveAllowedUnitIds(userId: string, profile: AppUserRow | null) {
  if (!userId) return [];

  if (profile?.is_platform_admin) {
    const { data, error } = await admin.from("empresa").select("id").order("created_date", { ascending: true }).limit(500);
    if (error) return [];
    return [...new Set((data || []).map((item) => item.id).filter(Boolean))];
  }

  const { data: accessRows, error: accessError } = await admin
    .from("user_unit_access")
    .select("empresa_id")
    .eq("user_id", userId)
    .eq("ativo", true);

  if (!accessError && accessRows?.length) {
    return [...new Set(accessRows.map((item) => item.empresa_id).filter(Boolean))];
  }

  return profile?.empresa_id ? [profile.empresa_id] : [];
}

async function getRequestContext(request: Request): Promise<RequestContext> {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { authUser: null, profile: null, permissions: [], allowedUnitIds: [] };
  }

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user) {
    return { authUser: null, profile: null, permissions: [], allowedUnitIds: [] };
  }

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("*")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) {
    return {
      authUser: { id: authData.user.id, email: authData.user.email },
      profile: null,
      permissions: [],
      allowedUnitIds: [],
    };
  }

  let permissions: string[] = [];
  if (profile?.access_profile_id) {
    const { data: accessProfile } = await admin
      .from("perfil_acesso")
      .select("permissoes")
      .eq("id", profile.access_profile_id)
      .maybeSingle();

    if (Array.isArray(accessProfile?.permissoes)) {
      permissions = accessProfile.permissoes.filter((item: unknown) => typeof item === "string");
    }
  }

  const allowedUnitIds = await resolveAllowedUnitIds(authData.user.id, profile as AppUserRow | null);

  return {
    authUser: { id: authData.user.id, email: authData.user.email },
    profile: (profile as AppUserRow | null) || null,
    permissions,
    allowedUnitIds,
  };
}

function canManageUsers(ctx: RequestContext, unitIds: string[], wantsPlatformAdmin = false) {
  if (!ctx.authUser?.id || !ctx.profile || ctx.profile.active === false) return false;
  if (ctx.profile.is_platform_admin) return true;
  if (wantsPlatformAdmin) return false;
  if (!hasPermission(ctx.permissions, "usuarios:update")) return false;
  if (unitIds.length === 0) return false;
  return unitIds.every((unitId) => ctx.allowedUnitIds.includes(unitId));
}

async function loadTargetUser(userId: string) {
  const { data: user, error } = await admin.from("users").select("*").eq("id", userId).maybeSingle();
  if (error) {
    throw new Error(error.message || "Nao foi possivel localizar o usuario.");
  }
  if (!user) {
    throw new Error("Usuario nao encontrado.");
  }
  return user as AppUserRow;
}

async function loadAppUserByEmail(email: string) {
  if (!email) return null;
  const normalizedEmail = sanitizeText(email).toLowerCase();
  const { data, error } = await admin
    .from("users")
    .select("*")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Nao foi possivel localizar o usuario pelo email.");
  }

  return (data as AppUserRow | null) || null;
}

async function loadPendingInviteByEmail(email: string) {
  if (!email) return null;
  const normalizedEmail = sanitizeText(email).toLowerCase();
  const { data, error } = await admin
    .from("user_invite")
    .select("*")
    .eq("email", normalizedEmail)
    .in("status", ["pendente", "aceito"])
    .order("created_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Nao foi possivel localizar o convite de usuario.");
  }

  return (data as Record<string, unknown> | null) || null;
}

async function loadInviteByToken(token: string) {
  const normalizedToken = sanitizeText(token);
  if (!normalizedToken) return null;

  const { data, error } = await admin
    .from("user_invite")
    .select("*")
    .eq("token", normalizedToken)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Nao foi possivel localizar o convite.");
  }

  return (data as InviteRow | null) || null;
}

async function loadEmpresaSummary(empresaId: string | null | undefined) {
  const normalizedEmpresaId = sanitizeText(empresaId);
  if (!normalizedEmpresaId) return null;

  const { data, error } = await admin
    .from("empresa")
    .select("id, nome_fantasia, razao_social")
    .eq("id", normalizedEmpresaId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Nao foi possivel carregar a unidade do convite.");
  }

  return data || null;
}

async function upsertUserUnitAccessRow({
  userId,
  empresaId,
  accessProfileId,
  papel,
  ativo = true,
  isDefault = true,
}: {
  userId: string;
  empresaId: string | null;
  accessProfileId?: string | null;
  papel?: string | null;
  ativo?: boolean;
  isDefault?: boolean;
}) {
  const normalizedEmpresaId = sanitizeText(empresaId);
  if (!userId || !normalizedEmpresaId) return;

  const { data: existingRow, error: existingError } = await admin
    .from("user_unit_access")
    .select("*")
    .eq("user_id", userId)
    .eq("empresa_id", normalizedEmpresaId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message || "Nao foi possivel carregar o acesso da unidade.");
  }

  const payload = {
    user_id: userId,
    empresa_id: normalizedEmpresaId,
    access_profile_id: accessProfileId || null,
    papel: papel || "company_user",
    ativo,
    is_default: isDefault,
    updated_date: new Date().toISOString(),
  };

  if (existingRow?.id) {
    const { error } = await admin
      .from("user_unit_access")
      .update(payload)
      .eq("id", existingRow.id);

    if (error) {
      throw new Error(error.message || "Nao foi possivel atualizar o acesso da unidade.");
    }
    return;
  }

  const { error } = await admin
    .from("user_unit_access")
    .insert([payload]);

  if (error) {
    throw new Error(error.message || "Nao foi possivel criar o acesso da unidade.");
  }
}

async function createAppUserFromInvite(invite: Record<string, any>) {
  const now = new Date().toISOString();
  const normalizedEmail = sanitizeText(invite.email).toLowerCase();
  const fullName = sanitizeText(invite.full_name) || null;

  let authUserId: string | null = null;

  try {
    const { data } = await admin.auth.admin.getUserByEmail(normalizedEmail);
    authUserId = data?.user?.id || null;
  } catch {
    authUserId = null;
  }

  if (!authUserId) {
    authUserId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `invite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { data, error } = await admin.auth.admin.createUser({
      id: authUserId,
      email: normalizedEmail,
      password: DEFAULT_BOOTSTRAP_PIN,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });

    if (error) {
      throw new Error(error.message || "Nao foi possivel criar o usuario de autenticacao para o convite.");
    }

    authUserId = data?.user?.id || authUserId;
  }

  const { data, error } = await admin
    .from("users")
    .insert([{
      id: authUserId,
      email: normalizedEmail,
      full_name: fullName,
      profile: "usuario",
      active: true,
      empresa_id: invite.empresa_id || null,
      access_profile_id: invite.access_profile_id || null,
      company_role: invite.company_role || null,
      is_platform_admin: invite.is_platform_admin ?? false,
      onboarding_status: "pendente",
      pin_required_reset: true,
      pin_bootstrap_status: "pronto",
      created_date: now,
      updated_date: now,
    }])
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Nao foi possivel criar o usuario de aplicacao a partir do convite.");
  }

  await admin
    .from("user_invite")
    .update({
      status: "aceito",
      accepted_at: invite.accepted_at || now,
      updated_date: now,
    })
    .eq("id", invite.id);

  return data as AppUserRow | null;
}

async function touchPinVerification(userId: string) {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("users")
    .update({
      pin_last_verified_at: now,
      updated_date: now,
    })
    .eq("id", userId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Nao foi possivel registrar a validacao do PIN.");
  }

  return data;
}

async function signInWithPassword(email: string, password: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

async function getAuthUserById(userId: string) {
  if (!userId) return null;

  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    return null;
  }

  return data.user;
}

async function ensureBootstrapAuthUser(user: AppUserRow, defaultPin: string) {
  const email = sanitizeText(user.email).toLowerCase();
  if (!user.id || !email) {
    throw new Error("Usuario sem identificador ou email valido para preparar o PIN.");
  }

  const existingAuthUser = await getAuthUserById(user.id);
  if (existingAuthUser) {
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password: defaultPin,
      email_confirm: true,
      user_metadata: user.full_name ? { full_name: user.full_name } : undefined,
    });

    if (updateError) {
      throw new Error(updateError.message || "Nao foi possivel atualizar a senha no Auth.");
    }

    return { mode: "updated" as const };
  }

  const { data, error: createError } = await admin.auth.admin.createUser({
    id: user.id,
    email,
    password: defaultPin,
    email_confirm: true,
    user_metadata: user.full_name ? { full_name: user.full_name } : undefined,
  });

  if (createError) {
    throw new Error(createError.message || "Nao foi possivel criar o usuario no Auth.");
  }

  return {
    mode: "created" as const,
    auth_user_id: data?.user?.id || user.id,
  };
}

async function loadTargetUserAccessRows(userId: string) {
  const { data, error } = await admin
    .from("user_unit_access")
    .select("*")
    .eq("user_id", userId)
    .order("created_date", { ascending: true });

  if (error) {
    throw new Error(error.message || "Nao foi possivel carregar os acessos por unidade.");
  }

  return (data || []) as UserUnitAccessRow[];
}

async function handleSaveUserAccess(request: Request, payload: Record<string, unknown>) {
  const ctx = await getRequestContext(request);
  const userId = sanitizeText(payload.user_id);

  if (!userId) {
    return jsonResponse({ error: "user_id obrigatorio." }, 400);
  }

  const existingUser = await loadTargetUser(userId);
  const existingAccessRows = await loadTargetUserAccessRows(userId);
  const requestedUnitIds = uniqueTextList(payload.unit_ids);
  const requestedPrimaryUnitId = sanitizeText(payload.primary_unit_id || payload.empresa_id);
  const clearAccess = payload.clear_access === true;
  const wantsPlatformAdmin = payload.is_platform_admin === true;

  const permissionUnits = [...new Set([
    ...requestedUnitIds,
    requestedPrimaryUnitId,
    existingUser.empresa_id || "",
    ...existingAccessRows.map((row) => row.empresa_id),
  ].filter(Boolean))];

  if (!canManageUsers(ctx, permissionUnits, wantsPlatformAdmin)) {
    return jsonResponse({ error: "Sem permissao para alterar este acesso." }, 403);
  }

  let nextUnitIds = wantsPlatformAdmin || clearAccess
    ? []
    : [...new Set([
      requestedPrimaryUnitId,
      ...requestedUnitIds,
    ].filter(Boolean))];

  if (!wantsPlatformAdmin && !clearAccess && nextUnitIds.length === 0) {
    return jsonResponse({ error: "Selecione pelo menos uma unidade para este usuario." }, 400);
  }

  const primaryUnitId = wantsPlatformAdmin || clearAccess
    ? null
    : sanitizeText(requestedPrimaryUnitId || nextUnitIds[0]) || null;

  if (primaryUnitId && !nextUnitIds.includes(primaryUnitId)) {
    nextUnitIds = [primaryUnitId, ...nextUnitIds];
  }

  const now = new Date().toISOString();
  const updatePayload = {
    empresa_id: wantsPlatformAdmin ? null : (clearAccess ? null : primaryUnitId),
    access_profile_id: clearAccess ? null : sanitizeText(payload.access_profile_id) || null,
    company_role: wantsPlatformAdmin
      ? "platform_admin"
      : (clearAccess ? null : sanitizeText(payload.company_role) || existingUser.company_role || "company_user"),
    is_platform_admin: wantsPlatformAdmin,
    active: payload.active !== false,
    updated_date: now,
  };

  const { data: updatedUser, error: updateError } = await admin
    .from("users")
    .update(updatePayload)
    .eq("id", userId)
    .select("*")
    .maybeSingle();

  if (updateError) {
    return jsonResponse({ error: updateError.message || "Nao foi possivel atualizar o usuario." }, 500);
  }

  const selectedUnitSet = new Set(nextUnitIds);
  const companyRole = wantsPlatformAdmin ? "platform_admin" : (updatePayload.company_role || "company_user");

  for (const row of existingAccessRows) {
    const shouldRemainActive = !wantsPlatformAdmin && !clearAccess && selectedUnitSet.has(row.empresa_id);
    const { error } = await admin
      .from("user_unit_access")
      .update({
        ativo: shouldRemainActive,
        is_default: shouldRemainActive && row.empresa_id === primaryUnitId,
        access_profile_id: updatePayload.access_profile_id,
        papel: companyRole,
        updated_date: now,
      })
      .eq("id", row.id);

    if (error) {
      return jsonResponse({ error: error.message || "Nao foi possivel atualizar os acessos por unidade." }, 500);
    }
  }

  const existingUnitIds = new Set(existingAccessRows.map((row) => row.empresa_id));
  for (const unitId of nextUnitIds) {
    if (existingUnitIds.has(unitId)) continue;

    const { error } = await admin.from("user_unit_access").insert([{
      user_id: userId,
      empresa_id: unitId,
      access_profile_id: updatePayload.access_profile_id,
      papel: companyRole,
      ativo: true,
      is_default: unitId === primaryUnitId,
      updated_date: now,
    }]);

    if (error) {
      return jsonResponse({ error: error.message || "Nao foi possivel criar os acessos por unidade." }, 500);
    }
  }

  const refreshedAccessRows = await loadTargetUserAccessRows(userId);
  return jsonResponse({
    ok: true,
    user: updatedUser,
    unit_access: refreshedAccessRows,
  });
}

async function handleBootstrapDefaultPins(request: Request, payload: Record<string, unknown>) {
  const ctx = await getRequestContext(request);
  const requestedUserId = sanitizeText(payload.user_id);
  const defaultPin = normalizePin(payload.default_pin || DEFAULT_BOOTSTRAP_PIN);
  const pinValidationError = validateBootstrapPin(defaultPin);

  if (pinValidationError) {
    return jsonResponse({ error: pinValidationError }, 400);
  }

  if (!ctx.profile || (!ctx.profile.is_platform_admin && !hasPermission(ctx.permissions, "usuarios:update"))) {
    return jsonResponse({ error: "Sem permissao para preparar PIN obrigatorio." }, 403);
  }

  let query = admin
    .from("users")
    .select("id, email, full_name, empresa_id, active")
    .order("created_date", { ascending: true })
    .limit(1000);

  if (requestedUserId) {
    query = query.eq("id", requestedUserId);
  } else {
    query = query.eq("active", true);
  }

  const { data: candidateUsers, error } = await query;
  if (error) {
    return jsonResponse({ error: error.message || "Nao foi possivel carregar os usuarios para bootstrap." }, 500);
  }

  const eligibleUsers = (candidateUsers || []).filter((user) => {
    if (!requestedUserId && user.active === false) return false;
    if (ctx.profile?.is_platform_admin) return true;
    return !!user.empresa_id && canManageUsers(ctx, [user.empresa_id], false);
  });

  const summary = {
    total: eligibleUsers.length,
    updated: 0,
    skipped: 0,
    failed: 0,
    results: [] as Array<Record<string, unknown>>,
  };

  for (const user of eligibleUsers) {
    if (!user.id || !user.email) {
      summary.skipped += 1;
      summary.results.push({
        user_id: user.id,
        email: user.email,
        status: "ignorado",
        reason: "Usuario sem email cadastrado.",
      });
      continue;
    }

    let authMode = "updated";
    try {
      const authResult = await ensureBootstrapAuthUser(user as AppUserRow, defaultPin);
      authMode = authResult.mode;
    } catch (error) {
      summary.failed += 1;
      summary.results.push({
        user_id: user.id,
        email: user.email,
        status: "erro",
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const { error: profileError } = await admin
      .from("users")
      .update({
        pin_required_reset: true,
        pin_bootstrap_status: "pronto",
        pin_updated_at: null,
        pin_last_verified_at: null,
        updated_date: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (profileError) {
      summary.failed += 1;
      summary.results.push({
        user_id: user.id,
        email: user.email,
        status: "erro",
        reason: profileError.message || "PIN inicial aplicado, mas a flag de redefinicao nao foi salva.",
      });
      continue;
    }

    summary.updated += 1;
    summary.results.push({
      user_id: user.id,
      email: user.email,
      status: "ok",
      auth_mode: authMode,
    });
  }

  return jsonResponse({
    ok: true,
    default_pin: defaultPin,
    ...summary,
  });
}

async function handleSetPin(request: Request, payload: Record<string, unknown>) {
  const ctx = await getRequestContext(request);
  const pin = normalizePin(payload.pin);
  const validationError = validatePin(pin);

  if (!ctx.authUser?.id) {
    return jsonResponse({ error: "Sessao invalida para definir o PIN." }, 401);
  }

  if (validationError) {
    return jsonResponse({ error: validationError }, 400);
  }

  const { error: authError } = await admin.auth.admin.updateUserById(ctx.authUser.id, {
    password: pin,
  });

  if (authError) {
    return jsonResponse({ error: authError.message || "Nao foi possivel atualizar o PIN." }, 500);
  }

  const now = new Date().toISOString();
  const { data: updatedUser, error: profileError } = await admin
    .from("users")
    .update({
      pin_required_reset: false,
      pin_bootstrap_status: "definido",
      pin_updated_at: now,
      pin_last_verified_at: now,
      updated_date: now,
    })
    .eq("id", ctx.authUser.id)
    .select("*")
    .maybeSingle();

  if (profileError) {
    return jsonResponse({ error: profileError.message || "O PIN foi atualizado, mas o status interno nao foi salvo." }, 500);
  }

  return jsonResponse({
    ok: true,
    user: updatedUser,
  });
}

async function handleGetInviteContext(payload: Record<string, unknown>) {
  const token = sanitizeText(payload.token);
  if (!token) {
    return jsonResponse({ error: "Token do convite obrigatorio." }, 400);
  }

  const invite = await loadInviteByToken(token);
  if (!invite) {
    return jsonResponse({ error: "Convite nao localizado." }, 404);
  }

  if (invite.status === "cancelado") {
    return jsonResponse({ error: "Este convite foi cancelado." }, 410);
  }

  if (invite.status === "concluido") {
    return jsonResponse({ error: "Este convite ja foi concluido." }, 409);
  }

  const empresa = await loadEmpresaSummary(invite.empresa_id || null);

  return jsonResponse({
    ok: true,
    invite: {
      id: invite.id,
      token: invite.token || token,
      full_name: invite.full_name || "",
      email: invite.email || "",
      empresa_id: invite.empresa_id || null,
      access_profile_id: invite.access_profile_id || null,
      company_role: invite.company_role || null,
      is_platform_admin: invite.is_platform_admin ?? false,
      status: invite.status || "pendente",
    },
    empresa,
  });
}

async function handleCompleteInviteOnboarding(payload: Record<string, unknown>) {
  const token = sanitizeText(payload.token);
  const pin = normalizePin(payload.pin);
  const validationError = validatePin(pin);

  if (!token) {
    return jsonResponse({ error: "Token do convite obrigatorio." }, 400);
  }

  if (validationError) {
    return jsonResponse({ error: validationError }, 400);
  }

  const invite = await loadInviteByToken(token);
  if (!invite) {
    return jsonResponse({ error: "Convite nao localizado." }, 404);
  }

  if (invite.status === "cancelado") {
    return jsonResponse({ error: "Este convite foi cancelado." }, 410);
  }

  if (invite.status === "concluido") {
    return jsonResponse({ error: "Este convite ja foi concluido." }, 409);
  }

  const profile = (payload.profile && typeof payload.profile === "object")
    ? (payload.profile as Record<string, unknown>)
    : {};
  const normalizedEmail = sanitizeText(invite.email).toLowerCase();
  if (!normalizedEmail) {
    return jsonResponse({ error: "Este convite nao possui email valido." }, 400);
  }

  const fullName = sanitizeText(profile.full_name || invite.full_name);
  const existingUser = await loadAppUserByEmail(normalizedEmail);
  if (existingUser?.onboarding_status === "completo" && existingUser?.active !== false) {
    return jsonResponse({
      error: "Este email ja possui acesso concluido. Use o login normal ou ajuste o acesso na Gestao de Usuarios.",
    }, 409);
  }

  let authUser = null;
  try {
    const { data } = await admin.auth.admin.getUserByEmail(normalizedEmail);
    authUser = data?.user || null;
  } catch {
    authUser = null;
  }

  if (existingUser?.id && authUser?.id && existingUser.id !== authUser.id) {
    return jsonResponse({
      error: "Conflito entre o usuario de autenticacao e o cadastro interno deste email.",
    }, 409);
  }

  const userId = existingUser?.id || authUser?.id || (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `invite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  if (authUser?.id) {
    const { error: updateAuthError } = await admin.auth.admin.updateUserById(authUser.id, {
      password: pin,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });

    if (updateAuthError) {
      return jsonResponse({ error: updateAuthError.message || "Nao foi possivel atualizar o acesso do convite." }, 500);
    }
  } else {
    const { error: createAuthError } = await admin.auth.admin.createUser({
      id: userId,
      email: normalizedEmail,
      password: pin,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });

    if (createAuthError) {
      return jsonResponse({ error: createAuthError.message || "Nao foi possivel criar o acesso do convite." }, 500);
    }
  }

  const now = new Date().toISOString();
  const profilePayload = {
    email: normalizedEmail,
    full_name: fullName || null,
    cpf: sanitizeText(profile.cpf) || null,
    birth_date: sanitizeText(profile.birth_date) || null,
    cep: sanitizeText(profile.cep) || null,
    street: sanitizeText(profile.street) || null,
    number: sanitizeText(profile.number) || null,
    neighborhood: sanitizeText(profile.neighborhood) || null,
    city: sanitizeText(profile.city) || null,
    state: sanitizeText(profile.state) || null,
    pix_key_type: sanitizeText(profile.pix_key_type) || null,
    pix_key: sanitizeText(profile.pix_key) || null,
    contact_nickname: sanitizeText(profile.contact_nickname) || null,
    emergency_contact: sanitizeText(profile.emergency_contact) || null,
    profile_photo_path: null,
    onboarding_status: "completo",
    onboarding_completed_at: now,
    active: true,
    empresa_id: invite.empresa_id || null,
    access_profile_id: invite.access_profile_id || null,
    company_role: invite.is_platform_admin ? "platform_admin" : (invite.company_role || "company_user"),
    is_platform_admin: invite.is_platform_admin ?? false,
    pin_required_reset: false,
    pin_bootstrap_status: "definido",
    pin_updated_at: now,
    pin_last_verified_at: now,
    updated_date: now,
  };

  let savedUser: AppUserRow | null = null;
  if (existingUser?.id) {
    const { data, error } = await admin
      .from("users")
      .update(profilePayload)
      .eq("id", existingUser.id)
      .select("*")
      .maybeSingle();

    if (error) {
      return jsonResponse({ error: error.message || "Nao foi possivel concluir o cadastro do convite." }, 500);
    }
    savedUser = (data as AppUserRow | null) || null;
  } else {
    const { data, error } = await admin
      .from("users")
      .insert([{
        id: userId,
        profile: "usuario",
        created_date: now,
        ...profilePayload,
      }])
      .select("*")
      .maybeSingle();

    if (error) {
      return jsonResponse({ error: error.message || "Nao foi possivel criar o usuario do convite." }, 500);
    }
    savedUser = (data as AppUserRow | null) || null;
  }

  try {
    if (!(invite.is_platform_admin ?? false) && invite.empresa_id) {
      await upsertUserUnitAccessRow({
        userId: savedUser?.id || userId,
        empresaId: invite.empresa_id,
        accessProfileId: invite.access_profile_id || null,
        papel: invite.company_role || "company_user",
        ativo: true,
        isDefault: true,
      });
    }
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Nao foi possivel salvar o acesso da unidade do convite.",
    }, 500);
  }

  const { error: inviteUpdateError } = await admin
    .from("user_invite")
    .update({
      status: "concluido",
      accepted_at: invite.accepted_at || now,
      onboarding_completed_at: now,
      updated_date: now,
    })
    .eq("id", invite.id);

  if (inviteUpdateError) {
    return jsonResponse({ error: inviteUpdateError.message || "Nao foi possivel finalizar o convite." }, 500);
  }

  const signInResult = await signInWithPassword(normalizedEmail, pin);
  if (!signInResult.ok || !signInResult?.payload?.access_token || !signInResult?.payload?.refresh_token) {
    return jsonResponse({ error: "O cadastro foi concluido, mas nao foi possivel iniciar a sessao automaticamente." }, 500);
  }

  return jsonResponse({
    ok: true,
    user: savedUser,
    session: {
      access_token: signInResult.payload.access_token,
      refresh_token: signInResult.payload.refresh_token,
      expires_in: signInResult.payload.expires_in,
      expires_at: signInResult.payload.expires_at,
      token_type: signInResult.payload.token_type,
      user: signInResult.payload.user,
    },
  });
}

async function handlePinLogin(payload: Record<string, unknown>) {
  const email = sanitizeText(payload.email).toLowerCase();
  const selectedPairs = normalizeSelectedPairs(payload.selected_pairs);

  if (!email) {
    return jsonResponse({ error: "Email obrigatorio." }, 400);
  }

  if (selectedPairs.length !== 6) {
    return jsonResponse({ error: "Selecione os 6 pares do PIN." }, 400);
  }

  let appUser = await loadAppUserByEmail(email);
  let invite: Record<string, any> | null = null;

  if (!appUser) {
    invite = await loadPendingInviteByEmail(email);
    if (invite) {
      return jsonResponse({
        error: "Este convite ainda precisa ser concluido pelo link recebido antes do primeiro acesso.",
      }, 409);
    }
  }

  if (!appUser) {
    return jsonResponse({ error: "Email nao localizado no cadastro." }, 404);
  }

  if (appUser?.active === false) {
    return jsonResponse({ error: "Este acesso foi bloqueado. Fale com a administracao." }, 403);
  }

  let authUser = await getAuthUserById(appUser.id);

  if (!authUser) {
    if (appUser?.onboarding_status === "pendente") {
      return jsonResponse({
        error: "Este convite ainda precisa ser concluido pelo link recebido antes do primeiro acesso.",
      }, 409);
    }

    return jsonResponse({
      error: "Este usuario ainda nao teve o PIN provisionado no acesso direto. Na Gestao de Usuarios, use 'Exigir PIN dos usuarios atuais' novamente.",
    }, 409);
  }

  const candidates = buildPinCandidates(selectedPairs);
  for (const candidate of candidates) {
    const result = await signInWithPassword(email, candidate);
    if (!result.ok || !result?.payload?.access_token || !result?.payload?.user?.id) {
      continue;
    }

    const updatedUser = await touchPinVerification(result.payload.user.id).catch(() => appUser);

    return jsonResponse({
      ok: true,
      session: {
        access_token: result.payload.access_token,
        refresh_token: result.payload.refresh_token,
        expires_in: result.payload.expires_in,
        expires_at: result.payload.expires_at,
        token_type: result.payload.token_type,
        user: result.payload.user,
      },
      user: updatedUser || appUser || null,
    });
  }

  return jsonResponse({ error: "PIN invalido para este email." }, 401);
}

async function handleVerifyPin(request: Request, payload: Record<string, unknown>) {
  const ctx = await getRequestContext(request);
  const selectedPairs = normalizeSelectedPairs(payload.selected_pairs);

  if (!ctx.authUser?.id || !ctx.authUser?.email) {
    return jsonResponse({ error: "Sessao invalida para verificar o PIN." }, 401);
  }

  if (ctx.profile?.active === false) {
    return jsonResponse({ error: "Este acesso foi bloqueado. Fale com a administracao." }, 403);
  }

  if (selectedPairs.length !== 6) {
    return jsonResponse({ error: "Selecione os 6 pares do PIN." }, 400);
  }

  const candidates = buildPinCandidates(selectedPairs);
  for (const candidate of candidates) {
    const result = await signInWithPassword(ctx.authUser.email, candidate);
    if (!result.ok || !result?.payload?.user?.id) {
      continue;
    }

    if (result.payload.user.id !== ctx.authUser.id) {
      continue;
    }

    const updatedUser = await touchPinVerification(ctx.authUser.id);
    return jsonResponse({
      ok: true,
      user: updatedUser,
    });
  }

  return jsonResponse({ error: "PIN invalido." }, 401);
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

    if (action === "save_user_access") {
      return await handleSaveUserAccess(request, payload || {});
    }

    if (action === "bootstrap_default_pins") {
      return await handleBootstrapDefaultPins(request, payload || {});
    }

    if (action === "set_pin") {
      return await handleSetPin(request, payload || {});
    }

    if (action === "get_invite_context") {
      return await handleGetInviteContext(payload || {});
    }

    if (action === "complete_invite_onboarding") {
      return await handleCompleteInviteOnboarding(payload || {});
    }

    if (action === "pin_login") {
      return await handlePinLogin(payload || {});
    }

    if (action === "verify_pin") {
      return await handleVerifyPin(request, payload || {});
    }

    return jsonResponse({ error: "Acao invalida." }, 400);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
