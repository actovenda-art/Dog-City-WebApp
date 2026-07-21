import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  bancoInter,
  financePaymentV2ExecutionAudit,
  financePaymentV2Reverse,
  financePaymentV2ReversalAudit,
  financeLinkBankEntryToWallet,
  financeLinkBankOutputToPayable,
  financeWalletAdminApplyOperation,
  financeWalletAdminAuditAccounts,
  financeWalletAdminReadAccounts,
  financeWalletAdminReadMovements,
} from "@/api/functions";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CreateFileSignedUrl, UploadPrivateFile } from "@/api/integrations";
import {
  AppConfig,
  Appointment,
  Carteira,
  ContaReceber,
  CobrancaFinanceira,
  Dog,
  ExtratoBancario,
  Lancamento,
  ObrigacaoFinanceira,
  Orcamento,
  OrcamentoPagamento,
  RecurringPackage,
  ServiceProvided,
  User,
} from "@/api/entities";
import PropTypes from "prop-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePickerInput, DateRangePickerInput } from "@/components/common/DateTimeInputs";
import SearchFiltersToolbar from "@/components/common/SearchFiltersToolbar";
import LoadingScreen from "@/components/layout/LoadingScreen";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  CircleDollarSign,
  CreditCard,
  ChevronLeft,
  ChevronDown,
  CheckCircle2,
  ClipboardCopy,
  Download,
  FileText,
  FileWarning,
  ListFilter,
  Landmark,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Undo2,
  Wallet,
} from "lucide-react";
import {
  dedupeOfficialImportedMovements,
  formatCurrency,
  formatMovementDateTime,
  fromDateInputValue,
  getMovementComparableDate,
  normalizeMovement,
  toDateInputValue,
} from "@/utils/finance";
import { createPageUrl } from "@/utils";
import { FINANCE_FEATURE_FLAGS, getFinanceFeatureFlagValue } from "@/lib/finance-feature-flags";
import { canWriteFinancialOperations, isCommercialProfile, isManagerialProfile } from "@/lib/access-control";
import FinancialOperationalAlert from "@/components/finance/FinancialOperationalAlert";
import { buildFinancialOperationalStatusMap, getFinancialOperationalStatus } from "@/lib/finance-operational-status";
import { getInternalEntityReference } from "@/lib/entity-identifiers";
import { getAppointmentDateKey } from "@/lib/attendance";
import { buildWalletChronologicalSettlement } from "@/lib/finance-wallet-settlement";

const EMPTY_FORM = {
  data_hora_transacao: "",
  tipo: "entrada",
  nome_contraparte: "",
  valor: "",
  banco_contraparte: "",
  tipo_transacao_detalhado: "",
  referencia: "",
  observacoes: "",
  link_target_id: "",
};

const EMPTY_WALLET_OPERATION_FORM = {
  carteira_conta_id: "",
  tipo: "credito_manual",
  natureza: "entrada",
  valor: "",
  referencia_amigavel: "",
  motivo: "",
  observacao: "",
  origem: "admin_manual",
  transacao_id: "",
};

const EMPTY_WALLET_REVERSAL_FORM = {
  carteira_conta_id: "",
  reversao_tipo: "servico",
  valor: "",
  motivo: "",
  appointment_id: "",
  serviceprovided_id: "",
  obrigacao_id: "",
  cobranca_financeira_id: "",
  conta_receber_id: "",
  attachment_name: "",
  attachment_path: "",
  attachment_extension: "",
  attachment_display_name: "",
  confirmation_checked: false,
};

const WALLET_OPERATION_LABELS = {
  credito_manual: "Crédito manual",
  ajuste_manual: "Ajuste manual",
  estorno_manual: "Estorno manual",
  entrada_direcionada: "Entrada direcionada",
};

const WALLET_MANUAL_OPERATION_OPTIONS = [
  {
    value: "credito_manual",
    label: "Crédito manual",
    helper: "Registra um crédito administrativo no saldo.",
    icon: CircleDollarSign,
    activeClassName: "border-emerald-300 bg-emerald-50/80 ring-2 ring-emerald-100",
    iconClassName: "bg-emerald-100 text-emerald-700",
  },
  {
    value: "ajuste_manual",
    label: "Ajuste manual",
    helper: "Corrige o saldo com justificativa auditável.",
    icon: Pencil,
    activeClassName: "border-blue-300 bg-blue-50/80 ring-2 ring-blue-100",
    iconClassName: "bg-blue-100 text-blue-700",
  },
  {
    value: "estorno_manual",
    label: "Estorno manual",
    helper: "Registra uma devolução administrativa de saldo.",
    icon: Undo2,
    activeClassName: "border-amber-300 bg-amber-50/80 ring-2 ring-amber-100",
    iconClassName: "bg-amber-100 text-amber-700",
  },
];

const EMPTY_WALLET_CHARGE_FORM = {
  valor: "",
  data_vencimento: "",
  descricao: "",
  metodo: "boleto_bancario",
};
const WALLET_CHARGE_STEPS = [
  { id: 1, label: "Valor", icon: CircleDollarSign },
  { id: 2, label: "Vencimento", icon: Calendar },
  { id: 3, label: "Descrição", icon: FileText },
  { id: 4, label: "Pagamento", icon: Landmark },
];
const WALLET_OPERATION_MODAL_LABEL = "Alteração manual";
const MIN_INTER_CHARGE_AMOUNT = 2.5;

const MOVEMENTS_PAGE_SIZE = 50;
const MOVEMENT_CACHE_KEY = "movimentacoes:last-overview";
const OPERATIONAL_HISTORY_LIMIT = 100;
const OPEN_FINANCIAL_STATUSES = new Set(["aberta", "parcial", "vencida", "pendente"]);
const CLOSED_FINANCIAL_STATUSES = new Set(["quitada", "cancelada", "estornada", "pago"]);
const REVERSAL_ATTACHMENT_ACCEPT = ".pdf,.doc,.txt,.img,.jpg,.png";
const REVERSAL_ALLOWED_EXTENSIONS = new Set([".pdf", ".doc", ".txt", ".img", ".jpg", ".png"]);

function readMovementsCache() {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.localStorage.getItem(MOVEMENT_CACHE_KEY);
    if (!rawValue) return null;
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeMovementsCache(payload) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(MOVEMENT_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore cache write failures
  }
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

function parseWalletChargeAmount(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return 0;
  if (normalized.includes(",")) return parseCurrencyInput(normalized);
  const parsed = Number.parseFloat(normalized.replace(/\s+/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readEntityCollection(entity, { sort = "-updated_date", pageSize = 500, maxRows = 2000 } = {}) {
  if (!entity) return [];

  if (entity.queryAll) {
    const response = await entity.queryAll({ sort, pageSize, maxRows, count: false });
    return Array.isArray(response?.data) ? response.data : (response || []);
  }

  if (entity.listAll) {
    return entity.listAll(sort, pageSize, maxRows);
  }

  if (entity.list) {
    return entity.list(sort, maxRows);
  }

  return [];
}

function buildWalletOperationIdempotency(tipo) {
  const randomToken = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `wallet_admin|${tipo}|${randomToken}`;
}

function buildWalletReversalIdempotency(reversaoTipo) {
  const randomToken = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `payment_v2_reversal|${reversaoTipo}|${randomToken}`;
}

function sanitizeUploadFileName(filename) {
  return String(filename || "arquivo")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");
}

function getFileExtension(filename) {
  const normalized = String(filename || "").trim().toLowerCase();
  if (!normalized.includes(".")) return "";
  return `.${normalized.split(".").pop()}`;
}

function formatPeriodLabelWithDays(summary) {
  if (!summary?.oldest_movement_date && !summary?.newest_movement_date) return null;

  const calculateDaySpan = (startValue, endValue) => {
    if (!startValue || !endValue) return null;
    const start = new Date(`${startValue}T00:00:00`);
    const end = new Date(`${endValue}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    const diffInDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    return diffInDays > 0 ? diffInDays : null;
  };

  if (summary?.oldest_movement_date && summary?.newest_movement_date) {
    const daySpan = calculateDaySpan(summary.oldest_movement_date, summary.newest_movement_date);
    const rangeLabel = `${formatMovementDateTime(summary.oldest_movement_date)} até ${formatMovementDateTime(summary.newest_movement_date)}`;
    return daySpan ? `${rangeLabel} - ${daySpan} dias` : rangeLabel;
  }

  return formatMovementDateTime(summary.oldest_movement_date || summary.newest_movement_date);
}

function normalizeDateOnly(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;

  const isoDateMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDateMatch) return isoDateMatch[1];

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function calculateOperationalSituation({ dueDate, statuses = [] } = {}) {
  const normalizedDueDate = normalizeDateOnly(dueDate);
  const normalizedStatuses = (statuses || []).map((status) => String(status || "").toLowerCase());
  const hasOpenStatus = normalizedStatuses.some((status) => OPEN_FINANCIAL_STATUSES.has(status));
  const hasClosedStatus = normalizedStatuses.some((status) => CLOSED_FINANCIAL_STATUSES.has(status));

  if (!normalizedDueDate || !hasOpenStatus) {
    return {
      label: "Regular",
      tone: "regular",
      helper: hasClosedStatus ? "Sem pendência em aberto." : "Sem atraso crítico identificado.",
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${normalizedDueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) {
    return { label: "Regular", tone: "regular", helper: "Vencimento indisponível." };
  }

  const diffInDays = Math.floor((today.getTime() - due.getTime()) / 86400000);
  if (diffInDays > 5) {
    return {
      label: "Irregular",
      tone: "irregular",
      helper: `Atraso superior a 5 dias (${diffInDays} dias).`,
    };
  }

  return {
    label: "Regular",
    tone: "regular",
    helper: diffInDays > 0 ? `Atraso dentro da tolerância visual (${diffInDays} dias).` : "Dentro do prazo financeiro.",
  };
}

function resolveEventDogName({ appointment, service, dogsById }) {
  const directName = appointment?.metadata?.dog_nome
    || service?.metadata?.dog_nome
    || appointment?.dog_nome
    || service?.dog_nome
    || appointment?.pet_name
    || service?.pet_name
    || null;
  if (directName) return directName;

  const dogId = appointment?.dog_id || service?.dog_id || appointment?.pet_id || service?.pet_id || null;
  if (dogId && dogsById.get(dogId)?.nome) {
    return dogsById.get(dogId).nome;
  }

  return "Cão não informado";
}

function getDefaultWalletChargeDueDate() {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  return dueDate.toISOString().slice(0, 10);
}

async function copyTextToClipboard(value) {
  const text = String(value || "").trim();
  if (!text || typeof window === "undefined") return false;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  }
}

function formatWalletServiceLabel(value, fallback = "Serviço") {
  const rawValue = String(value || "").trim();
  if (!rawValue) return fallback;

  const normalizedValue = rawValue.toLowerCase().replace(/[\s_-]+/g, "_");
  const labels = {
    day_care: "Day Care",
    banho: "Banho",
    banho_tosa: "Banho & Tosa",
    hospedagem: "Hospedagem",
    tosa: "Tosa",
    transporte: "Transporte",
  };

  return labels[normalizedValue] || rawValue;
}

function resolveEventServiceLabel({ appointment, service, obrigacao, cobranca, fallback = "Serviço" }) {
  return formatWalletServiceLabel(
    appointment?.service_type
    || service?.service_type
    || service?.servico
    || obrigacao?.descricao
    || cobranca?.descricao
    || fallback,
    fallback,
  );
}

function buildOperationalHistoryRows({
  walletAccountId,
  executionRows = [],
  reversalRows = [],
  appointments = [],
  services = [],
  obligations = [],
  charges = [],
  accountsReceivable = [],
  dogs = [],
}) {
  if (!walletAccountId) return [];

  const appointmentsById = new Map((appointments || []).map((item) => [item?.id, item]));
  const servicesById = new Map((services || []).map((item) => [item?.id, item]));
  const servicesByAppointmentId = new Map(
    (services || [])
      .filter((item) => item?.appointment_id)
      .map((item) => [item.appointment_id, item]),
  );
  const obligationsById = new Map((obligations || []).map((item) => [item?.id, item]));
  const chargesById = new Map((charges || []).map((item) => [item?.id, item]));
  const accountsReceivableById = new Map((accountsReceivable || []).map((item) => [item?.id, item]));
  const dogsById = new Map((dogs || []).map((item) => [item?.id, item]));

  const paymentRows = (executionRows || [])
    .filter((row) => row?.carteira_conta_id === walletAccountId)
    .map((row) => {
      const obrigacao = obligationsById.get(row?.obrigacao_id) || null;
      const cobranca = chargesById.get(row?.cobranca_financeira_id) || null;
      const appointment = appointmentsById.get(obrigacao?.appointment_id) || null;
      const service = servicesByAppointmentId.get(appointment?.id) || null;
      const dueDate = obrigacao?.due_date || cobranca?.due_date || null;
      const situation = calculateOperationalSituation({
        dueDate,
        statuses: [row?.obrigacao_status, row?.cobranca_status],
      });

      return {
        id: `payment-${row?.execucao_id}`,
        type: "payment",
        title: "Pagamento registrado",
        badgeLabel: row?.classe_resultado === "idempotente_reutilizado" ? "Retry reaproveitado" : "Pagamento V2",
        badgeTone: row?.classe_resultado === "idempotente_reutilizado" ? "outline" : "payment",
        eventDate: row?.created_date || null,
        serviceLabel: resolveEventServiceLabel({ appointment, service, obrigacao, cobranca, fallback: "Pagamento" }),
        dogName: resolveEventDogName({ appointment, service, dogsById }),
        amount: Number(row?.valor_solicitado || 0),
        dueDate,
        statusLabel: situation.label,
        statusTone: situation.tone,
        statusHelper: situation.helper,
        details: {
          tipo: row?.forma_pagamento || "Não informado",
          origem: row?.origem_operacional || "Não informada",
          obrigacaoStatus: row?.obrigacao_status || "—",
          cobrancaStatus: row?.cobranca_status || "—",
          sourceKey: row?.source_key || "—",
          operacaoIdempotencia: row?.operacao_idempotencia || "—",
          reasonMessage: row?.reason_message || null,
        },
      };
    });

  const reversalHistoryRows = (reversalRows || [])
    .filter((row) => row?.carteira_conta_id === walletAccountId)
    .map((row) => {
      const appointmentId = row?.appointment_id || row?.metadata?.original_appointment_id || null;
      const serviceId = row?.serviceprovided_id || row?.metadata?.original_serviceprovided_id || null;
      const appointment = appointmentsById.get(appointmentId) || null;
      const service = servicesById.get(serviceId) || servicesByAppointmentId.get(appointmentId) || null;
      const obrigacao = obligationsById.get(row?.obrigacao_id) || null;
      const cobranca = chargesById.get(row?.cobranca_financeira_id) || null;
      const contaReceber = accountsReceivableById.get(row?.conta_receber_id) || null;

      return {
        id: `reversal-${row?.reversao_id}`,
        type: "reversal",
        title: row?.reversao_tipo === "saldo" ? "Estorno de saldo" : "Estorno de serviço",
        badgeLabel: row?.reversao_tipo === "saldo" ? "Estorno" : "Estornado",
        badgeTone: "reversal",
        eventDate: row?.created_date || null,
        serviceLabel: row?.reversao_tipo === "saldo"
          ? "Saldo em carteira"
          : resolveEventServiceLabel({ appointment, service, obrigacao, cobranca, fallback: "Estorno de serviço" }),
        dogName: row?.reversao_tipo === "saldo" ? "Responsável financeiro" : resolveEventDogName({ appointment, service, dogsById }),
        amount: Number(row?.valor_estornado || 0),
        dueDate: obrigacao?.due_date || cobranca?.due_date || contaReceber?.vencimento || null,
        statusLabel: "Regular",
        statusTone: "regular",
        statusHelper: row?.servico_realizado ? "Serviço mantido para trilha histórica." : "Serviço não realizado removido conforme contrato.",
        details: {
          appointmentId: appointmentId || null,
          serviceprovidedId: serviceId || null,
          obrigacaoId: row?.obrigacao_id || null,
          tipo: row?.reversao_tipo || "—",
          motivo: row?.motivo || "—",
          executor: row?.metadata?.executed_by_label || row?.metadata?.initiated_by_label || "—",
          attachmentName: row?.attachment_name || "—",
          attachmentPath: row?.attachment_path || "",
          attachmentExtension: row?.attachment_extension || "—",
          obrigacaoStatus: row?.obrigacao_status || "—",
          cobrancaStatus: row?.cobranca_status || "—",
          contaReceberStatus: row?.conta_receber_status || "—",
          sourceKey: row?.source_key || "—",
          operacaoIdempotencia: row?.operacao_idempotencia || "—",
          servicoRealizado: row?.servico_realizado ? "Sim" : "Não",
          reasonMessage: row?.reason_message || null,
        },
      };
    });

  return [...paymentRows, ...reversalHistoryRows].sort(
    (left, right) => new Date(left?.eventDate || 0).getTime() - new Date(right?.eventDate || 0).getTime(),
  );
}

function buildWalletReversalServiceOptions({
  walletAccountId,
  appointments = [],
  services = [],
  obligations = [],
  charges = [],
  accountsReceivable = [],
  dogs = [],
}) {
  if (!walletAccountId) return [];

  const appointmentsById = new Map((appointments || []).map((item) => [item?.id, item]));
  const servicesByAppointmentId = new Map(
    (services || [])
      .filter((item) => item?.appointment_id)
      .map((item) => [item.appointment_id, item]),
  );
  const chargesById = new Map((charges || []).map((item) => [item?.id, item]));
  const receivablesByAppointmentId = new Map(
    (accountsReceivable || [])
      .filter((item) => item?.appointment_id)
      .map((item) => [item.appointment_id, item]),
  );
  const dogsById = new Map((dogs || []).map((item) => [item?.id, item]));

  return (obligations || [])
    .filter((item) => item?.carteira_conta_id === walletAccountId)
    .filter((item) => !["cancelada", "estornada"].includes(String(item?.status || "").toLowerCase()))
    .map((obrigacao) => {
      const appointment = appointmentsById.get(obrigacao?.appointment_id) || null;
      const service = servicesByAppointmentId.get(obrigacao?.appointment_id) || null;
      const charge = chargesById.get(obrigacao?.cobranca_financeira_id) || null;
      const receivable = receivablesByAppointmentId.get(obrigacao?.appointment_id) || null;
      const dogName = resolveEventDogName({ appointment, service, dogsById });
      const serviceLabel = resolveEventServiceLabel({ appointment, service, obrigacao, cobranca: charge, fallback: "Serviço" });
      const serviceRealized = Boolean(
        service?.checkin_id
        || appointment?.linked_checkin_id
        || appointment?.checkin_id
        || String(service?.status || "").toLowerCase() === "concluido"
        || String(appointment?.status || "").toLowerCase() === "concluido",
      );
      const value = Number(
        service?.valor_cobrado
        ?? service?.preco
        ?? receivable?.valor
        ?? obrigacao?.valor_final
        ?? obrigacao?.valor_original
        ?? 0,
      );

      return {
        key: obrigacao?.id || appointment?.id || service?.id || receivable?.id || Math.random().toString(36).slice(2),
        obrigacao_id: obrigacao?.id || "",
        appointment_id: appointment?.id || "",
        serviceprovided_id: service?.id || "",
        cobranca_financeira_id: charge?.id || "",
        conta_receber_id: receivable?.id || "",
        service_label: serviceLabel,
        dog_name: dogName,
        due_date: obrigacao?.due_date || charge?.due_date || receivable?.vencimento || null,
        value,
        status: obrigacao?.status || "—",
        service_realized: serviceRealized,
        helper: serviceRealized
          ? "Serviço realizado: ficará zerado, Estornado e Pago."
          : "Serviço não realizado: poderá ser removido conforme contrato.",
      };
    })
    .sort((left, right) => {
      const leftDate = left?.due_date ? new Date(`${left.due_date}T00:00:00`).getTime() : 0;
      const rightDate = right?.due_date ? new Date(`${right.due_date}T00:00:00`).getTime() : 0;
      return rightDate - leftDate;
    });
}

function formatWalletStatementDate(value) {
  const normalized = normalizeDateOnly(value);
  if (!normalized) return "—";
  return new Date(`${normalized}T00:00:00`).toLocaleDateString("pt-BR");
}

function getWalletChargeDuePresentation(value) {
  const normalized = normalizeDateOnly(value);
  if (!normalized) {
    return {
      label: "Sem vencimento",
      className: "border-slate-200 bg-slate-50 text-slate-600",
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${normalized}T00:00:00`);
  const differenceInDays = Math.round((dueDate.getTime() - today.getTime()) / 86400000);

  if (differenceInDays < 0) {
    const overdueDays = Math.abs(differenceInDays);
    return {
      label: overdueDays === 1 ? "Vencida há 1 dia" : `Vencida há ${overdueDays} dias`,
      className: "border-red-200 bg-red-50 text-red-700",
    };
  }

  if (differenceInDays === 0) {
    return {
      label: "Vence hoje",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: differenceInDays === 1 ? "Vence amanhã" : `Vence em ${differenceInDays} dias`,
    className: "border-blue-200 bg-blue-50 text-blue-700",
  };
}

function buildWalletCreditTransactionCandidates(transaction) {
  const metadata = transaction?.metadata_financeira && typeof transaction.metadata_financeira === "object"
    ? transaction.metadata_financeira
    : {};

  return [
    transaction?.id,
    transaction?.transacao_id,
    transaction?.referencia,
    transaction?.reference,
    transaction?.codigo_solicitacao,
    transaction?.raw_data?.codigoSolicitacao,
    transaction?.raw_data?.solicitacaoId,
    metadata?.codigo_solicitacao,
    metadata?.txid,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function resolveWalletCreditTransaction({ movement, transactions = [] }) {
  const targetReference = String(movement?.transacao_id || "").trim();
  if (!targetReference) return null;

  return (transactions || []).find((transaction) =>
    buildWalletCreditTransactionCandidates(transaction).includes(targetReference),
  ) || null;
}

function resolveWalletCreditPaymentMethod({ movement, transaction }) {
  const normalizedTransaction = transaction ? normalizeMovement(transaction) : null;
  const method = normalizedTransaction?.tipoDetalhado && normalizedTransaction.tipoDetalhado !== "-"
    ? normalizedTransaction.tipoDetalhado
    : normalizedTransaction?.metodo;
  const movementOrigin = String(movement?.origem || "").trim().toLowerCase();
  const movementType = String(movement?.tipo || "").trim().toLowerCase();

  if (movementOrigin === "orcamento_pagamento_banco_inter") {
    return method ? `${method} via boleto bancário` : "Pix via boleto bancário";
  }

  if (
    movementOrigin === "admin_manual"
    || ["credito_manual", "ajuste_manual", "estorno_manual"].includes(movementType)
  ) {
    return "Crédito em carteira";
  }

  return method || movement?.origem || "Forma não informada";
}

function resolveBudgetPaymentMethod(paymentRow) {
  const metadata = paymentRow?.metadata && typeof paymentRow.metadata === "object" ? paymentRow.metadata : {};
  const chargeSnapshot = metadata?.charge_snapshot && typeof metadata.charge_snapshot === "object"
    ? metadata.charge_snapshot
    : {};
  const receiptOrigin = String(
    chargeSnapshot?.cobranca?.origemRecebimento
    || chargeSnapshot?.origemRecebimento
    || "",
  ).trim().toUpperCase();
  const metodo = String(paymentRow?.metodo || "").trim().toLowerCase();

  if (metodo === "boleto_bancario") {
    return receiptOrigin === "PIX" ? "Pix via boleto bancário" : "Boleto bancário";
  }
  if (metodo === "pix_transferencia") {
    return "Pix ou transferência";
  }
  if (metodo === "cartao") {
    return "Cartão";
  }

  return paymentRow?.metodo || "Forma não informada";
}

function resolveWalletTimelineCreditTitle(row) {
  const movementType = String(row?.movementType || "").trim().toLowerCase();
  if (movementType === "credito_manual") return "Crédito manual";
  if (movementType === "ajuste_manual") return "Ajuste manual";
  if (movementType === "estorno_manual") return "Estorno manual";
  if (movementType === "entrada_direcionada") return "Pagamento recebido";
  return "Pagamento recebido";
}

function formatWalletStatementReferenceCode(referenceType, referenceRecord) {
  const fullReference = referenceRecord ? getInternalEntityReference(referenceRecord) : null;
  if (!fullReference) return null;
  if (referenceType === "orcamento") {
    return String(fullReference).slice(0, 4);
  }
  return fullReference;
}

function roundWalletStatementAmount(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function buildMonthlyDueDate(referenceDateValue, dueDayValue) {
  const normalizedReference = normalizeDateOnly(referenceDateValue);
  const parsedDueDay = Number.parseInt(String(dueDayValue || "").trim(), 10);
  if (!normalizedReference || !Number.isFinite(parsedDueDay) || parsedDueDay <= 0) {
    return null;
  }

  const [yearText, monthText] = normalizedReference.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const effectiveDay = Math.min(parsedDueDay, lastDayOfMonth);
  return `${yearText}-${monthText}-${String(effectiveDay).padStart(2, "0")}`;
}

function resolveRecurringPackageDueDate({
  appointmentDate,
  recurringPackage,
  walletDefaultDueDay,
}) {
  const recurringDueDay = recurringPackage?.renovacao_dia
    || recurringPackage?.due_day
    || recurringPackage?.vencimento_padrao
    || walletDefaultDueDay
    || null;

  const monthlyDueDate = buildMonthlyDueDate(
    appointmentDate || recurringPackage?.data_vencimento || recurringPackage?.created_at || null,
    recurringDueDay,
  );

  return monthlyDueDate
    || normalizeDateOnly(recurringPackage?.data_vencimento)
    || normalizeDateOnly(appointmentDate)
    || null;
}

function buildWalletStatementRows({
  walletId,
  walletAccountId,
  walletAvailableBalance = 0,
  walletDefaultDueDay = null,
  movements = [],
  transactions = [],
  appointments = [],
  services = [],
  obligations = [],
  charges = [],
  accountsReceivable = [],
  dogs = [],
  budgets = [],
  recurringPackages = [],
  budgetPayments = [],
}) {
  if (!walletId && !walletAccountId) {
    return {
      rows: [],
      debitRows: [],
      creditRows: [],
      debitTotal: 0,
      creditTotal: 0,
      netBalance: 0,
    };
  }

  const appointmentsById = new Map((appointments || []).map((item) => [item?.id, item]));
  const servicesByAppointmentId = new Map(
    (services || [])
      .filter((item) => item?.appointment_id)
      .map((item) => [item.appointment_id, item]),
  );
  const dogsById = new Map((dogs || []).map((item) => [item?.id, item]));
  const chargesById = new Map((charges || []).map((item) => [item?.id, item]));
  const receivablesByAppointmentId = new Map(
    (accountsReceivable || [])
      .filter((item) => item?.appointment_id)
      .map((item) => [item.appointment_id, item]),
  );
  const budgetsById = new Map((budgets || []).map((item) => [item?.id, item]));
  const recurringPackagesById = new Map((recurringPackages || []).map((item) => [item?.id, item]));
  const paidBudgetIds = new Set(
    (budgetPayments || [])
      .filter((row) => row?.carteira_id === walletId)
      .filter((row) => ["recebido", "pago"].includes(String(row?.status || "").toLowerCase()))
      .map((row) => row?.orcamento_id)
      .filter(Boolean),
  );
  const debitAppointmentIds = new Set();
  const budgetAppointmentCounts = (appointments || []).reduce((acc, appointment) => {
    if (!appointment?.orcamento_id) return acc;
    if (["cancelado"].includes(String(appointment?.status || "").toLowerCase())) return acc;
    acc[appointment.orcamento_id] = (acc[appointment.orcamento_id] || 0) + 1;
    return acc;
  }, {});

  const debitRowsFromObligations = (obligations || [])
    .filter((item) => item?.carteira_conta_id === walletAccountId)
    .filter((item) => !["cancelada", "estornada"].includes(String(item?.status || "").toLowerCase()))
    .map((obrigacao) => {
      const appointment = appointmentsById.get(obrigacao?.appointment_id) || null;
      const service = servicesByAppointmentId.get(obrigacao?.appointment_id) || null;
      const charge = chargesById.get(obrigacao?.cobranca_financeira_id) || null;
      const receivable = receivablesByAppointmentId.get(obrigacao?.appointment_id) || null;
      const dogName = resolveEventDogName({ appointment, service, dogsById });
      const appointmentDate = getAppointmentDateKey(appointment) || obrigacao?.metadata?.appointment_date || null;
      const budget = obrigacao?.orcamento_id ? budgetsById.get(obrigacao.orcamento_id) : null;
      const recurringPackage = obrigacao?.recurring_package_id ? recurringPackagesById.get(obrigacao.recurring_package_id) : null;
      const referenceRecord = budget || recurringPackage || null;
      const referenceType = budget ? "orcamento" : recurringPackage ? "pacote" : null;
      const referenceId = budget?.id || recurringPackage?.id || null;
      const referenceCode = formatWalletStatementReferenceCode(referenceType, referenceRecord);
      const recurringDueDate = recurringPackage
        ? resolveRecurringPackageDueDate({
          appointmentDate,
          recurringPackage,
          walletDefaultDueDay,
        })
        : null;
      const paymentStatus = normalizeWalletPaymentStatus(
        receivable?.status
        || obrigacao?.status
        || charge?.status
        || service?.status_pagamento
        || service?.status,
      ) || (budget?.id && paidBudgetIds.has(budget.id) ? "paid" : "pending");
      if (appointment?.id || obrigacao?.appointment_id) {
        debitAppointmentIds.add(appointment?.id || obrigacao?.appointment_id);
      }

      return {
        id: `debit-${obrigacao?.id}`,
        appointmentId: appointment?.id || obrigacao?.appointment_id || null,
        appointmentDate,
        serviceLabel: resolveEventServiceLabel({ appointment, service, obrigacao, cobranca: charge, fallback: "Serviço" }),
        dogName,
        dueDate: obrigacao?.due_date || charge?.due_date || receivable?.vencimento || recurringDueDate || null,
        amount: Number(
          receivable?.valor
          ?? obrigacao?.valor_final
          ?? obrigacao?.valor_original
          ?? obrigacao?.valor_em_aberto
          ?? service?.valor_cobrado
          ?? service?.preco
          ?? 0,
        ),
        referenceType,
        referenceId,
        referenceCode,
        referenceLabel: referenceType === "pacote" ? "Pacote" : "Orçamento",
        paymentStatus,
      };
    });

  const fallbackDebitRows = (appointments || [])
    .filter((appointment) => appointment?.cliente_id === walletId)
    .filter((appointment) => !debitAppointmentIds.has(appointment?.id))
    .filter((appointment) => !["cancelado"].includes(String(appointment?.status || "").toLowerCase()))
    .filter((appointment) => appointment?.orcamento_id || appointment?.recurring_package_id)
    .map((appointment) => {
      const service = servicesByAppointmentId.get(appointment?.id) || null;
      const budget = appointment?.orcamento_id ? budgetsById.get(appointment.orcamento_id) : null;
      const recurringPackage = appointment?.recurring_package_id ? recurringPackagesById.get(appointment.recurring_package_id) : null;
      const dogName = resolveEventDogName({ appointment, service, dogsById });
      const referenceType = budget ? "orcamento" : recurringPackage ? "pacote" : null;
      const referenceId = budget?.id || recurringPackage?.id || null;
      const referenceRecord = budget || recurringPackage || null;
      const referenceCode = formatWalletStatementReferenceCode(referenceType, referenceRecord);
      const budgetAppointmentCount = budget?.id ? Math.max(Number(budgetAppointmentCounts[budget.id] || 1), 1) : 1;
      const fallbackBudgetShare = budget?.valor_total ? Number(budget.valor_total) / budgetAppointmentCount : 0;
      const recurringDueDate = recurringPackage
        ? resolveRecurringPackageDueDate({
          appointmentDate: getAppointmentDateKey(appointment) || appointment?.data_referencia || null,
          recurringPackage,
          walletDefaultDueDay,
        })
        : null;
      const paymentStatus = normalizeWalletPaymentStatus(
        service?.status_pagamento
        || service?.status
        || appointment?.status_pagamento
        || appointment?.payment_status,
      ) || (budget?.id && paidBudgetIds.has(budget.id) ? "paid" : "pending");

      return {
        id: `debit-fallback-${appointment?.id}`,
        appointmentId: appointment?.id || null,
        appointmentDate: getAppointmentDateKey(appointment) || appointment?.data_referencia || null,
        serviceLabel: resolveEventServiceLabel({ appointment, service, fallback: "Serviço" }),
        dogName,
        dueDate: budget?.data_validade || recurringDueDate || appointment?.data_referencia || null,
        amount: Number(
          service?.valor_cobrado
          ?? service?.preco
          ?? appointment?.valor_previsto
          ?? fallbackBudgetShare
          ?? recurringPackage?.valor_mensal
          ?? recurringPackage?.valor
          ?? 0,
        ),
        referenceType,
        referenceId,
        referenceCode,
        referenceLabel: referenceType === "pacote" ? "Pacote" : "Orçamento",
        paymentStatus,
      };
    });

  const debitRows = [...debitRowsFromObligations, ...fallbackDebitRows]
    .sort((left, right) => {
      const leftDate = new Date(`${normalizeDateOnly(left?.appointmentDate || left?.dueDate) || "1970-01-01"}T00:00:00`).getTime();
      const rightDate = new Date(`${normalizeDateOnly(right?.appointmentDate || right?.dueDate) || "1970-01-01"}T00:00:00`).getTime();
      return rightDate - leftDate;
    });

  const excludedManualMovementIds = new Set(
    (movements || [])
      .map((movement) => String(movement?.origem || "").trim().toLowerCase())
      .filter((origin) => origin.startsWith("admin_manual_exclusao:"))
      .map((origin) => origin.slice("admin_manual_exclusao:".length))
      .filter(Boolean),
  );

  const creditRowsFromWallet = (movements || [])
    .filter((movement) => movement?.carteira_conta_id === walletAccountId)
    .filter((movement) => String(movement?.natureza || "").toLowerCase() === "entrada")
    .filter((movement) => !excludedManualMovementIds.has(String(movement?.movimento_id || "").toLowerCase()))
    .filter((movement) => {
      const movementType = String(movement?.tipo || "").trim().toLowerCase();
      return (
        movementType === "entrada_direcionada"
        || movementType === "credito_manual"
        || movementType === "ajuste_manual"
        || movementType === "estorno_manual"
        || Boolean(movement?.transacao_id)
      );
    })
    .map((movement) => {
      const transaction = resolveWalletCreditTransaction({ movement, transactions });
      const normalizedTransaction = transaction ? normalizeMovement(transaction) : null;
      const transactionLookup = normalizedTransaction?.id || String(movement?.transacao_id || movement?.referencia_amigavel || "").trim() || null;

      return {
        id: `credit-${movement?.movimento_id}`,
        movementId: movement?.movimento_id || null,
        movementType: movement?.tipo || null,
        transactionId: normalizedTransaction?.id || null,
        transactionLookup,
        receivedDate: normalizedTransaction?.dataHora || normalizedTransaction?.data_movimento || normalizedTransaction?.data || movement?.created_date || null,
        counterparty: normalizedTransaction?.contraparte || movement?.descricao || movement?.referencia_amigavel || "Contraparte não informada",
        amount: Number(movement?.valor || 0),
        paymentMethod: resolveWalletCreditPaymentMethod({ movement, transaction }),
        isManualMovement: ["credito_manual", "ajuste_manual", "estorno_manual"].includes(
          String(movement?.tipo || "").trim().toLowerCase(),
        ) && String(movement?.origem || "").trim().toLowerCase() === "admin_manual",
      };
    });

  const existingCreditTransactionKeys = new Set(
    creditRowsFromWallet.flatMap((row) => [row?.transactionId, row?.transactionLookup]).filter(Boolean),
  );
  const existingCreditMovementIds = new Set(
    creditRowsFromWallet.map((row) => row?.movementId).filter(Boolean),
  );

  const creditRowsFromBudgetPayments = (budgetPayments || [])
    .filter((row) => row?.carteira_id === walletId)
    .filter((row) => ["recebido", "pago"].includes(String(row?.status || "").toLowerCase()))
    .filter((row) => {
      if (row?.credited_wallet_movement_id && existingCreditMovementIds.has(row.credited_wallet_movement_id)) {
        return false;
      }

      const transactionKeys = [row?.codigo_solicitacao, row?.txid, row?.id]
        .map((item) => String(item || "").trim())
        .filter(Boolean);
      return !transactionKeys.some((key) => existingCreditTransactionKeys.has(key));
    })
    .map((row) => ({
      id: `credit-budget-${row?.id}`,
      movementId: row?.credited_wallet_movement_id || null,
      movementType: "entrada_direcionada",
      transactionId: null,
      transactionLookup: String(row?.txid || row?.codigo_solicitacao || row?.id || "").trim() || null,
      receivedDate: row?.pago_em || row?.updated_date || row?.created_date || null,
      counterparty: row?.metadata?.responsavel_nome || "Contraparte não informada",
      amount: Number(row?.valor_recebido || row?.valor || 0),
      paymentMethod: resolveBudgetPaymentMethod(row),
      isManualMovement: false,
    }));

  const creditRows = [...creditRowsFromWallet, ...creditRowsFromBudgetPayments]
    .sort((left, right) => new Date(right?.receivedDate || 0).getTime() - new Date(left?.receivedDate || 0).getTime());

  const settlementSummary = buildWalletChronologicalSettlement({
    debitRows,
    creditRows,
    walletAvailableBalance,
  });
  const settledDebitRows = settlementSummary.debitRows;

  const unifiedRows = [
    ...settledDebitRows.map((row) => ({
      ...row,
      rowKind: "debit",
      sortDate: normalizeDateOnly(row?.appointmentDate || row?.dueDate) || null,
      primaryDate: row?.appointmentDate || row?.dueDate || null,
      secondaryLabel: row?.dogName || "—",
      tertiaryLabel: row?.dueDate ? `Vencimento: ${formatWalletStatementDate(row.dueDate)}` : "Vencimento não informado",
      amountTone: "debit",
    })),
    ...creditRows.map((row) => ({
      ...row,
      rowKind: "credit",
      sortDate: normalizeDateOnly(row?.receivedDate) || null,
      primaryDate: row?.receivedDate || null,
      primaryLabel: row?.counterparty || "Contraparte não informada",
      secondaryLabel: row?.paymentMethod || "Forma não informada",
      tertiaryLabel: "Abrir transação",
      amountTone: "credit",
    })),
  ].sort((left, right) => {
    const leftDate = left?.sortDate ? new Date(`${left.sortDate}T00:00:00`).getTime() : 0;
    const rightDate = right?.sortDate ? new Date(`${right.sortDate}T00:00:00`).getTime() : 0;
    return rightDate - leftDate;
  });

  const debitTotal = settledDebitRows.reduce((sum, row) => sum + Number(row?.amount || 0), 0);
  const creditTotal = creditRows.reduce((sum, row) => sum + Number(row?.amount || 0), 0);

  return {
    rows: unifiedRows,
    debitRows: settledDebitRows,
    creditRows,
    debitTotal,
    creditTotal,
    netBalance: roundWalletStatementAmount(creditTotal - debitTotal),
  };
}

function normalizeMovementSummary(summary) {
  if (!summary || typeof summary !== "object") return null;

  return {
    movement_count: Number(summary.movement_count) || 0,
    total_entradas: Number(summary.total_entradas) || 0,
    total_saidas: Number(summary.total_saidas) || 0,
    oldest_movement_date: summary.oldest_movement_date || null,
    newest_movement_date: summary.newest_movement_date || null,
    generated_at: summary.generated_at || null,
  };
}

function buildSummaryFromMovements(rows) {
  const normalizedRows = dedupeOfficialImportedMovements(rows || [])
    .map((item) => normalizeMovement(item))
    .sort((a, b) => (b.dataOrdenacao?.getTime() || 0) - (a.dataOrdenacao?.getTime() || 0));

  let totalEntradas = 0;
  let totalSaidas = 0;
  let oldestMovementDate = null;
  let newestMovementDate = null;

  for (const item of normalizedRows) {
    if (item.tipo === "saida") {
      totalSaidas += item.valor || 0;
    } else {
      totalEntradas += item.valor || 0;
    }

    const movementDate = item.data_movimento || item.data || null;
    if (!movementDate) continue;

    if (!oldestMovementDate || movementDate < oldestMovementDate) {
      oldestMovementDate = movementDate;
    }
    if (!newestMovementDate || movementDate > newestMovementDate) {
      newestMovementDate = movementDate;
    }
  }

  return {
    movement_count: normalizedRows.length,
    total_entradas: totalEntradas,
    total_saidas: totalSaidas,
    oldest_movement_date: oldestMovementDate,
    newest_movement_date: newestMovementDate,
    generated_at: new Date().toISOString(),
  };
}

async function requestLiveBalance(empresaId) {
  return bancoInter({
    action: "liveBalance",
    empresa_id: empresaId || null,
  });
}

function StatCard({ label, value, className = "", valueClassName = "", icon = null, helper = null, isBlurred = false }) {
  return (
    <Card className={className}>
      <CardContent className="p-2 sm:p-4">
        <div className="flex items-center justify-between gap-1.5 sm:gap-2">
          <p className="text-[10px] font-medium leading-tight text-gray-500 sm:text-sm">{label}</p>
          {icon}
        </div>
        <p className={`mt-1 text-base font-bold leading-tight transition sm:mt-2 sm:text-2xl ${isBlurred ? "blur-[6px] opacity-50 select-none" : ""} ${valueClassName}`}>
          {value}
        </p>
        {helper ? <p className="mt-2 hidden text-xs text-gray-500 sm:block">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}

StatCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  className: PropTypes.string,
  valueClassName: PropTypes.string,
  icon: PropTypes.node,
  helper: PropTypes.string,
  isBlurred: PropTypes.bool,
};

function getOperationalBadgeClass(tone) {
  if (tone === "reversal") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "payment") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function getOperationalStatusClass(tone) {
  if (tone === "irregular") return "border-red-200 bg-red-50 text-red-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function getWalletTimelineDotClass(row) {
  if (row?.sourceKind === "transaction") return "bg-emerald-500";
  if (row?.sourceKind === "reversal") return "bg-red-500";
  if (row?.paymentStatus === "paid") return "bg-emerald-500";
  return "bg-amber-400";
}

function getLinkedDogIdsFromCarteira(carteira) {
  return Array.from({ length: 8 }, (_, index) => carteira?.[`dog_id_${index + 1}`]).filter(Boolean);
}

function normalizeWalletPaymentStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["pago", "paga", "quitado", "quitada", "liquidado", "liquidada", "estornado"].includes(normalized)) {
    return "paid";
  }
  if (["pendente", "em_aberto", "aberto", "vencido", "atrasado", "parcial"].includes(normalized)) {
    return "pending";
  }
  return null;
}

function buildWalletAdminAccounts(accounts = [], carteiras = [], dogs = [], receivables = []) {
  const carteirasById = new Map((carteiras || []).map((carteira) => [carteira?.id, carteira]));
  const accountsByCarteiraId = new Map(
    (accounts || [])
      .filter((account) => account?.carteira_id && carteirasById.has(account.carteira_id))
      .map((account) => [account.carteira_id, account]),
  );
  const dogsById = new Map((dogs || []).map((dog) => [dog?.id, dog]));
  const financialStatusMap = buildFinancialOperationalStatusMap(receivables);

  const buildVisibleWallet = (carteira) => {
    const account = accountsByCarteiraId.get(carteira?.id) || null;
    const linkedDogLabels = getLinkedDogIdsFromCarteira(carteira).map((dogId) => {
      const dog = dogsById.get(dogId);
      if (!dog) return null;
      const breed = String(dog?.raca || "").trim();
      return breed ? `${dog.nome} - ${breed}` : dog.nome;
    }).filter(Boolean);
    const financialStatus = getFinancialOperationalStatus(financialStatusMap, carteira?.id || null);

    return {
      ...(account || {}),
      carteira_selection_id: account?.carteira_conta_id || `virtual:${carteira?.id}`,
      carteira_conta_id: account?.carteira_conta_id || null,
      carteira_id: carteira?.id || null,
      carteira_nome: carteira?.nome_razao_social || carteira?.nome_fantasia || "Responsável financeiro",
      carteira_codigo: carteira?.cpf_cnpj || carteira?.celular || carteira?.email || null,
      carteira_vencimento_padrao: carteira?.vencimento_planos || null,
      linked_dog_labels: linkedDogLabels,
      financial_status_label: financialStatus?.label || "Regular",
      financial_status_tone: financialStatus?.tone || "regular",
      saldo_atual: Number(account?.saldo_atual || 0),
      movimento_count: Number(account?.movimento_count || 0),
      ultimo_movimento_em: account?.ultimo_movimento_em || null,
      latest_reconciliation_status: account?.latest_reconciliation_status || (account ? null : "sem_conta"),
      has_wallet_account: Boolean(account?.carteira_conta_id),
    };
  };

  return (carteiras || [])
    .filter((carteira) => carteira?.ativo !== false)
    .map(buildVisibleWallet)
    .sort((left, right) =>
      String(left?.carteira_nome || "").localeCompare(String(right?.carteira_nome || ""), "pt-BR", { sensitivity: "base" }),
    );
}

function getPayableRemainingAmount(payable) {
  const total = Number(payable?.valor || 0) + Number(payable?.juros_multa || 0);
  return Math.max(Math.round((total - Number(payable?.valor_quitado || 0)) * 100) / 100, 0);
}

function getPayableTransactionLinks(payable) {
  return Array.isArray(payable?.vinculacoes) ? payable.vinculacoes : [];
}

function resolveLinkedPayableId(movement, payables = []) {
  const metadata = movement?.metadata_financeira && typeof movement.metadata_financeira === "object"
    ? movement.metadata_financeira
    : {};
  const directId = String(metadata?.lancamento_id || "").trim();
  if (directId) return directId;

  const financialLink = String(movement?.vinculo_financeiro || "").trim();
  const linkedPayable = payables.find((payable) => (
    payable?.id === financialLink
    || payable?.codigo_vinculo_financeiro === financialLink
    || getPayableTransactionLinks(payable).some((link) => link?.transaction_id === movement?.id)
  ));
  return linkedPayable?.id || "";
}

function resolveLinkedWalletId(movement, wallets = []) {
  const metadata = movement?.metadata_financeira && typeof movement.metadata_financeira === "object"
    ? movement.metadata_financeira
    : {};
  const directId = String(metadata?.carteira_id || "").trim();
  if (directId) return directId;

  const financialLink = String(movement?.vinculo_financeiro || "").trim();
  return wallets.find((wallet) => wallet?.carteira_id === financialLink)?.carteira_id || "";
}

export default function Movimentacoes({ walletOnly = false }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentBalance, setCurrentBalance] = useState(null);
  const [currentBalanceAt, setCurrentBalanceAt] = useState(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [summarySnapshot, setSummarySnapshot] = useState(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("all");
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [isSaving, setIsSaving] = useState(false);
  const [payables, setPayables] = useState([]);
  const [complementOptionsLoading, setComplementOptionsLoading] = useState(false);
  const [complementOptionsError, setComplementOptionsError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);
  const [receiptLoadingId, setReceiptLoadingId] = useState(null);
  const [transactionReceipt, setTransactionReceipt] = useState(null);
  const [isReceiptDownloading, setIsReceiptDownloading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(MOVEMENTS_PAGE_SIZE);
  const [cacheHydrated, setCacheHydrated] = useState(false);
  const [hasLoadedFullDataset, setHasLoadedFullDataset] = useState(false);
  const [walletFlags, setWalletFlags] = useState({
    balanceReadEnabled: false,
    movementsEnabled: false,
    manualAdjustmentsEnabled: false,
    manualCreditEnabled: false,
    paymentV2WriteEnabled: false,
    paymentV2ReversalEnabled: false,
  });
  const [walletAccounts, setWalletAccounts] = useState([]);
  const [walletAuditRows, setWalletAuditRows] = useState([]);
  const [walletRecentMovements, setWalletRecentMovements] = useState([]);
  const [walletOperationalHistory, setWalletOperationalHistory] = useState([]);
  const [walletReceivables, setWalletReceivables] = useState([]);
  const [walletOperationalContext, setWalletOperationalContext] = useState({
    appointments: [],
    services: [],
    obligations: [],
    charges: [],
    accountsReceivable: [],
    dogs: [],
    budgets: [],
    recurringPackages: [],
    transactions: [],
    budgetPayments: [],
  });
  const [selectedWalletAccountId, setSelectedWalletAccountId] = useState("");
  const [walletListSearchTerm, setWalletListSearchTerm] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletFlagsLoaded, setWalletFlagsLoaded] = useState(false);
  const [walletHistoryLoading, setWalletHistoryLoading] = useState(false);
  const [walletDetailLoading, setWalletDetailLoading] = useState(false);
  const walletDetailRequestRef = useRef(0);
  const [walletTimelineFilter, setWalletTimelineFilter] = useState("all");
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletActionMessage, setWalletActionMessage] = useState(null);
  const [showWalletOperationModal, setShowWalletOperationModal] = useState(false);
  const [walletOperationForm, setWalletOperationForm] = useState({ ...EMPTY_WALLET_OPERATION_FORM });
  const [walletOperationError, setWalletOperationError] = useState("");
  const [showWalletChargeModal, setShowWalletChargeModal] = useState(false);
  const [walletChargeStep, setWalletChargeStep] = useState(1);
  const [walletChargeForm, setWalletChargeForm] = useState({ ...EMPTY_WALLET_CHARGE_FORM });
  const [walletChargeSaving, setWalletChargeSaving] = useState(false);
  const [walletChargeResult, setWalletChargeResult] = useState(null);
  const [walletChargeError, setWalletChargeError] = useState("");
  const [showWalletOpenChargesModal, setShowWalletOpenChargesModal] = useState(false);
  const [walletOpenCharges, setWalletOpenCharges] = useState([]);
  const [walletOpenChargesSort, setWalletOpenChargesSort] = useState("due_date");
  const [walletOpenChargesLoading, setWalletOpenChargesLoading] = useState(false);
  const [walletOpenChargesError, setWalletOpenChargesError] = useState("");
  const [walletOpenChargeGeneratedLinks, setWalletOpenChargeGeneratedLinks] = useState({});
  const [walletOpenChargeFeedback, setWalletOpenChargeFeedback] = useState({});
  const [walletOpenChargeRenewingId, setWalletOpenChargeRenewingId] = useState("");
  const [walletOpenChargeCancellingId, setWalletOpenChargeCancellingId] = useState("");
  const [walletChargePendingCancellation, setWalletChargePendingCancellation] = useState(null);
  const [walletManualDeletingId, setWalletManualDeletingId] = useState("");
  const [showWalletReversalModal, setShowWalletReversalModal] = useState(false);
  const [walletReversalForm, setWalletReversalForm] = useState({ ...EMPTY_WALLET_REVERSAL_FORM });
  const [walletReversalUploading, setWalletReversalUploading] = useState(false);
  const [walletReversalSaving, setWalletReversalSaving] = useState(false);
  const walletTransactionFilter = searchParams.get("transacaoId") || searchParams.get("search") || "";

  const applyCachedSnapshot = (expectedEmpresaId = null) => {
    const cached = readMovementsCache();
    if (!cached) return false;

    if (expectedEmpresaId && cached.empresa_id && cached.empresa_id !== expectedEmpresaId) {
      return false;
    }

    setMovimentacoes(Array.isArray(cached.movements) ? cached.movements : []);
    setCurrentBalance(null);
    setCurrentBalanceAt(null);
    setSummarySnapshot(normalizeMovementSummary(cached.summary));
    setHasLoadedFullDataset(false);
    setCacheHydrated(true);
    setIsInitialLoading(false);
    return true;
  };

  const loadData = async (userProfile, { preserveVisibleData = false } = {}) => {
    if (!preserveVisibleData && movimentacoes.length === 0 && !cacheHydrated) {
      setIsInitialLoading(true);
    }
    setIsSummaryLoading(true);

    try {
      let overviewEmpresaId = userProfile?.empresa_id || null;
      let overviewSummary = null;
      let overviewMovements = [];

      try {
        const overview = await bancoInter({
          action: "overview",
          empresa_id: userProfile?.empresa_id || null,
          limit: 250,
        });

        if (overview?.empresa_id) {
          overviewEmpresaId = overview.empresa_id;
        }

        overviewSummary = normalizeMovementSummary(overview?.summary);
        if (overviewSummary) {
          setSummarySnapshot(overviewSummary);
        }

        if (Array.isArray(overview?.movements)) {
          overviewMovements = overview.movements;
          setMovimentacoes(overview.movements);
        }

        writeMovementsCache({
          empresa_id: overviewEmpresaId,
          movements: overviewMovements,
          summary: overviewSummary,
          cached_at: new Date().toISOString(),
        });
      } catch (overviewError) {
        console.warn("Nao foi possivel carregar o panorama rapido do Banco Inter:", overviewError);
      } finally {
        setIsInitialLoading(false);
        setIsSummaryLoading(false);
      }

      let nextMovements = [];
      try {
        const fullDataset = await bancoInter({
          action: "fullDataset",
          empresa_id: userProfile?.empresa_id || null,
          limit: 50000,
          pageSize: 1000,
        });
        nextMovements = Array.isArray(fullDataset?.movements) ? fullDataset.movements : [];
      } catch (fullDatasetError) {
        console.warn("Não foi possível carregar o dataset consolidado do Banco Inter, usando leitura direta da tabela:", fullDatasetError);
        const fullMovementsResponse = ExtratoBancario.queryAll
          ? await ExtratoBancario.queryAll({
            sort: "-data_movimento",
            pageSize: 500,
            maxRows: 50000,
            count: false,
          })
          : (ExtratoBancario.listAll
            ? await ExtratoBancario.listAll("-data_movimento", 500, 50000)
            : await ExtratoBancario.list("-data_movimento", 5000));

        nextMovements = Array.isArray(fullMovementsResponse?.data)
          ? fullMovementsResponse.data
          : (fullMovementsResponse || []);
      }
      const derivedSummary = buildSummaryFromMovements(nextMovements);

      setMovimentacoes(nextMovements);
      setSummarySnapshot(derivedSummary);
      setHasLoadedFullDataset(true);
      writeMovementsCache({
        empresa_id: overviewEmpresaId,
        movements: nextMovements.slice(0, 250),
        summary: derivedSummary,
        cached_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Erro ao carregar movimentações:", error);
    } finally {
      setIsInitialLoading(false);
      setIsSummaryLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializePage = async () => {
      if (!walletOnly) {
        applyCachedSnapshot();
      }
      try {
        const me = await User.me();
        if (!isMounted) return;
        setCurrentUser(me || null);
        if (!walletOnly) {
          applyCachedSnapshot(me?.empresa_id || null);
          await loadData(me || null);
        }
      } catch (error) {
        console.warn("Não foi possível carregar o usuário atual:", error);
        if (isMounted) {
          if (!walletOnly) {
            applyCachedSnapshot();
            await loadData(null);
          }
        }
      } finally {
        if (isMounted && walletOnly) {
          setIsInitialLoading(false);
        }
      }
    };

    initializePage();

    return () => {
      isMounted = false;
    };
  }, [walletOnly]);

  useEffect(() => {
    if (walletOnly) return;
    if (!walletTransactionFilter) return;
    setSearchTerm(walletTransactionFilter);
  }, [walletOnly, walletTransactionFilter]);

  useEffect(() => {
    let cancelled = false;

    async function loadLiveBalance() {
      setIsBalanceLoading(true);
      try {
        const data = await requestLiveBalance(currentUser?.empresa_id || null);
        if (cancelled) return;
        if (typeof data?.saldo_atual === "number") {
          setCurrentBalance(data.saldo_atual);
          setCurrentBalanceAt(data?.saldo_atualizado_em || new Date().toISOString());
        } else {
          setCurrentBalance(null);
          setCurrentBalanceAt(null);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Não foi possível consultar o saldo ao vivo do Banco Inter:", error);
          setCurrentBalance(null);
          setCurrentBalanceAt(null);
        }
      } finally {
        if (!cancelled) {
          setIsBalanceLoading(false);
        }
      }
    }

    loadLiveBalance();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.empresa_id]);

  const canManageWalletOperations = Boolean(
    currentUser?.is_platform_admin
    || currentUser?.company_role === "platform_admin"
    || isManagerialProfile(currentUser)
    || isCommercialProfile(currentUser),
  );

  const loadWalletFlags = async (userProfile) => {
    if (!userProfile?.empresa_id) {
      setWalletFlagsLoaded(true);
      setWalletFlags({
        balanceReadEnabled: false,
        movementsEnabled: false,
        manualAdjustmentsEnabled: false,
        manualCreditEnabled: false,
        paymentV2WriteEnabled: false,
        paymentV2ReversalEnabled: false,
      });
      return {
        balanceReadEnabled: false,
        movementsEnabled: false,
        manualAdjustmentsEnabled: false,
        manualCreditEnabled: false,
        paymentV2WriteEnabled: false,
        paymentV2ReversalEnabled: false,
      };
    }

    const configResponse = AppConfig.queryAll
      ? await AppConfig.queryAll({ pageSize: 500, maxRows: 1000, count: false })
      : (AppConfig.listAll
        ? await AppConfig.listAll("-updated_date", 500, 1000)
        : await AppConfig.list("-updated_date", 500));
    const configs = Array.isArray(configResponse?.data) ? configResponse.data : (configResponse || []);
    const nextFlags = {
      balanceReadEnabled: getFinanceFeatureFlagValue(configs, FINANCE_FEATURE_FLAGS.walletBalanceReadEnabled, userProfile.empresa_id),
      movementsEnabled: getFinanceFeatureFlagValue(configs, FINANCE_FEATURE_FLAGS.walletMovementsEnabled, userProfile.empresa_id),
      manualAdjustmentsEnabled: getFinanceFeatureFlagValue(configs, FINANCE_FEATURE_FLAGS.walletManualAdjustmentsEnabled, userProfile.empresa_id),
      manualCreditEnabled: getFinanceFeatureFlagValue(configs, FINANCE_FEATURE_FLAGS.manualCreditEnabled, userProfile.empresa_id),
      paymentV2WriteEnabled: getFinanceFeatureFlagValue(configs, FINANCE_FEATURE_FLAGS.paymentV2WriteEnabled, userProfile.empresa_id),
      paymentV2ReversalEnabled: getFinanceFeatureFlagValue(configs, FINANCE_FEATURE_FLAGS.paymentV2ReversalEnabled, userProfile.empresa_id),
    };
    setWalletFlags(nextFlags);
    setWalletFlagsLoaded(true);
    return nextFlags;
  };

  const loadWalletAdminData = async (userProfile = currentUser, preferredWalletAccountId = selectedWalletAccountId) => {
    if (!userProfile?.empresa_id) {
      setWalletFlagsLoaded(true);
      setWalletAccounts([]);
      setWalletAuditRows([]);
      setWalletRecentMovements([]);
      setWalletOperationalContext({
        appointments: [],
        services: [],
        obligations: [],
        charges: [],
        accountsReceivable: [],
        dogs: [],
        budgets: [],
        recurringPackages: [],
        transactions: [],
        budgetPayments: [],
      });
      setSelectedWalletAccountId("");
      return;
    }

    setWalletLoading(true);
    setWalletFlagsLoaded(false);
    try {
      const nextFlags = await loadWalletFlags(userProfile);
      const walletReadEnabled = nextFlags.balanceReadEnabled || nextFlags.movementsEnabled;

      if (!walletReadEnabled) {
        setWalletAccounts([]);
        setWalletAuditRows([]);
        setWalletRecentMovements([]);
        setSelectedWalletAccountId("");
        return;
      }

      const [accounts, auditRows, carteiras, dogs, receivables] = await Promise.all([
        financeWalletAdminReadAccounts({ empresa_id: userProfile.empresa_id }),
        nextFlags.balanceReadEnabled
          ? financeWalletAdminAuditAccounts({ empresa_id: userProfile.empresa_id })
          : Promise.resolve([]),
        readEntityCollection(Carteira, { sort: "nome_razao_social", pageSize: 500, maxRows: 2000 }),
        readEntityCollection(Dog, { sort: "nome", pageSize: 500, maxRows: 2000 }),
        readEntityCollection(ContaReceber, { sort: "-updated_date", pageSize: 500, maxRows: 2000 }),
      ]);

      const normalizedAccounts = buildWalletAdminAccounts(
        Array.isArray(accounts) ? accounts : [],
        Array.isArray(carteiras) ? carteiras : [],
        Array.isArray(dogs) ? dogs : [],
        Array.isArray(receivables) ? receivables : [],
      );
      setWalletAccounts(normalizedAccounts);
      setWalletAuditRows(Array.isArray(auditRows) ? auditRows : []);

      const nextSelectedWallet = normalizedAccounts.find((item) => item.carteira_selection_id === preferredWalletAccountId)
        || (!walletOnly ? normalizedAccounts[0] : null);
      const nextSelectedWalletId = normalizedAccounts.some((item) => item.carteira_selection_id === preferredWalletAccountId)
        ? preferredWalletAccountId
        : (walletOnly ? "" : (nextSelectedWallet?.carteira_selection_id || ""));
      setSelectedWalletAccountId(nextSelectedWalletId);

      if (nextFlags.movementsEnabled && nextSelectedWallet?.carteira_conta_id) {
        const recentMovements = await financeWalletAdminReadMovements({
          empresa_id: userProfile.empresa_id,
          carteira_conta_id: nextSelectedWallet.carteira_conta_id,
          limit: 100,
        });
        setWalletRecentMovements(Array.isArray(recentMovements) ? recentMovements : []);
      } else {
        setWalletRecentMovements([]);
      }
    } catch (error) {
      console.warn("Não foi possível carregar a leitura administrativa da carteira:", error);
      setWalletAccounts([]);
      setWalletAuditRows([]);
      setWalletRecentMovements([]);
      setSelectedWalletAccountId("");
    } finally {
      setWalletLoading(false);
    }
  };

  const loadWalletMovements = async (walletAccountId, userProfile = currentUser, { requestId = null } = {}) => {
    const isCurrentRequest = () => requestId === null || walletDetailRequestRef.current === requestId;

    if (!walletFlags.movementsEnabled || !userProfile?.empresa_id || !walletAccountId) {
      if (isCurrentRequest()) {
        setWalletRecentMovements([]);
        setWalletLoading(false);
      }
      return;
    }

    if (isCurrentRequest()) setWalletLoading(true);
    try {
      const recentMovements = await financeWalletAdminReadMovements({
        empresa_id: userProfile.empresa_id,
        carteira_conta_id: walletAccountId,
        limit: 100,
      });
      if (isCurrentRequest()) {
        setWalletRecentMovements(Array.isArray(recentMovements) ? recentMovements : []);
      }
    } catch (error) {
      console.warn("Não foi possível carregar os movimentos administrativos da carteira:", error);
      if (isCurrentRequest()) setWalletRecentMovements([]);
    } finally {
      if (isCurrentRequest()) setWalletLoading(false);
    }
  };

  const loadWalletOperationalHistory = async (
    { walletAccountId, walletId } = {},
    userProfile = currentUser,
    { requestId = null } = {},
  ) => {
    const isCurrentRequest = () => requestId === null || walletDetailRequestRef.current === requestId;

    if (!userProfile?.empresa_id || (!walletAccountId && !walletId)) {
      if (isCurrentRequest()) {
        setWalletOperationalContext({
          appointments: [],
          services: [],
          obligations: [],
          charges: [],
          accountsReceivable: [],
          dogs: [],
          budgets: [],
          recurringPackages: [],
          transactions: [],
          budgetPayments: [],
        });
        setWalletOperationalHistory([]);
        setWalletHistoryLoading(false);
      }
      return;
    }

    if (isCurrentRequest()) setWalletHistoryLoading(true);
    try {
      const [executionRows, reversalRows, appointments, services, obligations, charges, accountsReceivable, dogs, budgets, recurringPackages, transactions, budgetPayments] = await Promise.all([
        financePaymentV2ExecutionAudit({ empresa_id: userProfile.empresa_id, limit: OPERATIONAL_HISTORY_LIMIT }),
        financePaymentV2ReversalAudit({ empresa_id: userProfile.empresa_id, limit: OPERATIONAL_HISTORY_LIMIT }),
        readEntityCollection(Appointment, { sort: "-updated_date", pageSize: 500, maxRows: 2000 }),
        readEntityCollection(ServiceProvided, { sort: "-updated_date", pageSize: 500, maxRows: 2000 }),
        readEntityCollection(ObrigacaoFinanceira, { sort: "-updated_date", pageSize: 500, maxRows: 2000 }),
        readEntityCollection(CobrancaFinanceira, { sort: "-updated_date", pageSize: 500, maxRows: 2000 }),
        readEntityCollection(ContaReceber, { sort: "-updated_date", pageSize: 500, maxRows: 2000 }),
        readEntityCollection(Dog, { sort: "-updated_date", pageSize: 500, maxRows: 2000 }),
        readEntityCollection(Orcamento, { sort: "-updated_date", pageSize: 500, maxRows: 2000 }),
        readEntityCollection(RecurringPackage, { sort: "-updated_date", pageSize: 500, maxRows: 2000 }),
        readEntityCollection(ExtratoBancario, { sort: "-updated_date", pageSize: 500, maxRows: 2000 }),
        readEntityCollection(OrcamentoPagamento, { sort: "-updated_date", pageSize: 500, maxRows: 2000 }),
      ]);

      const nextHistory = buildOperationalHistoryRows({
        walletAccountId,
        executionRows: Array.isArray(executionRows) ? executionRows : [],
        reversalRows: Array.isArray(reversalRows) ? reversalRows : [],
        appointments: Array.isArray(appointments) ? appointments : [],
        services: Array.isArray(services) ? services : [],
        obligations: Array.isArray(obligations) ? obligations : [],
        charges: Array.isArray(charges) ? charges : [],
        accountsReceivable: Array.isArray(accountsReceivable) ? accountsReceivable : [],
        dogs: Array.isArray(dogs) ? dogs : [],
      });

      if (isCurrentRequest()) {
        setWalletReceivables(Array.isArray(accountsReceivable) ? accountsReceivable : []);
        setWalletOperationalContext({
          appointments: Array.isArray(appointments) ? appointments : [],
          services: Array.isArray(services) ? services : [],
          obligations: Array.isArray(obligations) ? obligations : [],
          charges: Array.isArray(charges) ? charges : [],
          accountsReceivable: Array.isArray(accountsReceivable) ? accountsReceivable : [],
          dogs: Array.isArray(dogs) ? dogs : [],
          budgets: Array.isArray(budgets) ? budgets : [],
          recurringPackages: Array.isArray(recurringPackages) ? recurringPackages : [],
          transactions: Array.isArray(transactions) ? transactions : [],
          budgetPayments: Array.isArray(budgetPayments) ? budgetPayments : [],
        });
        setWalletOperationalHistory(nextHistory);
      }
    } catch (error) {
      console.warn("Não foi possível carregar a trilha operacional do Payment/Estorno V2:", error);
      if (isCurrentRequest()) {
        setWalletReceivables([]);
        setWalletOperationalContext({
          appointments: [],
          services: [],
          obligations: [],
          charges: [],
          accountsReceivable: [],
          dogs: [],
          budgets: [],
          recurringPackages: [],
          transactions: [],
          budgetPayments: [],
        });
        setWalletOperationalHistory([]);
      }
    } finally {
      if (isCurrentRequest()) setWalletHistoryLoading(false);
    }
  };

  const selectedWalletAccount = walletAccounts.find((item) => item.carteira_selection_id === selectedWalletAccountId) || null;
  const selectedWalletRuntimeAccountId = selectedWalletAccount?.carteira_conta_id || "";
  const walletOperationTargetAccount = walletAccounts.find(
    (item) => item.carteira_conta_id === walletOperationForm.carteira_conta_id,
  ) || selectedWalletAccount;
  const filteredWalletAccounts = useMemo(() => {
    const normalizedSearch = String(walletListSearchTerm || "").trim().toLowerCase();
    if (!normalizedSearch) return walletAccounts;

    return walletAccounts.filter((account) => {
      const searchable = [
        account?.carteira_nome,
        account?.carteira_codigo,
        account?.financial_status_label,
        ...(account?.linked_dog_labels || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedSearch);
    });
  }, [walletAccounts, walletListSearchTerm]);

  useEffect(() => {
    if (!currentUser?.empresa_id) return;
    loadWalletAdminData(currentUser);
  }, [currentUser?.empresa_id]);

  useEffect(() => {
    const walletId = selectedWalletAccount?.carteira_id || "";
    const companyId = currentUser?.empresa_id || "";

    if (!companyId || !walletId) {
      walletDetailRequestRef.current += 1;
      setWalletDetailLoading(false);
      setWalletLoading(false);
      setWalletHistoryLoading(false);
      setWalletRecentMovements([]);
      setWalletReceivables([]);
      setWalletOperationalContext({
        appointments: [],
        services: [],
        obligations: [],
        charges: [],
        accountsReceivable: [],
        dogs: [],
        budgets: [],
        recurringPackages: [],
        transactions: [],
        budgetPayments: [],
      });
      setWalletOperationalHistory([]);
      return undefined;
    }

    const requestId = walletDetailRequestRef.current + 1;
    walletDetailRequestRef.current = requestId;
    setWalletDetailLoading(true);

    Promise.all([
      loadWalletMovements(selectedWalletRuntimeAccountId, currentUser, { requestId }),
      loadWalletOperationalHistory({
        walletAccountId: selectedWalletRuntimeAccountId,
        walletId,
      }, currentUser, { requestId }),
    ]).finally(() => {
      if (walletDetailRequestRef.current === requestId) {
        setWalletDetailLoading(false);
      }
    });

    return () => {
      if (walletDetailRequestRef.current === requestId) {
        walletDetailRequestRef.current += 1;
      }
    };
  }, [
    currentUser?.empresa_id,
    selectedWalletRuntimeAccountId,
    selectedWalletAccount?.carteira_id,
    walletFlags.movementsEnabled,
  ]);

  const normalizedMovements = React.useMemo(
    () =>
      dedupeOfficialImportedMovements(movimentacoes || [])
        .map((item) => normalizeMovement(item))
        .sort((a, b) => (b.dataOrdenacao?.getTime() || 0) - (a.dataOrdenacao?.getTime() || 0)),
    [movimentacoes],
  );

  const filtered = useMemo(
    () =>
      normalizedMovements.filter((item) => {
        const movementDate = getMovementComparableDate(item);
        const searchBase = [
          item.id,
          item.transacao_id,
          item.codigoContraparte,
          item.contraparte,
          item.metodo,
          item.referenciaFinanceira,
          item.bancoContraparte,
          item.descricaoOriginal,
          item.vinculo_financeiro,
          item.data_movimento,
          item.data,
          formatMovementDateTime(item),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (searchTerm && !searchBase.includes(searchTerm.toLowerCase())) {
          return false;
        }

        if (tipoFiltro !== "all" && item.tipo !== tipoFiltro) {
          return false;
        }

        if (dataInicial && movementDate && movementDate < new Date(`${dataInicial}T00:00:00`)) {
          return false;
        }

        if (dataFinal && movementDate && movementDate > new Date(`${dataFinal}T23:59:59`)) {
          return false;
        }

        return true;
      }),
    [normalizedMovements, searchTerm, tipoFiltro, dataInicial, dataFinal],
  );

  useEffect(() => {
    setVisibleCount(MOVEMENTS_PAGE_SIZE);
  }, [searchTerm, tipoFiltro, dataInicial, dataFinal]);

  const visibleMovements = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  const hasMoreMovements = visibleMovements.length < filtered.length;
  const hasActiveFilters = Boolean(searchTerm || tipoFiltro !== "all" || dataInicial || dataFinal);

  const totalEntradas = filtered
    .filter((item) => item.tipo === "entrada")
    .reduce((sum, item) => sum + (item.valor || 0), 0);
  const totalSaidas = filtered
    .filter((item) => item.tipo === "saida")
    .reduce((sum, item) => sum + (item.valor || 0), 0);
  const derivedSummaryFromLoadedRows = useMemo(
    () => buildSummaryFromMovements(movimentacoes),
    [movimentacoes],
  );
  const effectiveSummary = hasLoadedFullDataset
    ? derivedSummaryFromLoadedRows
    : (summarySnapshot || derivedSummaryFromLoadedRows);
  const entradasCardValue = hasActiveFilters ? totalEntradas : effectiveSummary.total_entradas;
  const saidasCardValue = hasActiveFilters ? totalSaidas : effectiveSummary.total_saidas;
  const movementCountCardValue = hasActiveFilters ? filtered.length : effectiveSummary.movement_count;
  const movementPeriodLabel = formatPeriodLabelWithDays(effectiveSummary);

  const hasOfficialBalance = typeof currentBalance === "number";
  const saldoAtual = hasOfficialBalance ? currentBalance : null;
  const saldoAtualDisplay = hasOfficialBalance ? formatCurrency(currentBalance) : "—";
  const walletReadEnabled = walletFlags.balanceReadEnabled || walletFlags.movementsEnabled;
  const walletDetailContentLoading = Boolean(
    selectedWalletAccount && (walletDetailLoading || walletLoading || walletHistoryLoading),
  );
  const selectedWalletAudit = walletAuditRows.find((item) => item.carteira_conta_id === selectedWalletRuntimeAccountId) || null;
  const walletFinancialStatusMap = useMemo(
    () => buildFinancialOperationalStatusMap(walletReceivables),
    [walletReceivables],
  );
  const selectedWalletFinancialStatus = useMemo(
    () => getFinancialOperationalStatus(walletFinancialStatusMap, selectedWalletAccount?.carteira_id || null),
    [selectedWalletAccount?.carteira_id, walletFinancialStatusMap],
  );
  const canIssueWalletCharges = canWriteFinancialOperations(currentUser);
  const complementExistingLinkTargetId = editingItem?.tipo === "entrada"
    ? resolveLinkedWalletId(editingItem, walletAccounts)
    : resolveLinkedPayableId(editingItem, payables);
  const availableComplementPayables = useMemo(
    () => payables
      .filter((payable) => {
        if (payable?.id === complementExistingLinkTargetId) return true;
        const status = String(payable?.status || "").trim().toLowerCase();
        return !["cancelado", "cancelada", "quitado", "quitada", "pago", "realizado_hoje"].includes(status)
          && getPayableRemainingAmount(payable) > 0.005;
      })
      .sort((left, right) => {
        const leftDueDate = String(left?.vencimento || "9999-12-31");
        const rightDueDate = String(right?.vencimento || "9999-12-31");
        return leftDueDate.localeCompare(rightDueDate);
      }),
    [payables, complementExistingLinkTargetId],
  );
  const selectedComplementWallet = walletAccounts.find((wallet) => wallet?.carteira_id === formData.link_target_id) || null;
  const selectedComplementPayable = payables.find((payable) => payable?.id === formData.link_target_id) || null;
  const canLinkComplement = canWriteFinancialOperations(currentUser);
  const walletStatementRows = useMemo(
    () => buildWalletStatementRows({
      walletId: selectedWalletAccount?.carteira_id || null,
      walletAccountId: selectedWalletRuntimeAccountId,
      walletAvailableBalance: Number(selectedWalletAccount?.saldo_atual || 0),
      walletDefaultDueDay: selectedWalletAccount?.carteira_vencimento_padrao || null,
      movements: walletRecentMovements,
      transactions: walletOperationalContext.transactions,
      appointments: walletOperationalContext.appointments,
      services: walletOperationalContext.services,
      obligations: walletOperationalContext.obligations,
      charges: walletOperationalContext.charges,
      accountsReceivable: walletOperationalContext.accountsReceivable,
      dogs: walletOperationalContext.dogs,
      budgets: walletOperationalContext.budgets,
      recurringPackages: walletOperationalContext.recurringPackages,
      budgetPayments: walletOperationalContext.budgetPayments,
    }),
    [
      selectedWalletAccount?.carteira_id,
      selectedWalletAccount?.saldo_atual,
      selectedWalletAccount?.carteira_vencimento_padrao,
      selectedWalletRuntimeAccountId,
      walletRecentMovements,
      walletOperationalContext.transactions,
      walletOperationalContext.appointments,
      walletOperationalContext.services,
      walletOperationalContext.obligations,
      walletOperationalContext.charges,
      walletOperationalContext.accountsReceivable,
      walletOperationalContext.dogs,
      walletOperationalContext.budgets,
      walletOperationalContext.recurringPackages,
      walletOperationalContext.budgetPayments,
    ],
  );
  const walletStatementSummary = useMemo(() => {
    const rows = Array.isArray(walletStatementRows?.rows) ? walletStatementRows.rows : [];
    const latestDate = rows[0]?.primaryDate || null;
    const balance = Number.isFinite(Number(walletStatementRows?.netBalance))
      ? Number(walletStatementRows.netBalance)
      : Number(selectedWalletAccount?.saldo_atual || 0);

    return {
      latestDate,
      balance,
    };
  }, [selectedWalletAccount?.saldo_atual, walletStatementRows]);
  const walletTimelineRows = useMemo(() => {
    const reversalEvents = (walletOperationalHistory || []).filter((event) => event?.type === "reversal");
    const reversalByAppointmentId = new Map();
    const matchedReversalIds = new Set();

    reversalEvents.forEach((event) => {
      const appointmentId = String(event?.details?.appointmentId || "").trim();
      if (appointmentId) {
        reversalByAppointmentId.set(appointmentId, event);
      }
    });

    const rows = (walletStatementRows.rows || []).map((row) => {
      if (row.rowKind === "debit") {
        const appointmentKey = String(row?.appointmentId || "").trim();
        const reversalEvent = appointmentKey ? reversalByAppointmentId.get(appointmentKey) : null;
        if (reversalEvent?.id) {
          matchedReversalIds.add(reversalEvent.id);
        }

        return {
          id: `timeline-${row.id}`,
          filterGroup: "activity",
          sourceKind: reversalEvent ? "reversal" : "activity",
          primaryDate: row.primaryDate || row.dueDate || null,
          title: row.serviceLabel,
          subtitle: row.dogName,
          categoryLabel: row.referenceType === "pacote"
            ? `Plano de ${formatWalletServiceLabel(row.serviceLabel)}`
            : "Avulso",
          amount: reversalEvent ? 0 : row.amount,
          amountTone: reversalEvent ? "neutral" : "debit",
          paymentStatus: reversalEvent ? "paid" : row.paymentStatus,
          badges: reversalEvent
            ? [
                { label: "ESTORNADO", tone: "red" },
                { label: "PAGO", tone: "green" },
              ]
            : row.paymentStatus === "paid"
              ? [{ label: "PAGO", tone: "green" }]
              : [{ label: "Pendente", tone: "amber" }],
          appointmentId: row.appointmentId || null,
          referenceId: row.referenceId || null,
          referenceType: row.referenceType || null,
          referenceCode: row.referenceCode || null,
          referenceLabel: row.referenceLabel || null,
          transactionRow: null,
          details: {
            data: formatWalletStatementDate(row.primaryDate),
            vencimento: formatWalletStatementDate(row.dueDate),
            quitacaoData: reversalEvent?.eventDate
              ? new Date(reversalEvent.eventDate).toLocaleDateString("pt-BR")
              : (row.settlementDate ? formatWalletStatementDate(row.settlementDate) : "—"),
            status: reversalEvent ? "Pago" : row.paymentStatus === "paid" ? "Pago" : "Pendente",
            motivo: reversalEvent?.details?.motivo || null,
            anexo: reversalEvent?.details?.attachmentName || null,
          },
        };
      }

      return {
        id: `timeline-${row.id}`,
        filterGroup: "transaction",
        sourceKind: "transaction",
        primaryDate: row.primaryDate || null,
        title: resolveWalletTimelineCreditTitle(row),
        subtitle: row.counterparty,
        categoryLabel: row.paymentMethod,
        amount: row.amount,
        amountTone: "credit",
        paymentStatus: "paid",
        badges: [],
        appointmentId: null,
        referenceId: null,
        referenceType: null,
        referenceCode: null,
        referenceLabel: null,
        transactionRow: row,
        movementId: row.movementId || null,
        isManualMovement: Boolean(row.isManualMovement),
        details: {
          data: formatWalletStatementDate(row.primaryDate),
          formaPagamento: row.paymentMethod || "Forma não informada",
          contraparte: row.counterparty || "Contraparte não informada",
          referencia: row.transactionLookup || row.transactionId || "—",
        },
      };
    });

    reversalEvents
      .filter((event) => !matchedReversalIds.has(event.id))
      .forEach((event) => {
        rows.push({
          id: `timeline-orphan-${event.id}`,
          filterGroup: "activity",
          sourceKind: "reversal",
          primaryDate: event.eventDate || null,
          title: event.serviceLabel,
          subtitle: event.dogName,
          categoryLabel: "Estorno",
          amount: 0,
          amountTone: "neutral",
          paymentStatus: "paid",
          badges: [
            { label: "ESTORNADO", tone: "red" },
            { label: "PAGO", tone: "green" },
          ],
          appointmentId: event?.details?.appointmentId || null,
          referenceId: null,
          referenceType: null,
          referenceCode: null,
          referenceLabel: null,
          transactionRow: null,
          details: {
            data: event.eventDate ? new Date(event.eventDate).toLocaleDateString("pt-BR") : "—",
            quitacaoData: event.eventDate ? new Date(event.eventDate).toLocaleDateString("pt-BR") : "—",
            status: "Pago",
            motivo: event?.details?.motivo || null,
            anexo: event?.details?.attachmentName || null,
          },
        });
      });

    return rows.sort((left, right) => {
      const leftDate = left?.primaryDate ? new Date(left.primaryDate).getTime() : 0;
      const rightDate = right?.primaryDate ? new Date(right.primaryDate).getTime() : 0;
      return rightDate - leftDate;
    });
  }, [walletOperationalHistory, walletStatementRows]);
  const filteredWalletTimelineRows = useMemo(() => {
    if (walletTimelineFilter === "transactions") {
      return walletTimelineRows.filter((row) => row.filterGroup === "transaction");
    }
    if (walletTimelineFilter === "activities") {
      return walletTimelineRows.filter((row) => row.filterGroup === "activity");
    }
    return walletTimelineRows;
  }, [walletTimelineFilter, walletTimelineRows]);
  const walletReversalServiceOptions = useMemo(
    () => buildWalletReversalServiceOptions({
      walletAccountId: walletReversalForm.carteira_conta_id || selectedWalletRuntimeAccountId,
      appointments: walletOperationalContext.appointments,
      services: walletOperationalContext.services,
      obligations: walletOperationalContext.obligations,
      charges: walletOperationalContext.charges,
      accountsReceivable: walletOperationalContext.accountsReceivable,
      dogs: walletOperationalContext.dogs,
    }),
    [
      selectedWalletRuntimeAccountId,
      walletOperationalContext.accountsReceivable,
      walletOperationalContext.appointments,
      walletOperationalContext.charges,
      walletOperationalContext.dogs,
      walletOperationalContext.obligations,
      walletOperationalContext.services,
      walletReversalForm.carteira_conta_id,
    ],
  );
  const selectedWalletReversalServiceOption = useMemo(
    () => walletReversalServiceOptions.find((item) => item.obrigacao_id === walletReversalForm.obrigacao_id) || null,
    [walletReversalForm.obrigacao_id, walletReversalServiceOptions],
  );

  const openWalletStatementReference = (row) => {
    if (!row?.referenceId || !row?.referenceType) return;
    if (row.referenceType === "pacote") {
      navigate(`${createPageUrl("PlanosConfig")}?packageId=${encodeURIComponent(row.referenceId)}`);
      return;
    }
    navigate(`${createPageUrl("Orcamentos")}?orcamentoId=${encodeURIComponent(row.referenceId)}`);
  };

  const openWalletStatementAppointment = (appointmentId) => {
    if (!appointmentId) return;
    navigate(`${createPageUrl("Agendamentos")}?review=${encodeURIComponent(appointmentId)}`);
  };

  const openWalletStatementTransaction = (row) => {
    const targetRef = String(row?.transactionId || row?.transactionLookup || "").trim();
    if (!targetRef) return;
    navigate(`${createPageUrl("Movimentacoes")}?search=${encodeURIComponent(targetRef)}`);
  };

  const refreshStoredSummary = async (userProfile = currentUser) => {
    try {
      const data = await bancoInter({
        action: "refreshSummary",
        empresa_id: userProfile?.empresa_id || null,
      });

      const refreshedSummary = normalizeMovementSummary(data?.summary);
      if (refreshedSummary) {
        setSummarySnapshot(refreshedSummary);
        writeMovementsCache({
          empresa_id: userProfile?.empresa_id || null,
          movements: (movimentacoes || []).slice(0, 250),
          summary: refreshedSummary,
          cached_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.warn("Nao foi possivel atualizar o resumo persistido do extrato:", error);
    }
  };

  const openWalletOperationModal = (tipo, options = {}) => {
    const defaultNatureza = "entrada";
    setWalletActionMessage(null);
    setWalletOperationForm({
      carteira_conta_id: options.carteira_conta_id || selectedWalletRuntimeAccountId || "",
      tipo,
      natureza: options.natureza || defaultNatureza,
      valor: options.valor != null ? String(options.valor).replace(".", ",") : "",
      referencia_amigavel: options.referencia_amigavel || "",
      motivo: options.motivo || "",
      observacao: options.observacao || "",
      origem: options.origem || (tipo === "entrada_direcionada" ? "transacao_direcionada" : "admin_manual"),
      transacao_id: options.transacao_id || "",
    });
    setShowWalletOperationModal(true);
  };

  const openWalletChargeModal = () => {
    if (!selectedWalletAccount?.carteira_id || !selectedWalletRuntimeAccountId) {
      setWalletActionMessage({
        type: "error",
        message: "A conta operacional desta carteira ainda nao esta disponivel para emitir cobrancas.",
      });
      return;
    }

    setWalletActionMessage(null);
    setWalletOperationError("");
    setWalletChargeForm({
      ...EMPTY_WALLET_CHARGE_FORM,
      data_vencimento: getDefaultWalletChargeDueDate(),
    });
    setWalletChargeResult(null);
    setWalletChargeError("");
    setWalletChargeStep(1);
    setShowWalletChargeModal(true);
  };

  const loadWalletOpenCharges = async (sortBy = walletOpenChargesSort) => {
    if (!selectedWalletAccount?.carteira_id || !currentUser?.empresa_id) return;

    setWalletOpenChargesLoading(true);
    setWalletOpenChargesError("");
    try {
      const result = await bancoInter({
        action: "listWalletOpenCharges",
        empresa_id: currentUser.empresa_id,
        carteira_id: selectedWalletAccount.carteira_id,
        sort_by: sortBy,
      });
      setWalletOpenCharges(Array.isArray(result?.charges) ? result.charges : []);
    } catch (error) {
      setWalletOpenCharges([]);
      setWalletOpenChargesError(error?.message || "Nao foi possivel carregar as cobrancas em aberto.");
    } finally {
      setWalletOpenChargesLoading(false);
    }
  };

  const openWalletOpenChargesModal = async () => {
    setWalletOpenChargeGeneratedLinks({});
    setWalletOpenChargeFeedback({});
    setWalletOpenChargeRenewingId("");
    setWalletOpenChargeCancellingId("");
    setShowWalletOpenChargesModal(true);
    await loadWalletOpenCharges(walletOpenChargesSort);
  };

  const handleWalletChargeStepNext = () => {
    setWalletChargeError("");
    if (walletChargeStep === 1) {
      if (parseWalletChargeAmount(walletChargeForm.valor) < MIN_INTER_CHARGE_AMOUNT) {
        setWalletChargeError("Informe um valor igual ou superior a R$ 2,50 para continuar.");
        return;
      }
    }

    if (walletChargeStep === 2) {
      const dueDate = String(walletChargeForm.data_vencimento || "").slice(0, 10);
      if (!dueDate || dueDate < new Date().toISOString().slice(0, 10)) {
        setWalletChargeError("Escolha um vencimento válido, a partir de hoje.");
        return;
      }
    }

    setWalletChargeStep((current) => Math.min(current + 1, 4));
  };

  const handleWalletChargeIssue = async () => {
    setWalletChargeError("");
    const amount = parseWalletChargeAmount(walletChargeForm.valor);
    const dueDate = String(walletChargeForm.data_vencimento || "").slice(0, 10);
    const description = walletChargeForm.descricao.trim();
    if (!selectedWalletAccount?.carteira_id || !selectedWalletRuntimeAccountId || !currentUser?.empresa_id) {
      setWalletChargeError("A carteira selecionada ainda não está pronta para emitir cobranças.");
      return;
    }
    if (amount < MIN_INTER_CHARGE_AMOUNT) {
      setWalletChargeError("O Banco Inter exige cobrança mínima de R$ 2,50.");
      return;
    }
    if (!dueDate) {
      setWalletChargeError("Revise o vencimento antes de confirmar.");
      return;
    }
    if (!["boleto_bancario", "pix"].includes(walletChargeForm.metodo)) {
      setWalletChargeError("Selecione boleto bancário ou Pix para continuar.");
      return;
    }

    setWalletChargeSaving(true);
    try {
      const result = await bancoInter({
        action: "issueWalletCharge",
        empresa_id: currentUser.empresa_id,
        carteira_id: selectedWalletAccount.carteira_id,
        carteira_conta_id: selectedWalletRuntimeAccountId,
        responsavel_id: selectedWalletAccount.responsavel_id || null,
        valor: amount,
        data_vencimento: dueDate,
        descricao: description,
        metodo: walletChargeForm.metodo,
        usuario_id: currentUser?.id || null,
        public_base_url: typeof window !== "undefined" ? window.location.origin : "",
      });
      setWalletChargeResult({
        publicUrl: result?.public_url || "",
        charge: result?.charge || null,
      });
      setWalletChargeStep(5);
      setWalletActionMessage({
        type: "success",
        message: "Cobranca emitida. O link seguro esta pronto para compartilhar.",
      });
      await loadWalletOpenCharges(walletOpenChargesSort);
    } catch (error) {
      setWalletChargeError(error?.message || "Não foi possível emitir a cobrança.");
      setWalletActionMessage({
        type: "error",
        message: error?.message || "Nao foi possivel emitir a cobranca.",
      });
    } finally {
      setWalletChargeSaving(false);
    }
  };

  const handleCopyWalletChargeLink = async (url) => {
    const copied = await copyTextToClipboard(url);
    setWalletActionMessage({
      type: copied ? "success" : "error",
      message: copied ? "Link de cobranca copiado." : "Nao foi possivel copiar o link de cobranca.",
    });
    return copied;
  };

  const handleCopyWalletOpenChargeLink = async (chargeId) => {
    const url = walletOpenChargeGeneratedLinks[chargeId];
    if (!url) return;

    const copied = await copyTextToClipboard(url);
    setWalletOpenChargeFeedback((current) => ({
      ...current,
      [chargeId]: {
        type: copied ? "success" : "error",
        message: copied
          ? "Link copiado."
          : "Não foi possível copiar automaticamente. Pressione e segure o endereço para copiá-lo.",
      },
    }));
  };

  const handleRenewWalletChargeLink = async (chargeId) => {
    if (!chargeId || !currentUser?.empresa_id) return;

    setWalletOpenChargeRenewingId(chargeId);
    setWalletOpenChargeFeedback((current) => {
      const next = { ...current };
      delete next[chargeId];
      return next;
    });
    try {
      const result = await bancoInter({
        action: "renewWalletChargePublicLink",
        empresa_id: currentUser.empresa_id,
        carteira_cobranca_id: chargeId,
        public_base_url: typeof window !== "undefined" ? window.location.origin : "",
      });
      const publicUrl = String(result?.public_url || "").trim();
      if (!publicUrl) {
        throw new Error("O novo link não foi retornado pela emissão.");
      }

      setWalletOpenChargeGeneratedLinks((current) => ({ ...current, [chargeId]: publicUrl }));
      const copied = await copyTextToClipboard(publicUrl);
      setWalletOpenChargeFeedback((current) => ({
        ...current,
        [chargeId]: {
          type: copied ? "success" : "info",
          message: copied
            ? "Novo link gerado e copiado."
            : "Novo link gerado. Use o botão Copiar link abaixo.",
        },
      }));
      setWalletActionMessage({
        type: copied ? "success" : "warning",
        message: copied
          ? "Novo link seguro gerado e copiado. O link anterior foi invalidado."
          : "Novo link seguro gerado. Use o botao Copiar link na cobranca.",
      });
    } catch (error) {
      setWalletOpenChargeFeedback((current) => ({
        ...current,
        [chargeId]: {
          type: "error",
          message: error?.message || "Não foi possível gerar um novo link.",
        },
      }));
    } finally {
      setWalletOpenChargeRenewingId("");
    }
  };

  const handleCancelWalletCharge = async (charge) => {
    if (!charge?.id || !currentUser?.empresa_id) return;

    setWalletChargePendingCancellation(charge);
  };

  const confirmWalletChargeCancellation = async () => {
    const charge = walletChargePendingCancellation;
    if (!charge?.id || !currentUser?.empresa_id) return;

    const paymentLabel = charge.metodo === "pix" ? "a cobrança Pix" : "o boleto";
    setWalletChargePendingCancellation(null);
    setWalletOpenChargeCancellingId(charge.id);
    setWalletOpenChargeFeedback((current) => {
      const next = { ...current };
      delete next[charge.id];
      return next;
    });
    try {
      await bancoInter({
        action: "cancelWalletCharge",
        empresa_id: currentUser.empresa_id,
        carteira_cobranca_id: charge.id,
        motivo_cancelamento: "Cancelada pela operação Dog City",
      });
      setWalletActionMessage({
        type: "success",
        message: `${charge.metodo === "pix" ? "Cobrança Pix" : "Boleto"} cancelado com sucesso.`,
      });
      await loadWalletOpenCharges(walletOpenChargesSort);
    } catch (error) {
      setWalletOpenChargeFeedback((current) => ({
        ...current,
        [charge.id]: {
          type: "error",
          message: error?.message || `Não foi possível cancelar ${paymentLabel}.`,
        },
      }));
    } finally {
      setWalletOpenChargeCancellingId("");
    }
  };

  const openWalletReversalModal = (options = {}) => {
    setWalletActionMessage(null);
    setWalletReversalForm({
      ...EMPTY_WALLET_REVERSAL_FORM,
      carteira_conta_id: options.carteira_conta_id || selectedWalletRuntimeAccountId || "",
      reversao_tipo: options.reversao_tipo || "servico",
    });
    setShowWalletReversalModal(true);
  };

  const handleWalletReversalAttachmentUpload = async (file) => {
    if (!file) return;

    const extension = getFileExtension(file.name);
    if (!REVERSAL_ALLOWED_EXTENSIONS.has(extension)) {
      alert("Tipo de anexo inválido. Tipos aceitos: pdf, doc, txt, img, jpg e png.");
      return;
    }

    setWalletReversalUploading(true);
    try {
      const empresaId = currentUser?.empresa_id || "empresa-default";
      const walletAccountId = walletReversalForm.carteira_conta_id || selectedWalletRuntimeAccountId || "carteira";
      const safeName = `${Date.now()}_${sanitizeUploadFileName(file.name)}`;
      const path = `${empresaId}/financeiro/payment-v2-reversal/${walletAccountId}/${safeName}`;
      const { file_key } = await UploadPrivateFile({ file, path });
      setWalletReversalForm((prev) => ({
        ...prev,
        attachment_name: file.name,
        attachment_display_name: file.name,
        attachment_path: file_key,
        attachment_extension: extension,
      }));
    } catch (error) {
      alert(error?.message || "Não foi possível enviar o anexo do estorno.");
    } finally {
      setWalletReversalUploading(false);
    }
  };

  const handleOpenPrivateAttachment = async (path) => {
    if (!path) return;
    try {
      const signed = await CreateFileSignedUrl({ path, expires: 3600 });
      const url = signed?.signedUrl || signed?.url;
      if (!url) return;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      alert(error?.message || "Não foi possível abrir o anexo.");
    }
  };

  const handleWalletReversalTypeChange = (value) => {
    setWalletReversalForm((prev) => ({
      ...prev,
      reversao_tipo: value,
      valor: value === "saldo" ? prev.valor : "",
      appointment_id: value === "servico" ? prev.appointment_id : "",
      serviceprovided_id: value === "servico" ? prev.serviceprovided_id : "",
      obrigacao_id: value === "servico" ? prev.obrigacao_id : "",
      cobranca_financeira_id: value === "servico" ? prev.cobranca_financeira_id : "",
      conta_receber_id: value === "servico" ? prev.conta_receber_id : "",
    }));
  };

  const handleWalletReversalServiceSelect = (obrigacaoId) => {
    const option = walletReversalServiceOptions.find((item) => item.obrigacao_id === obrigacaoId) || null;
    setWalletReversalForm((prev) => ({
      ...prev,
      obrigacao_id: option?.obrigacao_id || "",
      appointment_id: option?.appointment_id || "",
      serviceprovided_id: option?.serviceprovided_id || "",
      cobranca_financeira_id: option?.cobranca_financeira_id || "",
      conta_receber_id: option?.conta_receber_id || "",
    }));
  };

  const handleWalletReconcile = async () => {
    if (!selectedWalletRuntimeAccountId || !currentUser?.empresa_id) return;
    setWalletLoading(true);
    setWalletActionMessage(null);
    try {
      const result = await financeWalletReconcileAccount({
        carteira_conta_id: selectedWalletRuntimeAccountId,
        usuario_id: currentUser?.id || null,
      });
      await loadWalletAdminData(currentUser, selectedWalletAccountId);
      setWalletActionMessage({
        type: result?.out_status === "ok" ? "success" : "warning",
        message: result?.out_status === "ok"
          ? "Reconciliação concluída sem divergência."
          : "Reconciliação registrada com divergência. Nenhuma correção automática foi aplicada.",
      });
    } catch (error) {
      setWalletActionMessage({
        type: "error",
        message: error?.message || "Não foi possível reconciliar a carteira selecionada.",
      });
    } finally {
      setWalletLoading(false);
    }
  };

  const handleWalletOperationSave = async () => {
    setWalletOperationError("");
    if (!walletOperationForm.carteira_conta_id) {
      setWalletOperationError("Selecione a carteira que receberá a alteração.");
      return;
    }

    if (parseCurrencyInput(walletOperationForm.valor) <= 0) {
      setWalletOperationError("Informe um valor maior que zero.");
      return;
    }

    if (!walletOperationForm.referencia_amigavel.trim() || !walletOperationForm.motivo.trim()) {
      setWalletOperationError("Preencha a identificação no extrato e o motivo da alteração.");
      return;
    }

    if (walletOperationForm.natureza !== "entrada") {
      setWalletOperationError("Alterações manuais da carteira devem usar natureza de entrada.");
      return;
    }

    setWalletSaving(true);
    setWalletActionMessage(null);
    try {
      await financeWalletAdminApplyOperation({
        carteira_conta_id: walletOperationForm.carteira_conta_id,
        operacao_idempotencia: buildWalletOperationIdempotency(walletOperationForm.tipo),
        tipo: walletOperationForm.tipo,
        natureza: walletOperationForm.natureza,
        valor: parseCurrencyInput(walletOperationForm.valor),
        referencia_amigavel: walletOperationForm.referencia_amigavel.trim(),
        motivo: walletOperationForm.motivo.trim(),
        observacao: walletOperationForm.observacao.trim() || null,
        origem: walletOperationForm.origem.trim() || "admin_manual",
        transacao_id: walletOperationForm.transacao_id.trim() || null,
        usuario_id: currentUser?.id || null,
        metadata: {
          initiated_from: "movimentacoes_admin_block",
          initiated_at: new Date().toISOString(),
        },
      });

      await loadWalletAdminData(currentUser, walletOperationForm.carteira_conta_id);
      setShowWalletOperationModal(false);
      setWalletOperationForm({ ...EMPTY_WALLET_OPERATION_FORM });
      setWalletActionMessage({
        type: "success",
        message: `${WALLET_OPERATION_LABELS[walletOperationForm.tipo] || "Operação"} registrada na carteira.`,
      });
    } catch (error) {
      setWalletOperationError(error?.message || "Não foi possível registrar a alteração na carteira.");
    } finally {
      setWalletSaving(false);
    }
  };

  const handleWalletReversalSave = async () => {
    if (!walletReversalForm.carteira_conta_id) {
      alert("Selecione o responsável financeiro do estorno.");
      return;
    }

    if (!walletReversalForm.motivo.trim()) {
      alert("Informe o motivo do estorno.");
      return;
    }

    if (!walletReversalForm.attachment_path || !walletReversalForm.attachment_name) {
      alert("Anexe um documento obrigatório para continuar.");
      return;
    }

    if (!walletReversalForm.confirmation_checked) {
      alert("Confirme a revisão final do estorno antes de continuar.");
      return;
    }

    if (walletReversalForm.reversao_tipo === "saldo" && !walletReversalForm.valor) {
      alert("Informe o valor do estorno de saldo.");
      return;
    }

    if (walletReversalForm.reversao_tipo === "servico" && !walletReversalForm.obrigacao_id) {
      alert("Selecione o serviço/agendamento que será estornado.");
      return;
    }

    setWalletReversalSaving(true);
    setWalletActionMessage(null);
    try {
      const result = await financePaymentV2Reverse({
        empresa_id: currentUser?.empresa_id || null,
        carteira_conta_id: walletReversalForm.carteira_conta_id,
        reversao_tipo: walletReversalForm.reversao_tipo,
        operacao_idempotencia: buildWalletReversalIdempotency(walletReversalForm.reversao_tipo),
        source_key: `movimentacoes_ui_${walletReversalForm.reversao_tipo}`,
        motivo: walletReversalForm.motivo.trim(),
        attachment_name: walletReversalForm.attachment_name,
        attachment_path: walletReversalForm.attachment_path,
        valor: walletReversalForm.reversao_tipo === "saldo" ? parseCurrencyInput(walletReversalForm.valor) : null,
        appointment_id: walletReversalForm.reversao_tipo === "servico" ? walletReversalForm.appointment_id || null : null,
        serviceprovided_id: walletReversalForm.reversao_tipo === "servico" ? walletReversalForm.serviceprovided_id || null : null,
        obrigacao_id: walletReversalForm.reversao_tipo === "servico" ? walletReversalForm.obrigacao_id || null : null,
        cobranca_financeira_id: walletReversalForm.reversao_tipo === "servico" ? walletReversalForm.cobranca_financeira_id || null : null,
        conta_receber_id: walletReversalForm.reversao_tipo === "servico" ? walletReversalForm.conta_receber_id || null : null,
        usuario_id: currentUser?.id || null,
        metadata: {
          initiated_from: "movimentacoes_operacional_reversal_flow",
          initiated_at: new Date().toISOString(),
          executed_by_label: currentUser?.full_name || currentUser?.name || currentUser?.email || "Sessão atual",
        },
      });

      await loadWalletAdminData(currentUser, walletReversalForm.carteira_conta_id);
      await loadWalletOperationalHistory(walletReversalForm.carteira_conta_id, currentUser);

      if (result?.classe_resultado === "executado" || result?.classe_resultado === "idempotente_reutilizado") {
        setShowWalletReversalModal(false);
        setWalletReversalForm({ ...EMPTY_WALLET_REVERSAL_FORM });
        setWalletActionMessage({
          type: "success",
          message: walletReversalForm.reversao_tipo === "saldo"
            ? "Estorno de saldo registrado no fluxo operacional do novo financeiro."
            : "Estorno de serviço registrado no fluxo operacional do novo financeiro.",
        });
      } else {
        setWalletActionMessage({
          type: "warning",
          message: result?.reason_message || "O estorno foi recusado pelo contrato operacional atual.",
        });
      }
    } catch (error) {
      setWalletActionMessage({
        type: "error",
        message: error?.message || "Não foi possível registrar o estorno operacional.",
      });
    } finally {
      setWalletReversalSaving(false);
    }
  };

  const loadPayablesForComplement = async () => {
    setComplementOptionsLoading(true);
    setComplementOptionsError("");
    try {
      const rows = await readEntityCollection(Lancamento, {
        sort: "-vencimento",
        pageSize: 500,
        maxRows: 2000,
      });
      const normalizedRows = Array.isArray(rows) ? rows : [];
      setPayables(normalizedRows);
      return normalizedRows;
    } catch (error) {
      console.warn("Não foi possível carregar as contas a pagar para vinculação:", error);
      setPayables([]);
      setComplementOptionsError(error?.message || "Não foi possível carregar as contas a pagar desta unidade.");
      return [];
    } finally {
      setComplementOptionsLoading(false);
    }
  };

  const handleDeleteWalletManualMovement = async (row) => {
    if (!row?.movementId || !row?.isManualMovement || !selectedWalletRuntimeAccountId) return;

    const sourceMovement = walletRecentMovements.find((movement) => movement?.movimento_id === row.movementId);
    if (!sourceMovement) {
      setWalletActionMessage({ type: "error", message: "O lançamento manual não foi encontrado para exclusão." });
      return;
    }

    if (!window.confirm(`Excluir o lançamento manual “${row.title}” de ${formatCurrency(row.amount)}? O saldo será compensado e a auditoria será preservada.`)) {
      return;
    }

    setWalletManualDeletingId(row.movementId);
    setWalletActionMessage(null);
    try {
      await financeWalletAdminApplyOperation({
        carteira_conta_id: selectedWalletRuntimeAccountId,
        operacao_idempotencia: `wallet-manual-delete:${row.movementId}`,
        tipo: "ajuste_manual",
        natureza: String(sourceMovement.natureza || "").toLowerCase() === "saida" ? "entrada" : "saida",
        valor: Math.abs(Number(sourceMovement.valor || row.amount || 0)),
        referencia_amigavel: `Exclusão de ${row.title}`.slice(0, 180),
        motivo: `Exclusão operacional do lançamento manual ${row.movementId}.`,
        observacao: "Movimento compensatório automático. O lançamento original permanece na trilha de auditoria.",
        origem: `admin_manual_exclusao:${String(row.movementId).toLowerCase()}`,
        transacao_id: null,
        usuario_id: currentUser?.id || null,
        metadata: {
          initiated_from: "wallet_manual_movement_delete",
          excluded_manual_movement_id: row.movementId,
          initiated_at: new Date().toISOString(),
        },
      });

      await loadWalletAdminData(currentUser, selectedWalletAccountId);
      setWalletActionMessage({
        type: "success",
        message: "Lançamento manual excluído e saldo compensado com auditoria preservada.",
      });
    } catch (error) {
      setWalletActionMessage({
        type: "error",
        message: error?.message || "Não foi possível excluir o lançamento manual.",
      });
    } finally {
      setWalletManualDeletingId("");
    }
  };

  const openModal = async (item = null) => {
    if (item) {
      const normalized = normalizeMovement(item);
      setEditingItem(normalized);
      const initialLinkTargetId = normalized.tipo === "entrada"
        ? resolveLinkedWalletId(normalized, walletAccounts)
        : String(normalized?.metadata_financeira?.lancamento_id || "").trim();
      setFormData({
        data_hora_transacao: toDateInputValue(normalized.dataHora || normalized.data_movimento || normalized.data),
        tipo: normalized.tipo || "entrada",
        nome_contraparte: normalized.contraparte || "",
        valor: normalized.valor?.toString() || "",
        banco_contraparte: normalized.bancoContraparte === "-" ? "" : normalized.bancoContraparte || "",
        tipo_transacao_detalhado: normalized.tipoDetalhado === "-" ? "" : normalized.tipoDetalhado || "",
        referencia: normalized.referenciaFinanceira === "-" ? "" : normalized.referenciaFinanceira || "",
        observacoes: normalized.observacoesFinanceiras || "",
        link_target_id: initialLinkTargetId,
      });
      setShowModal(true);

      if (normalized.apiLocked && normalized.tipo === "saida") {
        const nextPayables = await loadPayablesForComplement();
        const linkedPayableId = resolveLinkedPayableId(normalized, nextPayables);
        if (linkedPayableId) {
          setFormData((previous) => ({ ...previous, link_target_id: linkedPayableId }));
        }
      } else {
        setComplementOptionsError("");
      }
    } else {
      setEditingItem(null);
      setFormData({ ...EMPTY_FORM });
      setComplementOptionsError("");
      setShowModal(true);
    }
  };

  const handleSave = async () => {
    const isApiLocked = editingItem?.apiLocked;

    if (!isApiLocked && (!formData.data_hora_transacao || !formData.valor || !formData.nome_contraparte)) {
      alert("Preencha data, valor e remetente/recebedor.");
      return;
    }

    setIsSaving(true);
    try {
      if (editingItem) {
        if (isApiLocked) {
          const selectedTargetId = String(formData.link_target_id || "").trim();
          const existingTargetId = editingItem.tipo === "entrada"
            ? resolveLinkedWalletId(editingItem, walletAccounts)
            : resolveLinkedPayableId(editingItem, payables);

          if (existingTargetId && selectedTargetId && selectedTargetId !== existingTargetId) {
            throw new Error("Esta transação já possui vínculo financeiro e não pode ser redirecionada.");
          }

          if (selectedTargetId && !existingTargetId) {
            if (!canWriteFinancialOperations(currentUser)) {
              throw new Error("Seu perfil não possui permissão para vincular transações financeiras.");
            }

            if (editingItem.tipo === "entrada") {
              await financeLinkBankEntryToWallet({
                empresa_id: currentUser?.empresa_id || null,
                transacao_id: editingItem.id,
                carteira_id: selectedTargetId,
                usuario_id: currentUser?.id || null,
                observacao: formData.observacoes.trim() || null,
              });
              await loadWalletAdminData(currentUser, selectedWalletAccountId);
            } else {
              await financeLinkBankOutputToPayable({
                empresa_id: currentUser?.empresa_id || null,
                transacao_id: editingItem.id,
                lancamento_id: selectedTargetId,
                usuario_id: currentUser?.id || null,
                observacao: formData.observacoes.trim() || null,
              });
              await loadPayablesForComplement();
            }
          } else {
            await ExtratoBancario.update(editingItem.id, {
              observacoes: formData.observacoes.trim() || null,
            });
          }
        } else {
          const dateOnly = fromDateInputValue(formData.data_hora_transacao);
          await ExtratoBancario.update(editingItem.id, {
            descricao: formData.nome_contraparte.trim(),
            tipo: formData.tipo,
            valor: parseFloat(String(formData.valor).replace(",", ".")) || 0,
            data: dateOnly,
            data_movimento: dateOnly,
            data_hora_transacao: null,
            nome_contraparte: formData.nome_contraparte.trim(),
            banco_contraparte: formData.banco_contraparte.trim() || null,
            banco: formData.banco_contraparte.trim() || null,
            tipo_transacao_detalhado: formData.tipo_transacao_detalhado.trim() || null,
            referencia: formData.referencia.trim() || null,
            observacoes: formData.observacoes.trim() || null,
            forma_pagamento: formData.tipo_transacao_detalhado.trim() || null,
            source_provider: editingItem?.source_provider || "manual",
            metadata_financeira: {
              ...(editingItem?.metadata_financeira || {}),
              api_locked: false,
            },
          });
        }
      } else {
        const dateOnly = fromDateInputValue(formData.data_hora_transacao);
        const manualTransactionId = `manual_${crypto.randomUUID()}`;
        await ExtratoBancario.create({
          id: manualTransactionId,
          descricao: formData.nome_contraparte.trim(),
          tipo: formData.tipo,
          valor: parseFloat(String(formData.valor).replace(",", ".")) || 0,
          data: dateOnly,
          data_movimento: dateOnly,
          data_hora_transacao: null,
          nome_contraparte: formData.nome_contraparte.trim(),
          banco_contraparte: formData.banco_contraparte.trim() || null,
          banco: formData.banco_contraparte.trim() || null,
          tipo_transacao_detalhado: formData.tipo_transacao_detalhado.trim() || null,
          referencia: formData.referencia.trim() || null,
          observacoes: formData.observacoes.trim() || null,
          forma_pagamento: formData.tipo_transacao_detalhado.trim() || null,
          source_provider: "manual",
          metadata_financeira: {
            api_locked: false,
            transaction_id_source: "manual_uuid",
          },
        });
      }

      await loadData(currentUser, { preserveVisibleData: true });
      await refreshStoredSummary(currentUser);
      setShowModal(false);
    } catch (error) {
      alert(error?.message || "Erro ao salvar movimentação.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (movement) => {
    if (movement?.apiLocked) return;
    if (!confirm("Excluir esta movimentação manual?")) return;

    try {
      await ExtratoBancario.delete(movement.id);
      await loadData(currentUser, { preserveVisibleData: true });
      await refreshStoredSummary(currentUser);
    } catch (error) {
      alert(error?.message || "Erro ao excluir movimentação.");
    }
  };

  const refreshMovements = async () => {
    setIsRefreshing(true);
    setIsSummaryLoading(true);
    setRefreshResult(null);

    try {
      const data = await bancoInter({
        action: "syncNow",
        empresa_id: currentUser?.empresa_id || null,
      });

      await loadData(currentUser, { preserveVisibleData: true });
      if (typeof data?.saldo_atual === "number") {
        setCurrentBalance(data.saldo_atual);
        setCurrentBalanceAt(data?.saldo_atualizado_em || new Date().toISOString());
      } else {
        setCurrentBalance(null);
        setCurrentBalanceAt(null);
      }
      if (data?.summary) {
        const refreshedSummary = normalizeMovementSummary(data.summary);
        if (refreshedSummary) {
          setSummarySnapshot(refreshedSummary);
        }
      }

      setRefreshResult({
        success: true,
        message: data?.message || "Extrato atualizado com sucesso.",
        imported: data?.historical_inserted_count ?? data?.historicalInsertedCount ?? data?.inseridas ?? data?.imported_count ?? 0,
        refreshedToday: data?.refreshed_today_count ?? 0,
        balance: typeof data?.saldo_atual === "number" ? data.saldo_atual : null,
        balanceWarning: data?.balance_warning || null,
      });
    } catch (error) {
      setRefreshResult({
        success: false,
        message: error?.message || "Falha ao atualizar o extrato.",
      });
      setIsSummaryLoading(false);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleViewReceipt = async (movement) => {
    if (!movement?.apiLocked) {
      alert("Somente transações importadas pela API do banco podem ter comprovante oficial.");
      return;
    }

    try {
      setReceiptLoadingId(movement.id);
      const data = await bancoInter({
        action: "transactionReceipt",
        empresa_id: currentUser?.empresa_id || null,
        movement_id: movement.id,
      });

      if (!data?.success) {
        throw new Error(data?.message || "Não foi possível localizar um comprovante para esta transação.");
      }

      if (data?.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
        return;
      }

      if (data?.details) {
        setTransactionReceipt(data);
        return;
      }

      if (!data?.base64) {
        throw new Error("A API do banco não retornou detalhes ou PDF para este comprovante.");
      }

      const binary = window.atob(data.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      const blob = new Blob([bytes], { type: data?.mime_type || "application/pdf" });
      const objectUrl = window.URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      alert(error?.message || "Não foi possível abrir o comprovante desta transação.");
    } finally {
      setReceiptLoadingId(null);
    }
  };

  const handleDownloadTransactionReceipt = async () => {
    const details = transactionReceipt?.details;
    if (!details) return;

    try {
      setIsReceiptDownloading(true);
      const { downloadTransactionReceiptPdf } = await import("@/lib/transaction-receipt-pdf");
      downloadTransactionReceiptPdf(transactionReceipt);
    } catch (error) {
      console.error("Falha ao gerar comprovante em PDF", error);
      alert("Não foi possível gerar o PDF do comprovante.");
    } finally {
      setIsReceiptDownloading(false);
    }
  };

  if (isInitialLoading && !cacheHydrated) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-2.5 sm:p-6">
      <div className={`mx-auto ${walletOnly ? "max-w-[1480px]" : "max-w-6xl"}`}>
        {!(walletOnly && selectedWalletAccount) ? (
          <div className={`mb-4 flex flex-col gap-3 sm:mb-6 sm:gap-4 lg:flex-row lg:items-start lg:justify-between ${walletOnly ? "border-b border-slate-200 pb-5 sm:pb-6" : ""}`}>
            <div className="min-w-0">
              {walletOnly ? (
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-600 sm:text-xs">
                  Financeiro / Carteiras
                </p>
              ) : null}
              <h1 className={`${walletOnly ? "font-brand text-2xl tracking-tight sm:text-4xl" : "text-xl sm:text-3xl"} font-bold leading-tight text-gray-900`}>
                {walletOnly ? "Carteiras dos responsáveis financeiros" : "Transações"}
              </h1>
              {walletOnly ? (
                <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-500 sm:text-[15px]">
                  Consulte a carteira e o extrato de cada responsável financeiro em uma página dedicada do Financeiro, separada do extrato operacional da empresa.
                </p>
              ) : null}
            </div>

            {walletOnly ? (
              <div className="flex shrink-0 items-center gap-2 self-start rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm lg:mt-1">
                <Wallet className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-semibold text-slate-900">{walletAccounts.length}</span>
                <span className="text-xs text-slate-500">carteira{walletAccounts.length === 1 ? "" : "s"}</span>
              </div>
            ) : (
              <div className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-auto sm:flex-wrap sm:gap-2">
                <Button variant="outline" onClick={refreshMovements} disabled={isRefreshing} className="h-8 min-w-0 rounded-full px-2 text-[10px] sm:h-10 sm:px-4 sm:text-sm">
                  <RefreshCw className={`mr-1 h-3 w-3 shrink-0 ${isRefreshing ? "animate-spin" : ""} sm:mr-2 sm:h-4 sm:w-4`} />
                  {isRefreshing ? "Atualizando..." : "Atualizar extrato"}
                </Button>
                <Button onClick={() => openModal()} className="h-8 min-w-0 rounded-full bg-blue-600 px-2 text-[10px] text-white hover:bg-blue-700 sm:h-10 sm:px-4 sm:text-sm">
                  <Plus className="mr-1 h-3 w-3 shrink-0 sm:mr-2 sm:h-4 sm:w-4" />
                  Nova movimentação manual
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {!walletOnly && refreshResult && (
          <Card className={`mb-4 sm:mb-6 ${refreshResult.success ? "border-blue-200 bg-blue-50" : "border-red-200 bg-red-50"}`}>
            <CardContent className="p-3 sm:p-4">
              <p className={`text-xs font-semibold sm:text-base ${refreshResult.success ? "text-blue-900" : "text-red-900"}`}>
                {refreshResult.message}
              </p>
              {refreshResult.success && (
                <div className="mt-1 space-y-0.5 text-[10px] leading-tight text-blue-800 sm:space-y-1 sm:text-sm sm:leading-normal">
                  <p>Histórico novo inserido: {refreshResult.imported}</p>
                  <p>Movimentações de hoje recarregadas: {refreshResult.refreshedToday}</p>
                  {typeof refreshResult.balance === "number" && (
                    <p>Saldo oficial retornado pela API: {formatCurrency(refreshResult.balance)}</p>
                  )}
                  {refreshResult.balanceWarning && (
                    <p className="text-amber-700">{refreshResult.balanceWarning}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!walletOnly ? (
          <div className="mb-4 grid grid-cols-2 gap-2 sm:mb-6 sm:gap-4 md:grid-cols-4">
          <StatCard
            label="Entradas"
            value={formatCurrency(entradasCardValue)}
            className="border-green-200"
            valueClassName="text-green-600"
            helper={hasActiveFilters ? "Filtro atual" : "Resumo salvo do extrato"}
            isBlurred={isSummaryLoading}
          />
          <StatCard
            label="Saídas"
            value={formatCurrency(saidasCardValue)}
            className="border-red-200"
            valueClassName="text-red-600"
            helper={hasActiveFilters ? "Filtro atual" : "Resumo salvo do extrato"}
            isBlurred={isSummaryLoading}
          />
          <StatCard
            label="Saldo atual"
            value={saldoAtualDisplay}
            className={hasOfficialBalance ? (saldoAtual >= 0 ? "border-blue-200" : "border-red-200") : "border-slate-200"}
            valueClassName={hasOfficialBalance ? (saldoAtual >= 0 ? "text-blue-700" : "text-red-600") : "text-slate-500"}
            icon={<Wallet className={`h-3.5 w-3.5 sm:h-5 sm:w-5 ${hasOfficialBalance ? (saldoAtual >= 0 ? "text-blue-500" : "text-red-500") : "text-slate-400"}`} />}
            helper={
              currentBalanceAt
                ? `API Banco Inter atualizada em ${new Date(currentBalanceAt).toLocaleString("pt-BR")}`
                : (isBalanceLoading ? "Consultando saldo ao vivo na API" : "Saldo disponível apenas quando a API responder")
            }
            isBlurred={isBalanceLoading}
          />
          <StatCard
            label="Movimentações"
            value={String(movementCountCardValue)}
            className="border-gray-200"
            valueClassName="text-gray-900"
            helper={movementPeriodLabel ? `Período: ${movementPeriodLabel}` : "Quantidade exibida"}
            isBlurred={isSummaryLoading}
          />
          </div>
        ) : null}

        {walletOnly && walletReadEnabled && (
          <div className="mb-6 space-y-4">
            {walletActionMessage && (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  walletActionMessage.type === "success"
                    ? "border-green-200 bg-green-50 text-green-800"
                    : walletActionMessage.type === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-red-200 bg-red-50 text-red-800"
                }`}
              >
                {walletActionMessage.message}
              </div>
            )}

            {!selectedWalletAccount ? (
              <div className="overflow-hidden rounded-[24px] border border-slate-300/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.07)] sm:rounded-[28px]">
                <div className="border-b border-slate-200 bg-slate-50/70 p-3 sm:p-4">
                  <SearchFiltersToolbar
                    searchTerm={walletListSearchTerm}
                    onSearchChange={setWalletListSearchTerm}
                    searchPlaceholder="Buscar por responsável, cão ou situação..."
                    hasActiveFilters={Boolean(walletListSearchTerm)}
                    onClear={() => setWalletListSearchTerm("")}
                    searchInputClassName="border-slate-300 bg-white shadow-none focus-visible:ring-blue-500"
                  />
                </div>

                  {filteredWalletAccounts.length === 0 ? (
                    <div className="px-4 py-14 text-center sm:py-20">
                      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
                        <Wallet className="h-5 w-5 text-slate-400" />
                      </div>
                      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-500">
                        {walletAccounts.length === 0
                          ? "Nenhum responsável financeiro foi encontrado para esta unidade."
                          : "Nenhuma carteira corresponde ao filtro informado."}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="hidden border-b border-slate-200 bg-slate-100/70 px-5 py-3.5 lg:grid lg:grid-cols-[minmax(220px,1.15fr)_140px_165px_minmax(240px,1.4fr)_42px] lg:gap-5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Nome do responsável</p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Vencimento padrão</p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Situação da carteira</p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Cães vinculados à carteira</p>
                        <span aria-hidden="true" />
                      </div>

                      <div className="hidden divide-y divide-slate-100 lg:block">
                        {filteredWalletAccounts.map((account) => (
                          <button
                            key={account.carteira_selection_id}
                            type="button"
                            onClick={() => {
                              setWalletDetailLoading(true);
                              setSelectedWalletAccountId(account.carteira_selection_id);
                            }}
                            className="group relative grid w-full grid-cols-[minmax(220px,1.15fr)_140px_165px_minmax(240px,1.4fr)_42px] items-center gap-5 px-5 py-4 text-left transition before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:origin-center before:scale-y-0 before:bg-blue-500 before:transition-transform before:duration-150 hover:bg-blue-50/45 hover:before:scale-y-100 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 focus-visible:before:scale-y-100"
                            aria-label={`Abrir carteira de ${account.carteira_nome}`}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600 transition group-hover:border-blue-200 group-hover:bg-blue-100">
                                <Wallet className="h-4 w-4" />
                              </span>
                              <p className="truncate text-[15px] font-semibold tracking-tight text-slate-950">{account.carteira_nome}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-700">
                                {account.carteira_vencimento_padrao ? `Dia ${account.carteira_vencimento_padrao}` : "Não informado"}
                              </p>
                            </div>
                            <div className="min-w-0">
                              <Badge
                                variant="outline"
                                className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${account.financial_status_tone === "irregular"
                                  ? "border-red-200 bg-red-50 text-red-700"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                              >
                                {account.financial_status_tone === "irregular" ? "Irregular" : "Regular"}
                              </Badge>
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm text-slate-700" title={account.linked_dog_labels?.join(", ") || "Nenhum cão vinculado"}>
                                {account.linked_dog_labels?.length
                                  ? account.linked_dog_labels.join(", ")
                                  : "Nenhum cão vinculado"}
                              </p>
                            </div>
                            <div className="flex h-9 w-9 items-center justify-center justify-self-end rounded-full text-slate-400 transition group-hover:bg-white group-hover:text-blue-600 group-hover:shadow-sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </div>
                          </button>
                        ))}
                      </div>

                      <div className="grid gap-2 p-2.5 sm:grid-cols-2 sm:p-3 lg:hidden">
                        {filteredWalletAccounts.map((account) => (
                          <button
                            key={account.carteira_selection_id}
                            type="button"
                            onClick={() => {
                              setWalletDetailLoading(true);
                              setSelectedWalletAccountId(account.carteira_selection_id);
                            }}
                            className="group min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-[0_3px_12px_rgba(15,23,42,0.04)] transition hover:border-blue-200 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            aria-label={`Abrir carteira de ${account.carteira_nome}`}
                          >
                            <div className="flex min-w-0 items-start gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
                                <Wallet className="h-4 w-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-start justify-between gap-2">
                                  <p className="truncate text-[15px] font-semibold tracking-tight text-slate-950">{account.carteira_nome}</p>
                                  <Badge
                                    variant="outline"
                                    className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0 text-[10px] font-semibold ${account.financial_status_tone === "irregular"
                                      ? "border-red-200 bg-red-50 text-red-700"
                                      : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                                  >
                                    {account.financial_status_tone === "irregular" ? "Irregular" : "Regular"}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-xs font-medium text-slate-500">
                                  {account.carteira_vencimento_padrao ? `Vencimento padrão: dia ${account.carteira_vencimento_padrao}` : "Vencimento padrão não informado"}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                              <p className="min-w-0 truncate text-xs text-slate-600">
                                {account.linked_dog_labels?.length
                                  ? account.linked_dog_labels.join(", ")
                                  : "Nenhum cão vinculado"}
                              </p>
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 group-hover:bg-white group-hover:text-blue-600">
                                <MoreHorizontal className="h-4 w-4" />
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
              </div>
            ) : (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setWalletDetailLoading(false);
                          setSelectedWalletAccountId("");
                        }}
                        className="h-9 shrink-0 rounded-full border-slate-300 px-3 text-xs shadow-sm"
                      >
                        <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Voltar para a lista</span>
                        <span className="sm:hidden">Voltar</span>
                      </Button>
                      <div className="min-w-0">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-blue-600 sm:text-[10px]">Carteira do responsável financeiro</p>
                        <h1 className="mt-0.5 truncate font-brand text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
                          {selectedWalletAccount.carteira_nome}
                        </h1>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button
                        variant="outline"
                        onClick={() => loadWalletAdminData(currentUser, selectedWalletAccountId)}
                        disabled={walletLoading}
                        className="h-9 w-9 rounded-full border-slate-300 bg-white p-0 shadow-sm"
                        title="Atualizar"
                        aria-label="Atualizar"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${walletLoading ? "animate-spin" : ""}`} />
                      </Button>
                      {canIssueWalletCharges ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={openWalletOpenChargesModal}
                          disabled={!selectedWalletAccount?.carteira_id}
                          className="h-9 rounded-full border-slate-300 bg-white px-3 text-xs font-semibold shadow-sm"
                        >
                          Cobranças em aberto
                        </Button>
                      ) : null}
                      {canIssueWalletCharges ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={openWalletChargeModal}
                          disabled={!selectedWalletRuntimeAccountId}
                          className="h-9 w-9 rounded-full border-slate-300 bg-white p-0 shadow-sm"
                          title="Gerar cobrança"
                          aria-label="Gerar cobrança"
                        >
                          <CircleDollarSign className="h-4 w-4 text-emerald-700" />
                        </Button>
                      ) : null}
                      {walletFlags.manualAdjustmentsEnabled && canManageWalletOperations ? (
                        <Button
                          variant="outline"
                          onClick={() => openWalletOperationModal("credito_manual")}
                          disabled={!selectedWalletRuntimeAccountId}
                          className="h-9 rounded-full border-slate-300 bg-white px-3 text-xs font-semibold shadow-sm"
                        >
                          Alteração manual
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-4">
                      <section
                        className="overflow-hidden rounded-[20px] border border-slate-300/80 bg-slate-200 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:rounded-[22px]"
                        aria-busy={walletDetailContentLoading}
                      >
                        <div className="grid grid-cols-2 gap-px lg:grid-cols-[1.25fr_0.8fr_1fr]">
                          <div className="bg-gradient-to-br from-blue-50 to-white px-3 py-3.5 sm:px-4">
                            <div className="flex items-center gap-1.5 text-blue-700">
                              <Wallet className="h-3.5 w-3.5" />
                              <p className="text-[9px] font-bold uppercase tracking-[0.14em]">Saldo da carteira</p>
                            </div>
                            {walletDetailContentLoading ? (
                              <Skeleton className="mt-2 h-7 w-28 rounded-lg bg-blue-100 sm:h-8 sm:w-32" />
                            ) : (
                              <p className={`mt-1.5 text-xl font-bold tracking-tight sm:text-2xl ${
                                walletStatementSummary.balance < 0 ? "text-red-600" : "text-slate-950"
                              }`}>
                                {formatCurrency(walletStatementSummary.balance)}
                              </p>
                            )}
                          </div>

                          <div className="bg-white px-3 py-3.5 sm:px-4">
                            <div className="flex items-center gap-2">
                              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Situação</p>
                              {walletDetailContentLoading ? (
                                <Skeleton className="h-5 w-20 rounded-full" />
                              ) : (
                                <Badge
                                  variant="outline"
                                  className={`whitespace-nowrap rounded-full px-2 py-0 text-[10px] font-bold ${
                                    selectedWalletFinancialStatus?.tone === "irregular"
                                      ? "border-red-200 bg-red-50 text-red-700"
                                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  }`}
                                >
                                  {selectedWalletFinancialStatus?.tone === "irregular" ? "IRREGULAR" : "REGULAR"}
                                </Badge>
                              )}
                            </div>
                            {walletDetailContentLoading ? (
                              <Skeleton className="mt-2 h-3 w-32 rounded-full" />
                            ) : (
                              <p className="mt-1 text-[11px] text-slate-500">
                                {walletStatementSummary.latestDate
                                  ? `Último lançamento: ${formatWalletStatementDate(walletStatementSummary.latestDate)}`
                                  : "Aguardando primeiro lançamento"}
                              </p>
                            )}
                          </div>

                          <div className="col-span-2 min-w-0 bg-white px-3 py-3.5 sm:px-4 lg:col-span-1">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Vencimento padrão</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">
                              {selectedWalletAccount.carteira_vencimento_padrao
                                ? `Dia ${selectedWalletAccount.carteira_vencimento_padrao}`
                                : "Não informado"}
                            </p>
                          </div>
                        </div>

                        {!walletDetailContentLoading && selectedWalletFinancialStatus?.tone === "irregular" ? (
                          <div className="border-t border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800 sm:px-4">
                            Regularize os débitos em aberto.
                          </div>
                        ) : null}
                      </section>

                      {!selectedWalletAccount.has_wallet_account ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
                          Conta operacional ainda não vinculada. O extrato V2 e as ações serão disponibilizados automaticamente assim que a conta estiver ativa.
                        </div>
                      ) : null}

                      {walletFlags.movementsEnabled ? (
                        <div className="space-y-3">
                          <div className="overflow-hidden rounded-[20px] border border-slate-300/80 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                              <div className="min-w-0">
                                <h3 className="text-sm font-semibold text-slate-900 sm:text-base">Extrato do responsável financeiro</h3>
                                <p className="mt-0.5 text-[11px] text-slate-500 sm:text-xs">
                                  Transações, atividades e estornos em ordem cronológica.
                                </p>
                              </div>

                              <div className="grid w-full grid-cols-3 gap-1.5 sm:flex sm:w-auto sm:shrink-0">
                                {[
                                  { value: "all", label: "Todos" },
                                  { value: "transactions", label: "Transações" },
                                  { value: "activities", label: "Atividades" },
                                ].map((filter) => (
                                  <Button
                                    key={filter.value}
                                    type="button"
                                    variant={walletTimelineFilter === filter.value ? "default" : "outline"}
                                    disabled={walletDetailContentLoading}
                                    className={`h-8 min-w-0 rounded-full px-2.5 text-[10px] sm:px-3 sm:text-xs ${
                                      walletTimelineFilter === filter.value ? "bg-slate-900 text-white hover:bg-slate-800" : ""
                                    }`}
                                    onClick={() => setWalletTimelineFilter(filter.value)}
                                  >
                                    {filter.label}
                                  </Button>
                                ))}
                              </div>
                            </div>

                            <div className="p-3 sm:p-4" aria-busy={walletDetailContentLoading}>
                              {walletDetailContentLoading ? (
                                <div className="relative pl-4 sm:pl-5" aria-label="Carregando extrato da carteira">
                                  <div className="absolute bottom-0 left-1 top-0 w-px bg-slate-200 sm:left-1.5" />
                                  <div className="space-y-2">
                                    {[0, 1, 2, 3].map((item) => (
                                      <div key={`wallet-skeleton-${item}`} className="relative">
                                        <Skeleton className="absolute -left-[0.95rem] top-4 h-2.5 w-2.5 rounded-full sm:-left-[1.15rem]" />
                                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 sm:px-3.5">
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1 space-y-2">
                                              <Skeleton className="h-4 w-2/5 rounded-full" />
                                              <Skeleton className="h-3 w-3/5 rounded-full" />
                                            </div>
                                            <div className="flex w-20 shrink-0 flex-col items-end gap-2">
                                              <Skeleton className="h-4 w-full rounded-full" />
                                              <Skeleton className="h-3 w-14 rounded-full" />
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : filteredWalletTimelineRows.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                                  Nenhum lançamento foi encontrado para o filtro selecionado.
                                </div>
                              ) : (
                                <div className="relative pl-4 sm:pl-5">
                                  <div className="absolute bottom-0 left-1 top-0 w-px bg-slate-200 sm:left-1.5" />
                                  <div className="space-y-2">
                                    {filteredWalletTimelineRows.map((row) => (
                                      <div key={row.id} className="relative">
                                        <div className={`absolute -left-[0.95rem] top-4 h-2.5 w-2.5 rounded-full border-2 border-white sm:-left-[1.15rem] ${getWalletTimelineDotClass(row)}`} />
                                        <details className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-sm">
                                          <summary className="cursor-pointer list-none px-3 py-2.5 hover:bg-slate-50 sm:px-3.5">
                                            <div className="flex items-start justify-between gap-3">
                                              <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <p className="truncate text-sm font-semibold text-slate-900">{row.title}</p>
                                                    {row.badges.map((badge) => (
                                                      <Badge
                                                        key={`${row.id}-${badge.label}`}
                                                        variant="outline"
                                                        className={`rounded-full px-1.5 py-0 text-[9px] font-bold ${badge.tone === "red"
                                                          ? "border-red-200 bg-red-50 text-red-700"
                                                          : badge.tone === "amber"
                                                            ? "border-amber-200 bg-amber-50 text-amber-700"
                                                            : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                                                      >
                                                        {badge.label}
                                                      </Badge>
                                                    ))}
                                                  </div>
                                                <p className="mt-1 truncate text-[11px] text-slate-500 sm:text-xs">
                                                  <span className="font-medium text-slate-700">{row.subtitle}</span>
                                                  <span className="mx-1.5 text-slate-300">•</span>
                                                  {row.categoryLabel}
                                                </p>
                                              </div>
                                              <div className="shrink-0 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                  <p className={`text-sm font-semibold ${
                                                    row.amountTone === "credit"
                                                      ? "text-emerald-700"
                                                      : row.amountTone === "debit"
                                                        ? "text-red-600"
                                                        : "text-slate-900"
                                                  }`}
                                                  >
                                                    {row.amountTone === "credit" ? "+" : row.amountTone === "debit" ? "-" : ""}
                                                    {formatCurrency(row.amount)}
                                                  </p>
                                                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition group-open:rotate-180" />
                                                </div>
                                                <p className="mt-0.5 text-[10px] text-slate-400 sm:text-[11px]">{formatWalletStatementDate(row.primaryDate)}</p>
                                              </div>
                                            </div>
                                          </summary>

                                          <div className="border-t border-slate-100 bg-slate-50 px-3 py-3 sm:px-3.5">
                                            <div className="grid grid-cols-1 gap-2 text-xs text-slate-600 sm:grid-cols-2">
                                              <p><span className="font-medium text-slate-900">Data:</span> {row.details.data}</p>
                                              <p><span className="font-medium text-slate-900">Status:</span> {row.details.status || "—"}</p>
                                              {row.sourceKind === "transaction" ? (
                                                <>
                                                  <p><span className="font-medium text-slate-900">Forma de pagamento:</span> {row.details.formaPagamento}</p>
                                                  <p><span className="font-medium text-slate-900">Contraparte:</span> {row.details.contraparte}</p>
                                                </>
                                              ) : (
                                                <>
                                                  <p><span className="font-medium text-slate-900">Vencimento:</span> {row.details.vencimento || "—"}</p>
                                                  <p><span className="font-medium text-slate-900">Data da quitação:</span> {row.details.quitacaoData || "—"}</p>
                                                </>
                                              )}
                                              {row.details.motivo ? (
                                                <p className="sm:col-span-2"><span className="font-medium text-slate-900">Motivo:</span> {row.details.motivo}</p>
                                              ) : null}
                                              {row.details.anexo ? (
                                                <p className="sm:col-span-2"><span className="font-medium text-slate-900">Anexo:</span> {row.details.anexo}</p>
                                              ) : null}
                                            </div>

                                            <div className="mt-3 flex flex-wrap gap-1.5">
                                              {row.appointmentId ? (
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-7 rounded-full px-2.5 text-[10px]"
                                                  onClick={() => openWalletStatementAppointment(row.appointmentId)}
                                                >
                                                  Abrir agendamento
                                                </Button>
                                              ) : null}
                                              {row.referenceId && row.referenceType ? (
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-7 rounded-full px-2.5 text-[10px]"
                                                  onClick={() => openWalletStatementReference(row)}
                                                >
                                                  Abrir {row.referenceLabel?.toLowerCase() || "referência"}
                                                </Button>
                                              ) : null}
                                              {row.sourceKind === "transaction" && row.transactionRow ? (
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-7 rounded-full px-2.5 text-[10px]"
                                                  onClick={() => openWalletStatementTransaction(row.transactionRow)}
                                                >
                                                  Abrir transação
                                                </Button>
                                              ) : null}
                                              {row.sourceKind === "transaction" && row.isManualMovement && row.movementId ? (
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-7 rounded-full border-red-200 px-2.5 text-[10px] text-red-700 hover:bg-red-50 hover:text-red-800"
                                                  onClick={() => handleDeleteWalletManualMovement(row)}
                                                  disabled={walletManualDeletingId === row.movementId}
                                                >
                                                  {walletManualDeletingId === row.movementId ? (
                                                    <RefreshCw className="mr-1.5 h-3 w-3 animate-spin" />
                                                  ) : (
                                                    <Trash2 className="mr-1.5 h-3 w-3" />
                                                  )}
                                                  {walletManualDeletingId === row.movementId ? "Excluindo..." : "Excluir"}
                                                </Button>
                                              ) : null}
                                            </div>
                                          </div>
                                        </details>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                          A leitura detalhada dos movimentos ainda está desligada por feature flag.
                        </div>
                      )}
                  </div>
                </div>
            )}
          </div>
        )}

        {walletOnly && !walletReadEnabled && walletFlagsLoaded && (
          <Card className="mb-6 border-dashed border-slate-300 bg-white">
            <CardContent className="p-6 text-sm text-slate-500">
              A leitura administrativa de carteiras ainda está desligada por feature flag nesta unidade.
            </CardContent>
          </Card>
        )}

        {!walletOnly ? (
          <>
            <Card className="mb-3 border-gray-200 bg-white sm:mb-6">
              <CardContent className="p-2 sm:p-4">
                <SearchFiltersToolbar
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                  searchPlaceholder="Buscar por titular, método, banco ou transação ID"
                  hasActiveFilters={Boolean(searchTerm || tipoFiltro !== "all" || dataInicial || dataFinal)}
                  onClear={() => {
                    setSearchTerm("");
                    setTipoFiltro("all");
                    setDataInicial("");
                    setDataFinal("");
                  }}
                  filters={[
                    {
                      id: "type",
                      label: "Tipo",
                      icon: ListFilter,
                      active: tipoFiltro !== "all",
                      content: (
                        <div className="space-y-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Tipo de movimentação</p>
                          <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
                            <SelectTrigger>
                              <SelectValue placeholder="Tipo" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos</SelectItem>
                              <SelectItem value="entrada">Entradas</SelectItem>
                              <SelectItem value="saida">Saídas</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ),
                    },
                    {
                      id: "period",
                      label: "Período",
                      icon: Calendar,
                      active: Boolean(dataInicial || dataFinal),
                      content: (
                        <div className="space-y-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Período da transação</p>
                          <DateRangePickerInput
                            startValue={dataInicial}
                            endValue={dataFinal}
                            onStartChange={setDataInicial}
                            onEndChange={setDataFinal}
                          />
                        </div>
                      ),
                    },
                  ]}
                  className="!flex-row items-center gap-1.5 sm:gap-2"
                  searchInputClassName="h-8 pl-8 pr-2 text-[11px] sm:h-11 sm:pl-11 sm:pr-4 sm:text-sm"
                  searchIconClassName="left-2.5 h-3 w-3 sm:left-4 sm:h-4 sm:w-4"
                  filtersClassName="shrink-0 flex-nowrap gap-1 sm:gap-2"
                  filterButtonClassName="h-8 sm:h-11"
                  filterIconClassName="h-3 w-3 sm:h-4 sm:w-4"
                />
              </CardContent>
            </Card>

            <div className="space-y-2 sm:space-y-3">
              {filtered.length === 0 ? (
                <Card className="border-gray-200 bg-white">
                  <CardContent className="p-8 text-center text-xs text-gray-500 sm:p-12 sm:text-sm">
                    {isInitialLoading ? "Carregando movimentações..." : "Nenhuma movimentação encontrada."}
                  </CardContent>
                </Card>
              ) : (
                <>
                  {visibleMovements.map((movement) => (
                  <Card key={movement.id} className="border-gray-200 bg-white">
                <CardContent className="flex flex-col gap-2 p-2.5 sm:gap-4 sm:p-4 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:gap-4 lg:items-center">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12 ${movement.tipo === "entrada" ? "bg-green-100" : "bg-red-100"}`}>
                      {movement.tipo === "entrada" ? (
                        <ArrowUpCircle className="h-4 w-4 text-green-600 sm:h-6 sm:w-6" />
                      ) : (
                        <ArrowDownCircle className="h-4 w-4 text-red-600 sm:h-6 sm:w-6" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-2 sm:space-y-3">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 lg:grid-cols-4 lg:gap-3">
                        <div className="col-start-1 row-start-1 min-w-0 lg:col-start-auto lg:row-start-auto">
                          <p className="text-[9px] uppercase tracking-wide text-gray-500 sm:text-xs">Titular da contraparte</p>
                          <p className="mt-0.5 truncate text-xs font-semibold text-gray-900 sm:mt-1 sm:text-base">{movement.contraparte}</p>
                          <p className="mt-0.5 text-[9px] text-gray-500 sm:mt-1 sm:text-xs">{movement.direcaoLabel}</p>
                        </div>

                        <div className="col-start-1 row-start-2 min-w-0 lg:col-start-auto lg:row-start-auto">
                          <p className="text-[9px] uppercase tracking-wide text-gray-500 sm:text-xs">Método</p>
                          <p className="mt-0.5 truncate text-[11px] font-medium text-gray-900 sm:mt-1 sm:text-base">{movement.metodo}</p>
                        </div>

                        <div className="col-start-2 row-start-2 min-w-0 text-right lg:col-start-auto lg:row-start-auto lg:text-left">
                          <p className="text-[9px] uppercase tracking-wide text-gray-500 sm:text-xs">
                            <span className="sm:hidden">Data</span>
                            <span className="hidden sm:inline">Data da transação</span>
                          </p>
                          <p className="mt-0.5 whitespace-nowrap text-[11px] font-medium text-gray-900 sm:mt-1 sm:text-base">{formatMovementDateTime(movement)}</p>
                        </div>

                        <div className="col-start-2 row-start-1 min-w-0 text-right lg:col-start-auto lg:row-start-auto lg:text-left">
                          <p className="text-[9px] uppercase tracking-wide text-gray-500 sm:text-xs">Valor</p>
                          <p className={`mt-0.5 whitespace-nowrap text-sm font-bold sm:mt-1 sm:text-lg ${movement.tipo === "entrada" ? "text-green-600" : "text-red-600"}`}>
                            {movement.tipo === "entrada" ? "+" : "-"}
                            {formatCurrency(Math.abs(movement.valor || 0))}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1 sm:gap-2">
                        <Badge className={`px-1.5 py-0 text-[9px] sm:px-2.5 sm:py-0.5 sm:text-xs ${movement.tipo === "entrada" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {movement.tipoDetalhado || movement.direcaoLabel}
                        </Badge>
                        <Badge className="hidden bg-blue-100 text-blue-700 sm:inline-flex">{movement.metodo}</Badge>
                        {movement.bancoContraparte && movement.bancoContraparte !== "-" && (
                          <Badge className="bg-gray-100 px-1.5 py-0 text-[9px] text-gray-700 sm:px-2.5 sm:py-0.5 sm:text-xs">{movement.bancoContraparte}</Badge>
                        )}
                        {movement.apiLocked ? (
                          <Badge variant="outline" className="px-1.5 py-0 text-[9px] sm:px-2.5 sm:py-0.5 sm:text-xs">Origem API</Badge>
                        ) : (
                          <Badge variant="outline" className="px-1.5 py-0 text-[9px] sm:px-2.5 sm:py-0.5 sm:text-xs">Manual</Badge>
                        )}
                        {movement.apiLocked ? (
                          movement.vinculo_financeiro ? (
                            <Badge className="border border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[9px] text-emerald-700 sm:px-2.5 sm:py-0.5 sm:text-xs">
                              Vinculada
                            </Badge>
                          ) : (
                            <Badge className="border border-amber-200 bg-amber-50 px-1.5 py-0 text-[9px] text-amber-700 sm:px-2.5 sm:py-0.5 sm:text-xs">
                              Sem vínculo
                            </Badge>
                          )
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 sm:flex sm:items-center sm:gap-2">
                    {walletOnly && walletFlags.movementsEnabled && canManageWalletOperations && movement.tipo === "entrada" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="col-span-2 h-8 rounded-full px-2 text-[10px] sm:col-span-1 sm:h-9 sm:px-3 sm:text-sm"
                        onClick={() =>
                          openWalletOperationModal("entrada_direcionada", {
                            carteira_conta_id: selectedWalletRuntimeAccountId,
                            valor: Math.abs(movement.valor || 0),
                            referencia_amigavel: `Entrada direcionada - ${movement.contraparte || movement.referenciaFinanceira || movement.id}`,
                            observacao: `Origem do extrato: ${movement.id}`,
                            origem: "transacao_direcionada",
                            transacao_id: movement.id,
                          })
                        }
                        disabled={!selectedWalletRuntimeAccountId}
                      >
                        Direcionar para carteira
                      </Button>
                    )}
                    {movement.apiLocked ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full px-2 text-[10px] sm:h-9 sm:px-3 sm:text-sm"
                        onClick={() => handleViewReceipt(movement)}
                        disabled={receiptLoadingId === movement.id}
                      >
                        <FileText className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                        {receiptLoadingId === movement.id ? "Carregando..." : "Ver comprovante"}
                      </Button>
                    ) : null}
                    <Button variant="outline" size="sm" className="h-8 rounded-full px-2 text-[10px] sm:h-9 sm:px-3 sm:text-sm" onClick={() => openModal(movement)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                      {movement.apiLocked ? "Complementar" : "Editar"}
                    </Button>
                    {!movement.apiLocked && (
                      <Button variant="outline" size="sm" className="h-8 rounded-full px-2 text-[10px] text-red-600 sm:h-9 sm:px-3 sm:text-sm" onClick={() => handleDelete(movement)}>
                        <Trash2 className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                        Excluir
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
              ))}

                  {hasMoreMovements && (
                    <Card className="border-dashed border-gray-300 bg-white">
                      <CardContent className="flex flex-col items-center gap-2 p-3 text-center sm:gap-3 sm:p-5">
                        <p className="text-[10px] text-gray-500 sm:text-sm">
                          Exibindo {visibleMovements.length} de {filtered.length} movimentações encontradas.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-full px-3 text-[10px] sm:text-sm"
                          onClick={() => setVisibleCount((current) => current + MOVEMENTS_PAGE_SIZE)}
                        >
                          Carregar mais
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          </>
        ) : null}
      </div>

      <Dialog open={Boolean(transactionReceipt)} onOpenChange={(open) => !open && setTransactionReceipt(null)}>
        <DialogContent className="max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[640px] gap-3 overflow-y-auto !rounded-[24px] border-slate-200 bg-white p-4 shadow-2xl sm:max-h-[90vh] sm:w-[95vw] sm:gap-4 sm:p-6">
          <DialogHeader className="pr-7 text-left">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <DialogTitle className="text-base leading-tight sm:text-lg">Comprovante da transação</DialogTitle>
              <Badge className="whitespace-nowrap border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 sm:text-xs">
                Consultado no Banco Inter
              </Badge>
            </div>
            <DialogDescription className="text-xs leading-5 sm:text-sm">
              {transactionReceipt?.message || "Dados bancários consultados em tempo real."}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 sm:p-5">
            <div className="flex flex-col gap-1 border-b border-slate-200 pb-3 sm:flex-row sm:items-end sm:justify-between sm:pb-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-xs">
                  {transactionReceipt?.details?.transaction_type || "Movimentação bancária"}
                </p>
                <p className="mt-1 text-sm font-semibold leading-snug text-slate-900 sm:text-base">
                  {transactionReceipt?.details?.description || "Transação Banco Inter"}
                </p>
              </div>
              <p className={`text-lg font-bold sm:text-xl ${transactionReceipt?.details?.direction === "Saída" ? "text-rose-600" : "text-emerald-600"}`}>
                {transactionReceipt?.details?.direction === "Saída" ? "-" : "+"}
                {formatCurrency(transactionReceipt?.details?.amount || 0)}
              </p>
            </div>

            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-xs sm:mt-4 sm:grid-cols-2 sm:gap-y-4 sm:text-sm">
              {[
                ["Data", transactionReceipt?.details?.transaction_date ? formatMovementDateTime(transactionReceipt.details.transaction_date) : null],
                ["Situação", transactionReceipt?.details?.status],
                ["Contraparte", transactionReceipt?.details?.counterparty_name],
                ["Documento", transactionReceipt?.details?.counterparty_document],
                ["Referência bancária", transactionReceipt?.details?.provider_reference],
                ["ID da transação Pix", transactionReceipt?.details?.end_to_end_id],
                ["TXID", transactionReceipt?.details?.txid],
                ["NSU", transactionReceipt?.details?.nsu],
                ["Autenticação", transactionReceipt?.details?.authentication],
              ].filter(([, value]) => value).map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:text-xs">{label}</dt>
                  <dd className="mt-1 break-all font-medium text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {transactionReceipt?.warning ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {transactionReceipt.warning}
            </p>
          ) : null}

          {!transactionReceipt?.official_pdf ? (
            <p className="text-xs leading-5 text-slate-500">
              Comprovante individual formado pelos dados identificadores retornados pela API oficial do Banco Inter para esta transação.
            </p>
          ) : null}

          <DialogFooter className="gap-2 pt-1 sm:pt-0">
            {!transactionReceipt?.official_pdf && transactionReceipt?.details ? (
              <Button type="button" variant="outline" className="rounded-xl" onClick={handleDownloadTransactionReceipt} disabled={isReceiptDownloading}>
                <Download className="mr-2 h-4 w-4" />
                {isReceiptDownloading ? "Baixando..." : "Baixar"}
              </Button>
            ) : null}
            <Button type="button" className="rounded-xl" onClick={() => setTransactionReceipt(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[680px] gap-0 overflow-hidden !rounded-[26px] border-slate-200 bg-white p-0 shadow-[0_28px_80px_rgba(15,23,42,0.2)] sm:max-h-[90vh]">
          <div className="border-b border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 px-5 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-6">
            <DialogHeader className="pr-8 text-left">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${editingItem?.tipo === "saida" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {editingItem?.tipo === "saida" ? <ArrowDownCircle className="h-5 w-5" /> : <ArrowUpCircle className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg font-bold tracking-tight text-slate-950 sm:text-xl">
                    {editingItem?.apiLocked ? "Complementar transação" : editingItem ? "Editar movimentação" : "Nova movimentação manual"}
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">
                    {editingItem?.apiLocked
                      ? "Vincule a movimentação ao destino financeiro correto sem alterar os dados oficiais do banco."
                      : "Ajuste manualmente os dados financeiros exibidos na sessão de transações."}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="max-h-[calc(90vh-180px)] overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            {editingItem?.apiLocked ? (
              <div className="space-y-4">
                <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Transação oficial</p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-950 sm:text-base">{editingItem.contraparte}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatMovementDateTime(editingItem)} · {editingItem.metodo}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-lg font-bold ${editingItem.tipo === "entrada" ? "text-emerald-600" : "text-rose-600"}`}>
                        {editingItem.tipo === "entrada" ? "+" : "-"}{formatCurrency(Math.abs(editingItem.valor || 0))}
                      </p>
                      <Badge variant="outline" className="mt-1 border-slate-200 bg-white text-[10px] text-slate-600">
                        {editingItem.tipo === "entrada" ? "Entrada" : "Saída"}
                      </Badge>
                    </div>
                  </div>
                </section>

                <div className="flex items-start gap-2.5 rounded-2xl border border-blue-100 bg-blue-50/70 px-3.5 py-3 text-xs leading-5 text-blue-800">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  Data, valor, contraparte e identificadores bancários permanecem protegidos. O complemento registra apenas o destino e a observação operacional.
                </div>

                <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-slate-950">
                        {editingItem.tipo === "entrada" ? <Wallet className="h-4 w-4 text-emerald-600" /> : <FileText className="h-4 w-4 text-rose-600" />}
                        <h3 className="text-sm font-bold">Vínculo financeiro</h3>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {editingItem.tipo === "entrada"
                          ? "Direcione o recebimento integral para a carteira do responsável financeiro."
                          : "Associe a saída à despesa correspondente em Contas a Pagar."}
                      </p>
                    </div>
                    {complementExistingLinkTargetId ? (
                      <Badge className="shrink-0 border border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Vinculada
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <Label className="text-xs font-semibold text-slate-700">
                      {editingItem.tipo === "entrada" ? "Carteira do responsável financeiro" : "Conta a pagar"}
                    </Label>
                    <Select
                      value={formData.link_target_id || ""}
                      onValueChange={(value) => setFormData((previous) => ({ ...previous, link_target_id: value }))}
                      disabled={Boolean(complementExistingLinkTargetId) || !canLinkComplement || complementOptionsLoading || walletLoading}
                    >
                      <SelectTrigger className="mt-2 h-11 rounded-xl border-slate-200 bg-white">
                        <SelectValue placeholder={complementOptionsLoading ? "Carregando opções..." : editingItem.tipo === "entrada" ? "Selecione uma carteira" : "Selecione uma conta a pagar"} />
                      </SelectTrigger>
                      <SelectContent className="max-w-[calc(100vw-2rem)] sm:max-w-[600px]">
                        {editingItem.tipo === "entrada"
                          ? walletAccounts.map((wallet) => (
                            <SelectItem key={wallet.carteira_id} value={wallet.carteira_id}>
                              {wallet.carteira_nome}
                            </SelectItem>
                          ))
                          : availableComplementPayables.map((payable) => (
                            <SelectItem key={payable.id} value={payable.id}>
                              {payable.descricao || payable.recebedor || payable.categoria || "Conta a pagar"} · vence {formatWalletStatementDate(payable.vencimento)} · {formatCurrency(getPayableRemainingAmount(payable))} em aberto
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>

                    {editingItem.tipo === "entrada" && selectedComplementWallet ? (
                      <p className="mt-2 text-xs text-emerald-700">
                        O crédito será registrado uma única vez na carteira de {selectedComplementWallet.carteira_nome}.
                      </p>
                    ) : null}
                    {editingItem.tipo === "saida" && selectedComplementPayable ? (
                      <p className="mt-2 text-xs text-rose-700">
                        Saldo atual da conta: {formatCurrency(getPayableRemainingAmount(selectedComplementPayable))}.
                      </p>
                    ) : null}
                    {!canLinkComplement && !complementExistingLinkTargetId ? (
                      <p className="mt-2 text-xs text-amber-700">Seu perfil pode consultar a transação, mas não possui permissão para criar vínculos financeiros.</p>
                    ) : null}
                    {complementOptionsError ? (
                      <p className="mt-2 text-xs text-rose-700">{complementOptionsError}</p>
                    ) : null}
                    {!complementOptionsLoading && canLinkComplement && !complementExistingLinkTargetId && (
                      (editingItem.tipo === "entrada" && walletAccounts.length === 0)
                      || (editingItem.tipo === "saida" && availableComplementPayables.length === 0)
                    ) ? (
                      <p className="mt-2 text-xs text-slate-500">
                        {editingItem.tipo === "entrada"
                          ? "Nenhuma carteira ativa foi encontrada nesta unidade."
                          : "Nenhuma conta a pagar em aberto foi encontrada nesta unidade."}
                      </p>
                    ) : null}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-slate-500" />
                    <Label htmlFor="transaction-complement-notes" className="text-sm font-bold text-slate-950">Observação complementar</Label>
                  </div>
                  <Textarea
                    id="transaction-complement-notes"
                    className="mt-3 min-h-[96px] resize-y rounded-xl border-slate-200"
                    rows={4}
                    value={formData.observacoes}
                    onChange={(event) => setFormData((previous) => ({ ...previous, observacoes: event.target.value }))}
                    placeholder="Inclua uma referência interna ou contexto para a equipe financeira."
                  />
                </section>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label>Data *</Label>
                  <DatePickerInput
                    className="mt-2"
                    value={formData.data_hora_transacao}
                    onChange={(value) => setFormData((prev) => ({ ...prev, data_hora_transacao: value }))}
                  />
                </div>

                <div>
                  <Label>Tipo *</Label>
                  <Select value={formData.tipo} onValueChange={(value) => setFormData((prev) => ({ ...prev, tipo: value }))}>
                    <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entrada">Entrada</SelectItem>
                      <SelectItem value="saida">Saída</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Remetente / Recebedor *</Label>
                  <Input className="mt-2" value={formData.nome_contraparte} onChange={(event) => setFormData((prev) => ({ ...prev, nome_contraparte: event.target.value }))} />
                </div>

                <div>
                  <Label>Valor *</Label>
                  <Input className="mt-2" value={formData.valor} onChange={(event) => setFormData((prev) => ({ ...prev, valor: event.target.value }))} placeholder="0,00" />
                </div>

                <div>
                  <Label>Banco da contraparte</Label>
                  <Input className="mt-2" value={formData.banco_contraparte} onChange={(event) => setFormData((prev) => ({ ...prev, banco_contraparte: event.target.value }))} />
                </div>

                <div>
                  <Label>Tipo da transação</Label>
                  <Input className="mt-2" value={formData.tipo_transacao_detalhado} onChange={(event) => setFormData((prev) => ({ ...prev, tipo_transacao_detalhado: event.target.value }))} placeholder="PIX, TED, boleto..." />
                </div>

                <div className="md:col-span-2">
                  <Label>ID da transação</Label>
                  <Input className="mt-2" value={formData.referencia} onChange={(event) => setFormData((prev) => ({ ...prev, referencia: event.target.value }))} />
                </div>

                <div className="md:col-span-2">
                  <Label>Observações</Label>
                  <Textarea className="mt-2" rows={4} value={formData.observacoes} onChange={(event) => setFormData((prev) => ({ ...prev, observacoes: event.target.value }))} />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:px-7">
            <Button variant="outline" className="rounded-xl" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button className="rounded-xl" onClick={handleSave} disabled={isSaving}>
              {isSaving
                ? "Salvando..."
                : editingItem?.apiLocked && formData.link_target_id && !complementExistingLinkTargetId
                  ? "Vincular e salvar"
                  : editingItem?.apiLocked
                    ? "Salvar complemento"
                    : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showWalletChargeModal}
        onOpenChange={(open) => {
          setShowWalletChargeModal(open);
          if (!open) setWalletChargeError("");
        }}
      >
        <DialogContent className="max-h-[92vh] w-[calc(100vw-24px)] max-w-[620px] gap-0 overflow-hidden rounded-[28px] border-slate-200 bg-white p-0 shadow-[0_28px_80px_rgba(15,23,42,0.22)] sm:w-full">
          <div className="border-b border-slate-200/80 bg-gradient-to-br from-blue-50 via-white to-emerald-50 px-5 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-6">
            <DialogHeader className="pr-8 text-left">
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${walletChargeStep === 5 ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                  {walletChargeStep === 5 ? <CheckCircle2 className="h-5 w-5" /> : <CircleDollarSign className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <DialogTitle className="font-brand text-xl tracking-tight text-slate-950 sm:text-2xl">
                    {walletChargeStep === 5 ? "Cobrança pronta" : "Gerar cobrança"}
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 truncate text-xs text-slate-500 sm:text-sm">
                    {walletChargeStep === 5
                      ? "Link seguro disponível para compartilhamento."
                      : selectedWalletAccount?.carteira_nome || "Responsável financeiro"}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {walletChargeStep < 5 ? (
              <div className="mt-5 grid grid-cols-4 gap-1.5 sm:gap-2">
                {WALLET_CHARGE_STEPS.map((step) => {
                  const StepIcon = step.icon;
                  const isActive = walletChargeStep === step.id;
                  const isComplete = walletChargeStep > step.id;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => {
                        if (isComplete && !walletChargeSaving) {
                          setWalletChargeStep(step.id);
                          setWalletChargeError("");
                        }
                      }}
                      disabled={!isComplete || walletChargeSaving}
                      className={`flex min-w-0 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-[10px] font-semibold transition sm:text-[11px] ${
                        isActive
                          ? "bg-white text-blue-700 shadow-sm ring-1 ring-blue-200"
                          : isComplete
                            ? "cursor-pointer bg-emerald-100/70 text-emerald-700 hover:bg-emerald-100"
                            : "bg-white/45 text-slate-400"
                      }`}
                      aria-current={isActive ? "step" : undefined}
                    >
                      {isComplete ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <StepIcon className="h-3.5 w-3.5 shrink-0" />}
                      <span className="truncate">{step.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="max-h-[calc(92vh-205px)] min-h-[300px] overflow-y-auto px-5 py-6 sm:min-h-[330px] sm:px-7 sm:py-7">
            {walletChargeStep === 1 ? (
              <div className="mx-auto max-w-lg">
                <div className="mb-6 flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <CircleDollarSign className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Valor da cobrança</p>
                    <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-950">Quanto deseja cobrar?</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Informe o valor total que será enviado ao responsável financeiro.</p>
                  </div>
                </div>

                <Label htmlFor="wallet-charge-value" className="text-xs font-semibold text-slate-700">Valor *</Label>
                <div className="mt-2 flex h-16 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 shadow-sm transition focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
                  <span className="text-sm font-bold text-slate-500">R$</span>
                  <Input
                    id="wallet-charge-value"
                    inputMode="decimal"
                    value={walletChargeForm.valor}
                    onChange={(event) => {
                      setWalletChargeForm((current) => ({ ...current, valor: event.target.value }));
                      setWalletChargeError("");
                    }}
                    placeholder="0,00"
                    autoFocus
                    className="h-full flex-1 border-0 bg-transparent px-0 text-2xl font-bold tracking-tight text-slate-950 shadow-none placeholder:text-slate-300 focus-visible:ring-0"
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500">Valor mínimo para emissão pelo Banco Inter: R$ 2,50.</p>
              </div>
            ) : null}

            {walletChargeStep === 2 ? (
              <div className="mx-auto max-w-lg">
                <div className="mb-6 flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700">Vencimento</p>
                    <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-950">Quando esta cobrança vence?</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">A data escolhida será usada na emissão do boleto pelo Banco Inter.</p>
                  </div>
                </div>

                <Label className="text-xs font-semibold text-slate-700">Data de vencimento *</Label>
                <DatePickerInput
                  className="mt-2 h-14 rounded-2xl border-slate-200 bg-slate-50 px-4 shadow-sm"
                  value={walletChargeForm.data_vencimento}
                  onChange={(value) => {
                    setWalletChargeForm((current) => ({ ...current, data_vencimento: value }));
                    setWalletChargeError("");
                  }}
                  placeholder="Selecione o vencimento"
                />
              </div>
            ) : null}

            {walletChargeStep === 3 ? (
              <div className="mx-auto max-w-lg">
                <div className="mb-6 flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">Identificação</p>
                    <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-950">Como identificar a cobrança?</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Se desejar, use uma descrição curta para facilitar a identificação.</p>
                  </div>
                </div>

                <Label htmlFor="wallet-charge-description" className="text-xs font-semibold text-slate-700">Descrição (opcional)</Label>
                <Textarea
                  id="wallet-charge-description"
                  rows={4}
                  maxLength={180}
                  value={walletChargeForm.descricao}
                  onChange={(event) => {
                    setWalletChargeForm((current) => ({ ...current, descricao: event.target.value }));
                    setWalletChargeError("");
                  }}
                  placeholder="Ex.: Serviços de hospedagem de julho"
                  className="mt-2 min-h-[132px] resize-none rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 shadow-sm focus:bg-white"
                />
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Quando informada, aparecerá no link de pagamento.</span>
                  <span className="shrink-0 pl-3">{walletChargeForm.descricao.length}/180</span>
                </div>
              </div>
            ) : null}

            {walletChargeStep === 4 ? (
              <div className="mx-auto max-w-lg">
                <div className="mb-5 flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                    <Landmark className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700">Pagamento</p>
                    <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-950">Escolha como o cliente pagará</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">O Banco Inter emite uma cobrança com boleto e Pix; escolha quais dados serão apresentados ao cliente.</p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <button
                    type="button"
                    aria-pressed={walletChargeForm.metodo === "boleto_bancario"}
                    onClick={() => setWalletChargeForm((current) => ({ ...current, metodo: "boleto_bancario" }))}
                    className={`flex w-full items-center gap-3 rounded-[20px] border p-3.5 text-left transition ${walletChargeForm.metodo === "boleto_bancario"
                      ? "border-blue-300 bg-blue-50/70 shadow-sm ring-1 ring-blue-200"
                      : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40"}`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
                      <Landmark className="h-[18px] w-[18px]" />
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-950">Boleto bancário</span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-500">Código de barras, linha digitável e Pix copia e cola.</span>
                    </span>
                    {walletChargeForm.metodo === "boleto_bancario" ? <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-600" /> : null}
                  </button>

                  <button
                    type="button"
                    aria-pressed={walletChargeForm.metodo === "pix"}
                    onClick={() => setWalletChargeForm((current) => ({ ...current, metodo: "pix" }))}
                    className={`flex w-full items-center gap-3 rounded-[20px] border p-3.5 text-left transition ${walletChargeForm.metodo === "pix"
                      ? "border-emerald-300 bg-emerald-50/70 shadow-sm ring-1 ring-emerald-200"
                      : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40"}`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                      <QrCode className="h-[18px] w-[18px]" />
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-950">Pix com vencimento</span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-500">QR Code e Pix copia e cola, sem exibir os dados do boleto.</span>
                    </span>
                    {walletChargeForm.metodo === "pix" ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : null}
                  </button>

                  <div className="flex w-full items-center gap-3 rounded-[20px] border border-slate-200 bg-slate-50/80 p-3.5 text-left">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-400">
                      <CreditCard className="h-[18px] w-[18px]" />
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-600">Cartão</span>
                      <span className="mt-0.5 block text-xs text-slate-400">Disponível após a integração do gateway online.</span>
                    </span>
                    <Badge variant="outline" className="shrink-0 rounded-full border-slate-300 bg-white px-2 text-[9px] text-slate-500">Em breve</Badge>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 divide-x divide-slate-200 border-t border-slate-200 pt-4 text-center">
                  <div className="px-2">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Valor</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-800">{formatCurrency(parseWalletChargeAmount(walletChargeForm.valor))}</p>
                  </div>
                  <div className="px-2">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Vencimento</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-800">{formatWalletStatementDate(walletChargeForm.data_vencimento)}</p>
                  </div>
                  <div className="px-2">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Cliente</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-800">{selectedWalletAccount?.carteira_nome || "-"}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {walletChargeStep === 5 ? (
              <div className="mx-auto max-w-lg text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-8 ring-emerald-50">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h3 className="mt-5 text-xl font-bold tracking-tight text-slate-950">Cobrança emitida com sucesso</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                  {formatCurrency(walletChargeResult?.charge?.valor || parseWalletChargeAmount(walletChargeForm.valor))} com vencimento em {formatWalletStatementDate(walletChargeResult?.charge?.data_vencimento || walletChargeForm.data_vencimento)}.
                </p>

                <div className="mt-6 text-left">
                  <Label htmlFor="wallet-charge-public-link" className="text-xs font-semibold text-slate-700">Link de cobrança</Label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Input id="wallet-charge-public-link" value={walletChargeResult?.publicUrl || ""} readOnly className="h-12 min-w-0 rounded-2xl border-slate-200 bg-slate-50 px-4 text-xs" />
                    <Button
                      type="button"
                      onClick={() => handleCopyWalletChargeLink(walletChargeResult?.publicUrl)}
                      disabled={!walletChargeResult?.publicUrl}
                      className="h-12 shrink-0 rounded-2xl bg-blue-600 px-5 text-white hover:bg-blue-700"
                    >
                      <ClipboardCopy className="mr-1.5 h-4 w-4" />
                      Copiar link
                    </Button>
                  </div>
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-400">O cliente pode abrir este link seguro sem fazer login.</p>
              </div>
            ) : null}

            {walletChargeError && walletChargeStep < 5 ? (
              <div className="mx-auto mt-5 flex max-w-lg items-start gap-2.5 rounded-2xl bg-red-50 px-3.5 py-3 text-xs leading-5 text-red-700" role="alert">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{walletChargeError}</span>
              </div>
            ) : null}
          </div>

          <DialogFooter className="flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            {walletChargeStep === 5 ? (
              <Button onClick={() => setShowWalletChargeModal(false)} className="h-11 w-full rounded-full bg-slate-950 px-6 text-white hover:bg-slate-800 sm:ml-auto sm:w-auto">Concluir</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setShowWalletChargeModal(false)} disabled={walletChargeSaving} className="h-11 rounded-full px-5 text-slate-500 hover:bg-slate-200/70 hover:text-slate-800">Cancelar</Button>
                <div className="flex gap-2">
                  {walletChargeStep > 1 ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setWalletChargeStep((current) => current - 1);
                        setWalletChargeError("");
                      }}
                      disabled={walletChargeSaving}
                      className="h-11 flex-1 rounded-full border-slate-300 bg-white px-5 sm:flex-none"
                    >
                      <ChevronLeft className="mr-1.5 h-4 w-4" />
                      Voltar
                    </Button>
                  ) : null}
                  {walletChargeStep < 4 ? (
                    <Button onClick={handleWalletChargeStepNext} className="h-11 flex-1 rounded-full bg-blue-600 px-7 text-white hover:bg-blue-700 sm:flex-none">
                      {walletChargeStep === 3 && !walletChargeForm.descricao.trim() ? "Pular" : "Seguir"}
                    </Button>
                  ) : (
                    <Button onClick={handleWalletChargeIssue} disabled={walletChargeSaving} className="h-11 flex-1 rounded-full bg-blue-600 px-6 text-white hover:bg-blue-700 sm:flex-none">
                      {walletChargeSaving ? "Emitindo..." : "Confirmar e emitir"}
                    </Button>
                  )}
                </div>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWalletOpenChargesModal} onOpenChange={setShowWalletOpenChargesModal}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[760px] flex-col gap-0 overflow-hidden rounded-[26px] border-slate-200 bg-slate-50 p-0 shadow-[0_24px_80px_rgba(15,23,42,0.22)] sm:max-h-[88vh] sm:rounded-[30px]">
          <DialogHeader className="border-b border-slate-200 bg-gradient-to-br from-white via-white to-blue-50/70 px-5 py-5 pr-14 text-left sm:px-7 sm:py-6 sm:pr-16">
            <div className="flex items-start gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.24)]">
                <FileText className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-xl tracking-tight text-slate-950 sm:text-2xl">Cobranças em aberto</DialogTitle>
                <DialogDescription className="mt-1.5 max-w-xl text-xs leading-relaxed text-slate-600 sm:text-sm">
                  Acompanhe boletos e links de pagamento emitidos para {selectedWalletAccount?.carteira_nome || "esta carteira"}.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex items-center gap-2">
                <Badge className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 shadow-none hover:bg-blue-50">
                  {walletOpenCharges.length} {walletOpenCharges.length === 1 ? "cobrança" : "cobranças"}
                </Badge>
                <span className="text-xs text-slate-500">aguardando pagamento</span>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={walletOpenChargesSort}
                  onValueChange={(value) => {
                    setWalletOpenChargesSort(value);
                    loadWalletOpenCharges(value);
                  }}
                >
                  <SelectTrigger className="h-9 min-w-0 flex-1 rounded-xl border-slate-200 bg-slate-50 text-xs shadow-none sm:w-[205px] sm:flex-none">
                    <ListFilter className="mr-2 h-3.5 w-3.5 text-slate-500" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="due_date">Vencimento mais próximo</SelectItem>
                    <SelectItem value="issued_at">Emissão mais recente</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-xl border-slate-200 bg-white"
                  onClick={() => loadWalletOpenCharges(walletOpenChargesSort)}
                  disabled={walletOpenChargesLoading}
                  aria-label="Atualizar cobranças em aberto"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${walletOpenChargesLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              {walletOpenChargesLoading ? (
                <div className="space-y-3" aria-label="Carregando cobranças">
                  {[0, 1, 2].map((item) => (
                    <div key={item} className="animate-pulse rounded-[22px] border border-slate-200 bg-white p-4">
                      <div className="h-4 w-40 rounded bg-slate-200" />
                      <div className="mt-3 h-8 w-28 rounded bg-slate-100" />
                      <div className="mt-4 h-3 w-full rounded bg-slate-100" />
                    </div>
                  ))}
                </div>
              ) : walletOpenChargesError ? (
                <div className="flex flex-col items-center rounded-[22px] border border-red-200 bg-red-50/70 px-5 py-8 text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-700">
                    <FileWarning className="h-5 w-5" />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-red-900">Não foi possível carregar as cobranças</p>
                  <p className="mt-1 max-w-md text-xs leading-relaxed text-red-700">{walletOpenChargesError}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4 rounded-full border-red-200 bg-white text-red-700 hover:bg-red-100"
                    onClick={() => loadWalletOpenCharges(walletOpenChargesSort)}
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Tentar novamente
                  </Button>
                </div>
              ) : walletOpenCharges.length === 0 ? (
                <div className="flex min-h-[260px] flex-col items-center justify-center rounded-[22px] border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-6 w-6" />
                  </span>
                  <p className="mt-4 text-sm font-semibold text-slate-900">Nenhuma cobrança em aberto</p>
                  <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">
                    Quando uma nova cobrança for emitida para esta carteira, ela aparecerá aqui com valor e vencimento.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {walletOpenCharges.map((charge) => {
                    const duePresentation = getWalletChargeDuePresentation(charge.data_vencimento);
                    const generatedLink = walletOpenChargeGeneratedLinks[charge.id] || "";
                    const linkFeedback = walletOpenChargeFeedback[charge.id] || null;
                    const isRenewingLink = walletOpenChargeRenewingId === charge.id;
                    const isCancelling = walletOpenChargeCancellingId === charge.id;
                    return (
                      <article key={charge.id} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)] transition hover:border-blue-200 hover:shadow-[0_8px_24px_rgba(15,23,42,0.07)] sm:p-5">
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                            <Landmark className="h-4.5 w-4.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Badge variant="outline" className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${charge.metodo === "pix"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-blue-200 bg-blue-50 text-blue-700"}`}>
                                    {charge.metodo === "pix" ? "Pix" : "Boleto + Pix"}
                                  </Badge>
                                  <Badge variant="outline" className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${duePresentation.className}`}>
                                    {duePresentation.label}
                                  </Badge>
                                  {charge.public_link_available ? (
                                    <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Link ativo</Badge>
                                  ) : null}
                                </div>
                                <h3 className="mt-2 truncate text-sm font-semibold text-slate-950 sm:text-[15px]">
                                  {charge.descricao || "Cobrança sem descrição"}
                                </h3>
                              </div>
                              <p className="shrink-0 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{formatCurrency(charge.valor)}</p>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs sm:grid-cols-3">
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Vencimento</p>
                                <p className="mt-1 font-medium text-slate-700">{formatWalletStatementDate(charge.data_vencimento)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Emissão</p>
                                <p className="mt-1 font-medium text-slate-700">{formatWalletStatementDate(charge.emitido_em || charge.criado_em)}</p>
                              </div>
                              <div className="col-span-2 sm:col-span-1">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Situação</p>
                                <p className="mt-1 font-medium text-slate-700">Aguardando pagamento</p>
                              </div>
                            </div>

                            {generatedLink ? (
                              <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-blue-200 bg-blue-50/70 p-3 sm:flex-row sm:items-center">
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-700">Link seguro pronto</p>
                                  <p className="mt-1 truncate text-[11px] text-blue-900" title={generatedLink}>{generatedLink}</p>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-9 w-full shrink-0 rounded-full bg-blue-600 px-4 text-xs text-white hover:bg-blue-700 sm:w-auto"
                                  onClick={() => handleCopyWalletOpenChargeLink(charge.id)}
                                >
                                  {linkFeedback?.type === "success" ? (
                                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                  ) : (
                                    <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />
                                  )}
                                  Copiar link
                                </Button>
                              </div>
                            ) : null}

                            {linkFeedback ? (
                              <p
                                className={`mt-2 text-[11px] font-medium ${linkFeedback.type === "error"
                                  ? "text-red-700"
                                  : linkFeedback.type === "success"
                                    ? "text-emerald-700"
                                    : "text-blue-700"}`}
                                role={linkFeedback.type === "error" ? "alert" : "status"}
                              >
                                {linkFeedback.message}
                              </p>
                            ) : null}

                            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-[10px] leading-relaxed text-slate-400">Gerar um novo link invalida o endereço compartilhado anteriormente.</p>
                              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-9 w-full shrink-0 rounded-full border-red-200 bg-white px-4 text-xs text-red-700 hover:bg-red-50 hover:text-red-800 sm:w-auto"
                                  onClick={() => handleCancelWalletCharge(charge)}
                                  disabled={isCancelling || isRenewingLink}
                                >
                                  {isCancelling ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                                  {isCancelling ? "Cancelando..." : charge.metodo === "pix" ? "Cancelar cobrança Pix" : "Cancelar boleto"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-9 w-full shrink-0 rounded-full border-slate-300 bg-white px-4 text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 sm:w-auto"
                                  onClick={() => handleRenewWalletChargeLink(charge.id)}
                                  disabled={isRenewingLink || isCancelling}
                                >
                                  {isRenewingLink ? (
                                    <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Link2 className="mr-1.5 h-3.5 w-3.5" />
                                  )}
                                  {isRenewingLink ? "Gerando..." : generatedLink ? "Gerar outro link" : "Gerar novo link"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
            <Button variant="outline" className="h-10 w-full rounded-full border-slate-300 sm:w-auto" onClick={() => setShowWalletOpenChargesModal(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(walletChargePendingCancellation)}
        onOpenChange={(open) => {
          if (!open) setWalletChargePendingCancellation(null);
        }}
      >
        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-[440px] overflow-hidden rounded-[26px] border-slate-200 bg-white p-0 shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
          <div className="border-b border-red-100 bg-gradient-to-br from-red-50 via-white to-white px-5 py-5 sm:px-6">
            <AlertDialogHeader className="space-y-0 text-left">
              <div className="flex items-start gap-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-700">
                  <ShieldAlert className="h-5 w-5" />
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-red-700">Confirmação necessária</p>
                  <AlertDialogTitle className="mt-1 text-xl font-bold tracking-tight text-slate-950">
                    {walletChargePendingCancellation?.metodo === "pix" ? "Cancelar cobrança Pix?" : "Cancelar boleto?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="mt-2 text-xs leading-5 text-slate-600">
                    A solicitação será enviada ao Banco Inter e o link compartilhado deixará de aceitar pagamentos.
                  </AlertDialogDescription>
                </div>
              </div>
            </AlertDialogHeader>
          </div>

          <div className="space-y-4 px-5 py-5 sm:px-6">
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Forma</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {walletChargePendingCancellation?.metodo === "pix" ? "Pix" : "Boleto bancário"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Valor</p>
                <p className="mt-1 text-base font-bold text-slate-950">{formatCurrency(walletChargePendingCancellation?.valor)}</p>
              </div>
              <div className="col-span-2 border-t border-slate-200 pt-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Vencimento</p>
                <p className="mt-1 text-sm font-medium text-slate-700">
                  {formatWalletStatementDate(walletChargePendingCancellation?.data_vencimento)}
                </p>
              </div>
            </div>

            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
              O boleto e o Pix vinculado serão inutilizados. A cobrança continuará registrada no histórico com a situação cancelada.
            </p>
          </div>

          <AlertDialogFooter className="gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
            <AlertDialogCancel className="mt-0 h-10 rounded-full border-slate-300 bg-white px-5 text-slate-700">
              Manter cobrança
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-10 rounded-full bg-red-600 px-5 text-white hover:bg-red-700"
              onClick={confirmWalletChargeCancellation}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {walletChargePendingCancellation?.metodo === "pix" ? "Cancelar cobrança Pix" : "Cancelar boleto"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={showWalletOperationModal}
        onOpenChange={(open) => {
          setShowWalletOperationModal(open);
          if (!open) setWalletOperationError("");
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[760px] flex-col gap-0 overflow-hidden rounded-[26px] border-slate-200 bg-slate-50 p-0 shadow-[0_24px_80px_rgba(15,23,42,0.22)] sm:max-h-[90vh] sm:rounded-[30px]">
          <DialogHeader className="border-b border-slate-200 bg-gradient-to-br from-white via-white to-blue-50/70 px-5 py-5 pr-14 text-left sm:px-7 sm:py-6 sm:pr-16">
            <div className="flex items-start gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_8px_20px_rgba(15,23,42,0.2)]">
                <Pencil className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-xl tracking-tight text-slate-950 sm:text-2xl">{WALLET_OPERATION_MODAL_LABEL}</DialogTitle>
                <DialogDescription className="mt-1.5 max-w-xl text-xs leading-relaxed text-slate-600 sm:text-sm">
                  Registre uma entrada administrativa com justificativa e trilha de auditoria.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <section className="rounded-[22px] border border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <Wallet className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Carteira de destino</p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-slate-950">{walletOperationTargetAccount?.carteira_nome || "Selecione um responsável financeiro"}</p>
                  </div>
                  <Badge variant="outline" className="hidden rounded-full border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-600 sm:inline-flex">Entrada no saldo</Badge>
                </div>
                <Select
                  value={walletOperationForm.carteira_conta_id}
                  onValueChange={(value) => {
                    setWalletOperationError("");
                    setWalletOperationForm((prev) => ({ ...prev, carteira_conta_id: value }));
                  }}
                >
                  <SelectTrigger className="mt-3 h-11 rounded-xl border-slate-200 bg-slate-50 shadow-none">
                    <SelectValue placeholder="Selecione a carteira" />
                  </SelectTrigger>
                  <SelectContent>
                    {walletAccounts.filter((account) => account.has_wallet_account).map((account) => (
                      <SelectItem key={account.carteira_conta_id} value={account.carteira_conta_id}>
                        {account.carteira_nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </section>

              <section className="rounded-[22px] border border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950">Tipo de alteração</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Escolha como o lançamento aparecerá no extrato.</p>
                  </div>
                  <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-700 sm:hidden">Entrada</Badge>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {WALLET_MANUAL_OPERATION_OPTIONS
                    .filter((option) => option.value !== "credito_manual" || walletFlags.manualCreditEnabled)
                    .map((option) => {
                      const OptionIcon = option.icon;
                      const isActive = walletOperationForm.tipo === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`rounded-2xl border p-3 text-left transition ${isActive
                            ? option.activeClassName
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
                          onClick={() => {
                            setWalletOperationError("");
                            setWalletOperationForm((prev) => ({ ...prev, tipo: option.value, natureza: "entrada" }));
                          }}
                          aria-pressed={isActive}
                        >
                          <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${option.iconClassName}`}>
                            <OptionIcon className="h-4 w-4" />
                          </span>
                          <span className="mt-2 block text-xs font-semibold text-slate-900">{option.label}</span>
                          <span className="mt-1 block text-[10px] leading-relaxed text-slate-500">{option.helper}</span>
                        </button>
                      );
                    })}
                </div>

                <div className="mt-4">
                  <Label htmlFor="wallet-operation-amount" className="text-xs font-semibold text-slate-700">Valor da alteração *</Label>
                  <div className="relative mt-2">
                    <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-semibold text-slate-500">R$</span>
                    <Input
                      id="wallet-operation-amount"
                      className="h-12 rounded-xl border-slate-200 bg-slate-50 pl-12 text-lg font-semibold tracking-tight shadow-none focus-visible:bg-white"
                      value={walletOperationForm.valor}
                      onChange={(event) => {
                        setWalletOperationError("");
                        setWalletOperationForm((prev) => ({ ...prev, valor: event.target.value }));
                      }}
                      inputMode="decimal"
                      placeholder="0,00"
                    />
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Débitos de serviços não são lançados aqui; eles vêm dos agendamentos e planos vinculados.</p>
                </div>
              </section>

              <section className="rounded-[22px] border border-slate-200 bg-white p-4 sm:p-5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">Identificação e justificativa</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Estas informações ficam disponíveis no histórico da carteira.</p>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <Label htmlFor="wallet-operation-reference" className="text-xs font-semibold text-slate-700">Identificação no extrato *</Label>
                    <Input
                      id="wallet-operation-reference"
                      className="mt-2 h-11 rounded-xl border-slate-200 bg-slate-50 shadow-none focus-visible:bg-white"
                      value={walletOperationForm.referencia_amigavel}
                      onChange={(event) => {
                        setWalletOperationError("");
                        setWalletOperationForm((prev) => ({ ...prev, referencia_amigavel: event.target.value }));
                      }}
                      placeholder="Ex.: Crédito autorizado pela gerência"
                    />
                  </div>

                  <div>
                    <Label htmlFor="wallet-operation-reason" className="text-xs font-semibold text-slate-700">Motivo *</Label>
                    <Textarea
                      id="wallet-operation-reason"
                      className="mt-2 min-h-[88px] resize-none rounded-xl border-slate-200 bg-slate-50 shadow-none focus-visible:bg-white"
                      rows={3}
                      value={walletOperationForm.motivo}
                      onChange={(event) => {
                        setWalletOperationError("");
                        setWalletOperationForm((prev) => ({ ...prev, motivo: event.target.value }));
                      }}
                      placeholder="Explique por que esta alteração está sendo registrada"
                    />
                  </div>

                  <div>
                    <Label htmlFor="wallet-operation-note" className="text-xs font-semibold text-slate-700">Observação <span className="font-normal text-slate-400">(opcional)</span></Label>
                    <Textarea
                      id="wallet-operation-note"
                      className="mt-2 min-h-[72px] resize-none rounded-xl border-slate-200 bg-slate-50 shadow-none focus-visible:bg-white"
                      rows={2}
                      value={walletOperationForm.observacao}
                      onChange={(event) => setWalletOperationForm((prev) => ({ ...prev, observacao: event.target.value }))}
                      placeholder="Informações complementares para a equipe financeira"
                    />
                  </div>
                </div>
              </section>

              <details className="group rounded-[22px] border border-slate-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-xs font-semibold text-slate-700 sm:px-5">
                  Rastreabilidade técnica
                  <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="grid gap-4 border-t border-slate-100 px-4 py-4 sm:grid-cols-2 sm:px-5">
                  <div>
                    <Label htmlFor="wallet-operation-origin" className="text-xs text-slate-600">Origem</Label>
                    <Input
                      id="wallet-operation-origin"
                      className="mt-2 h-10 rounded-xl border-slate-200 bg-slate-50 text-xs shadow-none"
                      value={walletOperationForm.origem}
                      onChange={(event) => setWalletOperationForm((prev) => ({ ...prev, origem: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="wallet-operation-transaction" className="text-xs text-slate-600">Transação de origem</Label>
                    <Input
                      id="wallet-operation-transaction"
                      className="mt-2 h-10 rounded-xl border-slate-200 bg-slate-50 text-xs shadow-none"
                      value={walletOperationForm.transacao_id}
                      onChange={(event) => setWalletOperationForm((prev) => ({ ...prev, transacao_id: event.target.value }))}
                      placeholder="Opcional"
                    />
                  </div>
                </div>
              </details>

              <div className="flex flex-col gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-xs text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex min-w-0 items-center gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="truncate">Registrado por {currentUser?.full_name || currentUser?.name || currentUser?.email || "Sessão atual"}</span>
                </span>
                <span className="shrink-0 text-slate-400">{new Date().toLocaleString("pt-BR")}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
            {walletOperationError ? (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800" role="alert" aria-live="polite">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{walletOperationError}</span>
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" className="h-10 w-full rounded-full border-slate-300 sm:w-auto" onClick={() => setShowWalletOperationModal(false)} disabled={walletSaving}>
                Cancelar
              </Button>
              <Button className="h-10 w-full rounded-full bg-blue-600 px-5 text-white hover:bg-blue-700 sm:w-auto" onClick={handleWalletOperationSave} disabled={walletSaving}>
                {walletSaving ? (
                  <>
                    <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  "Confirmar alteração"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showWalletReversalModal} onOpenChange={setShowWalletReversalModal}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-[760px] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Estorno operacional do novo financeiro</DialogTitle>
            <DialogDescription>
              Fluxo visual dedicado de estorno, separado do pagamento, já alinhado ao contrato do Payment V2 sem abrir ativação operacional.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(90vh-180px)] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Responsável financeiro / cliente *</Label>
              <Select
                value={walletReversalForm.carteira_conta_id}
                onValueChange={(value) =>
                  setWalletReversalForm((prev) => ({
                    ...prev,
                    carteira_conta_id: value,
                    appointment_id: "",
                    serviceprovided_id: "",
                    obrigacao_id: "",
                    cobranca_financeira_id: "",
                    conta_receber_id: "",
                  }))
                }
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Selecione a carteira do responsável" />
                </SelectTrigger>
                <SelectContent>
                  {walletAccounts.filter((account) => account.has_wallet_account).map((account) => (
                    <SelectItem key={account.carteira_conta_id} value={account.carteira_conta_id}>
                      {account.carteira_nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>O que será estornado? *</Label>
              <Select value={walletReversalForm.reversao_tipo} onValueChange={handleWalletReversalTypeChange}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="saldo">Saldo</SelectItem>
                  <SelectItem value="servico">Serviço</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Usuário executor</Label>
              <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
                {currentUser?.full_name || currentUser?.name || currentUser?.email || "Sessão atual"}
              </div>
            </div>

            {walletReversalForm.reversao_tipo === "saldo" ? (
              <div>
                <Label>Valor do estorno *</Label>
                <Input
                  className="mt-2"
                  value={walletReversalForm.valor}
                  onChange={(event) => setWalletReversalForm((prev) => ({ ...prev, valor: event.target.value }))}
                  placeholder="0,00"
                />
              </div>
            ) : (
              <div className="md:col-span-2">
                <Label>Agendamento / serviço elegível *</Label>
                <Select
                  value={walletReversalForm.obrigacao_id}
                  onValueChange={handleWalletReversalServiceSelect}
                  disabled={!walletReversalForm.carteira_conta_id || walletReversalServiceOptions.length === 0}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Selecione o serviço que será estornado" />
                  </SelectTrigger>
                  <SelectContent>
                    {walletReversalServiceOptions.map((option) => (
                      <SelectItem key={option.key} value={option.obrigacao_id}>
                        {`${option.service_label} - ${option.dog_name} - ${formatCurrency(option.value)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedWalletReversalServiceOption ? (
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <p><span className="font-medium text-slate-900">Serviço:</span> {selectedWalletReversalServiceOption.service_label}</p>
                      <p><span className="font-medium text-slate-900">Cão:</span> {selectedWalletReversalServiceOption.dog_name}</p>
                      <p><span className="font-medium text-slate-900">Valor atual:</span> {formatCurrency(selectedWalletReversalServiceOption.value)}</p>
                      <p><span className="font-medium text-slate-900">Vencimento:</span> {selectedWalletReversalServiceOption.due_date ? new Date(`${selectedWalletReversalServiceOption.due_date}T00:00:00`).toLocaleDateString("pt-BR") : "—"}</p>
                    </div>
                    <p className="mt-2">{selectedWalletReversalServiceOption.helper}</p>
                  </div>
                ) : walletReversalForm.carteira_conta_id ? (
                  <p className="mt-2 text-sm text-slate-500">
                    {walletReversalServiceOptions.length === 0
                      ? "Nenhum serviço elegível foi encontrado para a carteira selecionada."
                      : "Selecione um serviço para carregar os detalhes do estorno."}
                  </p>
                ) : null}
              </div>
            )}

            <div className="md:col-span-2">
              <Label>Motivo do estorno *</Label>
              <Textarea
                className="mt-2"
                rows={4}
                value={walletReversalForm.motivo}
                onChange={(event) => setWalletReversalForm((prev) => ({ ...prev, motivo: event.target.value }))}
                placeholder="Explique o motivo do estorno em texto livre."
              />
            </div>

            <div className="md:col-span-2">
              <Label>Anexo obrigatório *</Label>
              <div className="mt-2 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <Input
                  type="file"
                  accept={REVERSAL_ATTACHMENT_ACCEPT}
                  onChange={(event) => handleWalletReversalAttachmentUpload(event.target.files?.[0])}
                  disabled={walletReversalUploading}
                />
                <p className="text-xs text-slate-500">
                  Tipos aceitos: pdf, doc, txt, img, jpg e png.
                </p>
                {walletReversalForm.attachment_path ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                      Anexo carregado
                    </Badge>
                    <span>{walletReversalForm.attachment_display_name || walletReversalForm.attachment_name}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full px-3 text-[11px] sm:text-sm"
                      onClick={() => handleOpenPrivateAttachment(walletReversalForm.attachment_path)}
                    >
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      Ver anexo
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <p className="text-sm font-medium text-slate-900">Confirmação final</p>
              <p className="mt-1 text-sm text-slate-500">
                Revise o tipo de estorno, o motivo e o anexo antes de registrar. Este fluxo continua pronto para futura ativação, mas permanece com rollback por flag preservado.
              </p>
              <div className="mt-4 flex items-start gap-3">
                <Checkbox
                  id="wallet-reversal-confirmation"
                  checked={walletReversalForm.confirmation_checked}
                  onCheckedChange={(checked) =>
                    setWalletReversalForm((prev) => ({ ...prev, confirmation_checked: Boolean(checked) }))
                  }
                />
                <Label htmlFor="wallet-reversal-confirmation" className="cursor-pointer text-sm font-normal leading-5 text-slate-600">
                  Confirmo que revisei cliente, tipo de estorno, motivo, anexo e impacto esperado no histórico financeiro.
                </Label>
              </div>
            </div>

            {!walletFlags.paymentV2ReversalEnabled ? (
              <div className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                A flag de estorno do Payment V2 segue desligada. O fluxo visual está pronto, mas o envio operacional permanece bloqueado até abertura formal de ativação.
              </div>
            ) : null}
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-slate-200 pt-4">
            <Button variant="outline" onClick={() => setShowWalletReversalModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleWalletReversalSave}
              disabled={walletReversalSaving || walletReversalUploading || !walletFlags.paymentV2ReversalEnabled}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {walletReversalSaving ? "Registrando..." : "Confirmar estorno"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


