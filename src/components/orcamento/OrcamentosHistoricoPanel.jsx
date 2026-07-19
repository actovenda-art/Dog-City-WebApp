import React, { useEffect, useState } from "react";
import { Appointment, Carteira, Checkin, ContaReceber, Dog, IntegracaoConfig, Orcamento, OrcamentoPagamento, PackageSession, RecurringPackage, Replacement, Responsavel, TabelaPrecos, User } from "@/api/entities";
import LoadingScreen from "@/components/layout/LoadingScreen";
import {
  bancoInter,
  financeApplyCompensatoryCredit,
  financeApproveBudgetWithAuthorization,
  financeExpireBudgets,
  financeProcessBudgetCancellationV2,
  financePreviewBudgetConsumption,
  financeShadowSync,
  financeWalletBudgetReadContext,
  notificacoesOrcamento,
  responsavelApproval,
  whatsappBridge,
} from "@/api/functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import FinancialOperationalAlert from "@/components/finance/FinancialOperationalAlert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Copy,
  XCircle,
  Clock,
  CreditCard,
  Landmark,
  RefreshCw,
  ReceiptText,
  QrCode,
  Send,
  MessageSquareText,
  Pencil,
  Save,
  Link2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  buildAppointmentsFromOrcamento,
  buildDogOwnerIndex,
  buildPricingConfig,
  calculateTosaValue,
  getAppointmentDateKey,
  getAppointmentEndDateKey,
  getAppointmentMeta,
  getAppointmentTimeValue,
  getServiceLabel,
  isApprovedOrcamentoStatus,
} from "@/lib/attendance";
import { buildShadowFinanceItemsFromOrcamento, resolveShadowChargeDueDate } from "@/lib/finance-shadow";
import { buildBudgetPreviewItems, resolveRecurringPackageFinancialBehavior } from "@/lib/finance-budget";
import { canViewSensitivePersonalData, isCommercialProfile, isManagerialProfile } from "@/lib/access-control";
import { buildFinancialOperationalStatusMap, getFinancialOperationalStatus } from "@/lib/finance-operational-status";
import { formatAddressParts, maskAddressParts, maskCpfCnpj, maskPhone, maskSensitiveValue } from "@/lib/privacy";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function formatDate(value) {
  return value ? format(new Date(value), "dd/MM/yyyy", { locale: ptBR }) : "-";
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isBudgetExpired(orcamento, referenceDate = getLocalDateKey()) {
  if (!orcamento) return false;
  if (String(orcamento.status || "").trim().toLowerCase() === "expirado") return true;
  const validityDate = String(orcamento.data_validade || "").slice(0, 10);
  return Boolean(validityDate && validityDate < referenceDate);
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
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

function normalizeBudgetChargeStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (["recebido"].includes(normalized)) return "recebido";
  if (["baixado", "cancelado", "cancelada"].includes(normalized)) return "baixado";
  if (["expirado"].includes(normalized)) return "expirado";
  return "emitido";
}

function isBudgetChargeActive(status) {
  return normalizeBudgetChargeStatus(status) === "emitido";
}

function getBudgetChargeStatusBadgeClass(status) {
  const normalized = normalizeBudgetChargeStatus(status);
  if (normalized === "recebido") return "bg-emerald-100 text-emerald-700";
  if (normalized === "baixado") return "bg-amber-100 text-amber-800";
  if (normalized === "expirado") return "bg-rose-100 text-rose-700";
  return "bg-blue-100 text-blue-700";
}

function getBudgetChargeStatusLabel(status) {
  const normalized = normalizeBudgetChargeStatus(status);
  if (normalized === "recebido") return "Recebido";
  if (normalized === "baixado") return "Baixado";
  if (normalized === "expirado") return "Expirado";
  return "Emitido";
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

function appendDistinctNote(baseText, extraText) {
  const parts = [baseText, extraText]
    .flatMap((value) => String(value || "").split("\n"))
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(parts)].join("\n");
}

function buildRecurringBudgetAdjustmentNote(kind, sourceDate, targetDate) {
  if (kind === "move_target") {
    return `Tosa remanejada para este banho a partir de ${formatDate(sourceDate)}.`;
  }
  if (kind === "move_source") {
    return `Tosa remanejada deste banho para ${formatDate(targetDate)}.`;
  }
  if (kind === "credit") {
    return `Tosa deste banho convertida em credito em ${formatDate(sourceDate)}.`;
  }
  if (kind === "reused_tosa") {
    return `Tosa do plano remanejada para ${formatDate(targetDate)} junto com o banho do mesmo dia.`;
  }
  return "";
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

function getLinkedResponsaveisForDogIds(responsaveis = [], dogIds = []) {
  const targetIds = new Set((dogIds || []).filter(Boolean));
  if (!targetIds.size) return [];

  return (responsaveis || []).filter((responsavel) =>
    [1, 2, 3, 4, 5, 6, 7, 8].some((slot) => targetIds.has(responsavel?.[`dog_id_${slot}`]))
  );
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
    cancelado: { color: "bg-slate-200 text-slate-700", icon: XCircle, label: "Cancelado" },
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
  const [contasReceber, setContasReceber] = useState([]);
  const [recurringPackages, setRecurringPackages] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
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
  const [whatsappConfigs, setWhatsappConfigs] = useState([]);
  const [approvalDialog, setApprovalDialog] = useState(null);
  const [approvalPhone, setApprovalPhone] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [budgetFinanceContext, setBudgetFinanceContext] = useState(null);
  const [budgetFinancePreview, setBudgetFinancePreview] = useState(null);
  const [budgetFinanceLoading, setBudgetFinanceLoading] = useState(false);
  const [budgetFinanceError, setBudgetFinanceError] = useState("");
  const [authorizeWithoutPayment, setAuthorizeWithoutPayment] = useState(false);
  const [authorizationReason, setAuthorizationReason] = useState("");
  const [authorizationDueDate, setAuthorizationDueDate] = useState("");
  const [cancellationOrigin, setCancellationOrigin] = useState("cliente");
  const [applyCancellationPenalty, setApplyCancellationPenalty] = useState(false);
  const [cancellationPenaltyPercent, setCancellationPenaltyPercent] = useState("");
  const [allowNegativePenalty, setAllowNegativePenalty] = useState(false);
  const [generateCompensatoryCredit, setGenerateCompensatoryCredit] = useState(false);
  const [compensatoryCreditValue, setCompensatoryCreditValue] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [approvalWhatsappSlot, setApprovalWhatsappSlot] = useState("manual");
  const [isSendingApproval, setIsSendingApproval] = useState(false);
  const [budgetPayments, setBudgetPayments] = useState([]);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentTab, setPaymentTab] = useState("boleto");
  const [isIssuingBudgetPayment, setIsIssuingBudgetPayment] = useState(false);
  const [isRefreshingBudgetPayment, setIsRefreshingBudgetPayment] = useState(false);
  const [isDownloadingBudgetPayment, setIsDownloadingBudgetPayment] = useState(false);
  const financialStatusMap = React.useMemo(
    () => buildFinancialOperationalStatusMap(contasReceber),
    [contasReceber],
  );
  const selectedOrcamentoFinancialStatus = React.useMemo(
    () => getFinancialOperationalStatus(financialStatusMap, selectedOrcamento?.cliente_id || null),
    [financialStatusMap, selectedOrcamento?.cliente_id],
  );

  useEffect(() => {
    loadData();
  }, [refreshKey]);

  useEffect(() => {
    if (!openOrcamentoId || !orcamentos.length) return;
    const matchedOrcamento = orcamentos.find((item) => item.id === openOrcamentoId);
    if (!matchedOrcamento) return;
    openOrcamentoDetail(matchedOrcamento);
  }, [openOrcamentoId, orcamentos]);

  const canAuthorizeBudgetFinancially = Boolean(
    currentUser?.is_platform_admin
    || currentUser?.company_role === "platform_admin"
    || isManagerialProfile(currentUser)
    || isCommercialProfile(currentUser),
  );
  const canRevealSensitiveData = canViewSensitivePersonalData(currentUser);

  const canManageFinancialCancellation = canAuthorizeBudgetFinancially;
  const selectedBudgetPayments = React.useMemo(
    () => budgetPayments.filter((item) => item?.orcamento_id === selectedOrcamento?.id),
    [budgetPayments, selectedOrcamento?.id],
  );
  const activeBudgetBoleto = React.useMemo(
    () => selectedBudgetPayments.find((item) => item?.metodo === "boleto_bancario") || null,
    [selectedBudgetPayments],
  );
  const activeBudgetBoletoStatus = React.useMemo(
    () => normalizeBudgetChargeStatus(activeBudgetBoleto?.status),
    [activeBudgetBoleto?.status],
  );
  const selectedBudgetExpired = React.useMemo(
    () => isBudgetExpired(selectedOrcamento),
    [selectedOrcamento],
  );
  const shouldShowBudgetChargeDetails = React.useMemo(
    () => !selectedBudgetExpired && isBudgetChargeActive(activeBudgetBoleto?.status),
    [activeBudgetBoleto?.status, selectedBudgetExpired],
  );
  const issueBudgetChargeButtonLabel = React.useMemo(() => {
    if (isIssuingBudgetPayment) return "Solicitando...";
    if (["baixado", "expirado"].includes(activeBudgetBoletoStatus)) return "Emitir nova cobrança";
    return "Solicitar boleto bancário";
  }, [isIssuingBudgetPayment, activeBudgetBoletoStatus]);
  const selectedBudgetCarteira = React.useMemo(
    () => carteiras.find((item) => item?.id === selectedOrcamento?.cliente_id) || null,
    [carteiras, selectedOrcamento?.cliente_id],
  );
  const selectedBudgetResponsavel = React.useMemo(() => {
    const carteiraContact = selectedBudgetCarteira?.contato_orcamentos || {};
    const carteiraContactName = String(carteiraContact?.nome || "").trim() || String(selectedBudgetCarteira?.nome_razao_social || "").trim();
    const carteiraContactPhone = String(carteiraContact?.celular || "").trim() || String(selectedBudgetCarteira?.celular || "").trim();
    const carteiraContactEmail = String(carteiraContact?.email || "").trim() || String(selectedBudgetCarteira?.email || "").trim();
    const carteiraDocument = String(selectedBudgetCarteira?.cpf_cnpj || "").trim();

    if (selectedBudgetCarteira?.id && (carteiraContactName || carteiraContactPhone || carteiraContactEmail || carteiraDocument)) {
      return {
        id: selectedBudgetCarteira.id,
        nome_completo: carteiraContactName,
        cpf: carteiraDocument,
        email: carteiraContactEmail,
        celular: carteiraContactPhone,
        source: "carteira",
      };
    }

    const dogIds = (selectedOrcamento?.caes || []).map((cao) => cao?.dog_id).filter(Boolean);
    const linkedResponsavel = getLinkedResponsaveisForDogIds(responsaveis, dogIds)[0] || null;
    return linkedResponsavel
      ? {
        ...linkedResponsavel,
        source: "responsavel",
      }
      : null;
  }, [responsaveis, selectedOrcamento, selectedBudgetCarteira]);

  function resetBudgetFinancialDrafts() {
    setBudgetFinanceContext(null);
    setBudgetFinancePreview(null);
    setBudgetFinanceError("");
    setAuthorizeWithoutPayment(false);
    setAuthorizationReason("");
    setAuthorizationDueDate("");
    setCancellationOrigin("cliente");
    setApplyCancellationPenalty(false);
    setCancellationPenaltyPercent("");
    setAllowNegativePenalty(false);
    setGenerateCompensatoryCredit(false);
    setCompensatoryCreditValue("");
    setCancellationReason("");
  }

  useEffect(() => {
    let cancelled = false;

    async function loadBudgetFinanceContext() {
      if (!showDetailModal || !selectedOrcamento?.cliente_id || !currentUser?.empresa_id) {
        if (!cancelled) {
          resetBudgetFinancialDrafts();
        }
        return;
      }

      setBudgetFinanceLoading(true);
      setBudgetFinanceError("");
      try {
        const context = await financeWalletBudgetReadContext({
          empresa_id: currentUser.empresa_id,
          carteira_id: selectedOrcamento.cliente_id,
        });

        if (cancelled) return;
        setBudgetFinanceContext(context || null);
        if (!authorizationDueDate) {
          setAuthorizationDueDate(selectedOrcamento?.data_validade || "");
        }
      } catch (error) {
        if (cancelled) return;
        setBudgetFinanceContext(null);
        setBudgetFinancePreview(null);
        setBudgetFinanceError(error?.message || "Não foi possível carregar a carteira vinculada ao orçamento.");
      } finally {
        if (!cancelled) {
          setBudgetFinanceLoading(false);
        }
      }
    }

    loadBudgetFinanceContext();

    return () => {
      cancelled = true;
    };
  }, [
    showDetailModal,
    selectedOrcamento?.cliente_id,
    selectedOrcamento?.data_validade,
    currentUser?.empresa_id,
    authorizationDueDate,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadBudgetPreview() {
      if (
        !showDetailModal
        || selectedStatusDraft !== "aprovado"
        || !selectedOrcamento
        || !budgetFinanceContext?.carteira_conta_id
        || !budgetFinanceContext?.chronological_consumption_enabled
      ) {
        if (!cancelled) {
          setBudgetFinancePreview(null);
        }
        return;
      }

      setBudgetFinanceLoading(true);
      setBudgetFinanceError("");
      try {
        const previewItems = buildBudgetPreviewItems({
          orcamento: selectedOrcamento,
          dogs,
          precos,
          recurringPackages,
        });
        const maxAutomaticUsage = Math.min(
          Math.max(Number(budgetFinanceContext?.saldo_positivo_disponivel || 0), 0),
          Number(selectedOrcamento?.valor_total || 0),
        );
        const preview = await financePreviewBudgetConsumption({
          carteira_conta_id: budgetFinanceContext.carteira_conta_id,
          valor_orcamento_total: Number(selectedOrcamento?.valor_total || 0),
          valor_saldo_solicitado: maxAutomaticUsage,
          preview_items: previewItems,
        });

        if (cancelled) return;
        setBudgetFinancePreview(preview || null);
      } catch (error) {
        if (cancelled) return;
        setBudgetFinancePreview(null);
        setBudgetFinanceError(error?.message || "Não foi possível simular o consumo cronológico deste orçamento.");
      } finally {
        if (!cancelled) {
          setBudgetFinanceLoading(false);
        }
      }
    }

    loadBudgetPreview();

    return () => {
      cancelled = true;
    };
  }, [
    showDetailModal,
    selectedStatusDraft,
    selectedOrcamento,
    budgetFinanceContext?.carteira_conta_id,
    budgetFinanceContext?.chronological_consumption_enabled,
    budgetFinanceContext?.saldo_positivo_disponivel,
    dogs,
    precos,
    recurringPackages,
  ]);

  async function loadData() {
    setIsLoading(true);
    try {
      const loadedCurrentUser = await User.me();
      try {
        await financeExpireBudgets({
          empresa_id: loadedCurrentUser?.empresa_id || null,
        });
      } catch (expirationError) {
        console.error("Erro ao aplicar expiração automática dos orçamentos:", expirationError);
      }

      const [orcData, dogsData, carteirasData, recurringPackagesData, responsaveisData, precosData, integracoesData, receivableRows, budgetPaymentRows] = await Promise.all([
        Orcamento.list("-created_date", 500),
        Dog.list("-created_date", 500),
        Carteira.list("-created_date", 500),
        RecurringPackage.list("-created_at", 1000),
        Responsavel.list("-created_date", 500),
        TabelaPrecos.list("-created_date", 1000),
        IntegracaoConfig.list("-created_date", 100),
        ContaReceber.listAll("-created_date", 1000, 10000),
        OrcamentoPagamento.list("-created_date", 1000).catch(() => []),
      ]);
      setOrcamentos(orcData || []);
      setDogs(dogsData || []);
      setCarteiras(carteirasData || []);
      setContasReceber(receivableRows || []);
      setRecurringPackages(recurringPackagesData || []);
      setResponsaveis(responsaveisData || []);
      setCurrentUser(loadedCurrentUser || null);
      setPrecos(buildPricingConfig(precosData || [], loadedCurrentUser?.empresa_id || null));
      setWhatsappConfigs((integracoesData || []).filter((item) => (item.provider || item.nome) === "whatsapp_web"));
      setBudgetPayments(budgetPaymentRows || []);
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

  function openApprovalDialog(orcamento) {
    if (isBudgetExpired(orcamento)) {
      showFeedback(
        "Orçamento expirado",
        "A validade deste orçamento terminou. Ele permanece disponível apenas para consulta.",
        "warning",
      );
      return;
    }
    const dogIds = (orcamento?.caes || []).map((cao) => cao?.dog_id).filter(Boolean);
    const linkedResponsaveis = getLinkedResponsaveisForDogIds(responsaveis, dogIds);
    if (!linkedResponsaveis.length) {
      showFeedback("Responsável não localizado", "Vincule ao menos um responsável aos cães deste orçamento antes de solicitar uma aprovação autenticada.", "warning");
      return;
    }

    const firstResponsavel = linkedResponsaveis[0];
    const scopedWhatsappConfigs = whatsappConfigs.filter((item) => {
      const companyId = currentUser?.empresa_id || null;
      return (item.empresa_id || null) === companyId && String(item?.config?.slot_key || "");
    });

    setApprovalDialog({
      orcamento,
      responsaveis: linkedResponsaveis,
      whatsappOptions: scopedWhatsappConfigs,
      selectedResponsavelId: firstResponsavel.id,
    });
    setApprovalPhone(firstResponsavel.celular || "");
    setApprovalNote("");
    setApprovalWhatsappSlot(scopedWhatsappConfigs[0]?.config?.slot_key || "manual");
  }

  function handleApprovalResponsavelChange(responsavelId) {
    setApprovalDialog((current) => {
      if (!current) return current;
      return {
        ...current,
        selectedResponsavelId: responsavelId,
      };
    });

    const selectedResponsavel = approvalDialog?.responsaveis?.find((item) => item.id === responsavelId);
    setApprovalPhone(selectedResponsavel?.celular || "");
  }

  async function submitApprovalRequest() {
    if (!approvalDialog?.orcamento?.id || !approvalDialog?.selectedResponsavelId) return;
    setIsSendingApproval(true);
    try {
      const selectedResponsavel = approvalDialog.responsaveis.find((item) => item.id === approvalDialog.selectedResponsavelId);
      const dogIds = (approvalDialog.orcamento?.caes || []).map((cao) => cao?.dog_id).filter(Boolean);
      const requestResult = await responsavelApproval({
        action: "create_request",
        orcamento_id: approvalDialog.orcamento.id,
        responsavel_id: approvalDialog.selectedResponsavelId,
        dog_ids: dogIds,
        requested_channel: approvalWhatsappSlot === "manual" ? "manual" : "whatsapp",
        requester_note: approvalNote,
      });

      let whatsappMessageResult = null;
      if (approvalWhatsappSlot !== "manual" && approvalPhone) {
        const dogNames = dogIds.map((dogId) => getDogName(dogId)).filter(Boolean).join(", ");
        const messageLines = [
          `Olá, ${selectedResponsavel?.nome_completo || "responsável"}!`,
          "A Dog City precisa da sua confirmação autenticada para este orçamento.",
          dogNames ? `Dogs: ${dogNames}` : "",
          `Valor: ${formatCurrency(approvalDialog.orcamento?.valor_total || 0)}`,
          requestResult?.approval_url || "",
        ].filter(Boolean);

        whatsappMessageResult = await whatsappBridge({
          action: "send_message",
          slot_key: approvalWhatsappSlot,
          to: approvalPhone,
          text: messageLines.join("\n"),
        });
      }

      if (requestResult?.approval_url && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(requestResult.approval_url);
      }

      setApprovalDialog(null);
      showFeedback(
        "Solicitação pronta",
        whatsappMessageResult
          ? "O link autenticado foi gerado, copiado e enviado pelo WhatsApp selecionado."
          : "O link autenticado foi gerado e copiado. Se preferir, você pode enviá-lo manualmente.",
        "success",
      );
    } catch (error) {
      showFeedback("Não foi possível solicitar a aprovação", error?.message || "Falha ao preparar a aprovação autenticada do responsável.", "error");
    } finally {
      setIsSendingApproval(false);
    }
  }

  function openBudgetPaymentDialog() {
    if (!selectedOrcamento?.id) return;
    if (selectedBudgetExpired) {
      showFeedback(
        "Orçamento expirado",
        "A validade deste orçamento terminou. Nenhuma cobrança será emitida ou consultada no Banco Inter.",
        "warning",
      );
      return;
    }
    setPaymentTab("boleto");
    setPaymentDialogOpen(true);
  }

  async function copyPaymentValue(value, label) {
    if (!value) {
      showFeedback("Nada para copiar", `Ainda não existe ${label.toLowerCase()} disponível para esta cobrança.`, "warning");
      return;
    }
    try {
      await navigator.clipboard.writeText(String(value));
      showFeedback("Copiado", `${label} copiado para a área de transferência.`, "success");
    } catch (error) {
      showFeedback("Não foi possível copiar", error?.message || `Falha ao copiar ${label.toLowerCase()}.`, "error");
    }
  }

  async function issueBudgetCharge() {
    if (selectedBudgetExpired) {
      showFeedback(
        "Orçamento expirado",
        "A validade deste orçamento terminou. Crie um novo orçamento para emitir outra cobrança.",
        "warning",
      );
      return;
    }
    if (!selectedOrcamento?.id || !selectedBudgetCarteira?.id) {
      showFeedback("Orçamento incompleto", "Selecione um orçamento com responsável financeiro vinculado antes de emitir a cobrança.", "warning");
      return;
    }
    const billingPhone = selectedBudgetResponsavel?.celular || selectedBudgetCarteira?.celular || "";
    const missingFields = [];
    if (!selectedBudgetResponsavel?.nome_completo) missingFields.push("nome do responsável financeiro");
    if (!selectedBudgetResponsavel?.cpf) missingFields.push("CPF/CNPJ do responsável financeiro");
    if (!billingPhone) missingFields.push("telefone do responsável financeiro");
    if (!selectedBudgetCarteira?.street) missingFields.push("rua da carteira");
    if (!selectedBudgetCarteira?.city) missingFields.push("cidade da carteira");
    if (!selectedBudgetCarteira?.state) missingFields.push("UF da carteira");
    if (!selectedBudgetCarteira?.cep) missingFields.push("CEP da carteira");

    if (missingFields.length > 0) {
      showFeedback(
        "Responsável financeiro incompleto",
        `Preencha ${missingFields.join(", ")} antes de emitir a cobrança pelo Banco Inter.`,
        "warning",
      );
      return;
    }

    setIsIssuingBudgetPayment(true);
    try {
      const response = await bancoInter({
        action: "issueBudgetCharge",
        empresa_id: currentUser?.empresa_id || selectedOrcamento?.empresa_id || null,
        orcamento_id: selectedOrcamento.id,
        carteira_id: selectedBudgetCarteira.id,
        carteira_conta_id: budgetFinanceContext?.carteira_conta_id || null,
        responsavel_id: selectedBudgetResponsavel.id,
        responsavel_nome: selectedBudgetResponsavel.nome_completo,
        responsavel_cpf_cnpj: selectedBudgetResponsavel.cpf,
        responsavel_email: selectedBudgetResponsavel.email || selectedBudgetCarteira.email || "",
        responsavel_telefone: billingPhone,
        responsavel_cep: selectedBudgetCarteira.cep || "",
        responsavel_endereco: selectedBudgetCarteira.street || "",
        responsavel_numero: selectedBudgetCarteira.numero_residencia || "",
        responsavel_bairro: selectedBudgetCarteira.neighborhood || "",
        responsavel_cidade: selectedBudgetCarteira.city || "",
        responsavel_uf: selectedBudgetCarteira.state || "",
        valor: Number(selectedOrcamento.valor_total || 0),
        data_vencimento: selectedOrcamento.data_validade || format(new Date(), "yyyy-MM-dd"),
        metodo: "boleto_bancario",
        usuario_id: currentUser?.id || null,
      });

      if (response?.payment) {
        setBudgetPayments((current) => {
          const others = current.filter((item) => item?.id !== response.payment.id);
          return [response.payment, ...others];
        });
      }

      showFeedback("Cobrança emitida", "O boleto com Pix foi emitido e já pode ser compartilhado com o responsável financeiro.", "success");
    } catch (error) {
      const errorMessage = error?.message || "Revise a integração com o Banco Inter e tente novamente.";
      showFeedback(
        "Não foi possível emitir a cobrança",
        errorMessage.includes("(429)")
          ? "O Banco Inter limitou temporariamente a autenticação da integração. Aguarde alguns instantes e tente emitir novamente."
          : errorMessage,
        "error",
      );
    } finally {
      setIsIssuingBudgetPayment(false);
    }
  }

  const lastSilentBudgetRefreshRef = React.useRef("");

  async function syncBudgetChargeStatus({ silent = false, paymentId = activeBudgetBoleto?.id } = {}) {
    if (!paymentId) return null;
    if (selectedBudgetExpired) {
      if (!silent) {
        showFeedback(
          "Orçamento expirado",
          "A cobrança não será consultada porque a validade do orçamento terminou.",
          "warning",
        );
      }
      return null;
    }
    if (!silent) {
      setIsRefreshingBudgetPayment(true);
    }
    try {
      const response = await bancoInter({
        action: "refreshBudgetChargeStatus",
        empresa_id: currentUser?.empresa_id || selectedOrcamento?.empresa_id || null,
        orcamento_pagamento_id: paymentId,
      });

      if (response?.payment) {
        setBudgetPayments((current) => {
          const others = current.filter((item) => item?.id !== response.payment.id);
          return [response.payment, ...others];
        });
      }

      if (!silent) {
        showFeedback(
          "Cobrança atualizada",
          response?.payment?.status === "recebido"
            ? "Pagamento confirmado. A carteira vinculada foi atualizada diretamente."
            : "A cobrança foi atualizada com o status mais recente do Banco Inter.",
          "success",
        );
      }
      return response?.payment || null;
    } catch (error) {
      if (!silent) {
        showFeedback("Não foi possível atualizar a cobrança", error?.message || "Falha ao consultar o status mais recente no Banco Inter.", "error");
      }
      return null;
    } finally {
      if (!silent) {
        setIsRefreshingBudgetPayment(false);
      }
    }
  }

  async function refreshBudgetChargeStatus() {
    return syncBudgetChargeStatus({ silent: false });
  }

  async function downloadBudgetChargePdf() {
    if (!activeBudgetBoleto?.id) return;
    if (selectedBudgetExpired) {
      showFeedback(
        "Orçamento expirado",
        "Os dados bancários desta cobrança não ficam disponíveis após o vencimento do orçamento.",
        "warning",
      );
      return;
    }
    setIsDownloadingBudgetPayment(true);
    try {
      const response = await bancoInter({
        action: "downloadBudgetChargePdf",
        empresa_id: currentUser?.empresa_id || selectedOrcamento?.empresa_id || null,
        orcamento_pagamento_id: activeBudgetBoleto.id,
      });

      const pdfBase64 = response?.pdf;
      if (!pdfBase64) {
        throw new Error("O Banco Inter não retornou o PDF desta cobrança.");
      }

      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${pdfBase64}`;
      link.download = response?.file_name || `boleto-orcamento-${selectedOrcamento?.id || "dog-city"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      showFeedback("Não foi possível baixar o PDF", error?.message || "Falha ao preparar o PDF do boleto.", "error");
    } finally {
      setIsDownloadingBudgetPayment(false);
    }
  }

  useEffect(() => {
    if (!paymentDialogOpen || !activeBudgetBoleto?.id || selectedBudgetExpired) return;
    const refreshKey = `${selectedOrcamento?.id || ""}:${activeBudgetBoleto.id}:${activeBudgetBoleto.updated_date || activeBudgetBoleto.created_date || ""}`;
    if (lastSilentBudgetRefreshRef.current === refreshKey) return;
    lastSilentBudgetRefreshRef.current = refreshKey;
    syncBudgetChargeStatus({ silent: true, paymentId: activeBudgetBoleto.id });
  }, [
    paymentDialogOpen,
    activeBudgetBoleto?.id,
    activeBudgetBoleto?.updated_date,
    activeBudgetBoleto?.created_date,
    selectedOrcamento?.id,
    selectedBudgetExpired,
  ]);

  function openOrcamentoDetail(orcamento) {
    try {
      setSelectedOrcamento(orcamento);
      setSelectedStatusDraft(orcamento?.status || "rascunho");
      resetBudgetFinancialDrafts();
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

  async function handleStatusChange(id, newStatus, options = {}) {
    const { skipStatusPersist = false, skipShadowSync = false } = options;
    try {
      if (!skipStatusPersist) {
        await Orcamento.update(id, { status: newStatus });
      }

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
            const dogsById = Object.fromEntries((dogs || []).map((dog) => [dog.id, dog]));
            const packageSessionCache = new Map();
            let resolvedWalletContext = budgetFinanceContext || null;

            const loadPackageSessionById = async (sessionId) => {
              if (!sessionId) return null;
              if (packageSessionCache.has(sessionId)) return packageSessionCache.get(sessionId);
              const sessionRows = await PackageSession.filter({ id: sessionId }, "-created_date", 1);
              const session = Array.isArray(sessionRows) ? sessionRows[0] : sessionRows;
              packageSessionCache.set(sessionId, session || null);
              return session || null;
            };

            for (const appointment of plannedAppointments) {
              const externalAppointmentId = getAppointmentMeta(appointment).external_appointment_id;
              if (externalAppointmentId) {
                const externalAppointment = (existingAppointments || []).find((item) => item.id === externalAppointmentId);
                if (externalAppointment?.id) {
                  const externalMeta = getAppointmentMeta(externalAppointment);
                  const appointmentMeta = getAppointmentMeta(appointment);
                  const snapshot = appointmentMeta.snapshot || {};
                  const isRecurringBudgetReuse = Boolean(appointmentMeta.recurring_budget_reuse_kind);
                  const nextExternalMetadata = {
                    ...externalMeta,
                    ...appointmentMeta,
                    commercial_review_pending: false,
                    overnight_budget_pending: false,
                    overnight_orcamento_id: id,
                  };
                  let nextExternalObservacoes = appointment.observacoes;

                  if (isRecurringBudgetReuse && appointmentMeta.recurring_budget_reuse_kind === "banho") {
                    const resolution = String(appointmentMeta.recurring_grooming_resolution || "").trim().toLowerCase();

                    if (resolution === "move") {
                      const targetAppointmentId = appointmentMeta.recurring_grooming_target_appointment_id || "";
                      const targetAppointment = (existingAppointments || []).find((item) => item.id === targetAppointmentId);
                      if (targetAppointment?.id) {
                        const targetMeta = getAppointmentMeta(targetAppointment);
                        const sourceDate = externalAppointment.data_referencia || getAppointmentDateKey(externalAppointment);
                        const targetDate = targetAppointment.data_referencia || getAppointmentDateKey(targetAppointment);
                        await Appointment.update(targetAppointment.id, {
                          observacoes: appendDistinctNote(
                            targetAppointment.observacoes,
                            buildRecurringBudgetAdjustmentNote("move_target", sourceDate, targetDate),
                          ),
                          metadata: {
                            ...targetMeta,
                            has_grooming: true,
                            grooming_moved_from_appointment_id: externalAppointment.id,
                          },
                        });

                        if (targetAppointment.package_session_id) {
                          const targetSession = await loadPackageSessionById(targetAppointment.package_session_id);
                          await PackageSession.update(targetAppointment.package_session_id, {
                            metadata: {
                              ...(typeof targetSession?.metadata === "object" ? targetSession.metadata : {}),
                              has_grooming: true,
                              grooming_moved_from_appointment_id: externalAppointment.id,
                            },
                          });
                        }

                        nextExternalMetadata.has_grooming = false;
                        nextExternalMetadata.grooming_moved_to_appointment_id = targetAppointment.id;
                        nextExternalObservacoes = appendDistinctNote(
                          nextExternalObservacoes,
                          buildRecurringBudgetAdjustmentNote("move_source", sourceDate, targetDate),
                        );
                      }
                    }

                    if (resolution === "credit") {
                      if (!resolvedWalletContext?.carteira_conta_id && nextOrcamento?.cliente_id) {
                        resolvedWalletContext = await financeWalletBudgetReadContext({
                          empresa_id: currentUser?.empresa_id || nextOrcamento?.empresa_id || null,
                          carteira_id: nextOrcamento.cliente_id,
                        });
                      }

                      if (resolvedWalletContext?.carteira_conta_id) {
                        const creditValue = calculateTosaValue(snapshot, dogsById[appointment.dog_id], precos);
                        if (Number(creditValue || 0) > 0) {
                          await financeApplyCompensatoryCredit({
                            carteira_conta_id: resolvedWalletContext.carteira_conta_id,
                            operacao_idempotencia: `budget-grooming-credit:${id}:${externalAppointment.id}`,
                            valor: Number(creditValue || 0),
                            motivo: "Tosa remanejada do banho do plano e convertida em credito no orcamento.",
                            referencia_amigavel: "Credito de tosa do plano",
                            descricao: `Credito gerado ao remover a tosa do banho reutilizado no orcamento ${id}.`,
                            orcamento_id: id,
                            appointment_id: externalAppointment.id,
                            usuario_id: currentUser?.id || null,
                            metadata: {
                              source: "orcamentos_historico_panel",
                              recurring_budget_reuse_kind: "banho",
                              external_appointment_id: externalAppointment.id,
                            },
                          });
                        }
                      }

                      nextExternalMetadata.has_grooming = false;
                      nextExternalMetadata.grooming_converted_to_credit = true;
                      nextExternalObservacoes = appendDistinctNote(
                        nextExternalObservacoes,
                        buildRecurringBudgetAdjustmentNote(
                          "credit",
                          externalAppointment.data_referencia || getAppointmentDateKey(externalAppointment),
                          appointment.data_referencia,
                        ),
                      );
                    }
                  }

                  if (isRecurringBudgetReuse && appointmentMeta.recurring_budget_reuse_kind === "tosa") {
                    nextExternalMetadata.has_grooming = true;
                    nextExternalObservacoes = appendDistinctNote(
                      nextExternalObservacoes,
                      buildRecurringBudgetAdjustmentNote(
                        "reused_tosa",
                        externalAppointment.data_referencia || getAppointmentDateKey(externalAppointment),
                        appointment.data_referencia,
                      ),
                    );
                  }

                  await Appointment.update(externalAppointment.id, {
                    orcamento_id: id,
                    status: "agendado",
                    charge_type: isRecurringBudgetReuse ? appointment.charge_type : "orcamento",
                    valor_previsto: appointment.valor_previsto,
                    data_referencia: appointment.data_referencia,
                    data_hora_entrada: appointment.data_hora_entrada,
                    data_hora_saida: appointment.data_hora_saida,
                    hora_entrada: appointment.hora_entrada || getAppointmentTimeValue(appointment, "entrada") || "",
                    hora_saida: appointment.hora_saida || getAppointmentTimeValue(appointment, "saida") || "",
                    observacoes: nextExternalObservacoes,
                    metadata: nextExternalMetadata,
                  });

                  if (externalAppointment.package_session_id) {
                    const packageSession = await loadPackageSessionById(externalAppointment.package_session_id);
                    await PackageSession.update(externalAppointment.package_session_id, {
                      scheduled_date: appointment.data_referencia,
                      appointment_id: externalAppointment.id,
                      metadata: {
                        ...(typeof packageSession?.metadata === "object" ? packageSession.metadata : {}),
                        has_grooming: nextExternalMetadata.has_grooming ?? (typeof packageSession?.metadata === "object" ? packageSession.metadata?.has_grooming : false) ?? false,
                        linked_orcamento_id: id,
                      },
                    });
                  }
                  continue;
                }
              }

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

        if (!skipShadowSync) {
          try {
            const shadowEmpresaId = nextOrcamento?.empresa_id || currentUser?.empresa_id || null;
            if (nextOrcamento?.cliente_id && shadowEmpresaId) {
              const shadowItems = isApprovedOrcamentoStatus(newStatus)
                ? buildShadowFinanceItemsFromOrcamento({
                    orcamento: nextOrcamento,
                    dogs,
                    precos,
                    packageBehaviorResolver: ({ cao, serviceType }) =>
                      resolveRecurringPackageFinancialBehavior(recurringPackages, cao, serviceType),
                  })
                : [];

              await financeShadowSync({
                orcamento_id: nextOrcamento.id,
                empresa_id: shadowEmpresaId,
                carteira_id: nextOrcamento.cliente_id,
                due_date: resolveShadowChargeDueDate({
                  orcamento: nextOrcamento,
                  items: shadowItems,
                }),
                status: newStatus,
                items: shadowItems,
                payload: {
                  source: "orcamentos_historico_panel",
                  shadow_item_count: shadowItems.length,
                  valor_total_legado: Number(nextOrcamento?.valor_total || 0) || 0,
                },
                usuario_id: currentUser?.id || null,
              });
            }
          } catch (error) {
            console.error("Erro ao sincronizar shadow financeiro do orçamento:", error);
          }
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
    if (selectedBudgetExpired) {
      showFeedback("Orçamento expirado", "Este orçamento está disponível apenas para consulta.", "warning");
      return;
    }
    if (selectedStatusDraft === selectedOrcamento.status) return;

    if (selectedStatusDraft === "cancelado" && budgetFinanceContext?.cancellation_v2_enabled) {
      if (!canManageFinancialCancellation) {
        showFeedback(
          "Perfil sem autorização",
          "Somente Comercial, Gerência ou Administrador podem usar o cancelamento financeiro V2 nesta fase controlada.",
          "error",
        );
        return;
      }

      if (!budgetFinanceContext?.carteira_conta_id) {
        showFeedback(
          "Carteira não localizada",
          "O cancelamento V2 exige uma carteira financeira vinculada ao orçamento.",
          "error",
        );
        return;
      }

      if (!cancellationReason.trim()) {
        showFeedback(
          "Motivo obrigatório",
          "Informe o motivo do cancelamento para registrar a reversão financeira auditável.",
          "error",
        );
        return;
      }

      const penaltyPercent = Number(String(cancellationPenaltyPercent || "").replace(",", ".")) || 0;
      const creditValue = Number(String(compensatoryCreditValue || "").replace(",", ".")) || 0;

      if (cancellationOrigin === "cliente" && applyCancellationPenalty && penaltyPercent <= 0) {
        showFeedback(
          "Multa incompleta",
          "Informe um percentual de multa maior que zero para continuar com o cancelamento do cliente.",
          "error",
        );
        return;
      }

      if (cancellationOrigin === "dogcity" && generateCompensatoryCredit && creditValue <= 0) {
        showFeedback(
          "Crédito compensatório incompleto",
          "Informe o valor do crédito compensatório que será concedido neste cancelamento.",
          "error",
        );
        return;
      }

      try {
        setIsSavingStatus(true);
        const result = await financeProcessBudgetCancellationV2({
          orcamento_id: selectedOrcamento.id,
          carteira_conta_id: budgetFinanceContext.carteira_conta_id,
          origem_cancelamento: cancellationOrigin,
          aplicar_multa: cancellationOrigin === "cliente" ? applyCancellationPenalty : false,
          percentual_multa: cancellationOrigin === "cliente" && applyCancellationPenalty ? penaltyPercent : 0,
          gerar_credito_compensatorio: cancellationOrigin === "dogcity" ? generateCompensatoryCredit : false,
          valor_credito_compensatorio: cancellationOrigin === "dogcity" && generateCompensatoryCredit ? creditValue : null,
          permitir_saldo_negativo_multa: cancellationOrigin === "cliente" && applyCancellationPenalty ? allowNegativePenalty : false,
          motivo: cancellationReason.trim(),
          usuario_id: currentUser?.id || null,
          metadata: {
            source: "orcamentos_historico_panel",
            cancellation_origin: cancellationOrigin,
            selected_status_draft: selectedStatusDraft,
            valor_orcamento_total: Number(selectedOrcamento?.valor_total || 0),
          },
        });

        if (result?.orcamento_status !== "cancelado") {
          showFeedback(
            "Cancelamento não concluído",
            "O fluxo financeiro de cancelamento não concluiu o orçamento como cancelado. Nenhuma mudança visual foi aplicada.",
            "error",
          );
          setIsSavingStatus(false);
          return;
        }

        const saved = await handleStatusChange(selectedOrcamento.id, "cancelado", {
          skipStatusPersist: true,
          skipShadowSync: true,
        });
        if (saved) {
          setSelectedOrcamento((current) => current ? { ...current, status: "cancelado" } : current);
          showFeedback(
            "Cancelamento registrado",
            "O cancelamento V2 foi registrado com trilha financeira auditável, sem substituir o legado fora desta flag.",
            "success",
          );
        }
        setIsSavingStatus(false);
        return;
      } catch (error) {
        console.error("Erro ao processar cancelamento financeiro do orçamento:", error);
        showFeedback(
          "Não foi possível processar o cancelamento",
          error?.message || "Revise os dados financeiros e tente novamente.",
          "error",
        );
        setIsSavingStatus(false);
        return;
      }
    }

    if (
      selectedStatusDraft === "aprovado"
      && budgetFinanceContext?.chronological_consumption_enabled
      && budgetFinancePreview?.requires_authorization
    ) {
      if (!budgetFinanceContext?.budget_authorization_enabled) {
        showFeedback(
          "Autorização financeira exigida",
          "A simulação indica saldo insuficiente e a flag de autorização do orçamento ainda está desligada.",
          "error",
        );
        return;
      }

      if (!budgetFinanceContext?.allow_negative_wallet_with_authorization) {
        showFeedback(
          "Saldo insuficiente",
          "A carteira não cobre o orçamento e a empresa ainda não liberou aprovação com saldo negativo autorizado.",
          "error",
        );
        return;
      }

      if (!canAuthorizeBudgetFinancially) {
        showFeedback(
          "Perfil sem autorização",
          "Somente Comercial, Gerência ou Administrador podem autorizar orçamento sem pagamento nesta fase controlada.",
          "error",
        );
        return;
      }

      if (!authorizeWithoutPayment || !authorizationReason.trim() || !authorizationDueDate) {
        showFeedback(
          "Autorização incompleta",
          "Preencha motivo e novo vencimento para registrar a autorização sem pagamento antes de aprovar.",
          "error",
        );
        return;
      }

      try {
        const approvalResult = await financeApproveBudgetWithAuthorization({
          orcamento_id: selectedOrcamento.id,
          carteira_conta_id: budgetFinanceContext.carteira_conta_id,
          motivo: authorizationReason.trim(),
          vencimento_novo: authorizationDueDate,
          usuario_id: currentUser?.id || null,
          metadata: {
            source: "orcamentos_historico_panel",
            valor_orcamento_total: Number(selectedOrcamento?.valor_total || 0),
            valor_orcamento_em_aberto: Number(budgetFinancePreview?.valor_orcamento_em_aberto || 0),
            projected_balance_after_wallet_usage: Number(budgetFinancePreview?.projected_balance_after_wallet_usage || 0),
          },
        });

        if (!approvalResult?.autorizacao_financeira_id || approvalResult?.orcamento_status !== "aprovado") {
          showFeedback(
            "Aprovação atômica incompleta",
            "O orçamento não foi aprovado com autorização financeira. Nenhuma mudança foi aplicada.",
            "error",
          );
          return;
        }

        setIsSavingStatus(true);
        const saved = await handleStatusChange(selectedOrcamento.id, selectedStatusDraft, { skipStatusPersist: true });
        if (saved) {
          setSelectedOrcamento((current) => current ? { ...current, status: selectedStatusDraft } : current);
          showFeedback("Alterações salvas", "O status do orçamento foi atualizado com autorização financeira auditável.", "success");
        }
        setIsSavingStatus(false);
        return;
      } catch (error) {
        console.error("Erro ao registrar a autorização financeira do orçamento:", error);
        showFeedback(
          "Não foi possível registrar a autorização",
          error?.message || "Revise os dados e tente novamente.",
          "error",
        );
        return;
      }
    }

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
    if (isBudgetExpired(orcamento)) {
      showFeedback("Orçamento expirado", "Os agendamentos deste orçamento não podem mais ser editados.", "warning");
      return;
    }
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
  const selectedApprovalResponsavel = approvalDialog?.responsaveis?.find(
    (item) => item.id === approvalDialog?.selectedResponsavelId,
  ) || null;
  const deleteConfirmRows = deleteConfirmContext?.rows || [];
  const FeedbackIcon = feedbackDialog?.tone === "success" ? CheckCircle : AlertTriangle;
  const feedbackToneClasses = feedbackDialog?.tone === "error"
    ? "bg-red-100 text-red-700"
    : feedbackDialog?.tone === "success"
      ? "bg-green-100 text-green-700"
      : "bg-blue-100 text-blue-700";

  if (isLoading) {
    return <LoadingScreen />;
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
              <p className="text-gray-500">Nenhum orçamento encontrado para os filtros atuais.</p>
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
          if (!open) {
            setSelectedStatusDraft(selectedOrcamento?.status || "");
            resetBudgetFinancialDrafts();
          }
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

              {selectedBudgetExpired ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-semibold">Orçamento expirado e disponível somente para consulta.</p>
                  <p className="mt-1">
                    Novas cobranças, alterações e aprovações estão bloqueadas. Agendamentos sem pagamento e sem check-in são removidos automaticamente.
                  </p>
                </div>
              ) : null}

              {selectedOrcamento.cliente_id && budgetFinanceContext?.wallet_budget_balance_enabled ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Carteira vinculada</p>
                      <p className="mt-1 text-lg font-semibold text-emerald-950">
                        Saldo atual: {formatCurrency(Number(budgetFinanceContext?.saldo_atual || 0))}
                      </p>
                    </div>
                    {budgetFinanceLoading ? <Badge className="bg-white text-emerald-700">Carregando...</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm text-emerald-800">
                    Esta leitura é controlada por feature flag e ainda não substitui o financeiro legado.
                  </p>
                </div>
              ) : null}

              {selectedOrcamento?.cliente_id ? (
                <FinancialOperationalAlert
                  status={selectedOrcamentoFinancialStatus}
                  title="Situação financeira do responsável"
                />
              ) : null}

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
                  {[
                    "rascunho",
                    "enviado",
                    "aprovado",
                    "recusado",
                    ...(budgetFinanceContext?.cancellation_v2_enabled && canManageFinancialCancellation ? ["cancelado"] : []),
                  ].map((status) => (
                    <Button
                      key={status}
                      variant={selectedStatusDraft === status ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedStatusDraft(status)}
                      disabled={selectedBudgetExpired}
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
                {selectedBudgetExpired ? (
                  <p className="mt-2 text-sm text-amber-700">O status não pode ser reaberto depois do término da validade.</p>
                ) : null}
              </div>

              {selectedStatusDraft === "cancelado" && budgetFinanceContext?.cancellation_v2_enabled ? (
                <div className="space-y-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">Cancelamento V2 controlado</p>
                    <h4 className="mt-1 font-semibold text-rose-950">Reversão financeira auditável</h4>
                    <p className="mt-2 text-sm text-rose-900">
                      Este fluxo continua atrás de flag. Com ele ligado, o orçamento pode registrar origem do cancelamento, multa e crédito compensatório sem editar o histórico da carteira.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Origem do cancelamento</Label>
                      <Select value={cancellationOrigin} onValueChange={setCancellationOrigin}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dogcity">DogCity</SelectItem>
                          <SelectItem value="cliente">Cliente</SelectItem>
                          <SelectItem value="natural">Natural</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Motivo obrigatório</Label>
                      <Textarea
                        value={cancellationReason}
                        onChange={(event) => setCancellationReason(event.target.value)}
                        placeholder="Explique o motivo do cancelamento e qualquer acordo financeiro aplicado."
                        rows={3}
                      />
                    </div>
                  </div>

                  {cancellationOrigin === "cliente" ? (
                    <div className="space-y-3 rounded-xl border border-white bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">Aplicar multa</p>
                          <p className="text-xs text-slate-500">
                            A multa nasce como novo movimento auditável e nunca substitui a obrigação original.
                          </p>
                        </div>
                        <Switch
                          checked={applyCancellationPenalty}
                          onCheckedChange={setApplyCancellationPenalty}
                          disabled={!budgetFinanceContext?.cancellation_penalty_enabled}
                        />
                      </div>

                      {applyCancellationPenalty ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Percentual da multa</Label>
                            <Input
                              value={cancellationPenaltyPercent}
                              onChange={(event) => setCancellationPenaltyPercent(event.target.value)}
                              placeholder="Ex.: 20"
                            />
                          </div>
                          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div>
                              <p className="text-sm font-medium text-slate-900">Permitir saldo negativo</p>
                              <p className="text-xs text-slate-500">
                                Só funciona se a empresa já liberou negativação autorizada na Sprint 4.
                              </p>
                            </div>
                            <Switch checked={allowNegativePenalty} onCheckedChange={setAllowNegativePenalty} />
                          </div>
                        </div>
                      ) : null}

                      {!budgetFinanceContext?.cancellation_penalty_enabled ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                          A flag de multa de cancelamento ainda está desligada para esta empresa.
                        </div>
                      ) : null}

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        Se existir valor já quitado nesta obrigação, o cancelamento pelo cliente devolve apenas a parte paga como crédito compensatório, desde que a flag correspondente esteja ligada.
                      </div>
                    </div>
                  ) : null}

                  {cancellationOrigin === "dogcity" ? (
                    <div className="space-y-3 rounded-xl border border-white bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">Gerar crédito compensatório</p>
                          <p className="text-xs text-slate-500">
                            O crédito não é automático. Ele só nasce se for explicitamente concedido agora.
                          </p>
                        </div>
                        <Switch
                          checked={generateCompensatoryCredit}
                          onCheckedChange={setGenerateCompensatoryCredit}
                          disabled={!budgetFinanceContext?.compensatory_credit_enabled}
                        />
                      </div>

                      {generateCompensatoryCredit ? (
                        <div className="space-y-2">
                          <Label>Valor do crédito compensatório</Label>
                          <Input
                            value={compensatoryCreditValue}
                            onChange={(event) => setCompensatoryCreditValue(event.target.value)}
                            placeholder="0,00"
                          />
                        </div>
                      ) : null}

                      {!budgetFinanceContext?.compensatory_credit_enabled ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                          A flag de crédito compensatório ainda está desligada para esta empresa.
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {cancellationOrigin === "natural" ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                      Cancelamento natural encerra a obrigação futura sem multa e sem crédito indevido.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedStatusDraft === "aprovado" && budgetFinanceContext?.chronological_consumption_enabled ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Simulação financeira controlada</p>
                      <h4 className="mt-1 font-semibold text-slate-900">Prévia do consumo cronológico</h4>
                    </div>
                    {budgetFinancePreview ? (
                      <Badge className={budgetFinancePreview.requires_authorization ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>
                        {budgetFinancePreview.requires_authorization ? "Exige autorização" : "Saldo simulado suficiente"}
                      </Badge>
                    ) : null}
                  </div>

                  {budgetFinancePreview ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                          <p className="text-xs text-slate-500">Saldo aplicado em simulação</p>
                          <p className="mt-1 font-semibold text-slate-900">{formatCurrency(budgetFinancePreview.valor_saldo_aplicado)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                          <p className="text-xs text-slate-500">Orçamento coberto pela carteira</p>
                          <p className="mt-1 font-semibold text-emerald-700">{formatCurrency(budgetFinancePreview.valor_orcamento_coberto)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                          <p className="text-xs text-slate-500">Valor ainda em aberto</p>
                          <p className="mt-1 font-semibold text-slate-900">{formatCurrency(budgetFinancePreview.valor_orcamento_em_aberto)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                          <p className="text-xs text-slate-500">Saldo projetado após uso da carteira</p>
                          <p className="mt-1 font-semibold text-slate-900">{formatCurrency(budgetFinancePreview.projected_balance_after_wallet_usage)}</p>
                        </div>
                      </div>

                      {budgetFinancePreview.requires_authorization ? (
                        <>
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            Esta aprovação deixaria {formatCurrency(budgetFinancePreview.valor_orcamento_em_aberto)} sem cobertura imediata da carteira. Se a empresa permitir, a aprovação pode seguir apenas com autorização registrada.
                          </div>

                          {budgetFinanceContext?.budget_authorization_enabled ? (
                            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-slate-900">Autorizar sem pagamento</p>
                                  <p className="text-xs text-slate-500">
                                    Libera os agendamentos mantendo a pendência auditável na carteira.
                                  </p>
                                </div>
                                <Switch checked={authorizeWithoutPayment} onCheckedChange={setAuthorizeWithoutPayment} disabled={!canAuthorizeBudgetFinancially} />
                              </div>

                              {authorizeWithoutPayment ? (
                                <div className="space-y-3">
                                  <div className="space-y-2">
                                    <Label htmlFor="authorization-due-date">Novo vencimento autorizado</Label>
                                    <Input
                                      id="authorization-due-date"
                                      type="date"
                                      value={authorizationDueDate}
                                      onChange={(event) => setAuthorizationDueDate(event.target.value)}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="authorization-reason">Motivo obrigatório</Label>
                                    <Textarea
                                      id="authorization-reason"
                                      value={authorizationReason}
                                      onChange={(event) => setAuthorizationReason(event.target.value)}
                                      placeholder="Explique por que a aprovação seguirá sem cobertura imediata da carteira."
                                      rows={3}
                                    />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                              A flag de autorização do orçamento ainda está desligada para esta empresa.
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                          Nesta simulação, a carteira cobre o orçamento sem exigir autorização adicional.
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                      {budgetFinanceLoading ? "Carregando simulação financeira..." : "A simulação será carregada quando a carteira vinculada estiver disponível."}
                    </div>
                  )}

                  {budgetFinanceError ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {budgetFinanceError}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDetailModal(false)}>Fechar</Button>
            <Button
              variant="outline"
              onClick={() => openApprovalDialog(selectedOrcamento)}
              disabled={!selectedOrcamento?.id || selectedBudgetExpired}
            >
              <Link2 className="mr-2 h-4 w-4" />
              Solicitar aprovação
            </Button>
            {selectedOrcamento?.status === "aprovado" ? (
              <Button
                variant="outline"
                onClick={openBudgetPaymentDialog}
                disabled={!selectedOrcamento?.id || !selectedOrcamento?.cliente_id || selectedBudgetExpired}
              >
                <ReceiptText className="mr-2 h-4 w-4" />
                Pagamento
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => openAppointmentsEditor(selectedOrcamento)}
              disabled={!selectedOrcamento?.id || selectedBudgetExpired}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </Button>
            <Button
              onClick={saveSelectedOrcamentoChanges}
              disabled={!selectedOrcamento?.id || selectedBudgetExpired || selectedStatusDraft === selectedOrcamento?.status || isSavingStatus}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSavingStatus ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-h-[92vh] w-[95vw] max-w-[820px] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Pagamento do orçamento</DialogTitle>
            <DialogDescription>
              Emita e acompanhe os dados de pagamento do responsável financeiro sem sair do orçamento aprovado.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(92vh-170px)] overflow-y-auto pr-1">
            <div className="space-y-4 py-2">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Responsável financeiro</p>
                  <p className="mt-1 font-semibold text-slate-900">{selectedBudgetCarteira?.nome_razao_social || "Não vinculado"}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {maskSensitiveValue(selectedBudgetCarteira?.cpf_cnpj || "", maskCpfCnpj, canRevealSensitiveData) || "CPF/CNPJ não informado"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {(canRevealSensitiveData ? formatAddressParts : maskAddressParts)([
                      selectedBudgetCarteira?.street,
                      selectedBudgetCarteira?.numero_residencia,
                      selectedBudgetCarteira?.neighborhood,
                      selectedBudgetCarteira?.city,
                      selectedBudgetCarteira?.state,
                      selectedBudgetCarteira?.cep,
                    ]) || "Endereço da carteira incompleto"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Contato da cobrança</p>
                  <p className="mt-1 font-semibold text-slate-900">{selectedBudgetResponsavel?.nome_completo || "Não localizado"}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {maskSensitiveValue(selectedBudgetResponsavel?.celular || selectedBudgetCarteira?.celular || "", maskPhone, canRevealSensitiveData) || "Telefone não informado"}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {selectedBudgetResponsavel?.source === "responsavel"
                      ? "Fallback: responsável vinculado aos cães do orçamento."
                      : "Usando os dados da carteira vinculada ao orçamento."}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Valor aprovado</p>
                  <p className="mt-1 font-semibold text-emerald-700">{formatCurrency(selectedOrcamento?.valor_total || 0)}</p>
                  <p className="mt-1 text-xs text-slate-500">Vencimento: {formatDate(selectedOrcamento?.data_validade)}</p>
                </div>
              </div>

              <Tabs value={paymentTab} onValueChange={setPaymentTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="boleto"><Landmark className="mr-2 h-4 w-4" />Boleto bancário</TabsTrigger>
                  <TabsTrigger value="pix"><QrCode className="mr-2 h-4 w-4" />Pix ou Transferência</TabsTrigger>
                  <TabsTrigger value="cartao"><CreditCard className="mr-2 h-4 w-4" />Cartão</TabsTrigger>
                </TabsList>

                <TabsContent value="boleto" className="space-y-4 pt-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Cobrança boleto + Pix do Banco Inter</p>
                        <p className="mt-1 text-sm text-slate-600">
                          Emitimos um único documento com boleto bancário e Pix copia e cola, usando os dados do responsável financeiro vinculados ao orçamento.
                        </p>
                      </div>
                      {activeBudgetBoleto ? (
                        <Badge className={getBudgetChargeStatusBadgeClass(activeBudgetBoletoStatus)}>
                          {getBudgetChargeStatusLabel(activeBudgetBoletoStatus)}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Ainda não emitido</Badge>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button onClick={issueBudgetCharge} disabled={selectedBudgetExpired || isIssuingBudgetPayment}>
                        {issueBudgetChargeButtonLabel}
                      </Button>
                      <Button variant="outline" onClick={refreshBudgetChargeStatus} disabled={selectedBudgetExpired || !activeBudgetBoleto?.id || isRefreshingBudgetPayment}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {isRefreshingBudgetPayment ? "Atualizando..." : "Atualizar situação"}
                      </Button>
                      <Button variant="outline" onClick={downloadBudgetChargePdf} disabled={selectedBudgetExpired || !activeBudgetBoleto?.id || !activeBudgetBoleto?.pdf_disponivel || !shouldShowBudgetChargeDetails || isDownloadingBudgetPayment}>
                        <Download className="mr-2 h-4 w-4" />
                        {isDownloadingBudgetPayment ? "Preparando PDF..." : "Baixar PDF"}
                      </Button>
                    </div>
                  </div>

                  {shouldShowBudgetChargeDetails ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Código de barras</Label>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                          {activeBudgetBoleto?.codigo_barras || "Disponível após a emissão do boleto."}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => copyPaymentValue(activeBudgetBoleto?.codigo_barras, "Código de barras")} disabled={!activeBudgetBoleto?.codigo_barras}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copiar código de barras
                        </Button>
                      </div>

                      <div className="space-y-2">
                        <Label>Linha digitável</Label>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                          {activeBudgetBoleto?.linha_digitavel || "Disponível após a emissão do boleto."}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => copyPaymentValue(activeBudgetBoleto?.linha_digitavel, "Linha digitável")} disabled={!activeBudgetBoleto?.linha_digitavel}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copiar linha digitável
                        </Button>
                      </div>
                    </div>
                  ) : activeBudgetBoleto ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      Esta cobrança não está mais ativa no Banco Inter. Os dados do boleto e do Pix foram ocultados para evitar reutilização indevida.
                    </div>
                  ) : null}
                </TabsContent>

                <TabsContent value="pix" className="space-y-4 pt-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-sm font-semibold text-slate-900">Pix ou transferência</p>
                    <p className="mt-1 text-sm text-slate-600">
                      O Pix copia e cola nasce junto com o boleto. Para transferência manual, a equipe financeira pode usar os mesmos dados do documento emitido.
                    </p>
                  </div>

                  {shouldShowBudgetChargeDetails ? (
                    <div className="space-y-2">
                      <Label>Pix copia e cola</Label>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 break-all">
                        {activeBudgetBoleto?.pix_copia_cola || "Disponível após a emissão do boleto bancário."}
                      </div>
                      <Button variant="outline" size="sm" onClick={() => copyPaymentValue(activeBudgetBoleto?.pix_copia_cola, "Pix copia e cola")} disabled={!activeBudgetBoleto?.pix_copia_cola}>
                        <Copy className="mr-2 h-4 w-4" />
                        Copiar Pix
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      O Pix desta cobrança não está mais disponível porque o boleto foi baixado, cancelado, expirado ou já não está ativo no Banco Inter.
                    </div>
                  )}

                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    Assim que o responsável pagar por Pix ou pelo boleto, use <strong>Atualizar situação</strong> na aba do boleto para buscar o status mais recente e aplicar a recarga diretamente na carteira.
                  </div>
                </TabsContent>

                <TabsContent value="cartao" className="space-y-4 pt-4">
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    A aba de cartão já está reservada no fluxo operacional, mas a captura em cartão depende de um gateway específico e não faz parte desta integração com o Banco Inter. O orçamento pode seguir com boleto bancário ou Pix agora, sem bloquear a operação.
                  </div>
                </TabsContent>
              </Tabs>

              {activeBudgetBoleto?.credited_wallet_movement_id ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  Pagamento confirmado e aplicado na carteira vinculada. Movimento financeiro: <strong>{activeBudgetBoleto.credited_wallet_movement_id}</strong>.
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter className="gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Fechar
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

      <Dialog
        open={Boolean(approvalDialog)}
        onOpenChange={(open) => {
          if (!open && !isSendingApproval) {
            setApprovalDialog(null);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] w-[95vw] max-w-[640px] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-blue-100 p-3">
                <Link2 className="h-6 w-6 text-blue-700" />
              </div>
              <div>
                <DialogTitle>Solicitar aprovação autenticada</DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-6">
                  Escolha o responsável, gere o link protegido e, se quiser, envie agora pelo WhatsApp conectado.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {approvalDialog?.orcamento ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Orçamento selecionado</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-slate-500">Cães</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {(approvalDialog.orcamento?.caes || []).map((cao) => getDogName(cao?.dog_id)).filter(Boolean).join(", ") || "Sem cães vinculados"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Valor</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {formatCurrency(approvalDialog.orcamento?.valor_total || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Validade</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {formatDate(approvalDialog.orcamento?.data_validade)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">Responsável que vai aprovar</p>
                  <Select
                    value={approvalDialog.selectedResponsavelId || ""}
                    onValueChange={handleApprovalResponsavelChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      {(approvalDialog.responsaveis || []).map((responsavel) => (
                        <SelectItem key={responsavel.id} value={responsavel.id}>
                          {responsavel.nome_completo || "Responsável"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-5 text-slate-500">
                    Só aparecem responsáveis já vinculados aos cães presentes neste orçamento.
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">Número para envio</p>
                  <Input
                    value={approvalPhone}
                    onChange={(event) => setApprovalPhone(event.target.value)}
                    placeholder="DDD + número"
                  />
                  <p className="text-xs leading-5 text-slate-500">
                    Você pode ajustar o telefone antes do envio. O link também será copiado para envio manual.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">Canal de entrega</p>
                  <Select value={approvalWhatsappSlot} onValueChange={setApprovalWhatsappSlot}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha como enviar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Só copiar o link</SelectItem>
                      {(approvalDialog.whatsappOptions || []).map((item) => (
                        <SelectItem key={item.id || item.config?.slot_key} value={String(item.config?.slot_key || "")}>
                          {item.config?.connection_name || `WhatsApp ${item.config?.slot_key || ""}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-5 text-slate-500">
                    {approvalDialog.whatsappOptions?.length
                      ? "Escolha uma conexão ativa ou deixe em modo manual para apenas copiar o link."
                      : "Nenhum WhatsApp conectado para esta unidade. O sistema vai gerar e copiar o link manualmente."}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">Observação para a equipe</p>
                  <Textarea
                    value={approvalNote}
                    onChange={(event) => setApprovalNote(event.target.value)}
                    placeholder="Ex.: confirmar apenas a extensão da estadia até amanhã às 12h."
                    rows={4}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Resumo do envio</p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p>
                    <span className="font-semibold text-slate-900">Responsável:</span>{" "}
                    {selectedApprovalResponsavel?.nome_completo || "Selecione um responsável"}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-900">Canal:</span>{" "}
                    {approvalWhatsappSlot === "manual"
                      ? "Link copiado para envio manual"
                      : `WhatsApp ${approvalDialog.whatsappOptions?.find((item) => String(item.config?.slot_key || "") === approvalWhatsappSlot)?.config?.connection_name || approvalWhatsappSlot}`}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-900">Telefone:</span>{" "}
                    {approvalPhone || "Não informado"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setApprovalDialog(null)}
              disabled={isSendingApproval}
            >
              Cancelar
            </Button>
            <Button
              onClick={submitApprovalRequest}
              disabled={!approvalDialog?.selectedResponsavelId || isSendingApproval || (approvalWhatsappSlot !== "manual" && !approvalPhone)}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              <Send className="mr-2 h-4 w-4" />
              {isSendingApproval ? "Preparando..." : "Gerar link protegido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
