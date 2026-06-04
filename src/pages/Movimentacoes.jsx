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
  financeWalletReconcileAccount,
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
  CheckCircle2,
  ChevronDown,
  FileText,
  FileWarning,
  ListFilter,
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

function buildWalletStatementRows({
  walletAccountId,
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
}) {
  if (!walletAccountId) {
    return { debitRows: [], creditRows: [] };
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

  const debitRows = (obligations || [])
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
      const referenceCode = referenceRecord ? getInternalEntityReference(referenceRecord) : null;

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
      };
    })
    .sort((left, right) => {
      const leftDate = new Date(`${normalizeDateOnly(left?.appointmentDate || left?.dueDate) || "1970-01-01"}T00:00:00`).getTime();
      const rightDate = new Date(`${normalizeDateOnly(right?.appointmentDate || right?.dueDate) || "1970-01-01"}T00:00:00`).getTime();
      return rightDate - leftDate;
    });

  const creditRows = (movements || [])
    .filter((movement) => movement?.carteira_conta_id === walletAccountId)
    .filter((movement) => String(movement?.natureza || "").toLowerCase() === "entrada")
    .filter((movement) => String(movement?.tipo || "").trim() === "entrada_direcionada" || Boolean(movement?.transacao_id))
    .map((movement) => {
      const transaction = resolveWalletCreditTransaction({ movement, transactions });
      const normalizedTransaction = transaction ? normalizeMovement(transaction) : null;
      const transactionLookup = normalizedTransaction?.id || String(movement?.transacao_id || movement?.referencia_amigavel || "").trim() || null;

      return {
        id: `credit-${movement?.movimento_id}`,
        movementId: movement?.movimento_id || null,
        transactionId: normalizedTransaction?.id || null,
        transactionLookup,
        receivedDate: normalizedTransaction?.dataHora || normalizedTransaction?.data_movimento || normalizedTransaction?.data || movement?.created_date || null,
        counterparty: normalizedTransaction?.contraparte || movement?.descricao || movement?.referencia_amigavel || "Contraparte não informada",
        amount: Number(movement?.valor || 0),
        paymentMethod: resolveWalletCreditPaymentMethod({ movement, transaction }),
      };
    })
    .sort((left, right) => new Date(right?.receivedDate || 0).getTime() - new Date(left?.receivedDate || 0).getTime());

  return { debitRows, creditRows };
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

function buildWalletAdminAccounts(accounts = [], carteiras = []) {
  const normalizedAccounts = (accounts || []).map((account) => ({
    ...account,
    carteira_selection_id: account?.carteira_conta_id || `conta:${account?.carteira_id || account?.id || "wallet"}`,
    has_wallet_account: Boolean(account?.carteira_conta_id),
  }));

  const accountedCarteiraIds = new Set(
    normalizedAccounts
      .map((account) => account?.carteira_id || null)
      .filter(Boolean),
  );

  const virtualCarteiras = (carteiras || [])
    .filter((carteira) => carteira?.ativo !== false)
    .filter((carteira) => !accountedCarteiraIds.has(carteira?.id))
    .map((carteira) => ({
      carteira_selection_id: `virtual:${carteira?.id}`,
      carteira_conta_id: null,
      carteira_id: carteira?.id || null,
      carteira_nome: carteira?.nome_razao_social || carteira?.nome_fantasia || "Responsável financeiro",
      carteira_codigo: carteira?.cpf_cnpj || carteira?.celular || carteira?.email || null,
      saldo_atual: 0,
      movimento_count: 0,
      ultimo_movimento_em: null,
      latest_reconciliation_status: "sem_conta",
      has_wallet_account: false,
    }));

  return [...normalizedAccounts, ...virtualCarteiras].sort((left, right) =>
    String(left?.carteira_nome || "").localeCompare(String(right?.carteira_nome || ""), "pt-BR", { sensitivity: "base" }),
  );
}

export default function Movimentacoes({ walletOnly = false }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const appliedTransactionFilterRef = React.useRef(false);
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
  });
  const [selectedWalletAccountId, setSelectedWalletAccountId] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletHistoryLoading, setWalletHistoryLoading] = useState(false);
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
    if (walletOnly || appliedTransactionFilterRef.current) return;
    if (!walletTransactionFilter) return;
    setSearchTerm(walletTransactionFilter);
    appliedTransactionFilterRef.current = true;
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
    return nextFlags;
  };

  const loadWalletAdminData = async (userProfile = currentUser, preferredWalletAccountId = selectedWalletAccountId) => {
    if (!userProfile?.empresa_id) {
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
      });
      setSelectedWalletAccountId("");
      return;
    }

    setWalletLoading(true);
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

      const [accounts, auditRows, carteiras] = await Promise.all([
        financeWalletAdminReadAccounts({ empresa_id: userProfile.empresa_id }),
        nextFlags.balanceReadEnabled
          ? financeWalletAdminAuditAccounts({ empresa_id: userProfile.empresa_id })
          : Promise.resolve([]),
        readEntityCollection(Carteira, { sort: "nome_razao_social", pageSize: 500, maxRows: 2000 }),
      ]);

      const normalizedAccounts = buildWalletAdminAccounts(
        Array.isArray(accounts) ? accounts : [],
        Array.isArray(carteiras) ? carteiras : [],
      );
      setWalletAccounts(normalizedAccounts);
      setWalletAuditRows(Array.isArray(auditRows) ? auditRows : []);

      const nextSelectedWallet = normalizedAccounts.find((item) => item.carteira_selection_id === preferredWalletAccountId)
        || normalizedAccounts[0]
        || null;
      const nextSelectedWalletId = normalizedAccounts.some((item) => item.carteira_selection_id === preferredWalletAccountId)
        ? preferredWalletAccountId
        : (nextSelectedWallet?.carteira_selection_id || "");
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

  const loadWalletOperationalHistory = async (walletAccountId, userProfile = currentUser) => {
    if (!userProfile?.empresa_id || !walletAccountId) {
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
      });
      setWalletOperationalHistory([]);
      return;
    }

    setWalletHistoryLoading(true);
    try {
      const [executionRows, reversalRows, appointments, services, obligations, charges, accountsReceivable, dogs, budgets, recurringPackages, transactions] = await Promise.all([
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
      });
      setWalletOperationalHistory([]);
    } finally {
      setWalletHistoryLoading(false);
    }
  };

  const selectedWalletAccount = walletAccounts.find((item) => item.carteira_selection_id === selectedWalletAccountId) || null;
  const selectedWalletRuntimeAccountId = selectedWalletAccount?.carteira_conta_id || "";

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
    if (!currentUser?.empresa_id || !selectedWalletRuntimeAccountId) {
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
      });
      setWalletOperationalHistory([]);
      return;
    }
    loadWalletOperationalHistory(selectedWalletRuntimeAccountId, currentUser);
  }, [currentUser?.empresa_id, selectedWalletRuntimeAccountId]);

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
      walletAccountId: selectedWalletRuntimeAccountId,
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
    }),
    [
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
    ],
  );
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
    const defaultNatureza = tipo === "credito_manual" || tipo === "entrada_direcionada" ? "entrada" : "entrada";
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

    if (
      (walletOperationForm.tipo === "credito_manual" || walletOperationForm.tipo === "entrada_direcionada")
      && walletOperationForm.natureza !== "entrada"
    ) {
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
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              {walletOnly ? "Carteiras financeiras" : "Transações"}
            </h1>
            {walletOnly ? (
              <p className="mt-1 text-sm text-slate-500">
                Consulte o extrato e a trilha operacional de cada responsável financeiro em uma página dedicada do Financeiro.
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
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Carteira financeira</h2>
                    <Badge variant="outline">Leitura controlada</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {walletOnly
                      ? "Consulte o extrato administrativo e a trilha operacional de cada responsável financeiro em uma superfície dedicada do Financeiro."
                      : "Bloco administrativo temporário para auditoria de saldo e movimentos, sem substituir o fluxo principal."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => loadWalletAdminData(currentUser, selectedWalletAccountId)}
                    disabled={walletLoading}
                    className="h-9 rounded-full px-3 text-xs sm:text-sm"
                  >
                    <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${walletLoading ? "animate-spin" : ""}`} />
                    Atualizar carteira
                  </Button>
                  {canManageWalletOperations ? (
                    <Button
                      variant="outline"
                      onClick={() => openWalletReversalModal({ carteira_conta_id: selectedWalletRuntimeAccountId })}
                      disabled={!selectedWalletRuntimeAccountId}
                      className="h-9 rounded-full border-red-200 bg-red-50 px-3 text-xs text-red-700 hover:bg-red-100 sm:text-sm"
                    >
                      <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                      Novo estorno V2
                    </Button>
                  ) : null}
                  {walletFlags.manualAdjustmentsEnabled && canManageWalletOperations && (
                    <>
                      {walletFlags.manualCreditEnabled ? (
                        <Button
                          variant="outline"
                          onClick={() => openWalletOperationModal("credito_manual")}
                          className="h-9 rounded-full px-3 text-xs sm:text-sm"
                        >
                          Crédito manual
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        onClick={() => openWalletOperationModal("ajuste_manual")}
                        className="h-9 rounded-full px-3 text-xs sm:text-sm"
                      >
                        Ajuste manual
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => openWalletOperationModal("estorno_manual")}
                        className="h-9 rounded-full px-3 text-xs sm:text-sm"
                      >
                        Estorno manual
                      </Button>
                    </>
                  )}
                  {walletFlags.balanceReadEnabled && selectedWalletRuntimeAccountId && (
                    <Button
                      variant="outline"
                      onClick={handleWalletReconcile}
                      disabled={walletLoading}
                      className="h-9 rounded-full px-3 text-xs sm:text-sm"
                    >
                      Reconciliar
                    </Button>
                  )}
                </div>
              </div>

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

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <Label>Carteira selecionada</Label>
                    <Select value={selectedWalletAccountId || ""} onValueChange={setSelectedWalletAccountId}>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Selecione uma carteira" />
                      </SelectTrigger>
                      <SelectContent>
                        {walletAccounts.map((account) => (
                          <SelectItem key={account.carteira_selection_id} value={account.carteira_selection_id}>
                            {account.carteira_nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    {walletAccounts.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                        Nenhum responsável financeiro foi encontrado para esta unidade.
                      </div>
                    ) : (
                      walletAccounts.map((account) => {
                        const isSelected = account.carteira_selection_id === selectedWalletAccountId;
                        return (
                          <button
                            key={account.carteira_selection_id}
                            type="button"
                            onClick={() => setSelectedWalletAccountId(account.carteira_selection_id)}
                            className={`w-full rounded-2xl border p-4 text-left transition ${
                              isSelected
                                ? "border-blue-300 bg-blue-50"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-900">{account.carteira_nome}</p>
                                {account.carteira_codigo ? (
                                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                                    {account.carteira_codigo}
                                  </p>
                                ) : null}
                              </div>
                              <Badge variant={account.latest_reconciliation_status === "divergente" ? "destructive" : "outline"}>
                                {account.has_wallet_account
                                  ? (account.latest_reconciliation_status === "divergente" ? "Divergente" : "Auditável")
                                  : "Sem conta operacional"}
                              </Badge>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <p className="text-slate-500">Saldo atual</p>
                                <p className="mt-1 font-semibold text-slate-900">{formatCurrency(account.saldo_atual)}</p>
                              </div>
                              <div>
                                <p className="text-slate-500">Movimentos</p>
                                <p className="mt-1 font-semibold text-slate-900">{account.movimento_count || 0}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {selectedWalletAccount ? (
                    <>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <StatCard
                          label="Saldo da carteira"
                          value={formatCurrency(selectedWalletAccount.saldo_atual)}
                          className="border-blue-200"
                          valueClassName="text-blue-700"
                        />
                        <StatCard
                          label="Último movimento"
                          value={selectedWalletAccount.ultimo_movimento_em ? new Date(selectedWalletAccount.ultimo_movimento_em).toLocaleDateString("pt-BR") : "—"}
                          className="border-slate-200"
                          valueClassName="text-slate-900 text-base sm:text-lg"
                          helper={selectedWalletAccount.ultimo_movimento_em ? new Date(selectedWalletAccount.ultimo_movimento_em).toLocaleTimeString("pt-BR") : "Sem movimentos"}
                        />
                        <StatCard
                          label="Reconciliação"
                          value={selectedWalletAudit?.status === "divergente" ? "Divergente" : "OK"}
                          className={selectedWalletAudit?.status === "divergente" ? "border-amber-200" : "border-green-200"}
                          valueClassName={selectedWalletAudit?.status === "divergente" ? "text-amber-700 text-base sm:text-lg" : "text-green-700 text-base sm:text-lg"}
                          helper={selectedWalletAudit ? `Diferença: ${formatCurrency(selectedWalletAudit.diferenca_ultimo || 0)}` : "Sem auditoria detalhada carregada"}
                        />
                      </div>

                      <FinancialOperationalAlert
                        status={selectedWalletFinancialStatus}
                        title="Situação financeira do responsável"
                      />

                      {!selectedWalletAccount.has_wallet_account ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                          Este responsável financeiro ainda não possui uma conta operacional de carteira vinculada. A leitura do extrato V2 e as ações de carteira aparecem automaticamente assim que a conta estiver disponível no financeiro.
                        </div>
                      ) : null}

                      {walletFlags.movementsEnabled && selectedWalletAccount.has_wallet_account ? (
                        <div className="space-y-4">
                          <div className="rounded-2xl border border-slate-200 bg-white">
                            <div className="border-b border-slate-100 px-4 py-3">
                              <h3 className="font-semibold text-slate-900">Fluxo financeiro operacional</h3>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={walletFlags.paymentV2WriteEnabled
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-slate-200 bg-slate-50 text-slate-600"}
                                >
                                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                                  Payment V2 {walletFlags.paymentV2WriteEnabled ? "ativo" : "desligado"}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={walletFlags.paymentV2ReversalEnabled
                                    ? "border-red-200 bg-red-50 text-red-700"
                                    : "border-slate-200 bg-slate-50 text-slate-600"}
                                >
                                  <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                                  Estorno V2 {walletFlags.paymentV2ReversalEnabled ? "ativo" : "desligado"}
                                </Badge>
                              </div>
                              <p className="mt-2 text-sm text-slate-500">
                                Timeline operacional contínua do novo financeiro, em ordem cronológica, sem abrir rollout.
                              </p>
                            </div>
                            <div className="divide-y divide-slate-100">
                              {walletHistoryLoading ? (
                                <div className="px-4 py-6 text-sm text-slate-500">Carregando histórico operacional do Payment V2 e Estorno V2...</div>
                              ) : walletOperationalHistory.length === 0 ? (
                                <div className="px-4 py-6 text-sm text-slate-500">
                                  Nenhum evento operacional do Payment V2 ou Estorno V2 foi encontrado para a carteira selecionada. Quando houver pagamento ou estorno V2 auditável, ele aparecerá aqui.
                                </div>
                              ) : (
                                walletOperationalHistory.map((event) => (
                                  <details key={event.id} className="group px-4 py-4">
                                    <summary className="cursor-pointer list-none">
                                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="min-w-0 flex-1">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-medium text-slate-900">{event.title}</p>
                                            <Badge variant="outline" className={getOperationalBadgeClass(event.badgeTone)}>
                                              {event.type === "reversal" ? (
                                                <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                                              ) : (
                                                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                              )}
                                              {event.badgeLabel}
                                            </Badge>
                                            <Badge variant="outline" className={getOperationalStatusClass(event.statusTone)}>
                                              {event.statusTone === "irregular" ? (
                                                <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
                                              ) : (
                                                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                                              )}
                                              {event.statusLabel}
                                              {event.statusTone === "irregular" ? " (>5 dias)" : ""}
                                            </Badge>
                                          </div>
                                          <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                                            <p><span className="font-medium text-slate-900">Serviço:</span> {event.serviceLabel}</p>
                                            <p><span className="font-medium text-slate-900">Cão:</span> {event.dogName}</p>
                                            <p><span className="font-medium text-slate-900">Vencimento:</span> {event.dueDate ? new Date(`${event.dueDate}T00:00:00`).toLocaleDateString("pt-BR") : "—"}</p>
                                            <p><span className="font-medium text-slate-900">Data:</span> {event.eventDate ? new Date(event.eventDate).toLocaleString("pt-BR") : "—"}</p>
                                          </div>
                                          <p className="mt-2 text-sm text-slate-500">{event.statusHelper}</p>
                                        </div>

                                        <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-end">
                                          <div className="text-left lg:text-right">
                                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Valor</p>
                                            <p className={`mt-1 text-base font-semibold ${event.type === "reversal" ? "text-red-600" : "text-emerald-700"}`}>
                                              {event.type === "reversal" ? "-" : "+"}
                                              {formatCurrency(event.amount)}
                                            </p>
                                          </div>
                                          <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500 transition group-open:bg-slate-100">
                                            Ver histórico
                                            <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
                                          </div>
                                        </div>
                                      </div>
                                    </summary>

                                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                      <div className="grid grid-cols-1 gap-3 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-3">
                                        <p><span className="font-medium text-slate-900">Tipo:</span> {event.details.tipo || "—"}</p>
                                        <p><span className="font-medium text-slate-900">Origem:</span> {event.details.origem || "—"}</p>
                                        <p><span className="font-medium text-slate-900">Source key:</span> {event.details.sourceKey || "—"}</p>
                                        <p><span className="font-medium text-slate-900">Idempotência:</span> {event.details.operacaoIdempotencia || "—"}</p>
                                        <p><span className="font-medium text-slate-900">Obrigação:</span> {event.details.obrigacaoStatus || "—"}</p>
                                        <p><span className="font-medium text-slate-900">Cobrança:</span> {event.details.cobrancaStatus || "—"}</p>
                                        {event.type === "reversal" ? (
                                          <>
                                            <p><span className="font-medium text-slate-900">Motivo:</span> {event.details.motivo || "—"}</p>
                                            <p><span className="font-medium text-slate-900">Executor:</span> {event.details.executor || "—"}</p>
                                            <p><span className="font-medium text-slate-900">Anexo:</span> {event.details.attachmentName || "—"}</p>
                                          <p><span className="font-medium text-slate-900">Extensão:</span> {event.details.attachmentExtension || "—"}</p>
                                          <p><span className="font-medium text-slate-900">Conta a receber:</span> {event.details.contaReceberStatus || "—"}</p>
                                          <p><span className="font-medium text-slate-900">Serviço realizado:</span> {event.details.servicoRealizado || "—"}</p>
                                        </>
                                      ) : null}
                                    </div>
                                    {event.type === "reversal" && event.details.attachmentPath ? (
                                      <div className="mt-3">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-8 rounded-full px-3 text-[11px] sm:h-9 sm:text-sm"
                                          onClick={() => handleOpenPrivateAttachment(event.details.attachmentPath)}
                                        >
                                          <FileText className="mr-1.5 h-3.5 w-3.5" />
                                          Abrir anexo
                                        </Button>
                                      </div>
                                    ) : null}
                                    {event.details.reasonMessage ? (
                                        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                          <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
                                          <p>{event.details.reasonMessage}</p>
                                        </div>
                                      ) : null}
                                    </div>
                                  </details>
                                ))
                              )}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white">
                            <div className="border-b border-slate-100 px-4 py-3">
                              <h3 className="font-semibold text-slate-900">Extrato da carteira</h3>
                              <p className="mt-1 text-sm text-slate-500">
                                Débitos vindos de agendamentos e pacotes recorrentes, e créditos vindos de recebimentos vinculados à carteira.
                              </p>
                            </div>
                            <div className="space-y-4 p-4">
                              <div className="rounded-2xl border border-slate-200">
                                <div className="border-b border-slate-100 px-4 py-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <h4 className="font-medium text-slate-900">Débitos na carteira</h4>
                                    <Badge variant="outline">{walletStatementRows.debitRows.length}</Badge>
                                  </div>
                                  <p className="mt-1 text-sm text-slate-500">
                                    Data do agendamento, serviço, cão, vencimento, valor e código do orçamento ou pacote.
                                  </p>
                                </div>
                                <div className="divide-y divide-slate-100">
                                  {walletStatementRows.debitRows.length === 0 ? (
                                    <div className="px-4 py-6 text-sm text-slate-500">
                                      Nenhum débito operacional foi encontrado para a carteira selecionada.
                                    </div>
                                  ) : (
                                    walletStatementRows.debitRows.map((row) => (
                                      <div key={row.id} className="grid grid-cols-1 gap-3 px-4 py-4 xl:grid-cols-[140px_minmax(0,1.1fr)_140px_130px_170px]">
                                        <div>
                                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Data do agendamento</p>
                                          {row.appointmentId ? (
                                            <Button
                                              type="button"
                                              variant="link"
                                              className="mt-1 h-auto p-0 text-left text-sm font-medium text-blue-700"
                                              onClick={() => openWalletStatementAppointment(row.appointmentId)}
                                            >
                                              {formatWalletStatementDate(row.appointmentDate)}
                                            </Button>
                                          ) : (
                                            <p className="mt-1 text-sm font-medium text-slate-900">{formatWalletStatementDate(row.appointmentDate)}</p>
                                          )}
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                          <div>
                                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Serviço</p>
                                            <p className="mt-1 text-sm font-medium text-slate-900">{row.serviceLabel}</p>
                                          </div>
                                          <div>
                                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Cão</p>
                                            <p className="mt-1 text-sm font-medium text-slate-900">{row.dogName}</p>
                                          </div>
                                        </div>
                                        <div>
                                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Vencimento</p>
                                          <p className="mt-1 text-sm font-medium text-slate-900">{formatWalletStatementDate(row.dueDate)}</p>
                                        </div>
                                        <div>
                                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Valor</p>
                                          <p className="mt-1 text-sm font-semibold text-red-600">-{formatCurrency(row.amount)}</p>
                                        </div>
                                        <div>
                                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Código do orçamento/pacote</p>
                                          {row.referenceId && row.referenceCode ? (
                                            <Button
                                              type="button"
                                              variant="link"
                                              className="mt-1 h-auto p-0 text-left text-sm font-medium text-blue-700"
                                              onClick={() => openWalletStatementReference(row)}
                                            >
                                              {row.referenceCode}
                                            </Button>
                                          ) : (
                                            <p className="mt-1 text-sm font-medium text-slate-900">—</p>
                                          )}
                                          {row.referenceId && row.referenceCode ? (
                                            <p className="mt-1 text-xs text-slate-500">{row.referenceLabel}</p>
                                          ) : null}
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>

                              <div className="rounded-2xl border border-slate-200">
                                <div className="border-b border-slate-100 px-4 py-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <h4 className="font-medium text-slate-900">Créditos na carteira</h4>
                                    <Badge variant="outline">{walletStatementRows.creditRows.length}</Badge>
                                  </div>
                                  <p className="mt-1 text-sm text-slate-500">
                                    Recebimentos vindos de transações vinculadas à carteira. Clique em qualquer linha para abrir a transação.
                                  </p>
                                </div>
                                <div className="divide-y divide-slate-100">
                                  {walletStatementRows.creditRows.length === 0 ? (
                                    <div className="px-4 py-6 text-sm text-slate-500">
                                      Nenhum recebimento vinculado à carteira foi encontrado nesta leitura.
                                    </div>
                                  ) : (
                                    walletStatementRows.creditRows.map((row) => (
                                      <button
                                        key={row.id}
                                        type="button"
                                        onClick={() => openWalletStatementTransaction(row)}
                                        className="grid w-full grid-cols-1 gap-3 px-4 py-4 text-left transition hover:bg-slate-50 xl:grid-cols-[150px_minmax(0,1fr)_130px_220px]"
                                      >
                                        <div>
                                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Data de recebimento</p>
                                          <p className="mt-1 text-sm font-medium text-slate-900">
                                            {row.receivedDate ? new Date(row.receivedDate).toLocaleDateString("pt-BR") : "—"}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Contraparte</p>
                                          <p className="mt-1 text-sm font-medium text-slate-900">{row.counterparty}</p>
                                        </div>
                                        <div>
                                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Valor</p>
                                          <p className="mt-1 text-sm font-semibold text-emerald-700">+{formatCurrency(row.amount)}</p>
                                        </div>
                                        <div>
                                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Forma de pagamento</p>
                                          <p className="mt-1 text-sm font-medium text-slate-900">{row.paymentMethod}</p>
                                        </div>
                                      </button>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                          A leitura detalhada dos movimentos ainda está desligada por feature flag.
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">
                      Selecione uma carteira para auditar saldo, reconciliação e movimentos.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : walletOnly ? (
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
            <DialogTitle>{WALLET_OPERATION_LABELS[walletOperationForm.tipo] || "Operação de carteira"}</DialogTitle>
            <DialogDescription>
              Registro administrativo controlado da carteira, sempre via RPC e com movimento compensatório auditável.
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
                    natureza: value === "credito_manual" || value === "entrada_direcionada" ? "entrada" : prev.natureza,
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
                  <SelectItem value="entrada_direcionada">Entrada direcionada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Natureza *</Label>
              <Select
                value={walletOperationForm.natureza}
                onValueChange={(value) => setWalletOperationForm((prev) => ({ ...prev, natureza: value }))}
                disabled={walletOperationForm.tipo === "credito_manual" || walletOperationForm.tipo === "entrada_direcionada"}
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


