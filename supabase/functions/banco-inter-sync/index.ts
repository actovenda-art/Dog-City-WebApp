import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_TOKEN_URL = "https://cdpj.partners.bancointer.com.br/oauth/v2/token";
const DEFAULT_API_BASE_URL = "https://cdpj.partners.bancointer.com.br";
const DEFAULT_EXTRATO_PATH = "/banking/v2/extrato";
const DEFAULT_SCOPE = "extrato.read";

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
  config?: Record<string, unknown> | null;
  credenciais?: Record<string, unknown> | null;
  extra_headers?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  certificate_crt?: string | null;
  certificate_key?: string | null;
};

type NormalizedTransaction = {
  empresa_id: string;
  descricao: string;
  tipo: "entrada" | "saida";
  valor: number;
  data: string;
  data_hora_transacao: string;
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
  imported_data_hora: string;
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

async function normalizeTransactions(
  empresaId: string,
  syncRunId: string,
  rawPayload: unknown,
) {
  if (!empresaId) {
    throw new Error("A integracao Banco Inter precisa estar vinculada a uma empresa.");
  }

  const transactions = getTransactionArray(rawPayload);

  return await Promise.all(transactions.map(async (transaction) => {
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
    const movementDateTime = formatDateTime(rawDate);
    const description = sanitizeText(firstDefined(
      transaction.descricao,
      transaction.historico,
      transaction.titulo,
      transaction.title,
      transaction.complemento,
      transaction.nomePagador,
      transaction.nomeFavorecido,
    ), "Movimentacao Banco Inter");
    const sourceId = sanitizeText(firstDefined(
      transaction.id,
      transaction.codigoTransacao,
      transaction.transactionId,
      transaction.identificador,
      transaction.nsudoc,
      transaction.documento,
      transaction.nsu,
    ));

    const fallbackKey = await sha256Hex(`${empresaId}|${movementDate}|${positiveAmount}|${description}|${normalizedType}`);
    const externalId = sourceId || fallbackKey;
    const counterpartyName = inferCounterpartyName(transaction, description);
    const counterpartyBank = inferCounterpartyBank(transaction);
    const transactionDetailType = sanitizeText(firstDefined(
      transaction.tipoDetalhado,
      transaction.tipo,
      transaction.natureza,
      transaction.tipoOperacao,
      transaction.transactionType,
      transaction.operationType,
    )) || null;
    const reference = inferReference(transaction, externalId);
    const notes = sanitizeText(firstDefined(
      transaction.observacoes,
      transaction.complemento,
      transaction.descricaoDetalhada,
      transaction.memo,
    )) || null;

    return {
      empresa_id: empresaId,
      descricao: description,
      tipo: normalizedType,
      valor: positiveAmount,
      data: movementDate,
      data_hora_transacao: movementDateTime,
      data_movimento: movementDate,
      banco: "Banco Inter",
      nome_contraparte: counterpartyName,
      banco_contraparte: counterpartyBank,
      forma_pagamento: sanitizeText(firstDefined(transaction.formaPagamento, transaction.tipoPagamento), "") || null,
      categoria: sanitizeText(firstDefined(transaction.categoria, transaction.tipoLancamento), "") || null,
      tipo_transacao_detalhado: transactionDetailType,
      referencia: reference,
      carteira_nome: sanitizeText(firstDefined(transaction.carteiraNome, transaction.walletName), "") || null,
      observacoes: notes,
      rateio: {},
      metadata_financeira: {
        provider: "banco_inter",
        imported_via: "edge_function",
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
    } satisfies NormalizedTransaction;
  }));
}

async function startSyncLog(config: IntegrationConfig, triggerSource: string, requestedFrom: string, requestedTo: string) {
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
  requestedFrom: string,
  requestedTo: string,
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
  const { error } = await supabase
    .from("integracao_config")
    .update(payload)
    .eq("id", configId);

  if (error) throw error;
}

function buildDuplicateReviewRow(
  row: NormalizedTransaction,
  {
    reason,
    duplicateCount = 1,
    existingRow = null,
  }: {
    reason: string;
    duplicateCount?: number;
    existingRow?: Record<string, unknown> | null;
  },
): DuplicateReviewRow {
  return {
    empresa_id: row.empresa_id,
    sync_run_id: row.sync_run_id,
    source_provider: row.source_provider,
    duplicate_reason: reason,
    status: "pendente",
    external_id: row.external_id,
    duplicate_count: duplicateCount,
    imported_tipo: row.tipo,
    imported_valor: row.valor,
    imported_descricao: row.descricao,
    imported_data_movimento: row.data_movimento,
    imported_data_hora: row.data_hora_transacao,
    imported_payload: row.raw_data,
    existing_record_id: sanitizeText(existingRow?.id) || null,
    existing_snapshot: existingRow || {},
  };
}

async function persistDuplicateReviews(rows: DuplicateReviewRow[]) {
  if (!rows.length) return;

  for (const chunk of chunkArray(rows, 100)) {
    const { error } = await supabase
      .from("extrato_duplicidade")
      .upsert(chunk, {
        onConflict: "empresa_id,sync_run_id,external_id,duplicate_reason",
      });

    if (error) {
      console.warn("persistDuplicateReviews warning", error);
      return;
    }
  }
}

async function persistTransactions(empresaId: string, rows: NormalizedTransaction[]) {
  if (!rows.length) return { importedCount: 0, deduplicatedCount: 0 };

  const uniqueRowsByExternalId = new Map<string, NormalizedTransaction>();
  const duplicateRowsInPayload = new Map<string, number>();
  for (const row of rows) {
    if (!uniqueRowsByExternalId.has(row.external_id)) {
      uniqueRowsByExternalId.set(row.external_id, row);
    } else {
      duplicateRowsInPayload.set(row.external_id, (duplicateRowsInPayload.get(row.external_id) || 0) + 1);
    }
  }

  const uniqueRows = Array.from(uniqueRowsByExternalId.values());
  const existingRowsByExternalId = new Map<string, Record<string, unknown>>();

  for (const externalIdChunk of chunkArray(uniqueRows.map((row) => row.external_id), 100)) {
    const { data, error } = await supabase
      .from("extratobancario")
      .select("id, external_id, tipo, valor, descricao, data_movimento, data_hora_transacao, nome_contraparte, banco_contraparte, referencia")
      .eq("empresa_id", empresaId)
      .eq("source_provider", "banco_inter")
      .in("external_id", externalIdChunk);

    if (error) throw error;

    for (const item of data || []) {
      if (item?.external_id) {
        existingRowsByExternalId.set(item.external_id, item);
      }
    }
  }

  const countQuery = () => supabase
    .from("extratobancario")
    .select("*", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("source_provider", "banco_inter");

  const { count: beforeCount, error: beforeCountError } = await countQuery();
  if (beforeCountError) throw beforeCountError;

  const duplicateReviews: DuplicateReviewRow[] = [];

  duplicateRowsInPayload.forEach((count, externalId) => {
    const row = uniqueRowsByExternalId.get(externalId);
    if (!row) return;
    duplicateReviews.push(buildDuplicateReviewRow(row, {
      reason: "duplicada_no_payload",
      duplicateCount: count,
      existingRow: existingRowsByExternalId.get(externalId) || null,
    }));
  });

  uniqueRows.forEach((row) => {
    const existingRow = existingRowsByExternalId.get(row.external_id);
    if (!existingRow) return;
    duplicateReviews.push(buildDuplicateReviewRow(row, {
      reason: "ja_existia_no_extrato",
      duplicateCount: 1,
      existingRow,
    }));
  });

  await persistDuplicateReviews(duplicateReviews);

  for (const rowChunk of chunkArray(uniqueRows, 100)) {
    const { error } = await supabase
      .from("extratobancario")
      .upsert(rowChunk, {
        onConflict: "empresa_id,source_provider,external_id",
        ignoreDuplicates: true,
      });

    if (error) throw error;
  }

  const { count: afterCount, error: afterCountError } = await countQuery();
  if (afterCountError) throw afterCountError;

  const importedCount = Math.max(0, (afterCount || 0) - (beforeCount || 0));
  const payloadDuplicateCount = Array.from(duplicateRowsInPayload.values()).reduce((sum, current) => sum + current, 0);
  const existingDuplicateCount = uniqueRows.filter((row) => existingRowsByExternalId.has(row.external_id)).length;
  const deduplicatedCount = Math.max(0, payloadDuplicateCount + existingDuplicateCount);

  return {
    importedCount,
    deduplicatedCount,
  };
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
  }: {
    action: string;
    requestedFrom?: string;
    requestedTo?: string;
    triggerSource: string;
    persist?: boolean;
    empresaIdOverride?: string;
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
    let rawCount = 0;
    let normalizedRows: NormalizedTransaction[] = [];
    let httpStatus = tokenStatus;
    let processedWindowCount = 0;

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
        }
      } catch (error) {
        const baseMessage = serializeError(error);
        throw new Error(`Falha ao importar a janela ${window.from} ate ${window.to}: ${baseMessage}`);
      }
    }

    const persistence = persist
      ? await persistTransactions(empresaId, normalizedRows)
      : { importedCount: rawCount, deduplicatedCount: 0 };

    const finishedAt = new Date().toISOString();
    await finishSyncLog(log.id, {
      status: "success",
      imported_count: persistence.importedCount,
      deduplicated_count: persistence.deduplicatedCount,
      http_status: httpStatus,
      response_summary: {
        token_status: tokenStatus,
        token_type: tokenResponse?.token_type || null,
        range: { from: fromDate, to: toDate },
        windows: dateWindows,
        requested_window_count: dateWindows.length,
        processed_window_count: processedWindowCount,
        received_count: rawCount,
      },
    });

    await updateIntegrationStatus(config.id, {
      sync_status: "success",
      last_sync_finished_at: finishedAt,
      last_success_at: finishedAt,
      last_http_status: httpStatus,
      last_error_at: null,
      last_error_message: null,
      next_sync_at: addMinutes(now, intervalMinutes).toISOString(),
    });

    return {
      success: true,
      action,
      from: fromDate,
      to: toDate,
      imported_count: persistence.importedCount,
      deduplicated_count: persistence.deduplicatedCount,
      total: rawCount,
      inseridas: persistence.importedCount,
      duplicadas: persistence.deduplicatedCount,
      received_count: rawCount,
      windows_processed: processedWindowCount,
      message: action === "test"
        ? "Conexao com Banco Inter validada com sucesso."
        : processedWindowCount > 1
          ? `Extrato importado em ${processedWindowCount} janela(s). ${persistence.importedCount} registro(s) novo(s).`
          : `Extrato importado com sucesso. ${persistence.importedCount} registro(s) novo(s).`,
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
      });
      return jsonResponse(data);
    }

    return jsonResponse({ error: `Acao nao suportada: ${action}` }, 400);
  } catch (error) {
    const message = serializeError(error);
    return jsonResponse({ error: "Falha na integracao com Banco Inter.", details: message }, 500);
  }
});
