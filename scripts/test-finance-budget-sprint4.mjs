import assert from "node:assert/strict";
import { buildBudgetPreviewItems, simulateBudgetConsumptionPreview } from "../src/lib/finance-budget.js";

const dogs = [
  { id: "dog_duque", nome: "Duque", raca: "SRD" },
  { id: "dog_dogue", nome: "Dogue", raca: "Labrador" },
  { id: "dog_feijuca", nome: "Feijuca", raca: "Poodle" },
];

const precos = {
  diaria_normal: 50,
  diaria_mensalista: 40,
  day_care_avulso_com_pacote: 110,
  day_care_avulso_sem_pacote: 125,
  day_care_avulso: 125,
  adaptacao: 0,
  pernoite: 30,
  transporte_km: 6,
  desconto_canil: 0.3,
  desconto_longa_estadia: 0.03,
  banho: {
    SRD: 80,
    Labrador: 95,
    Poodle: 60,
    Outro: 70,
  },
};

function testChronologicalConsumption() {
  const preview = simulateBudgetConsumptionPreview({
    saldoAtual: 200,
    valorOrcamentoTotal: 125,
    valorSaldoSolicitado: 125,
    openObligations: [
      {
        id: "ob_vencida",
        source_key: "shadow|vencida",
        descricao: "Obrigação vencida",
        due_date: "2026-05-20",
        service_date: "2026-05-19",
        created_date: "2026-05-18T10:00:00Z",
        valor_em_aberto: 50,
      },
      {
        id: "ob_hoje",
        source_key: "shadow|hoje",
        descricao: "Obrigação de hoje",
        due_date: "2026-05-27",
        service_date: "2026-05-27",
        created_date: "2026-05-19T10:00:00Z",
        valor_em_aberto: 30,
      },
      {
        id: "ob_futura",
        source_key: "shadow|futura",
        descricao: "Obrigação futura",
        due_date: "2026-05-29",
        service_date: "2026-05-29",
        created_date: "2026-05-20T10:00:00Z",
        valor_em_aberto: 20,
      },
    ],
    previewItems: [
      {
        source_key: "preview|orcamento|1",
        descricao: "Banho Duke",
        due_date: "2026-06-01",
        service_date: "2026-06-01",
        valor_final: 125,
      },
    ],
    today: "2026-05-27",
  });

  assert.equal(preview.valor_saldo_aplicado, 125);
  assert.equal(preview.valor_orcamento_coberto, 25);
  assert.equal(preview.valor_orcamento_em_aberto, 100);
  assert.equal(preview.requires_authorization, true);
  assert.deepEqual(
    preview.allocations.map((item) => item.source_key),
    ["shadow|vencida", "shadow|hoje", "shadow|futura", "preview|orcamento|1"],
  );
}

function testSharedKennelConsumptionPreview() {
  const orcamento = {
    id: "orc_shared_kennel",
    caes: [
      {
        dog_id: "dog_duque",
        servicos: { hospedagem: true },
        hosp_data_entrada: "2026-05-20",
        hosp_horario_entrada: "09:00",
        hosp_data_saida: "2026-05-22",
        hosp_horario_saida: "12:00",
        hosp_is_mensalista: false,
        hosp_datas_daycare: [],
        "hosp_dormitÃ³rio_compartilhado": false,
        "hosp_dormitÃ³rio_com": [],
      },
      {
        dog_id: "dog_dogue",
        servicos: { hospedagem: true },
        hosp_data_entrada: "2026-05-20",
        hosp_horario_entrada: "09:00",
        hosp_data_saida: "2026-05-22",
        hosp_horario_saida: "12:00",
        hosp_is_mensalista: false,
        hosp_datas_daycare: [],
        "hosp_dormitÃ³rio_compartilhado": true,
        "hosp_dormitÃ³rio_com": ["dog_feijuca"],
      },
      {
        dog_id: "dog_feijuca",
        servicos: { hospedagem: true },
        hosp_data_entrada: "2026-05-20",
        hosp_horario_entrada: "09:00",
        hosp_data_saida: "2026-05-22",
        hosp_horario_saida: "12:00",
        hosp_is_mensalista: false,
        hosp_datas_daycare: [],
        "hosp_dormitÃ³rio_compartilhado": true,
        "hosp_dormitÃ³rio_com": ["dog_dogue"],
      },
    ],
  };

  const previewItems = buildBudgetPreviewItems({ orcamento, dogs, precos });
  const totalPreview = previewItems.reduce((sum, item) => sum + Number(item.valor_final || 0), 0);
  const preview = simulateBudgetConsumptionPreview({
    saldoAtual: 255,
    valorOrcamentoTotal: totalPreview,
    valorSaldoSolicitado: 255,
    openObligations: [],
    previewItems,
    today: "2026-05-19",
  });

  assert.equal(previewItems.length, 9, "A hospedagem compartilhada deve detalhar as diárias esperadas.");
  assert.equal(totalPreview, previewItems.reduce((sum, item) => sum + Number(item.valor_final || 0), 0), "O total do cenário compartilhado deve permanecer consistente com o detalhamento gerado.");
  assert.equal(preview.valor_saldo_aplicado, 255);
  assert.equal(preview.valor_orcamento_coberto, 255);
  assert.equal(preview.valor_orcamento_em_aberto, totalPreview - 255);
  assert.equal(preview.requires_authorization, true);
  assert.equal(preview.allocations.filter((item) => item.valor_alocado > 0).length >= 5, true);
}

testChronologicalConsumption();
testSharedKennelConsumptionPreview();

console.log("Sprint 4 finance budget helper tests passed.");
