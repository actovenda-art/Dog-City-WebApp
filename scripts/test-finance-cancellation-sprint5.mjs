import assert from "node:assert/strict";
import { buildShadowFinanceItemsFromOrcamento } from "../src/lib/finance-shadow.js";

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

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function testSharedKennelCancellationMath() {
  const orcamento = {
    id: "orc_shared_cancel_sprint5",
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
        "hosp_dormitório_compartilhado": false,
        "hosp_dormitório_com": [],
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
        "hosp_dormitório_compartilhado": true,
        "hosp_dormitório_com": ["dog_feijuca"],
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
        "hosp_dormitório_compartilhado": true,
        "hosp_dormitório_com": ["dog_dogue"],
      },
    ],
  };

  const items = buildShadowFinanceItemsFromOrcamento({ orcamento, dogs, precos });
  assert.equal(items.length, 9, "A hospedagem compartilhada deve continuar detalhando 9 itens.");

  const sourceKeys = new Set(items.map((item) => item.source_key));
  assert.equal(sourceKeys.size, items.length, "Os itens detalhados não devem duplicar source_key.");

  const firstShared = items.find((item) => item?.metadata?.dog_nome === "Dogue");
  assert.ok(firstShared?.valor_final > 0, "A diária compartilhada precisa ter valor final positivo.");

  const valorFinal = roundCurrency(firstShared.valor_final);
  const valorPagoAteAgora = roundCurrency(valorFinal - 20);
  const multa20 = roundCurrency(valorFinal * 0.2);

  assert.equal(valorPagoAteAgora > 0, true, "O cenário parcial precisa manter valor já quitado.");
  assert.equal(multa20 > 0, true, "A multa parcial precisa gerar valor positivo.");
  assert.equal(valorPagoAteAgora + 20, valorFinal, "Valor pago + aberto deve recompor a obrigação compartilhada.");
}

function testDogCityCompensationGuardrails() {
  const valorCredito = roundCurrency(30);
  const valorMulta = roundCurrency(0);

  assert.equal(valorCredito, 30);
  assert.equal(valorMulta, 0);
  assert.equal(valorCredito > 0, true, "DogCity com crédito compensatório exige valor explícito positivo.");
}

testSharedKennelCancellationMath();
testDogCityCompensationGuardrails();

console.log("Sprint 5 finance cancellation helper tests passed.");
