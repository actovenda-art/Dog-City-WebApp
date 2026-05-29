import assert from "node:assert/strict";
import {
  buildCommissionSourceKey,
  calculateCommissionValue,
  isCommissionEligible,
  normalizeCommissionPercent,
} from "../src/lib/finance-commission.js";

assert.equal(normalizeCommissionPercent("2,5"), 2.5);
assert.equal(normalizeCommissionPercent(120), 100);
assert.equal(normalizeCommissionPercent(-1), 0);

assert.equal(
  calculateCommissionValue({ valorBase: 100, percentual: 2 }),
  2,
  "Comissão deveria respeitar base * percentual.",
);

assert.equal(
  calculateCommissionValue({ valorBase: 95, percentual: 2 }),
  1.9,
  "Comissão deveria arredondar corretamente para pagamento parcial quitado.",
);

assert.equal(
  buildCommissionSourceKey({ obrigacaoId: "obg_1", vendedorUserId: "seller_1" }),
  "commission|obrigacao|obg_1|seller|seller_1|grant",
);

assert.equal(
  isCommissionEligible({
    obrigacaoStatus: "quitada",
    vendedorUserId: "seller_1",
    percentual: 2,
    valorBase: 100,
  }),
  true,
);

assert.equal(
  isCommissionEligible({
    obrigacaoStatus: "parcial",
    vendedorUserId: "seller_1",
    percentual: 2,
    valorBase: 100,
  }),
  false,
  "Obrigação parcial não deve gerar comissão.",
);

const sharedKennelValue = calculateCommissionValue({
  valorBase: 125,
  percentual: 2,
});
assert.equal(sharedKennelValue, 2.5, "Hospedagem compartilhada deve manter cálculo exato sobre a obrigação quitada.");

console.log("Sprint 7 finance commission helper tests passed.");
