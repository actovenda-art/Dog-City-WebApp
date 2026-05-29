function roundCurrency(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function safeDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const next = new Date(String(value).includes("T") ? value : `${value}T12:00:00`);
  return Number.isNaN(next.getTime()) ? null : next;
}

function toDateKey(value) {
  const date = safeDate(value);
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function isWithinPeriod(value, startDate, endDate) {
  const dateKey = toDateKey(value);
  if (!dateKey) return false;
  if (startDate && dateKey < startDate) return false;
  if (endDate && dateKey > endDate) return false;
  return true;
}

function normalizeServiceValue(item) {
  const quantity = Math.max(Number(item?.quantidade || 1) || 1, 1);
  return roundCurrency((Number(item?.valor_cobrado ?? item?.preco ?? 0) || 0) * quantity);
}

export function buildReportSummary(items = [], valueField = "valor") {
  const rows = Array.isArray(items) ? items : [];
  return {
    count: rows.length,
    total_valor: roundCurrency(
      rows.reduce((sum, item) => sum + Number(item?.[valueField] || 0), 0),
    ),
  };
}

export function buildFinanceV2Summary({
  walletRows = [],
  generationRows = [],
  billingRows = [],
  servicesRows = [],
} = {}) {
  const walletSummary = buildReportSummary(walletRows, "saldo_atual");
  const generationSummary = buildReportSummary(generationRows, "valor");
  const billingSummary = buildReportSummary(billingRows, "valor");
  const servicesSummary = buildReportSummary(servicesRows, "valor");

  return {
    wallet_count: walletSummary.count,
    wallet_total: walletSummary.total_valor,
    generation_count: generationSummary.count,
    generation_total: generationSummary.total_valor,
    billing_count: billingSummary.count,
    billing_total: billingSummary.total_valor,
    services_count: servicesSummary.count,
    services_total: servicesSummary.total_valor,
  };
}

export function buildGenerationResourcesReport(serviceProvided = [], { startDate = null, endDate = null } = {}) {
  return (serviceProvided || [])
    .filter((item) => isWithinPeriod(item?.data_utilizacao || item?.created_date, startDate, endDate))
    .map((item) => ({
      entity_key: `serviceprovided|${item.id}`,
      entity_label: item?.service_type || item?.id || "servico",
      competencia_date: toDateKey(item?.data_utilizacao || item?.created_date),
      cliente_id: item?.cliente_id || null,
      dog_id: item?.dog_id || null,
      service_type: item?.service_type || null,
      quantidade: Math.max(Number(item?.quantidade || 1) || 1, 1),
      valor: normalizeServiceValue(item),
      referencia: item?.source_key || item?.appointment_id || item?.id,
      origem: item?.source_type || "serviceprovided",
      payload: {
        appointment_id: item?.appointment_id || null,
        checkin_id: item?.checkin_id || null,
        metadata: item?.metadata || {},
      },
    }))
    .sort((a, b) => {
      if (a.competencia_date !== b.competencia_date) return a.competencia_date.localeCompare(b.competencia_date);
      return String(a.entity_key).localeCompare(String(b.entity_key));
    });
}

export function buildServicesProvidedReport(serviceProvided = [], { startDate = null, endDate = null } = {}) {
  return (serviceProvided || [])
    .filter((item) => isWithinPeriod(item?.data_utilizacao || item?.created_date, startDate, endDate))
    .map((item) => ({
      entity_key: `serviceprovided|${item.id}`,
      entity_label: item?.service_type || item?.id || "servico",
      competencia_date: toDateKey(item?.data_utilizacao || item?.created_date),
      cliente_id: item?.cliente_id || null,
      dog_id: item?.dog_id || null,
      service_type: item?.service_type || null,
      valor: normalizeServiceValue(item),
      referencia: item?.source_key || item?.appointment_id || item?.id,
      origem: item?.source_type || "serviceprovided",
      payload: {
        appointment_id: item?.appointment_id || null,
        checkin_id: item?.checkin_id || null,
        metadata: item?.metadata || {},
      },
    }))
    .sort((a, b) => {
      if (a.competencia_date !== b.competencia_date) return a.competencia_date.localeCompare(b.competencia_date);
      return String(a.entity_key).localeCompare(String(b.entity_key));
    });
}

export function buildRealBillingReport(walletMovements = [], { startDate = null, endDate = null } = {}) {
  return (walletMovements || [])
    .filter((item) => item?.natureza === "entrada")
    .filter((item) => ["credito", "entrada_direcionada"].includes(item?.tipo))
    .filter((item) => isWithinPeriod(item?.created_date, startDate, endDate))
    .map((item) => ({
      entity_key: `carteira_movimento|${item.id}`,
      entity_label: item?.referencia_amigavel || item?.id || "recebimento",
      competencia_date: toDateKey(item?.created_date),
      carteira_conta_id: item?.carteira_conta_id || null,
      movimento_id: item?.id || null,
      tipo: item?.tipo || null,
      origem: item?.origem || null,
      valor: roundCurrency(item?.valor || 0),
      referencia: item?.operacao_idempotencia || item?.referencia_amigavel || item?.id,
      payload: {
        orcamento_id: item?.orcamento_id || null,
        obrigacao_id: item?.obrigacao_id || null,
        transacao_id: item?.transacao_id || null,
        metadata: item?.metadata || {},
      },
    }))
    .sort((a, b) => {
      if (a.competencia_date !== b.competencia_date) return a.competencia_date.localeCompare(b.competencia_date);
      return String(a.entity_key).localeCompare(String(b.entity_key));
    });
}

export function buildWalletReport(walletAccounts = [], walletReconciliations = [], walletMovements = []) {
  return (walletAccounts || [])
    .map((account) => {
      const movementRows = (walletMovements || []).filter((item) => item?.carteira_conta_id === account?.id);
      const latestReconciliation = (walletReconciliations || [])
        .filter((item) => item?.carteira_conta_id === account?.id)
        .sort((a, b) => {
          const dateA = String(a?.created_date || "");
          const dateB = String(b?.created_date || "");
          if (dateA !== dateB) return dateB.localeCompare(dateA);
          return String(b?.id || "").localeCompare(String(a?.id || ""));
        })[0];

      return {
        entity_key: `carteira_conta|${account.id}`,
        entity_label: account?.carteira_id || account?.id || "carteira",
        competencia_date: toDateKey(latestReconciliation?.created_date || account?.updated_date || account?.created_date),
        carteira_conta_id: account?.id || null,
        carteira_id: account?.carteira_id || null,
        saldo_atual: roundCurrency(account?.saldo_atual || 0),
        movement_count: movementRows.length,
        last_movement_at: movementRows
          .map((item) => item?.created_date)
          .filter(Boolean)
          .sort()
          .slice(-1)[0] || null,
        latest_reconciliation_status: latestReconciliation?.status || null,
        latest_reconciliation_diff: roundCurrency(latestReconciliation?.diferenca || 0),
        payload: {
          ultimo_movimento_em: account?.ultimo_movimento_em || null,
          ultima_reconciliacao_em: account?.ultima_reconciliacao_em || null,
          ativo: account?.ativo !== false,
        },
      };
    })
    .sort((a, b) => String(a.entity_key).localeCompare(String(b.entity_key)));
}

export function buildSnapshotPayload(type, items = [], metadata = {}) {
  const normalizedItems = (items || []).map((item) => ({
    ...item,
    valor: roundCurrency(item?.valor ?? item?.saldo_atual ?? 0),
  }));
  const summary = buildReportSummary(normalizedItems, "valor");

  return {
    tipo: type,
    summary: {
      count: summary.count,
      total_valor: summary.total_valor,
    },
    items: normalizedItems,
    metadata: metadata || {},
  };
}

export function compareSnapshotPayloads(previousPayload = {}, currentPayload = {}) {
  const previousItems = Array.isArray(previousPayload?.items) ? previousPayload.items : [];
  const currentItems = Array.isArray(currentPayload?.items) ? currentPayload.items : [];

  const previousMap = new Map(previousItems.map((item) => [item.entity_key, item]));
  const currentMap = new Map(currentItems.map((item) => [item.entity_key, item]));
  const keys = Array.from(new Set([...previousMap.keys(), ...currentMap.keys()])).sort();

  return keys.reduce((accumulator, key) => {
    const before = previousMap.get(key) || null;
    const after = currentMap.get(key) || null;

    if (!before && after) {
      accumulator.push({
        delta_kind: "incluido",
        entity_key: key,
        entity_label: after?.entity_label || key,
        valor_anterior: 0,
        valor_atual: roundCurrency(after?.valor ?? after?.saldo_atual ?? 0),
        impacto_financeiro: roundCurrency(after?.valor ?? after?.saldo_atual ?? 0),
        payload_before: null,
        payload_after: after,
      });
      return accumulator;
    }

    if (before && !after) {
      const beforeValue = roundCurrency(before?.valor ?? before?.saldo_atual ?? 0);
      accumulator.push({
        delta_kind: "removido",
        entity_key: key,
        entity_label: before?.entity_label || key,
        valor_anterior: beforeValue,
        valor_atual: 0,
        impacto_financeiro: roundCurrency(-beforeValue),
        payload_before: before,
        payload_after: null,
      });
      return accumulator;
    }

    const beforeValue = roundCurrency(before?.valor ?? before?.saldo_atual ?? 0);
    const afterValue = roundCurrency(after?.valor ?? after?.saldo_atual ?? 0);
    const samePayload = JSON.stringify(before) === JSON.stringify(after);

    if (!samePayload || beforeValue !== afterValue) {
      accumulator.push({
        delta_kind: "alterado",
        entity_key: key,
        entity_label: after?.entity_label || before?.entity_label || key,
        valor_anterior: beforeValue,
        valor_atual: afterValue,
        impacto_financeiro: roundCurrency(afterValue - beforeValue),
        payload_before: before,
        payload_after: after,
      });
    }

    return accumulator;
  }, []);
}

export function createMockChecksum(payload) {
  const source = JSON.stringify(payload || {});
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(index);
    hash |= 0;
  }
  return `mock_${Math.abs(hash)}`;
}
