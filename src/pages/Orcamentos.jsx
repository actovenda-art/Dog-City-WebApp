import React, { useEffect, useMemo, useState } from "react";
import { Orcamento, Dog, Carteira, Responsavel, TabelaPrecos, User, Appointment, Checkin, ContaReceber, RecurringPackage, Replacement, ObrigacaoFinanceira, CobrancaFinanceira, AppConfig, ServiceProvider, ServiceProviderSchedule } from "@/api/entities";
import LoadingScreen from "@/components/layout/LoadingScreen";
import { useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SearchFiltersToolbar from "@/components/common/SearchFiltersToolbar";
import { getAppointmentDateKey, getAppointmentMeta, getAppointmentTimeValue, getManualAppointmentNotice } from "@/lib/attendance";
import { AlertTriangle, Calculator, Dog as DogIcon, FileText, Plus, Save, Send } from "lucide-react";
import { differenceInDays } from "date-fns";

import OrcamentoCaoForm from "@/components/orcamento/OrcamentoCaoForm";
import OrcamentosHistoricoPanel from "@/components/orcamento/OrcamentosHistoricoPanel";
import OrcamentoResumo from "@/components/orcamento/OrcamentoResumo";
import { canViewSensitivePersonalData } from "@/lib/access-control";
import { findEntityByReference } from "@/lib/entity-identifiers";
import { buildBudgetPreviewItems } from "@/lib/finance-budget";
import { FINANCE_FEATURE_FLAGS, getFinanceFeatureFlagValue } from "@/lib/finance-feature-flags";
import { maskCpfCnpj, maskPhone, maskSensitiveValue } from "@/lib/privacy";
import { normalizeLegacyUtf8Text } from "@/lib/text-encoding";
import { financePreviewBudgetConsumption, financeWalletBudgetReadContext } from "@/api/functions";

const PRECOS_PADRAO = {
  diaria_normal: 150,
  diaria_mensalista: 120,
  day_care_avulso_com_pacote: 110,
  day_care_avulso_sem_pacote: 125,
  day_care_avulso: 125,
  adaptacao: 0,
  pernoite: 60,
  transporte_km: 6,
  desconto_canil: 0.3,
  desconto_longa_estadia: 0.03,
};

const PRECOS_BANHO_PADRAO = {
  "Poodle": 60, "Shih Tzu": 65, "Yorkshire": 55, "Maltes": 60,
  "Golden Retriever": 90, "Labrador": 85, "Border Collie": 80,
  "Bulldog Frances": 70, "Bulldog Ingles": 80, "Pug": 55,
  "Spitz Alemao": 75, "Lulu da Pomerania": 70, "Chow Chow": 100,
  "Husky Siberiano": 95, "Pastor Alemao": 90, "Rottweiler": 95,
  "Beagle": 65, "Dachshund": 50, "Schnauzer": 70,
  "Cocker Spaniel": 75, "SRD": 60, "Outro": 70,
};

const PRECOS_TOSA_HIGIENICA_PADRAO = {
  pequeno_baixa: 45,
  pequeno_alta: 55,
  medio_baixa: 55,
  medio_alta: 65,
  grande_baixa: 65,
  grande_alta: 80,
};

const PRECOS_TOSA_GERAL_PADRAO = {
  "Poodle": 80, "Shih Tzu": 85, "Yorkshire": 70, "Maltes": 80,
  "Golden Retriever": 110, "Labrador": 100, "Border Collie": 95,
  "Bulldog Frances": 70, "Bulldog Ingles": 80, "Pug": 60,
  "Spitz Alemao": 95, "Lulu da Pomerania": 90, "Chow Chow": 130,
  "Husky Siberiano": 120, "Pastor Alemao": 110, "Rottweiler": 100,
  "Beagle": 70, "Dachshund": 55, "Schnauzer": 85,
  "Cocker Spaniel": 95, "SRD": 80, "Outro": 85,
};

const PRECOS_TOSA_DETALHADA_PADRAO = {
  "Poodle": 120, "Shih Tzu": 130, "Yorkshire": 110, "Maltes": 120,
  "Golden Retriever": 160, "Labrador": 150, "Border Collie": 140,
  "Bulldog Frances": 100, "Bulldog Ingles": 110, "Pug": 90,
  "Spitz Alemao": 140, "Lulu da Pomerania": 130, "Chow Chow": 180,
  "Husky Siberiano": 170, "Pastor Alemao": 160, "Rottweiler": 150,
  "Beagle": 100, "Dachshund": 80, "Schnauzer": 120,
  "Cocker Spaniel": 140, "SRD": 110, "Outro": 120,
};

const emptyCao = {
  dog_id: "",
  servicos: { day_care: false, hospedagem: false, adaptacao: false, banho: false, tosa: false, transporte: false },
  day_care_data: "",
  day_care_plano_ativo: false,
  day_care_horario_entrada: "08:00",
  day_care_horario_saida: "18:00",
  day_care_observacoes: "",
  adaptacao_data: "",
  adaptacao_horario_entrada: "09:00",
  adaptacao_horario_saida: "10:00",
  adaptacao_observacoes: "",
  hosp_data_entrada: "",
  hosp_horario_entrada: "",
  hosp_data_saida: "",
  hosp_horario_saida: "12:00",
  hosp_is_mensalista: false,
  hosp_dormitório_compartilhado: false,
  hosp_dormitório_com: [],
  hosp_tem_daycare_ativo: false,
  hosp_datas_daycare: [],
  hosp_origem_pernoite_daycare: false,
  hosp_pernoite_appointment_id: "",
  banho_plano_ativo: false,
  banho_do_pacote: false,
  banho_data: "",
  banho_horario: "",
  banho_horario_inicio: "",
  banho_horario_saida: "",
  banho_raca: "",
  banho_observacoes: "",
  banho_srd_porte: "",
  banho_srd_pelagem: "",
  banho_reuse_appointment_id: "",
  banho_reuse_service_type: "",
  banho_grooming_resolution: "",
  banho_grooming_target_appointment_id: "",
  tosa_data: "",
  tosa_tipo: "",
  tosa_subtipo_higienica: "",
  tosa_plano_ativo: false,
  tosa_do_pacote: false,
  tosa_horario_entrada: "",
  tosa_horario_saida: "",
  tosa_obs: "",
  tosa_reuse_appointment_id: "",
  tosa_reuse_service_type: "",
  transporte_plano_ativo: false,
  transporte_do_pacote: false,
  transporte_viagens: [{ partida: "", destino: "", data: "", horario: "", horario_fim: "", km: "", observacao: "" }],
};

const RELATION_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];
const ORCAMENTO_PREFILL_STORAGE_PREFIX = "dogcity:orcamento-prefill:";
const ACTIVE_BATH_SERVICE_IDS = new Set(["banho", "banho_tosa"]);
const ACTIVE_GROOMING_SERVICE_IDS = new Set(["tosa", "banho_tosa"]);
const RECURRING_DISABLED_APPOINTMENT_STATUSES = new Set(["cancelado", "desconsiderado"]);
const RECURRING_GROOMING_MOVE_TARGET_SERVICE_IDS = new Set(["banho_tosa"]);
const RECURRING_SNAPSHOT_FIELDS = [
  "banho_reuse_appointment_id",
  "banho_reuse_service_type",
  "banho_grooming_resolution",
  "banho_grooming_target_appointment_id",
  "tosa_reuse_appointment_id",
  "tosa_reuse_service_type",
];

function getBudgetTransferMetadata(record) {
  const metadata = record?.metadata;
  if (!metadata) return {};
  if (typeof metadata === "object") return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

function isAppointmentLinkedToBudget(appointment, budgetId) {
  if (!appointment || !budgetId) return false;
  const metadata = getAppointmentMeta(appointment);
  const sourceKey = String(appointment.source_key || "");
  return appointment.orcamento_id === budgetId
    || metadata.orcamento_id === budgetId
    || (appointment.source_type === "orcamento_aprovado" && sourceKey.startsWith(`orcamento|${budgetId}|`));
}

function isTransferRecordLinkedToBudget(record, budgetId, appointmentIds) {
  if (!record || !budgetId) return false;
  const metadata = getBudgetTransferMetadata(record);
  const sourceKey = String(record.source_key || "");
  const possibleAppointmentIds = [
    record.appointment_id,
    record.source_appointment_id,
    record.original_appointment_id,
    record.linked_appointment_id,
    record.replacement_of_appointment_id,
    metadata.appointment_id,
    metadata.source_appointment_id,
    metadata.original_appointment_id,
    metadata.linked_appointment_id,
    metadata.replacement_of_appointment_id,
  ].filter(Boolean);

  return record.orcamento_id === budgetId
    || metadata.orcamento_id === budgetId
    || possibleAppointmentIds.some((appointmentId) => appointmentIds.has(appointmentId))
    || [...appointmentIds].some((appointmentId) => sourceKey.includes(`|${appointmentId}|`));
}

function isOpenFinancialStatus(status) {
  return ["", "aberta", "vencida", "pendente", "parcial"].includes(
    String(status || "").trim().toLowerCase(),
  );
}

function buildBudgetReplacementCancellationMetadata(record, sourceBudgetId, targetBudgetId, migratedAt) {
  return {
    ...getAppointmentMeta(record),
    budget_replacement_cancelled: true,
    migrated_from_orcamento_id: sourceBudgetId,
    migrated_to_orcamento_id: targetBudgetId,
    migrated_at: migratedAt,
  };
}

async function readTransferCollection(entity, sort = "-created_date") {
  if (entity.listAll) return entity.listAll(sort, 1000, 10000);
  return entity.list(sort, 5000);
}

async function replaceBudgetForUsedAppointments({
  sourceBudgetId,
  targetBudgetId,
  usedAppointmentIds,
}) {
  if (!sourceBudgetId || !targetBudgetId || sourceBudgetId === targetBudgetId) return;

  const requestedUsedIds = new Set((usedAppointmentIds || []).filter(Boolean));
  if (!requestedUsedIds.size) {
    throw new Error("Nenhum atendimento utilizado foi informado para substituir o orçamento anterior.");
  }

  const [appointmentRows, receivableRows, replacementRows, obligationRows, chargeRows] = await Promise.all([
    readTransferCollection(Appointment),
    readTransferCollection(ContaReceber),
    readTransferCollection(Replacement),
    readTransferCollection(ObrigacaoFinanceira),
    readTransferCollection(CobrancaFinanceira),
  ]);
  const sourceAppointments = (appointmentRows || []).filter((appointment) =>
    isAppointmentLinkedToBudget(appointment, sourceBudgetId)
  );
  const sourceAppointmentIds = new Set(sourceAppointments.map((appointment) => appointment.id).filter(Boolean));
  const usedAppointments = sourceAppointments.filter((appointment) => requestedUsedIds.has(appointment.id));

  if (usedAppointments.length !== requestedUsedIds.size) {
    throw new Error("Um ou mais atendimentos utilizados não pertencem mais ao orçamento anterior. Reabra o fluxo e tente novamente.");
  }

  const migratedAt = new Date().toISOString();
  const originalAppointmentLinks = usedAppointments.map((appointment) => ({
    id: appointment.id,
    orcamento_id: appointment.orcamento_id || null,
    metadata: getAppointmentMeta(appointment),
  }));
  const originalFinancialRows = [];

  try {
    await Promise.all(usedAppointments.map((appointment) => {
      const metadata = getAppointmentMeta(appointment);
      return Appointment.update(appointment.id, {
        orcamento_id: targetBudgetId,
        metadata: {
          ...metadata,
          orcamento_id: targetBudgetId,
          linked_orcamento_id: metadata.linked_orcamento_id === sourceBudgetId
            ? targetBudgetId
            : metadata.linked_orcamento_id,
          overnight_orcamento_id: metadata.overnight_orcamento_id === sourceBudgetId
            ? targetBudgetId
            : metadata.overnight_orcamento_id,
          migrated_from_orcamento_id: sourceBudgetId,
          migrated_to_orcamento_id: targetBudgetId,
          migrated_at: migratedAt,
        },
      });
    }));

    const linkedReceivables = (receivableRows || []).filter((record) =>
      isTransferRecordLinkedToBudget(record, sourceBudgetId, sourceAppointmentIds)
    );
    const linkedReplacements = (replacementRows || []).filter((record) =>
      isTransferRecordLinkedToBudget(record, sourceBudgetId, sourceAppointmentIds)
    );
    const linkedObligations = (obligationRows || []).filter((record) =>
      isTransferRecordLinkedToBudget(record, sourceBudgetId, sourceAppointmentIds)
    );
    const linkedCharges = (chargeRows || []).filter((record) =>
      isTransferRecordLinkedToBudget(record, sourceBudgetId, sourceAppointmentIds)
    );
    const unusedAppointments = sourceAppointments.filter((appointment) => !requestedUsedIds.has(appointment.id));

    const pendingFinancialRows = [
      ...linkedObligations.map((record) => ({ entity: ObrigacaoFinanceira, record })),
      ...linkedCharges.map((record) => ({ entity: CobrancaFinanceira, record })),
    ].filter(({ record }) => isOpenFinancialStatus(record.status));

    await Promise.all(pendingFinancialRows.map(async ({ entity, record }) => {
      originalFinancialRows.push({
        entity,
        id: record.id,
        status: record.status,
        valor_em_aberto: record.valor_em_aberto,
        metadata: getAppointmentMeta(record),
      });
      await entity.update(record.id, {
        status: "cancelada",
        valor_em_aberto: 0,
        metadata: buildBudgetReplacementCancellationMetadata(
          record,
          sourceBudgetId,
          targetBudgetId,
          migratedAt,
        ),
      });
    }));

    await Promise.all(linkedReplacements.map((record) => Replacement.delete(record.id)));
    await Promise.all(linkedReceivables.map((record) => ContaReceber.delete(record.id)));
    await Promise.all(unusedAppointments.map((appointment) => Appointment.delete(appointment.id)));
    await Orcamento.delete(sourceBudgetId);
  } catch (error) {
    await Promise.allSettled([
      ...originalAppointmentLinks.map((appointment) =>
        Appointment.update(appointment.id, {
          orcamento_id: appointment.orcamento_id,
          metadata: appointment.metadata,
        })
      ),
      ...originalFinancialRows.map((row) => row.entity.update(row.id, {
        status: row.status,
        valor_em_aberto: row.valor_em_aberto,
        metadata: row.metadata,
      })),
    ]);
    throw error;
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function normalizeBreedName(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeSearchValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getLinkedDogIds(record) {
  return RELATION_SLOTS
    .map((number) => record?.[`dog_id_${number}`])
    .filter(Boolean);
}

function getFirstLinkedCarteiraForDogIds(carteiras, dogIds) {
  return (carteiras || []).find((cliente) =>
    getLinkedDogIds(cliente).some((dogId) => dogIds.includes(dogId))
  ) || null;
}

function addDays(dateKey, days) {
  const baseDate = new Date(`${dateKey}T12:00:00`);
  baseDate.setDate(baseDate.getDate() + days);
  return baseDate.toISOString().slice(0, 10);
}

function parseCurrencyInput(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createEmptyCao() {
  return JSON.parse(JSON.stringify(emptyCao));
}

function parseRecurringMetadata(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function getRecurringOperationalConfig(packageRecord) {
  const metadata = parseRecurringMetadata(packageRecord?.metadata);
  return parseRecurringMetadata(metadata?.plan_metadata?.operational_config || metadata?.operational_config || {});
}

function getRecurringScheduleRule(packageRecord) {
  return String(getRecurringOperationalConfig(packageRecord)?.schedule_rule || packageRecord?.frequency || "").trim();
}

function getRecurringFrequencyLabel(frequencyId) {
  const normalized = String(frequencyId || "").trim();
  const labels = {
    "1x_semana": "Day Care 1x por semana",
    "2x_semana": "Day Care 2x por semana",
    "3x_semana": "Day Care 3x por semana",
    "4x_semana": "Day Care 4x por semana",
    "5x_semana": "Day Care 5x por semana",
    quinzenal: "Quinzenal",
    toda_semana: "Toda semana",
    ultima_semana_mes: "Ultima semana do mes",
    primeira_semana: "Primeira semana",
    segunda_semana: "Segunda semana",
    quarta_semana: "Quarta semana",
  };
  return labels[normalized] || normalized || "Plano ativo";
}

function getCreatedTimestamp(record) {
  const candidates = [record?.created_date, record?.created_at, record?.data_criacao];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const timestamp = new Date(candidate).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

function formatCompactDate(value) {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function formatCompactTime(startTime, endTime = "") {
  if (startTime && endTime) return `${String(startTime).slice(0, 5)} as ${String(endTime).slice(0, 5)}`;
  if (startTime) return String(startTime).slice(0, 5);
  if (endTime) return String(endTime).slice(0, 5);
  return "";
}

function getAppointmentStartDate(appointment) {
  return (
    getAppointmentDateKey(appointment) ||
    String(appointment?.data_hora_entrada || "").slice(0, 10) ||
    String(appointment?.data_referencia || "").slice(0, 10) ||
    ""
  );
}

function checkinMatchesAppointment(checkin, appointment) {
  if (!checkin || !appointment) return false;
  const metadata = parseRecurringMetadata(checkin?.metadata);
  return checkin.appointment_id === appointment.id
    || metadata.appointment_id === appointment.id
    || (appointment.linked_checkin_id && checkin.id === appointment.linked_checkin_id)
    || (appointment.source_key && metadata.appointment_source_key === appointment.source_key);
}

function appointmentHasStartedCheckin(appointment, checkins = []) {
  if (!appointment) return false;
  if (appointment.linked_checkin_id) return true;
  if (["presente", "finalizado", "concluido"].includes(String(appointment.status || "").toLowerCase())) {
    return true;
  }
  return (checkins || []).some((checkin) => checkinMatchesAppointment(checkin, appointment));
}

function buildRecurringAppointmentOption(appointment, packageRecord) {
  const startDate = getAppointmentStartDate(appointment);
  const startTime = getAppointmentTimeValue(appointment, "entrada") || appointment?.hora_entrada || "";
  const endTime = getAppointmentTimeValue(appointment, "saida") || appointment?.hora_saida || "";
  const metadata = getAppointmentMeta(appointment);
  const packageLabel = `${appointment?.service_type === "banho_tosa" ? "Banho & Tosa" : appointment?.service_type === "tosa" ? "Tosa" : "Banho"} • ${getRecurringFrequencyLabel(getRecurringScheduleRule(packageRecord) || packageRecord?.frequency)}`;

  return {
    id: appointment.id,
    package_id: packageRecord?.id || appointment?.recurring_package_id || "",
    package_label: packageLabel,
    service_type: appointment?.service_type || "",
    date: startDate,
    date_label: formatCompactDate(startDate),
    time_label: formatCompactTime(startTime, endTime),
    has_grooming: Boolean(metadata?.has_grooming),
    appointment,
    label: [formatCompactDate(startDate), formatCompactTime(startTime, endTime), packageLabel].filter(Boolean).join(" • "),
  };
}

function buildRecurringDogBudgetContext(dogId, recurringPackages = [], appointments = [], checkins = []) {
  if (!dogId) return null;

  const activePackages = (recurringPackages || [])
    .filter((item) => item?.pet_id === dogId)
    .filter((item) => item?.status === "ativo")
    .sort((left, right) => getCreatedTimestamp(right) - getCreatedTimestamp(left));

  if (activePackages.length === 0) {
    return {
      plans: [],
      dayCarePlan: null,
      mensalistaEligible: false,
      mensalistaSummary: "",
      mensalistaBlockReason: "",
      hasBathPlan: false,
      hasGroomingPlan: false,
      pendingBathOptions: [],
      pendingBathOnlyOptions: [],
      pendingGroomingOptions: [],
    };
  }

  const plans = activePackages.map((item) => ({
    id: item.id,
    service_id: item.service_id,
    frequency: String(item.frequency || "").trim(),
    schedule_rule: getRecurringScheduleRule(item),
  }));

  const activeDayCarePlans = activePackages.filter((item) => item?.service_id === "day_care");
  const mensalistaEligiblePlan = activeDayCarePlans.find((item) => String(item.frequency || "").trim() !== "quinzenal") || null;
  const dayCarePlan = mensalistaEligiblePlan || activeDayCarePlans[0] || null;

  const bathPackages = activePackages.filter((item) => ACTIVE_BATH_SERVICE_IDS.has(item?.service_id));
  const groomingPackages = activePackages.filter((item) => ACTIVE_GROOMING_SERVICE_IDS.has(item?.service_id));
  const recurringPackageIds = new Set(activePackages.map((item) => item.id));

  const pendingRecurringAppointments = (appointments || [])
    .filter((appointment) => appointment?.dog_id === dogId)
    .filter((appointment) => appointment?.recurring_package_id && recurringPackageIds.has(appointment.recurring_package_id))
    .filter((appointment) => !RECURRING_DISABLED_APPOINTMENT_STATUSES.has(String(appointment?.status || "").toLowerCase()))
    .filter((appointment) => !appointmentHasStartedCheckin(appointment, checkins))
    .sort((left, right) => String(getAppointmentStartDate(left)).localeCompare(String(getAppointmentStartDate(right))));

  const pendingBathOptions = pendingRecurringAppointments
    .filter((appointment) => ACTIVE_BATH_SERVICE_IDS.has(appointment?.service_type))
    .map((appointment) => buildRecurringAppointmentOption(
      appointment,
      activePackages.find((item) => item.id === appointment.recurring_package_id),
    ));

  const pendingBathOnlyOptions = pendingRecurringAppointments
    .filter((appointment) => RECURRING_GROOMING_MOVE_TARGET_SERVICE_IDS.has(appointment?.service_type))
    .filter((appointment) => !Boolean(getAppointmentMeta(appointment)?.has_grooming))
    .map((appointment) => buildRecurringAppointmentOption(
      appointment,
      activePackages.find((item) => item.id === appointment.recurring_package_id),
    ));

  const pendingGroomingOptions = pendingRecurringAppointments
    .filter((appointment) => ACTIVE_GROOMING_SERVICE_IDS.has(appointment?.service_type))
    .filter((appointment) => appointment?.service_type === "tosa" || Boolean(getAppointmentMeta(appointment)?.has_grooming))
    .map((appointment) => buildRecurringAppointmentOption(
      appointment,
      activePackages.find((item) => item.id === appointment.recurring_package_id),
    ));

  return {
    plans,
    dayCarePlan,
    mensalistaEligible: Boolean(mensalistaEligiblePlan),
    mensalistaSummary: dayCarePlan
      ? `${getRecurringFrequencyLabel(getRecurringScheduleRule(dayCarePlan) || dayCarePlan.frequency)} ativo`
      : "",
    mensalistaBlockReason: dayCarePlan && !mensalistaEligiblePlan
      ? "Plano quinzenal nao aplica desconto de mensalista na hospedagem."
      : "",
    hasBathPlan: bathPackages.length > 0,
    hasGroomingPlan: groomingPackages.length > 0,
    pendingBathOptions,
    pendingBathOnlyOptions,
    pendingGroomingOptions,
  };
}

function normalizeBudgetCaoWithRecurringContext(cao, recurringContext) {
  const next = {
    ...createEmptyCao(),
    ...cao,
    servicos: {
      ...createEmptyCao().servicos,
      ...(cao?.servicos || {}),
    },
    transporte_viagens: Array.isArray(cao?.transporte_viagens) && cao.transporte_viagens.length > 0
      ? cao.transporte_viagens
      : createEmptyCao().transporte_viagens,
  };

  next.day_care_plano_ativo = Boolean(next.servicos?.day_care && recurringContext?.dayCarePlan);
  next.hosp_is_mensalista = Boolean(next.servicos?.hospedagem && recurringContext?.mensalistaEligible);
  next.banho_plano_ativo = Boolean(next.servicos?.banho && recurringContext?.hasBathPlan);
  next.tosa_plano_ativo = Boolean(next.servicos?.tosa && recurringContext?.hasGroomingPlan);

  const selectedBathOption = (recurringContext?.pendingBathOptions || []).find(
    (item) => item.id === next.banho_reuse_appointment_id,
  ) || null;
  next.banho_do_pacote = Boolean(next.servicos?.banho && selectedBathOption);
  next.banho_reuse_service_type = selectedBathOption?.service_type || "";

  if (!selectedBathOption) {
    next.banho_reuse_appointment_id = "";
    next.banho_grooming_resolution = "";
    next.banho_grooming_target_appointment_id = "";
  } else if (!selectedBathOption.has_grooming) {
    next.banho_grooming_resolution = "";
    next.banho_grooming_target_appointment_id = "";
  } else {
    if (!["keep", "move", "credit"].includes(next.banho_grooming_resolution)) {
      next.banho_grooming_resolution = "keep";
    }

    const validTargets = (recurringContext?.pendingBathOnlyOptions || []).filter((item) => item.id !== selectedBathOption.id);
    if (next.banho_grooming_resolution !== "move") {
      next.banho_grooming_target_appointment_id = "";
    } else if (!validTargets.some((item) => item.id === next.banho_grooming_target_appointment_id)) {
      next.banho_grooming_target_appointment_id = "";
    }
  }

  const selectedTosaOption = (recurringContext?.pendingGroomingOptions || []).find(
    (item) => item.id === next.tosa_reuse_appointment_id,
  ) || null;
  next.tosa_do_pacote = Boolean(next.servicos?.tosa && selectedTosaOption);
  next.tosa_reuse_service_type = selectedTosaOption?.service_type || "";
  if (!selectedTosaOption) {
    next.tosa_reuse_appointment_id = "";
  }

  return next;
}

function buildPrefilledCaoFromAppointment(appointment, dog) {
  const metadata = getAppointmentMeta(appointment);
  const snapshot = metadata.snapshot && typeof metadata.snapshot === "object" ? metadata.snapshot : {};
  const serviceDate = getAppointmentDateKey(appointment) || snapshot.day_care_data || snapshot.banho_data || snapshot.tosa_data || snapshot.adaptacao_data || snapshot.hosp_data_entrada || new Date().toISOString().slice(0, 10);
  const startTime = getAppointmentTimeValue(appointment, "entrada") || snapshot.hora_entrada || "09:00";
  const endTime = getAppointmentTimeValue(appointment, "saida") || snapshot.hora_saida || "";
  const cao = {
    ...createEmptyCao(),
    dog_id: appointment.dog_id || "",
    replacement_used_appointment_id: appointment.id || "",
    servicos: { ...createEmptyCao().servicos },
  };

  if (appointment.service_type === "day_care") {
    cao.servicos.day_care = true;
    cao.day_care_data = serviceDate;
    cao.day_care_plano_ativo = Boolean(snapshot.day_care_plano_ativo || metadata.day_care_plano_ativo);
    cao.day_care_horario_entrada = startTime || snapshot.day_care_horario_entrada || "08:00";
    cao.day_care_horario_saida = endTime || snapshot.day_care_horario_saida || "18:00";
    cao.day_care_observacoes = appointment.observacoes || snapshot.day_care_observacoes || "";
  } else if (appointment.service_type === "pernoite") {
    const exitDate = (appointment.data_hora_saida || "").slice(0, 10) || addDays(serviceDate, 1);
    cao.servicos.hospedagem = true;
    cao.hosp_data_entrada = serviceDate;
    cao.hosp_horario_entrada = startTime || "19:00";
    cao.hosp_data_saida = exitDate;
    cao.hosp_horario_saida = "11:59";
    cao.hosp_tem_daycare_ativo = true;
    cao.hosp_datas_daycare = [serviceDate];
    cao.hosp_origem_pernoite_daycare = true;
    cao.hosp_pernoite_appointment_id = appointment.id || "";
    cao.day_care_observacoes = appointment.observacoes || "Pernoite gerado a partir do Day Care sem check-out até 19h.";
  } else if (appointment.service_type === "hospedagem") {
    const exitDate = (appointment.data_hora_saida || "").slice(0, 10) || snapshot.hosp_data_saida || serviceDate;
    cao.servicos.hospedagem = true;
    cao.hosp_data_entrada = serviceDate;
    cao.hosp_horario_entrada = startTime || snapshot.hosp_horario_entrada || "09:00";
    cao.hosp_data_saida = exitDate;
    cao.hosp_horario_saida = endTime || snapshot.hosp_horario_saida || "12:00";
    cao.hosp_is_mensalista = Boolean(snapshot.hosp_is_mensalista);
    cao.hosp_dormitório_compartilhado = Boolean(snapshot.hosp_dormitório_compartilhado);
    cao.hosp_dormitório_com = Array.isArray(snapshot.hosp_dormitório_com) ? snapshot.hosp_dormitório_com : [];
    cao.hosp_tem_daycare_ativo = Boolean(snapshot.hosp_tem_daycare_ativo);
    cao.hosp_datas_daycare = Array.isArray(snapshot.hosp_datas_daycare) ? snapshot.hosp_datas_daycare : [];
  } else if (appointment.service_type === "adaptacao") {
    cao.servicos.adaptacao = true;
    cao.adaptacao_data = serviceDate;
    cao.adaptacao_horario_entrada = startTime || snapshot.adaptacao_horario_entrada || "09:00";
    cao.adaptacao_horario_saida = endTime || snapshot.adaptacao_horario_saida || "10:00";
    cao.adaptacao_observacoes = appointment.observacoes || snapshot.adaptacao_observacoes || "";
  } else if (appointment.service_type === "banho") {
    cao.servicos.banho = true;
    cao.banho_data = serviceDate;
    cao.banho_horario = startTime || snapshot.banho_horario || "";
    cao.banho_horario_inicio = startTime || snapshot.banho_horario_inicio || snapshot.banho_horario || "09:00";
    cao.banho_horario_saida = endTime || snapshot.banho_horario_saida || "";
    cao.banho_raca = snapshot.banho_raca || dog?.raca || "";
    cao.banho_plano_ativo = Boolean(snapshot.banho_plano_ativo);
    cao.banho_do_pacote = Boolean(snapshot.banho_do_pacote);
    cao.banho_observacoes = appointment.observacoes || snapshot.banho_observacoes || "";
    cao.banho_srd_porte = snapshot.banho_srd_porte || "";
    cao.banho_srd_pelagem = snapshot.banho_srd_pelagem || "";
  } else if (appointment.service_type === "banho_tosa") {
    const hasGrooming = Boolean(metadata.has_grooming || snapshot?.servicos?.tosa || snapshot?.tosa_tipo);
    cao.servicos.banho = true;
    cao.servicos.tosa = hasGrooming;
    cao.banho_data = serviceDate;
    cao.banho_horario = startTime || snapshot.banho_horario || "";
    cao.banho_horario_inicio = startTime || snapshot.banho_horario_inicio || snapshot.banho_horario || "09:00";
    cao.banho_horario_saida = endTime || snapshot.banho_horario_saida || "";
    cao.banho_raca = snapshot.banho_raca || dog?.raca || "";
    cao.banho_plano_ativo = true;
    cao.banho_do_pacote = Boolean(snapshot.banho_do_pacote || appointment.source_type === "pacote_recorrente_pre_pago");
    cao.banho_observacoes = appointment.observacoes || snapshot.banho_observacoes || "";
    cao.banho_srd_porte = snapshot.banho_srd_porte || "";
    cao.banho_srd_pelagem = snapshot.banho_srd_pelagem || "";
    if (hasGrooming) {
      cao.tosa_data = serviceDate;
      cao.tosa_tipo = snapshot.tosa_tipo || "geral";
      cao.tosa_subtipo_higienica = snapshot.tosa_subtipo_higienica || "";
      cao.tosa_plano_ativo = true;
      cao.tosa_do_pacote = Boolean(snapshot.tosa_do_pacote || appointment.source_type === "pacote_recorrente_pre_pago");
      cao.tosa_horario_entrada = startTime || snapshot.tosa_horario_entrada || "10:00";
      cao.tosa_horario_saida = endTime || snapshot.tosa_horario_saida || "";
      cao.tosa_obs = appointment.observacoes || snapshot.tosa_obs || "";
    }
  } else if (appointment.service_type === "tosa") {
    cao.servicos.tosa = true;
    cao.tosa_data = serviceDate;
    cao.tosa_tipo = snapshot.tosa_tipo || "geral";
    cao.tosa_subtipo_higienica = snapshot.tosa_subtipo_higienica || "";
    cao.tosa_plano_ativo = Boolean(snapshot.tosa_plano_ativo);
    cao.tosa_do_pacote = Boolean(snapshot.tosa_do_pacote);
    cao.tosa_horario_entrada = startTime || snapshot.tosa_horario_entrada || "10:00";
    cao.tosa_horario_saida = endTime || snapshot.tosa_horario_saida || "";
    cao.banho_raca = snapshot.banho_raca || dog?.raca || "";
    cao.tosa_obs = appointment.observacoes || snapshot.tosa_obs || "";
  } else if (appointment.service_type === "transporte") {
    const viagem = metadata.viagem && typeof metadata.viagem === "object" ? metadata.viagem : {};
    cao.servicos.transporte = true;
    cao.transporte_plano_ativo = Boolean(snapshot.transporte_plano_ativo);
    cao.transporte_do_pacote = Boolean(snapshot.transporte_do_pacote);
    cao.transporte_viagens = [{
      partida: viagem.partida || "",
      destino: viagem.destino || "",
      data: serviceDate,
      horario: startTime || viagem.horario || "",
      horario_fim: endTime || viagem.horario_fim || "",
      km: viagem.km || "",
      observacao: appointment.observacoes || viagem.observacao || "",
    }];
  }

  RECURRING_SNAPSHOT_FIELDS.forEach((field) => {
    if (snapshot?.[field] !== undefined) {
      cao[field] = snapshot[field];
    }
  });

  return cao;
}

function buildPricingConfig(precosRows, empresaId) {
  const scopedRows = (precosRows || []).filter((row) => row.ativo !== false && (!row.empresa_id || row.empresa_id === empresaId));
  const byConfigKey = Object.fromEntries(scopedRows.filter((row) => row.config_key).map((row) => [row.config_key, row.valor]));

  const breedMap = (tipo) => scopedRows
    .filter((row) => row.tipo === tipo)
    .reduce((acc, row) => {
      if (row.raca) acc[normalizeBreedName(row.raca)] = row.valor;
      return acc;
    }, {});

  return {
    diaria_normal: byConfigKey.diaria_normal ?? PRECOS_PADRAO.diaria_normal,
    diaria_mensalista: byConfigKey.diaria_mensalista ?? PRECOS_PADRAO.diaria_mensalista,
    day_care_avulso_com_pacote:
      byConfigKey.day_care_avulso_com_pacote ??
      scopedRows.find(
        (row) => row.tipo === "day_care_avulso_com_pacote" || row.config_key === "day_care_avulso_com_pacote"
      )?.valor ??
      PRECOS_PADRAO.day_care_avulso_com_pacote,
    day_care_avulso_sem_pacote:
      byConfigKey.day_care_avulso_sem_pacote ??
      scopedRows.find(
        (row) => row.tipo === "day_care_avulso_sem_pacote" || row.config_key === "day_care_avulso_sem_pacote"
      )?.valor ??
      byConfigKey.day_care_avulso ??
      scopedRows.find((row) => row.tipo === "day_care_avulso" || row.config_key === "day_care_avulso")?.valor ??
      PRECOS_PADRAO.day_care_avulso_sem_pacote,
    day_care_avulso:
      byConfigKey.day_care_avulso ??
      scopedRows.find((row) => row.tipo === "day_care_avulso" || row.config_key === "day_care_avulso")?.valor ??
      byConfigKey.day_care_avulso_sem_pacote ??
      scopedRows.find(
        (row) => row.tipo === "day_care_avulso_sem_pacote" || row.config_key === "day_care_avulso_sem_pacote"
      )?.valor ??
      PRECOS_PADRAO.day_care_avulso_sem_pacote,
    adaptacao:
      byConfigKey.adaptacao ??
      scopedRows.find((row) => row.tipo === "adaptacao" || row.config_key === "adaptacao")?.valor ??
      PRECOS_PADRAO.adaptacao,
    pernoite: byConfigKey.pernoite ?? PRECOS_PADRAO.pernoite,
    transporte_km: byConfigKey.transporte_km ?? PRECOS_PADRAO.transporte_km,
    desconto_canil: (byConfigKey.desconto_canil ?? (PRECOS_PADRAO.desconto_canil * 100)) / 100,
    desconto_longa_estadia: (byConfigKey.desconto_longa_estadia ?? (PRECOS_PADRAO.desconto_longa_estadia * 100)) / 100,
    banho: { ...PRECOS_BANHO_PADRAO, ...breedMap("banho") },
    tosa_higienica: { ...PRECOS_TOSA_HIGIENICA_PADRAO, ...breedMap("tosa_higienica") },
    tosa_geral: { ...PRECOS_TOSA_GERAL_PADRAO, ...breedMap("tosa_geral") },
    tosa_detalhada: { ...PRECOS_TOSA_DETALHADA_PADRAO, ...breedMap("tosa_detalhada") },
  };
}

function getDayCareStandaloneValue(cao, precos) {
  if (cao?.day_care_plano_ativo) {
    return precos.day_care_avulso_com_pacote ?? precos.day_care_avulso ?? PRECOS_PADRAO.day_care_avulso_com_pacote;
  }
  return precos.day_care_avulso_sem_pacote ?? precos.day_care_avulso ?? PRECOS_PADRAO.day_care_avulso_sem_pacote;
}

function calcularOrcamento(caes, dogs, precos) {
  const detalhes = [];
  const transporteLinhas = [];
  let subtotalHospedagem = 0;
  let subtotalServicos = 0;
  let subtotalTransporte = 0;
  let descontoTotal = 0;

  caes.forEach((cao) => {
    if (!cao.dog_id) return;
    const dog = dogs.find((item) => item.id === cao.dog_id);
    const linhas = [];
    let totalCao = 0;

    if (cao.servicos?.day_care && cao.day_care_data) {
      const valorDayCare = getDayCareStandaloneValue(cao, precos);
      linhas.push({
        tipo: "day_care",
            descricao: `Day Care Avulso (${cao.day_care_plano_ativo ? "cão com pacote ativo" : "cão sem pacote ativo"})`,
        valor: valorDayCare,
      });
      totalCao += valorDayCare;
      subtotalServicos += valorDayCare;
    }

    if (cao.servicos?.adaptacao && cao.adaptacao_data) {
      const valorAdaptacao = Number(precos.adaptacao || 0);
      linhas.push({
        tipo: "adaptacao",
            descricao: "Adaptação",
        valor: valorAdaptacao,
      });
      totalCao += valorAdaptacao;
      subtotalServicos += valorAdaptacao;
    }

    if (cao.servicos?.hospedagem && cao.hosp_data_entrada && cao.hosp_data_saida) {
      const entrada = new Date(cao.hosp_data_entrada);
      const saida = new Date(cao.hosp_data_saida);
      let diarias = differenceInDays(saida, entrada);
      const [hora] = (cao.hosp_horario_saida || "12:00").split(":").map(Number);
      if (hora >= 12) diarias += 1;
      diarias = Math.max(1, diarias);

      const numDaycare = (cao.hosp_datas_daycare || []).filter(Boolean).length;
      const diariasNormais = Math.max(0, diarias - numDaycare);
      const valorDiaria = cao.hosp_is_mensalista ? precos.diaria_mensalista : precos.diaria_normal;

      const subtotalDiarias = diariasNormais * valorDiaria;
      const subtotalPernoite = numDaycare * precos.pernoite;

      if (diariasNormais > 0) {
        linhas.push({
          tipo: "hospedagem",
          descricao: `${diariasNormais} diaria(s) x ${formatCurrency(valorDiaria)}`,
          valor: subtotalDiarias,
        });
      }

      if (numDaycare > 0) {
        linhas.push({
          tipo: "pernoite",
          descricao: `${numDaycare} pernoite(s) (Day Care) x ${formatCurrency(precos.pernoite)}`,
          valor: subtotalPernoite,
        });
      }

      let descDormitorio = 0;
      if (cao.hosp_dormitório_compartilhado && (cao.hosp_dormitório_com || []).length > 0) {
        descDormitorio = subtotalDiarias * precos.desconto_canil;
        linhas.push({
          tipo: "desconto",
          descricao: "Desc. dormitório compartilhado (30%)",
          valor: -descDormitorio,
        });
        descontoTotal += descDormitorio;
      }

      let descLonga = 0;
      if (diarias > 15) {
        descLonga = (subtotalDiarias - descDormitorio) * precos.desconto_longa_estadia;
        linhas.push({
          tipo: "desconto",
          descricao: "Desc. longa estadia (3%)",
          valor: -descLonga,
        });
        descontoTotal += descLonga;
      }

      const totalHosp = subtotalDiarias + subtotalPernoite - descDormitorio - descLonga;
      totalCao += totalHosp;
      subtotalHospedagem += totalHosp;
    }

    if (cao.servicos?.banho) {
      const normalizedRaca = normalizeBreedName(cao.banho_raca || dog?.raca || "Outro") || "Outro";
      const valorBanho = precos.banho[normalizedRaca] || precos.banho.Outro;
      linhas.push({
        tipo: "banho",
        descricao: `Banho (${normalizedRaca})${cao.banho_do_pacote ? " - Pacote" : ""}`,
        valor: valorBanho,
      });
      totalCao += valorBanho;
      subtotalServicos += valorBanho;
    }

    if (cao.servicos?.tosa && cao.tosa_tipo) {
      let valorTosa = 0;
      let descTosa = "";

      if (cao.tosa_tipo === "higienica") {
        const sub = cao.tosa_subtipo_higienica || "pequeno_baixa";
        const subLabel = {
          pequeno_baixa: "Pequeno - Pelagem baixa",
          pequeno_alta: "Pequeno - Pelagem alta",
          medio_baixa: "Medio - Pelagem baixa",
          medio_alta: "Medio - Pelagem alta",
          grande_baixa: "Grande - Pelagem baixa",
          grande_alta: "Grande - Pelagem alta",
        }[sub] || sub;
        valorTosa = precos.tosa_higienica[sub] || 50;
        descTosa = `Tosa Higienica (${subLabel})`;
      } else if (cao.tosa_tipo === "geral") {
        const raca = normalizeBreedName(cao.banho_raca || dog?.raca || "Outro") || "Outro";
        valorTosa = precos.tosa_geral[raca] || precos.tosa_geral.Outro;
        descTosa = `Tosa Geral (${raca})`;
      } else if (cao.tosa_tipo === "detalhada") {
        const raca = normalizeBreedName(cao.banho_raca || dog?.raca || "Outro") || "Outro";
        valorTosa = precos.tosa_detalhada[raca] || precos.tosa_detalhada.Outro;
        descTosa = `Tosa Detalhada (${raca})`;
      }

      if (cao.tosa_do_pacote) descTosa += " - Pacote";
      linhas.push({ tipo: "tosa", descricao: descTosa, valor: valorTosa });
      totalCao += valorTosa;
      subtotalServicos += valorTosa;
    }

    if (cao.servicos?.transporte) {
      (cao.transporte_viagens || []).forEach((viagem, index) => {
        const km = parseFloat(viagem.km) || 0;
        if (km <= 0) return;
        const valor = km * precos.transporte_km;
        transporteLinhas.push({
          dog_nome: dog?.nome || "Cão",
          viagem_num: index + 1,
          km,
          valor,
          partida: viagem.partida,
          destino: viagem.destino,
        });
        subtotalTransporte += valor;
      });
    }

    if (totalCao > 0 || linhas.length > 0) {
      detalhes.push({
        dog_id: cao.dog_id,
        dog_nome: dog?.nome || "Cão",
        is_mensalista: cao.hosp_is_mensalista,
        linhas,
        total: totalCao,
      });
    }
  });

  const valorTotal = subtotalHospedagem + subtotalServicos + subtotalTransporte;
  if (detalhes.length === 0 && transporteLinhas.length === 0) return null;

  return {
    detalhes,
    transporte: transporteLinhas,
    subtotal_hospedagem: subtotalHospedagem,
    subtotal_servicos: subtotalServicos,
    subtotal_transporte: subtotalTransporte,
    desconto_total: descontoTotal,
    valor_total: valorTotal,
  };
}

export default function Orcamentos() {
  const location = useLocation();
  const openOrcamentoId = new URLSearchParams(location.search).get("orcamentoId") || "";
  const [dogs, setDogs] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [recurringPackages, setRecurringPackages] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);
  const [orcamentos, setOrcamentos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [precos, setPrecos] = useState(buildPricingConfig([], null));
  const [currentUser, setCurrentUser] = useState(null);
  const [prefillApplied, setPrefillApplied] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [prefillNotice, setPrefillNotice] = useState(null);
  const [budgetReplacementContext, setBudgetReplacementContext] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [etapa, setEtapa] = useState("cliente");
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [searchCliente, setSearchCliente] = useState("");
  const [caes, setCaes] = useState([createEmptyCao()]);
  const [observacoes, setObservacoes] = useState("");
  const [calculo, setCalculo] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [budgetWalletContext, setBudgetWalletContext] = useState(null);
  const [budgetWalletPreview, setBudgetWalletPreview] = useState(null);
  const [budgetWalletLoading, setBudgetWalletLoading] = useState(false);
  const [budgetWalletError, setBudgetWalletError] = useState("");
  const [useWalletBalance, setUseWalletBalance] = useState(false);
  const [walletUsageInput, setWalletUsageInput] = useState("");
  const [commissionFlags, setCommissionFlags] = useState({
    commissionEnabled: false,
  });
  const [sellerProviders, setSellerProviders] = useState([]);
  const [sellerSchedules, setSellerSchedules] = useState([]);
  const [selectedSellerId, setSelectedSellerId] = useState("");
  const [commissionPercentualInput, setCommissionPercentualInput] = useState("");
  const canRevealSensitiveData = useMemo(
    () => canViewSensitivePersonalData(currentUser),
    [currentUser],
  );

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (dogs.length > 0) {
      setCalculo(calcularOrcamento(caes, dogs, precos));
    }
  }, [caes, dogs, precos]);

  useEffect(() => {
    let cancelled = false;

    async function loadBudgetWalletContext() {
      if (!showModal || !currentUser?.empresa_id || !clienteSelecionado?.id) {
        if (!cancelled) {
          setBudgetWalletContext(null);
          setBudgetWalletPreview(null);
          setBudgetWalletError("");
          setUseWalletBalance(false);
          setWalletUsageInput("");
        }
        return;
      }

      setBudgetWalletLoading(true);
      setBudgetWalletError("");
      try {
        const context = await financeWalletBudgetReadContext({
          empresa_id: currentUser.empresa_id,
          carteira_id: clienteSelecionado.id,
        });

        if (cancelled) return;
        setBudgetWalletContext(context || null);

        const positiveBalance = Number(context?.saldo_positivo_disponivel || 0);
        if (positiveBalance <= 0) {
          setUseWalletBalance(false);
          setWalletUsageInput("");
        } else if (!walletUsageInput) {
          const suggestedAmount = calculo?.valor_total
            ? Math.min(positiveBalance, Number(calculo.valor_total || 0))
            : positiveBalance;
          setWalletUsageInput(String(suggestedAmount.toFixed(2)));
        }
      } catch (error) {
        if (cancelled) return;
        setBudgetWalletContext(null);
        setBudgetWalletPreview(null);
        setBudgetWalletError(error?.message || "Não foi possível carregar o saldo da carteira.");
      } finally {
        if (!cancelled) {
          setBudgetWalletLoading(false);
        }
      }
    }

    loadBudgetWalletContext();

    return () => {
      cancelled = true;
    };
  }, [showModal, currentUser?.empresa_id, clienteSelecionado?.id, calculo?.valor_total, walletUsageInput]);

  useEffect(() => {
    let cancelled = false;

    async function loadBudgetPreview() {
      if (
        !showModal
        || etapa !== "resumo"
        || !calculo
        || !budgetWalletContext?.carteira_conta_id
        || !budgetWalletContext?.chronological_consumption_enabled
      ) {
        if (!cancelled) {
          setBudgetWalletPreview(null);
        }
        return;
      }

      setBudgetWalletLoading(true);
      setBudgetWalletError("");
      try {
        const previewItems = buildBudgetPreviewItems({
          orcamento: {
            id: "orcamento_preview_draft",
            caes: JSON.parse(JSON.stringify(caes || [])),
            data_criacao: new Date().toISOString().slice(0, 10),
            data_validade: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          },
          dogs,
          precos,
          recurringPackages,
        });

        const positiveBalance = Number(budgetWalletContext?.saldo_positivo_disponivel || 0);
        const maxRequested = Math.min(positiveBalance, Number(calculo?.valor_total || 0));
        const requestedUsage = useWalletBalance
          ? Math.min(parseCurrencyInput(walletUsageInput), maxRequested)
          : 0;

        const preview = await financePreviewBudgetConsumption({
          carteira_conta_id: budgetWalletContext.carteira_conta_id,
          valor_orcamento_total: Number(calculo.valor_total || 0),
          valor_saldo_solicitado: requestedUsage,
          preview_items: previewItems,
        });

        if (cancelled) return;
        setBudgetWalletPreview(preview || null);
      } catch (error) {
        if (cancelled) return;
        setBudgetWalletPreview(null);
        setBudgetWalletError(error?.message || "Não foi possível simular o consumo cronológico.");
      } finally {
        if (!cancelled) {
          setBudgetWalletLoading(false);
        }
      }
    }

    loadBudgetPreview();

    return () => {
      cancelled = true;
    };
  }, [
    showModal,
    etapa,
    calculo,
    budgetWalletContext?.carteira_conta_id,
    budgetWalletContext?.chronological_consumption_enabled,
    useWalletBalance,
    walletUsageInput,
    dogs,
    precos,
    recurringPackages,
    caes,
    budgetWalletContext?.saldo_positivo_disponivel,
  ]);

  useEffect(() => {
    if (isLoading || prefillApplied || !dogs.length) return undefined;

    let cancelled = false;

    async function applyPrefill() {
      const params = new URLSearchParams(location.search);
      const prefillKey = params.get("prefillKey");
      if (prefillKey) {
        const storageKey = `${ORCAMENTO_PREFILL_STORAGE_PREFIX}${prefillKey}`;
        const rawPayload = sessionStorage.getItem(storageKey);
        if (!rawPayload) {
          setPrefillApplied(true);
          return;
        }

        try {
          const payload = JSON.parse(rawPayload);
          const appointments = Array.isArray(payload.appointments) ? payload.appointments : [];
          const prefilledCaes = appointments
            .map((appointment) => {
              const dog = dogs.find((item) => item.id === appointment.dog_id);
              return buildPrefilledCaoFromAppointment(appointment, dog);
            })
            .filter((cao) => cao.dog_id && Object.values(cao.servicos || {}).some(Boolean));

          if (!prefilledCaes.length) {
            setPrefillApplied(true);
            return;
          }

          const selectedDogIds = [...new Set(prefilledCaes.map((cao) => cao.dog_id).filter(Boolean))];
          const selectedCarteira = (payload.cliente_id
            ? carteiras.find((cliente) => cliente.id === payload.cliente_id)
            : null) || getFirstLinkedCarteiraForDogIds(carteiras, selectedDogIds);

          if (cancelled) return;

          sessionStorage.removeItem(storageKey);
          setBudgetReplacementContext(
            payload.type === "used_appointments_from_deleted_budget" && payload.source_orcamento_id
              ? {
                  sourceBudgetId: payload.source_orcamento_id,
                  usedAppointmentIds: appointments.map((appointment) => appointment?.id).filter(Boolean),
                }
              : null,
          );
          setClienteSelecionado(selectedCarteira);
          setCaes(prefilledCaes.map((cao) =>
            normalizeBudgetCaoWithRecurringContext(
              cao,
              buildRecurringDogBudgetContext(cao?.dog_id, recurringPackages, appointments, checkins),
            ),
          ));
          setObservacoes(normalizeLegacyUtf8Text(payload.observacoes || ""));
          setPrefillNotice({
            title: "Orçamento dos atendimentos utilizados",
            message: `${prefilledCaes.length} atendimento(s) já registrado(s) foram carregados. Revise responsável financeiro, datas e valores antes de enviar.`,
          });
          setEtapa("caes");
          setShowModal(true);
          setPrefillApplied(true);
          return;
        } catch (error) {
          console.error("Erro ao aplicar pré-preenchimento do orçamento:", error);
          sessionStorage.removeItem(storageKey);
          setPrefillApplied(true);
          return;
        }
      }

      const dogReference = params.get("dogId");
      const service = params.get("service");
      const date = params.get("date") || new Date().toISOString().slice(0, 10);
      const appointmentId = params.get("appointmentId");
      if (!dogReference || !service) return;

      const selectedDog = findEntityByReference(dogs, dogReference);
      const resolvedDogId = selectedDog?.id || "";
      if (!resolvedDogId) return;

      const selectedCarteira = carteiras.find((cliente) =>
        [1, 2, 3, 4, 5, 6, 7, 8].some((index) => cliente[`dog_id_${index}`] === resolvedDogId)
      ) || null;

      const prefilledCao = {
        ...createEmptyCao(),
        dog_id: resolvedDogId,
        servicos: {
          ...createEmptyCao().servicos,
        },
      };

      if (service === "banho") {
        prefilledCao.servicos.banho = true;
        prefilledCao.banho_data = date;
        prefilledCao.banho_horario = "09:00";
        prefilledCao.banho_horario_inicio = "09:00";
        prefilledCao.banho_horario_saida = "10:00";
      } else if (service === "banho_tosa") {
        prefilledCao.servicos.banho = true;
        prefilledCao.servicos.tosa = true;
        prefilledCao.banho_data = date;
        prefilledCao.banho_horario = "09:00";
        prefilledCao.banho_horario_inicio = "09:00";
        prefilledCao.banho_horario_saida = "10:00";
        prefilledCao.tosa_data = date;
        prefilledCao.tosa_horario_entrada = "09:00";
        prefilledCao.tosa_horario_saida = "10:00";
      } else if (service === "tosa") {
        prefilledCao.servicos.tosa = true;
        prefilledCao.tosa_data = date;
        prefilledCao.tosa_horario_entrada = "09:00";
        prefilledCao.tosa_horario_saida = "10:00";
      } else if (service === "hospedagem") {
        prefilledCao.servicos.hospedagem = true;
        prefilledCao.hosp_data_entrada = date;
        prefilledCao.hosp_horario_entrada = "09:00";
        prefilledCao.hosp_data_saida = date;
        prefilledCao.hosp_horario_saida = "18:00";
      } else if (service === "day_care") {
        prefilledCao.servicos.day_care = true;
        prefilledCao.day_care_data = date;
        prefilledCao.day_care_horario_entrada = "08:00";
        prefilledCao.day_care_horario_saida = "18:00";
      } else if (service === "pernoite") {
        prefilledCao.servicos.hospedagem = true;
        prefilledCao.hosp_data_entrada = date;
        prefilledCao.hosp_horario_entrada = "19:00";
        prefilledCao.hosp_data_saida = addDays(date, 1);
        prefilledCao.hosp_horario_saida = "11:59";
        prefilledCao.hosp_tem_daycare_ativo = true;
        prefilledCao.hosp_datas_daycare = [date];
        prefilledCao.hosp_origem_pernoite_daycare = true;
        prefilledCao.hosp_pernoite_appointment_id = appointmentId || "";
      } else if (service === "adaptacao") {
        prefilledCao.servicos.adaptacao = true;
        prefilledCao.adaptacao_data = date;
        prefilledCao.adaptacao_horario_entrada = "09:00";
        prefilledCao.adaptacao_horario_saida = "10:00";
      }

      let nextPrefillNotice = null;
      const buildManualPrefillNotice = (appointment) => {
        return {
          title: "Agendamento manual",
          message: getManualAppointmentNotice(appointment),
        };
      };

      if (appointmentId) {
        try {
          const appointmentRows = await Appointment.filter({ id: appointmentId }, "-created_date", 1);
          const appointment = Array.isArray(appointmentRows) ? appointmentRows[0] : appointmentRows;
          const metadata = getAppointmentMeta(appointment);
          const shouldShowNotice = appointment
            ? appointment.source_type === "manual_registrador"
              && (appointment.charge_type === "pendente_comercial" || metadata.commercial_review_pending === true)
            : true;

          if (shouldShowNotice) {
            nextPrefillNotice = buildManualPrefillNotice(appointment);
          }
        } catch (error) {
          console.error("Erro ao verificar a origem do agendamento:", error);
          nextPrefillNotice = buildManualPrefillNotice(null);
        }
      } else {
        nextPrefillNotice = buildManualPrefillNotice(null);
      }

      if (cancelled) return;

      setClienteSelecionado(selectedCarteira);
      setCaes([
        normalizeBudgetCaoWithRecurringContext(
          prefilledCao,
          buildRecurringDogBudgetContext(prefilledCao?.dog_id, recurringPackages, appointments, checkins),
        ),
      ]);
      setObservacoes("");
      setPrefillNotice(nextPrefillNotice);
      setEtapa("caes");
      setShowModal(true);
      setPrefillApplied(true);
    }

    applyPrefill();

    return () => {
      cancelled = true;
    };
  }, [appointments, carteiras, checkins, dogs, isLoading, location.search, prefillApplied, recurringPackages]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [dogsData, carteirasData, appointmentsData, checkinsData, recurringPackagesData, responsaveisData, orcamentosData, precosData, userData, appConfigData, providersData, schedulesData] = await Promise.all([
        Dog.list("-created_date", 500),
        Carteira.list("-created_date", 500),
        Appointment.listAll ? Appointment.listAll("-created_date", 2000, 10000) : Appointment.list("-created_date", 2000),
        Checkin.listAll ? Checkin.listAll("-created_date", 2000, 10000) : Checkin.list("-created_date", 2000),
        RecurringPackage.list("-created_at", 1000),
        Responsavel.list("-created_date", 500),
        Orcamento.list("-created_date", 100),
        TabelaPrecos.list("-created_date", 1000),
        User.me(),
        AppConfig.listAll("key", 1000, 5000).catch(() => []),
        ServiceProvider.listAll ? ServiceProvider.listAll("nome", 1000, 5000) : ServiceProvider.list("nome", 1000),
        ServiceProviderSchedule.listAll ? ServiceProviderSchedule.listAll("-created_date", 1000, 5000) : ServiceProviderSchedule.list("-created_date", 1000),
      ]);

      setDogs((dogsData || []).filter((dog) => dog.ativo !== false));
      setCarteiras((carteirasData || []).filter((cliente) => cliente.ativo !== false));
      setAppointments(appointmentsData || []);
      setCheckins(checkinsData || []);
      setRecurringPackages(recurringPackagesData || []);
      setResponsaveis((responsaveisData || []).filter((responsavel) => responsavel.ativo !== false));
      setOrcamentos(orcamentosData || []);
      setCurrentUser(userData || null);
      setPrecos(buildPricingConfig(precosData || [], userData?.empresa_id || null));
      setSellerProviders((providersData || []).filter((provider) => provider?.ativo !== false));
      setSellerSchedules((schedulesData || []).filter((schedule) => schedule?.ativo !== false));
      setCommissionFlags({
        commissionEnabled: getFinanceFeatureFlagValue(appConfigData || [], FINANCE_FEATURE_FLAGS.commissionEnabled, userData?.empresa_id || null),
      });
    } catch (error) {
      console.error("Erro ao carregar orçamentos:", error);
    }
    setIsLoading(false);
  }

  function resetForm() {
    setEtapa("cliente");
    setClienteSelecionado(null);
    setSearchCliente("");
    setCaes([createEmptyCao()]);
    setObservacoes("");
    setCalculo(null);
    setPrefillNotice(null);
    setBudgetWalletContext(null);
    setBudgetWalletPreview(null);
    setBudgetWalletError("");
    setUseWalletBalance(false);
    setWalletUsageInput("");
    setSelectedSellerId("");
    setCommissionPercentualInput("");
    setBudgetReplacementContext(null);
  }

  function getCaesDoCliente() {
    if (!clienteSelecionado) return dogs;
    const dogIds = getLinkedDogIds(clienteSelecionado);
    if (dogIds.length === 0) return dogs;
    return dogs.filter((dog) => dogIds.includes(dog.id));
  }

  const searchTerm = normalizeSearchValue(searchCliente);

  const clientesFiltrados = carteiras
    .map((cliente) => {
      const dogIds = getLinkedDogIds(cliente);
      const dogsDoCliente = dogs.filter((dog) => dogIds.includes(dog.id));
      const responsaveisDoCliente = responsaveis.filter((responsavel) =>
        getLinkedDogIds(responsavel).some((dogId) => dogIds.includes(dogId))
      );

      if (!searchTerm) {
        return {
          cliente,
          dogsDoCliente,
          responsaveisDoCliente,
          destaqueBusca: "",
          prioridade: 0,
        };
      }

      const carteiraMatched = [
        cliente.nome_razao_social,
        cliente.cpf_cnpj,
        cliente.celular,
        cliente.email,
      ].some((value) => normalizeSearchValue(value).includes(searchTerm));

      const matchedDogs = dogsDoCliente.filter((dog) =>
        [dog.nome, dog.apelido, dog.raca].some((value) => normalizeSearchValue(value).includes(searchTerm))
      );

      const matchedResponsaveis = responsaveisDoCliente.filter((responsavel) =>
        [responsavel.nome_completo, responsavel.cpf, responsavel.celular, responsavel.email]
          .some((value) => normalizeSearchValue(value).includes(searchTerm))
      );

      if (!carteiraMatched && matchedDogs.length === 0 && matchedResponsaveis.length === 0) {
        return null;
      }

      const destaqueBusca = [
        carteiraMatched ? "Responsável financeiro" : "",
        matchedDogs.length ? `Cão: ${matchedDogs.map((dog) => dog.nome).join(", ")}` : "",
        matchedResponsaveis.length ? `Responsável: ${matchedResponsaveis.map((responsavel) => responsavel.nome_completo).join(", ")}` : "",
      ].filter(Boolean).join(" | ");

      const prioridade = carteiraMatched ? 0 : matchedDogs.length ? 1 : 2;

      return {
        cliente,
        dogsDoCliente,
        responsaveisDoCliente,
        destaqueBusca,
        prioridade,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.prioridade !== right.prioridade) return left.prioridade - right.prioridade;
      return left.cliente.nome_razao_social.localeCompare(right.cliente.nome_razao_social);
    });

  const exigeConfirmacaoDestinatario = Boolean(searchTerm) && clientesFiltrados.length > 1;
  const selectedDogIds = [...new Set(caes.map((cao) => cao?.dog_id).filter(Boolean))];
  const eligibleCarteirasForSelectedDogs = selectedDogIds.length === 0
    ? []
    : carteiras.filter((cliente) => getLinkedDogIds(cliente).some((dogId) => selectedDogIds.includes(dogId)));
  const isClienteSelecionadoElegivel = !clienteSelecionado
    || selectedDogIds.length === 0
    || eligibleCarteirasForSelectedDogs.some((cliente) => cliente.id === clienteSelecionado.id);

  const sellerOptions = useMemo(() => {
    const eligibleProviderIds = new Set(
      (sellerSchedules || [])
        .filter((schedule) => ["vendedor", "comercial", "representante_comercial"].includes(String(schedule?.funcao || "").trim().toLowerCase()))
        .map((schedule) => schedule?.serviceprovider_id)
        .filter(Boolean),
    );

    return (sellerProviders || [])
      .filter((provider) => eligibleProviderIds.has(provider.id))
      .map((provider) => ({
        id: provider.id,
        nome: provider.nome || provider.full_name || provider.nome_completo || provider.id,
      }))
      .sort((left, right) => String(left.nome).localeCompare(String(right.nome), "pt-BR"));
  }, [sellerProviders, sellerSchedules]);

  const recurringContextByDogId = useMemo(() => {
    return (dogs || []).reduce((accumulator, dog) => {
      accumulator[dog.id] = buildRecurringDogBudgetContext(
        dog.id,
        recurringPackages,
        appointments,
        checkins,
      );
      return accumulator;
    }, {});
  }, [appointments, checkins, dogs, recurringPackages]);

  function getRecurringValidationError() {
    for (const cao of caes || []) {
      if (!cao?.dog_id) continue;
      const recurringContext = recurringContextByDogId[cao.dog_id] || null;
      const selectedBathOption = (recurringContext?.pendingBathOptions || []).find(
        (item) => item.id === cao.banho_reuse_appointment_id,
      ) || null;

      if (selectedBathOption?.has_grooming && cao.banho_grooming_resolution === "move" && !cao.banho_grooming_target_appointment_id) {
        return "Selecione qual outro banho do plano vai receber a tosa remanejada antes de continuar.";
      }
    }

    return "";
  }

  function getClienteSelecionadoError() {
    if (!clienteSelecionado || selectedDogIds.length === 0 || isClienteSelecionadoElegivel) {
      return "";
    }

    return "O responsável financeiro selecionado precisa estar vinculado a pelo menos um dos cães deste orçamento.";
  }

  function canAdvanceToResumo() {
    const validationError = getClienteSelecionadoError();
    if (validationError) {
      alert(validationError);
      return false;
    }

    const recurringValidationError = getRecurringValidationError();
    if (recurringValidationError) {
      alert(recurringValidationError);
      return false;
    }

    return true;
  }

  const positiveWalletBalance = Number(budgetWalletContext?.saldo_positivo_disponivel || 0);
  const maxWalletUsage = Math.min(positiveWalletBalance, Number(calculo?.valor_total || 0));
  const normalizedWalletUsage = useWalletBalance
    ? Math.min(parseCurrencyInput(walletUsageInput), maxWalletUsage)
    : 0;

  function addCao() {
    setCaes((prev) => [...prev, createEmptyCao()]);
  }

  function updateCao(index, data) {
    setCaes((prev) => prev.map((cao, currentIndex) => {
      if (currentIndex !== index) return cao;
      const recurringContext = buildRecurringDogBudgetContext(
        data?.dog_id || "",
        recurringPackages,
        appointments,
        checkins,
      );
      return normalizeBudgetCaoWithRecurringContext(data, recurringContext);
    }));
  }

  function removeCao(index) {
    setCaes((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleSave(status = "rascunho") {
    if (!calculo) {
      alert("Preencha os dados do orçamento");
      return;
    }

    const validationError = getClienteSelecionadoError();
    if (validationError) {
      alert(validationError);
      return;
    }

    const recurringValidationError = getRecurringValidationError();
    if (recurringValidationError) {
      alert(recurringValidationError);
      return;
    }

    if (commissionFlags.commissionEnabled) {
      if (!selectedSellerId) {
        alert("Selecione o vendedor responsável antes de salvar o orçamento.");
        return;
      }
      const commissionPercentual = Number.parseFloat(String(commissionPercentualInput || "0").replace(",", "."));
      if (!Number.isFinite(commissionPercentual) || commissionPercentual < 0) {
        alert("Informe um percentual de comissão válido.");
        return;
      }
    }

    setIsSaving(true);
    try {
      const createdOrcamento = await Orcamento.create({
        empresa_id: currentUser?.empresa_id || null,
        cliente_id: clienteSelecionado?.id || null,
        data_criacao: new Date().toISOString().split("T")[0],
        data_validade: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        caes: JSON.parse(JSON.stringify(caes)),
        subtotal_hospedagem: calculo.subtotal_hospedagem,
        subtotal_servicos: calculo.subtotal_servicos,
        subtotal_transporte: calculo.subtotal_transporte,
        desconto_total: calculo.desconto_total,
        valor_total: calculo.valor_total,
        status,
        observacoes: normalizeLegacyUtf8Text(observacoes),
        vendedor_user_id: commissionFlags.commissionEnabled ? selectedSellerId || null : null,
        commission_percentual: commissionFlags.commissionEnabled
          ? (Number.parseFloat(String(commissionPercentualInput || "0").replace(",", ".")) || 0)
          : 0,
      });

      const linkedExternalAppointmentIds = (caes || [])
        .map((cao) => cao?.hosp_pernoite_appointment_id)
        .filter(Boolean);

      if (createdOrcamento?.id && linkedExternalAppointmentIds.length > 0) {
        await Promise.all(linkedExternalAppointmentIds.map(async (appointmentId) => {
          const appointmentRows = await Appointment.filter({ id: appointmentId }, "-created_date", 1);
          const appointment = Array.isArray(appointmentRows) ? appointmentRows[0] : appointmentRows;
          const metadata = getAppointmentMeta(appointment);
          await Appointment.update(appointmentId, {
            orcamento_id: createdOrcamento.id,
            charge_type: status === "aprovado" ? "orcamento" : "pendente_comercial",
            metadata: {
              ...metadata,
              commercial_review_pending: false,
              overnight_budget_pending: false,
              overnight_orcamento_id: createdOrcamento.id,
            },
          });
        }));
      }

      if (createdOrcamento?.id && budgetReplacementContext?.sourceBudgetId) {
        try {
          await replaceBudgetForUsedAppointments({
            sourceBudgetId: budgetReplacementContext.sourceBudgetId,
            targetBudgetId: createdOrcamento.id,
            usedAppointmentIds: budgetReplacementContext.usedAppointmentIds,
          });
        } catch (transferError) {
          await Orcamento.delete(createdOrcamento.id).catch(() => null);
          throw transferError;
        }
      }

      await loadData();
      setHistoryRefreshKey((current) => current + 1);
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error("Erro ao salvar orçamento:", error);
      alert(error?.message || "Erro ao salvar orçamento.");
    }
    setIsSaving(false);
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-2.5 sm:p-6">
      <div className="mx-auto max-w-[1480px]">
        <div className="mb-4 flex flex-col gap-3 border-b border-slate-200 pb-5 sm:mb-6 sm:gap-4 sm:pb-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-600 sm:text-xs">
              Comercial / Orçamentos
            </p>
            <h1 className="font-brand text-2xl font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl">Orçamentos</h1>
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-500 sm:text-[15px]">
              Crie propostas, acompanhe aprovações e consulte o histórico comercial da unidade em uma única visão.
            </p>
          </div>
          <div className="flex w-full items-center gap-2 lg:w-auto lg:shrink-0">
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm sm:flex">
              <FileText className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-semibold text-slate-900">{orcamentos.length}</span>
              <span className="text-xs text-slate-500">orçamento{orcamentos.length === 1 ? "" : "s"}</span>
            </div>
            <Button onClick={() => { resetForm(); setShowModal(true); }} className="h-10 flex-1 rounded-full bg-blue-600 px-4 text-sm text-white shadow-sm hover:bg-blue-700 sm:flex-none">
              <Plus className="mr-2 h-4 w-4" />
              Novo Orçamento
            </Button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_6px_20px_rgba(15,23,42,0.04)] sm:mb-6 lg:grid-cols-4 lg:divide-x lg:divide-slate-100">
          {[
            { label: "Total", val: orcamentos.length, color: "text-blue-700", iconBg: "bg-blue-50" },
            { label: "Aprovados", val: orcamentos.filter((item) => item.status === "aprovado").length, color: "text-emerald-700", iconBg: "bg-emerald-50" },
            { label: "Enviados", val: orcamentos.filter((item) => item.status === "enviado").length, color: "text-amber-700", iconBg: "bg-amber-50" },
            { label: "Rascunhos", val: orcamentos.filter((item) => item.status === "rascunho").length, color: "text-slate-700", iconBg: "bg-slate-100" },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-3 border-b border-slate-100 p-3.5 last:border-b-0 even:border-l even:border-slate-100 sm:p-4 lg:border-b-0 lg:border-l-0">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${stat.iconBg} ${stat.color}`}>
                <FileText className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{stat.label}</p>
                <p className={`mt-0.5 text-xl font-bold tracking-tight ${stat.color}`}>{stat.val}</p>
              </div>
            </div>
          ))}
        </div>

        <OrcamentosHistoricoPanel
          embedded
          refreshKey={historyRefreshKey}
          openOrcamentoId={openOrcamentoId}
          onChange={loadData}
        />
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="flex max-h-[95vh] w-[98vw] max-w-[1100px] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-blue-600" />
              {etapa === "cliente" && "Novo Orçamento - Selecione o Cliente"}
              {etapa === "caes" && "Novo Orçamento - Serviços por Cão"}
              {etapa === "resumo" && "Novo Orçamento - Revisão Final"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Fluxo de criação de orçamento com busca ampla por destinatário financeiro, responsável e cão.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 border-b border-gray-100 px-1 py-2">
            {[
              { id: "cliente", label: "1. Cliente" },
              { id: "caes", label: "2. Serviços" },
              { id: "resumo", label: "3. Revisão" },
            ].map((step, index) => (
              <React.Fragment key={step.id}>
                <div className={`rounded-full px-3 py-1 text-xs font-medium ${etapa === step.id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"}`}>
                  {step.label}
                </div>
                {index < 2 && <div className="h-px flex-1 bg-gray-200" />}
              </React.Fragment>
            ))}
          </div>

          {prefillNotice ? (
            <div className="mx-1 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">{prefillNotice.title}</p>
                  <p className="mt-1 text-sm text-amber-800">{prefillNotice.message}</p>
                </div>
              </div>
            </div>
          ) : null}

          {etapa === "cliente" && (
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <p className="text-sm text-gray-600">Selecione o cliente ou pule para criar orçamento avulso.</p>

              <SearchFiltersToolbar
                searchTerm={searchCliente}
                onSearchChange={setSearchCliente}
                searchPlaceholder="Buscar por responsável financeiro, responsável, cão, CPF/CNPJ ou celular..."
                hasActiveFilters={Boolean(searchCliente)}
                onClear={() => setSearchCliente("")}
                searchInputClassName="h-9 text-[13px] sm:h-11 sm:text-sm"
              />

              {exigeConfirmacaoDestinatario && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm text-amber-700">
                    Encontramos mais de um destinatário financeiro para esta busca. Confirme para quem o orçamento será destinado.
                  </p>
                </div>
              )}

              <div className="max-h-[45vh] space-y-2 overflow-y-auto">
                {clientesFiltrados.slice(0, 20).map((resultado) => {
                  const { cliente, dogsDoCliente, responsaveisDoCliente, destaqueBusca } = resultado;
                  const numCaes = dogsDoCliente.length;
                  const selected = clienteSelecionado?.id === cliente.id;

                  return (
                    <div
                      key={cliente.id}
                      onClick={() => setClienteSelecionado((prev) => prev?.id === cliente.id ? null : cliente)}
                      className={`cursor-pointer rounded-lg border-2 p-4 transition-all ${selected ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{cliente.nome_razao_social}</p>
                          {destaqueBusca ? (
                            <p className="mt-1 text-xs text-blue-700">{destaqueBusca}</p>
                          ) : null}
                          {dogsDoCliente.length > 0 ?(
                            <p className="mt-1 text-xs text-gray-500">
                              Cães: {dogsDoCliente.map((dog) => dog.nome).join(", ")}
                            </p>
                          ) : null}
                          {responsaveisDoCliente.length > 0 ?(
                            <p className="mt-1 text-xs text-gray-500">
                              Responsáveis: {responsaveisDoCliente.map((responsavel) => responsavel.nome_completo).join(", ")}
                            </p>
                          ) : null}
                          <p className="text-sm text-gray-500">
                            {maskSensitiveValue(cliente.celular || "", maskPhone, canRevealSensitiveData) || "Telefone não informado"} • {maskSensitiveValue(cliente.cpf_cnpj || "", maskCpfCnpj, canRevealSensitiveData) || "CPF/CNPJ não informado"}
                          </p>
                        </div>
                        <Badge variant="outline">{numCaes} cão(es)</Badge>
                      </div>
                    </div>
                  );
                })}
                {clientesFiltrados.length === 0 && (
                  <p className="py-8 text-center text-gray-500">Nenhum cliente encontrado</p>
                )}
              </div>

              {clienteSelecionado && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-sm text-green-700">
                    <strong>Selecionado:</strong> {clienteSelecionado.nome_razao_social}
                  </p>
                </div>
              )}
            </div>
          )}

          {etapa === "caes" && (
            <div className="flex-1 overflow-y-auto">
              <div className="grid h-full grid-cols-1 gap-0 lg:grid-cols-3">
                <div className="space-y-4 overflow-y-auto p-4 lg:col-span-2">
                  {clienteSelecionado && (
                    <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <DogIcon className="h-4 w-4 text-blue-600" />
                      <p className="text-sm text-blue-700">
                        Cliente: <strong>{clienteSelecionado.nome_razao_social}</strong>
                      </p>
                    </div>
                  )}

                  {getClienteSelecionadoError() ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-sm text-red-700">{getClienteSelecionadoError()}</p>
                    </div>
                  ) : null}

                  {caes.map((cao, index) => (
                    <OrcamentoCaoForm
                      key={index}
                      cao={cao}
                      index={index}
                      allCaes={caes}
                      dogs={getCaesDoCliente()}
                      precos={precos}
                      recurringContext={recurringContextByDogId[cao.dog_id] || null}
                      onUpdate={updateCao}
                      onRemove={removeCao}
                      canRemove={caes.length > 1}
                    />
                  ))}

                  <Button variant="outline" onClick={addCao} className="h-9 w-full rounded-xl border-dashed text-sm sm:h-10 sm:rounded-2xl">
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Outro Cão
                  </Button>

                  <Card className="border-gray-200 bg-white">
                    <CardContent className="p-3 sm:p-4">
                      <Label className="text-sm font-medium">Observações Gerais</Label>
                      <Textarea
                        value={observacoes}
                        onChange={(event) => setObservacoes(event.target.value)}
                        placeholder="Informações adicionais sobre o orçamento..."
                        rows={2}
                        className="mt-2"
                      />
                    </CardContent>
                  </Card>
                </div>

                <div className="overflow-y-auto border-l border-gray-100 bg-gray-50 p-4 lg:col-span-1">
                  <OrcamentoResumo calculo={calculo} caes={caes} dogs={dogs} />
                </div>
              </div>
            </div>
          )}

          {etapa === "resumo" && (
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {clienteSelecionado && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="mb-1 text-sm font-medium text-gray-600">Cliente</p>
                  <p className="font-semibold text-gray-900">{clienteSelecionado.nome_razao_social}</p>
                  <p className="text-sm text-gray-500">{maskSensitiveValue(clienteSelecionado.celular || "", maskPhone, canRevealSensitiveData) || "Telefone não informado"}</p>
                </div>
              )}

              {budgetWalletContext?.wallet_budget_balance_enabled && clienteSelecionado && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Carteira vinculada</p>
                      <p className="mt-1 text-lg font-semibold text-emerald-950">
                        Saldo atual: {formatCurrency(Number(budgetWalletContext?.saldo_atual || 0))}
                      </p>
                      <p className="mt-1 text-sm text-emerald-800">
                        Esta leitura é controlada por flag e não substitui o pagamento legado nesta sprint.
                      </p>
                    </div>
                    {budgetWalletLoading ? (
                      <Badge className="bg-white text-emerald-700">Carregando carteira...</Badge>
                    ) : null}
                  </div>

                  {positiveWalletBalance > 0 ? (
                    <div className="mt-4 space-y-3 rounded-xl border border-emerald-100 bg-white/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">Utilizar saldo?</p>
                          <p className="text-xs text-slate-500">
                            Disponível nesta fase para simulação controlada do orçamento.
                          </p>
                        </div>
                        <Switch checked={useWalletBalance} onCheckedChange={setUseWalletBalance} />
                      </div>

                      {useWalletBalance ? (
                        <div className="space-y-2">
                          <Label htmlFor="wallet-usage-input">Valor a simular com saldo da carteira</Label>
                          <Input
                            id="wallet-usage-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={walletUsageInput}
                            onChange={(event) => setWalletUsageInput(event.target.value)}
                          />
                          <p className="text-xs text-slate-500">
                            Limite desta fase: até {formatCurrency(maxWalletUsage)} entre saldo disponível e total em aberto do orçamento.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      Esta carteira não possui saldo positivo disponível para simulação de uso no orçamento.
                    </div>
                  )}
                </div>
              )}

              <OrcamentoResumo calculo={calculo} caes={caes} dogs={dogs} />

              {budgetWalletContext?.chronological_consumption_enabled && budgetWalletPreview ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Simulação cronológica</p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">Prévia do consumo da carteira</h3>
                    </div>
                    <Badge className={budgetWalletPreview.requires_authorization ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>
                      {budgetWalletPreview.requires_authorization ? "Exigirá autorização" : "Cobertura simulada"}
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Saldo solicitado</p>
                      <p className="mt-1 font-semibold text-slate-900">{formatCurrency(normalizedWalletUsage)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Saldo aplicado</p>
                      <p className="mt-1 font-semibold text-slate-900">{formatCurrency(budgetWalletPreview.valor_saldo_aplicado)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Orçamento coberto</p>
                      <p className="mt-1 font-semibold text-emerald-700">{formatCurrency(budgetWalletPreview.valor_orcamento_coberto)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Saldo projetado</p>
                      <p className="mt-1 font-semibold text-slate-900">{formatCurrency(budgetWalletPreview.projected_balance_after_wallet_usage)}</p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                    {budgetWalletPreview.requires_authorization ? (
                      <>A simulação ainda deixaria {formatCurrency(budgetWalletPreview.valor_orcamento_em_aberto)} em aberto. A aprovação financeira controlada será tratada no fluxo de autorização do orçamento.</>
                    ) : (
                      <>A carteira cobriria integralmente o valor simulado desta etapa sem exigir autorização adicional.</>
                    )}
                  </div>
                </div>
              ) : null}

              {budgetWalletError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {budgetWalletError}
                </div>
              ) : null}

              {commissionFlags.commissionEnabled ? (
                <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Vendedor responsável *</Label>
                      <Select value={selectedSellerId || "__empty__"} onValueChange={(value) => setSelectedSellerId(value === "__empty__" ? "" : value)}>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Selecione o vendedor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__empty__">Selecionar</SelectItem>
                          {sellerOptions.map((seller) => (
                            <SelectItem key={seller.id} value={seller.id}>
                              {seller.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-2 text-xs text-fuchsia-800">
                        Comissão controlada da Sprint 7: só gera evento quando a obrigação financeira ficar quitada.
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="orcamento-commission-percent">Percentual de comissão (%)</Label>
                      <Input
                        id="orcamento-commission-percent"
                        className="mt-2"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={commissionPercentualInput}
                        onChange={(event) => setCommissionPercentualInput(event.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {observacoes && (
                <div className="rounded-lg border-l-4 border-yellow-400 bg-yellow-50 p-3">
                  <p className="mb-1 text-xs font-semibold text-yellow-700">Observações</p>
                  <p className="text-sm text-gray-700">{observacoes}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 border-t pt-4">
            {etapa === "cliente" && (
              <>
                <Button variant="outline" onClick={() => setShowModal(false)} className="w-full sm:w-auto">Cancelar</Button>
                <Button variant="outline" onClick={() => setEtapa("caes")} className="w-full sm:w-auto">Pular (sem cliente)</Button>
                <Button onClick={() => setEtapa("caes")} className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto">
                  {clienteSelecionado ? "Continuar" : "Continuar sem cliente"}
                </Button>
              </>
            )}
            {etapa === "caes" && (
              <>
                <Button variant="outline" onClick={() => setEtapa("cliente")} className="w-full sm:w-auto">Voltar</Button>
                <Button
                  onClick={() => {
                    if (canAdvanceToResumo()) {
                      setEtapa("resumo");
                    }
                  }}
                  disabled={!calculo}
                  className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto"
                >
                  Ver Resumo
                </Button>
              </>
            )}
            {etapa === "resumo" && (
              <>
                <Button variant="outline" onClick={() => setEtapa("caes")} className="w-full sm:w-auto">Voltar</Button>
                <Button variant="outline" onClick={() => handleSave("rascunho")} disabled={isSaving || !calculo} className="w-full sm:w-auto">
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Rascunho
                </Button>
                <Button onClick={() => handleSave("enviado")} disabled={isSaving || !calculo} className="w-full bg-green-600 text-white hover:bg-green-700 sm:w-auto">
                  <Send className="mr-2 h-4 w-4" />
                  {isSaving ? "Salvando..." : "Enviar Orçamento"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
