const PAGE_ACCESS_REQUIREMENTS = {
  Login: [],
  AuthCallback: [],
  CompletarCadastro: [],
  CadastroClientePublico: [],
  VisualizadorImagem: [],

  Dev_Dashboard: ["platform:*", "usuarios:*", "usuarios:read", "usuarios:update"],
  AdministracaoSistema: ["platform:*", "empresa:*", "empresa:read", "empresa:update", "branding:*", "precos:*"],
  Backup: ["platform:*", "storage:*", "empresa:*", "empresa:update"],

  Registrador: ["platform:*", "empresa:*", "empresa:update", "checkin:*", "agenda:*"],
  Agendamentos: ["platform:*", "empresa:*", "empresa:update", "agenda:*"],
  Agenda_Comercial: ["platform:*", "empresa:*", "empresa:update", "agenda:*", "orcamentos:*"],
  Cadastro: ["platform:*", "empresa:*", "empresa:update", "dogs:*"],
  Perfis: ["platform:*", "empresa:*", "empresa:update", "dogs:*"],
  PerfilCao: ["platform:*", "empresa:*", "empresa:update", "dogs:*"],
  Planos: ["platform:*", "empresa:*", "empresa:update", "agenda:*", "dogs:*"],
  PlanosConfig: ["platform:*", "empresa:*", "empresa:update", "agenda:*", "dogs:*"],
  PedidosInternos: ["platform:*", "empresa:*", "empresa:update", "tarefas:*", "tarefas:read", "tarefas:update"],

  Movimentacoes: ["platform:*", "empresa:*", "empresa:read", "empresa:update", "financeiro:*", "financeiro:read"],
  Receitas: ["platform:*", "empresa:*", "empresa:read", "empresa:update", "financeiro:*", "financeiro:read"],
  Despesas: ["platform:*", "empresa:*", "empresa:read", "empresa:update", "financeiro:*", "financeiro:read"],
  ContasPagar: ["platform:*", "empresa:*", "empresa:read", "empresa:update", "financeiro:*", "financeiro:read"],
  ContasReceber: ["platform:*", "empresa:*", "empresa:read", "empresa:update", "financeiro:*", "financeiro:read"],
  Cockpit: ["platform:*", "empresa:*", "empresa:read", "empresa:update", "financeiro:*", "financeiro:read"],
  ControleGerencial: ["platform:*", "empresa:*", "empresa:read", "empresa:update", "financeiro:*", "financeiro:read"],
  Escalacao: ["platform:*", "empresa:*", "empresa:read", "empresa:update"],

  Orcamentos: ["platform:*", "empresa:*", "empresa:update", "orcamentos:*"],
  HistoricoOrcamentos: ["platform:*", "empresa:*", "empresa:update", "orcamentos:*", "orcamentos:read"],
  ConfiguracoesPrecos: ["platform:*", "empresa:*", "empresa:update", "precos:*"],
  ConfigurarIntegracoes: ["platform:*", "empresa:*", "empresa:update", "financeiro:*", "branding:*"],
  RelatoriosCaes: ["platform:*", "empresa:*", "empresa:read", "empresa:update", "dogs:*"],
};

function normalizePermission(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePermissions(values) {
  return Array.isArray(values)
    ? [...new Set(values.map(normalizePermission).filter(Boolean))]
    : [];
}

function buildAccessHaystack(user) {
  return [
    user?.profile,
    user?.company_role,
    user?.access_profile_code,
    user?.access_profile_name,
  ]
    .map(normalizePermission)
    .filter(Boolean)
    .join(" ");
}

export function isOperationalProfile(user) {
  if (!user || user.is_platform_admin || user.company_role === "platform_admin") {
    return false;
  }

  const grantedPermissions = normalizePermissions(
    user.access_profile_permissions || user.accessProfilePermissions || []
  );
  const haystack = buildAccessHaystack(user);

  const hasCommercialOrAdminPermission = grantedPermissions.some((permission) =>
    [
      "orcamentos:*",
      "orcamentos:read",
      "orcamentos:update",
      "financeiro:*",
      "financeiro:read",
      "financeiro:update",
      "usuarios:*",
      "usuarios:read",
      "usuarios:update",
      "platform:*",
    ].some((required) => permissionMatches(permission, required))
  );

  if (hasCommercialOrAdminPermission) {
    return false;
  }

  return [
    "operacao",
    "operacional",
    "monitor",
    "banho",
    "tosa",
    "hospedagem",
    "day care",
    "daycare",
    "adestramento",
  ].some((token) => haystack.includes(token));
}

function permissionMatches(granted, required) {
  const normalizedGranted = normalizePermission(granted);
  const normalizedRequired = normalizePermission(required);

  if (!normalizedGranted || !normalizedRequired) return false;
  if (normalizedGranted === "*" || normalizedGranted === normalizedRequired) return true;

  if (normalizedGranted.endsWith("*")) {
    return normalizedRequired.startsWith(normalizedGranted.slice(0, -1));
  }

  if (normalizedRequired.endsWith("*")) {
    return normalizedGranted.startsWith(normalizedRequired.slice(0, -1));
  }

  return false;
}

export function getPageAccessRequirements(pageName) {
  return PAGE_ACCESS_REQUIREMENTS[pageName] || [];
}

export function hasPageAccess(user, pageName) {
  if (!user) return true;
  if (user.is_platform_admin || user.company_role === "platform_admin") return true;

  const requirements = getPageAccessRequirements(pageName);
  if (requirements.length === 0) return true;

  const grantedPermissions = normalizePermissions(
    user.access_profile_permissions || user.accessProfilePermissions || []
  );

  if (grantedPermissions.length === 0) {
    return true;
  }

  return requirements.some((required) => grantedPermissions.some((granted) => permissionMatches(granted, required)));
}
