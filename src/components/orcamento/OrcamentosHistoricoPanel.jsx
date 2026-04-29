import React, { useEffect, useState } from "react";
import { Appointment, Carteira, Checkin, ContaReceber, Dog, Orcamento, Replacement, Responsavel, TabelaPrecos, User } from "@/api/entities";
import { notificacoesOrcamento } from "@/api/functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import SearchFiltersToolbar from "@/components/common/SearchFiltersToolbar";
import OrcamentoAgendamentoEditorDialog from "@/components/orcamento/OrcamentoAgendamentoEditorDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPageUrl } from "@/utils";
import {
  AlertTriangle,
  BellRing,
  Search,
  FileText,
  Eye,
  Trash2,
  Calendar,
  Filter,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  Send,
  MessageSquareText,
  Pencil,
  Save,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  buildAppointmentsFromOrcamento,
  buildDogOwnerIndex,
  buildPricingConfig,
  getAppointmentDateKey,
  getAppointmentEndDateKey,
  getAppointmentMeta,
  getAppointmentTimeValue,
  getServiceLabel,
  isApprovedOrcamentoStatus,
} from "@/lib/attendance";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function formatDate(value) {
  return value ? format(new Date(value), "dd/MM/yyyy", { locale: ptBR }) : "-";
}

function formatTime(value) {
  return value || "-";
}

function formatTimeRange(startTime, endTime) {
  if (startTime && endTime) return `${startTime} às ${endTime}`;
  if (startTime) return startTime;
  if (endTime) return endTime;
  return "-";
}

function formatTimeValue(value) {
  return value ? String(value).slice(0, 5) : "";
}

function combineDateTimeLocal(date, time) {
  if (!date) return null;
  const normalizedTime = (time || "09:00").slice(0, 5);
  return `${date}T${normalizedTime}:00`;
}

function getCreatedTimestamp(record) {
  const candidates = [record?.created_date, record?.created_at, record?.data_criacao];
  for (const value of candidates) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (Number.isFinite(time)) return time;
  }
  return 0;
}

function inferOrcamentoServiceDate(cao, orcamento) {
  return (
    cao?.day_care_data ||
    cao?.adaptacao_data ||
    cao?.banho_data ||
    cao?.tosa_data ||
    cao?.hosp_data_entrada ||
    (cao?.transporte_viagens || []).find((viagem) => viagem?.data)?.data ||
    orcamento?.data_criacao ||
    ""
  );
}

function buildIncludedAppointments(orcamento, dogs = []) {
  const dogsById = Object.fromEntries((dogs || []).map((dog) => [dog.id, dog]));

  return (orcamento?.caes || [])
    .map((cao, index) => {
      const dog = dogsById[cao?.dog_id];
    const dogName = dog?.nome || `Cão ${index + 1}`;
      const items = [];

      if (cao?.servicos?.day_care && cao?.day_care_data) {
        items.push({
          key: `${cao.dog_id || index}-daycare`,
          title: "Day Care",
          lines: [`Dia agendado: ${formatDate(cao.day_care_data)}`],
        });
      }

      if (cao?.servicos?.hospedagem && cao?.hosp_data_entrada && cao?.hosp_data_saida) {
        items.push({
          key: `${cao.dog_id || index}-hospedagem`,
          title: "Hospedagem",
          lines: [
            `Entrada: ${formatDate(cao.hosp_data_entrada)} às ${formatTime(cao.hosp_horario_entrada)}`,
            `Saída: ${formatDate(cao.hosp_data_saida)} às ${formatTime(cao.hosp_horario_saida)}`,
            ...(cao.hosp_datas_daycare || []).filter(Boolean).length > 0
              ? [`Day Care/Pernoite: ${(cao.hosp_datas_daycare || []).filter(Boolean).map((date) => formatDate(date)).join(", ")}`]
              : [],
          ],
        });
      }

      if (cao?.servicos?.adaptacao && cao?.adaptacao_data) {
        items.push({
          key: `${cao.dog_id || index}-adaptacao`,
          title: "Adaptação",
          lines: [
            `Dia: ${formatDate(cao.adaptacao_data)}`,
            `HorÃ¡rio: ${formatTimeRange(cao.adaptacao_horario_entrada, cao.adaptacao_horario_saida)}`,
          ],
        });
      }

      if (cao?.servicos?.banho) {
        const banhoDate = cao?.banho_data || inferOrcamentoServiceDate(cao, orcamento);
        items.push({
          key: `${cao.dog_id || index}-banho`,
          title: "Banho",
          lines: [
            `Dia: ${formatDate(banhoDate)}`,
            `HorÃ¡rio: ${formatTimeRange(cao.banho_horario_inicio || cao.banho_horario, cao.banho_horario_saida)}`,
          ],
        });
      }

      if (cao?.servicos?.tosa && cao?.tosa_tipo) {
        const tosaDate = cao?.tosa_data || inferOrcamentoServiceDate(cao, orcamento);
        items.push({
          key: `${cao.dog_id || index}-tosa`,
          title: "Tosa",
          lines: [
            `Dia: ${formatDate(tosaDate)}`,
            `HorÃ¡rio: ${formatTimeRange(cao.tosa_horario_entrada, cao.tosa_horario_saida)}`,
          ],
        });
      }

      if (cao?.servicos?.transporte) {
        (cao?.transporte_viagens || []).forEach((viagem, viagemIndex) => {
          if (!viagem?.data && !viagem?.partida && !viagem?.destino) return;
          items.push({
            key: `${cao.dog_id || index}-transporte-${viagemIndex}`,
            title: `Transporte ${viagemIndex + 1}`,
            lines: [
              `Partida: ${viagem.partida || "-"}`,
              `Destino: ${viagem.destino || "-"}`,
              `Dia: ${formatDate(viagem.data)}`,
              `HorÃ¡rio: ${formatTimeRange(viagem.horario, viagem.horario_fim)}`,
            ],
          });
        });
      }

      return {
        dogId: cao?.dog_id || `${index}`,
        dogName,
        items,
      };
    })
    .filter((group) => group.items.length > 0);
}

function getSafeMetadata(record) {
  const metadata = record?.metadata;
  if (!metadata) return {};
  if (typeof metadata === "object") return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

function isAppointmentFromOrcamento(appointment, orcamentoId) {
  if (!appointment || !orcamentoId) return false;
  const metadata = getAppointmentMeta(appointment);
  const sourceKey = String(appointment.source_key || "");
  return appointment.orcamento_id === orcamentoId
    || metadata.orcamento_id === orcamentoId
    || (appointment.source_type === "orcamento_aprovado" && sourceKey.startsWith(`orcamento|${orcamentoId}|`));
}

function getAppointmentsGeneratedFromOrcamento(appointments = [], orcamentoId) {
  const linkedIds = new Set();
  const linkedSourceKeys = new Set();

  appointments.forEach((appointment) => {
    if (!isAppointmentFromOrcamento(appointment, orcamentoId)) return;
    linkedIds.add(appointment.id);
    if (appointment.source_key) linkedSourceKeys.add(appointment.source_key);

    const metadata = getAppointmentMeta(appointment);
    if (metadata.replacement_scheduled_appointment_id) {
      linkedIds.add(metadata.replacement_scheduled_appointment_id);
    }
    if (metadata.replacement_scheduled_source_key) {
      linkedSourceKeys.add(metadata.replacement_scheduled_source_key);
    }
  });

  let added = true;
  while (added) {
    added = false;
    appointments.forEach((appointment) => {
      if (!appointment?.id || linkedIds.has(appointment.id)) return;
      const metadata = getAppointmentMeta(appointment);
      const sourceKey = String(appointment.source_key || "");
      const replacementOfId = metadata.replacement_of_appointment_id;
      const replacementOfSourceKey = metadata.replacement_of_source_key || metadata.replacement_scheduled_source_key;
      const sourceKeyLinkedToOriginal = [...linkedIds].some((appointmentId) =>
        sourceKey.startsWith(`reposicao_pacote|${appointmentId}|`)
      );

      if (
        linkedSourceKeys.has(sourceKey)
        || (replacementOfId && linkedIds.has(replacementOfId))
        || (replacementOfSourceKey && linkedSourceKeys.has(replacementOfSourceKey))
        || sourceKeyLinkedToOriginal
      ) {
        linkedIds.add(appointment.id);
        if (appointment.source_key) linkedSourceKeys.add(appointment.source_key);
        if (metadata.replacement_scheduled_appointment_id) {
          linkedIds.add(metadata.replacement_scheduled_appointment_id);
        }
        if (metadata.replacement_scheduled_source_key) {
          linkedSourceKeys.add(metadata.replacement_scheduled_source_key);
        }
        added = true;
      }
    });
  }

  return appointments.filter((appointment) => linkedIds.has(appointment.id));
}

function checkinMatchesAppointment(checkin, appointment) {
  if (!checkin || !appointment) return false;
  const metadata = getSafeMetadata(checkin);
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

function isReceivableLinkedToDeletion(receivable, orcamentoId, appointmentIds) {
  if (!receivable) return false;
  const metadata = getSafeMetadata(receivable);
  const sourceKey = String(receivable.source_key || "");
  return receivable.orcamento_id === orcamentoId
    || metadata.orcamento_id === orcamentoId
    || appointmentIds.has(receivable.appointment_id)
    || appointmentIds.has(metadata.appointment_id)
    || [...appointmentIds].some((appointmentId) => sourceKey.includes(`|${appointmentId}|`));
}

function isReplacementLinkedToDeletion(replacement, orcamentoId, appointmentIds) {
  if (!replacement) return false;
  const metadata = getSafeMetadata(replacement);
  const possibleAppointmentIds = [
    replacement.appointment_id,
    replacement.source_appointment_id,
    replacement.original_appointment_id,
    replacement.linked_appointment_id,
    replacement.replacement_of_appointment_id,
    metadata.appointment_id,
    metadata.source_appointment_id,
    metadata.original_appointment_id,
    metadata.linked_appointment_id,
    metadata.replacement_of_appointment_id,
  ];

  return replacement.orcamento_id === orcamentoId
    || metadata.orcamento_id === orcamentoId
    || possibleAppointmentIds.some((appointmentId) => appointmentIds.has(appointmentId));
}

function buildOperationalRecordSuggestion(appointments = [], dogs = []) {
  const dogsById = Object.fromEntries((dogs || []).map((dog) => [dog.id, dog]));
  return appointments
    .slice(0, 8)
    .map((appointment) => {
      const dogName = dogsById[appointment.dog_id]?.nome || "Cão";
      const serviceDate = getAppointmentDateKey(appointment);
      return {
        id: appointment.id,
        dogName,
        serviceName: getServiceLabel(appointment.service_type),
        serviceDate,
      };
    });
}

function serializeOperationalAppointmentForPrefill(appointment) {
  const metadata = getAppointmentMeta(appointment);
  return {
    id: appointment.id,
    empresa_id: appointment.empresa_id || null,
    cliente_id: appointment.cliente_id || null,
    dog_id: appointment.dog_id || "",
    service_type: appointment.service_type || "",
    charge_type: appointment.charge_type || "",
    data_referencia: appointment.data_referencia || "",
    data_hora_entrada: appointment.data_hora_entrada || "",
    data_hora_saida: appointment.data_hora_saida || "",
    hora_entrada: appointment.hora_entrada || "",
    hora_saida: appointment.hora_saida || "",
    observacoes: appointment.observacoes || "",
    source_type: appointment.source_type || "",
    source_key: appointment.source_key || "",
    metadata,
  };
}

function buildAppointmentEditRow(appointment) {
  const metadata = getAppointmentMeta(appointment);
  const snapshot = metadata.snapshot || {};
  const sharedDogs = Array.isArray(snapshot.hosp_dormitorio_com)
    ? snapshot.hosp_dormitorio_com
    : [];

  return {
    id: appointment.id,
    dog_id: appointment.dog_id || "",
    service_type: appointment.service_type || "",
    data_inicio: getAppointmentDateKey(appointment),
    data_fim: getAppointmentEndDateKey(appointment),
    hora_entrada: getAppointmentTimeValue(appointment, "entrada"),
    hora_saida: getAppointmentTimeValue(appointment, "saida"),
    observacoes: appointment.observacoes || "",
    lembrete_data: metadata.lembrete_data || getAppointmentDateKey(appointment),
    lembrete_texto: metadata.lembrete_texto || metadata.lembrete_orcamento || "",
    lembrete_horario: metadata.lembrete_horario || metadata.lembrete_horario_orcamento || "",
    hosp_dormitorio_compartilhado: !!snapshot.hosp_dormitorio_compartilhado,
    hosp_dormitorio_com: sharedDogs.filter(Boolean),
    original: appointment,
  };
}

function buildUpdatedAppointmentPayload(row) {
  const metadata = getAppointmentMeta(row.original);
  const snapshot = { ...(metadata.snapshot || {}) };
  const serviceType = row.service_type;
  const startDate = row.data_inicio || "";
  const endDate = serviceType === "hospedagem" ? (row.data_fim || startDate) : startDate;

  if (serviceType === "hospedagem") {
    snapshot.hosp_data_entrada = startDate;
    snapshot.hosp_data_saida = endDate;
    snapshot.hosp_horario_entrada = row.hora_entrada || "";
    snapshot.hosp_horario_saida = row.hora_saida || "";
    snapshot.hosp_dormitorio_compartilhado = !!row.hosp_dormitorio_compartilhado;
    snapshot.hosp_dormitorio_com = row.hosp_dormitorio_com || [];
  }

  if (serviceType === "day_care") {
    snapshot.day_care_data = startDate;
    snapshot.day_care_horario_entrada = row.hora_entrada || "";
    snapshot.day_care_horario_saida = row.hora_saida || "";
  }

  if (serviceType === "adaptacao") {
    snapshot.adaptacao_data = startDate;
    snapshot.adaptacao_horario_entrada = row.hora_entrada || "";
    snapshot.adaptacao_horario_saida = row.hora_saida || "";
  }

  if (serviceType === "banho") {
    snapshot.banho_data = startDate;
    snapshot.banho_horario_inicio = row.hora_entrada || "";
    snapshot.banho_horario_saida = row.hora_saida || "";
  }

  if (serviceType === "tosa") {
    snapshot.tosa_data = startDate;
    snapshot.tosa_horario_entrada = row.hora_entrada || "";
    snapshot.tosa_horario_saida = row.hora_saida || "";
  }

  if (serviceType === "transporte") {
    snapshot.transporte_data = startDate;
  }

  return {
    dog_id: row.dog_id || null,
    data_referencia: startDate || null,
    data_hora_entrada: combineDateTimeLocal(startDate, row.hora_entrada || "09:00"),
    data_hora_saida: row.hora_saida ? combineDateTimeLocal(endDate, row.hora_saida) : null,
    hora_entrada: row.hora_entrada || "",
    hora_saida: row.hora_saida || "",
    observacoes: row.observacoes || "",
    metadata: {
      ...metadata,
      snapshot,
      lembrete_data: row.lembrete_data || "",
      lembrete_texto: row.lembrete_texto || "",
      lembrete_horario: row.lembrete_horario || "",
      editado_no_orcamento: true,
      editado_em: new Date().toISOString(),
    },
  };
}

function getStatusBadge(status) {
  const config = {
    rascunho: { color: "bg-gray-100 text-gray-700", icon: Clock, label: "Rascunho" },
    enviado: { color: "bg-blue-100 text-blue-700", icon: Send, label: "Enviado" },
    aprovado: { color: "bg-green-100 text-green-700", icon: CheckCircle, label: "Aprovado" },
    recusado: { color: "bg-red-100 text-red-700", icon: XCircle, label: "Recusado" },
    expirado: { color: "bg-orange-100 text-orange-700", icon: Clock, label: "Expirado" },
  };
  const current = config[status] || config.rascunho;
  const Icon = current.icon;
  return (
    <Badge className={`${current.color} flex items-center gap-1`}>
      <Icon className="h-3 w-3" />
      {current.label}
    </Badge>
  );
}

export default function OrcamentosHistoricoPanel({
  embedded = false,
  refreshKey = 0,
  openOrcamentoId = "",
  onChange,
}) {
  const [orcamentos, setOrcamentos] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);
  const [precos, setPrecos] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPeriodo, setFilterPeriodo] = useState("all");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedOrcamento, setSelectedOrcamento] = useState(null);
  const [selectedStatusDraft, setSelectedStatusDraft] = useState("");
  const [blockedDeleteContext, setBlockedDeleteContext] = useState(null);
  const [deleteConfirmContext, setDeleteConfirmContext] = useState(null);
  const [feedbackDialog, setFeedbackDialog] = useState(null);
  const [isDeletingOrcamento, setIsDeletingOrcamento] = useState(false);
  const [showAppointmentsEditor, setShowAppointmentsEditor] = useState(false);
  const [editingOrcamento, setEditingOrcamento] = useState(null);
  const [appointmentEditRows, setAppointmentEditRows] = useState([]);
  const [isLoadingAppointmentEdits, setIsLoadingAppointmentEdits] = useState(false);
  const [isSavingAppointmentEdits, setIsSavingAppointmentEdits] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  useEffect(() => {
    loadData();
  }, [refreshKey]);

  useEffect(() => {
    if (!openOrcamentoId || !orcamentos.length) return;
    const matchedOrcamento = orcamentos.find((item) => item.id === openOrcamentoId);
    if (!matchedOrcamento) return;
    openOrcamentoDetail(matchedOrcamento);
  }, [openOrcamentoId, orcamentos]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [orcData, dogsData, carteirasData, responsaveisData, precosData, currentUser] = await Promise.all([
        Orcamento.list("-created_date", 500),
        Dog.list("-created_date", 500),
        Carteira.list("-created_date", 500),
        Responsavel.list("-created_date", 500),
        TabelaPrecos.list("-created_date", 1000),
        User.me(),
      ]);
      setOrcamentos(orcData || []);
      setDogs(dogsData || []);
      setCarteiras(carteirasData || []);
      setResponsaveis(responsaveisData || []);
      setPrecos(buildPricingConfig(precosData || [], currentUser?.empresa_id || null));
    } catch (error) {
      console.error("Erro ao carregar histÃ³rico de orÃ§amentos:", error);
    }
    setIsLoading(false);
  }

  function getDogName(dogId) {
    const dog = dogs.find((item) => item.id === dogId);
    return dog?.nome || "Cão não encontrado";
  }

  function showFeedback(title, description, tone = "info") {
    setFeedbackDialog({ title, description, tone });
  }

  function openOrcamentoDetail(orcamento) {
    try {
      setSelectedOrcamento(orcamento);
      setSelectedStatusDraft(orcamento?.status || "rascunho");
      setShowDetailModal(true);
    } catch {
      setSelectedOrcamento(null);
      setSelectedStatusDraft("");
    }
  }

  async function handleDelete(id) {
    if (!id) return;
    try {
      const [appointmentRows, checkinRows, receivableRows, replacementRows] = await Promise.all([
        Appointment.listAll("-created_date", 1000, 10000),
        Checkin.listAll("-created_date", 1000, 10000),
        ContaReceber.listAll("-created_date", 1000, 10000),
        Replacement.listAll("-created_date", 1000, 10000),
      ]);

      const generatedAppointments = getAppointmentsGeneratedFromOrcamento(appointmentRows || [], id);
      const generatedAppointmentIds = new Set(generatedAppointments.map((appointment) => appointment.id).filter(Boolean));
      const operationalAppointments = generatedAppointments.filter((appointment) =>
        appointmentHasOperationalRecord(appointment, checkinRows || [])
      );

      if (operationalAppointments.length > 0) {
        setBlockedDeleteContext({
          orcamento: orcamentos.find((item) => item.id === id) || null,
          appointments: operationalAppointments,
          rows: buildOperationalRecordSuggestion(operationalAppointments, dogs),
        });
        return;
      }

      const linkedReceivables = (receivableRows || []).filter((receivable) =>
        isReceivableLinkedToDeletion(receivable, id, generatedAppointmentIds)
      );
      const linkedReplacements = (replacementRows || []).filter((replacement) =>
        isReplacementLinkedToDeletion(replacement, id, generatedAppointmentIds)
      );

      setDeleteConfirmContext({
        orcamentoId: id,
        orcamento: orcamentos.find((item) => item.id === id) || null,
        generatedAppointments,
        linkedReplacements,
        linkedReceivables,
        rows: buildOperationalRecordSuggestion(generatedAppointments, dogs),
      });
    } catch (error) {
      console.error("Erro ao excluir orÃ§amento:", error);
      showFeedback("NÃ£o foi possÃ­vel preparar a exclusÃ£o", "Tente novamente em alguns instantes.", "error");
    }
  }

  async function confirmDeleteOrcamento() {
    if (!deleteConfirmContext?.orcamentoId) return;

    setIsDeletingOrcamento(true);
    try {
      await Promise.all((deleteConfirmContext.linkedReplacements || []).map((replacement) => Replacement.delete(replacement.id)));
      await Promise.all((deleteConfirmContext.linkedReceivables || []).map((receivable) => ContaReceber.delete(receivable.id)));
      await Promise.all((deleteConfirmContext.generatedAppointments || []).map((appointment) => Appointment.delete(appointment.id)));
      await Orcamento.delete(deleteConfirmContext.orcamentoId);
      await loadData();
      await onChange?.();
      setDeleteConfirmContext(null);
      showFeedback("OrÃ§amento excluÃ­do", "Os registros gerados por ele tambÃ©m foram removidos.", "success");
    } catch (error) {
      console.error("Erro ao excluir orÃ§amento:", error);
      showFeedback("NÃ£o foi possÃ­vel excluir", "O orÃ§amento nÃ£o foi removido. Verifique as permissÃµes ou tente novamente.", "error");
    } finally {
      setIsDeletingOrcamento(false);
    }
  }

  function handleCreateBudgetForUsedAppointments() {
    if (!blockedDeleteContext?.appointments?.length) return;

    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const storageKey = `dogcity:orcamento-prefill:${token}`;
    const firstAppointment = blockedDeleteContext.appointments[0] || {};
    const payload = {
      type: "used_appointments_from_deleted_budget",
      source_orcamento_id: blockedDeleteContext.orcamento?.id || "",
      cliente_id: blockedDeleteContext.orcamento?.cliente_id || firstAppointment.cliente_id || null,
      created_at: new Date().toISOString(),
      observacoes: [
        "OrÃ§amento criado para atendimentos jÃ¡ utilizados.",
        blockedDeleteContext.orcamento?.id ? `Origem: orÃ§amento ${blockedDeleteContext.orcamento.id}.` : "",
        "Revise valores e datas antes de enviar.",
      ].filter(Boolean).join("\n"),
      appointments: blockedDeleteContext.appointments.map(serializeOperationalAppointmentForPrefill),
    };

    sessionStorage.setItem(storageKey, JSON.stringify(payload));
    window.location.href = `${createPageUrl("Orcamentos")}?prefillKey=${encodeURIComponent(token)}`;
  }

  async function handleStatusChange(id, newStatus) {
    try {
      await Orcamento.update(id, { status: newStatus });

      const currentOrcamento = orcamentos.find((item) => item.id === id);
      const nextOrcamento = currentOrcamento ? { ...currentOrcamento, status: newStatus } : null;

      if (nextOrcamento) {
        try {
          const existingAppointments = await Appointment.listAll("-created_date", 1000, 5000);
          const linkedAppointments = (existingAppointments || []).filter(
            (item) => item.orcamento_id === id && item.source_type === "orcamento_aprovado"
          );

          if (!isApprovedOrcamentoStatus(newStatus)) {
            await Promise.all(
              linkedAppointments.map((appointment) =>
                Appointment.update(appointment.id, {
                  status: "cancelado",
                  metadata: {
                    ...getAppointmentMeta(appointment),
                    orcamento_status_bloqueado: true,
                    orcamento_status_atual: newStatus,
                  },
                })
              )
            );
          } else {
            const [pricingRows, currentUser] = await Promise.all([
              TabelaPrecos.list("-created_date", 1000),
              User.me(),
            ]);

            const ownerByDogId = buildDogOwnerIndex(carteiras, responsaveis);
            const precos = buildPricingConfig(
              pricingRows || [],
              currentUser?.empresa_id || nextOrcamento.empresa_id || null
            );
            const plannedAppointments = buildAppointmentsFromOrcamento({
              orcamento: nextOrcamento,
              dogs,
              precos,
              ownerByDogId,
            });

            const existingBySourceKey = new Map(
              (existingAppointments || [])
                .filter((item) => item.source_key)
                .map((item) => [item.source_key, item])
            );

            for (const appointment of plannedAppointments) {
              const existing = appointment.source_key ? existingBySourceKey.get(appointment.source_key) : null;
              if (!existing) {
                await Appointment.create(appointment);
                continue;
              }

              if (existing.status === "cancelado" || getAppointmentMeta(existing).orcamento_status_bloqueado) {
                await Appointment.update(existing.id, {
                  ...appointment,
                  status: "agendado",
                  metadata: {
                    ...getAppointmentMeta(existing),
                    ...appointment.metadata,
                    orcamento_status_bloqueado: false,
                    orcamento_status_atual: newStatus,
                  },
                });
              }
            }
          }
        } catch (error) {
          console.error("Erro ao sincronizar agendamentos do orÃ§amento:", error);
        }
      }

      try {
        await notificacoesOrcamento({
          action: "status_alterado",
          data: { novo_status: newStatus },
        });
      } catch (error) {
        console.log("NotificaÃ§Ã£o de orÃ§amento nÃ£o enviada");
      }

      await loadData();
      await onChange?.();
      return true;
    } catch (error) {
      console.error("Erro ao alterar status do orÃ§amento:", error);
      showFeedback("NÃ£o foi possÃ­vel alterar o status", "A alteraÃ§Ã£o nÃ£o foi salva. Tente novamente em alguns instantes.", "error");
      return false;
    }
  }

  async function saveSelectedOrcamentoChanges() {
    if (!selectedOrcamento?.id) return;
    if (selectedStatusDraft === selectedOrcamento.status) return;

    setIsSavingStatus(true);
    const saved = await handleStatusChange(selectedOrcamento.id, selectedStatusDraft);
    if (saved) {
      setSelectedOrcamento((current) => current ? { ...current, status: selectedStatusDraft } : current);
      showFeedback("AlteraÃ§Ãµes salvas", "O status do orÃ§amento foi atualizado.", "success");
    }
    setIsSavingStatus(false);
  }

  async function openAppointmentsEditor(orcamento) {
    if (!orcamento?.id) return;
    setEditingOrcamento(orcamento);
    setShowAppointmentsEditor(true);
  }

  function updateAppointmentEditRow(rowId, patch) {
    setAppointmentEditRows((currentRows) =>
      currentRows.map((row) => row.id === rowId ? { ...row, ...patch } : row)
    );
  }

  function toggleSharedKennelDog(rowId, dogId) {
    setAppointmentEditRows((currentRows) =>
      currentRows.map((row) => {
        if (row.id !== rowId) return row;
        const currentIds = new Set(row.hosp_dormitorio_com || []);
        if (currentIds.has(dogId)) currentIds.delete(dogId);
        else currentIds.add(dogId);
        return { ...row, hosp_dormitorio_com: [...currentIds] };
      })
    );
  }

  async function saveAppointmentEdits() {
    if (!appointmentEditRows.length) return;
    setIsSavingAppointmentEdits(true);
    try {
      await Promise.all(
        appointmentEditRows.map((row) => Appointment.update(row.id, buildUpdatedAppointmentPayload(row)))
      );
      await loadData();
      await onChange?.();
      setShowAppointmentsEditor(false);
      setEditingOrcamento(null);
      showFeedback("Agendamentos atualizados", "As alteraÃ§Ãµes foram salvas nos agendamentos deste orÃ§amento.", "success");
    } catch (error) {
      console.error("Erro ao salvar agendamentos do orÃ§amento:", error);
      showFeedback("NÃ£o foi possÃ­vel salvar", "Revise os dados dos agendamentos e tente novamente.", "error");
    } finally {
      setIsSavingAppointmentEdits(false);
    }
  }

  const filtered = orcamentos
    .filter((orcamento) => {
      const normalizedSearch = searchTerm.toLowerCase();
      const matchSearch = !searchTerm || (
        orcamento.id?.includes(searchTerm) ||
        orcamento.caes?.some((cao) => getDogName(cao.dog_id).toLowerCase().includes(normalizedSearch))
      );

      const matchStatus = filterStatus === "all" || orcamento.status === filterStatus;

      let matchPeriodo = true;
      if (filterPeriodo !== "all" && orcamento.data_criacao) {
        const dataCriacao = new Date(orcamento.data_criacao);
        const hoje = new Date();
        const diferencaDias = (hoje - dataCriacao) / (1000 * 60 * 60 * 24);
        if (filterPeriodo === "7dias") matchPeriodo = diferencaDias <= 7;
        if (filterPeriodo === "30dias") matchPeriodo = diferencaDias <= 30;
        if (filterPeriodo === "90dias") matchPeriodo = diferencaDias <= 90;
      }

      return matchSearch && matchStatus && matchPeriodo;
    })
    .sort((a, b) => getCreatedTimestamp(b) - getCreatedTimestamp(a));

  const stats = {
    total: orcamentos.length,
    aprovados: orcamentos.filter((item) => item.status === "aprovado").length,
    enviados: orcamentos.filter((item) => item.status === "enviado").length,
    valorTotal: orcamentos
      .filter((item) => item.status === "aprovado")
      .reduce((accumulator, item) => accumulator + (item.valor_total || 0), 0),
  };

  const selectedOrcamentoIncludedAppointments = selectedOrcamento
    ? buildIncludedAppointments(selectedOrcamento, dogs)
    : [];
  const deleteConfirmRows = deleteConfirmContext?.rows || [];
  const FeedbackIcon = feedbackDialog?.tone === "success" ? CheckCircle : AlertTriangle;
  const feedbackToneClasses = feedbackDialog?.tone === "error"
    ? "bg-red-100 text-red-700"
    : feedbackDialog?.tone === "success"
      ? "bg-green-100 text-green-700"
      : "bg-blue-100 text-blue-700";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-12 w-12 animate-spin rounded-full border-b-4 border-blue-600" />
      </div>
    );
  }

  const content = (
    <>
      {!embedded && (
        <>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-600">
                <FileText className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Histórico de Orçamentos</h1>
              </div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card className="border-blue-200 bg-white">
              <CardContent className="p-4 text-center">
                <FileText className="mx-auto mb-2 h-8 w-8 text-blue-600" />
                <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
                <p className="text-sm text-gray-600">Total</p>
              </CardContent>
            </Card>
            <Card className="border-green-200 bg-white">
              <CardContent className="p-4 text-center">
                <CheckCircle className="mx-auto mb-2 h-8 w-8 text-green-600" />
                <p className="text-2xl font-bold text-green-600">{stats.aprovados}</p>
                <p className="text-sm text-gray-600">Aprovados</p>
              </CardContent>
            </Card>
            <Card className="border-orange-200 bg-white">
              <CardContent className="p-4 text-center">
                <Send className="mx-auto mb-2 h-8 w-8 text-orange-600" />
                <p className="text-2xl font-bold text-orange-600">{stats.enviados}</p>
                <p className="text-sm text-gray-600">Aguardando</p>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 bg-white">
              <CardContent className="p-4 text-center">
                <Download className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(stats.valorTotal)}</p>
                <p className="text-sm text-gray-600">Valor aprovado</p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card className="border-gray-200 bg-white">
        <CardHeader className={embedded ? "border-b border-gray-100" : undefined}>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            {embedded ? "Histórico de Orçamentos" : "Orçamentos"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-b border-gray-100 p-4">
            <SearchFiltersToolbar
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar por cão ou ID..."
              hasActiveFilters={Boolean(searchTerm || filterStatus !== "all" || filterPeriodo !== "all")}
              onClear={() => {
                setSearchTerm("");
                setFilterStatus("all");
                setFilterPeriodo("all");
              }}
              filters={[
                {
                  id: "status",
                  label: "Status",
                  icon: Filter,
                  active: filterStatus !== "all",
                  content: (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Status do orçamento</p>
                      <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os status</SelectItem>
                          <SelectItem value="rascunho">Rascunho</SelectItem>
                          <SelectItem value="enviado">Enviado</SelectItem>
                          <SelectItem value="aprovado">Aprovado</SelectItem>
                          <SelectItem value="recusado">Recusado</SelectItem>
                          <SelectItem value="expirado">Expirado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ),
                },
                {
                  id: "periodo",
                  label: "Período",
                  icon: Calendar,
                  active: filterPeriodo !== "all",
                  content: (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Período</p>
                      <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todo período</SelectItem>
                          <SelectItem value="7dias">Últimos 7 dias</SelectItem>
                          <SelectItem value="30dias">Últimos 30 dias</SelectItem>
                          <SelectItem value="90dias">Últimos 90 dias</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ),
                },
              ]}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="mx-auto mb-4 h-12 w-12 text-gray-300" />
              <p className="text-gray-500">Nenhum orçamento encontrado</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map((orcamento) => (
                <div key={orcamento.id} className="p-4 transition-colors hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                          <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {orcamento.caes?.map((cao) => getDogName(cao.dog_id)).join(", ") || "Sem cães"}
                          </p>
                          <p className="text-sm text-gray-500">
                            Criado em {formatDate(orcamento.data_criacao)} • Válido até {formatDate(orcamento.data_validade)}
                          </p>
                        </div>
                      </div>

                      <div className="mb-2 ml-0 flex flex-wrap gap-2 sm:ml-13">
                        {orcamento.subtotal_hospedagem > 0 && (
                          <Badge variant="outline" className="text-xs">Hospedagem</Badge>
                        )}
                        {orcamento.subtotal_servicos > 0 && (
                          <Badge variant="outline" className="text-xs">Serviços</Badge>
                        )}
                        {orcamento.subtotal_transporte > 0 && (
                          <Badge variant="outline" className="text-xs">Transporte</Badge>
                        )}
                      </div>

                      {orcamento.observacoes && (
                        <p className="ml-0 rounded bg-yellow-50 p-2 text-sm text-gray-600 sm:ml-13">
                          {orcamento.observacoes}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span className="text-xl font-bold text-green-600">{formatCurrency(orcamento.valor_total)}</span>
                      {getStatusBadge(orcamento.status)}

                      <div className="mt-2 flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openOrcamentoDetail(orcamento)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDelete(orcamento.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={showDetailModal}
        onOpenChange={(open) => {
          setShowDetailModal(open);
          if (!open) setSelectedStatusDraft(selectedOrcamento?.status || "");
        }}
      >
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-[600px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Orçamento</DialogTitle>
            <DialogDescription className="sr-only">
              Visualização detalhada do orçamento com ações de status e edição dos agendamentos.
            </DialogDescription>
          </DialogHeader>
          {selectedOrcamento && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Status:</span>
                {getStatusBadge(selectedOrcamento.status)}
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Criado em:</span>
                <span>{formatDate(selectedOrcamento.data_criacao)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Válido até:</span>
                <span>{formatDate(selectedOrcamento.data_validade)}</span>
              </div>

              <hr />

              <h4 className="font-semibold">Cães:</h4>
              {selectedOrcamento.caes?.map((cao, index) => (
                <div key={`${cao.dog_id || "cao"}-${index}`} className="rounded-lg bg-gray-50 p-3">
                  <p className="font-medium">{getDogName(cao.dog_id)}</p>
                </div>
              ))}

              {selectedOrcamentoIncludedAppointments.length > 0 && (
                <div>
                  <h4 className="mb-3 font-semibold">Agendamentos incluídos</h4>
                  <div className="space-y-3">
                    {selectedOrcamentoIncludedAppointments.map((group) => (
                      <div key={group.dogId} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <p className="font-medium text-gray-900">{group.dogName}</p>
                        <div className="mt-3 space-y-2">
                          {group.items.map((item) => (
                            <div key={item.key} className="rounded-lg border border-white bg-white p-3">
                              <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                              <div className="mt-2 space-y-1">
                                {item.lines.map((line) => (
                                  <p key={line} className="text-sm text-gray-600">{line}</p>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <hr />

              <div className="space-y-2">
                {selectedOrcamento.subtotal_hospedagem > 0 && (
                  <div className="flex justify-between">
                    <span>Hospedagem:</span>
                    <span>{formatCurrency(selectedOrcamento.subtotal_hospedagem)}</span>
                  </div>
                )}
                {selectedOrcamento.subtotal_servicos > 0 && (
                  <div className="flex justify-between">
                    <span>Serviços:</span>
                    <span>{formatCurrency(selectedOrcamento.subtotal_servicos)}</span>
                  </div>
                )}
                {selectedOrcamento.subtotal_transporte > 0 && (
                  <div className="flex justify-between">
                    <span>Transporte:</span>
                    <span>{formatCurrency(selectedOrcamento.subtotal_transporte)}</span>
                  </div>
                )}
                {selectedOrcamento.desconto_total > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Descontos:</span>
                    <span>-{formatCurrency(selectedOrcamento.desconto_total)}</span>
                  </div>
                )}
                <hr />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span className="text-green-600">{formatCurrency(selectedOrcamento.valor_total)}</span>
                </div>
              </div>

              {selectedOrcamento.observacoes && (
                <>
                  <hr />
                  <div>
                    <h4 className="mb-2 font-semibold">Observações</h4>
                    <p className="rounded bg-yellow-50 p-3 text-gray-600">{selectedOrcamento.observacoes}</p>
                  </div>
                </>
              )}

              <hr />
              <div>
                <h4 className="mb-2 font-semibold">Alterar status</h4>
                <div className="flex flex-wrap gap-2">
                  {["rascunho", "enviado", "aprovado", "recusado"].map((status) => (
                    <Button
                      key={status}
                      variant={selectedStatusDraft === status ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedStatusDraft(status)}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Button>
                  ))}
                </div>
                {selectedStatusDraft !== selectedOrcamento.status && (
                  <p className="mt-2 text-sm text-blue-700">
                    Alteração pendente. Clique em salvar para aplicar.
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDetailModal(false)}>Fechar</Button>
            <Button
              variant="outline"
              onClick={() => openAppointmentsEditor(selectedOrcamento)}
              disabled={!selectedOrcamento?.id}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </Button>
            <Button
              onClick={saveSelectedOrcamentoChanges}
              disabled={!selectedOrcamento?.id || selectedStatusDraft === selectedOrcamento?.status || isSavingStatus}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSavingStatus ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OrcamentoAgendamentoEditorDialog
        open={showAppointmentsEditor}
        orcamento={editingOrcamento}
        dogs={dogs}
        carteiras={carteiras}
        responsaveis={responsaveis}
        precos={precos}
        onClose={() => {
          setShowAppointmentsEditor(false);
          setEditingOrcamento(null);
          setAppointmentEditRows([]);
        }}
        onSaved={async (updatedOrcamento) => {
          setSelectedOrcamento(updatedOrcamento);
          setSelectedStatusDraft(updatedOrcamento?.status || "rascunho");
          setShowAppointmentsEditor(false);
          setEditingOrcamento(null);
          setAppointmentEditRows([]);
          await loadData();
          await onChange?.();
          showFeedback("Agendamentos atualizados", "As alterações foram salvas no orçamento e nos agendamentos vinculados.", "success");
        }}
        onFeedback={showFeedback}
      />

      <Dialog open={Boolean(blockedDeleteContext)} onOpenChange={(open) => !open && setBlockedDeleteContext(null)}>
        <DialogContent className="max-h-[92vh] w-[95vw] max-w-[680px] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-amber-100 p-3">
                <AlertTriangle className="h-6 w-6 text-amber-700" />
              </div>
              <div>
                <DialogTitle>Orçamento com atendimento já registrado</DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-6">
                  A exclusão foi bloqueada para proteger o histórico operacional. Já existe check-in ou check-out em agendamentos gerados por este orçamento.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Atendimentos que serão levados para o novo orçamento</p>
              <div className="mt-3 space-y-2">
                {(blockedDeleteContext?.rows || []).map((row) => (
                  <div key={row.id} className="flex flex-col gap-1 rounded-xl bg-white px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{row.dogName}</p>
                      <p className="text-gray-600">{row.serviceName}</p>
                    </div>
                    <Badge variant="outline">{row.serviceDate ? formatDate(row.serviceDate) : "Data não informada"}</Badge>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-sm leading-6 text-gray-600">
              Use o botão abaixo para abrir um orçamento já preenchido com os cães, responsável financeiro e serviços que foram utilizados. Depois revise valores e envie normalmente.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBlockedDeleteContext(null)}>
              Manter orçamento atual
            </Button>
            <Button onClick={handleCreateBudgetForUsedAppointments} className="bg-blue-600 text-white hover:bg-blue-700">
              <FileText className="mr-2 h-4 w-4" />
              Criar orçamento para o que já foi utilizado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteConfirmContext)}
        onOpenChange={(open) => {
          if (!open && !isDeletingOrcamento) setDeleteConfirmContext(null);
        }}
      >
        <DialogContent className="max-h-[92vh] w-[95vw] max-w-[640px] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-red-100 p-3">
                <Trash2 className="h-6 w-6 text-red-700" />
              </div>
              <div>
            <DialogTitle>Excluir orçamento?</DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-6">
              Esta ação remove o orçamento e os registros gerados por ele. Nenhum atendimento com check-in ou check-out foi encontrado neste vínculo.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Agendamentos", value: deleteConfirmContext?.generatedAppointments?.length || 0 },
                { label: "Reposições", value: deleteConfirmContext?.linkedReplacements?.length || 0 },
                { label: "Valores a receber", value: deleteConfirmContext?.linkedReceivables?.length || 0 },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-2xl font-bold text-gray-900">{item.value}</p>
                  <p className="mt-1 text-sm text-gray-600">{item.label}</p>
                </div>
              ))}
            </div>

            {deleteConfirmRows.length > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-sm font-semibold text-gray-900">Registros que serão removidos</p>
                <div className="mt-3 space-y-2">
                  {deleteConfirmRows.slice(0, 4).map((row) => (
                    <div key={row.id} className="flex flex-col gap-1 rounded-xl bg-gray-50 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{row.dogName}</p>
                        <p className="text-gray-600">{row.serviceName}</p>
                      </div>
                  <Badge variant="outline">{row.serviceDate ? formatDate(row.serviceDate) : "Data não informada"}</Badge>
                    </div>
                  ))}
                </div>
                {deleteConfirmRows.length > 4 && (
                  <p className="mt-3 text-xs text-gray-500">+{deleteConfirmRows.length - 4} registro(s) relacionado(s)</p>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
              Confirme apenas se deseja remover estes registros gerados automaticamente junto com o orçamento.
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmContext(null)} disabled={isDeletingOrcamento}>
              Cancelar
            </Button>
            <Button onClick={confirmDeleteOrcamento} disabled={isDeletingOrcamento} className="bg-red-600 text-white hover:bg-red-700">
              <Trash2 className="mr-2 h-4 w-4" />
            {isDeletingOrcamento ? "Excluindo..." : "Excluir orçamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(feedbackDialog)} onOpenChange={(open) => !open && setFeedbackDialog(null)}>
        <DialogContent className="w-[95vw] max-w-[460px]">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className={`rounded-2xl p-3 ${feedbackToneClasses}`}>
                <FeedbackIcon className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle>{feedbackDialog?.title}</DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-6">
                  {feedbackDialog?.description}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setFeedbackDialog(null)} className="bg-blue-600 text-white hover:bg-blue-700">
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-7xl">
        {content}
      </div>
    </div>
  );
}
