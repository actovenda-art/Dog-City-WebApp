import React, { useEffect, useMemo, useState } from "react";
import {
  bancoInter,
  financePaymentV2ExecutionAudit,
  financePaymentV2Reverse,
  financePaymentV2ReversalAudit,
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
import { Checkbox } from "@/components/ui/checkbox";
import { DatePickerInput, DateRangePickerInput } from "@/components/common/DateTimeInputs";
import SearchFiltersToolbar from "@/components/common/SearchFiltersToolbar";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  ChevronLeft,
  ChevronDown,
  CheckCircle2,
  FileText,
  FileWarning,
  ListFilter,
  MoreHorizontal,
  Pencil,
  Plus,
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
import { isCommercialProfile, isManagerialProfile } from "@/lib/access-control";
import FinancialOperationalAlert from "@/components/finance/FinancialOperationalAlert";
import { buildFinancialOperationalStatusMap, getFinancialOperationalStatus } from "@/lib/finance-operational-status";
import { getInternalEntityReference } from "@/lib/entity-identifiers";
import { getAppointmentDateKey } from "@/lib/attendance";

const EMPTY_FORM = {
  data_hora_transacao: "",
  tipo: "entrada",
  nome_contraparte: "",
  valor: "",
  banco_contraparte: "",
  tipo_transacao_detalhado: "",
  referencia: "",
  observacoes: "",
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
const WALLET_OPERATION_MODAL_LABEL = "Alteração manual";

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

function resolveEventServiceLabel({ appointment, service, obrigacao, cobranca, fallback = "Serviço" }) {
  return appointment?.service_type
    || service?.service_type
    || service?.servico
    || obrigacao?.descricao
    || cobranca?.descricao
    || fallback;
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

  const directMatch = (transactions || []).find((transaction) =>
    buildWalletCreditTransactionCandidates(transaction).includes(targetReference),
  );
  if (directMatch) return directMatch;

  const nearestByAmount = (transactions || [])
    .filter((transaction) => String(transaction?.tipo || "").toLowerCase() === "entrada")
    .filter((transaction) => Math.abs(Number(transaction?.valor || 0) - Number(movement?.valor || 0)) < 0.009)
    .sort((left, right) => {
      const leftDate = Math.abs(new Date(left?.data_hora_transacao || left?.data_movimento || left?.data || 0).getTime() - new Date(movement?.created_date || 0).getTime());
      const rightDate = Math.abs(new Date(right?.data_hora_transacao || right?.data_movimento || right?.data || 0).getTime() - new Date(movement?.created_date || 0).getTime());
      return leftDate - rightDate;
    });

  return nearestByAmount[0] || null;
}

function resolveWalletCreditPaymentMethod({ movement, transaction }) {
  const normalizedTransaction = transaction ? normalizeMovement(transaction) : null;
  const method = normalizedTransaction?.tipoDetalhado && normalizedTransaction.tipoDetalhado !== "-"
    ? normalizedTransaction.tipoDetalhado
    : normalizedTransaction?.metodo;

  if (String(movement?.origem || "").trim() === "orcamento_pagamento_banco_inter") {
    return method ? `${method} via boleto bancário` : "Pix via boleto bancário";
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

function getWalletStatementDateTimestamp(value, fallback = 0) {
  const normalized = normalizeDateOnly(value);
  if (!normalized) return fallback;
  const parsed = new Date(`${normalized}T00:00:00`).getTime();
  return Number.isNaN(parsed) ? fallback : parsed;
}

function buildWalletChronologicalSettlement({
  debitRows = [],
  creditRows = [],
  walletAvailableBalance = 0,
}) {
  const officialAvailableBalance = roundWalletStatementAmount(Math.max(Number(walletAvailableBalance || 0), 0));
  const visibleCreditTotal = roundWalletStatementAmount(
    (creditRows || []).reduce((sum, row) => sum + Number(row?.amount || 0), 0),
  );
  const settlementBudget = roundWalletStatementAmount(Math.max(officialAvailableBalance, visibleCreditTotal));
  const canSimulateWithWalletCredits = settlementBudget > 0 || (creditRows || []).length > 0;

  let remainingBudget = settlementBudget;
  let openDebitTotal = 0;
  let settledDebitTotal = 0;
  let paidDebitCount = 0;
  let pendingDebitCount = 0;

  const debitRowsById = new Map();
  const debitsInChronologicalOrder = [...(debitRows || [])].sort((left, right) => {
    const leftAppointmentDate = getWalletStatementDateTimestamp(left?.appointmentDate || left?.dueDate);
    const rightAppointmentDate = getWalletStatementDateTimestamp(right?.appointmentDate || right?.dueDate);
    if (leftAppointmentDate !== rightAppointmentDate) {
      return leftAppointmentDate - rightAppointmentDate;
    }

    const leftDueDate = getWalletStatementDateTimestamp(left?.dueDate);
    const rightDueDate = getWalletStatementDateTimestamp(right?.dueDate);
    if (leftDueDate !== rightDueDate) {
      return leftDueDate - rightDueDate;
    }

    return String(left?.id || "").localeCompare(String(right?.id || ""));
  });

  debitsInChronologicalOrder.forEach((row) => {
    const amount = roundWalletStatementAmount(row?.amount || 0);
    const fallbackStatus = row?.paymentStatus || "pending";
    let paymentStatus = fallbackStatus;

    if (canSimulateWithWalletCredits) {
      if (amount <= 0) {
        paymentStatus = "paid";
      } else if (remainingBudget + 0.0001 >= amount) {
        paymentStatus = "paid";
        remainingBudget = roundWalletStatementAmount(remainingBudget - amount);
      } else {
        paymentStatus = "pending";
      }
    }

    if (paymentStatus === "paid") {
      paidDebitCount += 1;
      settledDebitTotal = roundWalletStatementAmount(settledDebitTotal + amount);
    } else {
      pendingDebitCount += 1;
      openDebitTotal = roundWalletStatementAmount(openDebitTotal + amount);
    }

    debitRowsById.set(row.id, {
      ...row,
      paymentStatus,
      settlementRule: canSimulateWithWalletCredits ? "wallet_chronological_full_only" : "source_status_fallback",
    });
  });

  return {
    debitRows: (debitRows || []).map((row) => debitRowsById.get(row.id) || row),
    availableBalance: officialAvailableBalance,
    creditTotal: visibleCreditTotal,
    openDebitTotal,
    settledDebitTotal,
    paidDebitCount,
    pendingDebitCount,
  };
}

function buildWalletStatementRows({
  walletId,
  walletAccountId,
  walletAvailableBalance = 0,
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
        dueDate: obrigacao?.due_date || charge?.due_date || receivable?.vencimento || null,
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
        dueDate: budget?.data_validade || recurringPackage?.vencimento_padrao || appointment?.data_referencia || null,
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

  const creditRowsFromWallet = (movements || [])
    .filter((movement) => movement?.carteira_conta_id === walletAccountId)
    .filter((movement) => String(movement?.natureza || "").toLowerCase() === "entrada")
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
      };
    });

  const existingCreditKeys = new Set(
    creditRowsFromWallet.flatMap((row) => [row?.transactionId, row?.transactionLookup, row?.movementId]).filter(Boolean),
  );

  const creditRowsFromBudgetPayments = (budgetPayments || [])
    .filter((row) => row?.carteira_id === walletId)
    .filter((row) => ["recebido", "pago"].includes(String(row?.status || "").toLowerCase()))
    .filter((row) => {
      const matchKey = row?.codigo_solicitacao || row?.txid || row?.id;
      return !existingCreditKeys.has(matchKey);
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
    netBalance: creditTotal - debitTotal,
    availableBalance: settlementSummary.availableBalance,
    openDebitTotal: settlementSummary.openDebitTotal,
    settledDebitTotal: settlementSummary.settledDebitTotal,
    paidDebitCount: settlementSummary.paidDebitCount,
    pendingDebitCount: settlementSummary.pendingDebitCount,
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
      <CardContent className="p-2.5 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500 sm:text-sm">{label}</p>
          {icon}
        </div>
        <p className={`mt-1.5 text-lg font-bold transition sm:mt-2 sm:text-2xl ${isBlurred ? "blur-[6px] opacity-50 select-none" : ""} ${valueClassName}`}>
          {value}
        </p>
        {helper ? <p className="mt-1.5 text-[11px] text-gray-500 sm:mt-2 sm:text-xs">{helper}</p> : null}
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);
  const [receiptLoadingId, setReceiptLoadingId] = useState(null);
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
  const [walletTimelineFilter, setWalletTimelineFilter] = useState("all");
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletActionMessage, setWalletActionMessage] = useState(null);
  const [showWalletOperationModal, setShowWalletOperationModal] = useState(false);
  const [walletOperationForm, setWalletOperationForm] = useState({ ...EMPTY_WALLET_OPERATION_FORM });
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

  const loadWalletMovements = async (walletAccountId, userProfile = currentUser) => {
    if (!walletFlags.movementsEnabled || !userProfile?.empresa_id || !walletAccountId) {
      setWalletRecentMovements([]);
      return;
    }

    setWalletLoading(true);
    try {
      const recentMovements = await financeWalletAdminReadMovements({
        empresa_id: userProfile.empresa_id,
        carteira_conta_id: walletAccountId,
        limit: 100,
      });
      setWalletRecentMovements(Array.isArray(recentMovements) ? recentMovements : []);
    } catch (error) {
      console.warn("Não foi possível carregar os movimentos administrativos da carteira:", error);
      setWalletRecentMovements([]);
    } finally {
      setWalletLoading(false);
    }
  };

  const loadWalletOperationalHistory = async ({ walletAccountId, walletId } = {}, userProfile = currentUser) => {
    if (!userProfile?.empresa_id || (!walletAccountId && !walletId)) {
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
      return;
    }

    setWalletHistoryLoading(true);
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
    } catch (error) {
      console.warn("Não foi possível carregar a trilha operacional do Payment/Estorno V2:", error);
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
    } finally {
      setWalletHistoryLoading(false);
    }
  };

  const selectedWalletAccount = walletAccounts.find((item) => item.carteira_selection_id === selectedWalletAccountId) || null;
  const selectedWalletRuntimeAccountId = selectedWalletAccount?.carteira_conta_id || "";
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
    if (!currentUser?.empresa_id) return;
    if (!walletFlags.movementsEnabled) return;
    if (!selectedWalletRuntimeAccountId) {
      setWalletRecentMovements([]);
      return;
    }
    loadWalletMovements(selectedWalletRuntimeAccountId, currentUser);
  }, [currentUser?.empresa_id, selectedWalletRuntimeAccountId, walletFlags.movementsEnabled]);

  useEffect(() => {
    if (!currentUser?.empresa_id || !selectedWalletAccount?.carteira_id) {
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
      return;
    }
    loadWalletOperationalHistory({
      walletAccountId: selectedWalletRuntimeAccountId,
      walletId: selectedWalletAccount?.carteira_id || null,
    }, currentUser);
  }, [currentUser?.empresa_id, selectedWalletRuntimeAccountId, selectedWalletAccount?.carteira_id]);

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
  const selectedWalletAudit = walletAuditRows.find((item) => item.carteira_conta_id === selectedWalletRuntimeAccountId) || null;
  const walletFinancialStatusMap = useMemo(
    () => buildFinancialOperationalStatusMap(walletReceivables),
    [walletReceivables],
  );
  const selectedWalletFinancialStatus = useMemo(
    () => getFinancialOperationalStatus(walletFinancialStatusMap, selectedWalletAccount?.carteira_id || null),
    [selectedWalletAccount?.carteira_id, walletFinancialStatusMap],
  );
  const walletStatementRows = useMemo(
    () => buildWalletStatementRows({
      walletId: selectedWalletAccount?.carteira_id || null,
      walletAccountId: selectedWalletRuntimeAccountId,
      walletAvailableBalance: Number(selectedWalletAccount?.saldo_atual || 0),
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
    const effectiveBalance = Number.isFinite(Number(walletStatementRows?.availableBalance))
      ? Number(walletStatementRows.availableBalance)
      : Number(selectedWalletAccount?.saldo_atual || 0);

    return {
      rowCount: rows.length,
      latestDate,
      effectiveBalance,
      openDebitTotal: Number(walletStatementRows?.openDebitTotal || 0),
      paidDebitCount: Number(walletStatementRows?.paidDebitCount || 0),
      pendingDebitCount: Number(walletStatementRows?.pendingDebitCount || 0),
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
          categoryLabel: row.referenceType === "pacote" ? "Pacote recorrente" : "Avulso",
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
              : [{ label: "PENDENTE", tone: "amber" }],
          appointmentId: row.appointmentId || null,
          referenceId: row.referenceId || null,
          referenceCode: row.referenceCode || null,
          referenceLabel: row.referenceLabel || null,
          transactionRow: null,
          details: {
            data: formatWalletStatementDate(row.primaryDate),
            vencimento: formatWalletStatementDate(row.dueDate),
            executor: reversalEvent?.details?.executor || "—",
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
        referenceCode: null,
        referenceLabel: null,
        transactionRow: row,
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
          referenceCode: null,
          referenceLabel: null,
          transactionRow: null,
          details: {
            data: event.eventDate ? new Date(event.eventDate).toLocaleDateString("pt-BR") : "—",
            executor: event?.details?.executor || "—",
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
    if (!walletOperationForm.carteira_conta_id || !walletOperationForm.valor || !walletOperationForm.referencia_amigavel.trim() || !walletOperationForm.motivo.trim()) {
      alert("Selecione a carteira e preencha valor, referência e motivo.");
      return;
    }

    if (walletOperationForm.natureza !== "entrada") {
      alert("Essa operação deve usar natureza de entrada.");
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
      setWalletActionMessage({
        type: "error",
        message: error?.message || "Não foi possível registrar a operação da carteira.",
      });
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

  const openModal = (item = null) => {
    if (item) {
      const normalized = normalizeMovement(item);
      setEditingItem(normalized);
      setFormData({
        data_hora_transacao: toDateInputValue(normalized.dataHora || normalized.data_movimento || normalized.data),
        tipo: normalized.tipo || "entrada",
        nome_contraparte: normalized.contraparte || "",
        valor: normalized.valor?.toString() || "",
        banco_contraparte: normalized.bancoContraparte === "-" ? "" : normalized.bancoContraparte || "",
        tipo_transacao_detalhado: normalized.tipoDetalhado === "-" ? "" : normalized.tipoDetalhado || "",
        referencia: normalized.referenciaFinanceira === "-" ? "" : normalized.referenciaFinanceira || "",
        observacoes: normalized.observacoesFinanceiras || "",
      });
    } else {
      setEditingItem(null);
      setFormData({ ...EMPTY_FORM });
    }

    setShowModal(true);
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
          await ExtratoBancario.update(editingItem.id, {
            observacoes: formData.observacoes.trim() || null,
          });
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

      if (!data?.base64) {
        throw new Error("A API do banco não retornou um PDF para este comprovante.");
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

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-6xl">
        {!(walletOnly && selectedWalletAccount) ? (
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                {walletOnly ? "Carteiras dos responsáveis financeiros" : "Transações"}
              </h1>
              {walletOnly ? (
                <p className="mt-1 text-sm text-slate-500">
                  Consulte a carteira e o extrato de cada responsável financeiro em uma página dedicada do Financeiro, separada do extrato operacional da empresa.
                </p>
              ) : null}
            </div>

            {!walletOnly ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={refreshMovements} disabled={isRefreshing} className="h-9 rounded-full px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""} sm:mr-2 sm:h-4 sm:w-4`} />
                  {isRefreshing ? "Atualizando..." : "Atualizar extrato"}
                </Button>
                <Button onClick={() => openModal()} className="h-9 rounded-full bg-blue-600 px-3 text-xs text-white hover:bg-blue-700 sm:h-10 sm:px-4 sm:text-sm">
                  <Plus className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                  Nova movimentação manual
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {!walletOnly && refreshResult && (
          <Card className={`mb-6 ${refreshResult.success ? "border-blue-200 bg-blue-50" : "border-red-200 bg-red-50"}`}>
            <CardContent className="p-4">
              <p className={`font-semibold ${refreshResult.success ? "text-blue-900" : "text-red-900"}`}>
                {refreshResult.message}
              </p>
              {refreshResult.success && (
                <div className="mt-1 space-y-1 text-sm text-blue-800">
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
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
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
            icon={<Wallet className={`h-5 w-5 ${hasOfficialBalance ? (saldoAtual >= 0 ? "text-blue-500" : "text-red-500") : "text-slate-400"}`} />}
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

        {walletOnly && walletReadEnabled ? (
          <Card className="mb-6 border-slate-200 bg-white">
            <CardContent className="space-y-4 p-4 sm:p-5">
              {!selectedWalletAccount ? (
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Carteira do responsável financeiro</h2>
                    <Badge variant="outline">Leitura controlada</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {walletOnly
                      ? "Consulte o extrato do responsável financeiro, com débitos de consumo e créditos de pagamento vinculados à carteira do cliente."
                      : "Bloco administrativo temporário para auditoria de saldo e movimentos, sem substituir o fluxo principal."}
                  </p>
                </div>
              ) : null}

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
                <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="space-y-4">
                  <SearchFiltersToolbar
                    searchTerm={walletListSearchTerm}
                    onSearchChange={setWalletListSearchTerm}
                    searchPlaceholder="Buscar por responsável financeiro, cães vinculados ou situação..."
                    hasActiveFilters={Boolean(walletListSearchTerm)}
                    onClear={() => setWalletListSearchTerm("")}
                  />

                  {filteredWalletAccounts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                      {walletAccounts.length === 0
                        ? "Nenhum responsável financeiro foi encontrado para esta unidade."
                        : "Nenhuma carteira corresponde ao filtro informado."}
                    </div>
                  ) : (
                    <Card className="overflow-hidden border-slate-200 bg-white">
                      <div className="hidden border-b border-slate-200 bg-slate-50 px-4 py-3 lg:grid lg:grid-cols-[minmax(0,1.2fr)_140px_180px_minmax(0,1.4fr)_32px] lg:gap-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Nome do responsável</p>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Vencimento padrão</p>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Situação da carteira</p>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Cães vinculados à carteira</p>
                        <span />
                      </div>
                      <div className="divide-y divide-slate-100">
                        {filteredWalletAccounts.map((account) => (
                          <button
                            key={account.carteira_selection_id}
                            type="button"
                            onClick={() => setSelectedWalletAccountId(account.carteira_selection_id)}
                            className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-slate-50 lg:grid-cols-[minmax(0,1.2fr)_140px_180px_minmax(0,1.4fr)_32px] lg:items-center lg:gap-4"
                          >
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Nome do responsável</p>
                              <p className="truncate text-sm font-semibold text-slate-900">{account.carteira_nome}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Vencimento padrão</p>
                              <p className="text-sm text-slate-700">
                                {account.carteira_vencimento_padrao ? `Dia ${account.carteira_vencimento_padrao}` : "Não informado"}
                              </p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Situação da carteira</p>
                              <Badge
                                variant="outline"
                                className={account.financial_status_tone === "irregular"
                                  ? "border-red-200 bg-red-50 text-red-700"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-700"}
                              >
                                {account.financial_status_tone === "irregular" ? "Irregular" : "Regular"}
                              </Badge>
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Cães vinculados à carteira</p>
                              <p className="text-sm text-slate-700">
                                {account.linked_dog_labels?.length
                                  ? account.linked_dog_labels.join(", ")
                                  : "Nenhum cão vinculado"}
                              </p>
                            </div>
                            <div className="justify-self-end text-slate-400">
                              <MoreHorizontal className="h-4 w-4" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </Card>
                  )}
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-5xl rounded-[32px] border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/70 sm:p-6">
                  <div className="space-y-4">
                  <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedWalletAccountId("")}
                      className="h-9 rounded-full px-3 text-xs sm:text-sm"
                    >
                      <ChevronLeft className="mr-1.5 h-3.5 w-3.5" />
                      Voltar para a lista
                    </Button>
                    <div className="min-w-0 flex-1 sm:text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Carteira do responsável financeiro</p>
                      <p className="truncate text-lg font-semibold text-slate-900">{selectedWalletAccount.carteira_nome}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Carteira financeira</p>
                            <p className="text-2xl font-bold text-slate-900">{formatCurrency(walletStatementSummary.effectiveBalance)}</p>
                            <p className="text-sm text-slate-500">
                              {walletStatementSummary.rowCount > 0
                                ? walletStatementSummary.openDebitTotal > 0
                                  ? `Saldo disponível na carteira após a quitação cronológica. Débitos ainda em aberto: ${formatCurrency(walletStatementSummary.openDebitTotal)}.`
                                  : `Saldo disponível na carteira após quitar ${walletStatementSummary.paidDebitCount} lançamento(s) em ordem cronológica.`
                                : "Sem lançamentos na carteira até o momento."}
                            </p>
                          </div>
                          <div className="min-w-[180px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Situação</p>
                            <p
                              className={`mt-2 text-sm font-semibold ${
                                selectedWalletFinancialStatus?.tone === "irregular" ? "text-red-700" : "text-emerald-700"
                              }`}
                            >
                              {selectedWalletFinancialStatus?.tone === "irregular" ? "IRREGULAR" : "REGULAR"}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {walletStatementSummary.latestDate
                                ? `Último lançamento em ${formatWalletStatementDate(walletStatementSummary.latestDate)}.`
                                : "Aguardando primeiro lançamento."}
                            </p>
                          </div>
                        </div>
                        {selectedWalletFinancialStatus?.tone === "irregular" ? (
                          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                            Regularize os débitos em aberto.
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="font-semibold text-slate-900">Ações da carteira</h3>
                            <p className="mt-1 text-sm text-slate-500">
                              Atualize a leitura e registre alterações manuais sem sair da visualização individual.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              onClick={() => loadWalletAdminData(currentUser, selectedWalletAccountId)}
                              disabled={walletLoading}
                              className="h-9 w-9 rounded-full p-0"
                              title="Atualizar"
                              aria-label="Atualizar"
                            >
                              <RefreshCw className={`h-4 w-4 ${walletLoading ? "animate-spin" : ""}`} />
                            </Button>
                            {walletFlags.manualAdjustmentsEnabled && canManageWalletOperations ? (
                              <Button
                                variant="outline"
                                onClick={() => openWalletOperationModal("credito_manual")}
                                disabled={!selectedWalletRuntimeAccountId}
                                className="h-9 rounded-full px-3 text-xs sm:text-sm"
                              >
                                Alteração manual
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {!selectedWalletAccount.has_wallet_account ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                          Este responsável financeiro ainda não possui uma conta operacional de carteira vinculada. A leitura do extrato V2 e as ações de carteira aparecem automaticamente assim que a conta estiver disponível no financeiro.
                        </div>
                      ) : null}

                      {walletFlags.movementsEnabled ? (
                        <div className="space-y-4">
                          <div className="rounded-2xl border border-slate-200 bg-white">
                            <div className="border-b border-slate-100 px-4 py-3">
                              <h3 className="font-semibold text-slate-900">Extrato do responsável financeiro</h3>
                              <p className="mt-1 text-sm text-slate-500">
                                Um feed cronológico com transações, atividades e estornos vinculados à carteira do responsável financeiro.
                              </p>
                            </div>
                            <div className="space-y-4 p-4">
                              <div className="flex flex-wrap gap-2">
                                {[
                                  { value: "all", label: "Todos" },
                                  { value: "transactions", label: "Transações" },
                                  { value: "activities", label: "Atividades" },
                                ].map((filter) => (
                                  <Button
                                    key={filter.value}
                                    type="button"
                                    variant={walletTimelineFilter === filter.value ? "default" : "outline"}
                                    className={`h-9 rounded-full px-4 text-xs sm:text-sm ${
                                      walletTimelineFilter === filter.value ? "bg-slate-900 text-white hover:bg-slate-800" : ""
                                    }`}
                                    onClick={() => setWalletTimelineFilter(filter.value)}
                                  >
                                    {filter.label}
                                  </Button>
                                ))}
                              </div>

                              {filteredWalletTimelineRows.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                                  Nenhum lançamento foi encontrado para o filtro selecionado.
                                </div>
                              ) : (
                                <div className="relative pl-6">
                                  <div className="absolute bottom-0 left-2 top-0 w-px bg-slate-200" />
                                  <div className="space-y-4">
                                    {filteredWalletTimelineRows.map((row) => (
                                      <div key={row.id} className="relative">
                                        <div className={`absolute -left-[1.45rem] top-5 h-3 w-3 rounded-full border-2 border-white ${getWalletTimelineDotClass(row)}`} />
                                        <details className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                                          <summary className="cursor-pointer list-none px-4 py-4 hover:bg-slate-50">
                                            <div>
                                              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                <div className="min-w-0 space-y-2">
                                                  <div className="flex flex-wrap items-center gap-2">
                                                    <p className="text-base font-semibold text-slate-900">{row.title}</p>
                                                    {row.badges.map((badge) => (
                                                      <Badge
                                                        key={`${row.id}-${badge.label}`}
                                                        variant="outline"
                                                        className={badge.tone === "red"
                                                          ? "border-red-200 bg-red-50 text-red-700"
                                                          : badge.tone === "amber"
                                                            ? "border-amber-200 bg-amber-50 text-amber-700"
                                                            : "border-emerald-200 bg-emerald-50 text-emerald-700"}
                                                      >
                                                        {badge.label}
                                                      </Badge>
                                                    ))}
                                                  </div>
                                                  <p className="text-sm text-slate-600">{row.subtitle}</p>
                                                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{row.categoryLabel}</p>
                                                </div>
                                                <div className="text-left md:text-right">
                                                  <p className={`text-base font-semibold ${
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
                                                  <p className="mt-1 text-sm text-slate-500">{formatWalletStatementDate(row.primaryDate)}</p>
                                                </div>
                                              </div>
                                            </div>
                                          </summary>

                                          <div className="border-t border-slate-100 bg-slate-50 px-4 py-4">
                                            <div className="grid grid-cols-1 gap-3 text-sm text-slate-600 md:grid-cols-2">
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
                                                  <p><span className="font-medium text-slate-900">Executor:</span> {row.details.executor || "—"}</p>
                                                </>
                                              )}
                                              {row.details.motivo ? (
                                                <p className="md:col-span-2"><span className="font-medium text-slate-900">Motivo:</span> {row.details.motivo}</p>
                                              ) : null}
                                              {row.details.anexo ? (
                                                <p className="md:col-span-2"><span className="font-medium text-slate-900">Anexo:</span> {row.details.anexo}</p>
                                              ) : null}
                                            </div>

                                            <div className="mt-4 flex flex-wrap gap-2">
                                              {row.appointmentId ? (
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-8 rounded-full px-3 text-[11px] sm:text-sm"
                                                  onClick={() => openWalletStatementAppointment(row.appointmentId)}
                                                >
                                                  Abrir agendamento
                                                </Button>
                                              ) : null}
                                              {row.referenceId && row.referenceCode ? (
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-8 rounded-full px-3 text-[11px] sm:text-sm"
                                                  onClick={() => openWalletStatementReference(row)}
                                                >
                                                  Abrir {row.referenceLabel?.toLowerCase() || "referência"} {row.referenceCode}
                                                </Button>
                                              ) : null}
                                              {row.sourceKind === "transaction" && row.transactionRow ? (
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-8 rounded-full px-3 text-[11px] sm:text-sm"
                                                  onClick={() => openWalletStatementTransaction(row.transactionRow)}
                                                >
                                                  Abrir transação
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
              </div>
              )}
            </CardContent>
          </Card>
        ) : walletOnly && walletFlagsLoaded ? (
          <Card className="mb-6 border-dashed border-slate-300 bg-white">
            <CardContent className="p-6 text-sm text-slate-500">
              A leitura administrativa de carteiras ainda está desligada por feature flag nesta unidade.
            </CardContent>
          </Card>
        ) : null}

        {!walletOnly ? (
          <>
            <Card className="mb-6 border-gray-200 bg-white">
              <CardContent className="p-3 sm:p-4">
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
                  searchInputClassName="h-9 text-[13px] sm:h-11 sm:text-sm"
                />
              </CardContent>
            </Card>

            <div className="space-y-3">
              {filtered.length === 0 ? (
                <Card className="border-gray-200 bg-white">
                  <CardContent className="p-12 text-center text-gray-500">
                    {isInitialLoading ? "Carregando movimentações..." : "Nenhuma movimentação encontrada."}
                  </CardContent>
                </Card>
              ) : (
                <>
                  {visibleMovements.map((movement) => (
                  <Card key={movement.id} className="border-gray-200 bg-white">
                <CardContent className="flex flex-col gap-3 p-3 sm:gap-4 sm:p-4 lg:flex-row lg:items-center">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full sm:h-12 sm:w-12 ${movement.tipo === "entrada" ? "bg-green-100" : "bg-red-100"}`}>
                    {movement.tipo === "entrada" ? (
                      <ArrowUpCircle className="h-5 w-5 text-green-600 sm:h-6 sm:w-6" />
                    ) : (
                      <ArrowDownCircle className="h-5 w-5 text-red-600 sm:h-6 sm:w-6" />
                    )}
                  </div>

                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Titular da contraparte</p>
                        <p className="mt-1 font-semibold text-gray-900">{movement.contraparte}</p>
                        <p className="mt-1 text-xs text-gray-500">{movement.direcaoLabel}</p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Método</p>
                        <p className="mt-1 font-medium text-gray-900">{movement.metodo}</p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Data da transação</p>
                        <p className="mt-1 font-medium text-gray-900">{formatMovementDateTime(movement)}</p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Valor</p>
                        <p className={`mt-1 text-lg font-bold ${movement.tipo === "entrada" ? "text-green-600" : "text-red-600"}`}>
                          {movement.tipo === "entrada" ? "+" : "-"}
                          {formatCurrency(Math.abs(movement.valor || 0))}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-sm">
                      <Badge className={movement.tipo === "entrada" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                        {movement.tipoDetalhado || movement.direcaoLabel}
                      </Badge>
                      <Badge className="bg-blue-100 text-blue-700">{movement.metodo}</Badge>
                      {movement.bancoContraparte && movement.bancoContraparte !== "-" && (
                        <Badge className="bg-gray-100 text-gray-700">{movement.bancoContraparte}</Badge>
                      )}
                      {movement.apiLocked ? (
                        <Badge variant="outline">Origem API</Badge>
                      ) : (
                        <Badge variant="outline">Manual</Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {walletOnly && walletFlags.movementsEnabled && canManageWalletOperations && movement.tipo === "entrada" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full px-3 text-[11px] sm:h-9 sm:text-sm"
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
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full px-3 text-[11px] sm:h-9 sm:text-sm"
                      onClick={() => handleViewReceipt(movement)}
                      disabled={!movement.apiLocked || receiptLoadingId === movement.id}
                    >
                      <FileText className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                      {receiptLoadingId === movement.id ? "Carregando..." : "Ver comprovante"}
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 rounded-full px-3 text-[11px] sm:h-9 sm:text-sm" onClick={() => openModal(movement)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                      {movement.apiLocked ? "Complementar" : "Editar"}
                    </Button>
                    {!movement.apiLocked && (
                      <Button variant="outline" size="sm" className="h-8 rounded-full px-3 text-[11px] text-red-600 sm:h-9 sm:text-sm" onClick={() => handleDelete(movement)}>
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
                      <CardContent className="flex flex-col items-center gap-3 p-5 text-center">
                        <p className="text-sm text-gray-500">
                          Exibindo {visibleMovements.length} de {filtered.length} movimentações encontradas.
                        </p>
                        <Button
                          variant="outline"
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

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-[720px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar movimentação" : "Nova movimentação manual"}</DialogTitle>
            <DialogDescription>
              {editingItem?.apiLocked
                ? "Lançamentos vindos da API oficial ficam bloqueados. Aqui você adiciona apenas observações complementares."
                : "Ajuste manualmente os dados financeiros exibidos na sessão de transações."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
            <div>
              <Label>Data *</Label>
              <DatePickerInput
                className="mt-2"
                value={formData.data_hora_transacao}
                onChange={(value) => setFormData((prev) => ({ ...prev, data_hora_transacao: value }))}
                disabled={editingItem?.apiLocked}
              />
            </div>

            <div>
              <Label>Tipo *</Label>
              <Select
                value={formData.tipo}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, tipo: value }))}
                disabled={editingItem?.apiLocked}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Remetente / Recebedor *</Label>
              <Input
                className="mt-2"
                value={formData.nome_contraparte}
                onChange={(event) => setFormData((prev) => ({ ...prev, nome_contraparte: event.target.value }))}
                disabled={editingItem?.apiLocked}
              />
            </div>

            <div>
              <Label>Valor *</Label>
              <Input
                className="mt-2"
                value={formData.valor}
                onChange={(event) => setFormData((prev) => ({ ...prev, valor: event.target.value }))}
                placeholder="0,00"
                disabled={editingItem?.apiLocked}
              />
            </div>

            <div>
              <Label>Banco da contraparte</Label>
              <Input
                className="mt-2"
                value={formData.banco_contraparte}
                onChange={(event) => setFormData((prev) => ({ ...prev, banco_contraparte: event.target.value }))}
                disabled={editingItem?.apiLocked}
              />
            </div>

            <div>
              <Label>Tipo da transação</Label>
              <Input
                className="mt-2"
                value={formData.tipo_transacao_detalhado}
                onChange={(event) => setFormData((prev) => ({ ...prev, tipo_transacao_detalhado: event.target.value }))}
                placeholder="PIX, TED, boleto..."
                disabled={editingItem?.apiLocked}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Transao ID</Label>
              <Input
                className="mt-2"
                value={formData.referencia}
                onChange={(event) => setFormData((prev) => ({ ...prev, referencia: event.target.value }))}
                disabled={editingItem?.apiLocked}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Textarea
                className="mt-2"
                rows={4}
                value={formData.observacoes}
                onChange={(event) => setFormData((prev) => ({ ...prev, observacoes: event.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Salvando..." : editingItem?.apiLocked ? "Salvar complemento" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWalletOperationModal} onOpenChange={setShowWalletOperationModal}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-[720px] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{WALLET_OPERATION_MODAL_LABEL}</DialogTitle>
            <DialogDescription>
              Registre créditos, ajustes ou estornos manuais diretamente no extrato da carteira do responsável financeiro.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(90vh-180px)] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Responsável financeiro destino *</Label>
              <Select
                value={walletOperationForm.carteira_conta_id}
                onValueChange={(value) => setWalletOperationForm((prev) => ({ ...prev, carteira_conta_id: value }))}
              >
                <SelectTrigger className="mt-2">
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
            </div>

            <div>
              <Label>Tipo *</Label>
              <Select
                value={walletOperationForm.tipo}
                onValueChange={(value) =>
                  setWalletOperationForm((prev) => ({
                    ...prev,
                    tipo: value,
                    natureza: "entrada",
                  }))
                }
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {walletFlags.manualCreditEnabled ? (
                    <SelectItem value="credito_manual">Crédito manual</SelectItem>
                  ) : null}
                  <SelectItem value="ajuste_manual">Ajuste manual</SelectItem>
                  <SelectItem value="estorno_manual">Estorno manual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Natureza</Label>
              <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
                Entrada
              </div>
            </div>

            <div>
              <Label>Valor *</Label>
              <Input
                className="mt-2"
                value={walletOperationForm.valor}
                onChange={(event) => setWalletOperationForm((prev) => ({ ...prev, valor: event.target.value }))}
                placeholder="0,00"
              />
            </div>

            <div>
              <Label>Origem *</Label>
              <Input
                className="mt-2"
                value={walletOperationForm.origem}
                onChange={(event) => setWalletOperationForm((prev) => ({ ...prev, origem: event.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Referência amigável *</Label>
              <Input
                className="mt-2"
                value={walletOperationForm.referencia_amigavel}
                onChange={(event) => setWalletOperationForm((prev) => ({ ...prev, referencia_amigavel: event.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Motivo *</Label>
              <Input
                className="mt-2"
                value={walletOperationForm.motivo}
                onChange={(event) => setWalletOperationForm((prev) => ({ ...prev, motivo: event.target.value }))}
                placeholder="Explique por que essa movimentação está sendo registrada"
              />
            </div>

            <div className="md:col-span-2">
              <Label>Observação</Label>
              <Textarea
                className="mt-2"
                rows={3}
                value={walletOperationForm.observacao}
                onChange={(event) => setWalletOperationForm((prev) => ({ ...prev, observacao: event.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Transação de origem</Label>
              <Input
                className="mt-2"
                value={walletOperationForm.transacao_id}
                onChange={(event) => setWalletOperationForm((prev) => ({ ...prev, transacao_id: event.target.value }))}
                placeholder="Opcional, para direcionamento ou rastreabilidade"
              />
            </div>

            <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p><span className="font-medium text-slate-900">Usuário:</span> {currentUser?.full_name || currentUser?.name || currentUser?.email || "Sessão atual"}</p>
              <p className="mt-1"><span className="font-medium text-slate-900">Data/hora:</span> {new Date().toLocaleString("pt-BR")}</p>
            </div>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-slate-200 pt-4">
            <Button variant="outline" onClick={() => setShowWalletOperationModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleWalletOperationSave} disabled={walletSaving}>
              {walletSaving ? "Salvando..." : "Registrar movimento"}
            </Button>
          </DialogFooter>
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


