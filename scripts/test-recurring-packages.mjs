import assert from "node:assert/strict";

import {
  applyCreditsToSessions,
  calculateMonthlyBilling,
  generateMonthlySessions,
} from "../src/lib/recurring-packages.js";

const packageRecord = {
  id: "pkg_banho_duque",
  empresa_id: "dogcity",
  client_id: "cliente_1",
  pet_id: "duque",
  service_id: "banho",
  weekday: 1,
  weekdays: [1],
  frequency: "semanal",
  price_per_session: 100,
  start_date: "2026-03-01",
  status: "ativo",
  allow_credit_rollover: true,
};

const { sessionsToCreate } = generateMonthlySessions({
  packages: [packageRecord],
  existingSessions: [],
  month: 4,
  year: 2026,
});

assert.equal(sessionsToCreate.length, 4, "Abril/2026 deve gerar 4 segundas-feiras");
assert.deepEqual(
  sessionsToCreate.map((session, index) => ({ ...session, id: `sess_${index + 1}` })).map((session) => session.scheduled_date),
  ["2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27"],
);

const aprilSessions = sessionsToCreate.map((session, index) => ({
  ...session,
  id: `sess_${index + 1}`,
  status: session.scheduled_date === "2026-04-20" ? "cancelada_sem_credito" : session.status,
}));

const marchCredits = [
  {
    id: "cred_mar_1",
    package_id: packageRecord.id,
    client_id: packageRecord.client_id,
    pet_id: packageRecord.pet_id,
    source_session_id: "mar_session_1",
    origin_month: "2026-03",
    status: "disponivel",
    created_at: "2026-03-15T12:00:00.000Z",
    reason: "Ficha paga e não utilizada em março",
  },
  {
    id: "cred_mar_2",
    package_id: packageRecord.id,
    client_id: packageRecord.client_id,
    pet_id: packageRecord.pet_id,
    source_session_id: "mar_session_2",
    origin_month: "2026-03",
    status: "disponivel",
    created_at: "2026-03-22T12:00:00.000Z",
    reason: "Ficha paga e não utilizada em março",
  },
];

const aprilBilling = calculateMonthlyBilling({
  packageRecord,
  sessions: aprilSessions,
  credits: marchCredits,
  month: 4,
  year: 2026,
  referenceDate: new Date("2026-04-01T12:00:00"),
});

assert.equal(aprilBilling.expected_sessions, 4, "Abril deve manter 4 fichas previstas");
assert.equal(aprilBilling.pre_cancelled_sessions, 1, "20/04 deve ser cancelamento prévio");
assert.equal(aprilBilling.credits_used, 2, "Dois créditos de março devem ser usados");
assert.equal(aprilBilling.charged_sessions, 1, "A cobrança final deve ser de uma ficha");
assert.equal(aprilBilling.total_amount, 100, "Total deve ser 1 x valor_por_banho");

const applied = applyCreditsToSessions({
  packageRecord,
  sessions: aprilSessions,
  credits: marchCredits,
  month: 4,
  year: 2026,
  now: new Date("2026-04-01T12:00:00"),
});

assert.equal(applied.sessionUpdates.filter((update) => update.covered_by_credit).length, 2);
assert.deepEqual(
  applied.creditUpdates.map((update) => update.id),
  ["cred_mar_1", "cred_mar_2"],
  "Créditos mais antigos devem ser usados primeiro",
);

const usedCreditIds = new Set(applied.creditUpdates.map((update) => update.id));
const mayCredits = marchCredits.map((credit) => (
  usedCreditIds.has(credit.id) ? { ...credit, status: "usado" } : credit
));
const mayGenerated = generateMonthlySessions({
  packages: [packageRecord],
  existingSessions: [],
  month: 5,
  year: 2026,
});
const maySessions = mayGenerated.sessionsToCreate.map((session, index) => ({ ...session, id: `may_${index + 1}` }));
const mayBilling = calculateMonthlyBilling({
  packageRecord,
  sessions: maySessions,
  credits: mayCredits,
  month: 5,
  year: 2026,
  referenceDate: new Date("2026-05-01T12:00:00"),
});

assert.equal(mayBilling.expected_sessions, 4, "Maio/2026 deve gerar 4 segundas-feiras");
assert.equal(mayBilling.credits_used, 0, "Créditos usados em abril não podem reaparecer em maio");
assert.equal(mayBilling.charged_sessions, 4, "Maio deve cobrar as 4 fichas sem créditos restantes");

console.log("recurring-packages: cenário obrigatório aprovado");
