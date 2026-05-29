// This file provides a dual-mode client:
// - If VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are defined, use Supabase as backend.
// - Otherwise fall back to a lightweight local mock (localStorage) so the app remains functional.

import { createClient } from '@supabase/supabase-js';
import {
  clearStoredActiveUnitId,
  getStoredActiveUnitId,
  getStoredSelectedUnitIds,
  isStoredUnitUnionMode,
  resolveDogCityUnit,
  setStoredUnitSelection,
} from '@/lib/unit-context';
import {
  getOrCreateDeviceId,
  isDeviceTrustedForUser,
  markDeviceTrustedForUser,
} from '@/lib/device-trust';
import {
  buildInternalEntityCode,
  getInternalEntityCode,
  hasInternalEntityCodeConfig,
  normalizeEntityUnitCode,
} from '@/lib/entity-identifiers';
import { simulateBudgetConsumptionPreview } from '@/lib/finance-budget';
import {
  buildFinanceV2Summary,
  buildGenerationResourcesReport,
  buildRealBillingReport,
  buildServicesProvidedReport,
  buildSnapshotPayload,
  buildWalletReport,
  compareSnapshotPayloads,
  createMockChecksum,
} from '@/lib/finance-reports';
import {
  buildCommissionSourceKey,
  calculateCommissionValue,
  isCommissionEligible,
  normalizeCommissionPercent,
  roundCommissionCurrency,
} from '@/lib/finance-commission';
import {
  buildCockpitCompareRows,
  sortFinancialAlerts,
} from '@/lib/finance-cockpit';

const STORAGE_PREFIX = 'local_app_client_';
const makeId = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const APP_SITE_URL = import.meta.env.VITE_SITE_URL;
const SUPABASE_PUBLIC_BUCKET = import.meta.env.VITE_SUPABASE_PUBLIC_BUCKET || 'public-assets';
const SUPABASE_PRIVATE_BUCKET = import.meta.env.VITE_SUPABASE_PRIVATE_BUCKET || 'private-files';
const DEFAULT_EMAIL_WEBHOOK_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/send-email` : '';
const UNIT_SCOPED_ENTITIES = new Set([
  'Dog',
  'Checkin',
  'Schedule',
  'Appointment',
  'ServiceProvider',
  'ServiceProviderSchedule',
  'Lancamento',
  'ExtratoBancario',
  'Despesa',
  'Responsavel',
  'Carteira',
  'Notificacao',
  'Orcamento',
  'TabelaPrecos',
  'ServiceProvided',
  'Transaction',
  'ScheduledTransaction',
  'Replacement',
  'PlanConfig',
  'RecurringPackage',
  'PackageSession',
  'PackageCredit',
  'PackageBilling',
  'CarteiraConta',
  'CarteiraMovimento',
  'CarteiraReconciliacao',
  'AutorizacaoFinanceira',
  'CancelamentoFinanceiro',
  'ObrigacaoFinanceira',
  'CobrancaFinanceira',
  'CobrancaItem',
  'ComissaoEvento',
  'FinanceSnapshot',
  'FinanceSnapshotDelta',
  'AuditLog',
  'IntegracaoConfig',
  'Receita',
  'ContaReceber',
  'Client',
  'PedidoInterno',
  'CentroCusto',
]);

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_PREFIX + key) || '[]');
  } catch {
    return [];
  }
}

function writeStorage(key, value) {
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
}

function isLikelyNetworkError(error) {
  const message = [
    error?.message,
    error?.details,
    error?.hint,
  ].filter(Boolean).join(' | ').toLowerCase();

  return (
    error?.name === 'TypeError'
    || /failed to fetch|fetch failed|networkerror|load failed|network request failed/i.test(message)
  );
}

function toAppError(error, fallback = 'Erro no Supabase.') {
  if (!error) return new Error(fallback);

  if (isLikelyNetworkError(error)) {
    const wrapped = new Error(
      'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente. Se sua conexão estiver normal, o sistema pode estar temporariamente indisponível.'
    );
    wrapped.code = error?.code || 'NETWORK_ERROR';
    wrapped.cause = error;
    return wrapped;
  }

  if (error instanceof Error) return error;

  const rawMessage = [
    error.message,
    error.details,
    error.hint,
  ].filter(Boolean).join(' | ') || fallback;

  const isMissingColumnFor = (table) => (
    error.code === 'PGRST204'
    && rawMessage.includes("column")
    && rawMessage.includes(`'${table}'`)
  );

  const missingLancamentoColumn = isMissingColumnFor('lancamento');
  const missingDogColumn = isMissingColumnFor('dogs');
  const missingResponsavelColumn = isMissingColumnFor('responsavel');
  const missingCarteiraColumn = isMissingColumnFor('carteira');
  const missingOrcamentoColumn = isMissingColumnFor('orcamento');
  const missingCheckinColumn = isMissingColumnFor('checkins');
  const missingServiceProviderColumn = isMissingColumnFor('serviceproviders');
  const missingExtratoColumn = isMissingColumnFor('extratobancario');
  const missingDespesaColumn = isMissingColumnFor('despesa');
  const missingReceitaColumn = isMissingColumnFor('receita');
  const missingUsersPinColumn = isMissingColumnFor('users')
    && /pin_required_reset|pin_bootstrap_status|pin_updated_at|pin_last_verified_at/i.test(rawMessage);
  const missingCentroCustoTable = rawMessage.includes('centro_custo') && (
    error.code === 'PGRST205' || rawMessage.toLowerCase().includes('schema cache')
  );
  const lancamentoRlsBlocked = error.code === '42501'
    && rawMessage.toLowerCase().includes('lancamento');

  const message = missingLancamentoColumn
    ? `${rawMessage}. Execute os arquivos supabase-schema-lancamento-contas-pagar.sql e supabase-schema-controle-gerencial.sql no Supabase.`
    : missingDogColumn
      ? `${rawMessage}. Execute o arquivo supabase-schema-dogs-extended-profile.sql no Supabase.`
    : missingResponsavelColumn || missingCarteiraColumn || missingOrcamentoColumn
      ? `${rawMessage}. Execute o arquivo supabase-schema-cadastros-orcamento.sql no Supabase.`
    : missingCheckinColumn
      ? `${rawMessage}. Execute o arquivo supabase-schema-registrador-alertas.sql no Supabase.`
    : missingServiceProviderColumn
      ? `${rawMessage}. Execute o arquivo supabase-schema-escalacao.sql no Supabase.`
    : missingExtratoColumn || missingDespesaColumn || missingReceitaColumn
      ? `${rawMessage}. Execute o arquivo supabase-schema-finance-transaction-link.sql no Supabase.`
    : missingUsersPinColumn
      ? `${rawMessage}. Execute o arquivo supabase-schema-auth-pin.sql no Supabase.`
    : missingCentroCustoTable
      ? `${rawMessage}. Execute o arquivo supabase-schema-controle-gerencial.sql no Supabase.`
    : lancamentoRlsBlocked
      ? `${rawMessage}. Execute o arquivo supabase-policies-finance-unlock.sql no Supabase.`
      : rawMessage;

  const wrapped = new Error(message);
  if (error.code) wrapped.code = error.code;
  wrapped.cause = error;
  return wrapped;
}

function getAppOrigin() {
  if (APP_SITE_URL) return APP_SITE_URL.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return SUPABASE_URL;
}

function getSelectedScopedUnitIds() {
  const selectedUnitIds = getStoredSelectedUnitIds();
  if (selectedUnitIds.length > 0) return selectedUnitIds;
  const activeUnitId = getStoredActiveUnitId();
  return activeUnitId ? [activeUnitId] : [];
}

function ensureSingleUnitWrite(table) {
  if (!isStoredUnitUnionMode()) return;
  throw new Error(`Seleção unificada ativa. Acesse apenas uma unidade para alterar ${table}.`);
}

function withActiveUnitHeader(fetchImpl) {
  return async (input, init = {}) => {
    const headers = new Headers(init?.headers || {});
    const activeUnitId = getStoredActiveUnitId();
    if (activeUnitId) {
      headers.set('x-active-unit-id', activeUnitId);
    }
    return fetchImpl(input, { ...init, headers });
  };
}

function getMockScopedUnitId() {
  return getStoredActiveUnitId() || 'empresa_demo';
}

function getMockScopedUnitIds() {
  const selectedUnitIds = getSelectedScopedUnitIds();
  return selectedUnitIds.length > 0 ? selectedUnitIds : ['empresa_demo'];
}

function createMockEntity(name, options = {}) {
  const { unitScoped = false } = options;
  const resolveMockUnitCode = (item = {}) => {
    const explicitUnitCode = item?.empresa_codigo || item?.empresaCode || item?.unit_code || item?.unitCode;
    if (explicitUnitCode) return normalizeEntityUnitCode(explicitUnitCode);

    const unitId = item?.empresa_id || item?.empresaId || (unitScoped ? getMockScopedUnitId() : '');
    if (!unitId) return '00';

    const companies = readStorage('Empresa');
    const company = companies.find((entry) => entry?.id === unitId);
    return normalizeEntityUnitCode(company?.codigo || unitId);
  };

  const ensureMockEntityCodes = (items) => {
    const normalizedItems = Array.isArray(items) ? items.map((item) => ({ ...item })) : [];
    if (!hasInternalEntityCodeConfig(name)) return normalizedItems;

    let hasChanged = false;
    normalizedItems.forEach((item) => {
      if (getInternalEntityCode(item)) return;
      item.codigo = buildInternalEntityCode({
        entityName: name,
        record: item,
        existingRecords: normalizedItems,
        unitCode: resolveMockUnitCode(item),
      });
      hasChanged = true;
    });

    if (hasChanged) {
      writeStorage(name, normalizedItems);
    }

    return normalizedItems;
  };

  const applyMockQueryOptions = (items, queryOptions = {}) => {
    const {
      eq = {},
      in: inFilters = {},
      gte = {},
      lte = {},
      search = null,
      sort = null,
      orderBy = null,
      ascending = undefined,
      limit = undefined,
      offset = 0,
    } = queryOptions || {};

    let filteredItems = [...items];

    Object.entries(eq || {}).forEach(([field, value]) => {
      if (value === undefined || value === null || value === '') return;
      filteredItems = filteredItems.filter((item) => item?.[field] === value);
    });

    Object.entries(inFilters || {}).forEach(([field, value]) => {
      const values = Array.isArray(value) ? value.filter(Boolean) : [];
      if (!values.length) return;
      filteredItems = filteredItems.filter((item) => values.includes(item?.[field]));
    });

    Object.entries(gte || {}).forEach(([field, value]) => {
      if (value === undefined || value === null || value === '') return;
      filteredItems = filteredItems.filter((item) => String(item?.[field] || '') >= String(value));
    });

    Object.entries(lte || {}).forEach(([field, value]) => {
      if (value === undefined || value === null || value === '') return;
      filteredItems = filteredItems.filter((item) => String(item?.[field] || '') <= String(value));
    });

    const searchTerm = search?.term ? String(search.term).trim().toLowerCase() : '';
    const searchColumns = Array.isArray(search?.columns) ? search.columns : [];
    if (searchTerm && searchColumns.length > 0) {
      filteredItems = filteredItems.filter((item) => searchColumns.some((column) => {
        const rawValue = item?.[column];
        if (rawValue === null || rawValue === undefined) return false;
        return String(rawValue).toLowerCase().includes(searchTerm);
      }));
    }

    const effectiveSort = typeof sort === 'string' && sort
      ? { field: sort.replace(/^-/, ''), ascending: !sort.startsWith('-') }
      : orderBy
        ? { field: orderBy, ascending: ascending !== false }
        : null;

    if (effectiveSort?.field) {
      filteredItems.sort((left, right) => {
        const leftValue = left?.[effectiveSort.field];
        const rightValue = right?.[effectiveSort.field];
        if (leftValue === rightValue) return 0;
        if (leftValue === undefined || leftValue === null) return 1;
        if (rightValue === undefined || rightValue === null) return -1;
        return leftValue > rightValue ? (effectiveSort.ascending ? 1 : -1) : (effectiveSort.ascending ? -1 : 1);
      });
    }

    const total = filteredItems.length;
    const normalizedOffset = Math.max(0, Number(offset) || 0);
    const pagedItems = typeof limit === 'number'
      ? filteredItems.slice(normalizedOffset, normalizedOffset + limit)
      : filteredItems.slice(normalizedOffset);

    return {
      data: pagedItems,
      count: total,
      hasMore: normalizedOffset + pagedItems.length < total,
    };
  };

  const getScopedMockItems = () => ensureMockEntityCodes(readStorage(name))
    .filter((item) => !unitScoped || !item.empresa_id || getMockScopedUnitIds().includes(item.empresa_id));

  return {
    list: (sort, limit) => Promise.resolve(
      applyMockQueryOptions(getScopedMockItems(), { sort, limit }).data
    ),
    listAll: (sort, limit) => Promise.resolve(
      applyMockQueryOptions(getScopedMockItems(), { sort, limit }).data
    ),
    filter: (query = {}, sort, limit) => {
      const scopedQuery = { ...(query || {}) };
      return Promise.resolve(
        applyMockQueryOptions(
        getScopedMockItems().filter((item) => {
          if (unitScoped && !Object.prototype.hasOwnProperty.call(scopedQuery, 'empresa_id')) {
            const selectedUnitIds = getMockScopedUnitIds();
            if (item.empresa_id && !selectedUnitIds.includes(item.empresa_id)) {
              return false;
            }
          }

          return Object.keys(scopedQuery || {}).every((key) => (
            scopedQuery[key] === null || scopedQuery[key] === undefined || item[key] === scopedQuery[key]
          ));
        }),
        { sort, limit },
      ).data
      );
    },
    query: (queryOptions = {}) => Promise.resolve(
      applyMockQueryOptions(getScopedMockItems(), queryOptions)
    ),
    queryAll: (queryOptions = {}) => Promise.resolve(
      applyMockQueryOptions(getScopedMockItems(), queryOptions)
    ),
    create: (data) => {
      if (unitScoped) ensureSingleUnitWrite(name);
      const items = ensureMockEntityCodes(readStorage(name));
      const item = { ...data };
      if (unitScoped && !item.empresa_id) item.empresa_id = getMockScopedUnitId();
      if (hasInternalEntityCodeConfig(name)) {
        item.codigo = getInternalEntityCode(item) || buildInternalEntityCode({
          entityName: name,
          record: item,
          existingRecords: items,
          unitCode: resolveMockUnitCode(item),
        });
      }
      if (!item.id) item.id = makeId();
      if (!item.created_date) item.created_date = new Date().toISOString();
      items.push(item);
      writeStorage(name, items);
      return Promise.resolve(item);
    },
    update: (id, data) => {
      if (unitScoped) ensureSingleUnitWrite(name);
      const items = ensureMockEntityCodes(readStorage(name));
      const idx = items.findIndex((item) => item.id === id);
      if (idx === -1) return Promise.reject(new Error('Not found'));
      const nextItem = { ...items[idx], ...data, updated_date: new Date().toISOString() };
      if (hasInternalEntityCodeConfig(name)) {
        nextItem.codigo = getInternalEntityCode(items[idx]) || getInternalEntityCode(nextItem) || buildInternalEntityCode({
          entityName: name,
          record: nextItem,
          existingRecords: items,
          unitCode: resolveMockUnitCode(nextItem),
        });
      }
      items[idx] = nextItem;
      writeStorage(name, items);
      return Promise.resolve(items[idx]);
    },
    delete: (id) => {
      if (unitScoped) ensureSingleUnitWrite(name);
      const items = ensureMockEntityCodes(readStorage(name));
      const idx = items.findIndex((item) => item.id === id);
      if (idx === -1) return Promise.reject(new Error('Not found'));
      const [removed] = items.splice(idx, 1);
      writeStorage(name, items);
      return Promise.resolve(removed);
    },
  };
}

const defaultEntities = {};
[
  'Dog', 'Checkin', 'Schedule', 'ServiceProvider', 'ServiceProviderSchedule', 'Lancamento', 'ExtratoBancario', 'Despesa',
  'Responsavel', 'Carteira', 'Notificacao', 'Orcamento', 'TabelaPrecos', 'Appointment',
  'ServiceProvided', 'Transaction', 'ScheduledTransaction', 'Replacement', 'PlanConfig',
  'RecurringPackage', 'PackageSession', 'PackageCredit', 'PackageBilling', 'CarteiraConta',
  'CarteiraMovimento', 'CarteiraReconciliacao', 'AutorizacaoFinanceira', 'CancelamentoFinanceiro',
  'ObrigacaoFinanceira', 'CobrancaFinanceira', 'CobrancaItem', 'ComissaoEvento',
  'FinanceSnapshot', 'FinanceSnapshotDelta', 'AuditLog',
  'IntegracaoConfig', 'Receita', 'AppConfig', 'AppAsset', 'Empresa', 'PerfilAcesso',
  'UserInvite', 'UserUnitAccess',
  'UserProfile', 'ContaReceber', 'Client', 'PedidoInterno',
  'CentroCusto',
].forEach((name) => {
  defaultEntities[name] = createMockEntity(name, { unitScoped: UNIT_SCOPED_ENTITIES.has(name) });
});

function getMockFlagValue(key, empresaId = null) {
  const configs = readStorage('AppConfig');
  const scoped = configs.find(
    (item) => item?.key === key && item?.empresa_id === empresaId && item?.ativo !== false
  );
  if (scoped) return Boolean(scoped?.value?.enabled);

  const globalConfig = configs.find(
    (item) => item?.key === key && (item?.empresa_id === null || item?.empresa_id === undefined) && item?.ativo !== false
  );
  return Boolean(globalConfig?.value?.enabled);
}

function getMockWalletAccountsByCompany(empresaId) {
  const contas = readStorage('CarteiraConta');
  const carteiras = readStorage('Carteira');
  const movimentos = readStorage('CarteiraMovimento');
  const reconciliacoes = readStorage('CarteiraReconciliacao');

  return contas
    .filter((conta) => !empresaId || conta?.empresa_id === empresaId)
    .map((conta) => {
      const carteira = carteiras.find((item) => item?.id === conta?.carteira_id);
      const contaMovements = movimentos
        .filter((item) => item?.carteira_conta_id === conta?.id)
        .sort((left, right) => new Date(right?.created_date || 0).getTime() - new Date(left?.created_date || 0).getTime());
      const latestReconciliation = reconciliacoes
        .filter((item) => item?.carteira_conta_id === conta?.id)
        .sort((left, right) => new Date(right?.created_date || 0).getTime() - new Date(left?.created_date || 0).getTime())[0];

      return {
        carteira_conta_id: conta.id,
        carteira_id: conta.carteira_id,
        empresa_id: conta.empresa_id,
        carteira_codigo: carteira?.codigo || '',
        carteira_nome: carteira?.nome_razao_social || carteira?.nome_fantasia || carteira?.id || conta.carteira_id,
        saldo_atual: Number(conta?.saldo_atual || 0),
        movimento_count: contaMovements.length,
        ultimo_movimento_em: conta?.ultimo_movimento_em || contaMovements[0]?.created_date || null,
        ultima_reconciliacao_em: conta?.ultima_reconciliacao_em || latestReconciliation?.created_date || null,
        latest_reconciliation_status: latestReconciliation?.status || null,
        latest_reconciliation_diff: Number(latestReconciliation?.diferenca || 0),
        latest_reconciliation_id: latestReconciliation?.id || null,
      };
    });
}

function buildMockWalletAuditRows(empresaId) {
  const contas = readStorage('CarteiraConta').filter((conta) => !empresaId || conta?.empresa_id === empresaId);
  const carteiras = readStorage('Carteira');
  const movimentos = readStorage('CarteiraMovimento');

  return contas.map((conta) => {
    const carteira = carteiras.find((item) => item?.id === conta?.carteira_id);
    const contaMovements = movimentos
      .filter((item) => item?.carteira_conta_id === conta?.id)
      .sort((left, right) => new Date(right?.created_date || 0).getTime() - new Date(left?.created_date || 0).getTime());
    const saldoPorUltimo = Number(contaMovements[0]?.saldo_final || 0);
    const saldoPorSoma = contaMovements.reduce((sum, item) => {
      const valor = Number(item?.valor || 0);
      return item?.natureza === 'saida' ? sum - valor : sum + valor;
    }, 0);
    const saldoPersistido = Number(conta?.saldo_atual || 0);
    const diffUltimo = Math.round((saldoPersistido - saldoPorUltimo) * 100) / 100;
    const diffSoma = Math.round((saldoPersistido - saldoPorSoma) * 100) / 100;

    return {
      carteira_conta_id: conta.id,
      carteira_id: conta.carteira_id,
      carteira_nome: carteira?.nome_razao_social || carteira?.nome_fantasia || carteira?.id || conta.carteira_id,
      saldo_persistido: saldoPersistido,
      saldo_por_ultimo_movimento: saldoPorUltimo,
      saldo_por_soma: Math.round(saldoPorSoma * 100) / 100,
      diferenca_ultimo: diffUltimo,
      diferenca_soma: diffSoma,
      status: diffUltimo === 0 && diffSoma === 0 ? 'ok' : 'divergente',
    };
  });
}

function getMockWalletBudgetFlags(empresaId) {
  return {
    wallet_budget_balance_enabled: getMockFlagValue('finance.wallet_budget_balance_enabled', empresaId),
    chronological_consumption_enabled: getMockFlagValue('finance.chronological_consumption_enabled', empresaId),
    allow_negative_wallet_with_authorization: getMockFlagValue('finance.allow_negative_wallet_with_authorization', empresaId),
    budget_authorization_enabled: getMockFlagValue('finance.budget_authorization_enabled', empresaId),
    cancellation_v2_enabled: getMockFlagValue('finance.cancellation_v2_enabled', empresaId),
    compensatory_credit_enabled: getMockFlagValue('finance.compensatory_credit_enabled', empresaId),
    manual_credit_enabled: getMockFlagValue('finance.manual_credit_enabled', empresaId),
    cancellation_penalty_enabled: getMockFlagValue('finance.cancellation_penalty_enabled', empresaId),
  };
}

function getMockReportsFlags(empresaId) {
  return {
    reports_v2_enabled: getMockFlagValue('finance.reports_v2_enabled', empresaId),
    snapshots_enabled: getMockFlagValue('finance.snapshots_enabled', empresaId),
    financial_competence_enabled: getMockFlagValue('finance.financial_competence_enabled', empresaId),
  };
}

function getMockCommissionFlags(empresaId) {
  return {
    commission_enabled: getMockFlagValue('finance.commission_enabled', empresaId),
    commission_visualization_enabled: getMockFlagValue('finance.commission_visualization_enabled', empresaId),
  };
}

function getMockCockpitFlags(empresaId) {
  return {
    cockpit_v2_enabled: getMockFlagValue('finance.cockpit_v2_enabled', empresaId),
    cockpit_v2_compare_enabled: getMockFlagValue('finance.cockpit_v2_compare_enabled', empresaId),
    financial_alerts_v2_enabled: getMockFlagValue('finance.financial_alerts_v2_enabled', empresaId),
    legacy_cockpit_finance_disabled: getMockFlagValue('finance.legacy_cockpit_finance_disabled', empresaId),
  };
}

function getMockCommissionSellerMap(empresaId) {
  const providers = readStorage('ServiceProvider').filter((item) => !empresaId || item?.empresa_id === empresaId || !item?.empresa_id);
  return Object.fromEntries(providers.map((item) => [item.id, item]));
}

function getMockCommissionListRows(empresaId, status = null, limit = 100) {
  const sellersById = getMockCommissionSellerMap(empresaId);
  return readStorage('ComissaoEvento')
    .filter((item) => item?.empresa_id === empresaId)
    .filter((item) => !status || item?.status === status)
    .sort((left, right) => new Date(right?.data_comissao || right?.created_date || 0).getTime() - new Date(left?.data_comissao || left?.created_date || 0).getTime())
    .slice(0, Math.max(1, Math.min(Number(limit) || 100, 500)))
    .map((item) => ({
      ...item,
      vendedor_nome: sellersById[item?.vendedor_user_id]?.nome || sellersById[item?.vendedor_user_id]?.full_name || item?.vendedor_user_id || '-',
    }));
}

function buildMockLegacyCockpitSummary(empresaId, periodoInicio = null, periodoFim = null) {
  const transactions = readStorage('Transaction')
    .filter((item) => item?.empresa_id === empresaId || !item?.empresa_id);
  const contasReceber = readStorage('ContaReceber')
    .filter((item) => item?.empresa_id === empresaId || !item?.empresa_id);
  const servicesProvided = readStorage('ServiceProvided')
    .filter((item) => item?.empresa_id === empresaId || !item?.empresa_id);
  const replacements = readStorage('Replacement')
    .filter((item) => item?.empresa_id === empresaId || !item?.empresa_id);

  const isInPeriod = (value) => {
    const current = value ? new Date(String(value).includes('T') ? value : `${value}T12:00:00`) : null;
    if (!current || Number.isNaN(current.getTime())) return false;
    if (periodoInicio && current < new Date(`${periodoInicio}T00:00:00`)) return false;
    if (periodoFim && current > new Date(`${periodoFim}T23:59:59`)) return false;
    return true;
  };

  return {
    recebimentos_total: transactions
      .filter((item) => item?.type === 'entrada' || item?.tipo === 'entrada')
      .filter((item) => !periodoInicio && !periodoFim ? true : isInPeriod(item?.date || item?.data_transacao || item?.created_date))
      .reduce((sum, item) => sum + Number(item?.value ?? item?.valor ?? 0), 0),
    pendencias_total: contasReceber
      .filter((item) => (item?.status || 'pendente') !== 'pago' && !item?.data_recebimento)
      .reduce((sum, item) => sum + Number(item?.valor || 0), 0),
    faturamento_real_total: transactions
      .filter((item) => item?.type === 'entrada' || item?.tipo === 'entrada')
      .filter((item) => !periodoInicio && !periodoFim ? true : isInPeriod(item?.date || item?.data_transacao || item?.created_date))
      .reduce((sum, item) => sum + Number(item?.value ?? item?.valor ?? 0), 0),
    geracao_recursos_total: servicesProvided
      .filter((item) => !periodoInicio && !periodoFim ? true : isInPeriod(item?.data_utilizacao || item?.created_date))
      .reduce((sum, item) => sum + Number(item?.valor_cobrado ?? item?.preco ?? 0), 0),
    cancelamentos_estornos_total: replacements
      .filter((item) => !periodoInicio && !periodoFim ? true : isInPeriod(item?.created_date))
      .length,
    comissoes_total: 0,
    cobrancas_abertas_vencidas_total: contasReceber
      .filter((item) => (item?.status || 'pendente') !== 'pago' && !item?.data_recebimento)
      .filter((item) => {
        if (!item?.vencimento) return false;
        return new Date(`${item.vencimento}T12:00:00`) < new Date();
      })
      .length,
  };
}

function buildMockCockpitAlerts(empresaId, periodoInicio = null, periodoFim = null) {
  const walletAccounts = readStorage('CarteiraConta').filter((item) => item?.empresa_id === empresaId);
  const obligations = readStorage('ObrigacaoFinanceira').filter((item) => item?.empresa_id === empresaId);
  const charges = readStorage('CobrancaFinanceira').filter((item) => item?.empresa_id === empresaId);
  const commissions = readStorage('ComissaoEvento').filter((item) => item?.empresa_id === empresaId);
  const cancellations = readStorage('CancelamentoFinanceiro').filter((item) => item?.empresa_id === empresaId);
  const deltas = readStorage('FinanceSnapshotDelta').filter((item) => item?.empresa_id === empresaId);
  const reconciliations = readStorage('CarteiraReconciliacao').filter((item) => item?.empresa_id === empresaId);
  const movements = readStorage('CarteiraMovimento').filter((item) => item?.empresa_id === empresaId);

  const inPeriod = (value) => {
    if (!periodoInicio && !periodoFim) return true;
    const current = value ? new Date(String(value).includes('T') ? value : `${value}T12:00:00`) : null;
    if (!current || Number.isNaN(current.getTime())) return false;
    if (periodoInicio && current < new Date(`${periodoInicio}T00:00:00`)) return false;
    if (periodoFim && current > new Date(`${periodoFim}T23:59:59`)) return false;
    return true;
  };

  const latestReconciliationByAccount = reconciliations.reduce((acc, item) => {
    const current = acc[item?.carteira_conta_id];
    if (!current || new Date(item?.created_date || 0).getTime() > new Date(current?.created_date || 0).getTime()) {
      acc[item?.carteira_conta_id] = item;
    }
    return acc;
  }, {});

  const alerts = [];

  walletAccounts
    .filter((item) => Number(item?.saldo_atual || 0) < 0)
    .forEach((item) => {
      alerts.push({
        alert_key: `wallet_negative|${item.id}`,
        alert_type: 'carteira_negativa',
        severity: 'alta',
        title: 'Carteira negativa',
        description: 'Carteira com saldo negativo na nova camada financeira.',
        entity_type: 'carteira_conta',
        entity_id: item.id,
        amount: Number(item?.saldo_atual || 0),
        created_date: item?.updated_date || item?.created_date || new Date().toISOString(),
        payload: { carteira_id: item?.carteira_id || null },
      });
    });

  charges
    .filter((item) => ['aberta', 'parcial', 'vencida'].includes(item?.status))
    .filter((item) => Number(item?.valor_em_aberto || 0) > 0)
    .filter((item) => item?.due_date && new Date(`${item.due_date}T12:00:00`) < new Date())
    .forEach((item) => {
      alerts.push({
        alert_key: `charge_overdue|${item.id}`,
        alert_type: 'cobranca_vencida',
        severity: 'media',
        title: 'Cobrança vencida',
        description: 'Cobrança aberta/parcial com vencimento ultrapassado.',
        entity_type: 'cobranca_financeira',
        entity_id: item.id,
        amount: Number(item?.valor_em_aberto || 0),
        created_date: item?.updated_date || item?.created_date || new Date().toISOString(),
        payload: { due_date: item?.due_date || null, status: item?.status || null },
      });
    });

  obligations
    .filter((item) => ['aberta', 'parcial', 'vencida'].includes(item?.status))
    .filter((item) => Number(item?.valor_em_aberto || 0) > 0)
    .filter((item) => item?.due_date && new Date(`${item.due_date}T12:00:00`) < new Date())
    .forEach((item) => {
      alerts.push({
        alert_key: `obligation_overdue|${item.id}`,
        alert_type: 'obrigacao_vencida',
        severity: 'media',
        title: 'Obrigação vencida',
        description: 'Obrigação financeira ainda em aberto após o vencimento.',
        entity_type: 'obrigacao_financeira',
        entity_id: item.id,
        amount: Number(item?.valor_em_aberto || 0),
        created_date: item?.updated_date || item?.created_date || new Date().toISOString(),
        payload: { due_date: item?.due_date || null, status: item?.status || null },
      });
    });

  Object.values(latestReconciliationByAccount)
    .filter((item) => item?.status === 'divergente')
    .forEach((item) => {
      alerts.push({
        alert_key: `reconciliation_divergence|${item.id}`,
        alert_type: 'divergencia_reconciliacao',
        severity: 'alta',
        title: 'Divergência de reconciliação',
        description: 'A última reconciliação da carteira está divergente.',
        entity_type: 'carteira_reconciliacao',
        entity_id: item.id,
        amount: Number(item?.diferenca || 0),
        created_date: item?.created_date || new Date().toISOString(),
        payload: { carteira_conta_id: item?.carteira_conta_id || null },
      });
    });

  commissions
    .filter((item) => ['estornada', 'parcialmente_estornada'].includes(item?.status))
    .forEach((item) => {
      alerts.push({
        alert_key: `commission_reversed|${item.id}`,
        alert_type: 'comissao_estornada',
        severity: 'media',
        title: 'Comissão estornada',
        description: 'Evento de comissão com estorno total ou parcial.',
        entity_type: 'comissao_evento',
        entity_id: item.id,
        amount: Number(item?.valor_estornado ?? item?.valor_comissao ?? 0),
        created_date: item?.created_date || new Date().toISOString(),
        payload: { vendedor_user_id: item?.vendedor_user_id || null, status: item?.status || null },
      });
    });

  cancellations
    .filter((item) => item?.gerar_credito_compensatorio === true)
    .filter((item) => inPeriod(item?.created_date))
    .forEach((item) => {
      alerts.push({
        alert_key: `cancellation_credit|${item.id}`,
        alert_type: 'cancelamento_com_credito_compensatorio',
        severity: 'info',
        title: 'Cancelamento com crédito compensatório',
        description: 'Cancelamento financeiro gerou crédito compensatório auditável.',
        entity_type: 'cancelamento_financeiro',
        entity_id: item.id,
        amount: Number(item?.valor_multa || 0),
        created_date: item?.created_date || new Date().toISOString(),
        payload: { origem_cancelamento: item?.origem_cancelamento || null },
      });
    });

  deltas
    .filter((item) => Math.abs(Number(item?.impacto_financeiro || 0)) > 0)
    .filter((item) => inPeriod(item?.created_date))
    .forEach((item) => {
      alerts.push({
        alert_key: `snapshot_delta|${item.id}`,
        alert_type: 'snapshot_delta_relevante',
        severity: Math.abs(Number(item?.impacto_financeiro || 0)) > 100 ? 'alta' : 'media',
        title: 'Snapshot alterado por delta relevante',
        description: 'Mudança financeira detectada após fechamento preservado.',
        entity_type: 'finance_snapshot_delta',
        entity_id: item.id,
        amount: Number(item?.impacto_financeiro || 0),
        created_date: item?.created_date || new Date().toISOString(),
        payload: { comparison_run_id: item?.comparison_run_id || null, delta_kind: item?.delta_kind || null },
      });
    });

  movements
    .filter((item) => item?.natureza === 'entrada')
    .filter((item) => !item?.obrigacao_id)
    .forEach((item) => {
      const hasOpenObligation = obligations.some((obrigacao) =>
        obrigacao?.carteira_conta_id === item?.carteira_conta_id
        && ['aberta', 'parcial', 'vencida'].includes(obrigacao?.status)
        && Number(obrigacao?.valor_em_aberto || 0) > 0,
      );
      if (!hasOpenObligation) {
        alerts.push({
          alert_key: `possible_overpayment|${item.id}`,
          alert_type: 'pagamento_a_maior',
          severity: 'baixa',
          title: 'Possível pagamento a maior',
          description: 'Entrada sem obrigação em aberto vinculada para a carteira.',
          entity_type: 'carteira_movimento',
          entity_id: item.id,
          amount: Number(item?.valor || 0),
          created_date: item?.created_date || new Date().toISOString(),
          payload: { carteira_conta_id: item?.carteira_conta_id || null, tipo: item?.tipo || null },
        });
      }
    });

  return sortFinancialAlerts(alerts);
}

function resolveMockCommissionSource(obrigacao) {
  const orcamentos = readStorage('Orcamento');
  const plans = readStorage('PlanConfig');
  const recurringPackages = readStorage('RecurringPackage');
  const orcamento = obrigacao?.orcamento_id ? orcamentos.find((item) => item?.id === obrigacao.orcamento_id) : null;
  const recurringPackage = obrigacao?.recurring_package_id ? recurringPackages.find((item) => item?.id === obrigacao.recurring_package_id) : null;
  const planId = recurringPackage?.metadata?.plan_config_id || recurringPackage?.plan_config_id || obrigacao?.metadata?.plan_config_id || null;
  const plan = planId ? plans.find((item) => item?.id === planId) : null;
  const vendedorUserId = orcamento?.vendedor_user_id || recurringPackage?.vendedor_user_id || plan?.vendedor_user_id || null;
  const percentual = normalizeCommissionPercent(
    orcamento?.commission_percentual
    ?? recurringPackage?.commission_percentual
    ?? plan?.commission_percentual
    ?? 0,
  );

  return {
    vendedor_user_id: vendedorUserId,
    percentual,
    orcamento_id: orcamento?.id || obrigacao?.orcamento_id || null,
    plan_config_id: plan?.id || null,
    recurring_package_id: recurringPackage?.id || obrigacao?.recurring_package_id || null,
    origem: orcamento?.id ? 'orcamento' : recurringPackage?.id ? 'recurring_package' : 'obrigacao',
    produto_servico: obrigacao?.descricao || obrigacao?.tipo_item || recurringPackage?.service_id || plan?.service || '',
    data_venda: orcamento?.created_date || recurringPackage?.created_at || plan?.created_date || obrigacao?.created_date || null,
  };
}

function buildMockReportItemsByType(empresaId, type, periodStart = null, periodEnd = null) {
  const serviceProvided = readStorage('ServiceProvided').filter((item) => item?.empresa_id === empresaId);
  const walletMovements = readStorage('CarteiraMovimento').filter((item) => item?.empresa_id === empresaId);
  const walletAccounts = readStorage('CarteiraConta').filter((item) => item?.empresa_id === empresaId);
  const walletReconciliations = readStorage('CarteiraReconciliacao').filter((item) => item?.empresa_id === empresaId);

  if (type === 'geracao_recursos') {
    return buildGenerationResourcesReport(serviceProvided, { startDate: periodStart, endDate: periodEnd });
  }

  if (type === 'faturamento_real') {
    return buildRealBillingReport(walletMovements, { startDate: periodStart, endDate: periodEnd });
  }

  if (type === 'carteira') {
    return buildWalletReport(walletAccounts, walletReconciliations, walletMovements);
  }

  if (type === 'servicos_prestados') {
    return buildServicesProvidedReport(serviceProvided, { startDate: periodStart, endDate: periodEnd });
  }

  throw new Error(`Tipo de relatório V2 inválido: ${type}.`);
}

function getMockLatestWalletReconciliation(contaId) {
  return readStorage('CarteiraReconciliacao')
    .filter((item) => item?.carteira_conta_id === contaId)
    .sort((left, right) => new Date(right?.created_date || 0).getTime() - new Date(left?.created_date || 0).getTime())[0] || null;
}

function applyMockWalletOperationCore(payload = {}) {
  const contas = readStorage('CarteiraConta');
  const movimentos = readStorage('CarteiraMovimento');
  const contaIndex = contas.findIndex((item) => item?.id === payload?.carteira_conta_id);
  if (contaIndex < 0) throw new Error('carteira_conta não encontrada.');

  const conta = contas[contaIndex];
  const empresaId = conta?.empresa_id || null;
  const tipo = String(payload?.tipo || '').trim();
  const natureza = String(payload?.natureza || '').trim();
  const existing = movimentos.find(
    (item) => item?.empresa_id === empresaId && item?.operacao_idempotencia === payload?.operacao_idempotencia,
  );

  if (existing) {
    return {
      movimento_id: existing.id,
      carteira_conta_id: existing.carteira_conta_id,
      saldo_anterior: Number(existing.saldo_anterior || 0),
      saldo_final: Number(existing.saldo_final || 0),
      reused: true,
    };
  }

  const valor = Math.round((Number(payload?.valor || 0) + Number.EPSILON) * 100) / 100;
  const saldoAnterior = Math.round((Number(conta?.saldo_atual || 0) + Number.EPSILON) * 100) / 100;
  const saldoFinal = Math.round((natureza === 'saida' ? saldoAnterior - valor : saldoAnterior + valor) * 100) / 100;

  if (!payload?.permitir_saldo_negativo && saldoFinal < 0) {
    throw new Error('A operação deixaria a carteira com saldo negativo sem autorização.');
  }

  const now = new Date().toISOString();
  const movimento = {
    id: makeId(),
    empresa_id: empresaId,
    carteira_conta_id: conta.id,
    tipo,
    natureza,
    origem: payload?.origem || 'admin_manual',
    operacao_idempotencia: payload?.operacao_idempotencia,
    valor,
    saldo_anterior: saldoAnterior,
    saldo_final: saldoFinal,
    referencia_amigavel: payload?.referencia_amigavel || '',
    descricao: payload?.descricao || payload?.observacao || payload?.motivo || '',
    orcamento_id: payload?.orcamento_id || null,
    appointment_id: payload?.appointment_id || null,
    obrigacao_id: payload?.obrigacao_id || null,
    transacao_id: payload?.transacao_id || null,
    usuario_id: payload?.usuario_id || null,
    compensado_por_movimento_id: payload?.compensado_por_movimento_id || null,
    metadata: payload?.metadata || {},
    created_date: now,
  };

  movimentos.push(movimento);
  writeStorage('CarteiraMovimento', movimentos);

  contas[contaIndex] = {
    ...conta,
    saldo_atual: saldoFinal,
    ultimo_movimento_em: now,
    updated_date: now,
    lock_version: Number(conta?.lock_version || 0) + 1,
  };
  writeStorage('CarteiraConta', contas);

  return {
    movimento_id: movimento.id,
    carteira_conta_id: movimento.carteira_conta_id,
    saldo_anterior: saldoAnterior,
    saldo_final: saldoFinal,
    reused: false,
  };
}

function roundMockCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function buildMockCancellationSourceKey(obrigacaoId, origemCancelamento) {
  return `cancellation_v2|obrigacao|${obrigacaoId}|origem|${origemCancelamento}`;
}

function buildMockCancellationResult(row = {}) {
  return {
    cancelamento_financeiro_id: row.id || null,
    obrigacao_id: row.obrigacao_id || null,
    obrigacao_status: row.obrigacao_status || null,
    valor_pago_ate_agora: roundMockCurrency(row.valor_pago_ate_agora || 0),
    valor_credito_gerado: roundMockCurrency(row.valor_credito_compensatorio || 0),
    valor_multa_gerado: roundMockCurrency(row.valor_multa || 0),
    multa_movimento_id: row.multa_movimento_id || null,
    credito_movimento_id: row.credito_movimento_id || null,
    reused: Boolean(row.reused),
  };
}

const mockFunctions = {
  notificacoesOrcamento: async (payload) => {
    console.info('[mock] notificacoesOrcamento called with', payload);
    return { ok: true };
  },
  bancoInter: async (payload) => {
    console.info('[mock] bancoInter called with', payload);
    if (payload?.action === 'test') {
      return { success: true, message: 'Mock Banco Inter conectado.' };
    }
    if (payload?.action === 'buscarExtrato' || payload?.action === 'syncNow') {
      return {
        success: true,
        message: 'Mock Banco Inter importou 0 registros.',
        imported_count: 0,
        deduplicated_count: 0,
        total: 0,
        inseridas: 0,
        duplicadas: 0,
      };
    }
    return { ok: true };
  },
  clientRegistration: async (payload = {}) => {
    const links = readStorage('client_registration_links');
    const accesses = readStorage('responsavel_portal_access');
    const action = payload?.action;

    if (action === 'create_link') {
      const token = payload?.token || makeId();
      const row = {
        id: makeId(),
        token,
        empresa_id: payload?.empresa_id || getMockScopedUnitId(),
        responsavel_nome: payload?.responsavel_nome || '',
        responsavel_email: payload?.responsavel_email || '',
        status: 'pendente',
        metadata: payload?.metadata || {},
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      };
      links.push(row);
      writeStorage('client_registration_links', links);
      return {
        ok: true,
        link: row,
      };
    }

    if (action === 'verify_cpf') {
      const fullName = String(payload?.full_name || '').trim();
      const firstName = fullName.split(/\s+/).filter(Boolean)[0]?.toLowerCase() || '';
      return {
        ok: true,
        configured: false,
        valid_format: /^\d{11}$/.test(String(payload?.cpf || '').replace(/\D/g, '')),
        first_name_matches: firstName ? true : null,
        api_name: fullName,
        api_first_name: firstName,
      };
    }

    const token = String(payload?.token || '').trim();
    const rowIndex = links.findIndex((item) => item.token === token);
    const row = rowIndex >= 0 ? links[rowIndex] : null;

    if (!row) {
      throw new Error('Link de cadastro não localizado.');
    }

    if (action === 'get_context') {
      return {
        ok: true,
        link: row,
        empresa: {
          id: row.empresa_id,
          nome_fantasia: 'Dog City Brasil',
        },
      };
    }

    if (action === 'submit') {
      const responsavelPayload = payload?.payload?.responsavel || {};
      const portalLogin = String(responsavelPayload?.login_portal || '').trim().toLowerCase();
      const portalPassword = String(responsavelPayload?.senha_portal || '').trim();
      const portalConfirmPassword = String(responsavelPayload?.confirmar_senha_portal || '').trim();

      if (portalLogin || portalPassword || portalConfirmPassword) {
        if (!portalLogin || !portalPassword || !portalConfirmPassword) {
          throw new Error('Se quiser preparar a confirmação autenticada, preencha login, senha e confirmação da senha.');
        }
        if (portalPassword.length < 6) {
          throw new Error('A senha para confirmação de orçamentos/agendamentos precisa ter pelo menos 6 caracteres.');
        }
        if (portalPassword !== portalConfirmPassword) {
          throw new Error('A confirmação da senha do responsável não confere.');
        }
      }

      links[rowIndex] = {
        ...row,
        status: 'concluido',
        submitted_payload: payload?.payload || {},
        completed_at: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      };
      writeStorage('client_registration_links', links);

      if (portalLogin && portalPassword) {
        const currentIndex = accesses.findIndex((item) => item.login === portalLogin);
        const responsavelId = links[rowIndex]?.responsavel_id || links[rowIndex]?.id || makeId();
        const nextAccess = {
          id: currentIndex >= 0 ? accesses[currentIndex].id : makeId(),
          responsavel_id: responsavelId,
          empresa_id: links[rowIndex]?.empresa_id || getMockScopedUnitId(),
          login: portalLogin,
          mock_password: portalPassword,
          ativo: true,
          created_at: currentIndex >= 0 ? accesses[currentIndex].created_at : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (currentIndex >= 0) accesses[currentIndex] = nextAccess;
        else accesses.push(nextAccess);
        writeStorage('responsavel_portal_access', accesses);
      }

      return {
        ok: true,
        link: links[rowIndex],
      };
    }

    throw new Error('Ação de cadastro do cliente inválida.');
  },
  monitorRegistration: async (payload = {}) => {
    const providers = readStorage('ServiceProvider');
    const action = payload?.action;
    const token = String(payload?.token || '').trim();

    if (action === 'get_context') {
      const provider = providers.find((item) => item.registration_token === token);
      if (!provider) throw new Error('Link de cadastro de funcionário não localizado.');
      return { ok: true, provider: { id: provider.id, nome: provider.nome || '' } };
    }

    if (action === 'submit') {
      const providerIndex = providers.findIndex((item) => item.registration_token === token);
      if (providerIndex < 0) throw new Error('Link de cadastro de funcionário não localizado.');
      providers[providerIndex] = {
        ...providers[providerIndex],
        ...(payload?.profile || {}),
        signature_code: providers[providerIndex].signature_code || String(Math.floor(Math.random() * 10000)).padStart(4, '0'),
        registration_status: 'concluido',
        completed_at: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      };
      writeStorage('ServiceProvider', providers);
      return { ok: true, provider: providers[providerIndex] };
    }

    throw new Error('Ação de cadastro do funcionário inválida.');
  },
  responsavelApproval: async (payload = {}) => {
    const action = String(payload?.action || '').trim();
    const accesses = readStorage('responsavel_portal_access');
    const requests = readStorage('responsavel_approval_request');
    const sessions = readStorage('responsavel_approval_session');

    if (action === 'upsert_access') {
      const responsavelId = String(payload?.responsavel_id || '').trim();
      const login = String(payload?.login || '').trim().toLowerCase();
      const password = String(payload?.password || '').trim();
      if (!responsavelId || !login || !password) {
        throw new Error('Informe responsável, login e senha para liberar o acesso.');
      }

      const currentIndex = accesses.findIndex((item) => item.responsavel_id === responsavelId);
      const nextRow = {
        id: currentIndex >= 0 ? accesses[currentIndex].id : makeId(),
        responsavel_id: responsavelId,
        empresa_id: payload?.empresa_id || getMockScopedUnitId(),
        login,
        mock_password: password,
        ativo: true,
        updated_at: new Date().toISOString(),
        created_at: currentIndex >= 0 ? accesses[currentIndex].created_at : new Date().toISOString(),
      };

      if (currentIndex >= 0) accesses[currentIndex] = nextRow;
      else accesses.push(nextRow);
      writeStorage('responsavel_portal_access', accesses);
      return { ok: true, access: nextRow };
    }

    if (action === 'create_request') {
      const requestToken = payload?.request_token || makeId();
      const row = {
        id: makeId(),
        empresa_id: payload?.empresa_id || getMockScopedUnitId(),
        responsavel_id: payload?.responsavel_id || '',
        orcamento_id: payload?.orcamento_id || '',
        appointment_id: payload?.appointment_id || '',
        status: 'pendente',
        access_link_token: requestToken,
        requested_channel: payload?.requested_channel || 'manual',
        source_context: payload?.source_context || {},
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
      requests.push(row);
      writeStorage('responsavel_approval_request', requests);
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      return {
        ok: true,
        request: row,
        approval_url: `${origin}/aprovacao-responsavel?token=${encodeURIComponent(requestToken)}`,
      };
    }

    const token = String(payload?.token || payload?.request_token || '').trim();
    const requestRow = requests.find((item) => item.access_link_token === token);
    if (!requestRow) {
      throw new Error('Solicitação de aprovação não localizada.');
    }

    if (action === 'get_context') {
      return { ok: true, request: requestRow, authenticated: false };
    }

    if (action === 'authenticate') {
      const login = String(payload?.login || '').trim().toLowerCase();
      const password = String(payload?.password || '').trim();
      const access = accesses.find((item) => item.responsavel_id === requestRow.responsavel_id && item.login === login && item.mock_password === password && item.ativo !== false);
      if (!access) {
        throw new Error('Login ou senha inválidos para este responsável.');
      }
      const sessionToken = makeId();
      const sessionRow = {
        id: makeId(),
        request_id: requestRow.id,
        access_id: access.id,
        session_token: sessionToken,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      };
      sessions.push(sessionRow);
      writeStorage('responsavel_approval_session', sessions);
      return { ok: true, session_token: sessionToken, request: requestRow, authenticated: true };
    }

    if (action === 'approve' || action === 'decline') {
      const sessionToken = String(payload?.session_token || '').trim();
      const session = sessions.find((item) => item.request_id === requestRow.id && item.session_token === sessionToken);
      if (!session) {
        throw new Error('Sessão de aprovação inválida ou expirada.');
      }

      const requestIndex = requests.findIndex((item) => item.id === requestRow.id);
      requests[requestIndex] = {
        ...requestRow,
        status: action === 'approve' ? 'aprovado' : 'recusado',
        decided_at: new Date().toISOString(),
      };
      writeStorage('responsavel_approval_request', requests);
      return { ok: true, request: requests[requestIndex] };
    }

    throw new Error('Ação de aprovação do responsável inválida.');
  },
  whatsappBridge: async (payload = {}) => {
    const action = String(payload?.action || '').trim();
    const rows = readStorage('whatsapp_bridge_connections');
    const ensureSeed = () => {
      if (rows.length) return;
      ['1', '2', '3'].forEach((slot) => {
        rows.push({
          id: makeId(),
          slot_key: slot,
          connection_name: slot === '1' ? 'Comercial' : slot === '2' ? 'Operação' : 'Monitoria',
          status: 'disconnected',
          last_qr_code: '',
          updated_at: new Date().toISOString(),
        });
      });
      writeStorage('whatsapp_bridge_connections', rows);
    };
    ensureSeed();

    if (action === 'list_connections') {
      return { ok: true, connections: rows };
    }

    const slotKey = String(payload?.slot_key || payload?.connection_key || '').trim();
    const connectionIndex = rows.findIndex((item) => item.slot_key === slotKey);
    if (connectionIndex < 0) {
      throw new Error('Conexão do WhatsApp não localizada.');
    }

    if (action === 'connect' || action === 'refresh_qr') {
      rows[connectionIndex] = {
        ...rows[connectionIndex],
        status: 'qr_pending',
        connection_name: payload?.connection_name || rows[connectionIndex].connection_name,
        last_qr_code: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><rect width='100%' height='100%' fill='white'/><rect x='24' y='24' width='192' height='192' rx='18' fill='#111827'/><text x='120' y='108' text-anchor='middle' fill='white' font-size='18' font-family='Arial'>QR Mock</text><text x='120' y='138' text-anchor='middle' fill='#93c5fd' font-size='14' font-family='Arial'>slot ${slotKey}</text></svg>`)}`,
        updated_at: new Date().toISOString(),
      };
      writeStorage('whatsapp_bridge_connections', rows);
      return { ok: true, connection: rows[connectionIndex] };
    }

    if (action === 'disconnect') {
      rows[connectionIndex] = {
        ...rows[connectionIndex],
        status: 'disconnected',
        last_qr_code: '',
        updated_at: new Date().toISOString(),
      };
      writeStorage('whatsapp_bridge_connections', rows);
      return { ok: true, connection: rows[connectionIndex] };
    }

    if (action === 'send_message') {
      rows[connectionIndex] = {
        ...rows[connectionIndex],
        status: rows[connectionIndex].status === 'disconnected' ? 'disconnected' : 'connected',
        last_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      writeStorage('whatsapp_bridge_connections', rows);
      return { ok: true, message_id: makeId(), connection: rows[connectionIndex] };
    }

    throw new Error('Ação do WhatsApp inválida.');
  },
  financeShadowSync: async (payload = {}) => {
    console.info('[mock] financeShadowSync called with', payload);
    return {
      obligations_enabled: false,
      charges_enabled: false,
      skipped: true,
      skipped_reason: 'mock client',
      created_obligations: 0,
      updated_obligations: 0,
      cancelled_obligations: 0,
      created_charges: 0,
      updated_charges: 0,
      created_charge_items: 0,
      deleted_charge_items: 0,
      charge_id: null,
    };
  },
  financeWalletAdminReadAccounts: async (payload = {}) => {
    if (!payload?.empresa_id) {
      throw new Error('empresa_id é obrigatório para leitura administrativa da carteira.');
    }

    if (!(getMockFlagValue('finance.wallet_balance_read_enabled', payload.empresa_id)
      || getMockFlagValue('finance.wallet_movements_enabled', payload.empresa_id))) {
      throw new Error(`Leitura administrativa da carteira desligada para a empresa ${payload.empresa_id}.`);
    }

    return getMockWalletAccountsByCompany(payload.empresa_id);
  },
  financeWalletAdminReadMovements: async (payload = {}) => {
    if (!payload?.empresa_id) {
      throw new Error('empresa_id é obrigatório para leitura administrativa dos movimentos.');
    }

    if (!getMockFlagValue('finance.wallet_movements_enabled', payload.empresa_id)) {
      throw new Error(`Feature flag finance.wallet_movements_enabled está desligada para a empresa ${payload.empresa_id}.`);
    }

    const carteiras = readStorage('Carteira');
    const contas = readStorage('CarteiraConta');
    const movimentos = readStorage('CarteiraMovimento')
      .filter((item) => item?.empresa_id === payload.empresa_id)
      .filter((item) => !payload?.carteira_conta_id || item?.carteira_conta_id === payload.carteira_conta_id)
      .sort((left, right) => new Date(right?.created_date || 0).getTime() - new Date(left?.created_date || 0).getTime())
      .slice(0, Math.max(1, Math.min(Number(payload?.limit) || 20, 100)));

    return movimentos.map((item) => {
      const conta = contas.find((entry) => entry?.id === item?.carteira_conta_id);
      const carteira = carteiras.find((entry) => entry?.id === conta?.carteira_id);
      return {
        movimento_id: item.id,
        carteira_conta_id: item.carteira_conta_id,
        carteira_id: conta?.carteira_id || null,
        empresa_id: item.empresa_id,
        carteira_nome: carteira?.nome_razao_social || carteira?.nome_fantasia || carteira?.id || conta?.carteira_id || '',
        tipo: item.tipo,
        natureza: item.natureza,
        origem: item.origem,
        valor: Number(item.valor || 0),
        referencia_amigavel: item.referencia_amigavel || '',
        descricao: item.descricao || '',
        saldo_anterior: Number(item.saldo_anterior || 0),
        saldo_final: Number(item.saldo_final || 0),
        transacao_id: item.transacao_id || null,
        usuario_id: item.usuario_id || null,
        created_date: item.created_date,
      };
    });
  },
  financeWalletAdminAuditAccounts: async (payload = {}) => {
    if (!payload?.empresa_id) {
      throw new Error('empresa_id é obrigatório para auditoria da carteira.');
    }

    if (!getMockFlagValue('finance.wallet_balance_read_enabled', payload.empresa_id)) {
      throw new Error(`Feature flag finance.wallet_balance_read_enabled está desligada para a empresa ${payload.empresa_id}.`);
    }

    return buildMockWalletAuditRows(payload.empresa_id);
  },
  financeWalletAdminApplyOperation: async (payload = {}) => {
    const contas = readStorage('CarteiraConta');
    const movimentos = readStorage('CarteiraMovimento');
    void movimentos;
    const contaIndex = contas.findIndex((item) => item?.id === payload?.carteira_conta_id);
    if (contaIndex < 0) throw new Error('carteira_conta n??o encontrada.');

    const conta = contas[contaIndex];
    const empresaId = conta?.empresa_id || null;
    const tipo = String(payload?.tipo || '').trim();
    const natureza = String(payload?.natureza || '').trim();

    if (tipo === 'entrada_direcionada') {
      if (!getMockFlagValue('finance.wallet_movements_enabled', empresaId)) {
        throw new Error(`Feature flag finance.wallet_movements_enabled est?? desligada para a empresa ${empresaId}.`);
      }
    } else {
      if (!getMockFlagValue('finance.wallet_manual_adjustments_enabled', empresaId)) {
        throw new Error(`Feature flag finance.wallet_manual_adjustments_enabled est?? desligada para a empresa ${empresaId}.`);
      }
      if (tipo === 'credito_manual' && !getMockFlagValue('finance.manual_credit_enabled', empresaId)) {
        throw new Error(`Feature flag finance.manual_credit_enabled est?? desligada para a empresa ${empresaId}.`);
      }
    }

    return applyMockWalletOperationCore({
      carteira_conta_id: payload?.carteira_conta_id,
      operacao_idempotencia: payload?.operacao_idempotencia,
      tipo,
      natureza,
      origem: payload?.origem || 'admin_manual',
      valor: payload?.valor,
      referencia_amigavel: payload?.referencia_amigavel || '',
      descricao: payload?.observacao || payload?.motivo || '',
      transacao_id: payload?.transacao_id || null,
      usuario_id: payload?.usuario_id || null,
      metadata: {
        ...(payload?.metadata || {}),
        motivo: payload?.motivo || '',
        observacao: payload?.observacao || null,
        admin_scope: 'sprint3_controlled_read',
      },
      permitir_saldo_negativo: true,
    });
  },
  financeWalletReconcileAccount: async (payload = {}) => {
    const contas = readStorage('CarteiraConta');
    const movimentos = readStorage('CarteiraMovimento');
    const reconciliacoes = readStorage('CarteiraReconciliacao');
    const contaIndex = contas.findIndex((item) => item?.id === payload?.carteira_conta_id);
    if (contaIndex < 0) throw new Error('carteira_conta não encontrada.');

    const conta = contas[contaIndex];
    const contaMovements = movimentos
      .filter((item) => item?.carteira_conta_id === conta.id)
      .sort((left, right) => new Date(right?.created_date || 0).getTime() - new Date(left?.created_date || 0).getTime());
    const saldoPersistido = Number(conta?.saldo_atual || 0);
    const saldoRecalculado = Number(contaMovements[0]?.saldo_final || 0);
    const saldoPorSoma = contaMovements.reduce((sum, item) => {
      const valor = Number(item?.valor || 0);
      return item?.natureza === 'saida' ? sum - valor : sum + valor;
    }, 0);
    const diferenca = Math.round((saldoPersistido - saldoRecalculado) * 100) / 100;
    const status = diferenca === 0 && Math.round((saldoPersistido - saldoPorSoma) * 100) / 100 === 0 ? 'ok' : 'divergente';
    const now = new Date().toISOString();
    const reconciliacao = {
      id: makeId(),
      empresa_id: conta.empresa_id,
      carteira_conta_id: conta.id,
      saldo_persistido: saldoPersistido,
      saldo_recalculado: saldoRecalculado,
      diferenca,
      status,
      acao_tomada: null,
      usuario_id: payload?.usuario_id || null,
      metadata: {
        saldo_por_soma: Math.round(saldoPorSoma * 100) / 100,
        saldo_por_ultimo_movimento: saldoRecalculado,
      },
      created_date: now,
    };
    reconciliacoes.push(reconciliacao);
    writeStorage('CarteiraReconciliacao', reconciliacoes);
    contas[contaIndex] = {
      ...conta,
      ultima_reconciliacao_em: now,
      updated_date: now,
      lock_version: Number(conta?.lock_version || 0) + 1,
    };
    writeStorage('CarteiraConta', contas);

    return {
      out_carteira_conta_id: conta.id,
      out_saldo_persistido: saldoPersistido,
      out_saldo_recalculado: saldoRecalculado,
      out_diferenca: diferenca,
      out_status: status,
      out_reconciliacao_id: reconciliacao.id,
    };
  },
  financeWalletBudgetReadContext: async (payload = {}) => {
    if (!payload?.empresa_id) {
      throw new Error('empresa_id é obrigatório para leitura da carteira no orçamento.');
    }

    const contas = readStorage('CarteiraConta');
    const flags = getMockWalletBudgetFlags(payload.empresa_id);
    const conta = contas.find((item) =>
      item?.empresa_id === payload.empresa_id
      && (!payload?.carteira_id || item?.carteira_id === payload.carteira_id)
    ) || null;
    const latestReconciliation = conta ? getMockLatestWalletReconciliation(conta.id) : null;

    return {
      carteira_conta_id: conta?.id || null,
      carteira_id: conta?.carteira_id || payload?.carteira_id || null,
      empresa_id: payload.empresa_id,
      saldo_atual: Number(conta?.saldo_atual || 0),
      saldo_positivo_disponivel: Math.max(Number(conta?.saldo_atual || 0), 0),
      latest_reconciliation_status: latestReconciliation?.status || null,
      latest_reconciliation_diff: Number(latestReconciliation?.diferenca || 0),
      ...flags,
    };
  },
  financePreviewBudgetConsumption: async (payload = {}) => {
    if (!payload?.carteira_conta_id) {
      throw new Error('carteira_conta_id é obrigatório para a simulação de consumo.');
    }

    const contas = readStorage('CarteiraConta');
    const conta = contas.find((item) => item?.id === payload.carteira_conta_id);
    if (!conta) {
      throw new Error('carteira_conta não encontrada.');
    }

    if (!getMockFlagValue('finance.chronological_consumption_enabled', conta.empresa_id)) {
      throw new Error(`Feature flag finance.chronological_consumption_enabled está desligada para a empresa ${conta.empresa_id}.`);
    }

    const obrigacoes = readStorage('ObrigacaoFinanceira')
      .filter((item) => item?.carteira_conta_id === conta.id)
      .filter((item) => ['aberta', 'parcial', 'vencida'].includes(item?.status))
      .filter((item) => Number(item?.valor_em_aberto || 0) > 0);

    return simulateBudgetConsumptionPreview({
      saldoAtual: Number(conta?.saldo_atual || 0),
      valorOrcamentoTotal: Number(payload?.valor_orcamento_total || 0),
      valorSaldoSolicitado: payload?.valor_saldo_solicitado,
      openObligations: obrigacoes,
      previewItems: Array.isArray(payload?.preview_items) ? payload.preview_items : [],
    });
  },
  financeRegisterBudgetAuthorization: async (payload = {}) => {
    if (!payload?.carteira_conta_id) {
      throw new Error('carteira_conta_id é obrigatório para registrar a autorização do orçamento.');
    }
    if (!payload?.orcamento_id) {
      throw new Error('orcamento_id é obrigatório para registrar a autorização do orçamento.');
    }
    if (!String(payload?.motivo || '').trim()) {
      throw new Error('motivo é obrigatório para registrar a autorização do orçamento.');
    }
    if (!payload?.vencimento_novo) {
      throw new Error('vencimento_novo é obrigatório para registrar a autorização do orçamento.');
    }

    const contas = readStorage('CarteiraConta');
    const autorizacoes = readStorage('AutorizacaoFinanceira');
    const conta = contas.find((item) => item?.id === payload.carteira_conta_id);
    if (!conta) {
      throw new Error('carteira_conta não encontrada.');
    }

    if (!getMockFlagValue('finance.budget_authorization_enabled', conta.empresa_id)) {
      throw new Error(`Feature flag finance.budget_authorization_enabled está desligada para a empresa ${conta.empresa_id}.`);
    }

    if (!getMockFlagValue('finance.allow_negative_wallet_with_authorization', conta.empresa_id)) {
      throw new Error(`Feature flag finance.allow_negative_wallet_with_authorization está desligada para a empresa ${conta.empresa_id}.`);
    }

    const sourceKey = `budget_authorization|orcamento|${payload.orcamento_id}|carteira_conta|${payload.carteira_conta_id}`;
    const existing = autorizacoes.find((item) => item?.empresa_id === conta.empresa_id && item?.source_key === sourceKey);
    if (existing) {
      return {
        autorizacao_financeira_id: existing.id,
        carteira_conta_id: existing.carteira_conta_id,
        orcamento_id: existing.orcamento_id,
        source_key: sourceKey,
        reused: true,
      };
    }

    const now = new Date().toISOString();
    const row = {
      id: makeId(),
      empresa_id: conta.empresa_id,
      carteira_conta_id: conta.id,
      orcamento_id: payload.orcamento_id,
      tipo: 'liberacao_sem_pagamento',
      motivo: String(payload.motivo).trim(),
      vencimento_novo: payload.vencimento_novo,
      status: 'ativa',
      usuario_id: payload?.usuario_id || null,
      source_key: sourceKey,
      lock_version: 0,
      metadata: {
        ...(payload?.metadata || {}),
        source: 'sprint4_budget_authorization',
      },
      created_date: now,
      updated_date: now,
    };

    autorizacoes.push(row);
    writeStorage('AutorizacaoFinanceira', autorizacoes);

    return {
      autorizacao_financeira_id: row.id,
      carteira_conta_id: row.carteira_conta_id,
      orcamento_id: row.orcamento_id,
      source_key: sourceKey,
      reused: false,
    };
  },
  financeApproveBudgetWithAuthorization: async (payload = {}) => {
    if (!payload?.orcamento_id) {
      throw new Error('orcamento_id é obrigatório para a aprovação atômica do orçamento.');
    }

    const orcamentos = readStorage('Orcamento');
    const orcamentoIndex = orcamentos.findIndex((item) => item?.id === payload.orcamento_id);
    if (orcamentoIndex < 0) {
      throw new Error('orçamento não encontrado.');
    }

    const autorizacao = await mockFunctions.financeRegisterBudgetAuthorization(payload);
    const now = new Date().toISOString();
    orcamentos[orcamentoIndex] = {
      ...orcamentos[orcamentoIndex],
      status: 'aprovado',
      updated_date: now,
    };
    writeStorage('Orcamento', orcamentos);

    return {
      orcamento_id: payload.orcamento_id,
      orcamento_status: 'aprovado',
      autorizacao_financeira_id: autorizacao.autorizacao_financeira_id,
      authorization_source_key: autorizacao.source_key,
      authorization_reused: Boolean(autorizacao.reused),
    };
  },
};

mockFunctions.financeWalletAdminApplyOperation = async (payload = {}) => {
  const contas = readStorage('CarteiraConta');
  const contaIndex = contas.findIndex((item) => item?.id === payload?.carteira_conta_id);
  if (contaIndex < 0) throw new Error('carteira_conta não encontrada.');

  const conta = contas[contaIndex];
  const empresaId = conta?.empresa_id || null;
  const tipo = String(payload?.tipo || '').trim();
  const natureza = String(payload?.natureza || '').trim();

  if (tipo === 'entrada_direcionada') {
    if (!getMockFlagValue('finance.wallet_movements_enabled', empresaId)) {
      throw new Error(`Feature flag finance.wallet_movements_enabled está desligada para a empresa ${empresaId}.`);
    }
  } else {
    if (!getMockFlagValue('finance.wallet_manual_adjustments_enabled', empresaId)) {
      throw new Error(`Feature flag finance.wallet_manual_adjustments_enabled está desligada para a empresa ${empresaId}.`);
    }
    if (tipo === 'credito_manual' && !getMockFlagValue('finance.manual_credit_enabled', empresaId)) {
      throw new Error(`Feature flag finance.manual_credit_enabled está desligada para a empresa ${empresaId}.`);
    }
  }

  return applyMockWalletOperationCore({
    carteira_conta_id: payload?.carteira_conta_id,
    operacao_idempotencia: payload?.operacao_idempotencia,
    tipo,
    natureza,
    origem: payload?.origem || 'admin_manual',
    valor: payload?.valor,
    referencia_amigavel: payload?.referencia_amigavel || '',
    descricao: payload?.observacao || payload?.motivo || '',
    transacao_id: payload?.transacao_id || null,
    usuario_id: payload?.usuario_id || null,
    metadata: {
      ...(payload?.metadata || {}),
      motivo: payload?.motivo || '',
      observacao: payload?.observacao || null,
      admin_scope: 'sprint3_controlled_read',
    },
    permitir_saldo_negativo: true,
  });
};

mockFunctions.financeApplyCompensatoryCredit = async (payload = {}) => {
  if (!payload?.carteira_conta_id) {
    throw new Error('carteira_conta_id é obrigatório para aplicar crédito compensatório.');
  }
  if (roundMockCurrency(payload?.valor) <= 0) {
    throw new Error('valor deve ser maior que zero para crédito compensatório.');
  }
  if (!String(payload?.motivo || '').trim()) {
    throw new Error('motivo é obrigatório para crédito compensatório.');
  }

  const conta = readStorage('CarteiraConta').find((item) => item?.id === payload?.carteira_conta_id);
  if (!conta) {
    throw new Error('carteira_conta não encontrada.');
  }

  if (!getMockFlagValue('finance.compensatory_credit_enabled', conta.empresa_id)) {
    throw new Error(`Feature flag finance.compensatory_credit_enabled está desligada para a empresa ${conta.empresa_id}.`);
  }

  return applyMockWalletOperationCore({
    carteira_conta_id: payload?.carteira_conta_id,
    operacao_idempotencia: payload?.operacao_idempotencia,
    tipo: 'credito_compensatorio',
    natureza: 'entrada',
    origem: payload?.origem || 'cancellation_compensation',
    valor: payload?.valor,
    referencia_amigavel: payload?.referencia_amigavel || 'Crédito compensatório',
    descricao: payload?.descricao || payload?.motivo || 'Crédito compensatório',
    orcamento_id: payload?.orcamento_id || null,
    appointment_id: payload?.appointment_id || null,
    obrigacao_id: payload?.obrigacao_id || null,
    usuario_id: payload?.usuario_id || null,
    metadata: {
      ...(payload?.metadata || {}),
      motivo: payload?.motivo || '',
      compensatory_credit_scope: 'sprint5_cancellation_v2',
    },
    permitir_saldo_negativo: true,
  });
};

mockFunctions.financeProcessCancellationV2 = async (payload = {}) => {
  if (!payload?.carteira_conta_id) {
    throw new Error('carteira_conta_id é obrigatório para cancelamento V2.');
  }
  if (!payload?.obrigacao_id) {
    throw new Error('obrigacao_id é obrigatório para cancelamento V2.');
  }
  if (!String(payload?.motivo || '').trim()) {
    throw new Error('motivo é obrigatório para cancelamento V2.');
  }

  const contas = readStorage('CarteiraConta');
  const cancelamentos = readStorage('CancelamentoFinanceiro');
  const obrigacoes = readStorage('ObrigacaoFinanceira');
  const conta = contas.find((item) => item?.id === payload?.carteira_conta_id);
  if (!conta) {
    throw new Error('carteira_conta não encontrada.');
  }

  if (!getMockFlagValue('finance.cancellation_v2_enabled', conta.empresa_id)) {
    throw new Error(`Feature flag finance.cancellation_v2_enabled está desligada para a empresa ${conta.empresa_id}.`);
  }

  const obrigacaoIndex = obrigacoes.findIndex((item) =>
    item?.id === payload?.obrigacao_id && item?.carteira_conta_id === conta.id
  );
  if (obrigacaoIndex < 0) {
    throw new Error('obrigação financeira não encontrada para a carteira selecionada.');
  }

  const obrigacao = obrigacoes[obrigacaoIndex];
  const origemCancelamento = String(payload?.origem_cancelamento || 'cliente').trim().toLowerCase();
  if (!['dogcity', 'cliente', 'natural'].includes(origemCancelamento)) {
    throw new Error(`origem_cancelamento inválida: ${origemCancelamento}.`);
  }

  const sourceKey = buildMockCancellationSourceKey(obrigacao.id, origemCancelamento);
  const existing = cancelamentos.find((item) =>
    item?.empresa_id === conta.empresa_id && item?.source_key === sourceKey
  );
  if (existing) {
    return buildMockCancellationResult({
      ...existing,
      obrigacao_status: obrigacoes.find((item) => item?.id === existing.obrigacao_id)?.status || obrigacao.status,
      reused: true,
    });
  }

  const valorFinal = roundMockCurrency(obrigacao?.valor_final || 0);
  const valorEmAberto = roundMockCurrency(obrigacao?.valor_em_aberto || 0);
  const valorPagoAteAgora = roundMockCurrency(Math.max(valorFinal - valorEmAberto, 0));
  const aplicarMulta = origemCancelamento === 'cliente' && Boolean(payload?.aplicar_multa);
  const percentualMulta = aplicarMulta ? roundMockCurrency(payload?.percentual_multa || 0) : 0;
  const valorMulta = aplicarMulta ? roundMockCurrency((valorFinal * percentualMulta) / 100) : 0;
  const gerarCreditoDogCity = origemCancelamento === 'dogcity' && Boolean(payload?.gerar_credito_compensatorio);
  const valorCreditoDogCity = gerarCreditoDogCity
    ? roundMockCurrency(payload?.valor_credito_compensatorio || 0)
    : 0;
  const precisaCreditoPorPagamento = origemCancelamento === 'cliente' && valorPagoAteAgora > 0;

  if (aplicarMulta && !getMockFlagValue('finance.cancellation_penalty_enabled', conta.empresa_id)) {
    throw new Error(`Feature flag finance.cancellation_penalty_enabled está desligada para a empresa ${conta.empresa_id}.`);
  }

  if (gerarCreditoDogCity && valorCreditoDogCity <= 0) {
    throw new Error('Informe um valor maior que zero para o crédito compensatório.');
  }

  if ((gerarCreditoDogCity || precisaCreditoPorPagamento) && !getMockFlagValue('finance.compensatory_credit_enabled', conta.empresa_id)) {
    throw new Error(`Feature flag finance.compensatory_credit_enabled está desligada para a empresa ${conta.empresa_id}.`);
  }

  let multaMovimentoId = null;
  let creditoMovimentoId = null;
  let valorCreditoGerado = 0;

  if (valorMulta > 0) {
    const penaltyOperation = applyMockWalletOperationCore({
      carteira_conta_id: conta.id,
      operacao_idempotencia: `${sourceKey}|penalty`,
      tipo: 'multa',
      natureza: 'saida',
      origem: 'cancellation_penalty',
      valor: valorMulta,
      referencia_amigavel: 'Multa de cancelamento',
      descricao: String(payload?.motivo || '').trim(),
      orcamento_id: payload?.orcamento_id || obrigacao?.orcamento_id || null,
      appointment_id: payload?.appointment_id || obrigacao?.appointment_id || null,
      obrigacao_id: obrigacao.id,
      usuario_id: payload?.usuario_id || null,
      metadata: {
        ...(payload?.metadata || {}),
        motivo: String(payload?.motivo || '').trim(),
        cancellation_origin: origemCancelamento,
        penalty_percentual: percentualMulta,
      },
      permitir_saldo_negativo: Boolean(payload?.permitir_saldo_negativo_multa)
        && getMockFlagValue('finance.allow_negative_wallet_with_authorization', conta.empresa_id),
    });
    multaMovimentoId = penaltyOperation.movimento_id || null;
  }

  if (gerarCreditoDogCity) {
    const creditOperation = await mockFunctions.financeApplyCompensatoryCredit({
      carteira_conta_id: conta.id,
      operacao_idempotencia: `${sourceKey}|credit|dogcity`,
      valor: valorCreditoDogCity,
      motivo: String(payload?.motivo || '').trim(),
      referencia_amigavel: 'Crédito compensatório',
      descricao: 'Crédito compensatório por cancelamento DogCity',
      orcamento_id: payload?.orcamento_id || obrigacao?.orcamento_id || null,
      appointment_id: payload?.appointment_id || obrigacao?.appointment_id || null,
      obrigacao_id: obrigacao.id,
      usuario_id: payload?.usuario_id || null,
      metadata: {
        ...(payload?.metadata || {}),
        cancellation_origin: origemCancelamento,
        compensation_reason: 'dogcity_failure',
      },
    });
    creditoMovimentoId = creditOperation.movimento_id || null;
    valorCreditoGerado = valorCreditoDogCity;
  } else if (precisaCreditoPorPagamento) {
    const creditOperation = await mockFunctions.financeApplyCompensatoryCredit({
      carteira_conta_id: conta.id,
      operacao_idempotencia: `${sourceKey}|credit|cliente_paid`,
      valor: valorPagoAteAgora,
      motivo: String(payload?.motivo || '').trim(),
      referencia_amigavel: 'Crédito por cancelamento do cliente',
      descricao: 'Crédito do valor já quitado em cancelamento pelo cliente',
      orcamento_id: payload?.orcamento_id || obrigacao?.orcamento_id || null,
      appointment_id: payload?.appointment_id || obrigacao?.appointment_id || null,
      obrigacao_id: obrigacao.id,
      usuario_id: payload?.usuario_id || null,
      metadata: {
        ...(payload?.metadata || {}),
        cancellation_origin: origemCancelamento,
        compensation_reason: 'client_cancel_paid_portion',
      },
    });
    creditoMovimentoId = creditOperation.movimento_id || null;
    valorCreditoGerado = valorPagoAteAgora;
  }

  const now = new Date().toISOString();
  const nextObrigacaoStatus = valorCreditoGerado > 0 ? 'estornada' : 'cancelada';
  obrigacoes[obrigacaoIndex] = {
    ...obrigacao,
    valor_em_aberto: 0,
    status: nextObrigacaoStatus,
    cancelado_motivo: String(payload?.motivo || '').trim(),
    metadata: {
      ...(obrigacao?.metadata || {}),
      cancellation_v2: {
        origem_cancelamento: origemCancelamento,
        valor_pago_ate_agora: valorPagoAteAgora,
        valor_credito_gerado: valorCreditoGerado,
        valor_multa_gerado: valorMulta,
        processado_em: now,
      },
    },
    updated_date: now,
    lock_version: Number(obrigacao?.lock_version || 0) + 1,
  };
  writeStorage('ObrigacaoFinanceira', obrigacoes);

  const row = {
    id: makeId(),
    empresa_id: conta.empresa_id,
    carteira_conta_id: conta.id,
    obrigacao_id: obrigacao.id,
    orcamento_id: payload?.orcamento_id || obrigacao?.orcamento_id || null,
    appointment_id: payload?.appointment_id || obrigacao?.appointment_id || null,
    origem_cancelamento: origemCancelamento,
    aplicar_multa: aplicarMulta,
    percentual_multa: percentualMulta,
    valor_multa: valorMulta,
    gerar_credito_compensatorio: gerarCreditoDogCity || precisaCreditoPorPagamento,
    valor_credito_compensatorio: valorCreditoGerado,
    multa_movimento_id: multaMovimentoId,
    credito_movimento_id: creditoMovimentoId,
    source_key: sourceKey,
    status: 'processado',
    motivo: String(payload?.motivo || '').trim(),
    usuario_id: payload?.usuario_id || null,
    lock_version: 0,
    metadata: {
      ...(payload?.metadata || {}),
      valor_pago_ate_agora: valorPagoAteAgora,
      processado_em: now,
    },
    created_date: now,
    updated_date: now,
    obrigacao_status: nextObrigacaoStatus,
    valor_pago_ate_agora: valorPagoAteAgora,
    reused: false,
  };
  cancelamentos.push(row);
  writeStorage('CancelamentoFinanceiro', cancelamentos);

  return buildMockCancellationResult(row);
};

mockFunctions.financeProcessBudgetCancellationV2 = async (payload = {}) => {
  if (!payload?.orcamento_id) {
    throw new Error('orcamento_id é obrigatório para cancelamento V2 do orçamento.');
  }
  if (!payload?.carteira_conta_id) {
    throw new Error('carteira_conta_id é obrigatório para cancelamento V2 do orçamento.');
  }

  const orcamentos = readStorage('Orcamento');
  const obrigacoes = readStorage('ObrigacaoFinanceira');
  const conta = readStorage('CarteiraConta').find((item) => item?.id === payload?.carteira_conta_id);
  if (!conta) {
    throw new Error('carteira_conta não encontrada.');
  }

  if (!getMockFlagValue('finance.cancellation_v2_enabled', conta.empresa_id)) {
    throw new Error(`Feature flag finance.cancellation_v2_enabled está desligada para a empresa ${conta.empresa_id}.`);
  }

  const orcamentoIndex = orcamentos.findIndex((item) =>
    item?.id === payload?.orcamento_id && item?.cliente_id === conta.carteira_id
  );
  if (orcamentoIndex < 0) {
    throw new Error('orçamento não encontrado para a carteira selecionada.');
  }

  const targetObligations = obrigacoes.filter((item) =>
    item?.orcamento_id === payload?.orcamento_id
    && item?.carteira_conta_id === conta.id
    && ['aberta', 'parcial', 'vencida', 'quitada'].includes(item?.status)
  );

  let cancelamentosProcessados = 0;
  let cancelamentosReutilizados = 0;
  let totalCreditoGerado = 0;
  let totalMultaGerada = 0;

  for (const obrigacao of targetObligations) {
    const result = await mockFunctions.financeProcessCancellationV2({
      carteira_conta_id: conta.id,
      obrigacao_id: obrigacao.id,
      orcamento_id: payload?.orcamento_id,
      appointment_id: obrigacao?.appointment_id || null,
      origem_cancelamento: payload?.origem_cancelamento || 'cliente',
      aplicar_multa: payload?.aplicar_multa,
      percentual_multa: payload?.percentual_multa,
      gerar_credito_compensatorio: payload?.gerar_credito_compensatorio,
      valor_credito_compensatorio: payload?.valor_credito_compensatorio,
      permitir_saldo_negativo_multa: payload?.permitir_saldo_negativo_multa,
      motivo: payload?.motivo,
      usuario_id: payload?.usuario_id || null,
      metadata: payload?.metadata || {},
    });
    if (result?.reused) cancelamentosReutilizados += 1;
    else cancelamentosProcessados += 1;
    totalCreditoGerado = roundMockCurrency(totalCreditoGerado + Number(result?.valor_credito_gerado || 0));
    totalMultaGerada = roundMockCurrency(totalMultaGerada + Number(result?.valor_multa_gerado || 0));
  }

  orcamentos[orcamentoIndex] = {
    ...orcamentos[orcamentoIndex],
    status: 'cancelado',
    updated_date: new Date().toISOString(),
  };
  writeStorage('Orcamento', orcamentos);

  return {
    orcamento_id: payload?.orcamento_id,
    orcamento_status: 'cancelado',
    cancelamentos_processados: cancelamentosProcessados,
    cancelamentos_reutilizados: cancelamentosReutilizados,
    total_credito_gerado: totalCreditoGerado,
    total_multa_gerada: totalMultaGerada,
  };
};

mockFunctions.financeReportsV2Context = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  const snapshots = readStorage('FinanceSnapshot').filter((item) => item?.empresa_id === empresaId);
  const flags = getMockReportsFlags(empresaId);
  const latestSnapshot = snapshots
    .slice()
    .sort((left, right) => new Date(right?.created_date || 0).getTime() - new Date(left?.created_date || 0).getTime())[0];

  return {
    empresa_id: empresaId,
    ...flags,
    snapshots_count: snapshots.length,
    latest_snapshot_created_at: latestSnapshot?.created_date || null,
  };
};

mockFunctions.financeReportsV2Summary = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  const flags = getMockReportsFlags(empresaId);
  if (!flags.reports_v2_enabled) {
    throw new Error(`Feature flag finance.reports_v2_enabled estÃ¡ desligada para a empresa ${empresaId}.`);
  }

  const generationRows = flags.financial_competence_enabled
    ? buildMockReportItemsByType(empresaId, 'geracao_recursos', payload?.periodo_inicio || null, payload?.periodo_fim || null)
    : [];
  const billingRows = flags.financial_competence_enabled
    ? buildMockReportItemsByType(empresaId, 'faturamento_real', payload?.periodo_inicio || null, payload?.periodo_fim || null)
    : [];
  const walletRows = buildMockReportItemsByType(empresaId, 'carteira');
  const servicesRows = flags.financial_competence_enabled
    ? buildMockReportItemsByType(empresaId, 'servicos_prestados', payload?.periodo_inicio || null, payload?.periodo_fim || null)
    : [];

  return {
    empresa_id: empresaId,
    periodo_inicio: payload?.periodo_inicio || null,
    periodo_fim: payload?.periodo_fim || null,
    ...buildFinanceV2Summary({
      walletRows,
      generationRows,
      billingRows,
      servicesRows,
    }),
  };
};

mockFunctions.financeReportGenerationResources = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  const flags = getMockReportsFlags(empresaId);
  if (!flags.reports_v2_enabled) {
    throw new Error(`Feature flag finance.reports_v2_enabled está desligada para a empresa ${empresaId}.`);
  }
  if (!flags.financial_competence_enabled) {
    throw new Error(`Feature flag finance.financial_competence_enabled está desligada para a empresa ${empresaId}.`);
  }
  return buildMockReportItemsByType(empresaId, 'geracao_recursos', payload?.periodo_inicio || null, payload?.periodo_fim || null);
};

mockFunctions.financeReportRealBilling = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  const flags = getMockReportsFlags(empresaId);
  if (!flags.reports_v2_enabled) {
    throw new Error(`Feature flag finance.reports_v2_enabled está desligada para a empresa ${empresaId}.`);
  }
  if (!flags.financial_competence_enabled) {
    throw new Error(`Feature flag finance.financial_competence_enabled está desligada para a empresa ${empresaId}.`);
  }
  return buildMockReportItemsByType(empresaId, 'faturamento_real', payload?.periodo_inicio || null, payload?.periodo_fim || null);
};

mockFunctions.financeReportWallet = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  const flags = getMockReportsFlags(empresaId);
  if (!flags.reports_v2_enabled) {
    throw new Error(`Feature flag finance.reports_v2_enabled está desligada para a empresa ${empresaId}.`);
  }
  return buildMockReportItemsByType(empresaId, 'carteira');
};

mockFunctions.financeReportServicesProvided = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  const flags = getMockReportsFlags(empresaId);
  if (!flags.reports_v2_enabled) {
    throw new Error(`Feature flag finance.reports_v2_enabled está desligada para a empresa ${empresaId}.`);
  }
  if (!flags.financial_competence_enabled) {
    throw new Error(`Feature flag finance.financial_competence_enabled está desligada para a empresa ${empresaId}.`);
  }
  return buildMockReportItemsByType(empresaId, 'servicos_prestados', payload?.periodo_inicio || null, payload?.periodo_fim || null);
};

mockFunctions.financeSnapshotCreate = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  const tipo = String(payload?.tipo || '').trim();
  const competencia = String(payload?.competencia || '').trim();
  const flags = getMockReportsFlags(empresaId);

  if (!flags.snapshots_enabled) {
    throw new Error(`Feature flag finance.snapshots_enabled está desligada para a empresa ${empresaId}.`);
  }
  if (!flags.reports_v2_enabled) {
    throw new Error(`Feature flag finance.reports_v2_enabled está desligada para a empresa ${empresaId}.`);
  }
  if (!tipo || !competencia) {
    throw new Error('tipo e competencia são obrigatórios para gerar snapshot.');
  }

  const snapshots = readStorage('FinanceSnapshot');
  const existing = snapshots.find((item) =>
    item?.empresa_id === empresaId
    && item?.tipo === tipo
    && item?.competencia === competencia
  );
  if (existing) {
    return {
      snapshot_id: existing.id,
      empresa_id: empresaId,
      competencia,
      tipo,
      status: 'reutilizado',
      hash_checksum: existing.hash_checksum,
      item_count: Number(existing?.payload?.summary?.count || 0),
      total_valor: roundMockCurrency(existing?.payload?.summary?.total_valor || 0),
      created_date: existing.created_date,
      reused: true,
    };
  }

  const items = buildMockReportItemsByType(
    empresaId,
    tipo,
    payload?.periodo_inicio || null,
    payload?.periodo_fim || null,
  );
  const snapshotPayload = buildSnapshotPayload(tipo, items, {
    competencia,
    periodo_inicio: payload?.periodo_inicio || null,
    periodo_fim: payload?.periodo_fim || null,
    ...(payload?.metadata || {}),
  });
  const checksum = createMockChecksum(snapshotPayload);
  const now = new Date().toISOString();
  const row = {
    id: makeId(),
    empresa_id: empresaId,
    competencia,
    periodo_inicio: payload?.periodo_inicio || null,
    periodo_fim: payload?.periodo_fim || null,
    tipo,
    status: 'fechado',
    source_key: `finance_snapshot|${empresaId}|${competencia}|${tipo}`,
    hash_checksum: checksum,
    payload: snapshotPayload,
    usuario_id: payload?.usuario_id || null,
    metadata: payload?.metadata || {},
    lock_version: 0,
    created_date: now,
    updated_date: now,
  };
  snapshots.push(row);
  writeStorage('FinanceSnapshot', snapshots);

  return {
    snapshot_id: row.id,
    empresa_id: empresaId,
    competencia,
    tipo,
    status: 'fechado',
    hash_checksum: checksum,
    item_count: Number(snapshotPayload?.summary?.count || 0),
    total_valor: roundMockCurrency(snapshotPayload?.summary?.total_valor || 0),
    created_date: row.created_date,
    reused: false,
  };
};

mockFunctions.financeSnapshotCompare = async (payload = {}) => {
  const snapshotId = payload?.snapshot_id;
  const snapshots = readStorage('FinanceSnapshot');
  const deltas = readStorage('FinanceSnapshotDelta');
  const snapshot = snapshots.find((item) => item?.id === snapshotId);
  if (!snapshot) {
    throw new Error('snapshot não encontrado.');
  }

  const flags = getMockReportsFlags(snapshot.empresa_id);
  if (!flags.snapshots_enabled) {
    throw new Error(`Feature flag finance.snapshots_enabled está desligada para a empresa ${snapshot.empresa_id}.`);
  }

  const currentItems = buildMockReportItemsByType(
    snapshot.empresa_id,
    snapshot.tipo,
    snapshot.periodo_inicio || null,
    snapshot.periodo_fim || null,
  );
  const currentPayload = buildSnapshotPayload(snapshot.tipo, currentItems, {
    competencia: snapshot.competencia,
    periodo_inicio: snapshot.periodo_inicio,
    periodo_fim: snapshot.periodo_fim,
    ...(payload?.metadata || {}),
  });
  const differences = compareSnapshotPayloads(snapshot.payload, currentPayload);
  const comparisonRunId = makeId();
  const now = new Date().toISOString();

  const rows = differences.map((item) => ({
    id: makeId(),
    snapshot_id: snapshot.id,
    comparison_run_id: comparisonRunId,
    empresa_id: snapshot.empresa_id,
    competencia: snapshot.competencia,
    tipo: snapshot.tipo,
    delta_kind: item.delta_kind,
    entity_key: item.entity_key,
    entity_label: item.entity_label,
    valor_anterior: roundMockCurrency(item.valor_anterior || 0),
    valor_atual: roundMockCurrency(item.valor_atual || 0),
    impacto_financeiro: roundMockCurrency(item.impacto_financeiro || 0),
    payload_before: item.payload_before || null,
    payload_after: item.payload_after || null,
    usuario_id: payload?.usuario_id || null,
    metadata: payload?.metadata || {},
    created_date: now,
  }));

  writeStorage('FinanceSnapshotDelta', [...deltas, ...rows]);
  return rows;
};

mockFunctions.financeSnapshotList = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  const flags = getMockReportsFlags(empresaId);
  if (!flags.reports_v2_enabled) {
    throw new Error(`Feature flag finance.reports_v2_enabled está desligada para a empresa ${empresaId}.`);
  }
  return readStorage('FinanceSnapshot')
    .filter((item) => item?.empresa_id === empresaId)
    .filter((item) => !payload?.tipo || item?.tipo === payload?.tipo)
    .sort((left, right) => new Date(right?.created_date || 0).getTime() - new Date(left?.created_date || 0).getTime())
    .slice(0, Math.max(Number(payload?.limit || 20), 1))
    .map((item) => ({
      id: item.id,
      empresa_id: item.empresa_id,
      competencia: item.competencia,
      periodo_inicio: item.periodo_inicio,
      periodo_fim: item.periodo_fim,
      tipo: item.tipo,
      status: item.status,
      hash_checksum: item.hash_checksum,
      item_count: Number(item?.payload?.summary?.count || 0),
      total_valor: roundMockCurrency(item?.payload?.summary?.total_valor || 0),
      usuario_id: item.usuario_id || null,
      created_date: item.created_date,
    }));
};

mockFunctions.financeSnapshotDeltaList = async (payload = {}) => {
  if (!payload?.snapshot_id) {
    throw new Error('snapshot_id é obrigatório para listar deltas.');
  }
  return readStorage('FinanceSnapshotDelta')
    .filter((item) => item?.snapshot_id === payload?.snapshot_id)
    .sort((left, right) => new Date(right?.created_date || 0).getTime() - new Date(left?.created_date || 0).getTime())
    .slice(0, Math.max(Number(payload?.limit || 200), 1));
};

mockFunctions.financeCommissionReadContext = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  const flags = getMockCommissionFlags(empresaId);
  const eventos = readStorage('ComissaoEvento').filter((item) => item?.empresa_id === empresaId);
  return {
    empresa_id: empresaId,
    ...flags,
    events_count: eventos.length,
    granted_count: eventos.filter((item) => item?.status === 'concedida').length,
    latest_event_created_at: eventos
      .slice()
      .sort((left, right) => new Date(right?.created_date || 0).getTime() - new Date(left?.created_date || 0).getTime())[0]?.created_date || null,
  };
};

mockFunctions.financeCommissionList = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  const flags = getMockCommissionFlags(empresaId);
  if (!flags.commission_visualization_enabled) {
    throw new Error(`Feature flag finance.commission_visualization_enabled está desligada para a empresa ${empresaId}.`);
  }
  return getMockCommissionListRows(empresaId, payload?.status || null, payload?.limit || 100);
};

mockFunctions.financeProcessCommissionForObrigacao = async (payload = {}) => {
  const obrigacaoId = payload?.obrigacao_id;
  if (!obrigacaoId) {
    throw new Error('obrigacao_id é obrigatório para processar comissão.');
  }

  const obrigacoes = readStorage('ObrigacaoFinanceira');
  const obrigacao = obrigacoes.find((item) => item?.id === obrigacaoId);
  if (!obrigacao) {
    throw new Error('obrigação financeira não encontrada.');
  }

  const empresaId = obrigacao?.empresa_id || payload?.empresa_id || getMockScopedUnitId();
  const flags = getMockCommissionFlags(empresaId);
  if (!flags.commission_enabled) {
    throw new Error(`Feature flag finance.commission_enabled está desligada para a empresa ${empresaId}.`);
  }

  const source = resolveMockCommissionSource(obrigacao);
  const valorBase = roundCommissionCurrency(obrigacao?.valor_final || 0);
  const sourceKey = buildCommissionSourceKey({
    obrigacaoId: obrigacao.id,
    vendedorUserId: source.vendedor_user_id || 'missing',
  });

  if (!isCommissionEligible({
    obrigacaoStatus: obrigacao?.status,
    vendedorUserId: source.vendedor_user_id,
    percentual: source.percentual,
    valorBase,
  })) {
    return {
      comissao_evento_id: null,
      obrigacao_id: obrigacao.id,
      source_key: sourceKey,
      reused: false,
      skipped: true,
      skip_reason: !source.vendedor_user_id
        ? 'seller_missing'
        : String(obrigacao?.status || '').trim().toLowerCase() !== 'quitada'
          ? 'obligation_not_paid'
          : source.percentual <= 0
            ? 'commission_percent_missing'
            : 'not_eligible',
      valor_base: valorBase,
      valor_comissao: 0,
      vendedor_user_id: source.vendedor_user_id || null,
      status: null,
    };
  }

  const comissoes = readStorage('ComissaoEvento');
  const existing = comissoes.find((item) => item?.empresa_id === empresaId && item?.source_key === sourceKey);
  if (existing) {
    return {
      comissao_evento_id: existing.id,
      obrigacao_id: obrigacao.id,
      source_key: sourceKey,
      reused: true,
      skipped: false,
      skip_reason: null,
      valor_base: Number(existing?.valor_base || 0),
      valor_comissao: Number(existing?.valor_comissao || 0),
      vendedor_user_id: existing?.vendedor_user_id || source.vendedor_user_id,
      status: existing?.status || 'concedida',
    };
  }

  const now = new Date().toISOString();
  const row = {
    id: makeId(),
    empresa_id: empresaId,
    vendedor_user_id: source.vendedor_user_id,
    orcamento_id: source.orcamento_id,
    plan_config_id: source.plan_config_id,
    recurring_package_id: source.recurring_package_id,
    obrigacao_id: obrigacao.id,
    cobranca_financeira_id: obrigacao?.metadata?.cobranca_financeira_id || null,
    carteira_movimento_id: null,
    produto_servico: source.produto_servico,
    origem: source.origem,
    percentual: normalizeCommissionPercent(source.percentual),
    valor_base: valorBase,
    valor_comissao: calculateCommissionValue({ valorBase, percentual: source.percentual }),
    valor_estornado: 0,
    status: 'concedida',
    source_key: sourceKey,
    lock_version: 0,
    metadata: {
      ...(payload?.metadata || {}),
      obrigacao_source_key: obrigacao?.source_key || null,
      finance_scope: 'sprint7_commission',
    },
    data_venda: source.data_venda || now,
    data_pagamento: payload?.data_pagamento || now,
    data_comissao: now,
    created_date: now,
    updated_date: now,
  };
  comissoes.push(row);
  writeStorage('ComissaoEvento', comissoes);

  return {
    comissao_evento_id: row.id,
    obrigacao_id: obrigacao.id,
    source_key: sourceKey,
    reused: false,
    skipped: false,
    skip_reason: null,
    valor_base: row.valor_base,
    valor_comissao: row.valor_comissao,
    vendedor_user_id: row.vendedor_user_id,
    status: row.status,
  };
};

mockFunctions.financeProcessCommissionForOrcamento = async (payload = {}) => {
  const orcamentoId = payload?.orcamento_id;
  if (!orcamentoId) {
    throw new Error('orcamento_id é obrigatório para processar comissão por orçamento.');
  }

  const obrigacoes = readStorage('ObrigacaoFinanceira').filter((item) => item?.orcamento_id === orcamentoId);
  const results = [];
  for (const obrigacao of obrigacoes) {
    results.push(await mockFunctions.financeProcessCommissionForObrigacao({
      obrigacao_id: obrigacao.id,
      data_pagamento: payload?.data_pagamento || null,
      metadata: payload?.metadata || {},
    }));
  }
  return results;
};

mockFunctions.financeCockpitV2Context = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  const flags = getMockCockpitFlags(empresaId);
  const walletAccounts = readStorage('CarteiraConta').filter((item) => item?.empresa_id === empresaId);
  const obligations = readStorage('ObrigacaoFinanceira').filter((item) => item?.empresa_id === empresaId);
  const charges = readStorage('CobrancaFinanceira').filter((item) => item?.empresa_id === empresaId);
  const snapshots = readStorage('FinanceSnapshot').filter((item) => item?.empresa_id === empresaId);
  const latestSnapshot = snapshots
    .slice()
    .sort((left, right) => new Date(right?.created_date || 0).getTime() - new Date(left?.created_date || 0).getTime())[0];

  return {
    empresa_id: empresaId,
    ...flags,
    wallet_accounts_count: walletAccounts.length,
    open_obligations_count: obligations.filter((item) => ['aberta', 'parcial', 'vencida'].includes(item?.status) && Number(item?.valor_em_aberto || 0) > 0).length,
    open_charges_count: charges.filter((item) => ['aberta', 'parcial', 'vencida'].includes(item?.status) && Number(item?.valor_em_aberto || 0) > 0).length,
    snapshots_count: snapshots.length,
    latest_snapshot_created_at: latestSnapshot?.created_date || null,
  };
};

mockFunctions.financeCockpitV2Summary = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  const cockpitFlags = getMockCockpitFlags(empresaId);
  const reportFlags = getMockReportsFlags(empresaId);
  if (!cockpitFlags.cockpit_v2_enabled) {
    throw new Error(`Feature flag finance.cockpit_v2_enabled está desligada para a empresa ${empresaId}.`);
  }
  if (!reportFlags.reports_v2_enabled) {
    throw new Error(`Feature flag finance.reports_v2_enabled está desligada para a empresa ${empresaId}.`);
  }

  const reportsSummary = await mockFunctions.financeReportsV2Summary({
    empresa_id: empresaId,
    periodo_inicio: payload?.periodo_inicio || null,
    periodo_fim: payload?.periodo_fim || null,
  });
  const obligations = readStorage('ObrigacaoFinanceira').filter((item) => item?.empresa_id === empresaId);
  const charges = readStorage('CobrancaFinanceira').filter((item) => item?.empresa_id === empresaId);
  const commissions = readStorage('ComissaoEvento').filter((item) => item?.empresa_id === empresaId);
  const deltas = readStorage('FinanceSnapshotDelta').filter((item) => item?.empresa_id === empresaId);
  const walletAccounts = readStorage('CarteiraConta').filter((item) => item?.empresa_id === empresaId);
  const latestReconciliations = readStorage('CarteiraReconciliacao')
    .filter((item) => item?.empresa_id === empresaId)
    .reduce((acc, item) => {
      const current = acc[item?.carteira_conta_id];
      if (!current || new Date(item?.created_date || 0).getTime() > new Date(current?.created_date || 0).getTime()) {
        acc[item?.carteira_conta_id] = item;
      }
      return acc;
    }, {});

  return {
    empresa_id: empresaId,
    periodo_inicio: payload?.periodo_inicio || null,
    periodo_fim: payload?.periodo_fim || null,
    wallet_total: Number(reportsSummary?.wallet_total || 0),
    faturamento_real_total: Number(reportsSummary?.billing_total || 0),
    geracao_recursos_total: Number(reportsSummary?.generation_total || 0),
    servicos_prestados_total: Number(reportsSummary?.services_total || 0),
    obrigacoes_abertas_total: obligations
      .filter((item) => ['aberta', 'parcial', 'vencida'].includes(item?.status))
      .reduce((sum, item) => sum + Number(item?.valor_em_aberto || 0), 0),
    obrigacoes_vencidas_total: obligations
      .filter((item) => ['aberta', 'parcial', 'vencida'].includes(item?.status))
      .filter((item) => item?.due_date && new Date(`${item.due_date}T12:00:00`) < new Date())
      .reduce((sum, item) => sum + Number(item?.valor_em_aberto || 0), 0),
    cobrancas_abertas_total: charges
      .filter((item) => ['aberta', 'parcial', 'vencida'].includes(item?.status))
      .reduce((sum, item) => sum + Number(item?.valor_em_aberto || 0), 0),
    cobrancas_vencidas_total: charges
      .filter((item) => ['aberta', 'parcial', 'vencida'].includes(item?.status))
      .filter((item) => item?.due_date && new Date(`${item.due_date}T12:00:00`) < new Date())
      .reduce((sum, item) => sum + Number(item?.valor_em_aberto || 0), 0),
    comissoes_total: commissions
      .filter((item) => item?.status === 'concedida')
      .reduce((sum, item) => sum + Number(item?.valor_comissao || 0), 0),
    comissoes_estornadas_total: commissions
      .filter((item) => ['estornada', 'parcialmente_estornada'].includes(item?.status))
      .reduce((sum, item) => sum + Number(item?.valor_estornado ?? item?.valor_comissao ?? 0), 0),
    carteiras_negativas_count: walletAccounts.filter((item) => Number(item?.saldo_atual || 0) < 0).length,
    reconciliacoes_divergentes_count: Object.values(latestReconciliations).filter((item) => item?.status === 'divergente').length,
    deltas_relevantes_count: deltas.filter((item) => Math.abs(Number(item?.impacto_financeiro || 0)) > 0).length,
  };
};

mockFunctions.financeCockpitV2Compare = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  const cockpitFlags = getMockCockpitFlags(empresaId);
  if (!cockpitFlags.cockpit_v2_compare_enabled) {
    throw new Error(`Feature flag finance.cockpit_v2_compare_enabled está desligada para a empresa ${empresaId}.`);
  }

  const legacy = buildMockLegacyCockpitSummary(
    empresaId,
    payload?.periodo_inicio || null,
    payload?.periodo_fim || null,
  );
  const summary = await mockFunctions.financeCockpitV2Summary(payload);

  return buildCockpitCompareRows({
    legacy,
    v2: {
      recebimentos_total: summary.faturamento_real_total,
      pendencias_total: summary.obrigacoes_abertas_total,
      faturamento_real_total: summary.faturamento_real_total,
      geracao_recursos_total: summary.geracao_recursos_total,
      cancelamentos_estornos_total: readStorage('CancelamentoFinanceiro').filter((item) => item?.empresa_id === empresaId).length,
      comissoes_total: summary.comissoes_total,
      cobrancas_abertas_vencidas_total: readStorage('CobrancaFinanceira')
        .filter((item) => item?.empresa_id === empresaId)
        .filter((item) => ['aberta', 'parcial', 'vencida'].includes(item?.status))
        .filter((item) => item?.due_date && new Date(`${item.due_date}T12:00:00`) < new Date()).length,
    },
  });
};

mockFunctions.financeFinancialAlertsV2 = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  const cockpitFlags = getMockCockpitFlags(empresaId);
  if (!cockpitFlags.financial_alerts_v2_enabled) {
    throw new Error(`Feature flag finance.financial_alerts_v2_enabled está desligada para a empresa ${empresaId}.`);
  }

  return buildMockCockpitAlerts(
    empresaId,
    payload?.periodo_inicio || null,
    payload?.periodo_fim || null,
  ).slice(0, Math.max(1, Math.min(Number(payload?.limit || 100), 500)));
};

const mockIntegrations = {
  Core: {
    SendEmail: async ({ to, subject, body }) => {
      if (typeof window !== 'undefined') {
        const mailto = `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`;
        window.open(mailto, '_blank', 'noopener,noreferrer');
      }
      return { ok: true, mode: 'mailto' };
    },
    UploadFile: async ({ file }) => {
      if (!file) throw new Error('No file provided');

      if (typeof File !== 'undefined' && file instanceof File) {
        const reader = new FileReader();
        return await new Promise((resolve, reject) => {
          reader.onload = () => {
            const dataUrl = reader.result;
            const key = 'uploaded_' + makeId();
            try {
              localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ name: file.name, dataUrl }));
            } catch {
              // ignore localStorage quota errors
            }
            resolve({ file_url: dataUrl, file_key: key });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      if (typeof file === 'string') {
        return { file_url: file, file_key: makeId() };
      }

      return { file_url: null, file_key: makeId() };
    },
    CreateFileSignedUrl: async ({ filename, path }) => ({
      url: `data:application/octet-stream,${encodeURIComponent(path || filename || 'file')}`,
    }),
    UploadPrivateFile: async ({ file }) => mockIntegrations.Core.UploadFile({ file }),
    GenerateImage: async ({ prompt }) => {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='100%' height='100%' fill='%23eee'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23666' font-size='20'>${prompt ? prompt.toString().slice(0, 40) : 'Generated Image'}</text></svg>`;
      const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      return { image_url: dataUrl };
    },
    ExtractDataFromUploadedFile: async ({ file_key }) => {
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + file_key);
        if (!raw) return { data: null };
        const obj = JSON.parse(raw);
        return { data: { name: obj.name, size: (obj.dataUrl || '').length } };
      } catch {
        return { data: null };
      }
    },
  },
};

const createMockAuth = () => {
  const currentUser = {
    id: 'local_user',
    email: 'dev@example.com',
    full_name: 'Dev User',
    empresa_id: 'empresa_demo',
    access_profile_permissions: [],
    pin_required_reset: false,
  };

  return {
    currentUser,
    isEnabled: () => false,
    requiresLogin: () => false,
    getSession: async () => ({ user: currentUser }),
    me: async () => {
      const activeUnitId = getStoredActiveUnitId() || currentUser.empresa_id;
      const selectedUnitIds = getSelectedScopedUnitIds();
      return {
        ...currentUser,
        assigned_empresa_id: currentUser.empresa_id,
        allowed_unit_ids: [currentUser.empresa_id],
        active_unit_id: activeUnitId,
        selected_unit_ids: selectedUnitIds,
        unit_selection_mode: selectedUnitIds.length > 1 ? 'merged' : 'single',
        empresa_id: activeUnitId,
      };
    },
    list: async () => [currentUser],
    signInWithGoogle: async () => ({ provider: 'google', user: currentUser }),
    exchangeCodeForSession: async () => ({ session: { user: currentUser }, user: currentUser }),
    signInWithPin: async () => {
      markDeviceTrustedForUser(currentUser);
      return { ok: true, session: { user: currentUser }, user: currentUser };
    },
    signInWithPinPairs: async () => {
      markDeviceTrustedForUser(currentUser);
      return { ok: true, session: { user: currentUser }, user: currentUser };
    },
    verifyCurrentDevicePin: async () => {
      markDeviceTrustedForUser(currentUser);
      return { ok: true, user: currentUser };
    },
    isCurrentDeviceTrusted: (user) => isDeviceTrustedForUser(user || currentUser),
    setPin: async () => {
      currentUser.pin_required_reset = false;
      currentUser.pin_bootstrap_status = 'definido';
      currentUser.pin_updated_at = new Date().toISOString();
      markDeviceTrustedForUser(currentUser);
      return { ok: true, user: currentUser };
    },
    bootstrapDefaultPins: async () => ({
      ok: true,
      default_pin: '654321',
      total: 1,
      updated: 1,
      skipped: 0,
      failed: 0,
      results: [{ user_id: currentUser.id, email: currentUser.email, status: 'ok' }],
    }),
    saveManagedUserAccess: async (payload = {}) => ({
      ok: true,
      user: { ...payload, id: payload?.user_id || currentUser.id },
      unit_access: [],
    }),
    onAuthStateChange: () => ({ unsubscribe() {} }),
    logout: async () => {
      clearStoredActiveUnitId();
      return { ok: true };
    },
  };
};

let appClient = {
  entities: defaultEntities,
  functions: mockFunctions,
  integrations: mockIntegrations,
  auth: createMockAuth(),
};

if (SUPABASE_URL && SUPABASE_ANON) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: {
      fetch: withActiveUnitHeader(globalThis.fetch.bind(globalThis)),
    },
  });

  let cachedDefaultUnitId = '';

  async function resolveAllowedUnitIds(authUser, profile) {
    const unitAccessRows = await findUserUnitAccess(authUser);
    const explicitUnitIds = unitAccessRows
      .filter((item) => item?.ativo !== false)
      .map((item) => item.empresa_id)
      .filter(Boolean);

    if (explicitUnitIds.length > 0) {
      return [...new Set(explicitUnitIds)];
    }

    if (profile?.is_platform_admin) {
      try {
        const { data, error } = await supabase.from('empresa').select('id').order('created_date', { ascending: true }).limit(500);
        if (!error) {
          return [...new Set((data || []).map((item) => item.id).filter(Boolean))];
        }
      } catch {
        return [];
      }
    }

    return profile?.empresa_id ? [profile.empresa_id] : [];
  }

  async function resolveScopedUnitId(preferredUnitId = '') {
    const authUser = await getAuthenticatedUser();
    if (!authUser) return preferredUnitId || '';

    const profile = await findUserProfile(authUser);
    const allowedUnitIds = await resolveAllowedUnitIds(authUser, profile);

    const storedSelection = getStoredSelectedUnitIds().filter((unitId) => allowedUnitIds.includes(unitId));
    const storedUnitId = getStoredActiveUnitId();
    if (storedUnitId && allowedUnitIds.includes(storedUnitId)) {
      setStoredUnitSelection({
        primaryUnitId: storedUnitId,
        selectedUnitIds: storedSelection.length > 0 ? storedSelection : [storedUnitId],
      });
      return storedUnitId;
    }

    if (preferredUnitId && allowedUnitIds.includes(preferredUnitId)) {
      setStoredUnitSelection({
        primaryUnitId: preferredUnitId,
        selectedUnitIds: [preferredUnitId],
      });
      return preferredUnitId;
    }

    if (cachedDefaultUnitId && allowedUnitIds.includes(cachedDefaultUnitId)) {
      setStoredUnitSelection({
        primaryUnitId: cachedDefaultUnitId,
        selectedUnitIds: [cachedDefaultUnitId],
      });
      return cachedDefaultUnitId;
    }

    try {
      const { data, error } = await supabase.from('empresa').select('*').order('created_date', { ascending: true }).limit(200);
      if (error) return allowedUnitIds[0] || profile?.empresa_id || '';

      const scopedUnits = (data || []).filter((item) => allowedUnitIds.length === 0 || allowedUnitIds.includes(item.id));
      const defaultUnit = resolveDogCityUnit(scopedUnits);
      const resolvedUnitId = defaultUnit?.id || scopedUnits?.[0]?.id || allowedUnitIds[0] || profile?.empresa_id || '';
      if (resolvedUnitId) {
        cachedDefaultUnitId = resolvedUnitId;
        setStoredUnitSelection({
          primaryUnitId: resolvedUnitId,
          selectedUnitIds: [resolvedUnitId],
        });
      }
      return resolvedUnitId;
    } catch {
      return allowedUnitIds[0] || profile?.empresa_id || '';
    }
  }

  async function applySupabaseQueryOptions(query, options = {}, entityOptions = {}) {
    const {
      eq = {},
      in: inFilters = {},
      gte = {},
      lte = {},
      search = null,
      sort = null,
      orderBy = null,
      ascending = undefined,
      limit = undefined,
      offset = 0,
    } = options || {};

    if (entityOptions.unitScoped && !Object.prototype.hasOwnProperty.call(eq || {}, 'empresa_id') && !Object.prototype.hasOwnProperty.call(inFilters || {}, 'empresa_id')) {
      const unitIds = getSelectedScopedUnitIds();
      const unitId = unitIds[0] || await resolveScopedUnitId();
      if (unitIds.length > 1) query = query.in('empresa_id', unitIds);
      else if (unitId) query = query.eq('empresa_id', unitId);
    }

    Object.entries(eq || {}).forEach(([field, value]) => {
      if (value === undefined || value === null || value === '') return;
      query = query.eq(field, value);
    });

    Object.entries(inFilters || {}).forEach(([field, value]) => {
      const values = Array.isArray(value) ? value.filter(Boolean) : [];
      if (!values.length) return;
      query = query.in(field, values);
    });

    Object.entries(gte || {}).forEach(([field, value]) => {
      if (value === undefined || value === null || value === '') return;
      query = query.gte(field, value);
    });

    Object.entries(lte || {}).forEach(([field, value]) => {
      if (value === undefined || value === null || value === '') return;
      query = query.lte(field, value);
    });

    const searchTerm = search?.term ? String(search.term).trim() : '';
    const searchColumns = Array.isArray(search?.columns) ? search.columns.filter(Boolean) : [];
    if (searchTerm && searchColumns.length > 0) {
      const sanitizedSearchTerm = searchTerm.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim();
      if (sanitizedSearchTerm) {
        query = query.or(searchColumns.map((column) => `${column}.ilike.%${sanitizedSearchTerm}%`).join(','));
      }
    }

    const effectiveSort = typeof sort === 'string' && sort
      ? { field: sort.replace(/^-/, ''), ascending: !sort.startsWith('-') }
      : orderBy
        ? { field: orderBy, ascending: ascending !== false }
        : null;

    if (effectiveSort?.field) {
      query = query.order(effectiveSort.field, { ascending: effectiveSort.ascending });
    }

    const normalizedOffset = Math.max(0, Number(offset) || 0);
    if (typeof limit === 'number') {
      query = query.range(normalizedOffset, normalizedOffset + limit - 1);
    } else if (normalizedOffset > 0) {
      query = query.range(normalizedOffset, normalizedOffset + 999);
    }

    return query;
  }

  const createSupabaseEntity = (table, options = {}) => ({
    unitScoped: options.unitScoped || false,
    list: async (sort, limit) => {
      let query = supabase.from(table).select('*');
      if (options.unitScoped) {
        const unitIds = getSelectedScopedUnitIds();
        const unitId = unitIds[0] || await resolveScopedUnitId();
        if (unitIds.length > 1) query = query.in('empresa_id', unitIds);
        else if (unitId) query = query.eq('empresa_id', unitId);
      }
      if (sort && typeof sort === 'string') {
        const field = sort.replace(/^-/, '');
        const desc = sort.startsWith('-');
        query = query.order(field, { ascending: !desc });
      }
      if (typeof limit === 'number') query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw toAppError(error, `Erro ao listar ${table}.`);
      return data || [];
    },
    listAll: async (sort, pageSize = 1000, maxRows = 10000) => {
      const results = [];
      let from = 0;

      while (results.length < maxRows) {
        let query = supabase.from(table).select('*');
        if (options.unitScoped) {
          const unitIds = getSelectedScopedUnitIds();
          const unitId = unitIds[0] || await resolveScopedUnitId();
          if (unitIds.length > 1) query = query.in('empresa_id', unitIds);
          else if (unitId) query = query.eq('empresa_id', unitId);
        }
        if (sort && typeof sort === 'string') {
          const field = sort.replace(/^-/, '');
          const desc = sort.startsWith('-');
          query = query.order(field, { ascending: !desc });
        }

        const to = Math.min(from + pageSize - 1, maxRows - 1);
        const { data, error } = await query.range(from, to);
        if (error) throw toAppError(error, `Erro ao listar ${table}.`);

        const batch = data || [];
        results.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }

      return results;
    },
    filter: async (queryObj = {}, sort, limit) => {
      let query = supabase.from(table).select('*');
      if (queryObj && Object.keys(queryObj).length) query = query.match(queryObj);
      if (options.unitScoped && !Object.prototype.hasOwnProperty.call(queryObj || {}, 'empresa_id')) {
        const unitIds = getSelectedScopedUnitIds();
        const unitId = unitIds[0] || await resolveScopedUnitId();
        if (unitIds.length > 1) query = query.in('empresa_id', unitIds);
        else if (unitId) query = query.eq('empresa_id', unitId);
      }
      if (sort && typeof sort === 'string') {
        const field = sort.replace(/^-/, '');
        const desc = sort.startsWith('-');
        query = query.order(field, { ascending: !desc });
      }
      if (typeof limit === 'number') query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw toAppError(error, `Erro ao filtrar ${table}.`);
      return data || [];
    },
    query: async (queryOptions = {}) => {
      const { select = '*', count = false } = queryOptions || {};
      let query = supabase.from(table).select(select, count ? { count: 'exact' } : undefined);
      query = await applySupabaseQueryOptions(query, queryOptions, options);
      const { data, error, count: totalCount } = await query;
      if (error) throw toAppError(error, `Erro ao consultar ${table}.`);
      const rows = data || [];
      const limit = typeof queryOptions?.limit === 'number' ? queryOptions.limit : null;
      const offset = Math.max(0, Number(queryOptions?.offset) || 0);
      return {
        data: rows,
        count: typeof totalCount === 'number' ? totalCount : null,
        hasMore: typeof totalCount === 'number'
          ? offset + rows.length < totalCount
          : (limit ? rows.length >= limit : false),
      };
    },
    queryAll: async (queryOptions = {}) => {
      const pageSize = Math.min(Math.max(Number(queryOptions?.pageSize) || 1000, 1), 5000);
      const maxRows = Math.max(Number(queryOptions?.maxRows) || 20000, pageSize);
      const results = [];
      let offset = 0;
      let totalCount = null;

      while (results.length < maxRows) {
        const response = await createSupabaseEntity(table, options).query({
          ...queryOptions,
          limit: pageSize,
          offset,
          count: offset === 0 && queryOptions?.count !== false,
        });

        if (typeof response.count === 'number' && totalCount === null) {
          totalCount = response.count;
        }

        results.push(...(response.data || []));
        if (!response.hasMore || !response.data?.length) break;
        offset += pageSize;
      }

      return {
        data: results.slice(0, maxRows),
        count: totalCount ?? results.length,
        hasMore: totalCount ? results.length < totalCount : false,
      };
    },
    create: async (payload) => {
      if (options.unitScoped) ensureSingleUnitWrite(table);
      const insertPayload = { ...(payload || {}) };
      if (options.unitScoped && !insertPayload.empresa_id) {
        insertPayload.empresa_id = await resolveScopedUnitId();
      }
      const { data, error } = await supabase.from(table).insert([insertPayload]).select().single();
      if (error) throw toAppError(error, `Erro ao criar registro em ${table}.`);
      return data;
    },
    update: async (id, payload) => {
      if (options.unitScoped) ensureSingleUnitWrite(table);
      let query = supabase.from(table).update(payload).eq('id', id);
      if (options.unitScoped) {
        const unitId = payload?.empresa_id || await resolveScopedUnitId();
        if (unitId) query = query.eq('empresa_id', unitId);
      }
      const { data, error } = await query.select();
      if (error) throw toAppError(error, `Erro ao atualizar registro em ${table}.`);
      return Array.isArray(data) ? (data[0] || { id, ...(payload || {}) }) : (data || { id, ...(payload || {}) });
    },
    delete: async (id) => {
      if (options.unitScoped) ensureSingleUnitWrite(table);
      let query = supabase.from(table).delete().eq('id', id);
      if (options.unitScoped) {
        const unitId = await resolveScopedUnitId();
        if (unitId) query = query.eq('empresa_id', unitId);
      }
      const { data, error } = await query.select();
      if (error) throw toAppError(error, `Erro ao excluir registro em ${table}.`);
      const deletedRows = Array.isArray(data) ? data.filter(Boolean) : (data ? [data] : []);
      if (!deletedRows.length) {
        const noRowsError = new Error(
          `Nenhum registro foi excluído em ${table}. O item pode estar protegido por permissão, fora do contexto ativo ou já removido.`
        );
        noRowsError.code = 'NO_ROWS_DELETED';
        noRowsError.table = table;
        throw noRowsError;
      }
      return deletedRows[0];
    },
  });

  const entityToTable = {
    Dog: 'dogs',
    Carteira: 'carteira',
    Client: 'carteira',
    Responsavel: 'responsavel',
    Orcamento: 'orcamento',
    Schedule: 'appointment',
    Appointment: 'appointment',
    ContaReceber: 'conta_receber',
    Despesa: 'despesa',
    PlanConfig: 'plan_config',
    RecurringPackage: 'recurring_packages',
    PackageSession: 'package_sessions',
    PackageCredit: 'package_credits',
    PackageBilling: 'package_billings',
    CarteiraConta: 'carteira_conta',
    CarteiraMovimento: 'carteira_movimento',
    CarteiraReconciliacao: 'carteira_reconciliacao',
    AutorizacaoFinanceira: 'autorizacao_financeira',
    CancelamentoFinanceiro: 'cancelamento_financeiro',
    ObrigacaoFinanceira: 'obrigacao_financeira',
    CobrancaFinanceira: 'cobranca_financeira',
    CobrancaItem: 'cobranca_item',
    ComissaoEvento: 'comissao_evento',
    FinanceSnapshot: 'finance_snapshot',
    FinanceSnapshotDelta: 'finance_snapshot_delta',
    AuditLog: 'audit_logs',
    TabelaPrecos: 'tabelaprecos',
    ServiceProvided: 'serviceprovided',
    ServiceProvider: 'serviceproviders',
    ServiceProviderSchedule: 'serviceprovider_schedule',
    Transaction: 'transaction',
    ScheduledTransaction: 'scheduledtransaction',
    Replacement: 'replacement',
    Lancamento: 'lancamento',
    ExtratoBancario: 'extratobancario',
    Receita: 'receita',
    PedidoInterno: 'pedidointerno',
    Notificacao: 'notificacao',
    Checkin: 'checkins',
    IntegracaoConfig: 'integracao_config',
    AppConfig: 'app_config',
    AppAsset: 'app_asset',
    Empresa: 'empresa',
    PerfilAcesso: 'perfil_acesso',
    UserInvite: 'user_invite',
    UserUnitAccess: 'user_unit_access',
    UserProfile: 'users',
    CentroCusto: 'centro_custo',
  };

  const toSnake = (name) => name.replace(/([A-Z])/g, '_$1').replace(/^_/, '').toLowerCase();

  const supabaseEntities = {};
  Object.keys(entityToTable).forEach((entityName) => {
    const table = entityToTable[entityName] || toSnake(entityName);
    supabaseEntities[entityName] = createSupabaseEntity(table, { unitScoped: UNIT_SCOPED_ENTITIES.has(entityName) });
  });

  const supabaseFunctions = {
    notificacoesOrcamento: async (payload) => {
      try {
        if (payload) {
          const notificationPayload = payload.data || {};
          const action = payload.action || 'notificacao';
          const titleByAction = {
            status_alterado: 'Status de orçamento atualizado',
            orcamento_criado: 'Novo orçamento criado',
            orcamento_enviado: 'Orçamento enviado',
          };
          const defaultMessage = action === 'status_alterado'
            ? `Novo status: ${notificationPayload?.novo_status || 'atualizado'}`
            : 'Você recebeu uma nova notificação.';
          await supabase.from('notificacao').insert([{
            user_id: payload.user_id || notificationPayload.user_id || null,
            empresa_id: payload.empresa_id || notificationPayload.empresa_id || null,
            tipo: action,
            titulo: payload.titulo || titleByAction[action] || 'Notificação',
            mensagem: payload.mensagem || notificationPayload.mensagem || defaultMessage,
            link: payload.link || notificationPayload.link || null,
            payload: notificationPayload,
            created_date: new Date().toISOString(),
            updated_date: new Date().toISOString(),
          }]);
        }
      } catch {
        // ignore notification write failures
      }
      return { ok: true };
    },
    bancoInter: async (payload = {}) => {
      const functionUrl = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/banco-inter-sync` : '';
      const parseFunctionError = async (error) => {
        let details = '';
        try {
          if (error?.context) {
            const cloned = error.context.clone ? error.context.clone() : error.context;
            const errorPayload = await cloned.json();
            details = errorPayload?.details || errorPayload?.error || '';
          }
        } catch {
          details = '';
        }
        return details || error?.message || 'Falha na integração com Banco Inter.';
      };

      try {
        const { data, error } = await supabase.functions.invoke('banco-inter-sync', {
          body: payload,
        });
        if (error) {
          throw new Error(await parseFunctionError(error));
        }
        return data;
      } catch (invokeError) {
        if (!functionUrl || !SUPABASE_ANON) {
          throw invokeError;
        }

        const headers = {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
        };

        const activeUnitId = getStoredActiveUnitId();
        if (activeUnitId) {
          headers['x-active-unit-id'] = activeUnitId;
        }

        const response = await fetch(functionUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload || {}),
        });

        let responsePayload = null;
        try {
          responsePayload = await response.json();
        } catch {
          responsePayload = null;
        }

        if (!response.ok) {
          const fallbackMessage = responsePayload?.details || responsePayload?.error || invokeError?.message || 'Falha na integração com Banco Inter.';
          throw new Error(fallbackMessage);
        }

        return responsePayload;
      }
    },
    userAdmin: async (payload = {}) => {
      const { data, error } = await supabase.functions.invoke('user-admin', {
        body: payload,
      });
      if (error) {
        let details = '';
        try {
          if (error.context) {
            const cloned = error.context.clone ? error.context.clone() : error.context;
            const errorPayload = await cloned.json();
            details = errorPayload?.details || errorPayload?.error || '';
          }
        } catch {
          details = '';
        }
        const baseMessage = details || error.message || 'Falha na administração de usuários.';
        const shouldHintDeploy = /edge function|failed to send a request|non-2xx|not found/i.test(baseMessage);
        throw new Error(shouldHintDeploy ? `${baseMessage}. Implante a Edge Function user-admin no Supabase.` : baseMessage);
      }
      return data;
    },
    clientRegistration: async (payload = {}) => {
      const { data, error } = await supabase.functions.invoke('client-registration', {
        body: payload,
      });
      if (error) {
        let details = '';
        try {
          if (error.context) {
            const cloned = error.context.clone ? error.context.clone() : error.context;
            const errorPayload = await cloned.json();
            details = errorPayload?.details || errorPayload?.error || '';
          }
        } catch {
          details = '';
        }
        const baseMessage = details || error.message || 'Falha no cadastro do cliente.';
        const shouldHintDeploy = /edge function|failed to send a request|non-2xx|not found/i.test(baseMessage);
        throw new Error(shouldHintDeploy ? `${baseMessage}. Implante a Edge Function client-registration no Supabase.` : baseMessage);
      }
      return data;
    },
    monitorRegistration: async (payload = {}) => {
      const { data, error } = await supabase.functions.invoke('monitor-registration', {
        body: payload,
      });
      if (error) {
        let details = '';
        try {
          if (error.context) {
            const cloned = error.context.clone ? error.context.clone() : error.context;
            const errorPayload = await cloned.json();
            details = errorPayload?.details || errorPayload?.error || '';
          }
        } catch {
          details = '';
        }
        const baseMessage = details || error.message || 'Falha no cadastro do funcionário.';
        const shouldHintDeploy = /edge function|failed to send a request|non-2xx|not found/i.test(baseMessage);
        throw new Error(shouldHintDeploy ? `${baseMessage}. Implante a Edge Function monitor-registration no Supabase.` : baseMessage);
      }
      return data;
    },
    responsavelApproval: async (payload = {}) => {
      const { data, error } = await supabase.functions.invoke('responsavel-approval', {
        body: payload,
      });
      if (error) {
        let details = '';
        try {
          if (error.context) {
            const cloned = error.context.clone ? error.context.clone() : error.context;
            const errorPayload = await cloned.json();
            details = errorPayload?.details || errorPayload?.error || '';
          }
        } catch {
          details = '';
        }
        const baseMessage = details || error.message || 'Falha na aprovação autenticada do responsável.';
        const shouldHintDeploy = /edge function|failed to send a request|non-2xx|not found/i.test(baseMessage);
        throw new Error(shouldHintDeploy ? `${baseMessage}. Implante a Edge Function responsavel-approval no Supabase.` : baseMessage);
      }
      return data;
    },
    whatsappBridge: async (payload = {}) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-bridge', {
        body: payload,
      });
      if (error) {
        let details = '';
        try {
          if (error.context) {
            const cloned = error.context.clone ? error.context.clone() : error.context;
            const errorPayload = await cloned.json();
            details = errorPayload?.details || errorPayload?.error || '';
          }
        } catch {
          details = '';
        }
        const baseMessage = details || error.message || 'Falha na integração com WhatsApp.';
        const shouldHintDeploy = /edge function|failed to send a request|non-2xx|not found/i.test(baseMessage);
        throw new Error(shouldHintDeploy ? `${baseMessage}. Implante a Edge Function whatsapp-bridge no Supabase.` : baseMessage);
      }
      return data;
    },
    financeShadowSync: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_shadow_sync_orcamento', {
        p_orcamento_id: payload?.orcamento_id || null,
        p_empresa_id: payload?.empresa_id || null,
        p_carteira_id: payload?.carteira_id || null,
        p_due_date: payload?.due_date || null,
        p_status: payload?.status || null,
        p_items: payload?.items || [],
        p_payload: payload?.payload || {},
        p_usuario_id: payload?.usuario_id || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao sincronizar shadow financeiro do orÃ§amento.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financeWalletAdminReadAccounts: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_wallet_admin_read_accounts', {
        p_empresa_id: payload?.empresa_id || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar a leitura administrativa das contas de carteira.');
      }
      return Array.isArray(data) ? data : [];
    },
    financeWalletAdminReadMovements: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_wallet_admin_read_movements', {
        p_empresa_id: payload?.empresa_id || null,
        p_carteira_conta_id: payload?.carteira_conta_id || null,
        p_limit: payload?.limit || 20,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar a leitura administrativa dos movimentos da carteira.');
      }
      return Array.isArray(data) ? data : [];
    },
    financeWalletAdminAuditAccounts: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_wallet_admin_audit_accounts', {
        p_empresa_id: payload?.empresa_id || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar a auditoria administrativa da carteira.');
      }
      return Array.isArray(data) ? data : [];
    },
    financeWalletAdminApplyOperation: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_wallet_admin_apply_operation', {
        p_carteira_conta_id: payload?.carteira_conta_id || null,
        p_operacao_idempotencia: payload?.operacao_idempotencia || null,
        p_tipo: payload?.tipo || null,
        p_natureza: payload?.natureza || null,
        p_valor: payload?.valor ?? null,
        p_referencia_amigavel: payload?.referencia_amigavel || null,
        p_motivo: payload?.motivo || null,
        p_observacao: payload?.observacao || null,
        p_origem: payload?.origem || 'admin_manual',
        p_transacao_id: payload?.transacao_id || null,
        p_usuario_id: payload?.usuario_id || null,
        p_metadata: payload?.metadata || {},
      });
      if (error) {
        throw toAppError(error, 'Erro ao aplicar operação administrativa da carteira.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financeWalletReconcileAccount: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_reconcile_wallet_account', {
        p_carteira_conta_id: payload?.carteira_conta_id || null,
        p_usuario_id: payload?.usuario_id || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao reconciliar a carteira.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financeWalletBudgetReadContext: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_wallet_budget_read_context', {
        p_empresa_id: payload?.empresa_id || null,
        p_carteira_id: payload?.carteira_id || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar o saldo da carteira no orçamento.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financePreviewBudgetConsumption: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_preview_budget_consumption', {
        p_carteira_conta_id: payload?.carteira_conta_id || null,
        p_valor_orcamento_total: payload?.valor_orcamento_total ?? null,
        p_valor_saldo_solicitado: payload?.valor_saldo_solicitado ?? null,
        p_preview_items: payload?.preview_items || [],
      });
      if (error) {
        throw toAppError(error, 'Erro ao simular o consumo cronológico do orçamento.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financeRegisterBudgetAuthorization: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_register_budget_authorization', {
        p_carteira_conta_id: payload?.carteira_conta_id || null,
        p_orcamento_id: payload?.orcamento_id || null,
        p_motivo: payload?.motivo || null,
        p_vencimento_novo: payload?.vencimento_novo || null,
        p_usuario_id: payload?.usuario_id || null,
        p_metadata: payload?.metadata || {},
      });
      if (error) {
        throw toAppError(error, 'Erro ao registrar a autorização financeira do orçamento.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financeApproveBudgetWithAuthorization: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_approve_budget_with_authorization', {
        p_orcamento_id: payload?.orcamento_id || null,
        p_carteira_conta_id: payload?.carteira_conta_id || null,
        p_motivo: payload?.motivo || null,
        p_vencimento_novo: payload?.vencimento_novo || null,
        p_usuario_id: payload?.usuario_id || null,
        p_metadata: payload?.metadata || {},
      });
      if (error) {
        throw toAppError(error, 'Erro ao aprovar o orçamento com autorização financeira atômica.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financeApplyCompensatoryCredit: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_apply_compensatory_credit', {
        p_carteira_conta_id: payload?.carteira_conta_id || null,
        p_operacao_idempotencia: payload?.operacao_idempotencia || null,
        p_valor: payload?.valor ?? null,
        p_motivo: payload?.motivo || null,
        p_referencia_amigavel: payload?.referencia_amigavel || null,
        p_descricao: payload?.descricao || null,
        p_orcamento_id: payload?.orcamento_id || null,
        p_appointment_id: payload?.appointment_id || null,
        p_obrigacao_id: payload?.obrigacao_id || null,
        p_usuario_id: payload?.usuario_id || null,
        p_metadata: payload?.metadata || {},
      });
      if (error) {
        throw toAppError(error, 'Erro ao aplicar cr?dito compensat?rio na carteira.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financeProcessCancellationV2: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_process_cancellation_v2', {
        p_carteira_conta_id: payload?.carteira_conta_id || null,
        p_obrigacao_id: payload?.obrigacao_id || null,
        p_orcamento_id: payload?.orcamento_id || null,
        p_appointment_id: payload?.appointment_id || null,
        p_origem_cancelamento: payload?.origem_cancelamento || 'cliente',
        p_aplicar_multa: Boolean(payload?.aplicar_multa),
        p_percentual_multa: payload?.percentual_multa ?? 0,
        p_gerar_credito_compensatorio: Boolean(payload?.gerar_credito_compensatorio),
        p_valor_credito_compensatorio: payload?.valor_credito_compensatorio ?? null,
        p_permitir_saldo_negativo_multa: Boolean(payload?.permitir_saldo_negativo_multa),
        p_motivo: payload?.motivo || null,
        p_usuario_id: payload?.usuario_id || null,
        p_metadata: payload?.metadata || {},
      });
      if (error) {
        throw toAppError(error, 'Erro ao processar o cancelamento financeiro V2.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financeProcessBudgetCancellationV2: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_process_budget_cancellation_v2', {
        p_orcamento_id: payload?.orcamento_id || null,
        p_carteira_conta_id: payload?.carteira_conta_id || null,
        p_origem_cancelamento: payload?.origem_cancelamento || 'cliente',
        p_aplicar_multa: Boolean(payload?.aplicar_multa),
        p_percentual_multa: payload?.percentual_multa ?? 0,
        p_gerar_credito_compensatorio: Boolean(payload?.gerar_credito_compensatorio),
        p_valor_credito_compensatorio: payload?.valor_credito_compensatorio ?? null,
        p_permitir_saldo_negativo_multa: Boolean(payload?.permitir_saldo_negativo_multa),
        p_motivo: payload?.motivo || null,
        p_usuario_id: payload?.usuario_id || null,
        p_metadata: payload?.metadata || {},
      });
      if (error) {
        throw toAppError(error, 'Erro ao processar o cancelamento financeiro do or?amento.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financeReportsV2Context: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_reports_v2_context', {
        p_empresa_id: payload?.empresa_id || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar o contexto dos relatórios V2.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financeReportsV2Summary: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_reports_v2_summary', {
        p_empresa_id: payload?.empresa_id || null,
        p_periodo_inicio: payload?.periodo_inicio || null,
        p_periodo_fim: payload?.periodo_fim || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar o resumo oficial dos relatÃ³rios V2.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financeReportGenerationResources: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_report_generation_resources', {
        p_empresa_id: payload?.empresa_id || null,
        p_periodo_inicio: payload?.periodo_inicio || null,
        p_periodo_fim: payload?.periodo_fim || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar a geração de recursos V2.');
      }
      return Array.isArray(data) ? data : [];
    },
    financeReportRealBilling: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_report_real_billing', {
        p_empresa_id: payload?.empresa_id || null,
        p_periodo_inicio: payload?.periodo_inicio || null,
        p_periodo_fim: payload?.periodo_fim || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar o faturamento real V2.');
      }
      return Array.isArray(data) ? data : [];
    },
    financeReportWallet: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_report_wallet', {
        p_empresa_id: payload?.empresa_id || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar o relatório de carteira V2.');
      }
      return Array.isArray(data) ? data : [];
    },
    financeReportServicesProvided: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_report_services_provided', {
        p_empresa_id: payload?.empresa_id || null,
        p_periodo_inicio: payload?.periodo_inicio || null,
        p_periodo_fim: payload?.periodo_fim || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar o relatório de serviços prestados V2.');
      }
      return Array.isArray(data) ? data : [];
    },
    financeSnapshotCreate: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_snapshot_create', {
        p_empresa_id: payload?.empresa_id || null,
        p_tipo: payload?.tipo || null,
        p_competencia: payload?.competencia || null,
        p_periodo_inicio: payload?.periodo_inicio || null,
        p_periodo_fim: payload?.periodo_fim || null,
        p_usuario_id: payload?.usuario_id || null,
        p_metadata: payload?.metadata || {},
      });
      if (error) {
        throw toAppError(error, 'Erro ao gerar o snapshot financeiro.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financeSnapshotCompare: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_snapshot_compare', {
        p_snapshot_id: payload?.snapshot_id || null,
        p_usuario_id: payload?.usuario_id || null,
        p_metadata: payload?.metadata || {},
      });
      if (error) {
        throw toAppError(error, 'Erro ao comparar o snapshot financeiro.');
      }
      return Array.isArray(data) ? data : [];
    },
    financeSnapshotList: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_snapshot_list', {
        p_empresa_id: payload?.empresa_id || null,
        p_tipo: payload?.tipo || null,
        p_limit: payload?.limit || 20,
      });
      if (error) {
        throw toAppError(error, 'Erro ao listar snapshots financeiros.');
      }
      return Array.isArray(data) ? data : [];
    },
    financeSnapshotDeltaList: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_snapshot_delta_list', {
        p_snapshot_id: payload?.snapshot_id || null,
        p_limit: payload?.limit || 200,
      });
      if (error) {
        throw toAppError(error, 'Erro ao listar deltas de snapshot.');
      }
      return Array.isArray(data) ? data : [];
    },
    financeCommissionReadContext: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_commission_read_context', {
        p_empresa_id: payload?.empresa_id || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar o contexto administrativo de comissões.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financeCommissionList: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_commission_list', {
        p_empresa_id: payload?.empresa_id || null,
        p_status: payload?.status || null,
        p_limit: payload?.limit || 100,
      });
      if (error) {
        throw toAppError(error, 'Erro ao listar eventos de comissão.');
      }
      return Array.isArray(data) ? data : [];
    },
    financeProcessCommissionForObrigacao: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_process_commission_for_obrigacao', {
        p_obrigacao_id: payload?.obrigacao_id || null,
        p_data_pagamento: payload?.data_pagamento || null,
        p_usuario_id: payload?.usuario_id || null,
        p_metadata: payload?.metadata || {},
      });
      if (error) {
        throw toAppError(error, 'Erro ao processar a comissão da obrigação quitada.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financeProcessCommissionForOrcamento: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_process_commission_for_orcamento', {
        p_orcamento_id: payload?.orcamento_id || null,
        p_data_pagamento: payload?.data_pagamento || null,
        p_usuario_id: payload?.usuario_id || null,
        p_metadata: payload?.metadata || {},
      });
      if (error) {
        throw toAppError(error, 'Erro ao processar as comissões do orçamento.');
      }
      return Array.isArray(data) ? data : [];
    },
    financeCockpitV2Context: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_cockpit_v2_context', {
        p_empresa_id: payload?.empresa_id || null,
        p_periodo_inicio: payload?.periodo_inicio || null,
        p_periodo_fim: payload?.periodo_fim || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar o contexto do cockpit financeiro V2.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financeCockpitV2Summary: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_cockpit_v2_summary', {
        p_empresa_id: payload?.empresa_id || null,
        p_periodo_inicio: payload?.periodo_inicio || null,
        p_periodo_fim: payload?.periodo_fim || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar o resumo do cockpit financeiro V2.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financeCockpitV2Compare: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_cockpit_v2_compare', {
        p_empresa_id: payload?.empresa_id || null,
        p_periodo_inicio: payload?.periodo_inicio || null,
        p_periodo_fim: payload?.periodo_fim || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar o comparativo legado vs V2 do cockpit.');
      }
      return Array.isArray(data) ? data : [];
    },
    financeFinancialAlertsV2: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_financial_alerts_v2', {
        p_empresa_id: payload?.empresa_id || null,
        p_periodo_inicio: payload?.periodo_inicio || null,
        p_periodo_fim: payload?.periodo_fim || null,
        p_limit: payload?.limit || 100,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar os alertas financeiros V2.');
      }
      return Array.isArray(data) ? data : [];
    },
  };


  const supabaseIntegrations = {
    Core: {
      SendEmail: async ({ to, subject, body, html }) => {
        const webhookUrl = import.meta.env.VITE_EMAIL_WEBHOOK_URL || DEFAULT_EMAIL_WEBHOOK_URL;
        if (webhookUrl) {
          const headers = { 'Content-Type': 'application/json' };
          if (SUPABASE_ANON && webhookUrl.includes('.supabase.co/functions/v1/')) {
            headers.apikey = SUPABASE_ANON;
            headers.Authorization = `Bearer ${SUPABASE_ANON}`;
          }
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({ to, subject, body, html }),
          });
          if (!response.ok) {
            let details = '';
            try {
              const errorPayload = await response.json();
              details = errorPayload?.details?.message || errorPayload?.details || errorPayload?.error || '';
            } catch {
              details = '';
            }
            throw new Error(details ? `Falha ao enviar email (${response.status}): ${details}` : `Falha ao enviar email (${response.status})`);
          }
          return { ok: true, mode: 'webhook' };
        }

        if (typeof window !== 'undefined') {
          const mailto = `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`;
          window.open(mailto, '_blank', 'noopener,noreferrer');
        }

        return { ok: true, mode: 'mailto' };
      },
      UploadFile: async ({ file, path }) => {
        const bucket = SUPABASE_PUBLIC_BUCKET;
        const filename = path || `${Date.now()}_${file.name || 'file'}`;
        const { error: uploadError } = await supabase.storage.from(bucket).upload(filename, file, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filename);
        return { file_url: publicData?.publicUrl || null, file_key: filename, bucket };
      },
      CreateFileSignedUrl: async ({ path, bucket = SUPABASE_PRIVATE_BUCKET, expires = 60 * 60 }) => {
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expires);
        if (error) throw error;
        return data;
      },
      UploadPrivateFile: async ({ file, path }) => {
        const bucket = SUPABASE_PRIVATE_BUCKET;
        const filename = path || `${Date.now()}_${file.name || 'file'}`;
        const { error: uploadError } = await supabase.storage.from(bucket).upload(filename, file, { upsert: true });
        if (uploadError) throw uploadError;
        return { file_url: null, file_key: filename, bucket };
      },
      GenerateImage: async ({ prompt }) => {
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='100%' height='100%' fill='%23eee'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23666' font-size='20'>${prompt ? prompt.toString().slice(0, 40) : 'Generated Image'}</text></svg>`;
        const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        return { image_url: dataUrl };
      },
      ExtractDataFromUploadedFile: async ({ path }) => {
        try {
          const bucket = SUPABASE_PRIVATE_BUCKET;
          const folder = path ? path.split('/').slice(0, -1).join('/') : '';
          const { data, error } = await supabase.storage.from(bucket).list(folder);
          if (error) return { data: null };
          return { data };
        } catch {
          return { data: null };
        }
      },
    },
  };

  const getAuthName = (authUser) => {
    const metadata = authUser?.user_metadata || {};
    return (
      metadata.full_name ||
      metadata.name ||
      [metadata.first_name, metadata.last_name].filter(Boolean).join(' ') ||
      authUser?.email?.split('@')?.[0] ||
      null
    );
  };

  const findUserProfile = async (authUser) => {
    if (!authUser) return null;

    try {
      if (authUser.id) {
        const { data, error } = await supabase.from('users').select('*').eq('id', authUser.id).limit(1);
        if (!error && data?.[0]) return data[0];
      }

      if (authUser.email) {
        const { data, error } = await supabase.from('users').select('*').eq('email', authUser.email).limit(1);
        if (!error && data?.[0]) return data[0];
      }
    } catch (error) {
      console.warn('findUserProfile error', error);
    }

    return null;
  };

  const findUserUnitAccess = async (authUser) => {
    if (!authUser?.id) return [];

    try {
      const { data, error } = await supabase
        .from('user_unit_access')
        .select('*')
        .eq('user_id', authUser.id)
        .eq('ativo', true)
        .order('created_date', { ascending: true });

      if (error) return [];
      return data || [];
    } catch {
      return [];
    }
  };

  const findPendingInviteByEmail = async (email) => {
    if (!email) return null;

    try {
      const { data, error } = await supabase
        .from('user_invite')
        .select('*')
        .eq('email', email)
        .in('status', ['pendente', 'aceito'])
        .order('created_date', { ascending: false })
        .limit(1);

      if (error) {
        console.warn('findPendingInviteByEmail error', error);
        return null;
      }

      return data?.[0] || null;
    } catch (error) {
      console.warn('findPendingInviteByEmail error', error);
      return null;
    }
  };

  const findAccessProfile = async (profileId) => {
    if (!profileId) return null;

    try {
      const { data, error } = await supabase
        .from('perfil_acesso')
        .select('*')
        .eq('id', profileId)
        .limit(1);

      if (error) return null;
      return data?.[0] || null;
    } catch {
      return null;
    }
  };

  const syncUserUnitAccess = async ({ userId, empresaId, accessProfileId, companyRole, active, isPlatformAdmin }) => {
    if (!userId || !empresaId || isPlatformAdmin) return;

    try {
      const { data: existingRows, error: existingError } = await supabase
        .from('user_unit_access')
        .select('*')
        .eq('user_id', userId)
        .eq('empresa_id', empresaId)
        .limit(1);

      if (existingError) return;

      const payload = {
        user_id: userId,
        empresa_id: empresaId,
        access_profile_id: accessProfileId || null,
        papel: companyRole || 'company_user',
        ativo: active !== false,
        is_default: true,
      };

      if (existingRows?.[0]) {
        await supabase.from('user_unit_access').update(payload).eq('id', existingRows[0].id);
      } else {
        await supabase.from('user_unit_access').insert([payload]);
      }
    } catch (error) {
      console.warn('syncUserUnitAccess error', error);
    }
  };

  const syncUserProfile = async (authUser) => {
    if (!authUser?.email) return authUser;

    try {
      const existingProfile = await findUserProfile(authUser);
      const invite = await findPendingInviteByEmail(authUser.email);
      const onboardingStatus = existingProfile?.onboarding_status || (invite ? 'pendente' : 'completo');
      const payload = {
        email: authUser.email,
        full_name: existingProfile?.full_name || invite?.full_name || getAuthName(authUser),
        active: existingProfile?.active ?? true,
        empresa_id: existingProfile?.empresa_id || invite?.empresa_id || null,
        access_profile_id: existingProfile?.access_profile_id || invite?.access_profile_id || null,
        company_role: existingProfile?.company_role || invite?.company_role || null,
        is_platform_admin: existingProfile?.is_platform_admin ?? invite?.is_platform_admin ?? false,
        onboarding_status: onboardingStatus,
      };

      if (existingProfile) {
        const { data, error } = await supabase
          .from('users')
          .update(payload)
          .eq('id', existingProfile.id)
          .select()
          .single();

        if (error) throw error;
        await syncUserUnitAccess({
          userId: data.id,
          empresaId: data.empresa_id,
          accessProfileId: data.access_profile_id,
          companyRole: data.company_role,
          active: data.active,
          isPlatformAdmin: data.is_platform_admin,
        });
        return { ...authUser, ...data };
      }

      const { data, error } = await supabase
        .from('users')
        .insert([{
          id: authUser.id,
          email: authUser.email,
          full_name: invite?.full_name || getAuthName(authUser),
          profile: 'usuario',
          active: true,
          empresa_id: invite?.empresa_id || null,
          access_profile_id: invite?.access_profile_id || null,
          company_role: invite?.company_role || null,
          is_platform_admin: invite?.is_platform_admin ?? false,
          onboarding_status: invite ? 'pendente' : 'completo',
        }])
        .select()
        .single();

      if (error) throw error;
      await syncUserUnitAccess({
        userId: data.id,
        empresaId: data.empresa_id,
        accessProfileId: data.access_profile_id,
        companyRole: data.company_role,
        active: data.active,
        isPlatformAdmin: data.is_platform_admin,
      });
      return { ...authUser, ...data };
    } catch (error) {
      console.warn('syncUserProfile error', error);
      return authUser;
    }
  };

  const getAuthenticatedUser = async () => {
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (!sessionError && sessionData?.session?.user) {
        return sessionData.session.user;
      }
      return null;
    } catch (error) {
      if (error?.name !== 'AuthSessionMissingError') {
        console.warn('getAuthenticatedUser error', error);
      }
      return null;
    }
  };

  const supabaseAuth = {
    currentUser: null,
    isEnabled: () => true,
    requiresLogin: () => true,
    getSession: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data?.session || null;
    },
    me: async () => {
      const authUser = await getAuthenticatedUser();
      if (!authUser) return null;

      const profile = await findUserProfile(authUser);
      const mergedUser = profile ? { ...authUser, ...profile } : authUser;
      const accessProfile = await findAccessProfile(mergedUser?.access_profile_id);
      const allowedUnitIds = await resolveAllowedUnitIds(authUser, mergedUser);
      const activeUnitId = await resolveScopedUnitId(getStoredActiveUnitId() || mergedUser?.empresa_id || '');
      const selectedUnitIds = getStoredSelectedUnitIds().filter((unitId) => allowedUnitIds.includes(unitId));
      const normalizedSelectedUnitIds = selectedUnitIds.length > 0
        ? [...new Set([activeUnitId, ...selectedUnitIds].filter(Boolean))]
        : [activeUnitId].filter(Boolean);

      setStoredUnitSelection({
        primaryUnitId: activeUnitId || mergedUser?.empresa_id || '',
        selectedUnitIds: normalizedSelectedUnitIds,
      });

      const sessionUser = {
        ...mergedUser,
        assigned_empresa_id: mergedUser?.empresa_id || null,
        allowed_unit_ids: allowedUnitIds,
        active_unit_id: activeUnitId || mergedUser?.empresa_id || null,
        selected_unit_ids: normalizedSelectedUnitIds,
        access_profile_code: accessProfile?.codigo || null,
        access_profile_name: accessProfile?.nome || null,
        access_profile_permissions: Array.isArray(accessProfile?.permissoes) ? accessProfile.permissoes : [],
        unit_selection_mode: normalizedSelectedUnitIds.length > 1 ? 'merged' : 'single',
        empresa_id: activeUnitId || mergedUser?.empresa_id || null,
      };
      supabaseAuth.currentUser = sessionUser;
      return sessionUser;
    },
    signInWithGoogle: async ({ redirectTo, nextPath } = {}) => {
      const origin = getAppOrigin();
      const callbackUrl = new URL(redirectTo || `${origin}/auth-callback`, origin);

      if (nextPath) {
        callbackUrl.searchParams.set('next', nextPath);
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl.toString(),
        },
      });

      if (error) throw error;
      return data;
    },
    signInWithPin: async ({ email, selectedPairs, selectedDigits, pin } = {}) => {
      const result = await supabaseFunctions.userAdmin({
        action: 'pin_login',
        email,
        selected_pairs: selectedPairs,
        selected_digits: selectedDigits,
        pin,
        device_id: getOrCreateDeviceId(),
      });

      const accessToken = result?.session?.access_token;
      const refreshToken = result?.session?.refresh_token;
      if (!accessToken || !refreshToken) {
        throw new Error('A autenticação por PIN não retornou uma sessão válida.');
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;

      const authUser = await getAuthenticatedUser();
      const mergedUser = authUser ? await syncUserProfile(authUser) : (result?.user || null);
      if (mergedUser) {
        markDeviceTrustedForUser(mergedUser);
        supabaseAuth.currentUser = mergedUser;
      }

      return {
        ok: true,
        session: result?.session || null,
        user: mergedUser || result?.user || null,
      };
    },
    signInWithPinPairs: async ({ email, selectedPairs, selectedDigits, pin } = {}) => {
      return supabaseAuth.signInWithPin({
        email,
        selectedPairs,
        selectedDigits,
        pin,
      });
    },
    exchangeCodeForSession: async (currentUrl) => {
      const origin = getAppOrigin();
      const url = new URL(currentUrl || `${origin}/auth-callback`, origin);
      const authCode = url.searchParams.get('code');

      if (!authCode) {
        return supabaseAuth.getSession();
      }

      const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);
      if (error) throw error;

      const authUser = data?.user || data?.session?.user || null;
      supabaseAuth.currentUser = authUser;
      if (authUser) {
        const mergedUser = await syncUserProfile(authUser);
        supabaseAuth.currentUser = mergedUser;
      }
      return data;
    },
    verifyCurrentDevicePin: async ({ selectedPairs, selectedDigits, pin } = {}) => {
      const result = await supabaseFunctions.userAdmin({
        action: 'verify_pin',
        selected_pairs: selectedPairs,
        selected_digits: selectedDigits,
        pin,
        device_id: getOrCreateDeviceId(),
      });

      const currentUser = await supabaseAuth.me();
      if (currentUser) {
        markDeviceTrustedForUser(currentUser);
        supabaseAuth.currentUser = {
          ...currentUser,
          pin_last_verified_at: result?.user?.pin_last_verified_at || new Date().toISOString(),
        };
      }

      return result;
    },
    isCurrentDeviceTrusted: (user) => isDeviceTrustedForUser(user),
    setPin: async ({ pin } = {}) => {
      const result = await supabaseFunctions.userAdmin({
        action: 'set_pin',
        pin,
      });

      const authUser = await getAuthenticatedUser();
      if (authUser) {
        const mergedUser = await syncUserProfile(authUser);
        markDeviceTrustedForUser(mergedUser || authUser);
        supabaseAuth.currentUser = {
          ...supabaseAuth.currentUser,
          ...mergedUser,
          pin_required_reset: false,
          pin_bootstrap_status: 'definido',
          pin_updated_at: result?.user?.pin_updated_at || new Date().toISOString(),
        };
      }

      return result;
    },
    getInviteOnboardingContext: async ({ token } = {}) => {
      return supabaseFunctions.userAdmin({
        action: 'get_invite_context',
        token,
      });
    },
    completeInviteOnboarding: async ({ token, pin, profile } = {}) => {
      const result = await supabaseFunctions.userAdmin({
        action: 'complete_invite_onboarding',
        token,
        pin,
        profile,
      });

      const accessToken = result?.session?.access_token;
      const refreshToken = result?.session?.refresh_token;
      if (!accessToken || !refreshToken) {
        throw new Error('A conclusão do convite não retornou uma sessão válida.');
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;

      const authUser = await getAuthenticatedUser();
      const mergedUser = authUser ? await syncUserProfile(authUser) : (result?.user || null);
      if (mergedUser) {
        markDeviceTrustedForUser(mergedUser);
        supabaseAuth.currentUser = {
          ...mergedUser,
          onboarding_status: 'completo',
          pin_required_reset: false,
        };
      }

      return {
        ok: true,
        session: result?.session || null,
        user: mergedUser || result?.user || null,
      };
    },
    bootstrapDefaultPins: async ({ userId = null, defaultPin = '654321' } = {}) => {
      return supabaseFunctions.userAdmin({
        action: 'bootstrap_default_pins',
        user_id: userId,
        default_pin: defaultPin,
      });
    },
    saveManagedUserAccess: async (payload = {}) => {
      return supabaseFunctions.userAdmin({
        action: 'save_user_access',
        ...payload,
      });
    },
    onAuthStateChange: (callback) => {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          supabaseAuth.currentUser = session.user;
          syncUserProfile(session.user).catch((syncError) => {
            console.warn('onAuthStateChange syncUserProfile error', syncError);
          });
        } else {
          supabaseAuth.currentUser = null;
        }

        if (typeof callback === 'function') {
          callback(event, session);
        }
      });

      return data?.subscription || { unsubscribe() {} };
    },
    logout: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      supabaseAuth.currentUser = null;
      clearStoredActiveUnitId();
      return { ok: true };
    },
    list: async (sort, limit) => {
      try {
        let query = supabase.from('users').select('*');
        if (sort && typeof sort === 'string') {
          const field = sort.replace(/^-/, '');
          const desc = sort.startsWith('-');
          query = query.order(field, { ascending: !desc });
        }
        if (typeof limit === 'number') query = query.limit(limit);
        const { data, error } = await query;
        if (error) {
          console.warn('supabaseAuth.list: users table read error', error.message || error);
          return [];
        }
        return data || [];
      } catch (error) {
        console.warn('supabaseAuth.list error', error);
        return [];
      }
    },
  };

  appClient = {
    entities: supabaseEntities,
    functions: supabaseFunctions,
    integrations: supabaseIntegrations,
    auth: supabaseAuth,
  };
}

export { appClient };
