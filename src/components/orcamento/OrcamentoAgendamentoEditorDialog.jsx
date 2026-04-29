import React, { useEffect, useMemo, useState } from "react";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Appointment, Checkin, Orcamento } from "@/api/entities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import OrcamentoResumo from "@/components/orcamento/OrcamentoResumo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerInput, TimePickerInput } from "@/components/common/DateTimeInputs";
import {
  buildAppointmentsFromOrcamento,
  buildDogOwnerIndex,
  getAppointmentDateKey,
  getAppointmentMeta,
  getAppointmentTimeValue,
  getDayCareStandaloneValue,
  getServiceLabel,
  normalizeBreedName,
} from "@/lib/attendance";
import {
  ArrowLeft,
  Bath,
  BedDouble,
  CalendarDays,
  CheckCircle2,
  Dog,
  FileText,
  Save,
  Scissors,
  ShieldAlert,
  Truck,
  Users,
} from "lucide-react";

const EMPTY_SERVICOS = {
  day_care: false,
  hospedagem: false,
  adaptacao: false,
  banho: false,
  tosa: false,
  transporte: false,
};

const EMPTY_CAO = {
  dog_id: "",
  servicos: { ...EMPTY_SERVICOS },
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
  hosp_dormitorio_compartilhado: false,
  "hosp_dormitÃƒÂ³rio_compartilhado": false,
  hosp_dormitorio_com: [],
  "hosp_dormitÃƒÂ³rio_com": [],
  hosp_tem_daycare_ativo: false,
  hosp_datas_daycare: [],
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
  tosa_data: "",
  tosa_tipo: "",
  tosa_subtipo_higienica: "",
  tosa_plano_ativo: false,
  tosa_do_pacote: false,
  tosa_horario_entrada: "",
  tosa_horario_saida: "",
  tosa_obs: "",
  transporte_plano_ativo: false,
  transporte_do_pacote: false,
  transporte_viagens: [{ partida: "", destino: "", data: "", horario: "", horario_fim: "", km: "", observacao: "" }],
};

const EDIT_STEPS = [
  { id: "responsaveis", label: "ResponsÃ¡veis", icon: Users },
  { id: "caes", label: "CÃ£es", icon: Dog },
  { id: "periodo", label: "PerÃ­odo e detalhes", icon: CalendarDays },
];

const TOSA_HIGIENICA_OPTIONS = [
  { id: "pequeno_baixa", label: "Pequeno - Pelagem baixa" },
  { id: "pequeno_alta", label: "Pequeno - Pelagem alta" },
  { id: "medio_baixa", label: "MÃ©dio - Pelagem baixa" },
  { id: "medio_alta", label: "MÃ©dio - Pelagem alta" },
  { id: "grande_baixa", label: "Grande - Pelagem baixa" },
  { id: "grande_alta", label: "Grande - Pelagem alta" },
];

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createEmptyTrip() {
  return {
    partida: "",
    destino: "",
    data: "",
    horario: "",
    horario_fim: "",
    km: "",
    observacao: "",
  };
}

function formatDate(value) {
  return value ? format(new Date(value), "dd/MM/yyyy", { locale: ptBR }) : "-";
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function getSharedKennelEnabled(cao) {
  return Boolean(cao?.hosp_dormitorio_compartilhado ?? cao?.["hosp_dormitÃƒÂ³rio_compartilhado"]);
}

function getSharedKennelDogs(cao) {
  const value = cao?.hosp_dormitorio_com ?? cao?.["hosp_dormitÃƒÂ³rio_com"];
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeCaoDraft(cao) {
  const draft = {
    ...deepClone(EMPTY_CAO),
    ...deepClone(cao || {}),
  };
  const sharedEnabled = getSharedKennelEnabled(cao);
  const sharedDogs = getSharedKennelDogs(cao);
  draft.servicos = { ...EMPTY_SERVICOS, ...(cao?.servicos || {}) };
  draft.hosp_dormitorio_compartilhado = sharedEnabled;
  draft["hosp_dormitÃƒÂ³rio_compartilhado"] = sharedEnabled;
  draft.hosp_dormitorio_com = sharedDogs;
  draft["hosp_dormitÃƒÂ³rio_com"] = sharedDogs;
  draft.hosp_datas_daycare = Array.isArray(cao?.hosp_datas_daycare) ? [...cao.hosp_datas_daycare] : [];
  draft.transporte_viagens = Array.isArray(cao?.transporte_viagens) && cao.transporte_viagens.length > 0
    ? deepClone(cao.transporte_viagens)
    : deepClone(EMPTY_CAO.transporte_viagens);
  return draft;
}

function inferServiceKind(appointment) {
  const sourceKey = String(appointment?.source_key || "");
  if (appointment?.service_type === "hospedagem") return "hospedagem";
  if (appointment?.service_type === "day_care" && sourceKey.includes("|day_care_avulso|")) return "day_care";
  if (appointment?.service_type === "adaptacao") return "adaptacao";
  if (appointment?.service_type === "transporte") return "transporte";
  if (appointment?.service_type === "banho" || appointment?.service_type === "tosa") return "banho_tosa";
  return null;
}

function getGroupKey(caoIndex, kind) {
  return `${caoIndex}:${kind}`;
}

function getDateFromCheckin(checkin) {
  return (
    (checkin?.checkin_datetime || "").slice(0, 10) ||
    (checkin?.data_checkin || "").slice(0, 10) ||
    (checkin?.checkout_datetime || "").slice(0, 10) ||
    (checkin?.data_checkout || "").slice(0, 10) ||
    ""
  );
}

function checkinMatchesAppointment(checkin, appointment) {
  if (!checkin || !appointment) return false;
  const metadata = typeof checkin?.metadata === "object" ? checkin.metadata : {};
  return checkin.appointment_id === appointment.id
    || metadata.appointment_id === appointment.id
    || (appointment.linked_checkin_id && checkin.id === appointment.linked_checkin_id)
    || (appointment.source_key && metadata.appointment_source_key === appointment.source_key);
}

function appointmentHasOperationalRecord(appointment, checkins = []) {
  if (!appointment) return false;
  if (appointment.linked_checkin_id) return true;
  if (["presente", "finalizado"].includes(appointment.status)) return true;
  return checkins.some((checkin) => checkinMatchesAppointment(checkin, appointment));
}

function buildInitialGroups(orcamento, appointments, checkins, dogs) {
  const dogsById = Object.fromEntries((dogs || []).map((dog) => [dog.id, dog]));
  const groups = [];

  (orcamento?.caes || []).forEach((baseCao, caoIndex) => {
    const linkedAppointments = (appointments || []).filter(
      (appointment) => Number(getAppointmentMeta(appointment)?.cao_index) === caoIndex
    );

    const kinds = [
      { kind: "hospedagem", enabled: Boolean(baseCao?.servicos?.hospedagem) },
      { kind: "day_care", enabled: Boolean(baseCao?.servicos?.day_care) },
      { kind: "adaptacao", enabled: Boolean(baseCao?.servicos?.adaptacao) },
      { kind: "banho_tosa", enabled: Boolean(baseCao?.servicos?.banho || baseCao?.servicos?.tosa) },
      { kind: "transporte", enabled: Boolean(baseCao?.servicos?.transporte) },
    ];

    kinds.forEach(({ kind, enabled }) => {
      if (!enabled) return;
      const itemAppointments = linkedAppointments.filter((appointment) => inferServiceKind(appointment) === kind);
      const dog = dogsById[baseCao?.dog_id];
      groups.push({
        id: getGroupKey(caoIndex, kind),
        caoIndex,
        kind,
        dogId: baseCao?.dog_id || "",
        dogName: dog?.nome || `CÃ£o ${caoIndex + 1}`,
        appointments: itemAppointments,
        hasOperationalRecord: itemAppointments.some((appointment) => appointmentHasOperationalRecord(appointment, checkins)),
      });
    });
  });

  return groups;
}

function buildDraftForGroup(baseCao, kind) {
  const source = normalizeCaoDraft(baseCao);
  const draft = normalizeCaoDraft(EMPTY_CAO);
  draft.dog_id = source.dog_id || "";

  if (kind === "hospedagem") {
    draft.servicos.hospedagem = true;
    draft.hosp_data_entrada = source.hosp_data_entrada || "";
    draft.hosp_horario_entrada = source.hosp_horario_entrada || "";
    draft.hosp_data_saida = source.hosp_data_saida || "";
    draft.hosp_horario_saida = source.hosp_horario_saida || "12:00";
    draft.hosp_is_mensalista = Boolean(source.hosp_is_mensalista);
    draft.hosp_tem_daycare_ativo = Boolean(source.hosp_tem_daycare_ativo);
    draft.hosp_dormitorio_compartilhado = getSharedKennelEnabled(source);
    draft["hosp_dormitÃƒÂ³rio_compartilhado"] = getSharedKennelEnabled(source);
    draft.hosp_dormitorio_com = getSharedKennelDogs(source);
    draft["hosp_dormitÃƒÂ³rio_com"] = getSharedKennelDogs(source);
    draft.hosp_datas_daycare = Array.isArray(source.hosp_datas_daycare) ? [...source.hosp_datas_daycare] : [];
  }

  if (kind === "day_care") {
    draft.servicos.day_care = true;
    draft.day_care_data = source.day_care_data || "";
    draft.day_care_plano_ativo = Boolean(source.day_care_plano_ativo);
    draft.day_care_horario_entrada = source.day_care_horario_entrada || "08:00";
    draft.day_care_horario_saida = source.day_care_horario_saida || "18:00";
    draft.day_care_observacoes = source.day_care_observacoes || "";
  }

  if (kind === "adaptacao") {
    draft.servicos.adaptacao = true;
    draft.adaptacao_data = source.adaptacao_data || "";
    draft.adaptacao_horario_entrada = source.adaptacao_horario_entrada || "09:00";
    draft.adaptacao_horario_saida = source.adaptacao_horario_saida || "10:00";
    draft.adaptacao_observacoes = source.adaptacao_observacoes || "";
  }

  if (kind === "banho_tosa") {
    draft.servicos.banho = Boolean(source.servicos?.banho);
    draft.servicos.tosa = Boolean(source.servicos?.tosa);
    draft.banho_plano_ativo = Boolean(source.banho_plano_ativo);
    draft.banho_do_pacote = Boolean(source.banho_do_pacote);
    draft.banho_data = source.banho_data || "";
    draft.banho_horario = source.banho_horario || "";
    draft.banho_horario_inicio = source.banho_horario_inicio || source.banho_horario || "";
    draft.banho_horario_saida = source.banho_horario_saida || "";
    draft.banho_raca = source.banho_raca || "";
    draft.banho_observacoes = source.banho_observacoes || "";
    draft.banho_srd_porte = source.banho_srd_porte || "";
    draft.banho_srd_pelagem = source.banho_srd_pelagem || "";
    draft.tosa_data = source.tosa_data || "";
    draft.tosa_tipo = source.tosa_tipo || "";
    draft.tosa_subtipo_higienica = source.tosa_subtipo_higienica || "";
    draft.tosa_plano_ativo = Boolean(source.tosa_plano_ativo);
    draft.tosa_do_pacote = Boolean(source.tosa_do_pacote);
    draft.tosa_horario_entrada = source.tosa_horario_entrada || "";
    draft.tosa_horario_saida = source.tosa_horario_saida || "";
    draft.tosa_obs = source.tosa_obs || "";
  }

  if (kind === "transporte") {
    draft.servicos.transporte = true;
    draft.transporte_plano_ativo = Boolean(source.transporte_plano_ativo);
    draft.transporte_do_pacote = Boolean(source.transporte_do_pacote);
    draft.transporte_viagens = Array.isArray(source.transporte_viagens) && source.transporte_viagens.length > 0
      ? deepClone(source.transporte_viagens)
      : [createEmptyTrip()];
  }

  return draft;
}

function mergeGroupDraftIntoCao(baseCao, group, editedDraft) {
  const next = normalizeCaoDraft(baseCao);
  next.dog_id = editedDraft.dog_id || next.dog_id;

  if (group.kind === "hospedagem") {
    next.servicos.hospedagem = true;
    next.hosp_data_entrada = editedDraft.hosp_data_entrada || "";
    next.hosp_horario_entrada = editedDraft.hosp_horario_entrada || "";
    next.hosp_data_saida = editedDraft.hosp_data_saida || "";
    next.hosp_horario_saida = editedDraft.hosp_horario_saida || "12:00";
    next.hosp_is_mensalista = Boolean(editedDraft.hosp_is_mensalista);
    next.hosp_tem_daycare_ativo = Boolean(editedDraft.hosp_tem_daycare_ativo);
    next.hosp_datas_daycare = Array.isArray(editedDraft.hosp_datas_daycare) ? [...editedDraft.hosp_datas_daycare] : [];
    const sharedEnabled = Boolean(editedDraft.hosp_dormitorio_compartilhado ?? editedDraft["hosp_dormitÃƒÂ³rio_compartilhado"]);
    const sharedDogs = getSharedKennelDogs(editedDraft);
    next.hosp_dormitorio_compartilhado = sharedEnabled;
    next["hosp_dormitÃƒÂ³rio_compartilhado"] = sharedEnabled;
    next.hosp_dormitorio_com = sharedDogs;
    next["hosp_dormitÃƒÂ³rio_com"] = sharedDogs;
  }

  if (group.kind === "day_care") {
    next.servicos.day_care = true;
    next.day_care_data = editedDraft.day_care_data || "";
    next.day_care_plano_ativo = Boolean(editedDraft.day_care_plano_ativo);
    next.day_care_horario_entrada = editedDraft.day_care_horario_entrada || "08:00";
    next.day_care_horario_saida = editedDraft.day_care_horario_saida || "18:00";
    next.day_care_observacoes = editedDraft.day_care_observacoes || "";
  }

  if (group.kind === "adaptacao") {
    next.servicos.adaptacao = true;
    next.adaptacao_data = editedDraft.adaptacao_data || "";
    next.adaptacao_horario_entrada = editedDraft.adaptacao_horario_entrada || "09:00";
    next.adaptacao_horario_saida = editedDraft.adaptacao_horario_saida || "10:00";
    next.adaptacao_observacoes = editedDraft.adaptacao_observacoes || "";
  }

  if (group.kind === "banho_tosa") {
    next.servicos.banho = Boolean(editedDraft.servicos?.banho);
    next.servicos.tosa = Boolean(editedDraft.servicos?.tosa);
    next.banho_plano_ativo = Boolean(editedDraft.banho_plano_ativo);
    next.banho_do_pacote = Boolean(editedDraft.banho_do_pacote);
    next.banho_data = editedDraft.banho_data || "";
    next.banho_horario = editedDraft.banho_horario || editedDraft.banho_horario_inicio || "";
    next.banho_horario_inicio = editedDraft.banho_horario_inicio || editedDraft.banho_horario || "";
    next.banho_horario_saida = editedDraft.banho_horario_saida || "";
    next.banho_raca = editedDraft.banho_raca || "";
    next.banho_observacoes = editedDraft.banho_observacoes || "";
    next.banho_srd_porte = editedDraft.banho_srd_porte || "";
    next.banho_srd_pelagem = editedDraft.banho_srd_pelagem || "";
    next.tosa_data = editedDraft.tosa_data || "";
    next.tosa_tipo = editedDraft.tosa_tipo || "";
    next.tosa_subtipo_higienica = editedDraft.tosa_subtipo_higienica || "";
    next.tosa_plano_ativo = Boolean(editedDraft.tosa_plano_ativo);
    next.tosa_do_pacote = Boolean(editedDraft.tosa_do_pacote);
    next.tosa_horario_entrada = editedDraft.tosa_horario_entrada || "";
    next.tosa_horario_saida = editedDraft.tosa_horario_saida || "";
    next.tosa_obs = editedDraft.tosa_obs || "";
  }

  if (group.kind === "transporte") {
    next.servicos.transporte = true;
    next.transporte_plano_ativo = Boolean(editedDraft.transporte_plano_ativo);
    next.transporte_do_pacote = Boolean(editedDraft.transporte_do_pacote);
    next.transporte_viagens = Array.isArray(editedDraft.transporte_viagens) && editedDraft.transporte_viagens.length > 0
      ? deepClone(editedDraft.transporte_viagens)
      : [createEmptyTrip()];
  }

  return next;
}

function getGroupIcon(kind) {
  if (kind === "hospedagem") return BedDouble;
  if (kind === "banho_tosa") return Scissors;
  if (kind === "transporte") return Truck;
  if (kind === "day_care") return Dog;
  return Bath;
}

function getGroupTitle(group, cao) {
  if (group.kind === "hospedagem") {
    return `Hospedagem ${formatDate(cao?.hosp_data_entrada)} a ${formatDate(cao?.hosp_data_saida)}`;
  }
  if (group.kind === "day_care") {
    return `Day Care ${formatDate(cao?.day_care_data)}`;
  }
  if (group.kind === "adaptacao") {
    return `AdaptaÃ§Ã£o ${formatDate(cao?.adaptacao_data)}`;
  }
  if (group.kind === "banho_tosa") {
    if (cao?.servicos?.banho && cao?.servicos?.tosa) return `Banho e Tosa â€¢ ${formatDate(cao?.banho_data || cao?.tosa_data)}`;
    if (cao?.servicos?.banho) return `Banho ${formatDate(cao?.banho_data)}`;
    return `Tosa ${formatDate(cao?.tosa_data)}`;
  }
  if (group.kind === "transporte") {
    const dates = [...new Set((cao?.transporte_viagens || []).map((trip) => trip?.data).filter(Boolean))];
    if (dates.length === 1) return `Transporte ${formatDate(dates[0])}`;
    return `Transporte ${dates.length} data(s)`;
  }
  return getServiceLabel(group.kind);
}

function getGroupDescription(group, cao) {
  if (group.kind === "hospedagem") {
    const dates = (cao?.hosp_datas_daycare || []).filter(Boolean);
    return dates.length > 0
      ? `PerÃ­odo completo com ${dates.length} diÃ¡ria(s) vinculada(s) ao Day Care.`
      : "PerÃ­odo completo da hospedagem.";
  }
  if (group.kind === "day_care") {
    return `Entrada ${cao?.day_care_horario_entrada || "08:00"} â€¢ SaÃ­da ${cao?.day_care_horario_saida || "18:00"}`;
  }
  if (group.kind === "adaptacao") {
    return `${cao?.adaptacao_horario_entrada || "09:00"} Ã s ${cao?.adaptacao_horario_saida || "10:00"}`;
  }
  if (group.kind === "banho_tosa") {
    const labels = [];
    if (cao?.servicos?.banho) labels.push(`Banho ${formatDate(cao?.banho_data)}`);
    if (cao?.servicos?.tosa) labels.push(`Tosa ${formatDate(cao?.tosa_data)}`);
    return labels.join(" â€¢ ");
  }
  if (group.kind === "transporte") {
    return `${(cao?.transporte_viagens || []).length} viagem(ns) cadastrada(s) neste orÃ§amento.`;
  }
  return "";
}

function getFinancialContact(carteiras, clienteId) {
  return (carteiras || []).find((item) => item.id === clienteId) || null;
}

function getLinkedResponsaveis(responsaveis, dogId) {
  return (responsaveis || []).filter((responsavel) =>
    [1, 2, 3, 4, 5, 6, 7, 8].some((slot) => responsavel?.[`dog_id_${slot}`] === dogId)
  );
}

function ensureOperationalCoverage(group, draftCao, checkinsByAppointmentId) {
  if (!group?.hasOperationalRecord) return null;

  if (draftCao.dog_id !== group.dogId) {
    return `O atendimento "${group.dogName}" jÃ¡ possui registro operacional. Para proteger o histÃ³rico, o cÃ£o deste serviÃ§o nÃ£o pode ser alterado.`;
  }

  let startDate = "";
  let endDate = "";
  if (group.kind === "hospedagem") {
    startDate = draftCao.hosp_data_entrada || "";
    endDate = draftCao.hosp_data_saida || startDate;
  } else if (group.kind === "day_care") {
    startDate = draftCao.day_care_data || "";
    endDate = startDate;
  } else if (group.kind === "adaptacao") {
    startDate = draftCao.adaptacao_data || "";
    endDate = startDate;
  } else if (group.kind === "banho_tosa") {
    const dates = [draftCao.banho_data, draftCao.tosa_data].filter(Boolean);
    startDate = dates[0] || "";
    endDate = dates[dates.length - 1] || startDate;
  } else if (group.kind === "transporte") {
    const dates = (draftCao.transporte_viagens || []).map((trip) => trip?.data).filter(Boolean).sort();
    startDate = dates[0] || "";
    endDate = dates[dates.length - 1] || startDate;
  }

  const outsideCheckin = (group.appointments || []).some((appointment) =>
    (checkinsByAppointmentId[appointment.id] || []).some((checkin) => {
      const dateKey = getDateFromCheckin(checkin);
      if (!dateKey || !startDate) return false;
      return dateKey < startDate || dateKey > (endDate || startDate);
    })
  );

  if (outsideCheckin) {
    return `As novas datas de "${group.dogName}" deixariam um check-in ou check-out fora do perÃ­odo coberto por este atendimento. Ajuste o perÃ­odo para manter os registros existentes.`;
  }

  return null;
}

function calculateOrcamento(caes, dogs, precos) {
  const detalhes = [];
  const transporte = [];
  let subtotalHospedagem = 0;
  let subtotalServicos = 0;
  let subtotalTransporte = 0;
  let descontoTotal = 0;

  (caes || []).forEach((cao) => {
    if (!cao?.dog_id) return;
    const dog = (dogs || []).find((item) => item.id === cao.dog_id);
    const linhas = [];
    let total = 0;

    if (cao?.servicos?.day_care && cao?.day_care_data) {
      const valor = getDayCareStandaloneValue(cao, precos);
      linhas.push({
        tipo: "day_care",
        descricao: `Day Care avulso (${cao.day_care_plano_ativo ? "com pacote ativo" : "sem pacote ativo"})`,
        valor,
      });
      total += valor;
      subtotalServicos += valor;
    }

    if (cao?.servicos?.adaptacao && cao?.adaptacao_data) {
      const valor = Number(precos?.adaptacao || 0);
      linhas.push({ tipo: "adaptacao", descricao: "AdaptaÃ§Ã£o", valor });
      total += valor;
      subtotalServicos += valor;
    }

    if (cao?.servicos?.hospedagem && cao?.hosp_data_entrada && cao?.hosp_data_saida) {
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
          descricao: `${diariasNormais} diÃ¡ria(s) Ã— ${formatCurrency(valorDiaria)}`,
          valor: subtotalDiarias,
        });
      }
      if (numDaycare > 0) {
        linhas.push({
          tipo: "pernoite",
          descricao: `${numDaycare} pernoite(s) Ã— ${formatCurrency(precos.pernoite)}`,
          valor: subtotalPernoite,
        });
      }

      let descDormitorio = 0;
      if (getSharedKennelEnabled(cao) && getSharedKennelDogs(cao).length > 0) {
        descDormitorio = subtotalDiarias * precos.desconto_canil;
        linhas.push({ tipo: "desconto", descricao: "Desc. dormitÃ³rio compartilhado", valor: -descDormitorio });
        descontoTotal += descDormitorio;
      }

      let descLonga = 0;
      if (diarias > 15) {
        descLonga = (subtotalDiarias - descDormitorio) * precos.desconto_longa_estadia;
        linhas.push({ tipo: "desconto", descricao: "Desc. longa estadia", valor: -descLonga });
        descontoTotal += descLonga;
      }

      const totalHospedagemItem = subtotalDiarias + subtotalPernoite - descDormitorio - descLonga;
      total += totalHospedagemItem;
      subtotalHospedagem += totalHospedagemItem;
    }

    if (cao?.servicos?.banho) {
      const raca = normalizeBreedName(cao?.banho_raca || dog?.raca || "Outro") || "Outro";
      const valor = precos?.banho?.[raca] || precos?.banho?.Outro || 0;
      linhas.push({ tipo: "banho", descricao: `Banho (${raca})`, valor });
      total += valor;
      subtotalServicos += valor;
    }

    if (cao?.servicos?.tosa && cao?.tosa_tipo) {
      let valor = 0;
      let descricao = "Tosa";
      if (cao.tosa_tipo === "higienica") {
        valor = precos?.tosa_higienica?.[cao.tosa_subtipo_higienica || "pequeno_baixa"] || 0;
        descricao = "Tosa higiÃªnica";
      } else {
        const raca = normalizeBreedName(cao?.banho_raca || dog?.raca || "Outro") || "Outro";
        valor = cao.tosa_tipo === "detalhada"
          ? (precos?.tosa_detalhada?.[raca] || precos?.tosa_detalhada?.Outro || 0)
          : (precos?.tosa_geral?.[raca] || precos?.tosa_geral?.Outro || 0);
        descricao = cao.tosa_tipo === "detalhada" ? `Tosa detalhada (${raca})` : `Tosa geral (${raca})`;
      }
      linhas.push({ tipo: "tosa", descricao, valor });
      total += valor;
      subtotalServicos += valor;
    }

    if (cao?.servicos?.transporte) {
      (cao.transporte_viagens || []).forEach((trip, index) => {
        const km = Number.parseFloat(trip?.km || 0) || 0;
        if (km <= 0) return;
        const valor = km * (precos?.transporte_km || 0);
        transporte.push({
          dog_nome: dog?.nome || "CÃ£o",
          viagem_num: index + 1,
          km,
          valor,
          partida: trip.partida || "",
          destino: trip.destino || "",
        });
        subtotalTransporte += valor;
      });
    }

    if (linhas.length > 0 || total > 0) {
      detalhes.push({
        dog_id: cao.dog_id,
        dog_nome: dog?.nome || "CÃ£o",
        linhas,
        total,
      });
    }
  });

  return {
    detalhes,
    transporte,
    subtotal_hospedagem: subtotalHospedagem,
    subtotal_servicos: subtotalServicos,
    subtotal_transporte: subtotalTransporte,
    desconto_total: descontoTotal,
    valor_total: subtotalHospedagem + subtotalServicos + subtotalTransporte,
  };
}

function buildAppointmentGroupMap(appointments = []) {
  const map = new Map();
  (appointments || []).forEach((appointment) => {
    const meta = getAppointmentMeta(appointment);
    const kind = inferServiceKind(appointment);
    if (kind == null) return;
    const key = getGroupKey(Number(meta?.cao_index ?? -1), kind);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(appointment);
  });

  map.forEach((items) => {
    items.sort((left, right) => {
      const leftDate = `${getAppointmentDateKey(left)} ${getAppointmentTimeValue(left, "entrada")}`;
      const rightDate = `${getAppointmentDateKey(right)} ${getAppointmentTimeValue(right, "entrada")}`;
      return leftDate.localeCompare(rightDate);
    });
  });

  return map;
}

export default function OrcamentoAgendamentoEditorDialog({
  open,
  orcamento,
  dogs,
  carteiras,
  responsaveis,
  precos,
  onClose,
  onSaved,
  onFeedback,
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftOrcamento, setDraftOrcamento] = useState(null);
  const [groups, setGroups] = useState([]);
  const [appointmentsByGroup, setAppointmentsByGroup] = useState(new Map());
  const [checkinsByAppointmentId, setCheckinsByAppointmentId] = useState({});
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [groupDraft, setGroupDraft] = useState(null);
  const [currentStep, setCurrentStep] = useState("responsaveis");

  useEffect(() => {
    if (!open || !orcamento?.id) return;
    loadEditor();
  }, [open, orcamento?.id]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) || null,
    [groups, selectedGroupId],
  );

  const selectedGroupBaseCao = useMemo(
    () => (selectedGroup && draftOrcamento?.caes?.[selectedGroup.caoIndex])
      ? normalizeCaoDraft(draftOrcamento.caes[selectedGroup.caoIndex])
      : null,
    [draftOrcamento, selectedGroup],
  );

  const calculo = useMemo(
    () => (draftOrcamento ? calculateOrcamento(draftOrcamento.caes || [], dogs, precos || {}) : null),
    [draftOrcamento, dogs, precos],
  );

  const financialContact = useMemo(
    () => getFinancialContact(carteiras, draftOrcamento?.cliente_id),
    [carteiras, draftOrcamento?.cliente_id],
  );

  const linkedResponsaveis = useMemo(
    () => getLinkedResponsaveis(responsaveis, groupDraft?.dog_id || selectedGroup?.dogId),
    [groupDraft?.dog_id, responsaveis, selectedGroup?.dogId],
  );

  const availableKennelDogs = useMemo(
    () => (dogs || []).filter((dog) => dog.id !== (groupDraft?.dog_id || selectedGroup?.dogId)),
    [dogs, groupDraft?.dog_id, selectedGroup?.dogId],
  );

  const serviceSummaryItems = useMemo(() => {
    if (!draftOrcamento) return [];
    return groups.map((group) => {
      const baseCao = draftOrcamento.caes?.[group.caoIndex];
      return {
        ...group,
        title: getGroupTitle(group, baseCao),
        description: getGroupDescription(group, baseCao),
        icon: getGroupIcon(group.kind),
      };
    });
  }, [draftOrcamento, groups]);

  async function loadEditor() {
    setIsLoading(true);
    setSelectedGroupId("");
    setGroupDraft(null);
    setCurrentStep("responsaveis");
    try {
      const [appointmentRows, checkinRows] = await Promise.all([
        Appointment.listAll("-created_date", 1000, 10000),
        Checkin.listAll("-created_date", 1000, 10000),
      ]);

      const linkedAppointments = (appointmentRows || []).filter((appointment) => appointment.orcamento_id === orcamento.id);
      const nextDraft = {
        ...deepClone(orcamento),
        caes: (orcamento.caes || []).map((cao) => normalizeCaoDraft(cao)),
      };
      const byAppointmentId = {};
      linkedAppointments.forEach((appointment) => {
        byAppointmentId[appointment.id] = (checkinRows || []).filter((checkin) => checkinMatchesAppointment(checkin, appointment));
      });

      setDraftOrcamento(nextDraft);
      setGroups(buildInitialGroups(nextDraft, linkedAppointments, checkinRows || [], dogs || []));
      setAppointmentsByGroup(buildAppointmentGroupMap(linkedAppointments));
      setCheckinsByAppointmentId(byAppointmentId);
    } catch (error) {
      console.error("Erro ao abrir editor de agendamentos:", error);
      onFeedback?.("NÃ£o foi possÃ­vel abrir a ediÃ§Ã£o", "Os agendamentos deste orÃ§amento nÃ£o foram carregados.", "error");
      onClose?.();
    } finally {
      setIsLoading(false);
    }
  }

  function openGroupEditor(group) {
    const baseCao = draftOrcamento?.caes?.[group.caoIndex];
    setSelectedGroupId(group.id);
    setGroupDraft(buildDraftForGroup(baseCao, group.kind));
    setCurrentStep("responsaveis");
  }

  function cancelGroupEditor() {
    setSelectedGroupId("");
    setGroupDraft(null);
    setCurrentStep("responsaveis");
  }

  function patchGroupDraft(patch) {
    if (!selectedGroup || !groupDraft) return;
    const next = normalizeCaoDraft({ ...groupDraft, ...patch });
    if (selectedGroup.kind === "hospedagem") next.servicos = { ...EMPTY_SERVICOS, hospedagem: true };
    if (selectedGroup.kind === "day_care") next.servicos = { ...EMPTY_SERVICOS, day_care: true };
    if (selectedGroup.kind === "adaptacao") next.servicos = { ...EMPTY_SERVICOS, adaptacao: true };
    if (selectedGroup.kind === "transporte") next.servicos = { ...EMPTY_SERVICOS, transporte: true };
    if (selectedGroup.kind === "banho_tosa") {
      next.servicos = {
        ...EMPTY_SERVICOS,
        banho: Boolean(next.servicos?.banho),
        tosa: Boolean(next.servicos?.tosa),
      };
    }
    setGroupDraft(next);
  }

  function patchGroupServices(servicePatch) {
    patchGroupDraft({
      servicos: {
        ...(groupDraft?.servicos || {}),
        ...servicePatch,
      },
    });
  }

  function toggleSharedKennelDog(dogId) {
    const currentIds = new Set(getSharedKennelDogs(groupDraft));
    if (currentIds.has(dogId)) currentIds.delete(dogId);
    else currentIds.add(dogId);
    patchGroupDraft({
      hosp_dormitorio_com: [...currentIds],
      "hosp_dormitÃƒÂ³rio_com": [...currentIds],
    });
  }

  function updateHospedagemDaycareDate(dateIndex, value) {
    const dates = [...(groupDraft?.hosp_datas_daycare || [])];
    dates[dateIndex] = value;
    patchGroupDraft({ hosp_datas_daycare: dates });
  }

  function removeHospedagemDaycareDate(dateIndex) {
    patchGroupDraft({
      hosp_datas_daycare: (groupDraft?.hosp_datas_daycare || []).filter((_, index) => index !== dateIndex),
    });
  }

  function addHospedagemDaycareDate() {
    patchGroupDraft({
      hosp_datas_daycare: [...(groupDraft?.hosp_datas_daycare || []), ""],
    });
  }

  function updateTrip(tripIndex, field, value) {
    const trips = [...(groupDraft?.transporte_viagens || [])];
    trips[tripIndex] = {
      ...(trips[tripIndex] || createEmptyTrip()),
      [field]: value,
    };
    patchGroupDraft({ transporte_viagens: trips });
  }

  function addTrip() {
    patchGroupDraft({
      transporte_viagens: [...(groupDraft?.transporte_viagens || []), createEmptyTrip()],
    });
  }

  function removeTrip(tripIndex) {
    patchGroupDraft({
      transporte_viagens: (groupDraft?.transporte_viagens || []).filter((_, index) => index !== tripIndex),
    });
  }

  function saveCurrentGroupDraft() {
    if (!selectedGroup || !groupDraft || !draftOrcamento) return;
    const validationMessage = ensureOperationalCoverage(selectedGroup, groupDraft, checkinsByAppointmentId);
    if (validationMessage) {
      onFeedback?.("AlteraÃ§Ã£o bloqueada", validationMessage, "error");
      return;
    }

    const nextCaes = [...(draftOrcamento.caes || [])];
    nextCaes[selectedGroup.caoIndex] = mergeGroupDraftIntoCao(nextCaes[selectedGroup.caoIndex], selectedGroup, groupDraft);
    setDraftOrcamento((current) => ({ ...current, caes: nextCaes }));
    setGroups((current) =>
      current.map((group) =>
        group.id === selectedGroup.id
          ? {
              ...group,
              dogId: groupDraft.dog_id || group.dogId,
              dogName: (dogs || []).find((dog) => dog.id === (groupDraft.dog_id || group.dogId))?.nome || group.dogName,
            }
          : group
      )
    );
    cancelGroupEditor();
  }

  async function saveAllChanges() {
    if (!draftOrcamento) return;
    setIsSaving(true);
    try {
      const ownerByDogId = buildDogOwnerIndex(carteiras, responsaveis);
      const plannedAppointments = buildAppointmentsFromOrcamento({
        orcamento: { ...draftOrcamento, status: draftOrcamento.status || "aprovado" },
        dogs,
        precos,
        ownerByDogId,
      });

      const originalGroupMap = appointmentsByGroup;
      const plannedGroupMap = buildAppointmentGroupMap(plannedAppointments);
      const appointmentUpdates = [];
      const appointmentCreates = [];
      const appointmentDeletes = [];
      const blockingMessages = [];

      const allGroupKeys = [...new Set([...originalGroupMap.keys(), ...plannedGroupMap.keys()])];
      allGroupKeys.forEach((groupKey) => {
        const originalItems = [...(originalGroupMap.get(groupKey) || [])];
        const plannedItems = [...(plannedGroupMap.get(groupKey) || [])];
        const pairCount = Math.min(originalItems.length, plannedItems.length);

        for (let index = 0; index < pairCount; index += 1) {
          appointmentUpdates.push({
            id: originalItems[index].id,
            payload: {
              ...plannedItems[index],
              source_key: originalItems[index].source_key,
            },
          });
        }

        if (plannedItems.length > originalItems.length) {
          appointmentCreates.push(...plannedItems.slice(originalItems.length));
        }

        if (originalItems.length > plannedItems.length) {
          originalItems.slice(plannedItems.length).forEach((appointment) => {
            if (appointmentHasOperationalRecord(appointment, checkinsByAppointmentId[appointment.id] || [])) {
              blockingMessages.push(
                `${getServiceLabel(appointment.service_type)} de ${formatDate(getAppointmentDateKey(appointment))} jÃ¡ possui registro operacional e nÃ£o pode perder cobertura.`
              );
              return;
            }
            appointmentDeletes.push(appointment);
          });
        }
      });

      if (blockingMessages.length > 0) {
        onFeedback?.("Algumas alteraÃ§Ãµes foram bloqueadas", blockingMessages.slice(0, 3).join(" "), "error");
        setIsSaving(false);
        return;
      }

      await Promise.all(appointmentDeletes.map((appointment) => Appointment.delete(appointment.id)));
      await Promise.all(appointmentUpdates.map((item) => Appointment.update(item.id, item.payload)));
      await Promise.all(appointmentCreates.map((appointment) => Appointment.create(appointment)));

      const nextCalculo = calculateOrcamento(draftOrcamento.caes || [], dogs, precos || {});
      const payload = {
        caes: deepClone(draftOrcamento.caes || []),
        subtotal_hospedagem: nextCalculo?.subtotal_hospedagem || 0,
        subtotal_servicos: nextCalculo?.subtotal_servicos || 0,
        subtotal_transporte: nextCalculo?.subtotal_transporte || 0,
        desconto_total: nextCalculo?.desconto_total || 0,
        valor_total: nextCalculo?.valor_total || 0,
        observacoes: draftOrcamento.observacoes || "",
      };
      await Orcamento.update(draftOrcamento.id, payload);
      onSaved?.({ ...draftOrcamento, ...payload });
    } catch (error) {
      console.error("Erro ao salvar ediÃ§Ã£o do orÃ§amento:", error);
      onFeedback?.("NÃ£o foi possÃ­vel salvar", "Revise os dados alterados e tente novamente.", "error");
    } finally {
      setIsSaving(false);
    }
  }

  function renderPeriodStep() {
    if (!selectedGroup || !groupDraft) return null;

    return (
      <div className="space-y-4">
        {selectedGroup.hasOperationalRecord ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Qualquer nova data precisa continuar abrangendo o check-in e o check-out jÃ¡ registrados para este atendimento.
          </div>
        ) : null}

        <Card className="border-gray-200 bg-white">
          <CardContent className="space-y-5 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">ServiÃ§o selecionado</p>
              <h3 className="mt-2 text-lg font-bold text-gray-900">
                {selectedGroupBaseCao ? getGroupTitle(selectedGroup, selectedGroupBaseCao) : "Atendimento"}
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                Revise apenas as informaÃ§Ãµes deste atendimento. As demais partes do orÃ§amento continuam preservadas.
              </p>
            </div>

            {selectedGroup.kind === "hospedagem" ? (
              <div className="space-y-5 rounded-3xl border border-blue-100 bg-blue-50/60 p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Data de entrada</Label>
                    <DatePickerInput className="mt-2" value={groupDraft.hosp_data_entrada} onChange={(value) => patchGroupDraft({ hosp_data_entrada: value })} />
                  </div>
                  <div>
                    <Label>HorÃ¡rio de entrada</Label>
                    <TimePickerInput className="mt-2" value={groupDraft.hosp_horario_entrada} onChange={(value) => patchGroupDraft({ hosp_horario_entrada: value })} />
                  </div>
                  <div>
                    <Label>Data de saÃ­da</Label>
                    <DatePickerInput className="mt-2" value={groupDraft.hosp_data_saida} onChange={(value) => patchGroupDraft({ hosp_data_saida: value })} />
                  </div>
                  <div>
                    <Label>HorÃ¡rio de saÃ­da</Label>
                    <TimePickerInput className="mt-2" value={groupDraft.hosp_horario_saida} onChange={(value) => patchGroupDraft({ hosp_horario_saida: value })} />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label className="text-sm font-medium">Mensalista de Day Care</Label>
                        <p className="mt-1 text-xs text-gray-500">Usa diÃ¡ria diferenciada na hospedagem.</p>
                      </div>
                      <Switch checked={Boolean(groupDraft.hosp_is_mensalista)} onCheckedChange={(checked) => patchGroupDraft({ hosp_is_mensalista: checked })} />
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label className="text-sm font-medium">Tem Day Care ativo</Label>
                        <p className="mt-1 text-xs text-gray-500">Permite controlar pernoites ligados ao Day Care.</p>
                      </div>
                      <Switch checked={Boolean(groupDraft.hosp_tem_daycare_ativo)} onCheckedChange={(checked) => patchGroupDraft({ hosp_tem_daycare_ativo: checked })} />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="text-sm font-medium">Datas de Day Care / pernoite</Label>
                      <p className="mt-1 text-xs text-gray-500">Inclua apenas as datas adicionais ligadas a esta hospedagem.</p>
                    </div>
                    <Button type="button" variant="outline" onClick={addHospedagemDaycareDate}>
                      Adicionar data
                    </Button>
                  </div>
                  <div className="mt-4 space-y-2">
                    {(groupDraft.hosp_datas_daycare || []).length === 0 ? (
                      <p className="text-sm text-gray-500">Nenhuma data adicional cadastrada.</p>
                    ) : (groupDraft.hosp_datas_daycare || []).map((date, dateIndex) => (
                      <div key={`${dateIndex}-${date || "novo"}`} className="flex items-center gap-2">
                        <DatePickerInput value={date} onChange={(value) => updateHospedagemDaycareDate(dateIndex, value)} />
                        <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => removeHospedagemDaycareDate(dateIndex)}>
                          Remover
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {selectedGroup.kind === "day_care" ? (
              <div className="space-y-5 rounded-3xl border border-emerald-100 bg-emerald-50/60 p-5">
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-sm font-medium text-gray-900">Day Care avulso</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Sem pacote ativo: {formatCurrency(precos?.day_care_avulso_sem_pacote ?? precos?.day_care_avulso ?? 125)}
                    {" | "}Com pacote ativo: {formatCurrency(precos?.day_care_avulso_com_pacote ?? 110)}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label>Data</Label>
                    <DatePickerInput className="mt-2" value={groupDraft.day_care_data} onChange={(value) => patchGroupDraft({ day_care_data: value })} />
                  </div>
                  <div>
                    <Label>HorÃ¡rio de entrada</Label>
                    <TimePickerInput className="mt-2" value={groupDraft.day_care_horario_entrada} onChange={(value) => patchGroupDraft({ day_care_horario_entrada: value })} />
                  </div>
                  <div>
                    <Label>HorÃ¡rio de saÃ­da</Label>
                    <TimePickerInput className="mt-2" value={groupDraft.day_care_horario_saida} onChange={(value) => patchGroupDraft({ day_care_horario_saida: value })} />
                  </div>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="text-sm font-medium">CÃ£o com pacote de Day Care ativo</Label>
                      <p className="mt-1 text-xs text-gray-500">Aplica o valor avulso reduzido para clientes com pacote em vigor.</p>
                    </div>
                    <Switch checked={Boolean(groupDraft.day_care_plano_ativo)} onCheckedChange={(checked) => patchGroupDraft({ day_care_plano_ativo: checked })} />
                  </div>
                </div>
                <div>
                  <Label>ObservaÃ§Ãµes do Day Care</Label>
                  <Input className="mt-2" value={groupDraft.day_care_observacoes || ""} onChange={(event) => patchGroupDraft({ day_care_observacoes: event.target.value })} placeholder="Ex.: socializaÃ§Ã£o, gasto de energia, horÃ¡rio especial" />
                </div>
              </div>
            ) : null}

            {selectedGroup.kind === "adaptacao" ? (
              <div className="space-y-5 rounded-3xl border border-sky-100 bg-sky-50/60 p-5">
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-sm font-medium text-gray-900">AdaptaÃ§Ã£o</p>
                  <p className="mt-1 text-xs text-gray-500">Valor configurado: {formatCurrency(precos?.adaptacao ?? 0)}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label>Data</Label>
                    <DatePickerInput className="mt-2" value={groupDraft.adaptacao_data} onChange={(value) => patchGroupDraft({ adaptacao_data: value })} />
                  </div>
                  <div>
                    <Label>HorÃ¡rio de inÃ­cio</Label>
                    <TimePickerInput className="mt-2" value={groupDraft.adaptacao_horario_entrada} onChange={(value) => patchGroupDraft({ adaptacao_horario_entrada: value })} />
                  </div>
                  <div>
                    <Label>HorÃ¡rio de tÃ©rmino</Label>
                    <TimePickerInput className="mt-2" value={groupDraft.adaptacao_horario_saida} onChange={(value) => patchGroupDraft({ adaptacao_horario_saida: value })} />
                  </div>
                </div>
                <div>
                  <Label>ObservaÃ§Ãµes da adaptaÃ§Ã£o</Label>
                  <Textarea className="mt-2" rows={3} value={groupDraft.adaptacao_observacoes || ""} onChange={(event) => patchGroupDraft({ adaptacao_observacoes: event.target.value })} placeholder="Ex.: tolerou bem o ambiente, precisa de nova etapa, avisar comercial" />
                </div>
              </div>
            ) : null}

            {selectedGroup.kind === "banho_tosa" ? (
              <div className="space-y-5 rounded-3xl border border-cyan-100 bg-cyan-50/60 p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label className="text-sm font-medium">Banho</Label>
                        <p className="mt-1 text-xs text-gray-500">Mantenha ligado apenas se este serviÃ§o faz parte deste atendimento.</p>
                      </div>
                      <Switch checked={Boolean(groupDraft.servicos?.banho)} onCheckedChange={(checked) => patchGroupServices({ banho: checked })} />
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label className="text-sm font-medium">Tosa</Label>
                        <p className="mt-1 text-xs text-gray-500">Use quando a tosa estÃ¡ incluÃ­da neste mesmo dia.</p>
                      </div>
                      <Switch checked={Boolean(groupDraft.servicos?.tosa)} onCheckedChange={(checked) => patchGroupServices({ tosa: checked })} />
                    </div>
                  </div>
                </div>

                {groupDraft.servicos?.banho ? (
                  <div className="space-y-4 rounded-2xl bg-white p-4">
                    <h4 className="text-sm font-semibold text-gray-900">Banho</h4>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>RaÃ§a para banho</Label>
                        <Input className="mt-2" value={groupDraft.banho_raca || ""} onChange={(event) => patchGroupDraft({ banho_raca: event.target.value })} />
                      </div>
                      <div>
                        <Label>Data do banho</Label>
                        <DatePickerInput className="mt-2" value={groupDraft.banho_data} onChange={(value) => patchGroupDraft({ banho_data: value })} />
                      </div>
                      <div>
                        <Label>HorÃ¡rio de inÃ­cio</Label>
                        <TimePickerInput className="mt-2" value={groupDraft.banho_horario_inicio || groupDraft.banho_horario} onChange={(value) => patchGroupDraft({ banho_horario_inicio: value, banho_horario: value })} />
                      </div>
                      <div>
                        <Label>HorÃ¡rio de tÃ©rmino</Label>
                        <TimePickerInput className="mt-2" value={groupDraft.banho_horario_saida} onChange={(value) => patchGroupDraft({ banho_horario_saida: value })} />
                      </div>
                    </div>
                    <Textarea className="mt-1" rows={3} value={groupDraft.banho_observacoes || ""} onChange={(event) => patchGroupDraft({ banho_observacoes: event.target.value })} placeholder="Ex.: o cÃ£o estava mais agitado hoje" />
                  </div>
                ) : null}

                {groupDraft.servicos?.tosa ? (
                  <div className="space-y-4 rounded-2xl bg-white p-4">
                    <h4 className="text-sm font-semibold text-gray-900">Tosa</h4>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <Label>Data da tosa</Label>
                        <DatePickerInput className="mt-2" value={groupDraft.tosa_data} onChange={(value) => patchGroupDraft({ tosa_data: value })} />
                      </div>
                      <div>
                        <Label>HorÃ¡rio de inÃ­cio</Label>
                        <TimePickerInput className="mt-2" value={groupDraft.tosa_horario_entrada} onChange={(value) => patchGroupDraft({ tosa_horario_entrada: value })} />
                      </div>
                      <div>
                        <Label>HorÃ¡rio de tÃ©rmino</Label>
                        <TimePickerInput className="mt-2" value={groupDraft.tosa_horario_saida} onChange={(value) => patchGroupDraft({ tosa_horario_saida: value })} />
                      </div>
                    </div>
                    <div>
                      <Label>Tipo de tosa</Label>
                      <Select value={groupDraft.tosa_tipo || ""} onValueChange={(value) => patchGroupDraft({ tosa_tipo: value })}>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Escolha o tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="higienica">HigiÃªnica</SelectItem>
                          <SelectItem value="geral">Geral</SelectItem>
                          <SelectItem value="detalhada">Detalhada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {groupDraft.tosa_tipo === "higienica" ? (
                      <div>
                        <Label>Subtipo higiÃªnica</Label>
                        <Select value={groupDraft.tosa_subtipo_higienica || ""} onValueChange={(value) => patchGroupDraft({ tosa_subtipo_higienica: value })}>
                          <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Escolha o subtipo" />
                          </SelectTrigger>
                          <SelectContent>
                            {TOSA_HIGIENICA_OPTIONS.map((option) => (
                              <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    <Textarea className="mt-1" rows={3} value={groupDraft.tosa_obs || ""} onChange={(event) => patchGroupDraft({ tosa_obs: event.target.value })} placeholder="ObservaÃ§Ãµes especÃ­ficas da tosa" />
                  </div>
                ) : null}
              </div>
            ) : null}

            {selectedGroup.kind === "transporte" ? (
              <div className="space-y-4 rounded-3xl border border-amber-100 bg-amber-50/60 p-5">
                {(groupDraft.transporte_viagens || []).map((trip, tripIndex) => (
                  <div key={`${tripIndex}-${trip.data || "novo"}`} className="space-y-4 rounded-2xl bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">Viagem {tripIndex + 1}</h4>
                        <p className="mt-1 text-xs text-gray-500">Edite partida, destino, dia, horÃ¡rios e quilometragem.</p>
                      </div>
                      {(groupDraft.transporte_viagens || []).length > 1 ? (
                        <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => removeTrip(tripIndex)}>
                          Remover
                        </Button>
                      ) : null}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Partida</Label>
                        <Input className="mt-2" value={trip.partida || ""} onChange={(event) => updateTrip(tripIndex, "partida", event.target.value)} />
                      </div>
                      <div>
                        <Label>Destino</Label>
                        <Input className="mt-2" value={trip.destino || ""} onChange={(event) => updateTrip(tripIndex, "destino", event.target.value)} />
                      </div>
                      <div>
                        <Label>Data</Label>
                        <DatePickerInput className="mt-2" value={trip.data || ""} onChange={(value) => updateTrip(tripIndex, "data", value)} />
                      </div>
                      <div>
                        <Label>HorÃ¡rio de inÃ­cio</Label>
                        <TimePickerInput className="mt-2" value={trip.horario || ""} onChange={(value) => updateTrip(tripIndex, "horario", value)} />
                      </div>
                      <div>
                        <Label>HorÃ¡rio de tÃ©rmino</Label>
                        <TimePickerInput className="mt-2" value={trip.horario_fim || ""} onChange={(value) => updateTrip(tripIndex, "horario_fim", value)} />
                      </div>
                      <div>
                        <Label>KM</Label>
                        <Input className="mt-2" value={trip.km || ""} onChange={(event) => updateTrip(tripIndex, "km", event.target.value)} />
                      </div>
                    </div>
                    <div>
                      <Label>ObservaÃ§Ãµes do transporte</Label>
                      <Textarea className="mt-2" rows={2} value={trip.observacao || ""} onChange={(event) => updateTrip(tripIndex, "observacao", event.target.value)} placeholder="Ex.: parada intermediÃ¡ria, observaÃ§Ã£o de acesso, janela de retirada" />
                    </div>
                  </div>
                ))}
                <div className="flex justify-end">
                  <Button type="button" variant="outline" onClick={addTrip}>
                    Adicionar viagem
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && !isSaving && onClose?.()}>
      <DialogContent className="flex max-h-[95vh] w-[98vw] max-w-[1180px] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{selectedGroup ? "Editar atendimento do orÃ§amento" : "Editar agendamentos do orÃ§amento"}</DialogTitle>
          <DialogDescription>
            {selectedGroup
              ? "Revise este atendimento usando o mesmo raciocÃ­nio do orÃ§amento original, sem perder a vinculaÃ§Ã£o com os registros operacionais."
              : "Escolha qual atendimento deseja revisar. As alteraÃ§Ãµes ficam em rascunho atÃ© vocÃª salvar o orÃ§amento inteiro."}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !draftOrcamento ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-12 w-12 animate-spin rounded-full border-b-4 border-blue-600" />
          </div>
        ) : !selectedGroup ? (
          <div className="grid flex-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1.3fr)_360px]">
            <div className="space-y-4 overflow-y-auto pr-1">
              {serviceSummaryItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Card key={item.id} className="border-gray-200 bg-white shadow-sm">
                    <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">{item.dogName}</p>
                          <h4 className="mt-1 text-lg font-bold text-gray-900">{item.title}</h4>
                          <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {item.hasOperationalRecord ? (
                              <Badge className="bg-amber-100 text-amber-700">
                                <ShieldAlert className="mr-1 h-3 w-3" />
                                Com registros operacionais
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-100 text-emerald-700">
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Sem conflito operacional
                              </Badge>
                            )}
                            <Badge variant="outline">{item.appointments.length} agendamento(s) vinculado(s)</Badge>
                          </div>
                        </div>
                      </div>

                      <Button onClick={() => openGroupEditor(item)} className="bg-blue-600 text-white hover:bg-blue-700">
                        Alterar
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="overflow-y-auto rounded-3xl border border-gray-200 bg-gray-50 p-4">
              <div className="mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">Resumo atualizado do orÃ§amento</h3>
              </div>
              <OrcamentoResumo calculo={calculo} />
            </div>
          </div>
        ) : (
          <div className="grid flex-1 gap-4 overflow-hidden lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-3 rounded-3xl border border-gray-200 bg-gray-50 p-4">
              {EDIT_STEPS.map((step) => {
                const Icon = step.icon;
                const isActive = currentStep === step.id;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setCurrentStep(step.id)}
                    className={isActive
                      ? "flex w-full items-center gap-3 rounded-2xl bg-blue-600 px-4 py-3 text-left text-white shadow-sm"
                      : "flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left text-gray-700 transition hover:bg-blue-50"}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="text-sm font-medium">{step.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="overflow-y-auto pr-1">
              {currentStep === "responsaveis" ? (
                <div className="space-y-4">
                  <Card className="border-gray-200 bg-white">
                    <CardContent className="p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">ResponsÃ¡vel financeiro</p>
                      <h3 className="mt-2 text-lg font-bold text-gray-900">{financialContact?.nome_razao_social || "NÃ£o informado"}</h3>
                      <p className="mt-2 text-sm text-gray-600">
                        {financialContact?.celular || "-"} {financialContact?.cpf_cnpj ? `â€¢ ${financialContact.cpf_cnpj}` : ""}
                      </p>
                      {financialContact?.email ? <p className="mt-1 text-sm text-gray-500">{financialContact.email}</p> : null}
                    </CardContent>
                  </Card>

                  <Card className="border-gray-200 bg-white">
                    <CardContent className="p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">ResponsÃ¡veis vinculados ao cÃ£o</p>
                      <div className="mt-4 space-y-3">
                        {linkedResponsaveis.length > 0 ? linkedResponsaveis.map((responsavel) => (
                          <div key={responsavel.id} className="rounded-2xl bg-gray-50 px-4 py-3">
                            <p className="font-medium text-gray-900">{responsavel.nome_completo}</p>
                            <p className="mt-1 text-sm text-gray-600">
                              {responsavel.celular || "-"} {responsavel.email ? `â€¢ ${responsavel.email}` : ""}
                            </p>
                          </div>
                        )) : (
                          <div className="rounded-2xl bg-gray-50 px-4 py-4 text-sm text-gray-500">
                            Nenhum responsÃ¡vel adicional foi encontrado para este cÃ£o.
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : null}

              {currentStep === "caes" ? (
                <div className="space-y-4">
                  <Card className="border-gray-200 bg-white">
                    <CardContent className="p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Atendimento em ediÃ§Ã£o</p>
                      <h3 className="mt-2 text-lg font-bold text-gray-900">
                        {selectedGroupBaseCao ? getGroupTitle(selectedGroup, selectedGroupBaseCao) : "Atendimento"}
                      </h3>
                      <p className="mt-2 text-sm text-gray-600">
                        {selectedGroupBaseCao ? getGroupDescription(selectedGroup, selectedGroupBaseCao) : ""}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-gray-200 bg-white">
                    <CardContent className="p-5">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">CÃ£o vinculado neste atendimento</p>
                          <div className="mt-3">
                            <Label className="text-sm text-gray-700">Selecione o cÃ£o</Label>
                            <Select value={groupDraft?.dog_id || ""} onValueChange={(value) => patchGroupDraft({ dog_id: value })}>
                              <SelectTrigger className="mt-2">
                                <SelectValue placeholder="Escolha o cÃ£o" />
                              </SelectTrigger>
                              <SelectContent>
                                {(dogs || []).map((dog) => (
                                  <SelectItem key={dog.id} value={dog.id}>
                                    {dog.nome} {dog.raca ? `(${dog.raca})` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {selectedGroup?.kind === "hospedagem" ? (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">ConfiguraÃ§Ã£o do canil</p>
                            <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <Label className="text-sm font-medium text-gray-900">Divide canil</Label>
                                  <p className="mt-1 text-xs text-gray-500">Se este cÃ£o divide hospedagem, selecione os demais envolvidos.</p>
                                </div>
                                <Switch
                                  checked={getSharedKennelEnabled(groupDraft)}
                                  onCheckedChange={(checked) => patchGroupDraft({
                                    hosp_dormitorio_compartilhado: checked,
                                    "hosp_dormitÃƒÂ³rio_compartilhado": checked,
                                  })}
                                />
                              </div>

                              {getSharedKennelEnabled(groupDraft) ? (
                                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                  {availableKennelDogs.map((dog) => (
                                    <label key={dog.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-gray-700">
                                      <input
                                        type="checkbox"
                                        checked={getSharedKennelDogs(groupDraft).includes(dog.id)}
                                        onChange={() => toggleSharedKennelDog(dog.id)}
                                      />
                                      {dog.nome}
                                    </label>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-gray-200 bg-white">
                    <CardContent className="p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">ProteÃ§Ã£o do histÃ³rico</p>
                      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                        {selectedGroup.hasOperationalRecord
                          ? "Este atendimento jÃ¡ possui check-in ou check-out. VocÃª pode ajustar datas e detalhes, mas o novo perÃ­odo precisa continuar cobrindo os registros que jÃ¡ existem."
                          : "Este atendimento ainda nÃ£o possui registro operacional. VocÃª pode ajustar cÃ£o, datas e detalhes normalmente."}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : null}

              {currentStep === "periodo" ? renderPeriodStep() : null}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 border-t pt-4">
          {selectedGroup ? (
            <>
              <Button variant="outline" onClick={cancelGroupEditor} disabled={isSaving}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para a lista
              </Button>
              <Button onClick={saveCurrentGroupDraft} className="bg-blue-600 text-white hover:bg-blue-700" disabled={isSaving}>
                <Save className="mr-2 h-4 w-4" />
                Salvar este atendimento
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={isSaving}>
                Voltar
              </Button>
              <Button onClick={saveAllChanges} className="bg-green-600 text-white hover:bg-green-700" disabled={isSaving || isLoading}>
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Salvando..." : "Salvar alteraÃ§Ãµes do orÃ§amento"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


