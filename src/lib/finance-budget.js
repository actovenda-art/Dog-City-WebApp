import { buildShadowFinanceItemsFromOrcamento } from "./finance-shadow.js";

function normalizeDateKey(value) {
  const normalized = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""));
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function normalizePackageFinancialBehavior(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "billable_detailed") return "billable_detailed";
  if (normalized === "operational_only") return "operational_only";
  return null;
}

export function getPackageBehaviorCandidateServiceIds(serviceType) {
  switch (serviceType) {
    case "banho":
    case "tosa":
      return [serviceType, "banho_tosa"];
    default:
      return [serviceType];
  }
}

function getCreatedTimestamp(record) {
  const candidates = [record?.created_date, record?.created_at, record?.data_criacao];
  for (const value of candidates) {
    if (!value) continue;
    const timestamp = new Date(value).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

export function resolveRecurringPackageFinancialBehavior(recurringPackages = [], cao, serviceType) {
  const dogId = cao?.dog_id;
  if (!dogId) return null;

  const candidateServiceIds = getPackageBehaviorCandidateServiceIds(serviceType);
  const matches = (recurringPackages || [])
    .filter((item) => item?.status === "ativo")
    .filter((item) => item?.pet_id === dogId)
    .filter((item) => candidateServiceIds.includes(item?.service_id))
    .sort((left, right) => getCreatedTimestamp(right) - getCreatedTimestamp(left));

  return normalizePackageFinancialBehavior(matches[0]?.financial_behavior);
}

export function buildBudgetPreviewItems({
  orcamento,
  dogs = [],
  precos = {},
  recurringPackages = [],
} = {}) {
  return buildShadowFinanceItemsFromOrcamento({
    orcamento,
    dogs,
    precos,
    packageBehaviorResolver: ({ cao, serviceType }) =>
      resolveRecurringPackageFinancialBehavior(recurringPackages, cao, serviceType),
  });
}

export function rankChronologicalItem(item, today = new Date().toISOString().slice(0, 10)) {
  const dueDate = normalizeDateKey(item?.due_date || item?.service_date);
  if (!dueDate) return 99;
  if (dueDate < today) return 1;
  if (dueDate === today) return 2;
  return 3;
}

export function sortChronologicalBudgetItems(items = [], today = new Date().toISOString().slice(0, 10)) {
  return [...items].sort((left, right) => {
    const byRank = rankChronologicalItem(left, today) - rankChronologicalItem(right, today);
    if (byRank !== 0) return byRank;

    const byDueDate = compareText(normalizeDateKey(left?.due_date || left?.service_date), normalizeDateKey(right?.due_date || right?.service_date));
    if (byDueDate !== 0) return byDueDate;

    const byServiceDate = compareText(normalizeDateKey(left?.service_date), normalizeDateKey(right?.service_date));
    if (byServiceDate !== 0) return byServiceDate;

    const byCreatedDate = compareText(left?.created_date || left?.created_at || "", right?.created_date || right?.created_at || "");
    if (byCreatedDate !== 0) return byCreatedDate;

    return compareText(left?.source_key || left?.id || "", right?.source_key || right?.id || "");
  });
}

function normalizeOpenObligation(item = {}) {
  return {
    kind: "existing",
    id: item?.id || null,
    source_key: item?.source_key || item?.id || "",
    descricao: item?.descricao || "",
    due_date: normalizeDateKey(item?.due_date),
    service_date: normalizeDateKey(item?.service_date),
    created_date: item?.created_date || item?.created_at || null,
    valor_aberto: roundCurrency(item?.valor_em_aberto ?? item?.valor_final ?? item?.valor_original ?? 0),
    metadata: item?.metadata || {},
  };
}

function normalizePreviewItem(item = {}) {
  return {
    kind: "preview",
    id: null,
    source_key: item?.source_key || "",
    descricao: item?.descricao || "",
    due_date: normalizeDateKey(item?.due_date || item?.service_date),
    service_date: normalizeDateKey(item?.service_date || item?.due_date),
    created_date: item?.created_date || item?.created_at || null,
    valor_aberto: roundCurrency(item?.valor_final ?? item?.valor_original ?? 0),
    metadata: item?.metadata || {},
  };
}

export function simulateBudgetConsumptionPreview({
  saldoAtual = 0,
  valorOrcamentoTotal = 0,
  valorSaldoSolicitado = null,
  openObligations = [],
  previewItems = [],
  today = new Date().toISOString().slice(0, 10),
} = {}) {
  const normalizedBudgetTotal = roundCurrency(valorOrcamentoTotal);
  const normalizedBalance = roundCurrency(saldoAtual);
  const positiveBalance = Math.max(normalizedBalance, 0);
  const requestedUsage = valorSaldoSolicitado === null || valorSaldoSolicitado === undefined || valorSaldoSolicitado === ""
    ? Math.min(positiveBalance, normalizedBudgetTotal)
    : roundCurrency(Math.max(0, Number(valorSaldoSolicitado) || 0));
  const applicableUsage = roundCurrency(Math.min(requestedUsage, positiveBalance, normalizedBudgetTotal));

  const candidates = sortChronologicalBudgetItems([
    ...(openObligations || []).map(normalizeOpenObligation).filter((item) => item.valor_aberto > 0),
    ...(previewItems || []).map(normalizePreviewItem).filter((item) => item.valor_aberto > 0),
  ], today);

  let remainingUsage = applicableUsage;
  let budgetCovered = 0;
  const allocations = candidates.map((item) => {
    const valueAllocated = roundCurrency(Math.min(item.valor_aberto, remainingUsage));
    remainingUsage = roundCurrency(remainingUsage - valueAllocated);
    if (item.kind === "preview") {
      budgetCovered = roundCurrency(budgetCovered + valueAllocated);
    }

    return {
      ...item,
      priority_rank: rankChronologicalItem(item, today),
      valor_alocado: valueAllocated,
      valor_restante_item: roundCurrency(item.valor_aberto - valueAllocated),
    };
  });

  return {
    saldo_atual: normalizedBalance,
    saldo_positivo_disponivel: roundCurrency(positiveBalance),
    valor_orcamento_total: normalizedBudgetTotal,
    valor_saldo_solicitado: requestedUsage,
    valor_saldo_aplicado: applicableUsage,
    valor_orcamento_coberto: roundCurrency(Math.min(budgetCovered, normalizedBudgetTotal)),
    valor_orcamento_em_aberto: roundCurrency(Math.max(normalizedBudgetTotal - budgetCovered, 0)),
    obrigacoes_abertas_count: (openObligations || []).length,
    preview_items_count: (previewItems || []).length,
    allocation_count: allocations.filter((item) => item.valor_alocado > 0).length,
    projected_balance_after_wallet_usage: roundCurrency(normalizedBalance - applicableUsage),
    requires_authorization: roundCurrency(Math.max(normalizedBudgetTotal - budgetCovered, 0)) > 0,
    allocations,
  };
}
