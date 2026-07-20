import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-active-unit-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_TOKEN_URL = "https://cdpj.partners.bancointer.com.br/oauth/v2/token";
const DEFAULT_API_BASE_URL = "https://cdpj.partners.bancointer.com.br";
const DEFAULT_EXTRATO_PATH = "/banking/v2/extrato/completo";
const DEFAULT_BALANCE_PATHS = ["/banking/v2/saldo", "/banking/v1/saldo"];
const DEFAULT_BANKING_SCOPE = "extrato.read saldo.read";
const DEFAULT_CHARGE_READ_SCOPE = "boleto-cobranca.read";
const DEFAULT_CHARGE_WRITE_SCOPE = "boleto-cobranca.write";
const DEFAULT_PIX_READ_SCOPE = "pix.read";
const DEFAULT_PIX_PAYMENT_READ_SCOPE = "pagamento-pix.read";
const DEFAULT_BOLETO_PAYMENT_READ_SCOPE = "pagamento-boleto.read";
const DEFAULT_RECEIPT_PDF_SCOPE = "extrato.read";
const DEFAULT_CHARGE_PATH = "/cobranca/v3/cobrancas";
const DEFAULT_PIX_PATH = "/pix/v2/pix";
const DEFAULT_PIX_PAYMENT_PATH = "/banking/v2/pix";
const DEFAULT_BOLETO_PAYMENT_PATH = "/banking/v2/pagamento";
const INTER_TOKEN_CACHE_TTL_MS = 55 * 60 * 1000;
const INTER_TOKEN_RATE_LIMIT_DEFAULT_SECONDS = 60;
const INTER_TOKEN_REFRESH_LEASE_SECONDS = 20;
const INTER_TOKEN_REFRESH_WAIT_MS = 15_000;
const INTER_TOKEN_REFRESH_POLL_MS = 350;
const INTER_TOKEN_EXPIRY_SAFETY_MS = 30_000;
const MAX_RECEIPT_PDF_BYTES = 12 * 1024 * 1024;

type InterTokenResult = {
  accessToken: string;
  httpClient: Deno.HttpClient;
  tokenResponse: Record<string, unknown>;
  tokenStatus: number;
};

type CachedInterToken = InterTokenResult & {
  expiresAt: number;
};

class BancoInterAuthError extends Error {
  status: number;
  retryAfterSeconds: number | null;

  constructor(message: string, status = 502, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "BancoInterAuthError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

class BudgetUnavailableError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "BudgetUnavailableError";
    this.status = status;
  }
}

class WalletChargeAuthorizationError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "WalletChargeAuthorizationError";
    this.status = status;
  }
}

const interTokenCache = new Map<string, CachedInterToken>();
const interTokenRequests = new Map<string, Promise<InterTokenResult>>();
const interTokenCooldowns = new Map<string, number>();
let persistentTokenCryptoKeyPromise: Promise<CryptoKey> | null = null;

type IntegrationConfig = {
  id: string;
  empresa_id?: string | null;
  provider?: string | null;
  nome?: string | null;
  ativo?: boolean | null;
  auto_sync_enabled?: boolean | null;
  auto_sync_interval_minutes?: number | null;
  sync_backfill_days?: number | null;
  next_sync_at?: string | null;
  sync_status?: string | null;
  last_sync_started_at?: string | null;
  last_sync_finished_at?: string | null;
  last_success_at?: string | null;
  last_error_at?: string | null;
  last_error_message?: string | null;
  last_http_status?: number | null;
  scope?: string | null;
  token_url?: string | null;
  api_base_url?: string | null;
  balance_path?: string | null;
  config?: Record<string, unknown> | null;
  credenciais?: Record<string, unknown> | null;
  extra_headers?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  certificate_crt?: string | null;
  certificate_key?: string | null;
  current_balance?: number | null;
  current_balance_at?: string | null;
};

type NormalizedTransaction = {
  id: string;
  empresa_id: string;
  descricao: string;
  tipo: "entrada" | "saida";
  valor: number;
  data: string;
  data_hora_transacao: string | null;
  data_movimento: string;
  banco: string;
  nome_contraparte: string | null;
  banco_contraparte: string | null;
  forma_pagamento: string | null;
  categoria: string | null;
  tipo_transacao_detalhado: string | null;
  referencia: string | null;
  carteira_nome: string | null;
  observacoes: string | null;
  rateio: Record<string, unknown>;
  metadata_financeira: Record<string, unknown>;
  conciliado: boolean;
  status: string;
  source_provider: string;
  conta_origem: string | null;
  conta_destino: string | null;
  saldo: number | null;
  raw_data: Record<string, unknown>;
  imported_at: string;
  sync_run_id: string;
};

type DuplicateReviewRow = {
  empresa_id: string;
  sync_run_id: string;
  source_provider: string;
  duplicate_reason: string;
  status: string;
  transaction_id: string;
  duplicate_count: number;
  imported_tipo: string;
  imported_valor: number;
  imported_descricao: string;
  imported_data_movimento: string;
  imported_data_hora: string | null;
  imported_payload: Record<string, unknown>;
  existing_record_id: string | null;
  existing_snapshot: Record<string, unknown>;
};

type MovementSummaryRow = {
  tipo?: string | null;
  valor?: number | string | null;
  data_movimento?: string | null;
  data?: string | null;
  source_provider?: string | null;
  raw_data?: Record<string, unknown> | null;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios na function.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function getBusinessDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function expireDueBudgets(empresaId = "", orcamentoId = "") {
  const referenceDate = getBusinessDateKey();
  const { data, error } = await supabase.rpc("finance_expire_budgets", {
    p_empresa_id: sanitizeText(empresaId) || null,
    p_orcamento_id: sanitizeText(orcamentoId) || null,
    p_reference_date: referenceDate,
  });

  if (error) {
    throw new Error(`Falha ao aplicar a expiração automática do orçamento: ${error.message}`);
  }

  return Array.isArray(data) ? (data[0] || null) : data;
}

async function enforceBudgetAvailability(options: {
  orcamentoId: string;
  empresaId?: string;
  requireApproved?: boolean;
}) {
  const orcamentoId = sanitizeText(options.orcamentoId);
  const empresaId = sanitizeText(options.empresaId);
  if (!orcamentoId) {
    throw new BudgetUnavailableError("Orçamento não informado.", 400);
  }

  await expireDueBudgets(empresaId, orcamentoId);

  let query = supabase
    .from("orcamento")
    .select("id, empresa_id, status, data_validade")
    .eq("id", orcamentoId);
  if (empresaId) query = query.eq("empresa_id", empresaId);

  const { data: budget, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`Falha ao validar a disponibilidade do orçamento: ${error.message}`);
  }
  if (!budget) {
    throw new BudgetUnavailableError("Orçamento não localizado.", 404);
  }

  const validityDate = sanitizeText(budget.data_validade).slice(0, 10);
  const status = sanitizeText(budget.status).toLowerCase();
  if (status === "expirado" || (validityDate && validityDate < getBusinessDateKey())) {
    throw new BudgetUnavailableError(
      "A validade do orçamento terminou. A cobrança não será emitida nem consultada no Banco Inter.",
    );
  }
  if (options.requireApproved && status !== "aprovado") {
    throw new BudgetUnavailableError("Somente um orçamento aprovado e dentro da validade pode emitir cobrança.");
  }

  return budget;
}

function jsonResponse(body: unknown, status = 200, additionalHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...additionalHeaders },
  });
}

function getConfigValue<T = unknown>(config: IntegrationConfig, key: string, fallback?: T): T | undefined {
  const sources = [config, config.credenciais || {}, config.config || {}, config.metadata || {}];
  for (const source of sources) {
    if (source && typeof source === "object" && key in source) {
      return (source as Record<string, T>)[key];
    }
  }
  return fallback;
}

function firstDefined<T>(...values: T[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function normalizeDateInput(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatDateOnly(value: string | Date) {
  return normalizeDateInput(value).toISOString().slice(0, 10);
}

function formatBusinessDateOnly(value: unknown) {
  const normalizedValue = sanitizeText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) return normalizedValue;

  const date = normalizeDateInput(normalizedValue || new Date());
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftDateOnly(value: string, days: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value: string | Date) {
  return normalizeDateInput(value).toISOString();
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function diffDays(fromDate: string, toDate: string) {
  const start = normalizeDateInput(fromDate);
  const end = normalizeDateInput(toDate);
  return Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function buildDateWindows(fromDate: string, toDate: string, maxRangeDays = 80) {
  const windows: Array<{ from: string; to: string }> = [];
  let cursor = normalizeDateInput(fromDate);
  const finalDate = normalizeDateInput(toDate);

  while (cursor.getTime() <= finalDate.getTime()) {
    const windowStart = new Date(cursor);
    const tentativeEnd = addDays(windowStart, maxRangeDays);
    const windowEnd = tentativeEnd.getTime() > finalDate.getTime() ? finalDate : tentativeEnd;

    windows.push({
      from: formatDateOnly(windowStart),
      to: formatDateOnly(windowEnd),
    });

    cursor = addDays(windowEnd, 1);
  }

  return windows;
}

function isTransientUpstreamError(error: unknown) {
  const message = serializeError(error).toLowerCase();
  return (
    message.includes("(502)") ||
    message.includes("(503)") ||
    message.includes("(504)") ||
    message.includes("no healthy upstream") ||
    message.includes("upstream connect error") ||
    message.includes("temporarily unavailable")
  );
}

function splitDateWindow(fromDate: string, toDate: string) {
  const totalDays = diffDays(fromDate, toDate);
  if (totalDays < 1) return null;

  const start = normalizeDateInput(fromDate);
  const middle = addDays(start, Math.floor(totalDays / 2));
  const secondStart = addDays(middle, 1);

  return {
    left: { from: formatDateOnly(start), to: formatDateOnly(middle) },
    right: { from: formatDateOnly(secondStart), to: formatDateOnly(toDate) },
  };
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function sanitizeText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function configBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const normalized = sanitizeText(value).toLowerCase();
  if (["true", "1", "yes", "sim", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "nao", "off"].includes(normalized)) return false;
  return fallback;
}

function hasTimeFragment(value: unknown) {
  return typeof value === "string" && /\d{2}:\d{2}/.test(value);
}

function normalizeInterDate(value: unknown) {
  const text = sanitizeText(value);
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${year}-${month}-${day}`;
  }

  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function normalizeInterTime(value: unknown) {
  const text = sanitizeText(value);
  if (!text) return null;

  const match = text.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const [, hours, minutes, seconds] = match;
  return `${hours}:${minutes}:${seconds || "00"}`;
}

function buildInterDateTime(
  dateValue: unknown,
  timeValue: unknown,
) {
  const dateOnly = normalizeInterDate(dateValue);
  if (!dateOnly) return null;

  const normalizedTime = normalizeInterTime(timeValue);
  return normalizedTime ? `${dateOnly}T${normalizedTime}` : `${dateOnly}T00:00:00`;
}

function getRawInterTransactionDateTime(transaction: Record<string, unknown>) {
  return firstDefined(
    buildInterDateTime(transaction.dataLancamento, transaction.horaLancamento),
    buildInterDateTime(transaction.dataMovimento, transaction.horaLancamento),
    buildInterDateTime(transaction.dataEntrada, transaction.horaLancamento),
    transaction.dataHora,
    transaction.dataTransacao,
    transaction.transactionDateTime,
    transaction.dataMovimento,
    transaction.dataLancamento,
    transaction.dataEntrada,
    transaction.data,
    transaction.bookingDate,
    transaction.createdAt,
  );
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d,.-]/g, "").trim();
    if (!cleaned) return 0;

    const hasComma = cleaned.includes(",");
    const hasDot = cleaned.includes(".");
    let normalized = cleaned;

    if (hasComma && hasDot) {
      const lastComma = cleaned.lastIndexOf(",");
      const lastDot = cleaned.lastIndexOf(".");
      const decimalSeparator = lastComma > lastDot ? "," : ".";
      const thousandSeparator = decimalSeparator === "," ? "." : ",";
      normalized = cleaned.split(thousandSeparator).join("");
      if (decimalSeparator === ",") {
        normalized = normalized.replace(",", ".");
      }
    } else if (hasComma) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else if (hasDot) {
      const parts = cleaned.split(".");
      if (parts.length > 2) {
        const decimalPart = parts.pop();
        normalized = `${parts.join("")}.${decimalPart}`;
      }
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const source = error as Record<string, unknown>;
    const parts = [
      sanitizeText(source.message),
      sanitizeText(source.details),
      sanitizeText(source.hint),
    ].filter(Boolean);

    const rawMessage = parts.join(" | ");
    const code = sanitizeText(source.code);
    const message = rawMessage || (() => {
      try {
        return JSON.stringify(error);
      } catch {
        return String(error);
      }
    })();

    const financeSchemaColumns = [
      "data_hora_transacao",
      "nome_contraparte",
      "banco_contraparte",
      "tipo_transacao_detalhado",
      "referencia",
      "carteira_nome",
      "observacoes",
      "rateio",
      "metadata_financeira",
      "current_balance",
      "current_balance_at",
      "balance_path",
    ];

    const missingFinanceColumn = financeSchemaColumns.find((column) => message.includes(column));
    if (missingFinanceColumn) {
      return `Schema financeiro do Supabase desatualizado. Execute o arquivo supabase-schema-finance-ledger.sql e tente novamente. Coluna ausente: ${missingFinanceColumn}.`;
    }

    if (message.includes("ON CONFLICT") || code === "42P10") {
      return "A constraint unica de deduplicacao do extrato nao existe no Supabase. Execute novamente o arquivo supabase-schema-banco-inter.sql e tente importar de novo.";
    }

    return code ? `${message} (code: ${code})` : message;
  }

  return String(error);
}

async function sha256Hex(value: string) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, current]) => current !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, current]) => `${JSON.stringify(key)}:${stableSerialize(current)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value ?? null);
}

function buildMovementFingerprint(row: MovementSummaryRow) {
  if (!row?.raw_data || typeof row.raw_data !== "object") return null;

  return [
    sanitizeText(row.source_provider),
    sanitizeText(row.tipo),
    sanitizeText(firstDefined(row.data_movimento, row.data)),
    String(firstDefined(row.valor, "")),
    stableSerialize(row.raw_data),
  ].join("|");
}

function getMovementDateValue(row: Record<string, unknown>) {
  return sanitizeText(firstDefined(
    row.data_movimento,
    row.data,
    row.raw_data && typeof row.raw_data === "object" ? (row.raw_data as Record<string, unknown>).dataEntrada : null,
    row.raw_data && typeof row.raw_data === "object" ? (row.raw_data as Record<string, unknown>).dataLancamento : null,
  )) || null;
}

function removeOverlappingApiRows<T extends Record<string, unknown>>(rows: T[]) {
  const csvRows = rows.filter((row) => sanitizeText(row.source_provider) === "banco_inter_csv");
  if (!csvRows.length) return rows;

  let oldestCsvDate: string | null = null;
  let newestCsvDate: string | null = null;

  for (const row of csvRows) {
    const movementDate = getMovementDateValue(row);
    if (!movementDate) continue;
    if (!oldestCsvDate || movementDate < oldestCsvDate) oldestCsvDate = movementDate;
    if (!newestCsvDate || movementDate > newestCsvDate) newestCsvDate = movementDate;
  }

  if (!oldestCsvDate || !newestCsvDate) return rows;

  return rows.filter((row) => {
    if (sanitizeText(row.source_provider) !== "banco_inter") return true;
    const movementDate = getMovementDateValue(row);
    if (!movementDate) return true;
    return movementDate < oldestCsvDate || movementDate > newestCsvDate;
  });
}

async function loadMovementRowsPaginated<T extends Record<string, unknown>>(
  empresaId: string,
  columns: string,
  {
    pageSize = 1000,
    maxRows = 100000,
  }: {
    pageSize?: number;
    maxRows?: number;
  } = {},
): Promise<T[]> {
  const batchSize = Math.min(Math.max(Number(pageSize) || 1000, 1), 1000);
  const rowLimit = Math.min(Math.max(Number(maxRows) || 100000, 1), 100000);
  const rows: T[] = [];
  let from = 0;

  while (rows.length < rowLimit) {
    const to = Math.min(from + batchSize - 1, rowLimit - 1);
    const { data, error } = await supabase
      .from("extratobancario")
      .select(columns)
      .eq("empresa_id", empresaId)
      .order("data_movimento", { ascending: false })
      .order("data_hora_transacao", { ascending: false })
      .order("created_date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const batch = (data || []) as unknown as T[];
    rows.push(...batch);

    if (batch.length < batchSize) break;
    from += batchSize;
  }

  return rows;
}

function inferTipo(rawTransaction: Record<string, unknown>, amount: number): "entrada" | "saida" {
  const operationCode = sanitizeText(firstDefined(
    rawTransaction.tipoOperacao,
    rawTransaction.operationCode,
    rawTransaction.dc,
  ), "").toLowerCase();

  if (["d", "debit", "debito", "débito"].includes(operationCode)) return "saida";
  if (["c", "credit", "credito", "crédito"].includes(operationCode)) return "entrada";

  const rawType = sanitizeText(
    firstDefined(
      rawTransaction.tipo,
      rawTransaction.natureza,
      rawTransaction.tipoOperacao,
      rawTransaction.tipoTransacao,
      rawTransaction.titulo,
      rawTransaction.descricao,
      rawTransaction.transactionType,
      rawTransaction.operationType,
    ),
    "",
  ).toLowerCase();

  if (/(saida|debito|débito|debit|pagamento|transferencia_saida|pix enviado|tarifa|saque)/.test(rawType)) return "saida";
  if (/(entrada|credito|crédito|credit|recebimento|transferencia_entrada|pix recebido)/.test(rawType)) return "entrada";
  return amount < 0 ? "saida" : "entrada";
}

function getTransactionArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
  }

  if (!payload || typeof payload !== "object") return [];
  const source = payload as Record<string, unknown>;

  const candidates = [
    source.transacoes,
    source.transactions,
    source.movimentacoes,
    source.items,
    source.data,
    source.content,
  ];

  const firstArray = candidates.find((item) => Array.isArray(item));
  return Array.isArray(firstArray)
    ? firstArray.filter((item) => item && typeof item === "object") as Record<string, unknown>[]
    : [];
}

function countTransactions(payload: unknown) {
  return getTransactionArray(payload).length;
}

function inferCounterpartyName(
  rawTransaction: Record<string, unknown>,
  description: string,
  direction: "entrada" | "saida",
) {
  const details = rawTransaction.detalhes && typeof rawTransaction.detalhes === "object"
    ? rawTransaction.detalhes as Record<string, unknown>
    : {};
  const value = direction === "saida"
    ? sanitizeText(firstDefined(
      rawTransaction.nomeFavorecido,
      rawTransaction.nomeRecebedor,
      rawTransaction.beneficiario,
      rawTransaction.creditorName,
      details.nomeRecebedor,
      rawTransaction.contraparte,
      rawTransaction.cliente,
    ))
    : sanitizeText(firstDefined(
      rawTransaction.nomeRemetente,
      rawTransaction.nomePagador,
      rawTransaction.pagador,
      rawTransaction.debtorName,
      details.nomePagador,
      rawTransaction.contraparte,
      rawTransaction.cliente,
    ));
  return value || description || null;
}

function inferCounterpartyBank(
  rawTransaction: Record<string, unknown>,
  direction: "entrada" | "saida",
) {
  const details = rawTransaction.detalhes && typeof rawTransaction.detalhes === "object"
    ? rawTransaction.detalhes as Record<string, unknown>
    : {};
  return direction === "saida"
    ? sanitizeText(firstDefined(
      rawTransaction.bancoDestino,
      rawTransaction.nomeBancoDestino,
      rawTransaction.instituicaoDestino,
      details.nomeEmpresaRecebedor,
      rawTransaction.banco,
      rawTransaction.nomeBanco,
      rawTransaction.instituicao,
      rawTransaction.bankName,
      rawTransaction.bank,
    )) || null
    : sanitizeText(firstDefined(
      rawTransaction.bancoOrigem,
      rawTransaction.nomeBancoOrigem,
      rawTransaction.instituicaoOrigem,
      details.nomeEmpresaPagador,
      rawTransaction.banco,
      rawTransaction.nomeBanco,
      rawTransaction.instituicao,
      rawTransaction.bankName,
      rawTransaction.bank,
    )) || null;
}

function inferReference(rawTransaction: Record<string, unknown>, externalId: string) {
  const details = rawTransaction.detalhes && typeof rawTransaction.detalhes === "object"
    ? rawTransaction.detalhes as Record<string, unknown>
    : {};
  return sanitizeText(firstDefined(
    rawTransaction.referencia,
    rawTransaction.documento,
    rawTransaction.identificador,
    rawTransaction.idTransacao,
    rawTransaction.codigoTransacao,
    rawTransaction.transactionId,
    rawTransaction.nsu,
    rawTransaction.nsudoc,
    details.codigoSolicitacao,
    details.endToEndId,
    details.txId,
    externalId,
  )) || null;
}

function toTitleCaseWord(value: string) {
  const normalized = sanitizeText(value).toLowerCase();
  const upperWords = new Set(["ltda", "ltda.", "mei", "me", "epp", "eireli", "sa", "s/a", "cpf", "cnpj"]);
  if (upperWords.has(normalized)) {
    return normalized.replace(".", "").toUpperCase();
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeDisplayName(value: unknown) {
  const cleaned = sanitizeText(value).replace(/\s+/g, " ");
  if (!cleaned) return "";

  return cleaned
    .split(" ")
    .map((token) => token.includes("/") ? token.toUpperCase() : toTitleCaseWord(token))
    .join(" ");
}

function normalizeDisplayLabel(value: unknown) {
  return normalizeDisplayName(String(value || "").replace(/_/g, " "));
}

function parseBancoInterDescription(rawTransaction: Record<string, unknown>) {
  const rawDescription = sanitizeText(firstDefined(rawTransaction.descricao, rawTransaction.historico));
  const rawTitle = sanitizeText(firstDefined(rawTransaction.titulo, rawTransaction.tipoTransacao));
  const method = normalizeDisplayLabel(firstDefined(rawTransaction.tipoTransacao, rawTransaction.formaPagamento, rawTransaction.tipoPagamento)) || null;
  const detailLabel = normalizeDisplayLabel(rawTitle) || null;
  const match = rawDescription.match(/^(pix\s+(?:enviado|recebido))\s*-\s*cp\s*:\s*([^-]+)-(.+)$/i);

  if (!match) {
    return {
      rawDescription,
      method,
      detailLabel,
      counterpartyCode: null,
      counterpartyName: "",
    };
  }

  return {
    rawDescription,
    method: method || "Pix",
    detailLabel: normalizeDisplayLabel(match[1]) || detailLabel,
    counterpartyCode: sanitizeText(match[2]) || null,
    counterpartyName: normalizeDisplayName(match[3]),
  };
}

function buildStableTransactionFingerprintPayload(transaction: Record<string, unknown>) {
  return {
    id: sanitizeText(firstDefined(
      transaction.id,
      transaction.idTransacao,
      transaction.codigoTransacao,
      transaction.transactionId,
      transaction.identificador,
      transaction.nsudoc,
      transaction.documento,
      transaction.nsu,
    )),
    valor: sanitizeText(firstDefined(
      transaction.valor,
      transaction.amount,
      transaction.valorLancamento,
      transaction.valorTransacao,
      transaction.transactionAmount,
    )),
    dataHora: sanitizeText(firstDefined(
      buildInterDateTime(transaction.dataLancamento, transaction.horaLancamento),
      transaction.dataHora,
      transaction.dataTransacao,
      transaction.transactionDateTime,
      transaction.dataMovimento,
      transaction.dataLancamento,
      transaction.dataEntrada,
      transaction.data,
      transaction.bookingDate,
      transaction.createdAt,
    )),
    descricao: sanitizeText(firstDefined(
      transaction.descricao,
      transaction.historico,
      transaction.titulo,
      transaction.title,
      transaction.complemento,
    )),
    titulo: sanitizeText(firstDefined(transaction.titulo, transaction.title)),
    tipoOperacao: sanitizeText(firstDefined(transaction.tipoOperacao, transaction.operationCode, transaction.dc)),
    tipoTransacao: sanitizeText(firstDefined(transaction.tipoTransacao, transaction.transactionType, transaction.operationType)),
    contaOrigem: sanitizeText(firstDefined(transaction.contaOrigem, transaction.accountOrigin)),
    contaDestino: sanitizeText(firstDefined(transaction.contaDestino, transaction.accountDestination)),
    nomeRemetente: sanitizeText(firstDefined(transaction.nomeRemetente, transaction.nomePagador, transaction.pagador, transaction.debtorName)),
    nomeFavorecido: sanitizeText(firstDefined(transaction.nomeFavorecido, transaction.nomeRecebedor, transaction.beneficiario, transaction.creditorName)),
  };
}

async function createHttpClient(config: IntegrationConfig) {
  const cert = sanitizeText(config.certificate_crt);
  const key = sanitizeText(config.certificate_key);

  if (!cert || !key) {
    throw new Error("Certificado .crt e chave .key do Banco Inter sao obrigatorios.");
  }

  return Deno.createHttpClient({
    cert,
    key,
    http1: true,
    http2: false,
  });
}

function normalizeScope(scope: string | null | undefined) {
  return String(scope || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(" ");
}

function resolveScopedTokenScope(
  config: IntegrationConfig,
  options: {
    scopeConfigKey?: string;
    fallbackScope?: string;
  } = {},
) {
  const configuredScoped = sanitizeText(
    options.scopeConfigKey ? getConfigValue(config, options.scopeConfigKey) : null,
  );
  if (configuredScoped) return normalizeScope(configuredScoped);

  const configuredGeneric = sanitizeText(getConfigValue(config, "scope"));
  if (!options.scopeConfigKey && configuredGeneric) return normalizeScope(configuredGeneric);

  return normalizeScope(options.fallbackScope || "");
}

function buildScopeRegistrationHint(scope: string, parsed: Record<string, unknown>) {
  const rawMessage = JSON.stringify(parsed).toLowerCase();
  if (!rawMessage.includes("requested scope is not registered for this client")) return null;
  return `O client_id do Banco Inter não possui o scope '${scope}' habilitado. Ative esse scope no Portal do Desenvolvedor Inter para a aplicação usada nesta integração.`;
}

function buildTokenRateLimitHint(scope: string, retryAfterSeconds: number) {
  return `O Banco Inter limitou temporariamente a geração do token para o scope '${scope}'. Aguarde cerca de ${retryAfterSeconds} segundos antes de atualizar novamente; nenhuma tentativa adicional de autenticação será feita durante esse intervalo.`;
}

function resolveTokenCacheKey(clientId: string, scope: string) {
  return [clientId, scope].join("::");
}

function resolveRetryAfterSeconds(response: Response) {
  const retryAfter = sanitizeText(response.headers.get("retry-after"));
  const numericSeconds = Number(retryAfter);
  if (Number.isFinite(numericSeconds) && numericSeconds > 0) {
    return Math.min(Math.max(Math.ceil(numericSeconds), 1), 15 * 60);
  }

  const retryAt = Date.parse(retryAfter);
  if (Number.isFinite(retryAt)) {
    return Math.min(Math.max(Math.ceil((retryAt - Date.now()) / 1000), 1), 15 * 60);
  }

  return INTER_TOKEN_RATE_LIMIT_DEFAULT_SECONDS;
}

function getTokenCooldownSeconds(cacheKey: string) {
  const cooldownUntil = interTokenCooldowns.get(cacheKey);
  if (!cooldownUntil) return 0;
  if (cooldownUntil <= Date.now()) {
    interTokenCooldowns.delete(cacheKey);
    return 0;
  }
  return Math.max(Math.ceil((cooldownUntil - Date.now()) / 1000), 1);
}

function buildInterApi401Hint(config: IntegrationConfig, parsed: Record<string, unknown>) {
  const rawMessage = JSON.stringify(parsed).toLowerCase();
  if (!rawMessage.includes("login/senha inválido") && !rawMessage.includes("acesso negado")) {
    return null;
  }

  const accountNumber = sanitizeText(
    firstDefined(
      getConfigValue(config, "conta_corrente"),
      getConfigValue(config, "account_number"),
      (config.extra_headers || {})["x-conta-corrente"],
    ),
  ).replace(/\D/g, "");

  return [
    "O Banco Inter respondeu 401 na API de cobrança.",
    "Pelos cenários oficiais do Inter, isso normalmente indica uma destas causas:",
    "1. client_id/client_secret e certificado não pertencem à mesma integração;",
    "2. a conta utilizada não está liberada para requisições via API de cobrança;",
    accountNumber ? `3. confira se a conta corrente configurada (${accountNumber}) é exatamente a conta habilitada para a integração.` : "3. confira se a conta corrente configurada é exatamente a conta habilitada para a integração.",
  ].join(" ");
}

function getCachedInterToken(cacheKey: string) {
  const cached = interTokenCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    interTokenCache.delete(cacheKey);
    return null;
  }
  return cached;
}

function resolveTokenCacheTtl(parsed: Record<string, unknown>) {
  const expiresInSeconds = Number(firstDefined(parsed.expires_in, parsed.expira_em, parsed.expires));
  if (Number.isFinite(expiresInSeconds) && expiresInSeconds > 120) {
    return Math.max((expiresInSeconds - 60) * 1000, 60 * 1000);
  }
  return INTER_TOKEN_CACHE_TTL_MS;
}

function encodeTokenBytesBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function decodeTokenBytesBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function getPersistentTokenCryptoKey() {
  if (persistentTokenCryptoKeyPromise) return await persistentTokenCryptoKeyPromise;

  const secret = sanitizeText(Deno.env.get("BANCO_INTER_TOKEN_ENCRYPTION_KEY"));
  if (!secret) {
    throw new Error("BANCO_INTER_TOKEN_ENCRYPTION_KEY nao configurada.");
  }

  persistentTokenCryptoKeyPromise = (async () => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    return await crypto.subtle.importKey(
      "raw",
      digest,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
  })();

  return await persistentTokenCryptoKeyPromise;
}

function buildPersistentTokenAdditionalData(
  config: IntegrationConfig,
  scope: string,
  clientFingerprint: string,
) {
  return new TextEncoder().encode(`${config.id}|${scope}|${clientFingerprint}`);
}

async function removePersistentInterToken(config: IntegrationConfig, scope: string) {
  const { error } = await supabase
    .from("banco_inter_token_cache")
    .delete()
    .eq("integracao_id", config.id)
    .eq("scope", scope);
  if (error) throw error;
}

async function readPersistentInterToken(
  config: IntegrationConfig,
  scope: string,
  clientFingerprint: string,
): Promise<CachedInterToken | null> {
  const { data, error } = await supabase
    .from("banco_inter_token_cache")
    .select("client_fingerprint, token_ciphertext, token_iv, expires_at")
    .eq("integracao_id", config.id)
    .eq("scope", scope)
    .maybeSingle();
  if (error) throw error;
  if (!data?.token_ciphertext || !data?.token_iv || !data?.expires_at) return null;

  const expiresAt = Date.parse(data.expires_at);
  const isInvalid = data.client_fingerprint !== clientFingerprint
    || !Number.isFinite(expiresAt)
    || expiresAt <= Date.now() + INTER_TOKEN_EXPIRY_SAFETY_MS;
  if (isInvalid) {
    await removePersistentInterToken(config, scope);
    return null;
  }

  try {
    const key = await getPersistentTokenCryptoKey();
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: decodeTokenBytesBase64(data.token_iv),
        additionalData: buildPersistentTokenAdditionalData(config, scope, clientFingerprint),
      },
      key,
      decodeTokenBytesBase64(data.token_ciphertext),
    );
    const accessToken = new TextDecoder().decode(decrypted);
    if (!accessToken) throw new Error("Token persistido vazio.");

    return {
      accessToken,
      httpClient: await createHttpClient(config),
      tokenResponse: { source: "encrypted_persistent_cache", expires_at: data.expires_at },
      tokenStatus: 200,
      expiresAt,
    };
  } catch (error) {
    await removePersistentInterToken(config, scope).catch(() => undefined);
    console.warn("banco-inter-sync discarded unreadable persistent token", serializeError(error));
    return null;
  }
}

async function claimPersistentInterTokenRefresh(
  config: IntegrationConfig,
  scope: string,
  clientFingerprint: string,
  owner: string,
) {
  const { data, error } = await supabase.rpc("finance_claim_banco_inter_token_refresh", {
    p_integracao_id: config.id,
    p_scope: scope,
    p_client_fingerprint: clientFingerprint,
    p_owner: owner,
    p_lease_seconds: INTER_TOKEN_REFRESH_LEASE_SECONDS,
  });
  if (error) throw error;
  return data === true;
}

async function waitForPersistentInterToken(
  config: IntegrationConfig,
  scope: string,
  clientFingerprint: string,
) {
  const deadline = Date.now() + INTER_TOKEN_REFRESH_WAIT_MS;
  while (Date.now() < deadline) {
    await wait(INTER_TOKEN_REFRESH_POLL_MS);
    const cached = await readPersistentInterToken(config, scope, clientFingerprint);
    if (cached) return cached;
  }
  return null;
}

async function persistInterToken(
  config: IntegrationConfig,
  scope: string,
  clientFingerprint: string,
  owner: string | null,
  accessToken: string,
  expiresAt: number,
) {
  const key = await getPersistentTokenCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: buildPersistentTokenAdditionalData(config, scope, clientFingerprint),
    },
    key,
    new TextEncoder().encode(accessToken),
  ));
  const payload = {
    client_fingerprint: clientFingerprint,
    token_ciphertext: encodeTokenBytesBase64(ciphertext),
    token_iv: encodeTokenBytesBase64(iv),
    expires_at: new Date(expiresAt).toISOString(),
    refresh_owner: null,
    refreshing_until: null,
    updated_date: new Date().toISOString(),
  };

  if (owner) {
    const { data, error } = await supabase
      .from("banco_inter_token_cache")
      .update(payload)
      .eq("integracao_id", config.id)
      .eq("scope", scope)
      .eq("refresh_owner", owner)
      .select("integracao_id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Lease de renovacao do token nao pertence mais a esta instancia.");
    return;
  }

  const { error } = await supabase
    .from("banco_inter_token_cache")
    .upsert({
      integracao_id: config.id,
      scope,
      ...payload,
    }, { onConflict: "integracao_id,scope" });
  if (error) throw error;
}

async function releasePersistentInterTokenRefresh(
  config: IntegrationConfig,
  scope: string,
  owner: string,
) {
  const { error } = await supabase
    .from("banco_inter_token_cache")
    .update({
      refresh_owner: null,
      refreshing_until: null,
      updated_date: new Date().toISOString(),
    })
    .eq("integracao_id", config.id)
    .eq("scope", scope)
    .eq("refresh_owner", owner);
  if (error) throw error;
}

async function getAccessToken(
  config: IntegrationConfig,
  options: {
    scopeConfigKey?: string;
    fallbackScope?: string;
    actionLabel?: string;
  } = {},
) {
  const clientId = sanitizeText(getConfigValue(config, "client_id"));
  const clientSecret = sanitizeText(getConfigValue(config, "client_secret"));

  if (!clientId || !clientSecret) {
    throw new Error("client_id e client_secret sao obrigatorios para o Banco Inter.");
  }

  const scope = resolveScopedTokenScope(config, {
    scopeConfigKey: options.scopeConfigKey,
    fallbackScope: options.fallbackScope || DEFAULT_BANKING_SCOPE,
  });
  const tokenUrl = sanitizeText(config.token_url || getConfigValue(config, "token_url"), DEFAULT_TOKEN_URL);
  const configuredTokenAuthMode = sanitizeText(getConfigValue(config, "token_auth_mode"), "auto").toLowerCase();
  const modes = configuredTokenAuthMode === "auto"
    ? ["basic", "body"]
    : [configuredTokenAuthMode];
  const cacheKey = resolveTokenCacheKey(clientId, scope);
  const clientFingerprint = await sha256Hex(clientId);
  const cachedToken = getCachedInterToken(cacheKey);
  if (cachedToken) {
    return {
      accessToken: cachedToken.accessToken,
      httpClient: cachedToken.httpClient,
      tokenResponse: cachedToken.tokenResponse,
      tokenStatus: cachedToken.tokenStatus,
    };
  }

  try {
    const persistentToken = await readPersistentInterToken(config, scope, clientFingerprint);
    if (persistentToken) {
      interTokenCache.set(cacheKey, persistentToken);
      return {
        accessToken: persistentToken.accessToken,
        httpClient: persistentToken.httpClient,
        tokenResponse: persistentToken.tokenResponse,
        tokenStatus: persistentToken.tokenStatus,
      };
    }
  } catch (error) {
    console.warn("banco-inter-sync persistent token read warning", serializeError(error));
  }

  const actionLabel = options.actionLabel ? `${options.actionLabel}: ` : "";
  const cooldownSeconds = getTokenCooldownSeconds(cacheKey);
  if (cooldownSeconds > 0) {
    throw new BancoInterAuthError(
      `Falha ao autenticar no Banco Inter para ${actionLabel}scope '${scope}': autenticação temporariamente pausada após limite do Banco Inter. Tente novamente em cerca de ${cooldownSeconds} segundos.`,
      429,
      cooldownSeconds,
    );
  }

  const inFlightRequest = interTokenRequests.get(cacheKey);
  if (inFlightRequest) return await inFlightRequest;

  const tokenRequest = (async (): Promise<InterTokenResult> => {
    let refreshOwner: string | null = crypto.randomUUID();
    let refreshLeaseAcquired = false;

    try {
      try {
        refreshLeaseAcquired = await claimPersistentInterTokenRefresh(
          config,
          scope,
          clientFingerprint,
          refreshOwner,
        );

        if (!refreshLeaseAcquired) {
          const sharedToken = await waitForPersistentInterToken(config, scope, clientFingerprint);
          if (sharedToken) {
            interTokenCache.set(cacheKey, sharedToken);
            return sharedToken;
          }

          refreshLeaseAcquired = await claimPersistentInterTokenRefresh(
            config,
            scope,
            clientFingerprint,
            refreshOwner,
          );
          if (!refreshLeaseAcquired) {
            throw new BancoInterAuthError(
              `O token do Banco Inter para o scope '${scope}' ainda esta sendo renovado por outra instancia. Tente novamente em alguns segundos.`,
              503,
              2,
            );
          }
        }
      } catch (error) {
        if (error instanceof BancoInterAuthError) throw error;
        console.warn("banco-inter-sync token refresh coordination warning", serializeError(error));
        refreshOwner = null;
        refreshLeaseAcquired = false;
      }

      const errors: string[] = [];

      for (const tokenAuthMode of modes) {
        const httpClient = await createHttpClient(config);
        const formData = new URLSearchParams();
        formData.set("grant_type", "client_credentials");
        if (scope) formData.set("scope", scope);
        if (tokenAuthMode !== "basic") {
          formData.set("client_id", clientId);
          formData.set("client_secret", clientSecret);
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        };

        if (tokenAuthMode === "basic") {
          headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
        }

        const response = await fetch(tokenUrl, {
          method: "POST",
          headers,
          body: formData.toString(),
          client: httpClient,
        });

        const rawText = await response.text();
        let parsed: Record<string, unknown> = {};
        try {
          parsed = rawText ? JSON.parse(rawText) : {};
        } catch {
          parsed = { raw: rawText };
        }

        if (!response.ok) {
          const scopeHint = buildScopeRegistrationHint(scope, parsed);
          if (scopeHint) {
            throw new BancoInterAuthError(
              `Falha ao autenticar no Banco Inter para ${actionLabel}scope '${scope}': ${tokenAuthMode}:${response.status}:${scopeHint}`,
            );
          }

          if (response.status === 429) {
            const retryAfterSeconds = resolveRetryAfterSeconds(response);
            interTokenCooldowns.set(cacheKey, Date.now() + retryAfterSeconds * 1000);
            const rateLimitHint = buildTokenRateLimitHint(scope, retryAfterSeconds);
            throw new BancoInterAuthError(
              `Falha ao autenticar no Banco Inter para ${actionLabel}scope '${scope}': ${tokenAuthMode}:429:${rateLimitHint}`,
              429,
              retryAfterSeconds,
            );
          }

          errors.push(`${tokenAuthMode}:${response.status}:${JSON.stringify(parsed)}`);
          continue;
        }

        const accessToken = sanitizeText(firstDefined(parsed.access_token, parsed.token));
        if (!accessToken) {
          errors.push(`${tokenAuthMode}:${response.status}:sem access_token`);
          continue;
        }

        const tokenResult = { accessToken, httpClient, tokenResponse: parsed, tokenStatus: response.status };
        const expiresAt = Date.now() + resolveTokenCacheTtl(parsed);
        interTokenCooldowns.delete(cacheKey);
        interTokenCache.set(cacheKey, { ...tokenResult, expiresAt });
        try {
          await persistInterToken(
            config,
            scope,
            clientFingerprint,
            refreshLeaseAcquired ? refreshOwner : null,
            accessToken,
            expiresAt,
          );
        } catch (error) {
          console.warn("banco-inter-sync persistent token write warning", serializeError(error));
        }
        return tokenResult;
      }

      throw new BancoInterAuthError(
        `Falha ao autenticar no Banco Inter para ${actionLabel}scope '${scope}': ${errors.join(" | ")}`,
      );
    } finally {
      if (refreshLeaseAcquired && refreshOwner) {
        await releasePersistentInterTokenRefresh(config, scope, refreshOwner).catch((error) => {
          console.warn("banco-inter-sync token refresh release warning", serializeError(error));
        });
      }
    }
  })();

  interTokenRequests.set(cacheKey, tokenRequest);
  try {
    return await tokenRequest;
  } finally {
    if (interTokenRequests.get(cacheKey) === tokenRequest) {
      interTokenRequests.delete(cacheKey);
    }
  }
}

async function fetchExtrato(
  config: IntegrationConfig,
  accessToken: string,
  httpClient: Deno.HttpClient,
  fromDate: string,
  toDate: string,
) {
  const apiBaseUrl = sanitizeText(config.api_base_url || getConfigValue(config, "api_base_url"), DEFAULT_API_BASE_URL);
  const extratoPath = sanitizeText(getConfigValue(config, "extrato_path"), DEFAULT_EXTRATO_PATH);
  const extraHeaders = (config.extra_headers || getConfigValue<Record<string, unknown>>(config, "extra_headers") || {}) as Record<string, unknown>;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  const accountNumber = sanitizeText(getConfigValue(config, "account_number")).replace(/\D/g, "");
  if (accountNumber) headers["x-conta-corrente"] = accountNumber;

  Object.entries(extraHeaders).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      headers[key] = String(value);
    }
  });

  const pageSize = 1000;
  const transactions: Record<string, unknown>[] = [];
  let page = 0;
  let httpStatus = 200;
  let lastPayload: Record<string, unknown> = {};

  while (page < 100) {
    const url = new URL(extratoPath, apiBaseUrl);
    url.searchParams.set("dataInicio", fromDate);
    url.searchParams.set("dataFim", toDate);
    url.searchParams.set("pagina", String(page));
    url.searchParams.set("tamanhoPagina", String(pageSize));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
      client: httpClient,
    });

    const rawText = await response.text();
    let parsed: unknown = {};
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
      parsed = { raw: rawText };
    }

    if (!response.ok) {
      throw new Error(`Falha ao consultar extrato completo no Banco Inter (${response.status}): ${JSON.stringify(parsed)}`);
    }

    httpStatus = response.status;
    const batch = getTransactionArray(parsed);
    transactions.push(...batch);
    lastPayload = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};

    const totalPages = Number(firstDefined(lastPayload.totalPaginas, lastPayload.total_pages));
    const explicitlyLastPage = firstDefined(lastPayload.ultimaPagina, lastPayload.last) === true;
    const hasKnownTotal = Number.isFinite(totalPages) && totalPages > 0;
    if (
      Array.isArray(parsed)
      || explicitlyLastPage
      || (hasKnownTotal && page + 1 >= totalPages)
      || (!hasKnownTotal && batch.length < pageSize)
    ) {
      break;
    }

    page += 1;
  }

  return {
    payload: { ...lastPayload, transacoes: transactions },
    httpStatus,
  };
}

async function fetchScopedInterJson(
  config: IntegrationConfig,
  {
    path,
    scopeConfigKey,
    fallbackScope,
    actionLabel,
    searchParams,
    auth,
  }: {
    path: string;
    scopeConfigKey: string;
    fallbackScope: string;
    actionLabel: string;
    searchParams?: Record<string, string>;
    auth?: InterTokenResult | null;
  },
) {
  const { accessToken, httpClient } = auth || await getAccessToken(config, {
      scopeConfigKey,
      fallbackScope,
      actionLabel,
    });
  const apiBaseUrl = sanitizeText(config.api_base_url || getConfigValue(config, "api_base_url"), DEFAULT_API_BASE_URL);
  const url = new URL(path, apiBaseUrl);
  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  const accountNumber = sanitizeText(getConfigValue(config, "account_number")).replace(/\D/g, "");
  if (accountNumber) headers["x-conta-corrente"] = accountNumber;
  const extraHeaders = (config.extra_headers || getConfigValue<Record<string, unknown>>(config, "extra_headers") || {}) as Record<string, unknown>;
  Object.entries(extraHeaders).forEach(([key, value]) => {
    if (value !== null && value !== undefined) headers[key] = String(value);
  });

  const response = await fetch(url.toString(), {
    method: "GET",
    headers,
    client: httpClient,
  });
  const rawText = await response.text();
  let parsed: unknown = {};
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsed = { raw: rawText };
  }

  if (!response.ok) {
    throw new Error(`Falha ao ${actionLabel} no Banco Inter (${response.status}): ${JSON.stringify(parsed)}`);
  }

  return parsed;
}

async function fetchExtratoResilient(
  config: IntegrationConfig,
  accessToken: string,
  httpClient: Deno.HttpClient,
  fromDate: string,
  toDate: string,
  attempt = 1,
): Promise<{ payload: unknown; httpStatus: number; processedWindows: number }> {
  try {
    const result = await fetchExtrato(config, accessToken, httpClient, fromDate, toDate);
    return {
      ...result,
      processedWindows: 1,
    };
  } catch (error) {
    if (isTransientUpstreamError(error) && attempt < 3) {
      await wait(attempt * 1500);
      return fetchExtratoResilient(config, accessToken, httpClient, fromDate, toDate, attempt + 1);
    }

    if (isTransientUpstreamError(error)) {
      const splitWindow = splitDateWindow(fromDate, toDate);
      if (splitWindow) {
        const left = await fetchExtratoResilient(
          config,
          accessToken,
          httpClient,
          splitWindow.left.from,
          splitWindow.left.to,
          1,
        );
        const right = await fetchExtratoResilient(
          config,
          accessToken,
          httpClient,
          splitWindow.right.from,
          splitWindow.right.to,
          1,
        );

        return {
          payload: [
            ...getTransactionArray(left.payload),
            ...getTransactionArray(right.payload),
          ],
          httpStatus: right.httpStatus || left.httpStatus,
          processedWindows: left.processedWindows + right.processedWindows,
        };
      }
    }

    throw error;
  }
}

function extractBalancePrimitive(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const cleaned = value.trim();
    if (!cleaned) return null;
    const numeric = toNumber(cleaned);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

function extractBalanceValue(payload: unknown, depth = 0): number | null {
  if (depth > 5 || payload === null || payload === undefined) return null;

  const primitive = extractBalancePrimitive(payload);
  if (primitive !== null) {
    return primitive;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested = extractBalanceValue(item, depth + 1);
      if (nested !== null) return nested;
    }
    return null;
  }

  if (typeof payload !== "object") return null;

  const source = payload as Record<string, unknown>;
  const preferredKeys = [
    "saldo",
    "balance",
    "valor",
    "disponivel",
    "saldoDisponivel",
    "availableBalance",
  ];

  for (const key of preferredKeys) {
    const value = source[key];
    const direct = extractBalancePrimitive(value);
    if (direct !== null) return direct;
  }

  for (const key of preferredKeys) {
    const value = source[key];
    if (value && typeof value === "object") {
      const nested = extractBalanceValue(value, depth + 1);
      if (nested !== null) return nested;
    }
  }

  const nestedCandidates = [
    source.saldos,
    source.items,
    source.data,
    source.result,
    source.content,
    source.response,
  ];

  for (const candidate of nestedCandidates) {
    const nested = extractBalanceValue(candidate, depth + 1);
    if (nested !== null) return nested;
  }

  return null;
}

async function fetchBalance(
  config: IntegrationConfig,
  accessToken: string,
  httpClient: Deno.HttpClient,
  balanceDate: string,
) {
  const apiBaseUrl = sanitizeText(config.api_base_url || getConfigValue(config, "api_base_url"), DEFAULT_API_BASE_URL);
  const configuredBalancePath = sanitizeText(config.balance_path || getConfigValue(config, "balance_path"));
  const pathCandidates = [configuredBalancePath, ...DEFAULT_BALANCE_PATHS].filter(Boolean);
  const uniquePaths = Array.from(new Set(pathCandidates));
  const extraHeaders = (config.extra_headers || getConfigValue<Record<string, unknown>>(config, "extra_headers") || {}) as Record<string, unknown>;
  const queryBuilders = [
    (url: URL) => url.searchParams.set("dataSaldo", balanceDate),
    (url: URL) => {
      url.searchParams.set("dataInicio", balanceDate);
      url.searchParams.set("dataFim", balanceDate);
    },
    (_url: URL) => undefined,
  ];
  const errors: string[] = [];

  for (const path of uniquePaths) {
    for (const applyQuery of queryBuilders) {
      const url = new URL(path, apiBaseUrl);
      applyQuery(url);

      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      };

      Object.entries(extraHeaders).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          headers[key] = String(value);
        }
      });

      const response = await fetch(url.toString(), {
        method: "GET",
        headers,
        client: httpClient,
      });

      const rawText = await response.text();
      let parsed: unknown = {};
      try {
        parsed = rawText ? JSON.parse(rawText) : {};
      } catch {
        parsed = { raw: rawText };
      }

      if (!response.ok) {
        errors.push(`${path}:${response.status}:${JSON.stringify(parsed)}`);
        continue;
      }

      const balanceValue = extractBalanceValue(parsed);
      if (balanceValue === null) {
        errors.push(`${path}:${response.status}:saldo_nao_encontrado:${JSON.stringify(parsed)}`);
        continue;
      }

      return {
        balance: balanceValue,
        payload: parsed,
        httpStatus: response.status,
        path,
      };
    }
  }

  throw new Error(`Falha ao consultar saldo no Banco Inter: ${errors.join(" | ")}`);
}

function buildChargeHeaders(
  config: IntegrationConfig,
  accessToken: string,
  accept = "application/json",
) {
  const extraHeaders = (config.extra_headers || getConfigValue<Record<string, unknown>>(config, "extra_headers") || {}) as Record<string, unknown>;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: accept,
    "Content-Type": "application/json",
  };

  const contaCorrente = sanitizeText(
    firstDefined(
      getConfigValue(config, "conta_corrente"),
      getConfigValue(config, "account_number"),
      extraHeaders["x-conta-corrente"],
    ),
  );
  if (contaCorrente) {
    headers["x-conta-corrente"] = contaCorrente.replace(/\D/g, "");
  }

  Object.entries(extraHeaders).forEach(([key, value]) => {
    if (value !== null && value !== undefined && key !== "x-conta-corrente") {
      headers[key] = String(value);
    }
  });

  return headers;
}

function normalizeCpfCnpj(value: unknown) {
  return sanitizeText(value).replace(/\D/g, "");
}

function inferPagadorTipo(cpfCnpj: string) {
  return cpfCnpj.length > 11 ? "JURIDICA" : "FISICA";
}

function normalizeChargePhone(value: unknown) {
  const digits = sanitizeText(value).replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.length <= 9) return digits;
  return digits.slice(-9);
}

function normalizeChargeCep(value: unknown) {
  const digits = sanitizeText(value).replace(/\D/g, "");
  return digits || undefined;
}

function buildBudgetChargePayerFingerprint(source: Record<string, unknown>) {
  return JSON.stringify({
    nome: sanitizeText(source.responsavel_nome),
    cpf_cnpj: normalizeCpfCnpj(source.responsavel_cpf_cnpj),
    email: sanitizeText(source.responsavel_email),
    telefone: sanitizeText(source.responsavel_telefone),
    cep: normalizeChargeCep(source.responsavel_cep),
    endereco: sanitizeText(source.responsavel_endereco),
    numero: sanitizeText(source.responsavel_numero),
    bairro: sanitizeText(source.responsavel_bairro),
    cidade: sanitizeText(source.responsavel_cidade),
    uf: sanitizeText(source.responsavel_uf).toUpperCase(),
  });
}

function buildBudgetChargeSeuNumero(orcamentoId: string, uniqueSuffix = "") {
  const cleanBudgetId = sanitizeText(orcamentoId).replace(/[^a-zA-Z0-9]/g, "");
  const suffix = sanitizeText(uniqueSuffix).replace(/[^a-zA-Z0-9]/g, "");
  if (!suffix) {
    return `orc${cleanBudgetId.slice(-11)}`;
  }
  return `orc${cleanBudgetId.slice(-7)}${suffix.slice(-4)}`;
}

function buildWalletChargeSeuNumero(walletChargeId: string) {
  const cleanId = sanitizeText(walletChargeId).replace(/[^a-zA-Z0-9]/g, "");
  return `car${cleanId.slice(-11)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizePermission(value: unknown) {
  return sanitizeText(value).toLowerCase();
}

function normalizePermissionList(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map(normalizePermission).filter(Boolean))]
    : [];
}

function permissionMatches(granted: string, required: string) {
  const normalizedGranted = normalizePermission(granted);
  const normalizedRequired = normalizePermission(required);
  if (!normalizedGranted || !normalizedRequired) return false;
  if (normalizedGranted === "*" || normalizedGranted === "platform:*") return true;
  if (normalizedGranted === normalizedRequired) return true;

  const [grantedResource, grantedAction] = normalizedGranted.split(":");
  const [requiredResource] = normalizedRequired.split(":");
  return Boolean(grantedResource && grantedResource === requiredResource && grantedAction === "*");
}

async function getAuthenticatedRequestUser(request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return null;

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user?.id) return null;
  return data.user;
}

function hasWalletChargePermission(
  profile: Record<string, unknown>,
  accessProfile: Record<string, unknown> | null,
  unitRole: string,
) {
  if (profile.is_platform_admin === true || sanitizeText(profile.company_role) === "platform_admin") {
    return true;
  }

  const permissions = normalizePermissionList(accessProfile?.permissoes);
  if (permissions.some((permission) => ["financeiro:update", "financeiro:*", "platform:*"]
    .some((required) => permissionMatches(permission, required)))) {
    return true;
  }

  const haystack = [
    profile.profile,
    profile.company_role,
    unitRole,
    accessProfile?.codigo,
    accessProfile?.nome,
  ]
    .map(normalizePermission)
    .filter(Boolean)
    .join(" ");

  return ["gestor", "gerencia", "gerencial", "financeiro", "administrativo", "master", "diretoria", "backoffice"]
    .some((role) => haystack.includes(role));
}

async function requireWalletChargeStaff(request: Request, empresaId: string) {
  const authUser = await getAuthenticatedRequestUser(request);
  if (!authUser?.id) {
    throw new WalletChargeAuthorizationError("Sessao invalida para operar cobrancas da carteira.", 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, empresa_id, profile, company_role, access_profile_id, is_platform_admin, active")
    .eq("id", authUser.id)
    .maybeSingle();

  if (profileError || !profile) {
    throw new WalletChargeAuthorizationError("Nao foi possivel validar o usuario atual.", 401);
  }
  if (profile.active === false) {
    throw new WalletChargeAuthorizationError("Este acesso esta desativado.", 403);
  }

  const normalizedEmpresaId = sanitizeText(empresaId);
  if (!normalizedEmpresaId) {
    throw new WalletChargeAuthorizationError("Selecione a unidade para operar a cobranca.", 400);
  }

  let unitRole = "";
  let hasUnitAccess = profile.is_platform_admin === true
    || sanitizeText(profile.company_role) === "platform_admin"
    || sanitizeText(profile.empresa_id) === normalizedEmpresaId;
  if (!hasUnitAccess) {
    const { data: unitAccess, error: unitAccessError } = await supabase
      .from("user_unit_access")
      .select("empresa_id, papel, ativo")
      .eq("user_id", profile.id)
      .eq("empresa_id", normalizedEmpresaId)
      .eq("ativo", true)
      .maybeSingle();

    if (unitAccessError) throw unitAccessError;
    hasUnitAccess = Boolean(unitAccess);
    unitRole = sanitizeText(unitAccess?.papel);
  }

  if (!hasUnitAccess) {
    throw new WalletChargeAuthorizationError("Voce nao tem acesso a esta unidade.", 403);
  }

  let accessProfile: Record<string, unknown> | null = null;
  const accessProfileId = sanitizeText(profile.access_profile_id);
  if (accessProfileId) {
    const { data, error } = await supabase
      .from("perfil_acesso")
      .select("id, codigo, nome, permissoes, ativo")
      .eq("id", accessProfileId)
      .maybeSingle();
    if (error) throw error;
    if (data?.ativo === false) {
      throw new WalletChargeAuthorizationError("O perfil de acesso deste usuario esta inativo.", 403);
    }
    accessProfile = data || null;
  }

  if (!hasWalletChargePermission(profile, accessProfile, unitRole)) {
    throw new WalletChargeAuthorizationError("Seu perfil nao possui permissao para emitir cobrancas da carteira.", 403);
  }

  return { profile, authUser, empresaId: normalizedEmpresaId };
}

function buildWalletChargePublicToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function hashWalletChargePublicToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildWalletChargeTokenExpiry(dueDate: string) {
  const dueAt = new Date(`${dueDate}T23:59:59.999-03:00`);
  const baseDate = Number.isNaN(dueAt.getTime()) ? new Date() : dueAt;
  baseDate.setDate(baseDate.getDate() + 30);
  return baseDate.toISOString();
}

function getWalletChargeMetadata(row: Record<string, unknown>) {
  return asRecord(row.metadata);
}

function isWalletChargeActive(row: Record<string, unknown>) {
  return sanitizeText(row.status).toLowerCase() === "emitido";
}

function buildWalletChargePublicResponse(row: Record<string, unknown>) {
  const metadata = getWalletChargeMetadata(row);
  const active = isWalletChargeActive(row);
  const status = sanitizeText(row.status, "pendente_emissao").toLowerCase();

  return {
    id: sanitizeText(row.id),
    provider: "Banco Inter",
    responsavel_nome: sanitizeText(metadata.responsavel_nome, "Responsavel financeiro"),
    descricao: sanitizeText(row.descricao),
    valor: toNumber(row.valor),
    data_vencimento: sanitizeText(row.data_vencimento),
    emitido_em: row.emitido_em || row.created_date || null,
    status,
    pago_em: row.pago_em || null,
    metodo: sanitizeText(row.metodo, "boleto_bancario"),
    ativo: active,
    boleto: active ? {
      linha_digitavel: sanitizeText(row.linha_digitavel) || null,
      codigo_barras: sanitizeText(row.codigo_barras) || null,
      pdf_disponivel: row.pdf_disponivel === true,
    } : null,
    pix: active ? {
      copia_e_cola: sanitizeText(row.pix_copia_cola) || null,
    } : null,
  };
}

function mapInterChargeStatus(situacao: string) {
  const normalized = sanitizeText(situacao).toUpperCase();
  if (normalized === "RECEBIDO") return "recebido";
  if (["BAIXADO", "CANCELADO", "CANCELADA"].includes(normalized)) return "baixado";
  if (["EXPIRADO", "VENCIDO", "VENCIDA"].includes(normalized)) return "expirado";
  return "emitido";
}

function buildChargeIssuePayload(payload: Record<string, unknown>) {
  const payerName = sanitizeText(payload.responsavel_nome);
  const payerDocument = normalizeCpfCnpj(payload.responsavel_cpf_cnpj);
  const dueDate = sanitizeText(payload.data_vencimento);
  const amount = Number(payload.valor || 0);
  const seuNumero = sanitizeText(payload.seu_numero || buildBudgetChargeSeuNumero(sanitizeText(payload.orcamento_id)));
  const payerStreet = sanitizeText(payload.responsavel_endereco);
  const payerNumber = sanitizeText(payload.responsavel_numero);
  const payerCity = sanitizeText(payload.responsavel_cidade);
  const payerState = sanitizeText(payload.responsavel_uf).toUpperCase();
  const payerZip = normalizeChargeCep(payload.responsavel_cep);
  const payerNeighborhood = sanitizeText(payload.responsavel_bairro) || undefined;
  const payerPhone = normalizeChargePhone(payload.responsavel_telefone);
  const payerAddress = [payerStreet, payerNumber].filter(Boolean).join(", ");

  if (!payerName) throw new Error("Nome do responsável financeiro é obrigatório para emitir a cobrança.");
  if (!payerDocument || ![11, 14].includes(payerDocument.length)) throw new Error("CPF/CNPJ válido do responsável financeiro é obrigatório para emitir a cobrança.");
  if (!dueDate) throw new Error("Data de vencimento é obrigatória para emitir a cobrança.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Valor do orçamento deve ser maior que zero para emitir a cobrança.");
  if (!payerStreet || !payerCity || !payerState || !payerZip) {
    throw new Error("Endereço completo da carteira (rua, cidade, UF e CEP) é obrigatório para emitir a cobrança no Banco Inter.");
  }

  return {
    seuNumero,
    valorNominal: Number(amount.toFixed(2)),
    dataVencimento: dueDate,
    numDiasAgenda: Number(payload.num_dias_agenda || 0),
    pagador: {
      tipoPessoa: inferPagadorTipo(payerDocument),
      nome: payerName,
      cpfCnpj: payerDocument,
      email: sanitizeText(payload.responsavel_email) || undefined,
      telefone: payerPhone,
      cep: payerZip,
      cidade: payerCity,
      uf: payerState,
      endereco: payerAddress,
      bairro: payerNeighborhood,
    },
    mensagem: {
      linha1: sanitizeText(payload.mensagem_linha_1 || `Orçamento ${sanitizeText(payload.orcamento_id)}`),
      linha2: sanitizeText(payload.mensagem_linha_2 || "Dog City Brasil"),
    },
    formasRecebimento: ["BOLETO", "PIX"],
  };
}

function normalizeChargeApiResponse(raw: Record<string, unknown> = {}) {
  const cobranca = (raw.cobranca && typeof raw.cobranca === "object" ? raw.cobranca : raw) as Record<string, unknown>;
  const boleto = (raw.boleto && typeof raw.boleto === "object" ? raw.boleto : {}) as Record<string, unknown>;
  const pix = (raw.pix && typeof raw.pix === "object" ? raw.pix : {}) as Record<string, unknown>;

  return {
    cobranca,
    boleto,
    pix,
    codigoSolicitacao: sanitizeText(firstDefined(cobranca.codigoSolicitacao, raw.codigoSolicitacao)),
    situacao: sanitizeText(firstDefined(cobranca.situacao, raw.situacao, raw.status), "EM_PROCESSAMENTO"),
    dataHoraSituacao: sanitizeText(firstDefined(cobranca.dataHoraSituacao, raw.dataHoraSituacao, raw.dataPagamento)),
    valorTotalRecebido: toNumber(firstDefined(cobranca.valorTotalRecebido, raw.valorTotalRecebido, cobranca.valorNominal, raw.valorNominal)),
    origemRecebimento: sanitizeText(firstDefined(cobranca.origemRecebimento, raw.origemRecebimento)),
    seuNumero: sanitizeText(firstDefined(cobranca.seuNumero, raw.seuNumero)),
    valorNominal: toNumber(firstDefined(cobranca.valorNominal, raw.valorNominal)),
    nossoNumero: sanitizeText(firstDefined(boleto.nossoNumero, raw.nossoNumero)),
    codigoBarras: sanitizeText(firstDefined(boleto.codigoBarras, raw.codigoBarras)),
    linhaDigitavel: sanitizeText(firstDefined(boleto.linhaDigitavel, raw.linhaDigitavel)),
    txid: sanitizeText(firstDefined(pix.txid, raw.txid)),
    pixCopiaECola: sanitizeText(firstDefined(pix.pixCopiaECola, raw.pixCopiaECola)),
  };
}

async function createChargeForBudget(config: IntegrationConfig, payload: Record<string, unknown>) {
  const { accessToken, httpClient } = await getAccessToken(config, {
    scopeConfigKey: "charge_write_scope",
    fallbackScope: DEFAULT_CHARGE_WRITE_SCOPE,
    actionLabel: "emitir cobrança",
  });
  const apiBaseUrl = sanitizeText(config.api_base_url || getConfigValue(config, "api_base_url"), DEFAULT_API_BASE_URL);
  const chargePath = sanitizeText(getConfigValue(config, "charge_path"), DEFAULT_CHARGE_PATH);
  const url = new URL(chargePath, apiBaseUrl);
  const body = buildChargeIssuePayload(payload);
  const headers = buildChargeHeaders(config, accessToken);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    client: httpClient,
  });

  const rawText = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsed = { raw: rawText };
  }

  if (!response.ok) {
    const authHint = response.status === 401 ? buildInterApi401Hint(config, parsed) : null;
    if (authHint) {
      throw new Error(`Falha ao emitir cobrança no Banco Inter (${response.status}): ${authHint}`);
    }
    throw new Error(`Falha ao emitir cobrança no Banco Inter (${response.status}): ${JSON.stringify(parsed)}`);
  }

  return normalizeChargeApiResponse(parsed);
}

async function fetchChargeForBudget(config: IntegrationConfig, codigoSolicitacao: string) {
  const { accessToken, httpClient } = await getAccessToken(config, {
    scopeConfigKey: "charge_read_scope",
    fallbackScope: DEFAULT_CHARGE_READ_SCOPE,
    actionLabel: "consultar cobrança",
  });
  const apiBaseUrl = sanitizeText(config.api_base_url || getConfigValue(config, "api_base_url"), DEFAULT_API_BASE_URL);
  const chargePath = sanitizeText(getConfigValue(config, "charge_path"), DEFAULT_CHARGE_PATH);
  const url = new URL(`${chargePath}/${codigoSolicitacao}`, apiBaseUrl);
  const headers = buildChargeHeaders(config, accessToken);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers,
    client: httpClient,
  });

  const rawText = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsed = { raw: rawText };
  }

  if (!response.ok) {
    const authHint = response.status === 401 ? buildInterApi401Hint(config, parsed) : null;
    if (authHint) {
      throw new Error(`Falha ao consultar cobrança no Banco Inter (${response.status}): ${authHint}`);
    }
    throw new Error(`Falha ao consultar cobrança no Banco Inter (${response.status}): ${JSON.stringify(parsed)}`);
  }

  return normalizeChargeApiResponse(parsed);
}

async function fetchChargePdfForBudget(config: IntegrationConfig, codigoSolicitacao: string) {
  const { accessToken, httpClient } = await getAccessToken(config, {
    scopeConfigKey: "charge_read_scope",
    fallbackScope: DEFAULT_CHARGE_READ_SCOPE,
    actionLabel: "baixar PDF da cobrança",
  });
  const apiBaseUrl = sanitizeText(config.api_base_url || getConfigValue(config, "api_base_url"), DEFAULT_API_BASE_URL);
  const chargePath = sanitizeText(getConfigValue(config, "charge_path"), DEFAULT_CHARGE_PATH);
  const url = new URL(`${chargePath}/${codigoSolicitacao}/pdf`, apiBaseUrl);
  const headers = buildChargeHeaders(config, accessToken);
  headers.Accept = "application/json";

  const response = await fetch(url.toString(), {
    method: "GET",
    headers,
    client: httpClient,
  });

  const rawText = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsed = { raw: rawText };
  }

  if (!response.ok) {
    const authHint = response.status === 401 ? buildInterApi401Hint(config, parsed) : null;
    if (authHint) {
      throw new Error(`Falha ao baixar PDF da cobrança no Banco Inter (${response.status}): ${authHint}`);
    }
    throw new Error(`Falha ao baixar PDF da cobrança no Banco Inter (${response.status}): ${JSON.stringify(parsed)}`);
  }

  const pdf = sanitizeText(firstDefined(parsed.pdf, parsed.arquivo, parsed.file));
  if (!pdf) {
    throw new Error("O Banco Inter não retornou o PDF da cobrança.");
  }
  return pdf;
}

async function loadBudgetPaymentRow(id: string) {
  const { data, error } = await supabase
    .from("orcamento_pagamento")
    .select("*")
    .eq("id", id)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function loadLatestBudgetPaymentByBudget(orcamentoId: string, metodo: string) {
  const { data, error } = await supabase
    .from("orcamento_pagamento")
    .select("*")
    .eq("orcamento_id", orcamentoId)
    .eq("metodo", metodo)
    .order("created_date", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

async function saveBudgetPaymentRow(row: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("orcamento_pagamento")
    .upsert([row], { onConflict: "id" })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data || row;
}

async function loadWalletChargeRow(id: string) {
  const { data, error } = await supabase
    .from("carteira_cobranca")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function loadWalletChargeByPublicTokenHash(tokenHash: string) {
  const { data, error } = await supabase
    .from("carteira_cobranca")
    .select("*")
    .eq("public_token_hash", tokenHash)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function saveWalletChargeRow(row: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("carteira_cobranca")
    .upsert([row], { onConflict: "id" })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data || row;
}

function buildWalletChargeStaffResponse(row: Record<string, unknown>) {
  return {
    id: sanitizeText(row.id),
    carteira_id: sanitizeText(row.carteira_id),
    carteira_conta_id: sanitizeText(row.carteira_conta_id) || null,
    metodo: sanitizeText(row.metodo, "boleto_bancario"),
    status: sanitizeText(row.status, "pendente_emissao"),
    status_inter: sanitizeText(row.status_inter) || null,
    valor: toNumber(row.valor),
    descricao: sanitizeText(row.descricao),
    data_vencimento: sanitizeText(row.data_vencimento),
    emitido_em: row.emitido_em || row.created_date || null,
    pago_em: row.pago_em || null,
    criado_em: row.created_date || null,
    pdf_disponivel: row.pdf_disponivel === true,
    public_link_available: Boolean(row.public_token_hash && row.public_token_expires_at),
    public_link_expires_at: row.public_token_expires_at || null,
  };
}

function parseCarteiraContact(value: unknown) {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return asRecord(value);
}

async function loadWalletChargePayer(empresaId: string, carteiraId: string) {
  const { data: carteira, error } = await supabase
    .from("carteira")
    .select("id, empresa_id, nome_razao_social, cpf_cnpj, email, celular, street, numero_residencia, neighborhood, city, state, cep, contato_orcamentos")
    .eq("id", carteiraId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (error) throw error;
  if (!carteira) {
    throw new Error("Carteira do responsavel financeiro nao localizada para esta unidade.");
  }

  const contact = parseCarteiraContact(carteira.contato_orcamentos);
  return {
    carteira,
    payer: {
      // The registered wallet owner is the legal payer. The budget contact may
      // be another person and must never replace the payer's name on the bill.
      responsavel_nome: sanitizeText(carteira.nome_razao_social),
      responsavel_cpf_cnpj: normalizeCpfCnpj(carteira.cpf_cnpj),
      responsavel_email: sanitizeText(contact.email, sanitizeText(carteira.email)),
      responsavel_telefone: sanitizeText(contact.celular, sanitizeText(carteira.celular)),
      responsavel_cep: normalizeChargeCep(carteira.cep),
      responsavel_endereco: sanitizeText(carteira.street),
      responsavel_numero: sanitizeText(carteira.numero_residencia),
      responsavel_bairro: sanitizeText(carteira.neighborhood),
      responsavel_cidade: sanitizeText(carteira.city),
      responsavel_uf: sanitizeText(carteira.state).toUpperCase(),
    },
  };
}

function resolveWalletChargePublicUrl(
  config: IntegrationConfig,
  payload: Record<string, unknown>,
  publicToken: string,
) {
  const configuredBaseUrl = sanitizeText(
    Deno.env.get("PUBLIC_APP_URL")
      || getConfigValue<string>(config, "public_app_url")
      || payload.public_base_url,
  );
  if (!configuredBaseUrl) {
    throw new Error("Defina PUBLIC_APP_URL na Edge Function ou informe a URL publica do app para gerar o link de cobranca.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(configuredBaseUrl);
  } catch {
    throw new Error("A URL publica configurada para o link de cobranca e invalida.");
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error("A URL publica do link de cobranca deve usar HTTP ou HTTPS.");
  }

  return `${parsedUrl.origin}/cobranca/${encodeURIComponent(publicToken)}`;
}

async function ensureWalletAccountForBudget(empresaId: string, carteiraId: string) {
  const normalizedEmpresaId = sanitizeText(empresaId);
  const normalizedCarteiraId = sanitizeText(carteiraId);
  if (!normalizedEmpresaId || !normalizedCarteiraId) return null;

  const { data: existingAccount, error: existingError } = await supabase
    .from("carteira_conta")
    .select("id, empresa_id, carteira_id")
    .eq("empresa_id", normalizedEmpresaId)
    .eq("carteira_id", normalizedCarteiraId)
    .order("created_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existingAccount?.id) return sanitizeText(existingAccount.id);

  const now = new Date().toISOString();
  const { data: createdAccount, error: createError } = await supabase
    .from("carteira_conta")
    .insert([{
      empresa_id: normalizedEmpresaId,
      carteira_id: normalizedCarteiraId,
      saldo_atual: 0,
      saldo_negativo_autorizado: false,
      ativo: true,
      observacoes_financeiras: "Conta criada automaticamente pelo fluxo de cobrança do orçamento.",
      created_date: now,
      updated_date: now,
    }])
    .select("id")
    .maybeSingle();

  if (createError) throw createError;
  return sanitizeText(createdAccount?.id) || null;
}

function normalizeSearchText(value: unknown) {
  return sanitizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

type WalletPaymentSource = "orcamento_pagamento" | "carteira_cobranca";

function getPaymentTransactionContext(row: Record<string, unknown>, paymentSource: WalletPaymentSource) {
  const metadata = asRecord(row.metadata);
  const webhookEvent = asRecord(metadata.webhook_last_event);
  const chargeSnapshot = asRecord(metadata.charge_snapshot);
  const charge = asRecord(chargeSnapshot.cobranca);
  const pix = asRecord(chargeSnapshot.pix);
  const paymentId = sanitizeText(row.id);
  const paidAtInput = firstDefined(
    row.pago_em,
    webhookEvent.dataHoraSituacao,
    chargeSnapshot.dataHoraSituacao,
    charge.dataHoraSituacao,
    row.updated_date,
    row.created_date,
  );
  const paidAtDate = normalizeDateInput(sanitizeText(paidAtInput) || new Date());
  const paidAt = paidAtDate.toISOString();
  const paidDate = formatBusinessDateOnly(paidAtDate);
  const amount = toNumber(firstDefined(row.valor_recebido, webhookEvent.valorTotalRecebido, chargeSnapshot.valorTotalRecebido, row.valor));
  const payerName = sanitizeText(firstDefined(metadata.responsavel_nome, row.responsavel_nome, row.nome_contraparte));
  const payerDocument = normalizeCpfCnpj(firstDefined(metadata.responsavel_cpf_cnpj, webhookEvent.cpfCnpjPagador, charge.cpfCnpjPagador));
  const codigoSolicitacao = sanitizeText(firstDefined(row.codigo_solicitacao, webhookEvent.codigoSolicitacao, chargeSnapshot.codigoSolicitacao, charge.codigoSolicitacao));
  const txid = sanitizeText(firstDefined(row.txid, webhookEvent.txid, chargeSnapshot.txid, pix.txid));
  const receiptOrigin = sanitizeText(firstDefined(
    webhookEvent.origemRecebimento,
    chargeSnapshot.origemRecebimento,
    charge.origemRecebimento,
  )).toUpperCase();
  const transactionType = receiptOrigin === "PIX" || sanitizeText(row.metodo).toLowerCase().includes("pix")
    ? "PIX"
    : "BOLETO_COBRANCA";

  return {
    paymentSource,
    paymentId,
    paidAt,
    paidDate,
    amount,
    payerName,
    payerDocument,
    codigoSolicitacao,
    txid,
    transactionType,
    canonicalId: `inter_payment_${paymentSource}_${paymentId}`,
  };
}

function buildPaymentIdentifierSet(source: Record<string, unknown>) {
  const rawData = asRecord(source.raw_data);
  const rawDetails = asRecord(rawData.detalhes);
  const metadata = asRecord(source.metadata_financeira);
  return new Set([
    source.referencia,
    rawData.codigoSolicitacao,
    rawDetails.codigoSolicitacao,
    rawData.txid,
    rawDetails.txid,
    metadata.codigo_solicitacao,
    metadata.txid,
  ].map((value) => sanitizeText(value)).filter(Boolean));
}

function selectPaymentTransactionCandidate(
  candidates: Record<string, unknown>[],
  context: ReturnType<typeof getPaymentTransactionContext>,
) {
  const expectedIdentifiers = new Set([context.codigoSolicitacao, context.txid].filter(Boolean));
  const scoredCandidates = candidates
    .map((candidate) => {
      const metadata = asRecord(candidate.metadata_financeira);
      const existingPaymentSource = sanitizeText(metadata.payment_source);
      const existingPaymentId = sanitizeText(metadata.payment_id);
      if (existingPaymentId && (existingPaymentSource !== context.paymentSource || existingPaymentId !== context.paymentId)) {
        return null;
      }

      const identifiers = buildPaymentIdentifierSet(candidate);
      const identifierMatch = [...expectedIdentifiers].some((identifier) => identifiers.has(identifier));
      const samePayment = existingPaymentSource === context.paymentSource && existingPaymentId === context.paymentId;
      if (!samePayment && !identifierMatch) return null;

      const candidateDate = sanitizeText(firstDefined(candidate.data_movimento, candidate.data, candidate.created_date)).slice(0, 10);
      const dateDistance = Math.abs(diffDays(candidateDate, context.paidDate));

      let score = 0;
      if (samePayment) score += 200;
      if (identifierMatch) score += 100;
      if (candidateDate === context.paidDate) score += 8;
      else if (dateDistance === 1) score += 2;
      if (sanitizeText(candidate.tipo).toLowerCase() === "entrada") score += 2;
      return { candidate, score };
    })
    .filter((entry): entry is { candidate: Record<string, unknown>; score: number } => Boolean(entry))
    .sort((left, right) => right.score - left.score);

  if (!scoredCandidates.length) return null;
  const [bestMatch, secondMatch] = scoredCandidates;
  if (secondMatch?.score === bestMatch.score) return null;
  return bestMatch.candidate;
}

async function ensurePaymentExtratoTransaction(row: Record<string, unknown>, paymentSource: WalletPaymentSource) {
  const context = getPaymentTransactionContext(row, paymentSource);
  const empresaId = sanitizeText(row.empresa_id);
  if (!empresaId || !context.paymentId || context.amount <= 0) return null;

  const { data: paymentRows, error: paymentRowsError } = await supabase
    .from("extratobancario")
    .select("*")
    .eq("empresa_id", empresaId)
    .contains("metadata_financeira", {
      payment_source: context.paymentSource,
      payment_id: context.paymentId,
    })
    .limit(2);
  if (paymentRowsError) throw paymentRowsError;

  let targetRow = Array.isArray(paymentRows) && paymentRows.length === 1 ? paymentRows[0] : null;
  if (!targetRow) {
    const { data: candidates, error: candidateError } = await supabase
      .from("extratobancario")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("tipo", "entrada")
      .eq("valor", context.amount)
      .gte("data_movimento", shiftDateOnly(context.paidDate, -1))
      .lte("data_movimento", shiftDateOnly(context.paidDate, 1))
      .order("data_movimento", { ascending: true })
      .limit(100);
    if (candidateError) throw candidateError;
    targetRow = selectPaymentTransactionCandidate(candidates || [], context);
  }

  const existingRawData = asRecord(targetRow?.raw_data);
  const existingRawDetails = asRecord(existingRawData.detalhes);
  const existingMetadata = asRecord(targetRow?.metadata_financeira);
  const reference = context.txid || context.codigoSolicitacao || sanitizeText(targetRow?.referencia) || context.canonicalId;
  const now = new Date().toISOString();
  const { data: savedTransaction, error: saveError } = await supabase
    .from("extratobancario")
    .upsert([{
      id: sanitizeText(targetRow?.id) || context.canonicalId,
      empresa_id: empresaId,
      descricao: sanitizeText(targetRow?.descricao) || `Pagamento recebido de ${context.payerName || "responsavel financeiro"}`,
      tipo: "entrada",
      valor: context.amount,
      data: context.paidDate,
      data_movimento: context.paidDate,
      data_hora_transacao: context.paidAt,
      banco: sanitizeText(targetRow?.banco) || "Banco Inter",
      nome_contraparte: context.payerName || sanitizeText(targetRow?.nome_contraparte) || null,
      banco_contraparte: targetRow?.banco_contraparte || null,
      forma_pagamento: context.transactionType === "PIX" ? "Pix" : "Boleto bancario",
      categoria: targetRow?.categoria || null,
      tipo_transacao_detalhado: context.transactionType === "PIX" ? "Pix recebido" : "Boleto recebido",
      referencia: reference,
      carteira_nome: sanitizeText(targetRow?.carteira_nome) || context.payerName || null,
      observacoes: targetRow?.observacoes || null,
      rateio: asRecord(targetRow?.rateio),
      metadata_financeira: {
        ...existingMetadata,
        provider: "banco_inter",
        payment_source: context.paymentSource,
        payment_id: context.paymentId,
        codigo_solicitacao: context.codigoSolicitacao || null,
        txid: context.txid || null,
        original_data_movimento: existingMetadata.original_data_movimento || targetRow?.data_movimento || null,
        payment_reconciled_at: now,
        transaction_id_source: sanitizeText(targetRow?.id)
          ? "payment_reconciled_existing_transaction"
          : "payment_charge_identity",
      },
      conciliado: targetRow?.conciliado === true,
      status: sanitizeText(targetRow?.status) || "importado",
      source_provider: sanitizeText(targetRow?.source_provider) || "banco_inter_charge",
      conta_origem: targetRow?.conta_origem || null,
      conta_destino: targetRow?.conta_destino || null,
      saldo: targetRow?.saldo ?? null,
      raw_data: {
        ...existingRawData,
        codigoSolicitacao: context.codigoSolicitacao || existingRawData.codigoSolicitacao || null,
        txid: context.txid || existingRawData.txid || null,
        dataPagamento: context.paidAt,
        dataHoraSituacao: context.paidAt,
        dataEntrada: context.paidDate,
        valor: context.amount,
        valorTotalRecebido: context.amount,
        nomePagador: context.payerName || existingRawData.nomePagador || null,
        cpfCnpjPagador: context.payerDocument || existingRawData.cpfCnpjPagador || null,
        tipoTransacao: context.transactionType,
        detalhes: {
          ...existingRawDetails,
          codigoSolicitacao: context.codigoSolicitacao || existingRawDetails.codigoSolicitacao || null,
          txid: context.txid || existingRawDetails.txid || null,
          nomePagador: context.payerName || existingRawDetails.nomePagador || null,
          cpfCnpjPagador: context.payerDocument || existingRawDetails.cpfCnpjPagador || null,
        },
      },
      imported_at: targetRow?.imported_at || now,
      sync_run_id: sanitizeText(targetRow?.sync_run_id) || `payment_${context.paymentSource}`,
      vinculo_financeiro: sanitizeText(targetRow?.vinculo_financeiro) || sanitizeText(row.carteira_id) || null,
      updated_date: now,
    }], { onConflict: "id" })
    .select("id")
    .maybeSingle();

  if (saveError) throw saveError;
  return sanitizeText(savedTransaction?.id) || null;
}

async function applyBudgetPaymentToWallet(row: Record<string, unknown>) {
  if (row.credited_wallet_movement_id) return row;

  const ensuredWalletAccountId = sanitizeText(row.carteira_conta_id) || await ensureWalletAccountForBudget(
    sanitizeText(row.empresa_id),
    sanitizeText(row.carteira_id),
  );
  if (!ensuredWalletAccountId) return row;

  const operacaoIdempotencia = `orcamento_pagamento|${sanitizeText(row.id)}|recebido`;
  const amount = toNumber(firstDefined(row.valor_recebido, row.valor));
  if (amount <= 0) return row;
  const linkedTransactionId = await ensurePaymentExtratoTransaction(row, "orcamento_pagamento");

  const { data, error } = await supabase.rpc("finance_wallet_admin_apply_operation", {
    p_carteira_conta_id: ensuredWalletAccountId,
    p_operacao_idempotencia: operacaoIdempotencia,
    p_tipo: "entrada_direcionada",
    p_natureza: "entrada",
    p_valor: amount,
    p_referencia_amigavel: `Recarga do orçamento ${sanitizeText(row.orcamento_id)}`,
    p_motivo: "Recarga de carteira por pagamento do orçamento",
    p_observacao: `Cobrança recebida via Banco Inter (${sanitizeText(row.codigo_solicitacao)})`,
    p_origem: "orcamento_pagamento_banco_inter",
    p_transacao_id: linkedTransactionId,
    p_usuario_id: sanitizeText(row.created_by_user_id) || null,
    p_metadata: {
      orcamento_pagamento_id: row.id,
      orcamento_id: row.orcamento_id,
      provider: row.provider,
      metodo: row.metodo,
    },
  });

  if (error) throw error;
  const resultRow = Array.isArray(data) ? (data[0] || null) : data;
  if (!resultRow?.movimento_id) return row;

  return saveBudgetPaymentRow({
    ...row,
    carteira_conta_id: ensuredWalletAccountId,
    credited_wallet_movement_id: resultRow.movimento_id,
    creditado_em: new Date().toISOString(),
    updated_date: new Date().toISOString(),
  });
}

async function applyWalletChargePaymentToWallet(row: Record<string, unknown>) {
  if (row.credited_wallet_movement_id) return row;

  const ensuredWalletAccountId = sanitizeText(row.carteira_conta_id) || await ensureWalletAccountForBudget(
    sanitizeText(row.empresa_id),
    sanitizeText(row.carteira_id),
  );
  if (!ensuredWalletAccountId) return row;

  const amount = toNumber(firstDefined(row.valor_recebido, row.valor));
  if (amount <= 0) return row;

  const linkedTransactionId = await ensurePaymentExtratoTransaction(row, "carteira_cobranca");
  const { data, error } = await supabase.rpc("finance_wallet_admin_apply_operation", {
    p_carteira_conta_id: ensuredWalletAccountId,
    p_operacao_idempotencia: `carteira_cobranca|${sanitizeText(row.id)}|recebido`,
    p_tipo: "entrada_direcionada",
    p_natureza: "entrada",
    p_valor: amount,
    p_referencia_amigavel: `Pagamento de cobranca: ${sanitizeText(row.descricao, "Carteira")}`.slice(0, 180),
    p_motivo: "Recarga de carteira por cobranca recebida",
    p_observacao: `Cobranca recebida via Banco Inter (${sanitizeText(row.codigo_solicitacao)})`,
    p_origem: "carteira_cobranca_banco_inter",
    p_transacao_id: linkedTransactionId,
    p_usuario_id: sanitizeText(row.created_by_user_id) || null,
    p_metadata: {
      carteira_cobranca_id: row.id,
      provider: row.provider,
      metodo: row.metodo,
      descricao: row.descricao,
    },
  });

  if (error) throw error;
  const resultRow = Array.isArray(data) ? (data[0] || null) : data;
  if (!resultRow?.movimento_id) return row;

  return saveWalletChargeRow({
    ...row,
    carteira_conta_id: ensuredWalletAccountId,
    credited_wallet_movement_id: resultRow.movimento_id,
    creditado_em: new Date().toISOString(),
    updated_date: new Date().toISOString(),
  });
}

async function ensureChargeWebhookConfigured(config: IntegrationConfig) {
  const { accessToken, httpClient } = await getAccessToken(config, {
    scopeConfigKey: "charge_write_scope",
    fallbackScope: DEFAULT_CHARGE_WRITE_SCOPE,
    actionLabel: "configurar webhook de cobrança",
  });
  const apiBaseUrl = sanitizeText(config.api_base_url || getConfigValue(config, "api_base_url"), DEFAULT_API_BASE_URL);
  const chargePath = sanitizeText(getConfigValue(config, "charge_path"), DEFAULT_CHARGE_PATH);
  const webhookUrl = `${supabaseUrl}/functions/v1/banco-inter-sync`;
  const url = new URL(`${chargePath}/webhook`, apiBaseUrl);
  const headers = buildChargeHeaders(config, accessToken);

  const response = await fetch(url.toString(), {
    method: "PUT",
    headers,
    body: JSON.stringify({ webhookUrl }),
    client: httpClient,
  });

  if (!response.ok && response.status !== 204) {
    const rawText = await response.text();
    if (response.status === 401) {
      const authHint = buildInterApi401Hint(config, { raw: rawText });
      if (authHint) {
        throw new Error(`Não foi possível configurar o webhook da cobrança no Banco Inter (${response.status}): ${authHint}`);
      }
    }
    throw new Error(`Não foi possível configurar o webhook da cobrança no Banco Inter (${response.status}): ${rawText}`);
  }

  return webhookUrl;
}

async function processBudgetChargeWebhookEvent(event: Record<string, unknown>) {
  const codigoSolicitacao = sanitizeText(event.codigoSolicitacao);
  if (!codigoSolicitacao) return null;

  const { data, error } = await supabase
    .from("orcamento_pagamento")
    .select("*")
    .eq("codigo_solicitacao", codigoSolicitacao)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const now = new Date().toISOString();
  const situacao = sanitizeText(event.situacao, sanitizeText(data.status_inter || data.status));
  const updatedRow = await saveBudgetPaymentRow({
    ...data,
    status: situacao === "RECEBIDO" ? "recebido" : data.status,
    status_inter: situacao,
    nosso_numero: sanitizeText(event.nossoNumero, sanitizeText(data.nosso_numero)) || null,
    codigo_barras: sanitizeText(event.codigoBarras, sanitizeText(data.codigo_barras)) || null,
    linha_digitavel: sanitizeText(event.linhaDigitavel, sanitizeText(data.linha_digitavel)) || null,
    txid: sanitizeText(event.txid, sanitizeText(data.txid)) || null,
    pix_copia_cola: sanitizeText(event.pixCopiaECola, sanitizeText(data.pix_copia_cola)) || null,
    valor_recebido: situacao === "RECEBIDO"
      ? toNumber(firstDefined(event.valorTotalRecebido, data.valor_recebido, data.valor))
      : Number(data.valor_recebido || 0),
    pago_em: situacao === "RECEBIDO" ? (sanitizeText(event.dataHoraSituacao) || data.pago_em || now) : data.pago_em || null,
    metadata: {
      ...(data.metadata && typeof data.metadata === "object" ? data.metadata : {}),
      webhook_last_event: event,
    },
    updated_date: now,
  });

  return situacao === "RECEBIDO"
    ? applyBudgetPaymentToWallet(updatedRow)
    : updatedRow;
}

async function processWalletChargeWebhookEvent(event: Record<string, unknown>) {
  const codigoSolicitacao = sanitizeText(event.codigoSolicitacao);
  if (!codigoSolicitacao) return null;

  const { data, error } = await supabase
    .from("carteira_cobranca")
    .select("*")
    .eq("codigo_solicitacao", codigoSolicitacao)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const now = new Date().toISOString();
  const situacao = sanitizeText(event.situacao, sanitizeText(data.status_inter || data.status));
  const mappedStatus = mapInterChargeStatus(situacao);
  const active = mappedStatus === "emitido";
  const received = sanitizeText(situacao).toUpperCase() === "RECEBIDO";
  const updatedRow = await saveWalletChargeRow({
    ...data,
    status: mappedStatus,
    status_inter: situacao || data.status_inter || null,
    nosso_numero: sanitizeText(event.nossoNumero, sanitizeText(data.nosso_numero)) || null,
    codigo_barras: active ? (sanitizeText(event.codigoBarras, sanitizeText(data.codigo_barras)) || null) : null,
    linha_digitavel: active ? (sanitizeText(event.linhaDigitavel, sanitizeText(data.linha_digitavel)) || null) : null,
    txid: sanitizeText(event.txid, sanitizeText(data.txid)) || null,
    pix_copia_cola: active ? (sanitizeText(event.pixCopiaECola, sanitizeText(data.pix_copia_cola)) || null) : null,
    pdf_disponivel: active ? Boolean(data.codigo_solicitacao) : false,
    valor_recebido: received
      ? toNumber(firstDefined(event.valorTotalRecebido, data.valor_recebido, data.valor))
      : Number(data.valor_recebido || 0),
    pago_em: received ? (sanitizeText(event.dataHoraSituacao) || data.pago_em || now) : data.pago_em || null,
    metadata: {
      ...getWalletChargeMetadata(data),
      webhook_last_event: event,
    },
    updated_date: now,
  });

  return received ? applyWalletChargePaymentToWallet(updatedRow) : updatedRow;
}

async function refreshWalletChargeFromInter(config: IntegrationConfig, row: Record<string, unknown>) {
  if (!sanitizeText(row.codigo_solicitacao) || !isWalletChargeActive(row)) return row;

  const charge = await fetchChargeForBudget(config, sanitizeText(row.codigo_solicitacao));
  const now = new Date().toISOString();
  const mappedStatus = mapInterChargeStatus(charge.situacao);
  const received = sanitizeText(charge.situacao).toUpperCase() === "RECEBIDO";
  const active = mappedStatus === "emitido";
  const refreshedRow = await saveWalletChargeRow({
    ...row,
    status: mappedStatus,
    status_inter: sanitizeText(charge.situacao) || row.status_inter || null,
    valor: Number(charge.valorNominal || row.valor || 0),
    seu_numero: charge.seuNumero || row.seu_numero || null,
    nosso_numero: charge.nossoNumero || row.nosso_numero || null,
    txid: charge.txid || row.txid || null,
    linha_digitavel: active ? (charge.linhaDigitavel || row.linha_digitavel || null) : null,
    codigo_barras: active ? (charge.codigoBarras || row.codigo_barras || null) : null,
    pix_copia_cola: active ? (charge.pixCopiaECola || row.pix_copia_cola || null) : null,
    pdf_disponivel: active ? Boolean(charge.codigoSolicitacao || row.codigo_solicitacao) : false,
    valor_recebido: received ? Number(charge.valorTotalRecebido || charge.valorNominal || row.valor || 0) : Number(row.valor_recebido || 0),
    pago_em: received ? (charge.dataHoraSituacao || row.pago_em || now) : row.pago_em || null,
    metadata: {
      ...getWalletChargeMetadata(row),
      charge_snapshot: charge,
    },
    updated_date: now,
  });

  return received ? applyWalletChargePaymentToWallet(refreshedRow) : refreshedRow;
}

async function loadWalletChargeFromPublicToken(token: string) {
  const normalizedToken = sanitizeText(token);
  if (normalizedToken.length < 32) {
    throw new WalletChargeAuthorizationError("Link de cobranca invalido.", 404);
  }

  const tokenHash = await hashWalletChargePublicToken(normalizedToken);
  const row = await loadWalletChargeByPublicTokenHash(tokenHash);
  if (!row) {
    throw new WalletChargeAuthorizationError("Link de cobranca invalido ou indisponivel.", 404);
  }

  const expiresAt = new Date(String(row.public_token_expires_at || ""));
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    throw new WalletChargeAuthorizationError("Este link de cobranca expirou. Solicite um novo link a Dog City Brasil.", 410);
  }

  return row;
}

async function rotateWalletChargePublicLink(row: Record<string, unknown>) {
  const publicToken = buildWalletChargePublicToken();
  const publicTokenHash = await hashWalletChargePublicToken(publicToken);
  const updatedRow = await saveWalletChargeRow({
    ...row,
    public_token_hash: publicTokenHash,
    public_token_expires_at: buildWalletChargeTokenExpiry(sanitizeText(row.data_vencimento)),
    metadata: {
      ...getWalletChargeMetadata(row),
      public_link_rotated_at: new Date().toISOString(),
    },
    updated_date: new Date().toISOString(),
  });
  return { row: updatedRow, publicToken };
}

async function listOpenWalletCharges(empresaId: string, carteiraId: string, sortBy: string) {
  const safeSortBy = sortBy === "issued_at" ? "emitido_em" : "data_vencimento";
  const { data, error } = await supabase
    .from("carteira_cobranca")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("carteira_id", carteiraId)
    .in("status", ["pendente_emissao", "emitido"])
    .order(safeSortBy, { ascending: safeSortBy === "data_vencimento" })
    .order("created_date", { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => buildWalletChargeStaffResponse(row));
}

async function normalizeTransactions(
  empresaId: string,
  syncRunId: string,
  rawPayload: unknown,
) {
  if (!empresaId) {
    throw new Error("A integracao Banco Inter precisa estar vinculada a uma empresa.");
  }

  const transactions = getTransactionArray(rawPayload)
    .slice()
    .sort((left, right) => {
      const leftDateTime = sanitizeText(getRawInterTransactionDateTime(left), "");
      const rightDateTime = sanitizeText(getRawInterTransactionDateTime(right), "");

      const leftTimestamp = leftDateTime ? new Date(leftDateTime).getTime() : 0;
      const rightTimestamp = rightDateTime ? new Date(rightDateTime).getTime() : 0;

      if (leftTimestamp !== rightTimestamp) {
        return leftTimestamp - rightTimestamp;
      }

      const leftId = sanitizeText(firstDefined(left.id, left.idTransacao, left.codigoTransacao, left.transactionId, left.nsudoc, left.documento, left.nsu), "");
      const rightId = sanitizeText(firstDefined(right.id, right.idTransacao, right.codigoTransacao, right.transactionId, right.nsudoc, right.documento, right.nsu), "");
      return leftId.localeCompare(rightId);
    });
  const normalizedRows: NormalizedTransaction[] = [];

  for (const transaction of transactions) {
    const amount = toNumber(firstDefined(
      transaction.valor,
      transaction.amount,
      transaction.valorLancamento,
      transaction.valorTransacao,
      transaction.transactionAmount,
    ));

    const normalizedType = inferTipo(transaction, amount);
    const positiveAmount = Math.abs(amount);
    const rawDate = sanitizeText(
      getRawInterTransactionDateTime(transaction),
      new Date().toISOString(),
    );
    const movementDate = formatDateOnly(rawDate);
    const movementDateTime = hasTimeFragment(rawDate) ? formatDateTime(rawDate) : null;
    const rawDescription = sanitizeText(firstDefined(
      transaction.descricao,
      transaction.historico,
      transaction.titulo,
      transaction.title,
      transaction.complemento,
      transaction.nomePagador,
      transaction.nomeFavorecido,
    ), "Movimentacao Banco Inter");
    const parsedDescription = parseBancoInterDescription(transaction);
    const counterpartyName = inferCounterpartyName(transaction, rawDescription, normalizedType);
    const resolvedCounterpartyName = normalizeDisplayName(parsedDescription.counterpartyName || counterpartyName || rawDescription) || null;
    const resolvedMethod = parsedDescription.method || normalizeDisplayLabel(firstDefined(transaction.tipoTransacao, transaction.formaPagamento, transaction.tipoPagamento)) || null;
    const resolvedTransactionType = parsedDescription.detailLabel || normalizeDisplayLabel(firstDefined(
      transaction.tipoDetalhado,
      transaction.tipo,
      transaction.natureza,
      transaction.titulo,
      transaction.tipoOperacao,
      transaction.transactionType,
      transaction.operationType,
    )) || null;
    const friendlyDescription = resolvedMethod && resolvedCounterpartyName
      ? `${resolvedMethod} ${normalizedType === "saida" ? "para" : "de"} ${resolvedCounterpartyName}`
      : resolvedCounterpartyName || rawDescription;
    const sourceId = sanitizeText(firstDefined(
      transaction.id,
      transaction.idTransacao,
      transaction.codigoTransacao,
      transaction.transactionId,
      transaction.identificador,
      transaction.nsudoc,
      transaction.documento,
      transaction.nsu,
    ));
    const stableFingerprintPayload = buildStableTransactionFingerprintPayload(transaction);
    const fallbackKey = await sha256Hex(`${empresaId}|${stableSerialize(stableFingerprintPayload)}`);
    const transactionId = sourceId || `api_synthetic_${fallbackKey}`;
    const counterpartyBank = inferCounterpartyBank(transaction, normalizedType);
    const reference = inferReference(transaction, transactionId);
    const notes = sanitizeText(firstDefined(
      transaction.observacoes,
      transaction.complemento,
      transaction.descricaoDetalhada,
      transaction.memo,
    )) || null;

    normalizedRows.push({
      id: transactionId,
      empresa_id: empresaId,
      descricao: friendlyDescription,
      tipo: normalizedType,
      valor: positiveAmount,
      data: movementDate,
      data_hora_transacao: movementDateTime,
      data_movimento: movementDate,
      banco: "Banco Inter",
      nome_contraparte: resolvedCounterpartyName,
      banco_contraparte: counterpartyBank,
      forma_pagamento: resolvedMethod,
      categoria: sanitizeText(firstDefined(transaction.categoria, transaction.tipoLancamento), "") || null,
      tipo_transacao_detalhado: resolvedTransactionType,
      referencia: reference,
      carteira_nome: sanitizeText(firstDefined(transaction.carteiraNome, transaction.walletName), "") || null,
      observacoes: notes,
      rateio: {},
      metadata_financeira: {
        provider: "banco_inter",
        imported_via: "edge_function",
        api_locked: true,
        transaction_id_source: sourceId ? "api" : "synthetic_fingerprint",
        synthetic_occurrence: null,
        raw_description: rawDescription,
        counterparty_code: parsedDescription.counterpartyCode,
        direction_label: normalizedType === "saida" ? "Debitado" : "Creditado",
      },
      conciliado: false,
      status: "importado",
      source_provider: "banco_inter",
      conta_origem: sanitizeText(firstDefined(transaction.contaOrigem, transaction.accountOrigin), "") || null,
      conta_destino: sanitizeText(firstDefined(transaction.contaDestino, transaction.accountDestination), "") || null,
      saldo: firstDefined(transaction.saldo, transaction.balance) !== null
        ? toNumber(firstDefined(transaction.saldo, transaction.balance))
        : null,
      raw_data: transaction,
      imported_at: new Date().toISOString(),
      sync_run_id: syncRunId,
    } satisfies NormalizedTransaction);
  }

  return normalizedRows;
}

function buildDateDebugSample(rawPayload: unknown, normalizedRows: NormalizedTransaction[]) {
  const transactions = getTransactionArray(rawPayload);
  return transactions.slice(0, 5).map((transaction, index) => ({
    index,
    raw_candidates: {
      dataLancamentoHoraLancamento: firstDefined(buildInterDateTime(transaction.dataLancamento, transaction.horaLancamento), null),
      dataHora: firstDefined(transaction.dataHora, null),
      dataTransacao: firstDefined(transaction.dataTransacao, null),
      transactionDateTime: firstDefined(transaction.transactionDateTime, null),
      dataMovimento: firstDefined(transaction.dataMovimento, null),
      dataLancamento: firstDefined(transaction.dataLancamento, null),
      horaLancamento: firstDefined(transaction.horaLancamento, null),
      dataEntrada: firstDefined(transaction.dataEntrada, null),
      data: firstDefined(transaction.data, null),
      bookingDate: firstDefined(transaction.bookingDate, null),
      createdAt: firstDefined(transaction.createdAt, null),
      dataHoraTransacao: firstDefined(transaction.dataHoraTransacao, null),
      dataOperacao: firstDefined(transaction.dataOperacao, null),
      dataInclusao: firstDefined(transaction.dataInclusao, null),
    },
    raw_preview: transaction,
    normalized: normalizedRows[index]
      ? {
        data: normalizedRows[index].data,
        data_movimento: normalizedRows[index].data_movimento,
        data_hora_transacao: normalizedRows[index].data_hora_transacao,
        descricao: normalizedRows[index].descricao,
        transaction_id: normalizedRows[index].id,
      }
      : null,
  }));
}

async function startSyncLog(config: IntegrationConfig, triggerSource: string, requestedFrom: string | null, requestedTo: string | null) {
  const { data, error } = await supabase
    .from("integracao_sync_log")
    .insert([{
      empresa_id: config.empresa_id || null,
      integracao_id: config.id,
      provider: "banco_inter",
      status: "running",
      trigger_source: triggerSource,
      requested_from: requestedFrom,
      requested_to: requestedTo,
      started_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function startSyncLogForCompany(
  config: IntegrationConfig,
  empresaId: string | null,
  triggerSource: string,
  requestedFrom: string | null,
  requestedTo: string | null,
) {
  const { data, error } = await supabase
    .from("integracao_sync_log")
    .insert([{
      empresa_id: empresaId,
      integracao_id: config.id,
      provider: "banco_inter",
      status: "running",
      trigger_source: triggerSource,
      requested_from: requestedFrom,
      requested_to: requestedTo,
      started_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function finishSyncLog(logId: string, payload: Record<string, unknown>) {
  const { error } = await supabase
    .from("integracao_sync_log")
    .update({
      ...payload,
      finished_at: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    })
    .eq("id", logId);

  if (error) throw error;
}

async function updateIntegrationStatus(configId: string, payload: Record<string, unknown>) {
  let { error } = await supabase
    .from("integracao_config")
    .update(payload)
    .eq("id", configId);

  if (!error) return;

  const message = serializeError(error);
  const shouldRetryWithoutBalanceFields = [
    "current_balance",
    "current_balance_at",
    "balance_path",
  ].some((column) => message.includes(column));

  if (!shouldRetryWithoutBalanceFields) {
    throw error;
  }

  const fallbackPayload = { ...payload };
  delete fallbackPayload.current_balance;
  delete fallbackPayload.current_balance_at;

  const retry = await supabase
    .from("integracao_config")
    .update(fallbackPayload)
    .eq("id", configId);

  if (retry.error) throw retry.error;
}

function mergeManualComplements(
  incomingRow: NormalizedTransaction,
  existingRow?: Record<string, unknown> | null,
): NormalizedTransaction {
  if (!existingRow) return incomingRow;

  const existingRawData = asRecord(existingRow.raw_data);
  const incomingRawData = asRecord(incomingRow.raw_data);

  return {
    ...incomingRow,
    carteira_nome: sanitizeText(existingRow.carteira_nome) || incomingRow.carteira_nome,
    observacoes: sanitizeText(existingRow.observacoes) || incomingRow.observacoes,
    rateio: typeof existingRow.rateio === "object" && existingRow.rateio !== null ? existingRow.rateio as Record<string, unknown> : incomingRow.rateio,
    conciliado: typeof existingRow.conciliado === "boolean" ? existingRow.conciliado : incomingRow.conciliado,
    status: sanitizeText(existingRow.status) || incomingRow.status,
    metadata_financeira: {
      ...(typeof existingRow.metadata_financeira === "object" && existingRow.metadata_financeira !== null
        ? existingRow.metadata_financeira as Record<string, unknown>
        : {}),
      ...incomingRow.metadata_financeira,
      preserved_manual_data: true,
    },
    raw_data: {
      ...existingRawData,
      ...incomingRawData,
      detalhes: {
        ...asRecord(existingRawData.detalhes),
        ...asRecord(incomingRawData.detalhes),
      },
    },
  };
}

function reconcileRowsWithSyntheticMovements(
  incomingRows: NormalizedTransaction[],
  existingReconciliationRows: Record<string, unknown>[],
) {
  const usedExistingIds = new Set<string>();
  const matchedExistingIds = new Set<string>();
  const rows = incomingRows.map((incomingRow) => {
    const incomingIdentifiers = buildPaymentIdentifierSet(incomingRow);
    const comparableCandidates = existingReconciliationRows.filter((existingRow) => {
      const existingId = sanitizeText(existingRow.id);
      const existingMetadata = asRecord(existingRow.metadata_financeira);
      const paymentBacked = Boolean(sanitizeText(existingMetadata.payment_source) && sanitizeText(existingMetadata.payment_id));
      const existingDate = sanitizeText(existingRow.data_movimento);
      const dateMatches = existingDate === incomingRow.data_movimento
        || (paymentBacked && Math.abs(diffDays(existingDate, incomingRow.data_movimento)) <= 1);
      return existingId
        && !usedExistingIds.has(existingId)
        && dateMatches
        && sanitizeText(existingRow.tipo) === incomingRow.tipo
        && Math.abs(toNumber(existingRow.valor) - incomingRow.valor) < 0.005;
    });
    const identifierCandidates = comparableCandidates.filter((existingRow) => {
      const existingIdentifiers = buildPaymentIdentifierSet(existingRow);
      return [...incomingIdentifiers].some((identifier) => existingIdentifiers.has(identifier));
    });
    const exactDescriptionCandidates = comparableCandidates.filter((existingRow) => (
      normalizeReceiptMatchText(existingRow.descricao) === normalizeReceiptMatchText(incomingRow.descricao)
    ));
    const exactCounterpartyCandidates = comparableCandidates.filter((existingRow) => (
      normalizeReceiptMatchText(existingRow.nome_contraparte) === normalizeReceiptMatchText(incomingRow.nome_contraparte)
    ));
    const candidates = identifierCandidates.length
      ? identifierCandidates
      : exactDescriptionCandidates.length
      ? exactDescriptionCandidates
      : exactCounterpartyCandidates.length
      ? exactCounterpartyCandidates
      : comparableCandidates.filter((existingRow) => !sanitizeText(asRecord(existingRow.metadata_financeira).payment_id));
    if (candidates.length !== 1) return incomingRow;

    const existingRow = candidates[0];
    const existingId = sanitizeText(existingRow.id);
    usedExistingIds.add(existingId);
    matchedExistingIds.add(existingId);
    const providerTransactionId = incomingRow.id;
    const existingMetadata = asRecord(existingRow.metadata_financeira);
    const paymentBacked = Boolean(sanitizeText(existingMetadata.payment_source) && sanitizeText(existingMetadata.payment_id));
    return mergeManualComplements({
      ...incomingRow,
      id: existingId,
      data: paymentBacked ? sanitizeText(existingRow.data, incomingRow.data) : incomingRow.data,
      data_movimento: paymentBacked
        ? sanitizeText(existingRow.data_movimento, incomingRow.data_movimento)
        : incomingRow.data_movimento,
      data_hora_transacao: paymentBacked
        ? sanitizeText(existingRow.data_hora_transacao) || incomingRow.data_hora_transacao
        : incomingRow.data_hora_transacao,
      referencia: paymentBacked
        ? sanitizeText(existingRow.referencia) || incomingRow.referencia
        : incomingRow.referencia,
      metadata_financeira: {
        ...incomingRow.metadata_financeira,
        provider_transaction_id: providerTransactionId,
        transaction_id_source: "api_enriched_legacy_id_preserved",
      },
    }, existingRow);
  });

  return { rows, matchedExistingIds };
}

async function persistTransactions(
  empresaId: string,
  rows: NormalizedTransaction[],
  {
    refreshToday,
  }: {
    refreshToday: boolean;
  },
) {
  const today = formatDateOnly(new Date());
  const uniqueRowsByTransactionId = new Map<string, NormalizedTransaction>();
  let discardedInPayloadCount = 0;

  for (const row of rows) {
    if (!row.id) continue;
    if (uniqueRowsByTransactionId.has(row.id)) {
      discardedInPayloadCount += 1;
      continue;
    }
    uniqueRowsByTransactionId.set(row.id, row);
  }

  const uniqueRows = Array.from(uniqueRowsByTransactionId.values());
  const existingReconciliationRows: Record<string, unknown>[] = [];
  const movementDates = Array.from(new Set(uniqueRows.map((row) => row.data_movimento).filter(Boolean)));
  const reconciliationDates = Array.from(new Set(
    movementDates.flatMap((date) => [shiftDateOnly(date, -1), date, shiftDateOnly(date, 1)]),
  ));
  for (const dateChunk of chunkArray(reconciliationDates, 100)) {
    const { data, error } = await supabase
      .from("extratobancario")
      .select("id, data, data_movimento, data_hora_transacao, tipo, valor, descricao, nome_contraparte, referencia, carteira_nome, observacoes, rateio, raw_data, metadata_financeira, conciliado, status")
      .eq("empresa_id", empresaId)
      .in("source_provider", ["banco_inter", "banco_inter_charge"])
      .in("data_movimento", dateChunk);

    if (error) throw error;
    existingReconciliationRows.push(...(data || []).filter((row) => (
      sanitizeText(row?.id).startsWith("api_synthetic_")
      || Boolean(sanitizeText(asRecord(row?.metadata_financeira).payment_id))
    )));
  }
  const reconciliation = reconcileRowsWithSyntheticMovements(uniqueRows, existingReconciliationRows);
  const reconciledRows = reconciliation.rows;
  const todayRows = refreshToday
    ? reconciledRows.filter((row) => row.data_movimento === today)
    : [];
  const historicalRows = reconciledRows.filter((row) => !refreshToday || row.data_movimento !== today);

  const historicalExistingIds = new Set<string>();
  if (historicalRows.length) {
    for (const transactionIdChunk of chunkArray(historicalRows.map((row) => row.id), 100)) {
      const { data, error } = await supabase
        .from("extratobancario")
        .select("id")
        .eq("empresa_id", empresaId)
        .in("source_provider", ["banco_inter", "banco_inter_charge"])
        .in("id", transactionIdChunk);

      if (error) throw error;

      for (const item of data || []) {
        if (item?.id) historicalExistingIds.add(item.id);
      }
    }
  }

  const historicalRowsToInsert = historicalRows.filter((row) => !historicalExistingIds.has(row.id));
  const historicalRowsToUpdate = historicalRows.filter((row) => reconciliation.matchedExistingIds.has(row.id));

  for (const row of historicalRowsToUpdate) {
    const { error } = await supabase
      .from("extratobancario")
      .update(row)
      .eq("empresa_id", empresaId)
      .eq("id", row.id);
    if (error) throw error;
  }

  let refreshedTodayCount = 0;
  if (refreshToday) {
    const { data: existingTodayRows, error: existingTodayError } = await supabase
      .from("extratobancario")
      .select("id, carteira_nome, observacoes, rateio, metadata_financeira, conciliado, status")
      .eq("empresa_id", empresaId)
      .in("source_provider", ["banco_inter", "banco_inter_charge"])
      .eq("data_movimento", today);

    if (existingTodayError) throw existingTodayError;

    const existingTodayMap = new Map<string, Record<string, unknown>>();
    for (const row of existingTodayRows || []) {
      if (row?.id) existingTodayMap.set(row.id, row);
    }

    const mergedTodayRows = todayRows.map((row) => mergeManualComplements(row, existingTodayMap.get(row.id) || null));

    for (const chunk of chunkArray(mergedTodayRows, 100)) {
      if (!chunk.length) continue;
      const { error } = await supabase
        .from("extratobancario")
        .upsert(chunk, { onConflict: "id" });

      if (error) throw error;
    }

    refreshedTodayCount = mergedTodayRows.length;
  }

  for (const chunk of chunkArray(historicalRowsToInsert, 100)) {
    if (!chunk.length) continue;
    const { error } = await supabase
      .from("extratobancario")
      .insert(chunk);

    if (error) throw error;
  }

  return {
    importedCount: historicalRowsToInsert.length + refreshedTodayCount,
    refreshedTodayCount,
    historicalInsertedCount: historicalRowsToInsert.length,
    enrichedLegacyCount: historicalRowsToUpdate.length,
    discardedExistingCount: historicalExistingIds.size,
    discardedInPayloadCount,
  };
}

function parseBrazilianCsvNumber(value: unknown) {
  return toNumber(String(value ?? "").replace(/\s/g, ""));
}

function normalizeCsvCell(value: string) {
  return sanitizeText(value)
    .replace(/\uFEFF/g, "")
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ");
}

function parseSemicolonCsvRows(csvText: string) {
  const text = String(csvText || "");
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        currentField += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ";" && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      currentRow.push(currentField);
      if (currentRow.some((field) => String(field || "").trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = "";
      continue;
    }

    if (char === "\r") continue;
    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((field) => String(field || "").trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows.map((row) => row.map((field) => normalizeCsvCell(field)));
}

function parseCsvDateToIso(value: string) {
  const match = normalizeCsvCell(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

type ParsedCsvImport = {
  accountNumber: string | null;
  periodLabel: string | null;
  closingBalance: number | null;
  rows: Array<{
    rowIndex: number;
    date: string;
    history: string;
    description: string;
    amount: number;
    balance: number | null;
  }>;
};

function parseBancoInterCsv(csvText: string): ParsedCsvImport {
  const rows = parseSemicolonCsvRows(csvText);

  if (!rows.length) {
    throw new Error("Arquivo CSV vazio.");
  }

  let accountNumber: string | null = null;
  let periodLabel: string | null = null;
  let closingBalance: number | null = null;
  let headerIndex = -1;

  for (let index = 0; index < rows.length; index += 1) {
    const columns = rows[index];
    const normalizedLabel = columns[0]
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    if (normalizedLabel === "conta") {
      accountNumber = columns[1] || null;
      continue;
    }

    if (normalizedLabel === "periodo") {
      periodLabel = columns[1] || null;
      continue;
    }

    if (normalizedLabel === "saldo") {
      closingBalance = parseBrazilianCsvNumber(columns[1]);
      continue;
    }

    if (normalizedLabel === "data lancamento") {
      headerIndex = index;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error("Cabecalho de lancamentos nao encontrado no CSV.");
  }

  const deriveHistoryFromDescription = (description: string) => {
    const normalized = normalizeCsvCell(description);
    if (!normalized) return "Lançamento CSV";

    const colonIndex = normalized.indexOf(":");
    if (colonIndex > 0) {
      return normalized.slice(0, colonIndex).trim() || normalized;
    }

    return normalized;
  };

  const movementRows = rows
    .slice(headerIndex + 1)
    .filter((columns) => columns.length >= 4 && columns[0] && columns[2])
    .map((columns, rowIndex) => {
      const date = parseCsvDateToIso(columns[0]);
      if (!date) return null;

      const description = columns[1] || "Sem descrição";

      return {
        rowIndex: rowIndex + 1,
        date,
        history: deriveHistoryFromDescription(description),
        description,
        amount: parseBrazilianCsvNumber(columns[2]),
        balance: columns[3] ? parseBrazilianCsvNumber(columns[3]) : null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    accountNumber,
    periodLabel,
    closingBalance,
    rows: movementRows,
  };
}

async function normalizeCsvTransactions(
  empresaId: string,
  syncRunId: string,
  csvText: string,
  filename: string | null,
) {
  const parsed = parseBancoInterCsv(csvText);
  const normalizedRows = await Promise.all(parsed.rows.map(async (row) => {
    const normalizedType: "entrada" | "saida" = row.amount < 0 ? "saida" : "entrada";
    const absoluteAmount = Math.abs(row.amount);
    const legacyHash = await sha256Hex([
      "banco_inter_csv",
      empresaId,
      String(row.rowIndex),
      row.date,
      row.history,
      row.description,
      absoluteAmount.toFixed(2),
      row.balance === null ? "" : row.balance.toFixed(2),
    ].join("|"));
    const transactionId = `csv_${legacyHash}`;

    return {
      id: transactionId,
      empresa_id: empresaId,
      descricao: row.description,
      tipo: normalizedType,
      valor: absoluteAmount,
      data: row.date,
      data_hora_transacao: null,
      data_movimento: row.date,
      banco: "Banco Inter",
      nome_contraparte: normalizeDisplayName(row.description) || row.description,
      banco_contraparte: null,
      forma_pagamento: normalizeDisplayLabel(row.history) || "Extrato CSV",
      categoria: null,
      tipo_transacao_detalhado: normalizeDisplayLabel(row.history) || null,
      referencia: transactionId,
      carteira_nome: null,
      observacoes: null,
      rateio: {},
      metadata_financeira: {
        provider: "banco_inter_csv",
        imported_via: "manual_csv",
        api_locked: true,
        source_file: filename || null,
        account_number: parsed.accountNumber,
        csv_period: parsed.periodLabel,
        direction_label: normalizedType === "saida" ? "Debitado" : "Creditado",
      },
      conciliado: false,
      status: "importado",
      source_provider: "banco_inter_csv",
      conta_origem: parsed.accountNumber,
      conta_destino: null,
      saldo: row.balance,
      raw_data: {
        source: "csv_manual",
        rowIndex: row.rowIndex,
        filename: filename || null,
        conta: parsed.accountNumber,
        periodo: parsed.periodLabel,
        dataLancamento: row.date,
        historico: row.history,
        descricao: row.description,
        valor: row.amount,
        saldo: row.balance,
      },
      imported_at: new Date().toISOString(),
      sync_run_id: syncRunId,
    } satisfies NormalizedTransaction;
  }));

  return {
    parsed,
    normalizedRows,
  };
}

async function persistCsvTransactions(
  empresaId: string,
  rows: NormalizedTransaction[],
  {
    replaceExistingCsv,
  }: {
    replaceExistingCsv?: boolean;
  } = {},
) {
  const uniqueRowsByTransactionId = new Map<string, NormalizedTransaction>();
  let discardedInPayloadCount = 0;

  for (const row of rows) {
    if (!row.id) continue;
    if (uniqueRowsByTransactionId.has(row.id)) {
      discardedInPayloadCount += 1;
      continue;
    }
    uniqueRowsByTransactionId.set(row.id, row);
  }

  const uniqueRows = Array.from(uniqueRowsByTransactionId.values());
  let replacedExistingCount: number | null = 0;

  if (replaceExistingCsv) {
    const { error: deleteExistingError } = await supabase
      .from("extratobancario")
      .delete()
      .eq("empresa_id", empresaId)
      .eq("source_provider", "banco_inter_csv");

    if (deleteExistingError) throw deleteExistingError;
    replacedExistingCount = null;
  }

  const existingIds = new Set<string>();

  if (!replaceExistingCsv) {
    for (const transactionIdChunk of chunkArray(uniqueRows.map((row) => row.id), 100)) {
      const { data, error } = await supabase
        .from("extratobancario")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("source_provider", "banco_inter_csv")
        .in("id", transactionIdChunk);

      if (error) throw error;
      for (const item of data || []) {
        if (item?.id) existingIds.add(item.id);
      }
    }
  }

  const rowsToInsert = uniqueRows.filter((row) => !existingIds.has(row.id));

  for (const chunk of chunkArray(rowsToInsert, 500)) {
    if (!chunk.length) continue;
    const { error } = await supabase.from("extratobancario").insert(chunk);
    if (error) throw error;
  }

  return {
    importedCount: rowsToInsert.length,
    discardedExistingCount: existingIds.size,
    discardedInPayloadCount,
    replacedExistingCount,
  };
}

async function importCsvForConfig(
  config: IntegrationConfig,
  {
    csvText,
    filename,
    triggerSource,
    empresaIdOverride,
    replaceExistingCsv,
  }: {
    csvText: string;
    filename?: string | null;
    triggerSource: string;
    empresaIdOverride?: string;
    replaceExistingCsv?: boolean;
  },
) {
  const empresaId = sanitizeText(firstDefined(empresaIdOverride, config.empresa_id));
  if (!empresaId) {
    throw new Error("Informe a unidade para importar o CSV manualmente.");
  }

  const now = new Date().toISOString();
  const log = config.empresa_id === empresaId
    ? await startSyncLog(config, triggerSource, null, null)
    : await startSyncLogForCompany(config, empresaId, triggerSource, null, null);

  try {
    const { parsed, normalizedRows } = await normalizeCsvTransactions(empresaId, log.id, csvText, filename || null);
    const persistence = await persistCsvTransactions(empresaId, normalizedRows, { replaceExistingCsv });
    const movementSummary = await persistMovementSummary(config, empresaId);

    await finishSyncLog(log.id, {
      status: "success",
      imported_count: persistence.importedCount,
      deduplicated_count: persistence.discardedExistingCount + persistence.discardedInPayloadCount,
      response_summary: {
        source: "manual_csv",
        filename: filename || null,
        account_number: parsed.accountNumber,
        period_label: parsed.periodLabel,
        closing_balance: parsed.closingBalance,
        received_count: normalizedRows.length,
        inserted_count: persistence.importedCount,
        replaced_existing_count: persistence.replacedExistingCount,
        discarded_existing_count: persistence.discardedExistingCount,
        discarded_in_payload_count: persistence.discardedInPayloadCount,
        movement_summary: movementSummary,
      },
    });

    return {
      success: true,
      action: "importCsvManual",
      imported_count: persistence.importedCount,
      replaced_existing_count: persistence.replacedExistingCount,
      discarded_existing_count: persistence.discardedExistingCount,
      discarded_in_payload_count: persistence.discardedInPayloadCount,
      total: normalizedRows.length,
      saldo_final_csv: parsed.closingBalance,
      conta_csv: parsed.accountNumber,
      periodo_csv: parsed.periodLabel,
      summary: movementSummary,
      imported_at: now,
      message: `CSV importado com sucesso. ${persistence.importedCount} lancamento(s) novo(s).`,
    };
  } catch (error) {
    const message = serializeError(error);
    await finishSyncLog(log.id, {
      status: "error",
      error_message: message,
    });
    throw error;
  }
}

async function runSyncForConfig(
  config: IntegrationConfig,
  {
    action,
    requestedFrom,
    requestedTo,
    triggerSource,
    persist = true,
    empresaIdOverride,
    debug = false,
  }: {
    action: string;
    requestedFrom?: string;
    requestedTo?: string;
    triggerSource: string;
    persist?: boolean;
    empresaIdOverride?: string;
    debug?: boolean;
  },
) {
  const now = new Date();
  const intervalMinutes = Number(getConfigValue(config, "auto_sync_interval_minutes", config.auto_sync_interval_minutes || 60) || 60);
  const backfillDays = Number(getConfigValue(config, "sync_backfill_days", config.sync_backfill_days || 3) || 3);
  const empresaId = sanitizeText(firstDefined(empresaIdOverride, config.empresa_id));
  if (persist && !empresaId) {
    throw new Error("Informe a empresa da integracao para importar o extrato.");
  }
  const fromDate = requestedFrom
    ? formatDateOnly(requestedFrom)
    : config.last_success_at
      ? formatDateOnly(addDays(new Date(config.last_success_at), -1))
      : formatDateOnly(addDays(now, -backfillDays));
  const toDate = requestedTo ? formatDateOnly(requestedTo) : formatDateOnly(now);
  const today = formatDateOnly(now);
  const currentBalanceReferenceDate = today;
  const refreshToday = fromDate <= today && toDate >= today;
  const dateWindows = buildDateWindows(fromDate, toDate);

  const log = config.empresa_id === empresaId
    ? await startSyncLog(config, triggerSource, fromDate, toDate)
    : await startSyncLogForCompany(config, empresaId, triggerSource, fromDate, toDate);
  await updateIntegrationStatus(config.id, {
    sync_status: "running",
    last_sync_started_at: now.toISOString(),
    last_error_message: null,
  });

  try {
    const { accessToken, httpClient, tokenResponse, tokenStatus } = await getAccessToken(config);
    let currentBalance = typeof config.current_balance === "number" ? config.current_balance : null;
    let currentBalanceAt = config.current_balance_at || null;
    let balanceWarning: string | null = null;
    let rawCount = 0;
    let normalizedRows: NormalizedTransaction[] = [];
    let httpStatus = tokenStatus;
    let processedWindowCount = 0;
    const debugWindows: unknown[] = [];

    try {
      const balanceResult = await fetchBalance(config, accessToken, httpClient, currentBalanceReferenceDate);
      currentBalance = balanceResult.balance;
      currentBalanceAt = new Date().toISOString();
      httpStatus = balanceResult.httpStatus || httpStatus;
    } catch (error) {
      balanceWarning = serializeError(error);
      console.warn("Banco Inter balance warning", balanceWarning);
    }

    for (const window of dateWindows) {
      try {
        const {
          payload,
          httpStatus: windowHttpStatus,
          processedWindows,
        } = await fetchExtratoResilient(config, accessToken, httpClient, window.from, window.to);
        rawCount += countTransactions(payload);
        httpStatus = windowHttpStatus;
        processedWindowCount += processedWindows;

        if (empresaId) {
          const windowRows = await normalizeTransactions(empresaId, log.id, payload);
          normalizedRows = normalizedRows.concat(windowRows);
          if (debug) {
            debugWindows.push({
              window,
              sample: buildDateDebugSample(payload, windowRows),
            });
          }
        }
      } catch (error) {
        const baseMessage = serializeError(error);
        throw new Error(`Falha ao importar a janela ${window.from} ate ${window.to}: ${baseMessage}`);
      }
    }

    const persistence = persist
      ? await persistTransactions(empresaId, normalizedRows, { refreshToday })
      : {
        importedCount: rawCount,
        refreshedTodayCount: refreshToday ? normalizedRows.filter((row) => row.data_movimento === today).length : 0,
        historicalInsertedCount: rawCount,
        discardedExistingCount: 0,
        discardedInPayloadCount: 0,
      };
    const movementSummary = persist && empresaId
      ? await persistMovementSummary(config, empresaId)
      : parseStoredMovementSummary(config);

    const finishedAt = new Date().toISOString();
    await finishSyncLog(log.id, {
      status: "success",
      imported_count: persistence.importedCount,
      deduplicated_count: persistence.discardedExistingCount + persistence.discardedInPayloadCount,
      http_status: httpStatus,
      response_summary: {
        token_status: tokenStatus,
        token_type: tokenResponse?.token_type || null,
        range: { from: fromDate, to: toDate },
        windows: dateWindows,
        requested_window_count: dateWindows.length,
        processed_window_count: processedWindowCount,
        received_count: rawCount,
        refreshed_today_count: persistence.refreshedTodayCount,
        discarded_existing_count: persistence.discardedExistingCount,
        discarded_in_payload_count: persistence.discardedInPayloadCount,
        current_balance: currentBalance,
        current_balance_at: currentBalanceAt,
        current_balance_reference_date: currentBalanceReferenceDate,
        imported_range_from: fromDate,
        imported_range_to: toDate,
        balance_warning: balanceWarning,
        movement_summary: movementSummary,
      },
    });

    await updateIntegrationStatus(config.id, {
      sync_status: "success",
      last_sync_finished_at: finishedAt,
      last_success_at: finishedAt,
      last_http_status: httpStatus,
      last_error_at: null,
      last_error_message: null,
      current_balance: currentBalance,
      current_balance_at: currentBalanceAt,
      next_sync_at: addMinutes(now, intervalMinutes).toISOString(),
    });

    return {
      success: true,
      action,
      from: fromDate,
      to: toDate,
      imported_count: persistence.importedCount,
      historical_inserted_count: persistence.historicalInsertedCount,
      refreshed_today_count: persistence.refreshedTodayCount,
      discarded_existing_count: persistence.discardedExistingCount,
      discarded_in_payload_count: persistence.discardedInPayloadCount,
      total: rawCount,
      inseridas: persistence.historicalInsertedCount,
      saldo_atual: currentBalance,
      saldo_atualizado_em: currentBalanceAt,
      saldo_atual_referencia: currentBalanceReferenceDate,
      balance_warning: balanceWarning,
      summary: movementSummary,
      received_count: rawCount,
      windows_processed: processedWindowCount,
      debug_windows: debug ? debugWindows : undefined,
      message: action === "test"
        ? "Conexao com Banco Inter validada com sucesso."
        : processedWindowCount > 1
          ? `Extrato importado em ${processedWindowCount} janela(s). Historico novo: ${persistence.historicalInsertedCount}. Hoje atualizado: ${persistence.refreshedTodayCount}.`
          : `Extrato importado com sucesso. Historico novo: ${persistence.historicalInsertedCount}. Hoje atualizado: ${persistence.refreshedTodayCount}.`,
    };
  } catch (error) {
    const message = serializeError(error);
    const failedAt = new Date().toISOString();

    await finishSyncLog(log.id, {
      status: "error",
      error_message: message,
    });

    await updateIntegrationStatus(config.id, {
      sync_status: "error",
      last_sync_finished_at: failedAt,
      last_error_at: failedAt,
      last_error_message: message,
      next_sync_at: addMinutes(now, intervalMinutes).toISOString(),
    });

    throw error;
  }
}

type MovementSummary = {
  movement_count: number;
  total_entradas: number;
  total_saidas: number;
  oldest_movement_date: string | null;
  newest_movement_date: string | null;
  generated_at: string;
};

function parseStoredMovementSummary(config: IntegrationConfig): MovementSummary | null {
  const rawSummary = getConfigValue<Record<string, unknown> | null>(config, "movement_summary", null);
  if (!rawSummary || typeof rawSummary !== "object") return null;

  return {
    movement_count: Number(rawSummary.movement_count) || 0,
    total_entradas: Number(rawSummary.total_entradas) || 0,
    total_saidas: Number(rawSummary.total_saidas) || 0,
    oldest_movement_date: sanitizeText(rawSummary.oldest_movement_date) || null,
    newest_movement_date: sanitizeText(rawSummary.newest_movement_date) || null,
    generated_at: sanitizeText(rawSummary.generated_at) || new Date().toISOString(),
  };
}

async function computeMovementSummary(empresaId: string): Promise<MovementSummary> {
  const data = removeOverlappingApiRows(
    await loadMovementRowsPaginated<MovementSummaryRow>(empresaId, "tipo, valor, data_movimento, data, source_provider, raw_data"),
  );

  const uniqueRowsByFingerprint = new Map<string, MovementSummaryRow>();
  const uniqueRows: MovementSummaryRow[] = [];

  for (const row of data || []) {
    const fingerprint = buildMovementFingerprint(row);
    if (!fingerprint) {
      uniqueRows.push(row);
      continue;
    }
    if (uniqueRowsByFingerprint.has(fingerprint)) continue;
    uniqueRowsByFingerprint.set(fingerprint, row);
    uniqueRows.push(row);
  }

  let totalEntradas = 0;
  let totalSaidas = 0;
  let oldestMovementDate: string | null = null;
  let newestMovementDate: string | null = null;

  for (const row of uniqueRows) {
    const amount = typeof row?.valor === "number" ? row.valor : Number(row?.valor || 0);
    if ((row?.tipo || "") === "saida") {
      totalSaidas += Number.isFinite(amount) ? amount : 0;
    } else {
      totalEntradas += Number.isFinite(amount) ? amount : 0;
    }

    const movementDate = sanitizeText(row?.data_movimento);
    if (!movementDate) continue;

    if (!oldestMovementDate || movementDate < oldestMovementDate) {
      oldestMovementDate = movementDate;
    }
    if (!newestMovementDate || movementDate > newestMovementDate) {
      newestMovementDate = movementDate;
    }
  }

  return {
    movement_count: uniqueRows.length,
    total_entradas: totalEntradas,
    total_saidas: totalSaidas,
    oldest_movement_date: oldestMovementDate,
    newest_movement_date: newestMovementDate,
    generated_at: new Date().toISOString(),
  };
}

async function persistMovementSummary(
  config: IntegrationConfig,
  empresaId: string,
): Promise<MovementSummary> {
  const summary = await computeMovementSummary(empresaId);
  const mergedConfig = {
    ...((config.config && typeof config.config === "object") ? config.config : {}),
    movement_summary: summary,
  };

  await updateIntegrationStatus(config.id, { config: mergedConfig });
  config.config = mergedConfig;
  return summary;
}

async function loadConfigs() {
  const { data, error } = await supabase
    .from("integracao_config")
    .select("*")
    .eq("ativo", true);

  if (error) throw error;
  return (data || []).filter((item) => sanitizeText(item.provider || item.nome) === "banco_inter");
}

async function findConfig(payload: Record<string, unknown>) {
  const configs = await loadConfigs();
  const integrationId = sanitizeText(payload.integracao_id);
  const empresaId = sanitizeText(payload.empresa_id);

  if (integrationId) {
    return configs.find((item) => item.id === integrationId) || null;
  }

  if (empresaId) {
    const companyConfig = configs.find((item) => sanitizeText(item.empresa_id) === empresaId) || null;
    if (companyConfig) return companyConfig;
    return configs.find((item) => !sanitizeText(item.empresa_id)) || null;
  }

  return configs[0] || null;
}

async function loadOverviewForConfig(
  config: IntegrationConfig,
  {
    empresaIdOverride,
    limit = 500,
  }: {
    empresaIdOverride?: string;
    limit?: number;
  } = {},
) {
  const empresaId = sanitizeText(firstDefined(empresaIdOverride, config.empresa_id));
  if (!empresaId) {
    throw new Error("Informe a empresa da integracao para consultar o extrato.");
  }

  const rowLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);
  let movementSummary = parseStoredMovementSummary(config);
  if (!movementSummary) {
    movementSummary = await persistMovementSummary(config, empresaId);
  }

  const movements = removeOverlappingApiRows(
    await loadMovementRowsPaginated<Record<string, unknown>>(empresaId, "*", {
      pageSize: Math.min(rowLimit, 1000),
      maxRows: rowLimit,
    }),
  );

  return {
    success: true,
    action: "overview",
    empresa_id: empresaId,
    integracao_id: config.id,
    current_balance: typeof config.current_balance === "number" ? config.current_balance : null,
    current_balance_at: config.current_balance_at || null,
    sync_status: config.sync_status || null,
    next_sync_at: config.next_sync_at || null,
    summary: movementSummary,
    movements: movements || [],
  };
}

async function loadAllMovementsForConfig(
  config: IntegrationConfig,
  {
    empresaIdOverride,
    limit = 50000,
    pageSize = 1000,
  }: {
    empresaIdOverride?: string;
    limit?: number;
    pageSize?: number;
  } = {},
) {
  const empresaId = sanitizeText(firstDefined(empresaIdOverride, config.empresa_id));
  if (!empresaId) {
    throw new Error("Informe a empresa da integracao para consultar o extrato completo.");
  }

  const maxRows = Math.min(Math.max(Number(limit) || 50000, 1), 100000);
  const batchSize = Math.min(Math.max(Number(pageSize) || 1000, 1), 1000);
  let movementSummary = parseStoredMovementSummary(config);
  if (!movementSummary) {
    movementSummary = await persistMovementSummary(config, empresaId);
  }
  const movements = removeOverlappingApiRows(
    await loadMovementRowsPaginated<Record<string, unknown>>(empresaId, "*", {
      pageSize: batchSize,
      maxRows,
    }),
  );

  return {
    success: true,
    action: "fullDataset",
    empresa_id: empresaId,
    integracao_id: config.id,
    current_balance: typeof config.current_balance === "number" ? config.current_balance : null,
    current_balance_at: config.current_balance_at || null,
    sync_status: config.sync_status || null,
    next_sync_at: config.next_sync_at || null,
    summary: movementSummary,
    movements: movements.slice(0, maxRows),
  };
}

async function loadLiveBalanceForConfig(
  config: IntegrationConfig,
  {
    empresaIdOverride,
  }: {
    empresaIdOverride?: string;
  } = {},
) {
  const empresaId = sanitizeText(firstDefined(empresaIdOverride, config.empresa_id));
  const balanceReferenceDate = formatDateOnly(new Date());
  const { accessToken, httpClient } = await getAccessToken(config);
  const balanceResult = await fetchBalance(config, accessToken, httpClient, balanceReferenceDate);

  return {
    success: true,
    action: "liveBalance",
    empresa_id: empresaId || null,
    integracao_id: config.id,
    saldo_atual: balanceResult.balance,
    saldo_atualizado_em: new Date().toISOString(),
    saldo_atual_referencia: balanceReferenceDate,
  };
}

function normalizeBase64Payload(value: unknown) {
  const text = sanitizeText(value);
  if (!text) return null;

  const match = text.match(/^data:application\/pdf;base64,(.+)$/i);
  return match ? match[1] : text;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function isPdfBytes(bytes: Uint8Array) {
  return bytes.length >= 4
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46;
}

function normalizeOfficialPdfBase64(value: unknown) {
  const normalized = sanitizeText(value)
    .replace(/^data:application\/pdf;base64,/i, "")
    .replace(/\s+/g, "");
  if (!normalized || normalized.length < 8) return null;

  try {
    const prefix = atob(normalized.slice(0, Math.min(normalized.length, 24)));
    return prefix.startsWith("%PDF") ? normalized : null;
  } catch {
    return null;
  }
}

function findOfficialReceiptArtifact(payload: unknown, depth = 0): { base64?: string; url?: string } | null {
  if (depth > 4 || payload === null || payload === undefined) return null;
  if (typeof payload === "string") {
    const base64 = normalizeOfficialPdfBase64(payload);
    if (base64) return { base64 };
    if (/^https?:\/\//i.test(payload)) return { url: payload };
    return null;
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const artifact = findOfficialReceiptArtifact(item, depth + 1);
      if (artifact) return artifact;
    }
    return null;
  }
  if (typeof payload !== "object") return null;

  const source = payload as Record<string, unknown>;
  const preferredKeys = [
    "pdf",
    "base64",
    "arquivo",
    "file",
    "comprovante",
    "comprovantePdf",
    "comprovante_pdf",
    "receipt",
    "receiptPdf",
    "receipt_pdf",
    "url",
    "downloadUrl",
    "download_url",
    "data",
    "result",
    "payload",
    "response",
    "content",
  ];
  for (const key of preferredKeys) {
    if (!(key in source)) continue;
    const artifact = findOfficialReceiptArtifact(source[key], depth + 1);
    if (artifact) return artifact;
  }
  for (const [key, value] of Object.entries(source)) {
    if (preferredKeys.includes(key)) continue;
    if (!value || typeof value !== "object") continue;
    const artifact = findOfficialReceiptArtifact(value, depth + 1);
    if (artifact) return artifact;
  }
  return null;
}

function resolveReceiptPathTemplate(
  template: string,
  identifiers: ReturnType<typeof resolveInterTransactionIdentifiers>,
  movementDate: string,
) {
  const values: Record<string, string> = {
    idtransacao: identifiers.idTransacao,
    codigotransacao: identifiers.codigoTransacao,
    codigosolicitacao: identifiers.codigoSolicitacao,
    endtoendid: identifiers.endToEndId,
    txid: identifiers.txid,
    nsu: identifiers.nsu,
    autenticacao: identifiers.autenticacao,
    datainicio: movementDate,
    datafim: movementDate,
  };
  let missingIdentifier = false;
  const resolved = template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    const normalizedKey = key.replace(/_/g, "").toLowerCase();
    const value = values[normalizedKey];
    if (!value) {
      missingIdentifier = true;
      return "";
    }
    return encodeURIComponent(value);
  });
  return missingIdentifier ? null : resolved;
}

async function readOfficialReceiptResponse(
  response: Response,
  {
    requestUrl,
    headers,
    httpClient,
  }: {
    requestUrl: URL;
    headers: Record<string, string>;
    httpClient: Deno.HttpClient;
  },
) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RECEIPT_PDF_BYTES) {
    throw new Error("O comprovante retornado excede o limite de 12 MB.");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_RECEIPT_PDF_BYTES) {
    throw new Error("O comprovante retornado excede o limite de 12 MB.");
  }
  if (isPdfBytes(bytes)) return { base64: bytesToBase64(bytes) };

  const rawText = new TextDecoder().decode(bytes);
  let parsed: unknown = rawText;
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsed = rawText;
  }
  const artifact = findOfficialReceiptArtifact(parsed);
  if (!artifact) throw new Error("A API respondeu sem um PDF, base64 ou URL de comprovante reconhecivel.");
  if (artifact.base64) return artifact;

  const artifactUrl = new URL(artifact.url || "", requestUrl);
  if (artifactUrl.origin !== requestUrl.origin) {
    if (artifactUrl.protocol !== "https:") throw new Error("A API retornou uma URL de comprovante insegura.");
    return { url: artifactUrl.toString() };
  }

  const fileResponse = await fetch(artifactUrl.toString(), {
    method: "GET",
    headers,
    client: httpClient,
  });
  if (!fileResponse.ok) {
    throw new Error(`Falha ao baixar o arquivo do comprovante (${fileResponse.status}).`);
  }
  const fileBytes = new Uint8Array(await fileResponse.arrayBuffer());
  if (fileBytes.length > MAX_RECEIPT_PDF_BYTES || !isPdfBytes(fileBytes)) {
    throw new Error("A URL retornada nao entregou um PDF valido dentro do limite de 12 MB.");
  }
  return { base64: bytesToBase64(fileBytes) };
}

async function fetchConfiguredOfficialReceiptPdf(
  config: IntegrationConfig,
  movement: Record<string, unknown>,
  rawData: Record<string, unknown>,
) {
  if (!configBoolean(getConfigValue(config, "receipt_pdf_enabled"))) {
    return { receipt: null, warning: null };
  }

  const configuredTemplates = sanitizeText(getConfigValue(config, "receipt_pdf_path_templates"))
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!configuredTemplates.length) {
    return {
      receipt: null,
      warning: "O comprovante oficial esta habilitado, mas nenhum endpoint foi configurado.",
    };
  }

  const identifiers = resolveInterTransactionIdentifiers(rawData);
  const movementDate = formatDateOnly(sanitizeText(
    firstDefined(movement.data_movimento, movement.data, movement.created_date),
    new Date().toISOString(),
  ));
  const resolvedTemplates = configuredTemplates
    .map((template) => resolveReceiptPathTemplate(template, identifiers, movementDate))
    .filter((template): template is string => Boolean(template));
  if (!resolvedTemplates.length) {
    return {
      receipt: null,
      warning: "A transacao nao possui o identificador exigido pelos endpoints de comprovante configurados.",
    };
  }

  const { accessToken, httpClient } = await getAccessToken(config, {
    scopeConfigKey: "receipt_pdf_scope",
    fallbackScope: DEFAULT_RECEIPT_PDF_SCOPE,
    actionLabel: "consultar o comprovante individual",
  });
  const apiBaseUrl = sanitizeText(config.api_base_url || getConfigValue(config, "api_base_url"), DEFAULT_API_BASE_URL);
  const apiOrigin = new URL(apiBaseUrl).origin;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/pdf, application/json;q=0.9, application/octet-stream;q=0.8",
  };
  const accountNumber = sanitizeText(getConfigValue(config, "account_number")).replace(/\D/g, "");
  if (accountNumber) headers["x-conta-corrente"] = accountNumber;
  const extraHeaders = (config.extra_headers || getConfigValue<Record<string, unknown>>(config, "extra_headers") || {}) as Record<string, unknown>;
  Object.entries(extraHeaders).forEach(([key, value]) => {
    if (value !== null && value !== undefined) headers[key] = String(value);
  });

  const errors: string[] = [];
  for (let index = 0; index < resolvedTemplates.length; index += 1) {
    try {
      const url = new URL(resolvedTemplates[index], apiBaseUrl);
      if (url.origin !== apiOrigin) {
        throw new Error("O endpoint configurado precisa usar o mesmo dominio da API Base URL.");
      }
      const response = await fetch(url.toString(), {
        method: "GET",
        headers,
        client: httpClient,
      });
      if (!response.ok) {
        const rawError = await response.text();
        throw new Error(`HTTP ${response.status}${rawError ? `: ${rawError.slice(0, 300)}` : ""}`);
      }
      const artifact = await readOfficialReceiptResponse(response, { requestUrl: url, headers, httpClient });
      return {
        receipt: {
          ...artifact,
          mime_type: "application/pdf",
          source: "banco_inter_official_receipt_pdf",
        },
        warning: null,
      };
    } catch (error) {
      errors.push(`Endpoint ${index + 1}: ${serializeError(error)}`);
    }
  }

  return {
    receipt: null,
    warning: `O Banco Inter nao entregou o comprovante oficial. ${errors.join(" | ")}`,
  };
}

async function diagnoseInterCapabilities(config: IntegrationConfig) {
  const receiptEnabled = configBoolean(getConfigValue(config, "receipt_pdf_enabled"));
  const receiptTemplates = sanitizeText(getConfigValue(config, "receipt_pdf_path_templates"));
  const definitions = [
    {
      key: "banking_read",
      label: "Extrato e saldo",
      scopeConfigKey: null,
      fallbackScope: DEFAULT_BANKING_SCOPE,
      actionLabel: "validar extrato e saldo",
    },
    {
      key: "pix_received_read",
      label: "Pix recebidos",
      scopeConfigKey: "pix_read_scope",
      fallbackScope: DEFAULT_PIX_READ_SCOPE,
      actionLabel: "validar consulta de Pix recebidos",
    },
    {
      key: "pix_payment_read",
      label: "Pagamentos Pix",
      scopeConfigKey: "pix_payment_read_scope",
      fallbackScope: DEFAULT_PIX_PAYMENT_READ_SCOPE,
      actionLabel: "validar consulta de pagamentos Pix",
    },
    {
      key: "boleto_payment_read",
      label: "Pagamentos de boletos",
      scopeConfigKey: "boleto_payment_read_scope",
      fallbackScope: DEFAULT_BOLETO_PAYMENT_READ_SCOPE,
      actionLabel: "validar consulta de pagamentos de boletos",
    },
    {
      key: "charge_read",
      label: "Consulta de cobrancas",
      scopeConfigKey: "charge_read_scope",
      fallbackScope: DEFAULT_CHARGE_READ_SCOPE,
      actionLabel: "validar consulta de cobrancas",
    },
    {
      key: "charge_write",
      label: "Emissao de cobrancas",
      scopeConfigKey: "charge_write_scope",
      fallbackScope: DEFAULT_CHARGE_WRITE_SCOPE,
      actionLabel: "validar emissao de cobrancas",
    },
    {
      key: "official_receipt_pdf",
      label: "Comprovante individual oficial",
      scopeConfigKey: "receipt_pdf_scope",
      fallbackScope: DEFAULT_RECEIPT_PDF_SCOPE,
      actionLabel: "validar comprovante individual",
      configurationRequired: !receiptEnabled || !receiptTemplates,
    },
  ];

  const capabilities: Array<Record<string, unknown>> = [];
  let rateLimited = false;
  for (const definition of definitions) {
    const scope = resolveScopedTokenScope(config, {
      scopeConfigKey: definition.scopeConfigKey || undefined,
      fallbackScope: definition.fallbackScope,
    });

    if (definition.configurationRequired) {
      capabilities.push({
        key: definition.key,
        label: definition.label,
        scope,
        status: "configuration_required",
        message: "Habilite o comprovante e informe o endpoint oficial disponibilizado para a nova API.",
      });
      continue;
    }
    if (rateLimited) {
      capabilities.push({
        key: definition.key,
        label: definition.label,
        scope,
        status: "not_tested",
        message: "Nao testado para evitar novas requisicoes durante o limite temporario do Inter.",
      });
      continue;
    }

    try {
      await getAccessToken(config, {
        scopeConfigKey: definition.scopeConfigKey || undefined,
        fallbackScope: definition.fallbackScope,
        actionLabel: definition.actionLabel,
      });
      capabilities.push({
        key: definition.key,
        label: definition.label,
        scope,
        status: "available",
        message: definition.key === "official_receipt_pdf"
          ? "Scope aceito e endpoint configurado. O PDF sera validado ao abrir um comprovante real."
          : "Scope aceito pelo OAuth do Banco Inter.",
      });
      await wait(350);
    } catch (error) {
      const message = serializeError(error);
      const isRateLimit = error instanceof BancoInterAuthError && error.status === 429;
      if (isRateLimit) rateLimited = true;
      capabilities.push({
        key: definition.key,
        label: definition.label,
        scope,
        status: isRateLimit
          ? "rate_limited"
          : error instanceof BancoInterAuthError
          ? "unavailable"
          : "error",
        message,
      });
    }
  }

  const unavailableCount = capabilities.filter((item) => item.status !== "available").length;
  return {
    success: unavailableCount === 0,
    action: "diagnoseCapabilities",
    integracao_id: config.id,
    capabilities,
    message: unavailableCount === 0
      ? "Todas as capacidades configuradas foram aceitas pelo OAuth do Banco Inter."
      : `${unavailableCount} capacidade(s) ainda exigem permissao, configuracao ou nova tentativa.`,
  };
}

function getInterTransactionDetails(rawData: Record<string, unknown>) {
  return rawData.detalhes && typeof rawData.detalhes === "object"
    ? rawData.detalhes as Record<string, unknown>
    : {};
}

function resolveInterTransactionIdentifiers(rawData: Record<string, unknown>) {
  const details = getInterTransactionDetails(rawData);
  return {
    idTransacao: sanitizeText(firstDefined(rawData.idTransacao, rawData.id, rawData.transactionId)),
    codigoTransacao: sanitizeText(firstDefined(rawData.codigoTransacao, rawData.idTransacao, rawData.transactionId)),
    codigoSolicitacao: sanitizeText(firstDefined(rawData.codigoSolicitacao, details.codigoSolicitacao)),
    endToEndId: sanitizeText(firstDefined(rawData.endToEndId, rawData.e2eId, details.endToEndId, details.endToEnd)),
    txid: sanitizeText(firstDefined(rawData.txid, rawData.txId, details.txid, details.txId)),
    nsu: sanitizeText(firstDefined(rawData.nsu, rawData.nsudoc, details.nsu)),
    autenticacao: sanitizeText(firstDefined(rawData.autenticacao, details.autenticacao)),
  };
}

function normalizeReceiptMatchText(value: unknown) {
  return sanitizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function resolveRawTransactionDescription(rawData: Record<string, unknown>) {
  return sanitizeText(firstDefined(
    rawData.descricao,
    rawData.historico,
    rawData.titulo,
    rawData.title,
  ));
}

function findMatchingCompleteTransaction(
  movement: Record<string, unknown>,
  storedRawData: Record<string, unknown>,
  payload: unknown,
) {
  const movementDate = formatDateOnly(sanitizeText(
    firstDefined(movement.data_movimento, movement.data, movement.created_date),
    new Date().toISOString(),
  ));
  const movementType = sanitizeText(movement.tipo).toLowerCase();
  const movementAmount = Math.abs(toNumber(movement.valor));
  const storedDescription = normalizeReceiptMatchText(firstDefined(
    storedRawData.descricao,
    storedRawData.historico,
    movement.descricao,
  ));

  const candidates = getTransactionArray(payload).filter((transaction) => {
    const rawDate = formatDateOnly(sanitizeText(getRawInterTransactionDateTime(transaction)));
    const rawAmount = Math.abs(toNumber(firstDefined(
      transaction.valor,
      transaction.amount,
      transaction.valorLancamento,
      transaction.valorTransacao,
    )));
    return rawDate === movementDate
      && inferTipo(transaction, rawAmount) === movementType
      && Math.abs(rawAmount - movementAmount) < 0.005;
  });

  if (candidates.length <= 1) return candidates[0] || null;

  const scored = candidates.map((transaction) => {
    const candidateDescription = normalizeReceiptMatchText(resolveRawTransactionDescription(transaction));
    let score = 0;
    if (candidateDescription && candidateDescription === storedDescription) score += 4;
    if (
      candidateDescription
      && storedDescription
      && (candidateDescription.includes(storedDescription) || storedDescription.includes(candidateDescription))
    ) score += 2;
    return { transaction, score };
  }).sort((left, right) => right.score - left.score);

  if (!scored[0]?.score || scored[0].score === scored[1]?.score) return null;
  return scored[0].transaction;
}

function maskBankDocument(value: unknown) {
  const digits = sanitizeText(value).replace(/\D/g, "");
  if (digits.length === 11) return `***.***.***-${digits.slice(-2)}`;
  if (digits.length === 14) return `**.***.***/****-${digits.slice(-2)}`;
  return digits ? `***${digits.slice(-4)}` : null;
}

function resolveLiveReceiptRecord(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload[0] && typeof payload[0] === "object" ? payload[0] as Record<string, unknown> : {};
  }
  if (!payload || typeof payload !== "object") return {};
  const source = payload as Record<string, unknown>;
  if (source.transacaoPix && typeof source.transacaoPix === "object") {
    return source.transacaoPix as Record<string, unknown>;
  }
  return source;
}

async function fetchLiveTransactionDetails(
  config: IntegrationConfig,
  movement: Record<string, unknown>,
  rawData: Record<string, unknown>,
  auth?: InterTokenResult | null,
) {
  const identifiers = resolveInterTransactionIdentifiers(rawData);
  const transactionType = sanitizeText(firstDefined(rawData.tipoTransacao, rawData.tipo, rawData.titulo)).toUpperCase();
  const direction = sanitizeText(movement.tipo).toLowerCase();

  if (transactionType === "PIX" && direction === "entrada" && identifiers.endToEndId) {
    const pixPath = sanitizeText(getConfigValue(config, "pix_path"), DEFAULT_PIX_PATH);
    return await fetchScopedInterJson(config, {
      path: `${pixPath.replace(/\/$/, "")}/${encodeURIComponent(identifiers.endToEndId)}`,
      scopeConfigKey: "pix_read_scope",
      fallbackScope: DEFAULT_PIX_READ_SCOPE,
      actionLabel: "consultar o Pix recebido",
      auth,
    });
  }

  if (transactionType === "PIX" && direction === "saida" && identifiers.codigoSolicitacao) {
    const pixPaymentPath = sanitizeText(getConfigValue(config, "pix_payment_path"), DEFAULT_PIX_PAYMENT_PATH);
    return await fetchScopedInterJson(config, {
      path: `${pixPaymentPath.replace(/\/$/, "")}/${encodeURIComponent(identifiers.codigoSolicitacao)}`,
      scopeConfigKey: "pix_payment_read_scope",
      fallbackScope: DEFAULT_PIX_PAYMENT_READ_SCOPE,
      actionLabel: "consultar o pagamento Pix",
      auth,
    });
  }

  if (["PAGAMENTO", "BOLETO"].includes(transactionType) && direction === "saida" && identifiers.codigoTransacao) {
    const boletoPaymentPath = sanitizeText(getConfigValue(config, "boleto_payment_path"), DEFAULT_BOLETO_PAYMENT_PATH);
    return await fetchScopedInterJson(config, {
      path: boletoPaymentPath,
      scopeConfigKey: "boleto_payment_read_scope",
      fallbackScope: DEFAULT_BOLETO_PAYMENT_READ_SCOPE,
      actionLabel: "consultar o pagamento de boleto",
      searchParams: { codigoTransacao: identifiers.codigoTransacao },
      auth,
    });
  }

  return null;
}

function resolveReceiptLookupScope(
  movement: Record<string, unknown>,
  rawData: Record<string, unknown>,
) {
  const transactionType = sanitizeText(firstDefined(
    rawData.tipoTransacao,
    rawData.tipo,
    rawData.titulo,
  )).toUpperCase();
  const direction = sanitizeText(movement.tipo).toLowerCase();
  const scopes = ["extrato.read"];

  if (transactionType === "PIX") {
    scopes.push(direction === "saida" ? DEFAULT_PIX_PAYMENT_READ_SCOPE : DEFAULT_PIX_READ_SCOPE);
  } else if (["PAGAMENTO", "BOLETO", "BOLETO_COBRANCA"].includes(transactionType) && direction === "saida") {
    scopes.push(DEFAULT_BOLETO_PAYMENT_READ_SCOPE);
  }

  return normalizeScope(scopes.join(" "));
}

function buildLiveReceiptDetails(
  movement: Record<string, unknown>,
  rawData: Record<string, unknown>,
  livePayload: unknown,
) {
  const rawDetails = getInterTransactionDetails(rawData);
  const live = resolveLiveReceiptRecord(livePayload);
  const liveReceiver = live.recebedor && typeof live.recebedor === "object"
    ? live.recebedor as Record<string, unknown>
    : {};
  const identifiers = resolveInterTransactionIdentifiers({ ...rawData, ...live });
  const direction = sanitizeText(movement.tipo).toLowerCase();
  const counterpartyName = direction === "entrada"
    ? firstDefined(rawDetails.nomePagador, rawData.nomePagador, live.pagador, movement.nome_contraparte)
    : firstDefined(liveReceiver.nome, rawDetails.nomeRecebedor, rawData.nomeRecebedor, live.nomeBeneficiario, movement.nome_contraparte);
  const counterpartyDocument = direction === "entrada"
    ? firstDefined(rawDetails.cpfCnpjPagador, rawData.cpfCnpjPagador, live.cpfCnpjPagador)
    : firstDefined(liveReceiver.cpfCnpj, rawDetails.cpfCnpjRecebedor, rawData.cpfCnpjRecebedor, live.cpfCnpjBeneficiario);

  return {
    description: sanitizeText(firstDefined(resolveRawTransactionDescription(rawData), movement.descricao)),
    direction: direction === "saida" ? "Saída" : "Entrada",
    amount: Math.abs(toNumber(firstDefined(live.valor, live.valorPago, rawData.valor, movement.valor))),
    transaction_date: sanitizeText(firstDefined(
      live.dataHoraMovimento,
      live.dataPagamento,
      rawData.dataTransacao,
      rawData.dataInclusao,
      movement.data_hora_transacao,
      movement.data_movimento,
    )),
    transaction_type: normalizeDisplayLabel(firstDefined(rawData.tipoTransacao, rawData.tipo, rawData.titulo)) || "Movimentação bancária",
    counterparty_name: normalizeDisplayName(counterpartyName) || null,
    counterparty_document: maskBankDocument(counterpartyDocument),
    status: normalizeDisplayLabel(firstDefined(live.status, live.statusPagamento, rawData.status, movement.status)) || null,
    provider_reference: sanitizeText(firstDefined(
      identifiers.codigoSolicitacao,
      identifiers.codigoTransacao,
      identifiers.idTransacao,
      identifiers.endToEndId,
      identifiers.txid,
      movement.referencia,
    )) || null,
    end_to_end_id: identifiers.endToEndId || sanitizeText(firstDefined(live.endToEnd, live.endToEndId)) || null,
    txid: identifiers.txid || null,
    nsu: identifiers.nsu || sanitizeText(live.nsu) || null,
    authentication: identifiers.autenticacao || sanitizeText(live.autenticacao) || null,
  };
}

async function loadTransactionReceiptForConfig(
  config: IntegrationConfig,
  {
    empresaIdOverride,
    movementId,
  }: {
    empresaIdOverride?: string;
    movementId?: string;
  } = {},
) {
  const empresaId = sanitizeText(firstDefined(empresaIdOverride, config.empresa_id));
  if (!empresaId) {
    throw new Error("Informe a empresa para consultar o comprovante.");
  }

  const resolvedMovementId = sanitizeText(movementId);
  if (!resolvedMovementId) {
    throw new Error("Informe a transação que deve ter o comprovante consultado.");
  }

  let query = supabase
    .from("extratobancario")
    .select("*")
    .eq("empresa_id", empresaId)
    .limit(1);

  query = query.eq("id", resolvedMovementId);

  const { data: movement, error: movementError } = await query.maybeSingle();
  if (movementError) throw movementError;
  if (!movement) {
    return {
      success: false,
      action: "transactionReceipt",
      empresa_id: empresaId,
      integracao_id: config.id,
      movement_id: resolvedMovementId,
      receipt_available: false,
      message: "Transação não encontrada para consultar o comprovante.",
    };
  }

  const rawData = movement.raw_data && typeof movement.raw_data === "object"
    ? movement.raw_data as Record<string, unknown>
    : {};

  const embeddedPdfBase64 = normalizeBase64Payload(firstDefined(
    rawData.comprovante_pdf_base64,
    rawData.comprovanteBase64,
    rawData.receipt_pdf_base64,
    rawData.receiptBase64,
  ));

  if (embeddedPdfBase64) {
    return {
      success: true,
      action: "transactionReceipt",
      empresa_id: empresaId,
      integracao_id: config.id,
      movement_id: movement.id,
      transaction_id: movement.id,
      file_name: `comprovante-${movement.id}.pdf`,
      mime_type: "application/pdf",
      base64: embeddedPdfBase64,
      source: "embedded_payload",
    };
  }

  const directReceiptUrl = sanitizeText(firstDefined(
    rawData.comprovante_url,
    rawData.comprovanteUrl,
    rawData.receipt_url,
    rawData.receiptUrl,
  ));

  if (directReceiptUrl) {
    return {
      success: true,
      action: "transactionReceipt",
      empresa_id: empresaId,
      integracao_id: config.id,
      movement_id: movement.id,
      transaction_id: movement.id,
      file_name: `comprovante-${movement.id}.pdf`,
      mime_type: "application/pdf",
      url: directReceiptUrl,
      source: "direct_url",
    };
  }

  let enrichedRawData = rawData;
  let liveLookupWarning: string | null = null;
  let receiptAuth: InterTokenResult | null = null;
  const movementDate = formatDateOnly(firstDefined(movement.data_movimento, movement.data, movement.created_date));

  try {
    receiptAuth = await getAccessToken(config, {
      scopeConfigKey: "receipt_lookup_scope",
      fallbackScope: resolveReceiptLookupScope(movement, rawData),
      actionLabel: "consultar os dados do comprovante",
    });
    const completeStatement = await fetchExtrato(
      config,
      receiptAuth.accessToken,
      receiptAuth.httpClient,
      movementDate,
      movementDate,
    );
    const matchedTransaction = findMatchingCompleteTransaction(movement, rawData, completeStatement.payload);

    if (matchedTransaction) {
      const previousDetails = getInterTransactionDetails(rawData);
      const matchedDetails = getInterTransactionDetails(matchedTransaction);
      enrichedRawData = {
        ...rawData,
        ...matchedTransaction,
        detalhes: { ...previousDetails, ...matchedDetails },
      };
      const identifiers = resolveInterTransactionIdentifiers(enrichedRawData);
      const providerReference = sanitizeText(firstDefined(
        identifiers.codigoSolicitacao,
        identifiers.codigoTransacao,
        identifiers.idTransacao,
        identifiers.endToEndId,
        identifiers.txid,
        movement.referencia,
      ));
      const previousMetadata = movement.metadata_financeira && typeof movement.metadata_financeira === "object"
        ? movement.metadata_financeira as Record<string, unknown>
        : {};
      const { error: enrichmentError } = await supabase
        .from("extratobancario")
        .update({
          raw_data: enrichedRawData,
          referencia: providerReference || movement.referencia || null,
          metadata_financeira: {
            ...previousMetadata,
            receipt_enriched_at: new Date().toISOString(),
            receipt_source: "banco_inter_extrato_completo",
          },
          updated_date: new Date().toISOString(),
        })
        .eq("empresa_id", empresaId)
        .eq("id", movement.id);
      if (enrichmentError) liveLookupWarning = serializeError(enrichmentError);
    } else {
      liveLookupWarning = "O lançamento não pôde ser associado com segurança a uma transação única do extrato completo.";
    }
  } catch (error) {
    liveLookupWarning = serializeError(error);
  }

  const identifiers = resolveInterTransactionIdentifiers(enrichedRawData);
  const hasBankReference = Boolean(
    identifiers.idTransacao
    || identifiers.codigoTransacao
    || identifiers.codigoSolicitacao
    || identifiers.endToEndId
    || identifiers.txid,
  );

  if (!hasBankReference && enrichedRawData === rawData) {
    return {
      success: false,
      action: "transactionReceipt",
      empresa_id: empresaId,
      integracao_id: config.id,
      movement_id: movement.id,
      transaction_id: movement.id,
      receipt_available: false,
      message: liveLookupWarning
        ? `Não foi possível consultar os detalhes bancários desta transação. ${liveLookupWarning}`
        : "O Banco Inter não retornou um identificador individual para esta transação.",
    };
  }

  let officialPdfWarning: string | null = null;
  try {
    const officialPdfResult = await fetchConfiguredOfficialReceiptPdf(config, movement, enrichedRawData);
    officialPdfWarning = officialPdfResult.warning;
    if (officialPdfResult.receipt) {
      return {
        success: true,
        action: "transactionReceipt",
        empresa_id: empresaId,
        integracao_id: config.id,
        movement_id: movement.id,
        transaction_id: movement.id,
        receipt_available: true,
        receipt_format: "pdf",
        official_pdf: true,
        file_name: `comprovante-${movement.id}.pdf`,
        ...officialPdfResult.receipt,
        message: "Comprovante individual consultado em tempo real no Banco Inter.",
      };
    }
  } catch (error) {
    officialPdfWarning = serializeError(error);
  }

  let liveDetailsPayload: unknown = null;
  let detailLookupWarning: string | null = null;
  if (receiptAuth) {
    try {
      liveDetailsPayload = await fetchLiveTransactionDetails(config, movement, enrichedRawData, receiptAuth);
    } catch (error) {
      const detailError = serializeError(error);
      if (!detailError.includes("(404)")) detailLookupWarning = detailError;
    }
  }

  const receiptDetails = buildLiveReceiptDetails(movement, enrichedRawData, liveDetailsPayload);
  const hasImportedOfficialDetails = Boolean(
    receiptDetails.provider_reference
    && receiptDetails.transaction_date
    && receiptDetails.amount > 0,
  );

  return {
    success: true,
    action: "transactionReceipt",
    empresa_id: empresaId,
    integracao_id: config.id,
    movement_id: movement.id,
    transaction_id: movement.id,
    receipt_available: true,
    receipt_format: "bank_details",
    official_pdf: false,
    source: liveDetailsPayload ? "banco_inter_transaction_api" : "banco_inter_extrato_completo",
    provider_reference: sanitizeText(firstDefined(
      identifiers.codigoSolicitacao,
      identifiers.codigoTransacao,
      identifiers.idTransacao,
      identifiers.endToEndId,
      identifiers.txid,
    )) || null,
    details: receiptDetails,
    warning: officialPdfWarning
      || detailLookupWarning
      || (!hasImportedOfficialDetails ? liveLookupWarning : null)
      || null,
    message: liveDetailsPayload
      ? "Dados da transação consultados em tempo real no Banco Inter."
      : receiptAuth
      ? "Comprovante individual recuperado a partir dos dados oficiais da transação no Banco Inter."
      : "Comprovante individual montado com os dados oficiais já importados do Banco Inter.",
  };
}

async function handleScheduledSync() {
  let budgetExpiration = null;
  try {
    budgetExpiration = await expireDueBudgets();
  } catch (error) {
    console.warn("banco-inter-sync budget expiration warning", serializeError(error));
  }

  const configs = await loadConfigs();
  const now = new Date();
  const dueConfigs = configs.filter((config) => {
    if (config.auto_sync_enabled === false) return false;
    if (!config.next_sync_at) return true;
    return new Date(config.next_sync_at).getTime() <= now.getTime();
  });

  const results = [];
  for (const config of dueConfigs) {
    try {
      const result = await runSyncForConfig(config, {
        action: "syncDue",
        triggerSource: "cron",
        empresaIdOverride: sanitizeText(config.empresa_id),
      });
      results.push({ empresa_id: config.empresa_id, success: true, result });
    } catch (error) {
      results.push({
        empresa_id: config.empresa_id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    success: true,
    processed_configs: dueConfigs.length,
    budget_expiration: budgetExpiration,
    results,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const payload = await request.json().catch(() => ({}));
    if (Array.isArray(payload) && payload.every((item) => item && typeof item === "object" && "codigoSolicitacao" in item)) {
      const results = await Promise.all(payload.map(async (item) => {
        const event = item as Record<string, unknown>;
        const [budgetResult, walletChargeResult] = await Promise.all([
          processBudgetChargeWebhookEvent(event),
          processWalletChargeWebhookEvent(event),
        ]);
        return budgetResult || walletChargeResult;
      }));
      return jsonResponse({ ok: true, processed: results.filter(Boolean).length });
    }
    const action = sanitizeText(payload.action, "syncDue");

    if (action === "syncDue") {
      const data = await handleScheduledSync();
      return jsonResponse(data);
    }

    if (action === "getWalletChargePublic") {
      let row = await loadWalletChargeFromPublicToken(sanitizeText(payload.token));
      if (isWalletChargeActive(row)) {
        const walletConfig = await findConfig({ empresa_id: sanitizeText(row.empresa_id) });
        if (walletConfig) {
          try {
            row = await refreshWalletChargeFromInter(walletConfig, row);
          } catch (refreshError) {
            // The stored payment data remains usable when the provider is
            // temporarily unavailable or rate-limited.
            console.warn("wallet charge public refresh warning", serializeError(refreshError));
          }
        }
      }
      return jsonResponse({ ok: true, charge: buildWalletChargePublicResponse(row) });
    }

    if (action === "downloadWalletChargePdfPublic") {
      const row = await loadWalletChargeFromPublicToken(sanitizeText(payload.token));
      if (!isWalletChargeActive(row) || !sanitizeText(row.codigo_solicitacao)) {
        return jsonResponse({ error: "Esta cobranca nao esta mais disponivel para pagamento." }, 409);
      }

      const walletConfig = await findConfig({ empresa_id: sanitizeText(row.empresa_id) });
      if (!walletConfig) {
        return jsonResponse({ error: "Integracao Banco Inter nao encontrada para esta cobranca." }, 404);
      }

      const pdf = await fetchChargePdfForBudget(walletConfig, sanitizeText(row.codigo_solicitacao));
      await saveWalletChargeRow({
        ...row,
        pdf_disponivel: true,
        updated_date: new Date().toISOString(),
      });
      return jsonResponse({
        ok: true,
        file_name: `boleto-carteira-${sanitizeText(row.id) || "dog-city"}.pdf`,
        pdf,
      });
    }

    if (action === "listWalletOpenCharges") {
      const empresaId = sanitizeText(payload.empresa_id);
      const carteiraId = sanitizeText(payload.carteira_id);
      if (!empresaId || !carteiraId) {
        return jsonResponse({ error: "empresa_id e carteira_id sao obrigatorios para listar cobrancas." }, 400);
      }
      await requireWalletChargeStaff(request, empresaId);
      const charges = await listOpenWalletCharges(empresaId, carteiraId, sanitizeText(payload.sort_by));
      return jsonResponse({ ok: true, charges });
    }

    const walletChargeRestrictedActions = new Set([
      "issueWalletCharge",
      "refreshWalletChargeStatus",
      "renewWalletChargePublicLink",
    ]);
    let walletChargeStaff: { profile: Record<string, unknown>; empresaId: string } | null = null;
    if (walletChargeRestrictedActions.has(action)) {
      walletChargeStaff = await requireWalletChargeStaff(request, sanitizeText(payload.empresa_id));
    }

    const config = await findConfig(walletChargeStaff
      ? { ...payload, empresa_id: walletChargeStaff.empresaId }
      : payload);
    if (!config) {
      return jsonResponse({ error: "Integracao Banco Inter nao encontrada." }, 404);
    }

    if (action === "test") {
      const data = await runSyncForConfig(config, {
        action,
        requestedFrom: formatDateOnly(new Date()),
        requestedTo: formatDateOnly(new Date()),
        triggerSource: "manual_test",
        persist: false,
        empresaIdOverride: sanitizeText(payload.empresa_id),
        debug: Boolean(payload.debug),
      });
      return jsonResponse(data);
    }

    if (action === "diagnoseCapabilities") {
      const data = await diagnoseInterCapabilities(config);
      return jsonResponse(data);
    }

    if (action === "overview") {
      const data = await loadOverviewForConfig(config, {
        empresaIdOverride: sanitizeText(payload.empresa_id),
        limit: Number(payload.limit) || 500,
      });
      return jsonResponse(data);
    }

    if (action === "fullDataset") {
      const data = await loadAllMovementsForConfig(config, {
        empresaIdOverride: sanitizeText(payload.empresa_id),
        limit: Number(payload.limit) || 50000,
        pageSize: Number(payload.pageSize) || 1000,
      });
      return jsonResponse(data);
    }

    if (action === "liveBalance") {
      const data = await loadLiveBalanceForConfig(config, {
        empresaIdOverride: sanitizeText(payload.empresa_id),
      });
      return jsonResponse(data);
    }

    if (action === "refreshSummary") {
      const empresaId = sanitizeText(payload.empresa_id) || sanitizeText(config.empresa_id);
      if (!empresaId) {
        return jsonResponse({ error: "Informe a empresa para recalcular o resumo do extrato." }, 400);
      }

      const summary = await persistMovementSummary(config, empresaId);
      return jsonResponse({
        success: true,
        action: "refreshSummary",
        empresa_id: empresaId,
        integracao_id: config.id,
        summary,
      });
    }

      if (action === "transactionReceipt") {
        const data = await loadTransactionReceiptForConfig(config, {
          empresaIdOverride: sanitizeText(payload.empresa_id),
          movementId: sanitizeText(payload.movement_id),
        });
      return jsonResponse(data, 200);
    }

    if (action === "issueBudgetCharge") {
      const orcamentoId = sanitizeText(payload.orcamento_id);
      const metodo = sanitizeText(payload.metodo, "boleto_bancario");
      if (!orcamentoId) {
        return jsonResponse({ error: "orcamento_id é obrigatório para emitir a cobrança." }, 400);
      }
    if (metodo !== "boleto_bancario") {
      return jsonResponse({ error: "Nesta fase, somente boleto bancário com Pix do Banco Inter está habilitado." }, 400);
    }

      await enforceBudgetAvailability({
        orcamentoId,
        empresaId: sanitizeText(payload.empresa_id || config.empresa_id),
        requireApproved: true,
      });

      const existingRow = await loadLatestBudgetPaymentByBudget(orcamentoId, metodo);
      const requestedPayerFingerprint = buildBudgetChargePayerFingerprint(payload);
      const existingPayerFingerprint = existingRow?.metadata && typeof existingRow.metadata === "object"
        ? sanitizeText((existingRow.metadata as Record<string, unknown>).payer_fingerprint)
        : "";
      const canReuseExistingCharge = existingRow?.codigo_solicitacao
        && !["cancelado", "expirado"].includes(sanitizeText(existingRow.status).toLowerCase())
        && existingPayerFingerprint === requestedPayerFingerprint;

      if (canReuseExistingCharge) {
        return jsonResponse({
          ok: true,
          payment: existingRow,
          reused: true,
        });
      }

      try {
        await ensureChargeWebhookConfigured(config);
      } catch (webhookError) {
        console.warn("banco-inter-sync webhook configuration warning", serializeError(webhookError));
      }

      const payloadToIssue = !canReuseExistingCharge && existingRow?.codigo_solicitacao
        ? {
          ...payload,
          seu_numero: buildBudgetChargeSeuNumero(orcamentoId, Date.now().toString()),
        }
        : payload;

      const ensuredWalletAccountId = sanitizeText(payload.carteira_conta_id) || await ensureWalletAccountForBudget(
        sanitizeText(payload.empresa_id || config.empresa_id),
        sanitizeText(payload.carteira_id),
      );

      const charge = await createChargeForBudget(config, payloadToIssue);
      const now = new Date().toISOString();
      const row = await saveBudgetPaymentRow({
        id: !canReuseExistingCharge && existingRow?.codigo_solicitacao ? crypto.randomUUID() : (sanitizeText(existingRow?.id) || crypto.randomUUID()),
        empresa_id: sanitizeText(payload.empresa_id || config.empresa_id),
        orcamento_id: orcamentoId,
        carteira_id: sanitizeText(payload.carteira_id),
        carteira_conta_id: ensuredWalletAccountId,
        responsavel_id: sanitizeText(payload.responsavel_id) || null,
        provider: "banco_inter",
        metodo,
        status: mapInterChargeStatus(charge.situacao),
        valor: Number(charge.valorNominal || payload.valor || 0),
        seu_numero: charge.seuNumero || sanitizeText(payload.seu_numero) || null,
        codigo_solicitacao: charge.codigoSolicitacao || null,
        nosso_numero: charge.nossoNumero || null,
        txid: charge.txid || null,
        linha_digitavel: charge.linhaDigitavel || null,
        codigo_barras: charge.codigoBarras || null,
        pix_copia_cola: charge.pixCopiaECola || null,
        pdf_disponivel: Boolean(charge.codigoSolicitacao),
        valor_recebido: sanitizeText(charge.situacao).toUpperCase() === "RECEBIDO" ? Number(charge.valorTotalRecebido || charge.valorNominal || payload.valor || 0) : 0,
        pago_em: sanitizeText(charge.situacao).toUpperCase() === "RECEBIDO" ? (charge.dataHoraSituacao || now) : null,
        created_by_user_id: sanitizeText(payload.usuario_id) || null,
        metadata: {
          responsavel_nome: sanitizeText(payload.responsavel_nome),
          responsavel_cpf_cnpj: normalizeCpfCnpj(payload.responsavel_cpf_cnpj),
          responsavel_email: sanitizeText(payload.responsavel_email),
          responsavel_telefone: sanitizeText(payload.responsavel_telefone),
          responsavel_cep: normalizeChargeCep(payload.responsavel_cep),
          responsavel_endereco: sanitizeText(payload.responsavel_endereco),
          responsavel_numero: sanitizeText(payload.responsavel_numero),
          responsavel_bairro: sanitizeText(payload.responsavel_bairro),
          responsavel_cidade: sanitizeText(payload.responsavel_cidade),
          responsavel_uf: sanitizeText(payload.responsavel_uf).toUpperCase(),
          payer_fingerprint: requestedPayerFingerprint,
          vencimento: sanitizeText(payload.data_vencimento),
          charge_snapshot: charge,
          reissued_from_payment_id: !canReuseExistingCharge && existingRow?.codigo_solicitacao ? sanitizeText(existingRow.id) : null,
        },
        created_date: !canReuseExistingCharge && existingRow?.codigo_solicitacao ? now : (sanitizeText(existingRow?.created_date) || now),
        updated_date: now,
      });

      const finalizedRow = sanitizeText(charge.situacao).toUpperCase() === "RECEBIDO" ? await applyBudgetPaymentToWallet(row) : row;
      return jsonResponse({
        ok: true,
        payment: finalizedRow,
        cobranca: charge.cobranca,
        boleto: charge.boleto,
        pix: charge.pix,
        reused: false,
      });
    }

    if (action === "refreshBudgetChargeStatus") {
      const paymentId = sanitizeText(payload.orcamento_pagamento_id);
      if (!paymentId) {
        return jsonResponse({ error: "orcamento_pagamento_id é obrigatório para atualizar a cobrança." }, 400);
      }

      const existingRow = await loadBudgetPaymentRow(paymentId);
      if (!existingRow?.codigo_solicitacao) {
        return jsonResponse({ error: "Cobrança do orçamento não localizada." }, 404);
      }

      await enforceBudgetAvailability({
        orcamentoId: sanitizeText(existingRow.orcamento_id),
        empresaId: sanitizeText(existingRow.empresa_id || payload.empresa_id || config.empresa_id),
      });

      const charge = await fetchChargeForBudget(config, sanitizeText(existingRow.codigo_solicitacao));
      const now = new Date().toISOString();
      const mappedStatus = mapInterChargeStatus(charge.situacao);
      const isReceived = sanitizeText(charge.situacao).toUpperCase() === "RECEBIDO";
      const isChargeActive = mappedStatus === "emitido";
      const refreshedRow = await saveBudgetPaymentRow({
        ...existingRow,
        status: mappedStatus,
        valor: Number(charge.valorNominal || existingRow.valor || 0),
        seu_numero: charge.seuNumero || existingRow.seu_numero || null,
        nosso_numero: charge.nossoNumero || existingRow.nosso_numero || null,
        txid: charge.txid || existingRow.txid || null,
        linha_digitavel: isChargeActive ? (charge.linhaDigitavel || existingRow.linha_digitavel || null) : null,
        codigo_barras: isChargeActive ? (charge.codigoBarras || existingRow.codigo_barras || null) : null,
        pix_copia_cola: isChargeActive ? (charge.pixCopiaECola || existingRow.pix_copia_cola || null) : null,
        pdf_disponivel: isChargeActive ? Boolean(charge.codigoSolicitacao || existingRow.codigo_solicitacao) : false,
        valor_recebido: isReceived
          ? Number(charge.valorTotalRecebido || charge.valorNominal || existingRow.valor || 0)
          : Number(existingRow.valor_recebido || 0),
        pago_em: isReceived ? (charge.dataHoraSituacao || existingRow.pago_em || now) : existingRow.pago_em || null,
        metadata: {
          ...(existingRow.metadata && typeof existingRow.metadata === "object" ? existingRow.metadata : {}),
          charge_snapshot: charge,
        },
        updated_date: now,
      });

      const finalizedRow = isReceived ? await applyBudgetPaymentToWallet(refreshedRow) : refreshedRow;
      return jsonResponse({
        ok: true,
        payment: finalizedRow,
        cobranca: charge.cobranca,
        boleto: charge.boleto,
        pix: charge.pix,
      });
    }

    if (action === "downloadBudgetChargePdf") {
      const paymentId = sanitizeText(payload.orcamento_pagamento_id);
      if (!paymentId) {
        return jsonResponse({ error: "orcamento_pagamento_id é obrigatório para baixar o PDF." }, 400);
      }

      const existingRow = await loadBudgetPaymentRow(paymentId);
      if (!existingRow?.codigo_solicitacao) {
        return jsonResponse({ error: "Cobrança do orçamento não localizada." }, 404);
      }

      await enforceBudgetAvailability({
        orcamentoId: sanitizeText(existingRow.orcamento_id),
        empresaId: sanitizeText(existingRow.empresa_id || payload.empresa_id || config.empresa_id),
      });

      const pdf = await fetchChargePdfForBudget(config, sanitizeText(existingRow.codigo_solicitacao));
      await saveBudgetPaymentRow({
        ...existingRow,
        pdf_disponivel: true,
        updated_date: new Date().toISOString(),
      });

      return jsonResponse({
        ok: true,
        file_name: `boleto-orcamento-${sanitizeText(existingRow.orcamento_id) || existingRow.id}.pdf`,
        pdf,
      });
    }

    if (action === "issueWalletCharge") {
      const empresaId = walletChargeStaff?.empresaId || sanitizeText(payload.empresa_id);
      const carteiraId = sanitizeText(payload.carteira_id);
      const method = sanitizeText(payload.metodo, "boleto_bancario");
      const amount = toNumber(payload.valor);
      const dueDate = normalizeInterDate(payload.data_vencimento);
      const description = sanitizeText(payload.descricao);

      if (!carteiraId) {
        return jsonResponse({ error: "carteira_id e obrigatorio para emitir a cobranca." }, 400);
      }
      if (method !== "boleto_bancario") {
        return jsonResponse({ error: "Nesta fase, somente boleto bancario com Pix integrado esta habilitado." }, 400);
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return jsonResponse({ error: "Informe um valor maior que zero para a cobranca." }, 400);
      }
      if (!dueDate || dueDate < getBusinessDateKey()) {
        return jsonResponse({ error: "Informe um vencimento valido, a partir de hoje." }, 400);
      }
      if (description.length > 180) {
        return jsonResponse({ error: "A descricao da cobranca deve ter no maximo 180 caracteres." }, 400);
      }

      const { payer } = await loadWalletChargePayer(empresaId, carteiraId);
      const walletChargeId = crypto.randomUUID();
      const walletAccountId = await ensureWalletAccountForBudget(empresaId, carteiraId);
      if (!walletAccountId) {
        return jsonResponse({ error: "Nao foi possivel preparar a conta operacional desta carteira." }, 409);
      }
      const publicToken = buildWalletChargePublicToken();
      const publicUrl = resolveWalletChargePublicUrl(config, payload, publicToken);
      const publicTokenHash = await hashWalletChargePublicToken(publicToken);

      try {
        await ensureChargeWebhookConfigured(config);
      } catch (webhookError) {
        console.warn("wallet charge webhook configuration warning", serializeError(webhookError));
      }

      const charge = await createChargeForBudget(config, {
        ...payer,
        empresa_id: empresaId,
        carteira_id: carteiraId,
        carteira_conta_id: walletAccountId,
        valor: Number(amount.toFixed(2)),
        data_vencimento: dueDate,
        seu_numero: buildWalletChargeSeuNumero(walletChargeId),
        mensagem_linha_1: description || "Cobranca Dog City Brasil",
        mensagem_linha_2: "Dog City Brasil",
      });
      const now = new Date().toISOString();
      const chargeStatus = mapInterChargeStatus(charge.situacao);
      const isReceived = sanitizeText(charge.situacao).toUpperCase() === "RECEBIDO";
      const row = await saveWalletChargeRow({
        id: walletChargeId,
        empresa_id: empresaId,
        carteira_id: carteiraId,
        carteira_conta_id: walletAccountId,
        responsavel_id: sanitizeText(payload.responsavel_id) || null,
        provider: "banco_inter",
        metodo: method,
        status: chargeStatus,
        status_inter: sanitizeText(charge.situacao) || null,
        valor: Number(charge.valorNominal || amount),
        descricao: description,
        data_vencimento: dueDate,
        seu_numero: charge.seuNumero || buildWalletChargeSeuNumero(walletChargeId),
        codigo_solicitacao: charge.codigoSolicitacao || null,
        nosso_numero: charge.nossoNumero || null,
        txid: charge.txid || null,
        linha_digitavel: charge.linhaDigitavel || null,
        codigo_barras: charge.codigoBarras || null,
        pix_copia_cola: charge.pixCopiaECola || null,
        pdf_disponivel: Boolean(charge.codigoSolicitacao),
        emitido_em: now,
        pago_em: isReceived ? (charge.dataHoraSituacao || now) : null,
        valor_recebido: isReceived ? Number(charge.valorTotalRecebido || charge.valorNominal || amount) : 0,
        public_token_hash: publicTokenHash,
        public_token_expires_at: buildWalletChargeTokenExpiry(dueDate),
        created_by_user_id: sanitizeText(walletChargeStaff?.profile?.id) || null,
        metadata: {
          ...payer,
          charge_snapshot: charge,
          issued_from: "carteira_financeira",
        },
        created_date: now,
        updated_date: now,
      });

      const finalizedRow = isReceived ? await applyWalletChargePaymentToWallet(row) : row;
      return jsonResponse({
        ok: true,
        charge: buildWalletChargeStaffResponse(finalizedRow),
        public_url: publicUrl,
        boleto: charge.boleto,
        pix: charge.pix,
      });
    }

    if (action === "refreshWalletChargeStatus") {
      const chargeId = sanitizeText(payload.carteira_cobranca_id);
      if (!chargeId) {
        return jsonResponse({ error: "carteira_cobranca_id e obrigatorio para atualizar a cobranca." }, 400);
      }

      const existingRow = await loadWalletChargeRow(chargeId);
      if (!existingRow || sanitizeText(existingRow.empresa_id) !== walletChargeStaff?.empresaId) {
        return jsonResponse({ error: "Cobranca da carteira nao localizada." }, 404);
      }

      const refreshedRow = await refreshWalletChargeFromInter(config, existingRow);
      return jsonResponse({ ok: true, charge: buildWalletChargeStaffResponse(refreshedRow) });
    }

    if (action === "renewWalletChargePublicLink") {
      const chargeId = sanitizeText(payload.carteira_cobranca_id);
      if (!chargeId) {
        return jsonResponse({ error: "carteira_cobranca_id e obrigatorio para gerar um novo link." }, 400);
      }

      const existingRow = await loadWalletChargeRow(chargeId);
      if (!existingRow || sanitizeText(existingRow.empresa_id) !== walletChargeStaff?.empresaId) {
        return jsonResponse({ error: "Cobranca da carteira nao localizada." }, 404);
      }
      if (!isWalletChargeActive(existingRow)) {
        return jsonResponse({ error: "Somente cobrancas em aberto podem receber um novo link." }, 409);
      }

      // Validate the configured public origin before invalidating the current link.
      resolveWalletChargePublicUrl(config, payload, "preview");
      const { row, publicToken } = await rotateWalletChargePublicLink(existingRow);
      return jsonResponse({
        ok: true,
        charge: buildWalletChargeStaffResponse(row),
        public_url: resolveWalletChargePublicUrl(config, payload, publicToken),
      });
    }

    if (action === "buscarExtrato" || action === "syncNow") {
      const data = await runSyncForConfig(config, {
        action,
        requestedFrom: sanitizeText(payload.dataInicio),
        requestedTo: sanitizeText(payload.dataFim),
        triggerSource: "manual_import",
        persist: true,
        empresaIdOverride: sanitizeText(payload.empresa_id),
        debug: Boolean(payload.debug),
      });
      return jsonResponse(data);
    }

    if (action === "importCsvManual") {
      const csvText = typeof payload.csv_text === "string" ? payload.csv_text : "";
      if (!csvText.trim()) {
        return jsonResponse({ error: "Forneca o conteudo do CSV em `csv_text`." }, 400);
      }

      const data = await importCsvForConfig(config, {
        csvText,
        filename: sanitizeText(payload.filename) || null,
        triggerSource: "manual_csv",
        empresaIdOverride: sanitizeText(payload.empresa_id),
        replaceExistingCsv: Boolean(payload.replace_existing_csv),
      });
      return jsonResponse(data);
    }

    return jsonResponse({ error: `Acao nao suportada: ${action}` }, 400);
  } catch (error) {
    const message = serializeError(error);
    const status = error instanceof BancoInterAuthError
      || error instanceof BudgetUnavailableError
      || error instanceof WalletChargeAuthorizationError
      ? error.status
      : 500;
    const retryHeaders: Record<string, string> = error instanceof BancoInterAuthError && error.retryAfterSeconds
      ? { "Retry-After": String(error.retryAfterSeconds) }
      : {};
    return jsonResponse({ error: "Falha na integracao com Banco Inter.", details: message }, status, retryHeaders);
  }
});


