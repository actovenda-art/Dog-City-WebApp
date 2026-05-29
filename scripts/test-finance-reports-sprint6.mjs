import {
  buildFinanceV2Summary,
  buildGenerationResourcesReport,
  buildRealBillingReport,
  buildServicesProvidedReport,
  buildSnapshotPayload,
  buildWalletReport,
  compareSnapshotPayloads,
} from "../src/lib/finance-reports.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const today = new Date().toISOString().slice(0, 10);

const serviceProvided = [
  {
    id: "sp_annual",
    empresa_id: "empresa_demo",
    cliente_id: "client_demo",
    dog_id: "dog_duque",
    service_type: "day_care",
    quantidade: 1,
    valor_cobrado: 1000,
    data_utilizacao: today,
    source_key: "serviceprovided|annual",
    source_type: "pacote_anual",
  },
  {
    id: "sp_daycare",
    empresa_id: "empresa_demo",
    cliente_id: "client_demo",
    dog_id: "dog_duque",
    service_type: "day_care",
    quantidade: 1,
    valor_cobrado: 120,
    data_utilizacao: today,
    source_key: "serviceprovided|daycare",
    source_type: "daycare",
  },
  {
    id: "sp_shared",
    empresa_id: "empresa_demo",
    cliente_id: "client_demo",
    dog_id: "dog_dogue",
    service_type: "hospedagem_diaria",
    quantidade: 1,
    valor_cobrado: 250,
    data_utilizacao: today,
    source_key: "serviceprovided|shared",
    source_type: "hospedagem",
    metadata: {
      shared_group_dog_ids: ["dog_dogue", "dog_feijuca"],
      shared_discount: 25,
    },
  },
];

const walletMovements = [
  {
    id: "mov_recebimento",
    empresa_id: "empresa_demo",
    carteira_conta_id: "conta_demo",
    tipo: "entrada_direcionada",
    natureza: "entrada",
    origem: "manual",
    valor: 40000,
    referencia_amigavel: "Recebimento acumulado",
    operacao_idempotencia: "recebimento_40000",
    created_date: new Date().toISOString(),
  },
  {
    id: "mov_credito_comp",
    empresa_id: "empresa_demo",
    carteira_conta_id: "conta_demo",
    tipo: "credito_compensatorio",
    natureza: "entrada",
    origem: "cancelamento",
    valor: 25,
    referencia_amigavel: "Crédito compensatório",
    operacao_idempotencia: "credito_comp",
    created_date: new Date().toISOString(),
  },
];

const walletAccounts = [
  {
    id: "conta_demo",
    empresa_id: "empresa_demo",
    carteira_id: "client_demo",
    saldo_atual: 40000,
    created_date: new Date().toISOString(),
    updated_date: new Date().toISOString(),
  },
];

const reconciliations = [
  {
    id: "recon_demo",
    empresa_id: "empresa_demo",
    carteira_conta_id: "conta_demo",
    status: "ok",
    diferenca: 0,
    created_date: new Date().toISOString(),
  },
];

const generation = buildGenerationResourcesReport(serviceProvided, { startDate: today, endDate: today });
assert(generation.length === 3, "Geração de recursos deveria ter 3 itens.");
assert(generation.reduce((sum, item) => sum + item.valor, 0) === 1370, "Geração de recursos deveria somar 1370.");

const services = buildServicesProvidedReport(serviceProvided, { startDate: today, endDate: today });
assert(services.length === 3, "Serviços prestados deveria ter 3 itens.");

const billing = buildRealBillingReport(walletMovements, { startDate: today, endDate: today });
assert(billing.length === 1, "Faturamento real deveria ignorar crédito compensatório.");
assert(billing[0].valor === 40000, "Faturamento real deveria manter o recebimento acumulado.");

const wallet = buildWalletReport(walletAccounts, reconciliations, walletMovements);
assert(wallet.length === 1, "Relatório de carteira deveria retornar 1 conta.");
assert(wallet[0].saldo_atual === 40000, "Relatório de carteira deveria refletir saldo atual.");

const summary = buildFinanceV2Summary({
  walletRows: wallet,
  generationRows: generation,
  billingRows: billing,
  servicesRows: services,
});
assert(summary.wallet_count === 1 && summary.wallet_total === 40000, "Resumo V2 deveria refletir a carteira oficial.");
assert(summary.generation_count === 3 && summary.generation_total === 1370, "Resumo V2 deveria refletir geraÃ§Ã£o de recursos.");
assert(summary.billing_count === 1 && summary.billing_total === 40000, "Resumo V2 deveria refletir faturamento real.");
assert(summary.services_count === 3 && summary.services_total === 1370, "Resumo V2 deveria refletir serviÃ§os prestados.");

const snapshotPayload = buildSnapshotPayload("geracao_recursos", generation, { competencia: "2026-05" });
assert(snapshotPayload.summary.count === 3, "Snapshot deveria preservar 3 itens.");
assert(snapshotPayload.summary.total_valor === 1370, "Snapshot deveria preservar total 1370.");

const changedPayload = buildSnapshotPayload("geracao_recursos", [
  ...generation,
  {
    entity_key: "serviceprovided|retroativo",
    entity_label: "day_care",
    competencia_date: today,
    valor: 300,
  },
], { competencia: "2026-05" });

const deltas = compareSnapshotPayloads(snapshotPayload, changedPayload);
assert(deltas.some((item) => item.delta_kind === "incluido" && item.impacto_financeiro === 300), "Comparação deveria apontar inclusão de 300.");

console.log("Sprint 6 finance reports helper tests passed.");
