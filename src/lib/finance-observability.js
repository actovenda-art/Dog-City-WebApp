function roundCurrency(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function toComparableDate(value) {
  if (!value) return null;
  const normalized = String(value).includes("T") ? String(value) : `${value}T12:00:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isInPeriod(value, periodStart = null, periodEnd = null) {
  if (!periodStart && !periodEnd) return true;
  const current = toComparableDate(value);
  if (!current) return false;
  if (periodStart) {
    const start = new Date(`${periodStart}T00:00:00`);
    if (current < start) return false;
  }
  if (periodEnd) {
    const end = new Date(`${periodEnd}T23:59:59`);
    if (current > end) return false;
  }
  return true;
}

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function safeIncludes(left, right) {
  const source = safeLower(left);
  const target = safeLower(right);
  return source && target ? source.includes(target) : false;
}

function buildFlagsPayload(flags = {}) {
  return {
    operational_observability_enabled: Boolean(flags.operational_observability_enabled),
    write_governance_enabled: Boolean(flags.write_governance_enabled),
    payment_v2_contract_enabled: Boolean(flags.payment_v2_contract_enabled),
    cockpit_v2_enabled: Boolean(flags.cockpit_v2_enabled),
    cockpit_v2_compare_enabled: Boolean(flags.cockpit_v2_compare_enabled),
    financial_alerts_v2_enabled: Boolean(flags.financial_alerts_v2_enabled),
    reports_v2_enabled: Boolean(flags.reports_v2_enabled),
  };
}

export function buildFinanceWriteFlowMap({ empresaId = null, flags = {} } = {}) {
  const normalizedFlags = buildFlagsPayload(flags);
  return [
    {
      flow_key: "pagamento_conta_receber",
      dominio: "pagamento",
      origem: "baixa manual de contas a receber",
      frontend_surface: "ContasReceber",
      backend_surface: "entidade direta ContaReceber.update",
      legacy_tables: ["conta_receber"],
      v2_tables: ["obrigacao_financeira", "cobranca_financeira", "carteira_movimento"],
      official_writer: "legado",
      compatibility_writer: "v2 leitura/comparativo",
      current_mode: "legado_principal",
      risk_level: "alto",
      flags: normalizedFlags,
      notes: {
        empresa_id: empresaId,
        source_of_truth: "conta_receber.status/data_recebimento",
        blocked_for_payment_v2: true,
      },
    },
    {
      flow_key: "geracao_cobranca_agendamento",
      dominio: "cobranca",
      origem: "geracao avulsa por agendamento",
      frontend_surface: "Agendamentos",
      backend_surface: "entidade direta ContaReceber.create",
      legacy_tables: ["conta_receber"],
      v2_tables: ["obrigacao_financeira", "cobranca_financeira"],
      official_writer: "legado",
      compatibility_writer: "shadow/cobertura V2",
      current_mode: "legado_principal",
      risk_level: "alto",
      flags: normalizedFlags,
      notes: {
        empresa_id: empresaId,
        source_of_truth: "conta_receber",
        blocked_for_payment_v2: true,
      },
    },
    {
      flow_key: "geracao_cobranca_registrador",
      dominio: "cobranca",
      origem: "registrador manual",
      frontend_surface: "Registrador",
      backend_surface: "ServiceProvided + ContaReceber.create",
      legacy_tables: ["serviceprovided", "conta_receber"],
      v2_tables: ["obrigacao_financeira", "cobranca_financeira"],
      official_writer: "legado",
      compatibility_writer: "relatorios e cobertura V2",
      current_mode: "legado_principal",
      risk_level: "alto",
      flags: normalizedFlags,
      notes: {
        empresa_id: empresaId,
        source_of_truth: "conta_receber",
        blocked_for_payment_v2: true,
      },
    },
    {
      flow_key: "planos_recorrencia_pacotes",
      dominio: "cobranca",
      origem: "planos, recorrencia e pacotes",
      frontend_surface: "PlanosConfig",
      backend_surface: "RecurringPackage/PackageBilling/ContaReceber",
      legacy_tables: ["recurring_packages", "package_billing", "conta_receber", "packagesession", "packagecredit"],
      v2_tables: ["obrigacao_financeira", "cobranca_financeira"],
      official_writer: "legado",
      compatibility_writer: "cobertura e comparativo V2",
      current_mode: "hibrido",
      risk_level: "alto",
      flags: normalizedFlags,
      notes: {
        empresa_id: empresaId,
        source_of_truth: "conta_receber/package_billing",
        blocked_for_payment_v2: true,
      },
    },
    {
      flow_key: "orcamento_shadow_autorizacao",
      dominio: "orcamento_autorizacao",
      origem: "orcamento aprovado + shadow",
      frontend_surface: "Orcamentos / OrcamentosHistoricoPanel",
      backend_surface: "RPC finance_shadow_sync_orcamento + finance_approve_budget_with_authorization",
      legacy_tables: ["orcamento"],
      v2_tables: ["obrigacao_financeira", "cobranca_financeira", "autorizacao_financeira"],
      official_writer: "v2_controlado",
      compatibility_writer: "legado operacional",
      current_mode: "hibrido",
      risk_level: "medio",
      flags: normalizedFlags,
      notes: {
        empresa_id: empresaId,
        source_of_truth: "obrigacao_financeira/cobranca_financeira para shadow",
        blocked_for_payment_v2: false,
      },
    },
    {
      flow_key: "carteira_admin_reconciliacao",
      dominio: "carteira",
      origem: "operacao administrativa controlada",
      frontend_surface: "Movimentacoes",
      backend_surface: "RPC finance_wallet_admin_apply_operation + finance_reconcile_wallet_account",
      legacy_tables: ["extratobancario"],
      v2_tables: ["carteira_conta", "carteira_movimento", "carteira_reconciliacao"],
      official_writer: "v2_oficial",
      compatibility_writer: "extratobancario como apoio",
      current_mode: "ja_substituido",
      risk_level: "baixo",
      flags: normalizedFlags,
      notes: {
        empresa_id: empresaId,
        source_of_truth: "carteira_movimento",
        blocked_for_payment_v2: false,
      },
    },
    {
      flow_key: "cancelamento_v2",
      dominio: "cancelamento",
      origem: "cancelamento financeiro controlado",
      frontend_surface: "orcamento/cancelamento controlado",
      backend_surface: "RPC finance_process_cancellation_v2 + finance_process_budget_cancellation_v2",
      legacy_tables: ["replacement"],
      v2_tables: ["cancelamento_financeiro", "carteira_movimento", "obrigacao_financeira"],
      official_writer: "v2_oficial",
      compatibility_writer: "replacement para historico/legado",
      current_mode: "ja_substituido",
      risk_level: "medio",
      flags: normalizedFlags,
      notes: {
        empresa_id: empresaId,
        source_of_truth: "cancelamento_financeiro",
        blocked_for_payment_v2: false,
      },
    },
    {
      flow_key: "comissao_quitacao",
      dominio: "comissao",
      origem: "gatilho em obrigacao quitada",
      frontend_surface: "ControleGerencial",
      backend_surface: "trigger trg_obrigacao_financeira_after_commission",
      legacy_tables: [],
      v2_tables: ["comissao_evento", "obrigacao_financeira"],
      official_writer: "v2_oficial",
      compatibility_writer: "sem_compatibilidade_legada_oficial",
      current_mode: "ja_substituido",
      risk_level: "medio",
      flags: normalizedFlags,
      notes: {
        empresa_id: empresaId,
        source_of_truth: "comissao_evento",
        blocked_for_payment_v2: false,
      },
    },
    {
      flow_key: "contas_pagar_manual",
      dominio: "pagamento_fornecedor",
      origem: "quitacao manual de lancamentos",
      frontend_surface: "ContasPagar / Despesas / Receitas",
      backend_surface: "entidades diretas Lancamento/Despesa/Receita/ExtratoBancario",
      legacy_tables: ["lancamento", "despesa", "receita", "extratobancario"],
      v2_tables: [],
      official_writer: "legado",
      compatibility_writer: "sem_equivalente_v2_ativo",
      current_mode: "fora_de_escopo_atual",
      risk_level: "alto",
      flags: normalizedFlags,
      notes: {
        empresa_id: empresaId,
        source_of_truth: "lancamento/despesa/receita",
        blocked_for_payment_v2: true,
      },
    },
  ];
}

export function buildFinanceWriteGovernanceMatrix({ empresaId = null, flags = {} } = {}) {
  const normalizedFlags = buildFlagsPayload(flags);
  return [
    {
      dominio: "pagamento",
      leitura_oficial: "cockpit_v2/relatorios_v2",
      escrita_oficial: "legado_conta_receber",
      compatibilidade: "obrigacao_financeira/cobranca_financeira/carteira_movimento",
      legado_coexistente: "conta_receber",
      status_dominio: "hibrido_critico",
      fonte_oficial_atual: "legado",
      risco_operacional: "alto",
      payment_v2_blocker: true,
      flags: normalizedFlags,
      notes: {
        empresa_id: empresaId,
        reason: "nao existe caminho oficial unico de quitacao V2",
      },
    },
    {
      dominio: "cobranca",
      leitura_oficial: "comparativo_v2 + cobertura legado_v2",
      escrita_oficial: "legado_conta_receber",
      compatibilidade: "cobranca_financeira/obrigacao_financeira",
      legado_coexistente: "conta_receber",
      status_dominio: "hibrido",
      fonte_oficial_atual: "legado",
      risco_operacional: "alto",
      payment_v2_blocker: true,
      flags: normalizedFlags,
      notes: {
        empresa_id: empresaId,
        reason: "geracao de cobranca ainda nasce majoritariamente no legado",
      },
    },
    {
      dominio: "obrigacao",
      leitura_oficial: "obrigacao_financeira",
      escrita_oficial: "shadow/autorizacao/cancelamento_v2",
      compatibilidade: "conta_receber",
      legado_coexistente: "conta_receber",
      status_dominio: "hibrido_controlado",
      fonte_oficial_atual: "v2_parcial",
      risco_operacional: "medio",
      payment_v2_blocker: false,
      flags: normalizedFlags,
      notes: {
        empresa_id: empresaId,
        reason: "dominio V2 ja existe, mas nao cobre toda a vida financeira operacional",
      },
    },
    {
      dominio: "carteira",
      leitura_oficial: "carteira_conta/carteira_movimento",
      escrita_oficial: "finance_apply_wallet_operation",
      compatibilidade: "extratobancario como apoio",
      legado_coexistente: "extratobancario",
      status_dominio: "ja_substituido",
      fonte_oficial_atual: "v2",
      risco_operacional: "baixo",
      payment_v2_blocker: false,
      flags: normalizedFlags,
      notes: {
        empresa_id: empresaId,
        reason: "razao imutavel e reconciliacao ja estabilizadas",
      },
    },
    {
      dominio: "comissao",
      leitura_oficial: "comissao_evento",
      escrita_oficial: "trigger em obrigacao quitada",
      compatibilidade: "nenhuma",
      legado_coexistente: "sem_modelagem_legada_oficial",
      status_dominio: "ja_substituido",
      fonte_oficial_atual: "v2",
      risco_operacional: "medio",
      payment_v2_blocker: false,
      flags: normalizedFlags,
      notes: {
        empresa_id: empresaId,
        reason: "gatilho ja depende de quitacao V2 ou hibrida",
      },
    },
    {
      dominio: "cancelamento",
      leitura_oficial: "cancelamento_financeiro",
      escrita_oficial: "finance_process_cancellation_v2",
      compatibilidade: "replacement para historico",
      legado_coexistente: "replacement",
      status_dominio: "ja_substituido",
      fonte_oficial_atual: "v2",
      risco_operacional: "medio",
      payment_v2_blocker: false,
      flags: normalizedFlags,
      notes: {
        empresa_id: empresaId,
        reason: "cancelamento V2 ja esta auditavel e idempotente",
      },
    },
    {
      dominio: "orcamento_autorizacao",
      leitura_oficial: "orcamento + obrigacao_financeira/cobranca_financeira",
      escrita_oficial: "shadow + autorizacao controlada",
      compatibilidade: "orcamento legado",
      legado_coexistente: "orcamento operacional",
      status_dominio: "hibrido_controlado",
      fonte_oficial_atual: "v2_parcial",
      risco_operacional: "medio",
      payment_v2_blocker: false,
      flags: normalizedFlags,
      notes: {
        empresa_id: empresaId,
        reason: "orcamento ja conversa com a camada financeira nova sem substituir todo o fluxo",
      },
    },
  ];
}

export function buildPaymentV2Contract({ empresaId = null, flags = {} } = {}) {
  const normalizedFlags = buildFlagsPayload(flags);
  return [
    {
      contract_stage: "precondicao",
      rule_key: "fonte_oficial_pagamento",
      status: "pendente_implementacao",
      severity: "alta",
      description: "Pagamento V2 precisa definir um unico caminho oficial de quitacao por obrigacao/cobranca.",
      blocked_by: "legado_conta_receber_ainda_e_escrita_oficial",
      payload: { empresa_id: empresaId, flags: normalizedFlags },
    },
    {
      contract_stage: "precondicao",
      rule_key: "idempotencia",
      status: "obrigatorio",
      severity: "alta",
      description: "Toda quitacao V2 deve usar chave de idempotencia unica por empresa e evento de pagamento.",
      blocked_by: "desenho_da_chave_ainda_nao_formalizado",
      payload: { empresa_id: empresaId, flags: normalizedFlags },
    },
    {
      contract_stage: "atomicidade",
      rule_key: "movimento_obrigacao_cobranca",
      status: "obrigatorio",
      severity: "alta",
      description: "Pagamento V2 precisa liquidar movimento, obrigacao e cobranca na mesma fronteira transacional.",
      blocked_by: "fluxo_real_de_pagamento_ainda_nao_existe",
      payload: { empresa_id: empresaId, flags: normalizedFlags },
    },
    {
      contract_stage: "concorrencia",
      rule_key: "locks",
      status: "obrigatorio",
      severity: "alta",
      description: "Pagamento V2 precisa travar carteira e entidade financeira alvo para evitar dupla quitacao.",
      blocked_by: "estrategia_de_lock_ainda_nao_materializada",
      payload: { empresa_id: empresaId, flags: normalizedFlags },
    },
    {
      contract_stage: "reversibilidade",
      rule_key: "sem_mutacao_do_razao",
      status: "preparado",
      severity: "media",
      description: "Reversoes devem usar movimentos compensatorios; carteira_movimento permanece imutavel.",
      blocked_by: null,
      payload: { empresa_id: empresaId, flags: normalizedFlags },
    },
    {
      contract_stage: "coexistencia",
      rule_key: "legado_preservado",
      status: "obrigatorio",
      severity: "media",
      description: "Durante o rollout, conta_receber continua preservado para compatibilidade e rollback.",
      blocked_by: null,
      payload: { empresa_id: empresaId, flags: normalizedFlags },
    },
    {
      contract_stage: "observabilidade",
      rule_key: "auditoria_operacional",
      status: "preparado_na_sprint_9a",
      severity: "media",
      description: "Pagamento V2 deve nascer usando a camada de observabilidade, governanca e reconciliacao operacional.",
      blocked_by: null,
      payload: { empresa_id: empresaId, flags: normalizedFlags },
    },
    {
      contract_stage: "rollout",
      rule_key: "flags_progressivas",
      status: "obrigatorio",
      severity: "media",
      description: "Pagamento V2 deve abrir com flags por empresa e reversao simples, sem migracao destrutiva.",
      blocked_by: null,
      payload: { empresa_id: empresaId, flags: normalizedFlags },
    },
  ];
}

export function buildLegacyReceivablesCoverage({
  empresaId,
  contasReceber = [],
  clients = [],
  walletAccounts = [],
  recurringPackages = [],
  obligations = [],
  charges = [],
  periodStart = null,
  periodEnd = null,
} = {}) {
  const clientsById = Object.fromEntries((clients || []).map((item) => [item?.id, item]));
  return (contasReceber || [])
    .filter((item) => isInPeriod(item?.vencimento || item?.created_date, periodStart, periodEnd))
    .map((item) => {
      const walletAccount = (walletAccounts || []).find((account) =>
        account?.empresa_id === empresaId && account?.carteira_id === item?.cliente_id,
      ) || null;
      const recurringPackage = (recurringPackages || []).find((pkg) =>
        pkg?.client_id === item?.cliente_id
        && (pkg?.pet_id ?? null) === (item?.dog_id ?? null)
        && (pkg?.service_id ?? null) === (item?.servico ?? null),
      ) || null;
      const obligation = (obligations || []).find((row) =>
        row?.empresa_id === empresaId
        && (
          row?.source_key === `legacy_conta_receber|${item?.id}`
          || (
            row?.due_date === item?.vencimento
            && roundCurrency(row?.valor_final || 0) === roundCurrency(item?.valor || 0)
            && safeIncludes(row?.descricao, item?.servico)
          )
        ),
      ) || null;
      const charge = (charges || []).find((row) =>
        row?.empresa_id === empresaId
        && (
          row?.source_key === `legacy_conta_receber|${item?.id}`
          || (
            row?.due_date === item?.vencimento
            && roundCurrency(row?.valor_total || 0) === roundCurrency(item?.valor || 0)
            && row?.carteira_conta_id === walletAccount?.id
          )
        ),
      ) || null;
      const financialBehavior = recurringPackage?.financial_behavior || null;
      const sameCompany = item?.empresa_id === empresaId;
      const paid = item?.status === "pago" || Boolean(item?.data_recebimento);

      let classificacao = "D";
      let motivoCobertura = "diferenca_esperada";
      if (item?.empresa_id && item?.empresa_id !== empresaId) {
        classificacao = "D";
        motivoCobertura = "fora_do_escopo_da_empresa_piloto";
      } else if (!item?.empresa_id) {
        classificacao = "C";
        motivoCobertura = "legado_orfao_sem_empresa";
      } else if (financialBehavior === "operational_only") {
        classificacao = "D";
        motivoCobertura = "pacote_operacional_sem_cobranca_detalhada_v2";
      } else if (obligation?.id && charge?.id) {
        classificacao = "A";
        motivoCobertura = "cobertura_v2_encontrada";
      } else if (obligation?.id || charge?.id) {
        classificacao = "B";
        motivoCobertura = obligation?.id ? "obrigacao_existe_sem_cobranca_v2" : "cobranca_existe_sem_obrigacao_v2";
      } else {
        classificacao = "B";
        motivoCobertura = "sem_obrigacao_e_sem_cobranca_v2";
      }

      return {
        conta_receber_id: item?.id || null,
        conta_receber_empresa_id: item?.empresa_id || null,
        cliente_id: item?.cliente_id || null,
        cliente_nome: clientsById[item?.cliente_id]?.nome_razao_social || clientsById[item?.cliente_id]?.nome_completo || null,
        dog_id: item?.dog_id || null,
        descricao: item?.descricao || null,
        servico: item?.servico || null,
        valor: roundCurrency(item?.valor || 0),
        vencimento: item?.vencimento || null,
        data_recebimento: item?.data_recebimento || null,
        status_legado: item?.status || null,
        transaction_id: null,
        transaction_status: null,
        scheduledtransaction_id: null,
        scheduledtransaction_status: null,
        carteira_conta_id: walletAccount?.id || null,
        recurring_package_id: recurringPackage?.id || null,
        financial_behavior: financialBehavior,
        obrigacao_id: obligation?.id || null,
        obrigacao_status: obligation?.status || null,
        cobranca_id: charge?.id || null,
        cobranca_status: charge?.status || null,
        classificacao,
        motivo_cobertura: motivoCobertura,
        considera_no_comparativo: !paid && sameCompany && financialBehavior !== "operational_only",
        precisa_virar_obrigacao_v2: !paid && sameCompany && financialBehavior !== "operational_only" && !obligation?.id,
        precisa_virar_cobranca_v2: !paid && sameCompany && financialBehavior !== "operational_only" && !charge?.id,
      };
    });
}

export function buildOperationalReconciliationRows({
  coverageRows = [],
  cockpitSummary = null,
  walletDivergentCount = 0,
} = {}) {
  const rows = Array.isArray(coverageRows) ? coverageRows : [];
  const summary = cockpitSummary || {};
  const legacyOpenValue = roundCurrency(rows
    .filter((item) => item?.considera_no_comparativo)
    .reduce((sum, item) => sum + Number(item?.valor || 0), 0));
  const v2OpenValue = roundCurrency(summary?.obrigacoes_abertas_total || 0);
  const legacyOverdueCount = rows
    .filter((item) => item?.considera_no_comparativo)
    .filter((item) => item?.vencimento && new Date(`${item.vencimento}T12:00:00`) < new Date())
    .length;
  const v2OverdueCount = Number(summary?.cobrancas_vencidas_count ?? summary?.cobrancas_vencidas_total ?? 0);
  const realDivergenceCount = rows.filter((item) => item?.classificacao === "B" && item?.considera_no_comparativo).length;
  const expectedDifferenceCount = rows.filter((item) => item?.classificacao === "D").length;

  const buildRow = (checkKey, label, legacyValue, v2Value, justification) => {
    const differenceValue = roundCurrency(Number(v2Value || 0) - Number(legacyValue || 0));
    let severity = "ok";
    let status = "ok";
    if (differenceValue !== 0) {
      severity = Math.abs(differenceValue) > 100 ? "alta" : "media";
      status = "divergente";
    }
    return {
      check_key: checkKey,
      check_label: label,
      status,
      severity,
      legacy_value: roundCurrency(legacyValue || 0),
      v2_value: roundCurrency(v2Value || 0),
      difference_value: differenceValue,
      justification,
    };
  };

  return [
    buildRow(
      "receivables_open_value",
      "Saldo legado em aberto vs obrigacoes V2",
      legacyOpenValue,
      v2OpenValue,
      realDivergenceCount > 0 ? "divergencia_real_na_cobertura" : expectedDifferenceCount > 0 ? "residuos_formalmente_justificados" : "sem_diferenca",
    ),
    buildRow(
      "charges_overdue_count",
      "Cobrancas vencidas legado vs V2",
      legacyOverdueCount,
      v2OverdueCount,
      realDivergenceCount > 0 ? "divergencia_real_na_cobertura" : expectedDifferenceCount > 0 ? "residuos_formalmente_justificados" : "sem_diferenca",
    ),
    {
      check_key: "wallet_reconciliation_divergences",
      check_label: "Carteiras com reconciliacao divergente",
      status: walletDivergentCount > 0 ? "divergente" : "ok",
      severity: walletDivergentCount > 0 ? "alta" : "ok",
      legacy_value: 0,
      v2_value: Number(walletDivergentCount || 0),
      difference_value: Number(walletDivergentCount || 0),
      justification: walletDivergentCount > 0 ? "carteiras_divergentes_detectadas" : "sem_diferenca",
    },
    {
      check_key: "coverage_missing_rows",
      check_label: "Linhas com cobertura faltando",
      status: realDivergenceCount > 0 ? "divergente" : "ok",
      severity: realDivergenceCount > 0 ? "alta" : "ok",
      legacy_value: realDivergenceCount,
      v2_value: 0,
      difference_value: -realDivergenceCount,
      justification: realDivergenceCount > 0 ? "cobertura_v2_faltando" : "sem_diferenca",
    },
  ];
}

export function buildOperationalObservabilityContext({
  empresaId,
  flags = {},
  coverageRows = [],
  compareRows = [],
  alertRows = [],
  cockpitSummary = null,
  walletAccounts = [],
  obligations = [],
  charges = [],
  movements = [],
  reconciliations = [],
  commissions = [],
  cancellations = [],
} = {}) {
  const summary = cockpitSummary || {};
  const rows = Array.isArray(coverageRows) ? coverageRows : [];
  const alerts = Array.isArray(alertRows) ? alertRows : [];
  const compare = Array.isArray(compareRows) ? compareRows : [];
  const divergentReconciliations = (reconciliations || []).filter((item) => item?.status === "divergente").length;

  return {
    empresa_id: empresaId,
    operational_observability_enabled: Boolean(flags.operational_observability_enabled),
    write_governance_enabled: Boolean(flags.write_governance_enabled),
    payment_v2_contract_enabled: Boolean(flags.payment_v2_contract_enabled),
    hybrid_write_events_count: rows.filter((item) => item?.classificacao === "B").length,
    legacy_only_events_count: rows.filter((item) => ["B", "C"].includes(item?.classificacao)).length,
    v2_only_events_count: (obligations || []).length + (charges || []).length + (movements || []).length + (commissions || []).length + (cancellations || []).length,
    legacy_receivables_total: rows.length,
    legacy_receivables_open_count: rows.filter((item) => item?.status_legado !== "pago" && !item?.data_recebimento).length,
    legacy_receivables_paid_count: rows.filter((item) => item?.status_legado === "pago" || item?.data_recebimento).length,
    v2_obligations_total: (obligations || []).length,
    v2_obligations_open_count: (obligations || []).filter((item) => ["aberta", "parcial", "vencida"].includes(item?.status)).length,
    v2_charges_total: (charges || []).length,
    v2_charges_open_count: (charges || []).filter((item) => ["aberta", "parcial", "vencida"].includes(item?.status)).length,
    wallet_movements_total: (movements || []).length,
    wallet_accounts_total: (walletAccounts || []).length,
    wallet_reconciliation_divergent_count: divergentReconciliations,
    commissions_total: (commissions || []).length,
    cancellations_total: (cancellations || []).length,
    real_divergence_count: compare.filter((item) => item?.severity && item?.severity !== "ok" && item?.difference_origin && !safeIncludes(item?.difference_origin, "esperada") && !safeIncludes(item?.difference_origin, "justificada")).length,
    expected_difference_count: rows.filter((item) => item?.classificacao === "D").length,
    orphan_legacy_count: rows.filter((item) => item?.classificacao === "C").length,
    non_comparable_count: rows.filter((item) => !item?.considera_no_comparativo).length,
    active_alerts_count: alerts.length,
    payment_write_official: "legado",
    payment_v2_ready_gate: rows.filter((item) => item?.classificacao === "B" && item?.considera_no_comparativo).length === 0 && divergentReconciliations === 0,
    obligations_open_amount: roundCurrency(summary?.obrigacoes_abertas_total || 0),
    charges_open_amount: roundCurrency(summary?.cobrancas_abertas_total || 0),
  };
}
