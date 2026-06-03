import assert from "node:assert/strict";
import {
  buildFinanceWriteFlowMap,
  buildFinanceWriteGovernanceMatrix,
  buildLegacyReceivablesCoverage,
  buildOperationalObservabilityContext,
  buildOperationalReconciliationRows,
  buildPaymentV2Contract,
} from "../src/lib/finance-observability.js";

const flags = {
  operational_observability_enabled: true,
  write_governance_enabled: true,
  payment_v2_contract_enabled: true,
  cockpit_v2_enabled: true,
  cockpit_v2_compare_enabled: true,
  financial_alerts_v2_enabled: true,
  reports_v2_enabled: true,
};

const flowMap = buildFinanceWriteFlowMap({ empresaId: "empresa_demo", flags });
assert.ok(flowMap.length >= 8, "Mapa de fluxos precisa cobrir os fluxos principais remanescentes.");
assert.equal(flowMap.find((item) => item.flow_key === "pagamento_conta_receber")?.official_writer, "legado");
assert.equal(flowMap.find((item) => item.flow_key === "carteira_admin_reconciliacao")?.official_writer, "v2_oficial");

const governance = buildFinanceWriteGovernanceMatrix({ empresaId: "empresa_demo", flags });
assert.equal(governance.find((item) => item.dominio === "pagamento")?.status_dominio, "hibrido_critico");
assert.equal(governance.find((item) => item.dominio === "carteira")?.status_dominio, "ja_substituido");

const coverageRows = buildLegacyReceivablesCoverage({
  empresaId: "empresa_demo",
  contasReceber: [
    {
      id: "cr_1",
      empresa_id: "empresa_demo",
      cliente_id: "cart_1",
      dog_id: "dog_1",
      descricao: "Day care",
      servico: "day_care",
      valor: 120,
      vencimento: "2026-05-20",
      status: "pendente",
      created_date: "2026-05-10T10:00:00Z",
      source_key: "legacy_conta_receber|cr_1",
    },
    {
      id: "cr_2",
      empresa_id: "empresa_demo",
      cliente_id: "cart_2",
      dog_id: "dog_2",
      descricao: "Pacote operacional",
      servico: "day_care",
      valor: 425,
      vencimento: "2026-05-21",
      status: "pendente",
      created_date: "2026-05-11T10:00:00Z",
      source_key: "legacy_conta_receber|cr_2",
    },
  ],
  clients: [
    { id: "cart_1", nome_razao_social: "Cliente 1" },
    { id: "cart_2", nome_razao_social: "Cliente 2" },
  ],
  walletAccounts: [
    { id: "cc_1", empresa_id: "empresa_demo", carteira_id: "cart_1" },
    { id: "cc_2", empresa_id: "empresa_demo", carteira_id: "cart_2" },
  ],
  transactions: [],
  scheduledTransactions: [],
  recurringPackages: [
    { id: "pkg_2", client_id: "cart_2", pet_id: "dog_2", service_id: "day_care", financial_behavior: "operational_only" },
  ],
  obligations: [
    {
      id: "obg_1",
      empresa_id: "empresa_demo",
      carteira_id: "cart_1",
      carteira_conta_id: "cc_1",
      source_key: "legacy_conta_receber|cr_1",
      due_date: "2026-05-20",
      descricao: "Day care",
      status: "aberta",
      valor_final: 120,
      valor_em_aberto: 120,
    },
  ],
  charges: [
    {
      id: "ch_1",
      empresa_id: "empresa_demo",
      carteira_conta_id: "cc_1",
      source_key: "legacy_conta_receber|cr_1",
      due_date: "2026-05-20",
      status: "aberta",
      valor_total: 120,
      valor_em_aberto: 120,
    },
  ],
  periodStart: "2026-05-01",
  periodEnd: "2026-05-31",
});

assert.equal(coverageRows.length, 2);
assert.equal(coverageRows.find((item) => item.conta_receber_id === "cr_1")?.classificacao, "A");
assert.equal(coverageRows.find((item) => item.conta_receber_id === "cr_2")?.motivo_cobertura, "pacote_operacional_sem_cobranca_detalhada_v2");

const reconciliationRows = buildOperationalReconciliationRows({
  coverageRows,
  cockpitSummary: {
    obrigacoes_abertas_total: 120,
    cobrancas_vencidas_total: 1,
  },
  walletDivergentCount: 0,
});

assert.equal(reconciliationRows.length, 4);
assert.equal(reconciliationRows.find((item) => item.check_key === "wallet_reconciliation_divergences")?.status, "ok");

const context = buildOperationalObservabilityContext({
  empresaId: "empresa_demo",
  flags,
  coverageRows,
  compareRows: [
    { metric_key: "saldo_pendencias", severity: "ok", difference_origin: "diferenca_esperada_operational_only" },
  ],
  alertRows: [],
  cockpitSummary: {
    obrigacoes_abertas_total: 120,
    cobrancas_abertas_total: 120,
  },
  walletAccounts: [{ id: "cc_1" }, { id: "cc_2" }],
  obligations: [{ id: "obg_1", empresa_id: "empresa_demo" }],
  charges: [{ id: "ch_1", empresa_id: "empresa_demo" }],
  movements: [{ id: "mov_1", empresa_id: "empresa_demo" }],
  reconciliations: [],
  commissions: [],
  cancellations: [],
  transactions: [],
  scheduledTransactions: [],
});

assert.equal(context.payment_write_official, "legado");
assert.equal(context.real_divergence_count, 0);
assert.equal(context.expected_difference_count, 1);

const contractRows = buildPaymentV2Contract({ empresaId: "empresa_demo", flags });
assert.ok(contractRows.length >= 6, "Contrato do Pagamento V2 precisa cobrir os principais blocos.");
assert.equal(contractRows.find((item) => item.rule_key === "sem_mutacao_do_razao")?.status, "preparado");

console.log("Sprint 9A finance observability helper tests passed.");
