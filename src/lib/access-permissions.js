export const ACCESS_LEVELS = [
  { id: "read", label: "Visualizar", shortLabel: "Leitura" },
  { id: "update", label: "Editar e operar", shortLabel: "Edição" },
  { id: "all", label: "Controle total", shortLabel: "Total" },
];

export const PERMISSION_GROUPS = [
  {
    id: "usuarios",
    label: "Usuários e acessos",
    description: "Convites, perfis e manutenção de acessos por unidade.",
    resources: [
      {
        id: "usuarios",
        label: "Usuários e perfis de acesso",
        description: "Consulta usuários, atribui perfis e administra convites.",
        levels: ["read", "update", "all"],
      },
    ],
  },
  {
    id: "unidade",
    label: "Unidade e identidade visual",
    description: "Dados institucionais da unidade e identidade visual do sistema.",
    resources: [
      {
        id: "empresa",
        label: "Dados da unidade",
        description: "Ficha da empresa, unidades disponíveis e dados institucionais.",
        levels: ["read", "update", "all"],
      },
      {
        id: "branding",
        label: "Identidade visual",
        description: "Logos, nome da marca e link público de avaliação.",
        levels: ["all"],
        allLabel: "Gerenciar",
      },
    ],
  },
  {
    id: "agenda",
    label: "Agenda e operação",
    description: "Agendamentos, registrador, check-in e fluxo operacional.",
    resources: [
      {
        id: "agenda",
        label: "Agendamentos",
        description: "Agenda diária, planos e alterações nos agendamentos.",
        levels: ["read", "update", "all"],
      },
      {
        id: "checkin",
        label: "Check-in e check-out",
        description: "Registra a entrada, a saída e os estados operacionais.",
        levels: ["all"],
        allLabel: "Operar",
      },
    ],
  },
  {
    id: "cadastros",
    label: "Comercial e cadastros",
    description: "Perfis de cães, responsáveis, planos e orçamentos.",
    resources: [
      {
        id: "dogs",
        label: "Cadastros e perfis",
        description: "Cães, responsáveis e responsáveis financeiros.",
        levels: ["read", "update", "all"],
      },
      {
        id: "orcamentos",
        label: "Orçamentos",
        description: "Consulta, criação, aprovação e manutenção de orçamentos.",
        levels: ["read", "update", "all"],
      },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro e preços",
    description: "Carteiras, transações, contas, relatórios e tabela de preços.",
    resources: [
      {
        id: "financeiro",
        label: "Financeiro",
        description: "Carteiras, transações, contas, cockpit e relatórios financeiros.",
        levels: ["read", "update", "all"],
      },
      {
        id: "precos",
        label: "Preços e descontos",
        description: "Mantém tabelas de preço, pacotes e regras de desconto.",
        levels: ["all"],
        allLabel: "Gerenciar",
      },
    ],
  },
  {
    id: "tarefas",
    label: "Tarefas internas",
    description: "Pedidos internos e fluxos operacionais da equipe.",
    resources: [
      {
        id: "tarefas",
        label: "Tarefas e pedidos internos",
        description: "Consulta e atualiza solicitações internas.",
        levels: ["read", "update", "all"],
      },
    ],
  },
  {
    id: "plataforma",
    label: "Administração central",
    description: "Controles globais, multiunidade, armazenamento e backup.",
    scopes: ["plataforma"],
    resources: [
      {
        id: "platform",
        label: "Plataforma",
        description: "Concede acesso transversal a toda a administração central.",
        levels: ["all"],
        allLabel: "Controle total",
      },
      {
        id: "storage",
        label: "Armazenamento e backup",
        description: "Permite administrar arquivos, cópias e restaurações.",
        levels: ["all"],
        allLabel: "Gerenciar",
      },
    ],
  },
];

export const PERMISSION_RESOURCES = PERMISSION_GROUPS.flatMap((group) => group.resources);

export const KNOWN_PERMISSION_IDS = PERMISSION_RESOURCES.flatMap((resource) =>
  resource.levels.map((level) => `${resource.id}:${level === "all" ? "*" : level}`)
);

export function normalizePermission(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizePermissions(values) {
  return Array.isArray(values)
    ? [...new Set(values.map(normalizePermission).filter(Boolean))]
    : [];
}

export function permissionIdForLevel(resourceId, level) {
  if (!resourceId || !level || level === "none") return "";
  return `${resourceId}:${level === "all" ? "*" : level}`;
}

export function getResourcePermissionLevel(values, resourceId) {
  const permissions = new Set(normalizePermissions(values));
  if (permissions.has(`${resourceId}:*`)) return "all";
  if (permissions.has(`${resourceId}:update`)) return "update";
  if (permissions.has(`${resourceId}:read`)) return "read";
  return "none";
}

export function setResourcePermissionLevel(values, resourceId, level) {
  const permissions = normalizePermissions(values).filter((permission) => !permission.startsWith(`${resourceId}:`));
  const nextPermission = permissionIdForLevel(resourceId, level);
  if (nextPermission) permissions.push(nextPermission);
  return permissions.sort();
}

export function setGroupPermissionState(values, group, enabled) {
  let nextPermissions = normalizePermissions(values);
  for (const resource of group.resources) {
    const highestLevel = enabled ? resource.levels[resource.levels.length - 1] : "none";
    nextPermissions = setResourcePermissionLevel(nextPermissions, resource.id, highestLevel);
  }
  return nextPermissions;
}

export function normalizeKnownPermissions(values) {
  const known = new Set(KNOWN_PERMISSION_IDS);
  let normalized = normalizePermissions(values).filter((permission) => known.has(permission));

  for (const resource of PERMISSION_RESOURCES) {
    const level = getResourcePermissionLevel(normalized, resource.id);
    normalized = setResourcePermissionLevel(normalized, resource.id, level);
  }

  return normalized;
}

export function permissionMatches(granted, required) {
  const normalizedGranted = normalizePermission(granted);
  const normalizedRequired = normalizePermission(required);

  if (!normalizedGranted || !normalizedRequired) return false;
  if (normalizedGranted === "*" || normalizedGranted === "platform:*") return true;
  if (normalizedGranted === normalizedRequired) return true;

  const [grantedResource, grantedAction] = normalizedGranted.split(":");
  const [requiredResource, requiredAction] = normalizedRequired.split(":");
  if (!grantedResource || grantedResource !== requiredResource) return false;
  if (grantedAction === "*") return true;

  // Edição inclui a leitura da mesma área, mas nunca equivale a controle total.
  return grantedAction === "update" && requiredAction === "read";
}

export function hasPermission(userOrPermissions, requiredPermission) {
  if (userOrPermissions?.is_platform_admin || userOrPermissions?.company_role === "platform_admin") {
    return true;
  }

  const permissions = Array.isArray(userOrPermissions)
    ? userOrPermissions
    : userOrPermissions?.access_profile_permissions || userOrPermissions?.accessProfilePermissions || [];

  return normalizePermissions(permissions).some((granted) => permissionMatches(granted, requiredPermission));
}

export function hasAnyPermission(userOrPermissions, requiredPermissions) {
  return requiredPermissions.some((required) => hasPermission(userOrPermissions, required));
}

export function getPermissionLabel(permissionId) {
  const normalized = normalizePermission(permissionId);
  const [resourceId, action] = normalized.split(":");
  const resource = PERMISSION_RESOURCES.find((item) => item.id === resourceId);
  if (!resource) return normalized;

  if (action === "*") return `${resource.label}: ${resource.allLabel || "Controle total"}`;
  const level = ACCESS_LEVELS.find((item) => item.id === action);
  return `${resource.label}: ${level?.label || action}`;
}

export function isGroupAvailableForScope(group, scope) {
  return !Array.isArray(group.scopes) || group.scopes.includes(scope);
}
