import assert from "node:assert/strict";

import {
  applyCreditsToSessions,
  calculateMonthlyBilling,
  deduplicateRecurringPlanCharges,
  generateMonthlySessions,
  getAutomaticRecurringMonthKeys,
  getPackageMonthlyValue,
  isRecordLinkedToRecurringPlanGroup,
  mergeRecurringPlanAppointments,
  resolveRecurringPackageIdsForPlanGroup,
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

const legacyWeeklyDayCarePackage = {
  id: "pkg_day_care_loki_legacy",
  empresa_id: "dogcity",
  client_id: "cliente_cleber",
  pet_id: "loki",
  service_id: "day_care",
  weekday: 3,
  weekdays: [3],
  frequency: "semanal",
  price_per_session: 106.25,
  start_date: "2026-05-06",
  status: "ativo",
  metadata: {
    plan_config_id: "plan_day_care_loki",
  },
};

assert.equal(
  getPackageMonthlyValue(legacyWeeklyDayCarePackage),
  425,
  "Pacote semanal legado deve reconstruir o valor mensal a partir das quatro ocorrências-base",
);

const juneDayCareSessions = generateMonthlySessions({
  packages: [legacyWeeklyDayCarePackage],
  existingSessions: [],
  month: 6,
  year: 2026,
}).sessionsToCreate.map((session, index) => ({ ...session, id: `june_day_care_${index + 1}` }));
const juneDayCareBilling = calculateMonthlyBilling({
  packageRecord: legacyWeeklyDayCarePackage,
  sessions: juneDayCareSessions,
  credits: [],
  month: 6,
  year: 2026,
});

assert.equal(juneDayCareBilling.expected_sessions, 4, "Junho/2026 deve ter quatro quartas-feiras");
assert.equal(juneDayCareBilling.unit_price, 106.25, "Quatro sessões devem ratear R$ 425,00 em R$ 106,25");
assert.equal(juneDayCareBilling.total_amount, 425, "O total mensal de junho deve permanecer em R$ 425,00");

const julyDayCareSessions = generateMonthlySessions({
  packages: [legacyWeeklyDayCarePackage],
  existingSessions: [],
  month: 7,
  year: 2026,
}).sessionsToCreate.map((session, index) => ({ ...session, id: `july_day_care_${index + 1}` }));
const julyDayCareBilling = calculateMonthlyBilling({
  packageRecord: legacyWeeklyDayCarePackage,
  sessions: julyDayCareSessions,
  credits: [],
  month: 7,
  year: 2026,
});

assert.equal(julyDayCareBilling.expected_sessions, 5, "Julho/2026 deve ter cinco quartas-feiras");
assert.equal(julyDayCareBilling.unit_price, 85, "Cinco sessões devem ratear R$ 425,00 em R$ 85,00");
assert.equal(julyDayCareBilling.total_amount, 425, "O total mensal de julho deve permanecer em R$ 425,00");

assert.deepEqual(
  getAutomaticRecurringMonthKeys(new Date(2026, 6, 24, 12, 0, 0)),
  ["2026-07"],
  "Antes do dia 25, a sincronizacao automatica deve garantir somente o mes atual",
);
assert.deepEqual(
  getAutomaticRecurringMonthKeys(new Date(2026, 6, 25, 12, 0, 0)),
  ["2026-07", "2026-08"],
  "No dia 25, a sincronizacao automatica deve antecipar o proximo mes",
);

const recurringPackages = [{
  id: "pkg_loki_v2",
  pet_id: "loki",
  service_id: "day_care",
  metadata: {
    plan_config_id: "plan_loki",
    package_group_key: "group_loki",
  },
}];
const recurringPackageIds = resolveRecurringPackageIdsForPlanGroup({
  packages: recurringPackages,
  planIds: ["plan_loki"],
  packageGroupKey: "group_loki",
});

assert.deepEqual(recurringPackageIds, ["pkg_loki_v2"], "O pacote V2 deve ser ligado ao plano de origem");
assert.equal(
  isRecordLinkedToRecurringPlanGroup(
    { recurring_package_id: "pkg_loki_v2", metadata: { package_id: "pkg_loki_v2" } },
    { planIds: ["plan_loki"], packageGroupKey: "group_loki", recurringPackageIds },
  ),
  true,
  "Agendamentos V2 devem ser reconhecidos pelo recurring_package_id",
);

const lokiSessions = ["06", "13", "20", "27"].map((day, index) => ({
  id: `session_loki_${day}`,
  package_id: "pkg_loki_v2",
  client_id: "client_loki",
  pet_id: "loki",
  service_id: "day_care",
  scheduled_date: `2026-05-${day}`,
  billing_month: "2026-05",
  status: index === 0 ? "falta_nao_cobrada" : "realizada",
}));
const currentAppointments = lokiSessions.map((session) => ({
  id: `appointment_${session.id}`,
  dog_id: "loki",
  service_type: "day_care",
  data_referencia: session.scheduled_date,
  status: session.status === "realizada" ? "finalizado" : "agendado",
  package_session_id: session.id,
  recurring_package_id: "pkg_loki_v2",
  metadata: { package_id: "pkg_loki_v2", package_session_id: session.id },
}));
const legacyAppointments = lokiSessions.map((session) => ({
  id: `legacy_${session.id}`,
  dog_id: "loki",
  service_type: "day_care",
  data_referencia: session.scheduled_date,
  status: "agendado",
  metadata: { plan_id: "plan_loki", package_group_key: "group_loki" },
}));
const mergedAppointments = mergeRecurringPlanAppointments({
  appointments: [...legacyAppointments, ...currentAppointments],
  sessions: lokiSessions,
  planIds: ["plan_loki"],
  packageGroupKey: "group_loki",
  recurringPackageIds,
});

assert.equal(mergedAppointments.length, 4, "A transicao legado/V2 nao pode duplicar os agendamentos de maio");
assert.equal(mergedAppointments.filter((appointment) => appointment.status === "finalizado").length, 3);
assert.equal(mergedAppointments.filter((appointment) => appointment.status === "faltou").length, 1);

const deduplicatedCharges = deduplicateRecurringPlanCharges([
  {
    id: "legacy_charge",
    dog_id: "loki",
    servico: "day_care",
    vencimento: "2026-05-20",
    valor: 425,
    metadata: { plan_id: "plan_loki", month_key: "2026-05" },
  },
  {
    id: "current_charge",
    dog_id: "loki",
    servico: "day_care",
    vencimento: "2026-05-20",
    valor: 425,
    recurring_package_id: "pkg_loki_v2",
    metadata: { package_id: "pkg_loki_v2", billing_month: "2026-05" },
  },
]);

assert.deepEqual(deduplicatedCharges.map((charge) => charge.id), ["current_charge"]);
assert.equal(deduplicatedCharges.reduce((total, charge) => total + charge.valor, 0), 425);

console.log("recurring-packages: cenário obrigatório aprovado");
