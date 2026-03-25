import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-active-unit-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_TOKEN_URL = "https://cdpj.partners.bancointer.com.br/oauth/v2/token";
const DEFAULT_API_BASE_URL = "https://cdpj.partners.bancointer.com.br";
const DEFAULT_EXTRATO_PATH = "/banking/v2/extrato";
const DEFAULT_BALANCE_PATHS = ["/banking/v2/saldo", "/banking/v1/saldo"];
const DEFAULT_SCOPE = "extrato.read saldo.read";

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
  external_id: string;
  conta_origem: string | null;
  conta_destino: string | null;
  lancamento_id: string;
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
  external_id: string;
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

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios na function.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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

function hasTimeFragment(value: unknown) {
  return typeof value === "string" && /\d{2}:\d{2}/.test(value);
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
) {
  const value = sanitizeText(firstDefined(
    rawTransaction.nomeRemetente,
    rawTransaction.nomePagador,
    rawTransaction.nomeFavorecido,
    rawTransaction.nomeRecebedor,
    rawTransaction.contraparte,
    rawTransaction.beneficiario,
    rawTransaction.pagador,
    rawTransaction.creditorName,
    rawTransaction.debtorName,
    rawTransaction.cliente,
  ));
  return value || description || null;
}

function inferCounterpartyBank(rawTransaction: Record<string, unknown>) {
  return sanitizeText(firstDefined(
    rawTransaction.banco,
    rawTransaction.bancoDestino,
    rawTransaction.bancoOrigem,
    rawTransaction.nomeBanco,
    rawTransaction.instituicao,
    rawTransaction.bankName,
    rawTransaction.bank,
  )) || null;
}

function inferReference(rawTransaction: Record<string, unknown>, externalId: string) {
  return sanitizeText(firstDefined(
    rawTransaction.referencia,
    rawTransaction.documento,
    rawTransaction.identificador,
    rawTransaction.codigoTransacao,
    rawTransaction.transactionId,
    rawTransaction.nsu,
    rawTransaction.nsudoc,
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

async function getAccessToken(config: IntegrationConfig) {
  const clientId = sanitizeText(getConfigValue(config, "client_id"));
  const clientSecret = sanitizeText(getConfigValue(config, "client_secret"));

  if (!clientId || !clientSecret) {
    throw new Error("client_id e client_secret sao obrigatorios para o Banco Inter.");
  }

  const scope = sanitizeText(getConfigValue(config, "scope"), DEFAULT_SCOPE);
  const tokenUrl = sanitizeText(config.token_url || getConfigValue(config, "token_url"), DEFAULT_TOKEN_URL);
  const configuredTokenAuthMode = sanitizeText(getConfigValue(config, "token_auth_mode"), "auto").toLowerCase();
  const httpClient = await createHttpClient(config);
  const modes = configuredTokenAuthMode === "auto"
    ? ["basic", "body"]
    : [configuredTokenAuthMode];
  const errors: string[] = [];

  for (const tokenAuthMode of modes) {
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
      errors.push(`${tokenAuthMode}:${response.status}:${JSON.stringify(parsed)}`);
      continue;
    }

    const accessToken = sanitizeText(firstDefined(parsed.access_token, parsed.token));
    if (!accessToken) {
      errors.push(`${tokenAuthMode}:${response.status}:sem access_token`);
      continue;
    }

    return { accessToken, httpClient, tokenResponse: parsed, tokenStatus: response.status };
  }

  throw new Error(`Falha ao autenticar no Banco Inter: ${errors.join(" | ")}`);
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
  const url = new URL(extratoPath, apiBaseUrl);
  url.searchParams.set("dataInicio", fromDate);
  url.searchParams.set("dataFim", toDate);

  const extraHeaders = (config.extra_headers || getConfigValue<Record<string, unknown>>(config, "extra_headers") || {}) as Record<string, unknown>;
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
    throw new Error(`Falha ao consultar extrato no Banco Inter (${response.status}): ${JSON.stringify(parsed)}`);
  }

  return { payload: parsed, httpStatus: response.status };
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
    "disponivel",
    "saldoDisponivel",
    "availableBalance",
    "saldo",
    "balance",
    "valor",
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

async function normalizeTransactions(
  empresaId: string,
  syncRunId: string,
  rawPayload: unknown,
) {
  if (!empresaId) {
    throw new Error("A integracao Banco Inter precisa estar vinculada a uma empresa.");
  }

  const transactions = getTransactionArray(rawPayload);
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
    const rawDate = sanitizeText(firstDefined(
      transaction.dataHora,
      transaction.dataTransacao,
      transaction.transactionDateTime,
      transaction.dataMovimento,
      transaction.dataLancamento,
      transaction.dataEntrada,
      transaction.data,
      transaction.bookingDate,
      transaction.createdAt,
    ), new Date().toISOString());
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
    const counterpartyName = inferCounterpartyName(transaction, rawDescription);
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
      transaction.codigoTransacao,
      transaction.transactionId,
      transaction.identificador,
      transaction.nsudoc,
      transaction.documento,
      transaction.nsu,
    ));
    const stableFingerprintPayload = buildStableTransactionFingerprintPayload(transaction);
    const fallbackKey = await sha256Hex(`${empresaId}|${stableSerialize(stableFingerprintPayload)}`);
    const externalId = sourceId || fallbackKey;
    const counterpartyBank = inferCounterpartyBank(transaction);
    const reference = inferReference(transaction, externalId);
    const notes = sanitizeText(firstDefined(
      transaction.observacoes,
      transaction.complemento,
      transaction.descricaoDetalhada,
      transaction.memo,
    )) || null;

    normalizedRows.push({
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
        external_id_source: sourceId ? "api" : "raw_payload_hash",
        synthetic_occurrence: null,
        raw_description: rawDescription,
        counterparty_code: parsedDescription.counterpartyCode,
        direction_label: normalizedType === "saida" ? "Debitado" : "Creditado",
      },
      conciliado: false,
      status: "importado",
      source_provider: "banco_inter",
      external_id: externalId,
      conta_origem: sanitizeText(firstDefined(transaction.contaOrigem, transaction.accountOrigin), "") || null,
      conta_destino: sanitizeText(firstDefined(transaction.contaDestino, transaction.accountDestination), "") || null,
      lancamento_id: externalId,
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
      dataHora: firstDefined(transaction.dataHora, null),
      dataTransacao: firstDefined(transaction.dataTransacao, null),
      transactionDateTime: firstDefined(transaction.transactionDateTime, null),
      dataMovimento: firstDefined(transaction.dataMovimento, null),
      dataLancamento: firstDefined(transaction.dataLancamento, null),
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
        external_id: normalizedRows[index].external_id,
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
  };
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
  const uniqueRowsByExternalId = new Map<string, NormalizedTransaction>();
  let discardedInPayloadCount = 0;

  for (const row of rows) {
    if (!row.external_id) continue;
    if (uniqueRowsByExternalId.has(row.external_id)) {
      discardedInPayloadCount += 1;
      continue;
    }
    uniqueRowsByExternalId.set(row.external_id, row);
  }

  const uniqueRows = Array.from(uniqueRowsByExternalId.values());
  const todayRows = refreshToday
    ? uniqueRows.filter((row) => row.data_movimento === today)
    : [];
  const historicalRows = uniqueRows.filter((row) => !refreshToday || row.data_movimento !== today);

  const historicalExistingIds = new Set<string>();
  if (historicalRows.length) {
    for (const externalIdChunk of chunkArray(historicalRows.map((row) => row.external_id), 100)) {
      const { data, error } = await supabase
        .from("extratobancario")
        .select("external_id")
        .eq("empresa_id", empresaId)
        .eq("source_provider", "banco_inter")
        .in("external_id", externalIdChunk);

      if (error) throw error;

      for (const item of data || []) {
        if (item?.external_id) historicalExistingIds.add(item.external_id);
      }
    }
  }

  const historicalRowsToInsert = historicalRows.filter((row) => !historicalExistingIds.has(row.external_id));

  let refreshedTodayCount = 0;
  if (refreshToday) {
    const { data: existingTodayRows, error: existingTodayError } = await supabase
      .from("extratobancario")
      .select("external_id, carteira_nome, observacoes, rateio, metadata_financeira, conciliado, status")
      .eq("empresa_id", empresaId)
      .eq("source_provider", "banco_inter")
      .eq("data_movimento", today);

    if (existingTodayError) throw existingTodayError;

    const existingTodayMap = new Map<string, Record<string, unknown>>();
    for (const row of existingTodayRows || []) {
      if (row?.external_id) existingTodayMap.set(row.external_id, row);
    }

    const mergedTodayRows = todayRows.map((row) => mergeManualComplements(row, existingTodayMap.get(row.external_id) || null));

    const { error: deleteTodayError } = await supabase
      .from("extratobancario")
      .delete()
      .eq("empresa_id", empresaId)
      .eq("source_provider", "banco_inter")
      .eq("data_movimento", today);

    if (deleteTodayError) throw deleteTodayError;

    for (const chunk of chunkArray(mergedTodayRows, 100)) {
      if (!chunk.length) continue;
      const { error } = await supabase
        .from("extratobancario")
        .insert(chunk);

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
    .replace(/\r/g, "");
}

function parseCsvDateToIso(value: string) {
  const match = normalizeCsvCell(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function splitSemicolonLine(line: string) {
  return String(line || "").split(";").map((item) => normalizeCsvCell(item));
}

type ParsedCsvImport = {
  accountNumber: string | null;
  periodLabel: string | null;
  closingBalance: number | null;
  rows: Array<{
    date: string;
    history: string;
    description: string;
    amount: number;
    balance: number | null;
  }>;
};

function parseBancoInterCsv(csvText: string): ParsedCsvImport {
  const lines = String(csvText || "")
    .split(/\n/)
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim().length > 0);

  if (!lines.length) {
    throw new Error("Arquivo CSV vazio.");
  }

  let accountNumber: string | null = null;
  let periodLabel: string | null = null;
  let closingBalance: number | null = null;
  let headerIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const columns = splitSemicolonLine(line);
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

  const rows = lines
    .slice(headerIndex + 1)
    .map((line) => splitSemicolonLine(line))
    .filter((columns) => columns.length >= 5 && columns[0] && columns[3])
    .map((columns) => {
      const date = parseCsvDateToIso(columns[0]);
      if (!date) return null;

      return {
        date,
        history: columns[1] || "Lancamento manual CSV",
        description: columns[2] || columns[1] || "Sem descricao",
        amount: parseBrazilianCsvNumber(columns[3]),
        balance: columns[4] ? parseBrazilianCsvNumber(columns[4]) : null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    accountNumber,
    periodLabel,
    closingBalance,
    rows,
  };
}

async function normalizeCsvTransactions(
  empresaId: string,
  syncRunId: string,
  csvText: string,
  filename: string | null,
) {
  const parsed = parseBancoInterCsv(csvText);
  const normalizedRows: NormalizedTransaction[] = [];

  for (const row of parsed.rows) {
    const normalizedType: "entrada" | "saida" = row.amount < 0 ? "saida" : "entrada";
    const absoluteAmount = Math.abs(row.amount);
    const externalId = await sha256Hex([
      "banco_inter_csv",
      empresaId,
      row.date,
      row.history,
      row.description,
      absoluteAmount.toFixed(2),
      row.balance === null ? "" : row.balance.toFixed(2),
    ].join("|"));

    normalizedRows.push({
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
      referencia: externalId,
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
      external_id: externalId,
      conta_origem: parsed.accountNumber,
      conta_destino: null,
      lancamento_id: externalId,
      saldo: row.balance,
      raw_data: {
        source: "csv_manual",
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
    } satisfies NormalizedTransaction);
  }

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
  const uniqueRowsByExternalId = new Map<string, NormalizedTransaction>();
  let discardedInPayloadCount = 0;

  for (const row of rows) {
    if (!row.external_id) continue;
    if (uniqueRowsByExternalId.has(row.external_id)) {
      discardedInPayloadCount += 1;
      continue;
    }
    uniqueRowsByExternalId.set(row.external_id, row);
  }

  const uniqueRows = Array.from(uniqueRowsByExternalId.values());
  let replacedExistingCount = 0;

  if (replaceExistingCsv) {
    const { count, error: deleteExistingError } = await supabase
      .from("extratobancario")
      .delete({ count: "exact" })
      .eq("empresa_id", empresaId)
      .eq("source_provider", "banco_inter_csv");

    if (deleteExistingError) throw deleteExistingError;
    replacedExistingCount = count || 0;
  }

  const existingIds = new Set<string>();

  if (!replaceExistingCsv) {
    for (const externalIdChunk of chunkArray(uniqueRows.map((row) => row.external_id), 100)) {
      const { data, error } = await supabase
        .from("extratobancario")
        .select("external_id")
        .eq("empresa_id", empresaId)
        .eq("source_provider", "banco_inter_csv")
        .in("external_id", externalIdChunk);

      if (error) throw error;
      for (const item of data || []) {
        if (item?.external_id) existingIds.add(item.external_id);
      }
    }
  }

  const rowsToInsert = uniqueRows.filter((row) => !existingIds.has(row.external_id));

  for (const chunk of chunkArray(rowsToInsert, 100)) {
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
    return configs.find((item) => sanitizeText(item.empresa_id) === empresaId) || null;
  }

  return configs[0] || null;
}

async function handleScheduledSync() {
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
    const action = sanitizeText(payload.action, "syncDue");

    if (action === "syncDue") {
      const data = await handleScheduledSync();
      return jsonResponse(data);
    }

    const config = await findConfig(payload);
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
    return jsonResponse({ error: "Falha na integracao com Banco Inter.", details: message }, 500);
  }
});
