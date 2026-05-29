function roundCurrency(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function buildSeverity(metricKey, legacyValue, v2Value, differenceValue) {
  const legacy = roundCurrency(legacyValue);
  const next = roundCurrency(v2Value);
  const diff = Math.abs(roundCurrency(differenceValue));

  if (diff === 0) return "ok";
  if (metricKey === "comissoes" && legacy === 0 && next > 0) return "info";
  if (metricKey === "cancelamentos_estornos" && legacy === 0 && next > 0) return "info";
  if (diff <= 1) return "baixa";
  if (diff <= 100) return "media";
  return "alta";
}

function buildDifferenceOrigin(metricKey, legacyValue, v2Value) {
  const legacy = roundCurrency(legacyValue);
  const next = roundCurrency(v2Value);

  if (legacy === next) return "sem_diferenca";
  if (metricKey === "comissoes" && legacy === 0 && next > 0) return "legado_sem_modelagem_oficial";
  if (metricKey === "cancelamentos_estornos" && legacy === 0 && next > 0) return "nova_camada_financeira_mais_detalhada";
  if (metricKey === "cobrancas_abertas_vencidas") return "comparacao_cobranca_legado_vs_obrigacao";
  if (metricKey === "saldo_pendencias") return "conta_receber_vs_obrigacao_financeira";
  if (metricKey === "recebimentos") return "transaction_vs_carteira_movimento";
  if (metricKey === "faturamento_real") return "transaction_vs_relatorio_v2";
  if (metricKey === "geracao_recursos") return "serviceprovided_vs_competencia_v2";
  return "divergencia_financeira";
}

export function buildCockpitCompareRows({
  legacy = {},
  v2 = {},
} = {}) {
  const metrics = [
    {
      key: "recebimentos",
      label: "Recebimentos",
      legacyValue: legacy.recebimentos_total,
      v2Value: v2.recebimentos_total,
      unit: "currency",
    },
    {
      key: "saldo_pendencias",
      label: "Saldo / Pendências",
      legacyValue: legacy.pendencias_total,
      v2Value: v2.pendencias_total,
      unit: "currency",
    },
    {
      key: "faturamento_real",
      label: "Faturamento Real",
      legacyValue: legacy.faturamento_real_total,
      v2Value: v2.faturamento_real_total,
      unit: "currency",
    },
    {
      key: "geracao_recursos",
      label: "Geração de Recursos",
      legacyValue: legacy.geracao_recursos_total,
      v2Value: v2.geracao_recursos_total,
      unit: "currency",
    },
    {
      key: "cancelamentos_estornos",
      label: "Cancelamentos / Estornos",
      legacyValue: legacy.cancelamentos_estornos_total,
      v2Value: v2.cancelamentos_estornos_total,
      unit: "count",
    },
    {
      key: "comissoes",
      label: "Comissões",
      legacyValue: legacy.comissoes_total,
      v2Value: v2.comissoes_total,
      unit: "currency",
    },
    {
      key: "cobrancas_abertas_vencidas",
      label: "Cobranças Abertas / Vencidas",
      legacyValue: legacy.cobrancas_abertas_vencidas_total,
      v2Value: v2.cobrancas_abertas_vencidas_total,
      unit: "count",
    },
  ];

  return metrics.map((metric) => {
    const legacyValue = roundCurrency(metric.legacyValue || 0);
    const v2Value = roundCurrency(metric.v2Value || 0);
    const differenceValue = roundCurrency(v2Value - legacyValue);
    return {
      metric_key: metric.key,
      metric_label: metric.label,
      legacy_value: legacyValue,
      v2_value: v2Value,
      difference_value: differenceValue,
      severity: buildSeverity(metric.key, legacyValue, v2Value, differenceValue),
      difference_origin: buildDifferenceOrigin(metric.key, legacyValue, v2Value),
      unit: metric.unit,
    };
  });
}

export function buildFinancialAlertsSummary(alerts = []) {
  const rows = Array.isArray(alerts) ? alerts : [];
  return rows.reduce((summary, alert) => {
    const severity = String(alert?.severity || "info");
    summary.total += 1;
    summary.bySeverity[severity] = (summary.bySeverity[severity] || 0) + 1;
    return summary;
  }, {
    total: 0,
    bySeverity: {},
  });
}

export function sortFinancialAlerts(alerts = []) {
  const priority = { critica: 0, alta: 1, media: 2, baixa: 3, info: 4, ok: 5 };
  return [...(alerts || [])].sort((left, right) => {
    const severityDiff = (priority[left?.severity] ?? 99) - (priority[right?.severity] ?? 99);
    if (severityDiff !== 0) return severityDiff;
    const amountDiff = roundCurrency(right?.amount || 0) - roundCurrency(left?.amount || 0);
    if (amountDiff !== 0) return amountDiff;
    return String(left?.title || "").localeCompare(String(right?.title || ""));
  });
}
