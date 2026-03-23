import { format } from "date-fns";

export const FINANCE_RATEIO_FIELDS = [
  { key: "taxas", label: "Taxas" },
  { key: "day_care", label: "Day Care" },
  { key: "hospedagem", label: "Hospedagem" },
  { key: "transporte", label: "Transporte" },
  { key: "adaptacao", label: "Adaptacao" },
  { key: "credito", label: "Credito" },
  { key: "banho", label: "Banho" },
  { key: "tosa", label: "Tosa" },
  { key: "reembolso_compras", label: "Reembolso de compras" },
];

export function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

export function parseFinanceObject(value, fallback = {}) {
  if (!value) return { ...fallback };
  if (typeof value === "object") return { ...fallback, ...value };

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? { ...fallback, ...parsed } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

export function normalizeRateio(value) {
  const parsed = parseFinanceObject(value);
  return FINANCE_RATEIO_FIELDS.reduce((acc, item) => {
    const rawValue = parsed[item.key];
    const numeric = typeof rawValue === "number" ? rawValue : Number(String(rawValue || "").replace(",", "."));
    acc[item.key] = Number.isFinite(numeric) ? numeric : 0;
    return acc;
  }, {});
}

export function getRateioTotal(rateio) {
  return Object.values(normalizeRateio(rateio)).reduce((sum, current) => sum + (current || 0), 0);
}

export function toDateTimeInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60000);
  return localDate.toISOString().slice(0, 16);
}

export function fromDateTimeInputValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function getMovementDateTime(record) {
  if (record?.data_hora_transacao) return record.data_hora_transacao;
  if (record?.raw_data?.dataHora) return record.raw_data.dataHora;
  if (record?.raw_data?.transactionDateTime) return record.raw_data.transactionDateTime;
  if (record?.created_date) return record.created_date;

  const dateOnly = record?.data || record?.data_movimento;
  return dateOnly ? `${dateOnly}T12:00:00.000Z` : null;
}

export function formatMovementDateTime(record) {
  const value = typeof record === "string" ? record : getMovementDateTime(record);
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return format(date, "dd/MM/yyyy HH:mm");
}

export function getMovementCounterparty(record) {
  return (
    record?.nome_contraparte ||
    record?.raw_data?.nomeRemetente ||
    record?.raw_data?.nomeFavorecido ||
    record?.raw_data?.nomePagador ||
    record?.descricao ||
    "Sem identificacao"
  );
}

export function getMovementBank(record) {
  return (
    record?.banco_contraparte ||
    record?.raw_data?.banco ||
    record?.raw_data?.nomeBanco ||
    record?.banco ||
    "-"
  );
}

export function getMovementTransactionType(record) {
  return (
    record?.tipo_transacao_detalhado ||
    record?.forma_pagamento ||
    record?.source_provider ||
    "-"
  );
}

export function getMovementReference(record) {
  return record?.referencia || record?.external_id || record?.lancamento_id || "-";
}

export function getMovementWallet(record) {
  return record?.carteira_nome || "-";
}

export function getMovementObservations(record) {
  return record?.observacoes || "";
}

export function normalizeMovement(record) {
  return {
    ...record,
    dataHora: getMovementDateTime(record),
    contraparte: getMovementCounterparty(record),
    bancoContraparte: getMovementBank(record),
    tipoDetalhado: getMovementTransactionType(record),
    referenciaFinanceira: getMovementReference(record),
    carteiraFinanceira: getMovementWallet(record),
    observacoesFinanceiras: getMovementObservations(record),
    rateioNormalizado: normalizeRateio(record?.rateio),
  };
}
