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

export function toDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd");
}

export function fromDateInputValue(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function toTitleCaseWord(word) {
  const normalized = String(word || "").toLowerCase();
  const upperWords = new Set(["ltda", "ltda.", "mei", "me", "epp", "eireli", "sa", "s/a", "cpf", "cnpj"]);
  if (upperWords.has(normalized)) {
    return normalized.replace(".", "").toUpperCase();
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeDisplayName(value) {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  return cleaned
    .split(" ")
    .map((token) => token.includes("/") ? token.toUpperCase() : toTitleCaseWord(token))
    .join(" ");
}

function parseBancoInterDescription(record) {
  const rawDescription = String(record?.raw_data?.descricao || record?.descricao || "").trim();
  if (!rawDescription) return null;

  const match = rawDescription.match(/^(pix\s+(?:enviado|recebido))\s*-\s*cp\s*:\s*([^-]+)-(.+)$/i);
  if (!match) {
    return {
      rawDescription,
      method: record?.raw_data?.tipoTransacao ? normalizeDisplayName(record.raw_data.tipoTransacao) : null,
      counterpartyName: "",
      counterpartyCode: null,
      detailLabel: record?.raw_data?.titulo ? normalizeDisplayName(record.raw_data.titulo) : null,
    };
  }

  const [, detailLabel, counterpartyCode, counterpartyName] = match;
  return {
    rawDescription,
    method: "Pix",
    counterpartyName: normalizeDisplayName(counterpartyName),
    counterpartyCode: String(counterpartyCode || "").trim() || null,
    detailLabel: normalizeDisplayName(detailLabel),
  };
}

function hasTimeFragment(value) {
  return typeof value === "string" && /\d{2}:\d{2}/.test(value);
}

function getRawMovementDateTime(record) {
  return (
    record?.raw_data?.dataHora ||
    record?.raw_data?.transactionDateTime ||
    record?.raw_data?.dataTransacao ||
    record?.raw_data?.createdAt ||
    record?.raw_data?.bookingDateTime ||
    null
  );
}

function formatDateOnlyLabel(value) {
  if (!value) return "-";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${day}/${month}/${year}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return format(date, "dd/MM/yyyy");
}

export function hasExplicitMovementTime(record) {
  if (!record || typeof record !== "object") return false;

  const rawDateTime = getRawMovementDateTime(record);
  if (hasTimeFragment(rawDateTime)) {
    return true;
  }

  const storedDateTime = record?.data_hora_transacao;
  const hasOnlyDateFromSource = Boolean(getMovementDateOnly(record));
  const shouldIgnoreStoredTime = Boolean(record?.raw_data) && hasOnlyDateFromSource && !hasTimeFragment(rawDateTime);

  if (shouldIgnoreStoredTime) {
    return false;
  }

  if (hasTimeFragment(storedDateTime)) {
    return !/T00:00(:00(?:\.000)?)?(Z|[+-]00:00)?$/i.test(storedDateTime);
  }

  return false;
}

export function getMovementDateOnly(record) {
  return (
    record?.data_movimento ||
    record?.data ||
    record?.raw_data?.dataEntrada ||
    record?.raw_data?.dataMovimento ||
    record?.raw_data?.dataLancamento ||
    record?.raw_data?.bookingDate ||
    null
  );
}

export function getMovementDateTime(record) {
  const rawDateTime = getRawMovementDateTime(record);
  if (rawDateTime) return rawDateTime;

  const dateOnly = getMovementDateOnly(record);
  if (dateOnly) return `${dateOnly}T12:00:00`;

  if (record?.data_hora_transacao) return record.data_hora_transacao;
  if (record?.created_date) return record.created_date;

  return null;
}

export function getMovementComparableDate(record) {
  if (!record) return null;

  if (hasExplicitMovementTime(record)) {
    const dateTime = getMovementDateTime(record);
    const parsed = dateTime ? new Date(dateTime) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }

  const dateOnly = getMovementDateOnly(record);
  if (dateOnly) {
    const parsed = new Date(`${dateOnly}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const fallback = record?.created_date ? new Date(record.created_date) : null;
  return fallback && !Number.isNaN(fallback.getTime()) ? fallback : null;
}

export function formatMovementDateTime(record) {
  if (!record) return "-";

  if (typeof record === "string") {
    return formatDateOnlyLabel(record);
  }

  return formatDateOnlyLabel(getMovementDateOnly(record) || getMovementDateTime(record));
}

export function isApiMovement(record) {
  return Boolean(record?.source_provider && record.source_provider !== "manual");
}

export function getMovementMethod(record) {
  const parsedInter = parseBancoInterDescription(record);
  return (
    record?.forma_pagamento ||
    parsedInter?.method ||
    record?.raw_data?.tipoTransacao ||
    "-"
  );
}

export function getMovementDirectionLabel(record) {
  if (record?.tipo === "saida") return "Debitado";
  if (record?.tipo === "entrada") return "Creditado";
  return "-";
}

export function getMovementCounterparty(record) {
  const parsedInter = parseBancoInterDescription(record);
  return (
    record?.nome_contraparte ||
    parsedInter?.counterpartyName ||
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
    record?.raw_data?.titulo ||
    getMovementMethod(record) ||
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
  const dataHora = getMovementDateTime(record);
  const possuiHoraReal = hasExplicitMovementTime(record);
  const dataOrdenacao = getMovementComparableDate(record);
  const parsedInter = parseBancoInterDescription(record);

  return {
    ...record,
    dataHora,
    possuiHoraReal,
    dataOrdenacao,
    contraparte: getMovementCounterparty(record),
    metodo: getMovementMethod(record),
    direcaoLabel: getMovementDirectionLabel(record),
    bancoContraparte: getMovementBank(record),
    tipoDetalhado: getMovementTransactionType(record),
    referenciaFinanceira: getMovementReference(record),
    carteiraFinanceira: getMovementWallet(record),
    observacoesFinanceiras: getMovementObservations(record),
    rateioNormalizado: normalizeRateio(record?.rateio),
    codigoContraparte: parsedInter?.counterpartyCode || record?.metadata_financeira?.counterparty_code || null,
    descricaoOriginal: parsedInter?.rawDescription || record?.raw_data?.descricao || record?.descricao || "",
    apiLocked: isApiMovement(record),
  };
}
