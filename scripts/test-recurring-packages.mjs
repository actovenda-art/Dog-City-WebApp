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
  resolveFirstRecurringPlanDueDate,
  resolveRecurringPackageIdsForPlanGroup,
} from "../src/lib/recurring-packages.js";

assert.equal(
  resolveFirstRecurringPlanDueDate("2026-06-11", 20),
  "2026-06-20",
  "Contratacao com intervalo suficiente deve manter o vencimento padrao",
);
assert.equal(
  resolveFirstRecurringPlanDueDate("2026-06-18", 20),
  "2026-06-20",
  "Dois dias de diferenca devem preservar um dia inteiro de intervalo",
);
assert.equal(
  resolveFirstRecurringPlanDueDate("2026-06-19", 20),
  "2026-06-21",
  "Contratacao na vespera deve adiar o vencimento para dois dias depois",
);
assert.equal(
  resolveFirstRecurringPlanDueDate("2026-06-20", 20),
  "2026-06-22",
  "Contratacao no vencimento deve vencer dois dias depois",
);
assert.equal(
  resolveFirstRecurringPlanDueDate("2026-06-21", 20),
  "2026-06-23",
  "Contratacao posterior ao vencimento deve vencer dois dias depois",
);
assert.equal(
  resolveFirstRecurringPlanDueDate("2026-01-31", 20),
  "2026-02-02",
  "A carencia de dois dias deve atravessar corretamente a virada do mes",
);
assert.equal(
  resolveFirstRecurringPlanDueDate("2026-04-30", 31),
  "2026-05-02",
  "Vencimento limitado ao ultimo dia ainda deve respeitar o intervalo minimo",
);

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

const midMonthDayCarePackage = {
  ...legacyWeeklyDayCarePackage,
  id: "pkg_day_care_mid_month",
  pet_id: "bud",
  start_date: "2026-06-11",
  weekdays: [5],
  weekday: 5,
  metadata: {
    plan_config_id: "plan_day_care_mid_month",
    plan_monthly_value: 425,
    plan_metadata: {
      start_date: "2026-06-11",
      first_month_real_dates: ["2026-06-11", "2026-06-19", "2026-06-26"],
      first_cycle: {
        due_date: "2026-06-12",
        total_value: 318.75,
        planned_uses: 3,
        billed_uses: 3,
        cycle_slots: 4,
      },
    },
  },
};
const midMonthSessions = generateMonthlySessions({
  packages: [midMonthDayCarePackage],
  existingSessions: [],
  month: 6,
  year: 2026,
}).sessionsToCreate.map((session, index) => ({ ...session, id: `mid_month_${index + 1}` }));
const midMonthBilling = calculateMonthlyBilling({
  packageRecord: midMonthDayCarePackage,
  sessions: midMonthSessions,
  credits: [],
  month: 6,
  year: 2026,
});

assert.deepEqual(
  midMonthSessions.map((session) => session.scheduled_date),
  ["2026-06-11", "2026-06-19", "2026-06-26"],
  "O primeiro mes deve respeitar as datas reais informadas no cadastro",
);
assert.equal(midMonthBilling.expected_sessions, 3, "O primeiro mes deve conter as tres utilizacoes informadas");
assert.equal(midMonthBilling.unit_price, 106.25, "O valor proporcional deve ser dividido pelas tres utilizacoes");
assert.equal(midMonthBilling.total_amount, 318.75, "O primeiro mes parcial deve cobrar somente 3/4 do plano");

assert.deepEqual(
  getAutomaticRecurringMonthKeys(new Date(2026, 6, 4, 12, 0, 0), 5),
  ["2026-07"],
  "Antes do vencimento, a sincronizacao automatica deve garantir somente o mes atual",
);
assert.deepEqual(
  getAutomaticRecurringMonthKeys(new Date(2026, 6, 5, 12, 0, 0), 5),
  ["2026-07", "2026-08"],
  "No vencimento de julho, a sincronizacao automatica deve gerar agosto",
);
const augustDayCareSessions = generateMonthlySessions({
  packages: [{
    id: "pkg_daycare_due_5",
    empresa_id: "dogcity",
    client_id: "cliente_daycare",
    pet_id: "loki",
    service_id: "day_care",
    weekday: 3,
    weekdays: [3],
    frequency: "semanal",
    price_per_session: 100,
    start_date: "2026-07-01",
    status: "ativo",
  }],
  existingSessions: [],
  month: "2026-08",
}).sessionsToCreate;
assert.deepEqual(
  augustDayCareSessions.map((session) => session.scheduled_date),
  ["2026-08-05", "2026-08-12", "2026-08-19", "2026-08-26"],
  "O gatilho de 05/07 deve materializar os agendamentos de Day Care de agosto",
);
assert.deepEqual(
  getAutomaticRecurringMonthKeys(new Date(2026, 1, 28, 12, 0, 0), 31),
  ["2026-02", "2026-03"],
  "Vencimento inexistente no mes deve gerar o proximo ciclo no ultimo dia disponivel",
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
