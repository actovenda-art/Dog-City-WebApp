import assert from "node:assert/strict";
import { buildShadowFinanceItemsFromOrcamento } from "../src/lib/finance-shadow.js";

function sumValues(items = []) {
  return items.reduce((total, item) => total + Number(item?.valor_final || 0), 0);
}

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
  tosa_higienica: {
    pequeno_baixa: 45,
  },
  tosa_geral: {
    SRD: 110,
    Labrador: 120,
    Poodle: 100,
    Outro: 90,
  },
  tosa_detalhada: {
    SRD: 150,
    Labrador: 160,
    Poodle: 140,
    Outro: 130,
  },
};

function testHospedagemMultiItem() {
  const orcamento = {
    id: "orc_multi_item",
    status: "aprovado",
    caes: [
      {
        dog_id: "dog_duque",
        servicos: { hospedagem: true },
        hosp_data_entrada: "2026-05-20",
        hosp_horario_entrada: "09:00",
        hosp_data_saida: "2026-05-22",
        hosp_horario_saida: "11:00",
        hosp_is_mensalista: false,
        hosp_datas_daycare: [],
        "hosp_dormitÃ³rio_compartilhado": false,
        "hosp_dormitÃ³rio_com": [],
      },
    ],
  };

  const items = buildShadowFinanceItemsFromOrcamento({ orcamento, dogs, precos });
  assert.equal(items.length, 2, "Hospedagem de 20/05 a 22/05 com saÃ­da antes de 12h deve gerar 2 diÃ¡rias");
  assert.equal(sumValues(items), 100, "As 2 diÃ¡rias devem totalizar R$ 100,00");
  assert.ok(items.every((item) => item.tipo_item === "hospedagem_diaria"));
}

function testHospedagemMultiCaoComDescontoCompartilhado() {
  const orcamento = {
    id: "orc_shared_kennel",
    status: "aprovado",
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

  const items = buildShadowFinanceItemsFromOrcamento({ orcamento, dogs, precos });
  const duqueItems = items.filter((item) => item.metadata?.dog_id === "dog_duque");
  const sharedItems = items.filter((item) => ["dog_dogue", "dog_feijuca"].includes(item.metadata?.dog_id));

  assert.equal(duqueItems.length, 3, "Duque sozinho deve gerar 3 diÃ¡rias");
  assert.equal(sharedItems.length, 6, "Dogue + Feijuca compartilhando canil devem gerar 6 diÃ¡rias ao todo");
  assert.equal(sumValues(duqueItems), 150, "Duque sozinho deve manter valor cheio");
}

function testPacoteDescontoContinuaFinanceiro() {
  const orcamento = {
    id: "orc_package_discount",
    status: "aprovado",
    caes: [
      {
        dog_id: "dog_duque",
        servicos: { banho: true },
        banho_do_pacote: true,
        banho_data: "2026-05-22",
      },
    ],
  };

  const items = buildShadowFinanceItemsFromOrcamento({
    orcamento,
    dogs,
    precos,
    packageBehaviorResolver: ({ serviceType }) => (
      serviceType === "banho" ? "billable_detailed" : null
    ),
  });

  assert.equal(items.length, 1, "Banho com pacote/desconto continua gerando obrigaÃ§Ã£o shadow");
  assert.equal(items[0].tipo_item, "banho");
  assert.equal(items[0].valor_final, 80);
  assert.equal(items[0].metadata?.financial_behavior, "billable_detailed");
}

function testPacoteReposicaoFicaSoOperacional() {
  const orcamento = {
    id: "orc_package_reposicao",
    status: "aprovado",
    caes: [
      {
        dog_id: "dog_duque",
        servicos: { banho: true },
        banho_do_pacote: true,
        banho_data: "2026-05-22",
      },
    ],
  };

  const items = buildShadowFinanceItemsFromOrcamento({
    orcamento,
    dogs,
    precos,
    packageBehaviorResolver: ({ serviceType }) => (
      serviceType === "banho" ? "operational_only" : null
    ),
  });

  assert.equal(items.length, 0, "Banho tratado como reposiÃ§Ã£o deve ficar fora do shadow financeiro");
}

function testPacoteSemComportamentoExplicitoNaoGeraShadow() {
  const orcamento = {
    id: "orc_package_ambiguous",
    status: "aprovado",
    caes: [
      {
        dog_id: "dog_duque",
        servicos: { banho: true },
        banho_do_pacote: true,
        banho_data: "2026-05-22",
      },
    ],
  };

  const items = buildShadowFinanceItemsFromOrcamento({ orcamento, dogs, precos });
  assert.equal(items.length, 0, "Pacote sem comportamento financeiro explÃ­cito nÃ£o deve gerar shadow.");
}

testHospedagemMultiItem();
testHospedagemMultiCaoComDescontoCompartilhado();
testPacoteDescontoContinuaFinanceiro();
testPacoteReposicaoFicaSoOperacional();
testPacoteSemComportamentoExplicitoNaoGeraShadow();

console.log("Sprint 2 shadow finance helper tests passed.");
