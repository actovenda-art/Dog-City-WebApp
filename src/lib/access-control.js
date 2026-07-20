import { normalizePermission, normalizePermissions, permissionMatches } from "./access-permissions.js";

const readAccess = (resource) => [`${resource}:read`, `${resource}:update`, `${resource}:*`];
const updateAccess = (resource) => [`${resource}:update`, `${resource}:*`];

const PAGE_ACCESS_REQUIREMENTS = {
  Login: [],
  AuthCallback: [],
  CompletarCadastro: [],
  CadastroClientePublico: [],
  VisualizadorImagem: [],

  Dev_Dashboard: ["platform:*", ...readAccess("usuarios")],
  AdministracaoSistema: [
    "platform:*",
    ...readAccess("usuarios"),
    ...readAccess("empresa"),
    "branding:*",
  ],
  Backup: ["platform:*", "storage:*", ...updateAccess("empresa")],

  Registrador: ["platform:*", "checkin:*", ...updateAccess("agenda")],
  Agendamentos: ["platform:*", ...readAccess("agenda")],
  Agenda_Comercial: ["platform:*", ...readAccess("agenda"), ...readAccess("orcamentos")],
  Cadastro: ["platform:*", ...readAccess("dogs")],
  Perfis: ["platform:*", ...readAccess("dogs")],
  PerfilCao: ["platform:*", ...readAccess("dogs")],
  Planos: ["platform:*", ...readAccess("agenda"), ...readAccess("dogs")],
  PlanosConfig: ["platform:*", ...readAccess("agenda"), ...readAccess("dogs")],
  PedidosInternos: ["platform:*", ...readAccess("tarefas")],

  Movimentacoes: ["platform:*", ...readAccess("financeiro")],
  CarteirasFinanceiras: ["platform:*", ...readAccess("financeiro")],
  Receitas: ["platform:*", ...readAccess("financeiro")],
  Despesas: ["platform:*", ...readAccess("financeiro")],
  ContasPagar: ["platform:*", ...readAccess("financeiro")],
  ContasReceber: ["platform:*", ...readAccess("financeiro")],
  Cockpit: ["platform:*", ...readAccess("financeiro")],
  Escalacao: ["platform:*", ...readAccess("empresa")],

  Orcamentos: ["platform:*", ...readAccess("orcamentos")],
  HistoricoOrcamentos: ["platform:*", ...readAccess("orcamentos")],
  ConfiguracoesPrecos: ["platform:*", "precos:*"],
  ConfigurarIntegracoes: ["platform:*", ...updateAccess("financeiro"), "branding:*"],
  RelatoriosCaes: ["platform:*", ...readAccess("dogs")],
};

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

const COMMERCIAL_PERMISSION_REQUIREMENTS = [
  "orcamentos:*",
  "orcamentos:read",
  "orcamentos:update",
];

const MANAGERIAL_PERMISSION_REQUIREMENTS = [
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

export function isCommercialProfile(user) {
  if (!user) return false;
  if (user.is_platform_admin || user.company_role === "platform_admin") {
    return false;
  }

  const grantedPermissions = normalizePermissions(
    user.access_profile_permissions || user.accessProfilePermissions || []
  );
  const haystack = buildAccessHaystack(user);

  const hasCommercialPermission = grantedPermissions.some((permission) =>
    COMMERCIAL_PERMISSION_REQUIREMENTS.some((required) => permissionMatches(permission, required))
  );

  if (hasCommercialPermission) {
    return true;
  }

  return [
    "comercial",
    "venda",
    "vendas",
    "orcamento",
    "orcamentos",
    "cadastro",
  ].some((token) => haystack.includes(token));
}

export function isManagerialProfile(user) {
  if (!user) return false;
  if (user.is_platform_admin || user.company_role === "platform_admin") {
    return true;
  }

  const grantedPermissions = normalizePermissions(
    user.access_profile_permissions || user.accessProfilePermissions || []
  );
  const haystack = buildAccessHaystack(user);

  const hasManagerialPermission = grantedPermissions.some((permission) =>
    MANAGERIAL_PERMISSION_REQUIREMENTS.some((required) => permissionMatches(permission, required))
  );

  if (hasManagerialPermission) {
    return true;
  }

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

export function getNotificationDepartment(user) {
  if (!user) return "gerencial";
  if (isManagerialProfile(user)) return "gerencial";
  if (isCommercialProfile(user)) return "comercial";
  if (isOperationalProfile(user)) return "operacional";
  return "gerencial";
}

export function getDefaultHomePage(user) {
  if (!user) return "Perfis";
  if (user.is_platform_admin || user.company_role === "platform_admin") return "Cockpit";
  if (isManagerialProfile(user)) return "Cockpit";
  if (isCommercialProfile(user)) return "Orcamentos";
  if (isOperationalProfile(user)) return "Registrador";
  return "Perfis";
}

export function canViewSensitivePersonalData(user) {
  if (!user) return false;
  if (user.is_platform_admin || user.company_role === "platform_admin") return true;
  return isManagerialProfile(user);
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

  if (grantedPermissions.length === 0) return false;

  return requirements.some((required) => grantedPermissions.some((granted) => permissionMatches(granted, required)));
}
