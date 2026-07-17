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
import {
  buildFinanceWriteFlowMap,
  buildFinanceWriteGovernanceMatrix,
  buildLegacyReceivablesCoverage,
  buildOperationalObservabilityContext,
  buildOperationalReconciliationRows,
  buildPaymentV2Contract,
  isInPeriod,
} from '@/lib/finance-observability';
import { isValidCpfChecksum } from '@/lib/cpf-validation';

const STORAGE_PREFIX = 'local_app_client_';
const makeId = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const APP_SITE_URL = import.meta.env.VITE_SITE_URL;
const MOCK_QA_ROLE_ENV = String(import.meta.env.VITE_MOCK_QA_ROLE || '').trim().toLowerCase();
const SUPABASE_PUBLIC_BUCKET = import.meta.env.VITE_SUPABASE_PUBLIC_BUCKET || 'public-assets';
const SUPABASE_PRIVATE_BUCKET = import.meta.env.VITE_SUPABASE_PRIVATE_BUCKET || 'private-files';
const DEFAULT_EMAIL_WEBHOOK_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/send-email` : '';
const MOCK_QA_ROLE_STORAGE_KEY = `${STORAGE_PREFIX}mock_qa_role`;
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
  'Replacement',
  'PlanConfig',
  'RecurringPackage',
  'PackageSession',
  'PackageCredit',
  'PackageBilling',
  'CarteiraConta',
  'CarteiraMovimento',
  'PagamentoV2Execucao',
  'PagamentoV2Reversao',
  'CarteiraReconciliacao',
  'AutorizacaoFinanceira',
  'CancelamentoFinanceiro',
  'OrcamentoPagamento',
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

function normalizeMockQaRole(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || ['off', 'none', 'neutral', 'false', '0'].includes(normalized)) return null;
  if (['admin', 'administrativo', 'administracao', 'platform_admin', 'platform-admin'].includes(normalized)) {
    return 'platform_admin';
  }
  if (['gerencial', 'managerial', 'financeiro', 'backoffice'].includes(normalized)) {
    return 'gerencial';
  }
  if (['comercial', 'commercial', 'vendas', 'orcamentos'].includes(normalized)) {
    return 'comercial';
  }
  return null;
}

function readMockQaRoleOverride() {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    const localOverride = normalizeMockQaRole(window.localStorage.getItem(MOCK_QA_ROLE_STORAGE_KEY));
    if (localOverride) return localOverride;
  }
  return normalizeMockQaRole(MOCK_QA_ROLE_ENV);
}

function applyMockQaRole(user = {}) {
  const roleOverride = readMockQaRoleOverride();
  const baseUser = {
    ...user,
    company_role: user?.company_role || null,
    is_platform_admin: Boolean(user?.is_platform_admin),
    access_profile_permissions: Array.isArray(user?.access_profile_permissions) ? user.access_profile_permissions : [],
    access_profile_name: user?.access_profile_name || null,
    access_profile_code: user?.access_profile_code || null,
  };

  if (!roleOverride) {
    return {
      ...baseUser,
      company_role: baseUser.company_role === 'platform_admin' ? null : baseUser.company_role,
      is_platform_admin: false,
    };
  }

  if (roleOverride === 'platform_admin') {
    return {
      ...baseUser,
      company_role: 'platform_admin',
      is_platform_admin: true,
      access_profile_name: 'QA Admin',
      access_profile_code: 'qa_admin',
      access_profile_permissions: [],
    };
  }

  if (roleOverride === 'gerencial') {
    return {
      ...baseUser,
      company_role: 'company_user',
      is_platform_admin: false,
      access_profile_name: 'QA Gerencial',
      access_profile_code: 'qa_gerencial',
      access_profile_permissions: ['financeiro:*', 'empresa:*', 'usuarios:read'],
    };
  }

  if (roleOverride === 'comercial') {
    return {
      ...baseUser,
      company_role: 'company_user',
      is_platform_admin: false,
      access_profile_name: 'QA Comercial',
      access_profile_code: 'qa_comercial',
      access_profile_permissions: ['orcamentos:*'],
    };
  }

  return baseUser;
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
  const duplicateProfileCpf = error.code === 'PROFILE_DUPLICATE_CPF'
    || /cpf já está cadastrado para outro|profile_duplicate_cpf/i.test(rawMessage);

  const technicalMessage = missingLancamentoColumn
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
  const isProd = typeof import.meta !== 'undefined' && import.meta.env?.PROD === true;
  const userMessage = duplicateProfileCpf
    ? rawMessage.split(' | ')[0]
    : isProd
      ? 'Ocorreu um erro inesperado. Tente novamente ou entre em contato com o suporte.'
      : technicalMessage;
  if (isProd) console.error('[AppError]', technicalMessage);

  const wrapped = new Error(userMessage);
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

function normalizeProfileCpf(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 11 ? digits : '';
}

function createDuplicateProfileCpfError(entityLabel) {
  const error = new Error(`Este CPF já está cadastrado para outro ${entityLabel} nesta unidade.`);
  error.code = 'PROFILE_DUPLICATE_CPF';
  return error;
}

function createMockEntity(name, options = {}) {
  const {
    unitScoped = false,
    softDelete = false,
    documentField = '',
    entityLabel = 'perfil',
  } = options;
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

  const isRestorableProfile = (item) => {
    if (!item?.deleted_at) return false;
    if (!item?.deletion_expires_at) return true;
    return new Date(item.deletion_expires_at).getTime() > Date.now();
  };

  const assertUniqueProfileCpf = (items, candidate, ignoredId = '') => {
    if (!softDelete || !documentField) return;
    const cpf = normalizeProfileCpf(candidate?.[documentField]);
    if (!cpf) return;

    const candidateUnitId = candidate?.empresa_id || (unitScoped ? getMockScopedUnitId() : '');
    const duplicated = items.some((item) => (
      item?.id !== ignoredId
      && normalizeProfileCpf(item?.[documentField]) === cpf
      && (!unitScoped || (item?.empresa_id || candidateUnitId) === candidateUnitId)
      && (!item?.deleted_at || isRestorableProfile(item))
    ));

    if (duplicated) throw createDuplicateProfileCpfError(entityLabel);
  };

  const getScopedMockItems = ({ includeDeleted = false, onlyDeleted = false } = {}) => ensureMockEntityCodes(readStorage(name))
    .filter((item) => !unitScoped || !item.empresa_id || getMockScopedUnitIds().includes(item.empresa_id))
    .filter((item) => {
      if (!softDelete) return true;
      if (onlyDeleted) return isRestorableProfile(item);
      if (includeDeleted) return true;
      return !item?.deleted_at;
    });

  return {
    list: (sort, limit) => Promise.resolve(
      applyMockQueryOptions(getScopedMockItems(), { sort, limit }).data
    ),
    listAll: (sort, limit) => Promise.resolve(
      applyMockQueryOptions(getScopedMockItems(), { sort, limit }).data
    ),
    listDeleted: (sort = '-deleted_at', limit = 1000) => Promise.resolve(
      applyMockQueryOptions(getScopedMockItems({ onlyDeleted: true }), { sort, limit }).data
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
      assertUniqueProfileCpf(items, item);
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
      assertUniqueProfileCpf(items, nextItem, id);
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

      if (softDelete) {
        const deletedAt = new Date();
        items[idx] = {
          ...items[idx],
          ativo: false,
          deleted_at: deletedAt.toISOString(),
          deletion_expires_at: new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          updated_date: deletedAt.toISOString(),
        };
        writeStorage(name, items);
        return Promise.resolve(items[idx]);
      }

      const [removed] = items.splice(idx, 1);
      writeStorage(name, items);
      return Promise.resolve(removed);
    },
    restore: (id) => {
      if (!softDelete) return Promise.reject(new Error('Esta entidade não permite restauração.'));
      if (unitScoped) ensureSingleUnitWrite(name);
      const items = ensureMockEntityCodes(readStorage(name));
      const idx = items.findIndex((item) => item.id === id);
      if (idx === -1) return Promise.reject(new Error('Perfil excluído não encontrado.'));
      if (!isRestorableProfile(items[idx])) {
        return Promise.reject(new Error('O prazo de 30 dias para desfazer esta exclusão terminou.'));
      }

      const restored = {
        ...items[idx],
        ativo: true,
        deleted_at: null,
        deletion_expires_at: null,
        deleted_by: null,
        updated_date: new Date().toISOString(),
      };
      assertUniqueProfileCpf(items, restored, id);
      items[idx] = restored;
      writeStorage(name, items);
      return Promise.resolve(restored);
    },
  };
}

const defaultEntities = {};
[
  'Dog', 'Checkin', 'Schedule', 'ServiceProvider', 'ServiceProviderSchedule', 'Lancamento', 'ExtratoBancario', 'Despesa',
  'Responsavel', 'Carteira', 'Notificacao', 'Orcamento', 'TabelaPrecos', 'Appointment',
  'ServiceProvided', 'Replacement', 'PlanConfig',
  'RecurringPackage', 'PackageSession', 'PackageCredit', 'PackageBilling', 'CarteiraConta',
  'CarteiraMovimento', 'PagamentoV2Execucao', 'PagamentoV2Reversao', 'CarteiraReconciliacao', 'AutorizacaoFinanceira', 'CancelamentoFinanceiro',
  'OrcamentoPagamento',
  'ObrigacaoFinanceira', 'CobrancaFinanceira', 'CobrancaItem', 'ComissaoEvento',
  'FinanceSnapshot', 'FinanceSnapshotDelta', 'AuditLog',
  'IntegracaoConfig', 'Receita', 'AppConfig', 'AppAsset', 'Empresa', 'PerfilAcesso',
  'UserUnitAccess',
  'UserProfile', 'ContaReceber', 'Client', 'PedidoInterno',
  'CentroCusto',
].forEach((name) => {
  const profileOptions = name === 'Responsavel'
    ? { softDelete: true, documentField: 'cpf', entityLabel: 'Responsável' }
    : name === 'Carteira' || name === 'Client'
      ? { softDelete: true, documentField: 'cpf_cnpj', entityLabel: 'Responsável Financeiro' }
      : {};
  defaultEntities[name] = createMockEntity(name, {
    unitScoped: UNIT_SCOPED_ENTITIES.has(name),
    ...profileOptions,
  });
});

function ensureMockRows(key, rows = []) {
  const existingRows = readStorage(key);
  const existingIds = new Set(existingRows.map((item) => item?.id).filter(Boolean));
  let changed = false;

  rows.forEach((row) => {
    if (!row?.id || existingIds.has(row.id)) return;
    existingRows.push(row);
    existingIds.add(row.id);
    changed = true;
  });

  if (changed) {
    writeStorage(key, existingRows);
  }
}

function formatMockDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildMockIso(dateKey, timeValue = '09:00') {
  return `${dateKey}T${timeValue}:00`;
}

function ensureMockAgendamentosDesktopSeed() {
  if (typeof window === 'undefined' || (SUPABASE_URL && SUPABASE_ANON)) return;

  const today = new Date();
  const todayKey = formatMockDateKey(today);
  const seedCreatedAt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 6, 0, 0).toISOString();
  const companies = [
    {
      id: 'empresa_demo',
      codigo: 'MTZ',
      nome_fantasia: 'Unidade Matriz',
      nome: 'Dog City Brasil',
      ativo: true,
      created_date: seedCreatedAt,
    },
  ];

  const carteiras = [
    {
      id: 'mock_wallet_juliana',
      empresa_id: 'empresa_demo',
      nome_razao_social: 'Juliana Costa',
      celular: '19990000001',
      email: 'juliana.costa@mock.local',
      dog_id_1: 'mock_dog_zaya',
      ativo: true,
      created_date: seedCreatedAt,
    },
    {
      id: 'mock_wallet_joao',
      empresa_id: 'empresa_demo',
      nome_razao_social: 'Joao Silva',
      celular: '19990000002',
      email: 'joao.silva@mock.local',
      dog_id_1: 'mock_dog_theo',
      ativo: true,
      created_date: seedCreatedAt,
    },
    {
      id: 'mock_wallet_felipe',
      empresa_id: 'empresa_demo',
      nome_razao_social: 'Felipe Andrade',
      celular: '19990000003',
      email: 'felipe.andrade@mock.local',
      dog_id_1: 'mock_dog_bolt',
      ativo: true,
      created_date: seedCreatedAt,
    },
    {
      id: 'mock_wallet_ana',
      empresa_id: 'empresa_demo',
      nome_razao_social: 'Ana Beatriz',
      celular: '19990000004',
      email: 'ana.beatriz@mock.local',
      dog_id_1: 'mock_dog_nina',
      ativo: true,
      created_date: seedCreatedAt,
    },
    {
      id: 'mock_wallet_roberto',
      empresa_id: 'empresa_demo',
      nome_razao_social: 'Roberto Alves',
      celular: '19990000005',
      email: 'roberto.alves@mock.local',
      dog_id_1: 'mock_dog_mel',
      ativo: true,
      created_date: seedCreatedAt,
    },
    {
      id: 'mock_wallet_mariana',
      empresa_id: 'empresa_demo',
      nome_razao_social: 'Mariana Lima',
      celular: '19990000006',
      email: 'mariana.lima@mock.local',
      dog_id_1: 'mock_dog_luke',
      ativo: true,
      created_date: seedCreatedAt,
    },
  ];

  const dogs = [
    { id: 'mock_dog_zaya', empresa_id: 'empresa_demo', cliente_id: 'mock_wallet_juliana', nome: 'Zaya', raca: 'Poodle', ativo: true, created_date: seedCreatedAt },
    { id: 'mock_dog_theo', empresa_id: 'empresa_demo', cliente_id: 'mock_wallet_joao', nome: 'Theo', raca: 'Golden Retriever', ativo: true, created_date: seedCreatedAt },
    { id: 'mock_dog_bolt', empresa_id: 'empresa_demo', cliente_id: 'mock_wallet_felipe', nome: 'Bolt', raca: 'Bulldog Francês', ativo: true, created_date: seedCreatedAt },
    { id: 'mock_dog_nina', empresa_id: 'empresa_demo', cliente_id: 'mock_wallet_ana', nome: 'Nina', raca: 'Dachshund', ativo: true, created_date: seedCreatedAt },
    { id: 'mock_dog_mel', empresa_id: 'empresa_demo', cliente_id: 'mock_wallet_roberto', nome: 'Mel', raca: 'Shih Tzu', ativo: true, created_date: seedCreatedAt },
    { id: 'mock_dog_luke', empresa_id: 'empresa_demo', cliente_id: 'mock_wallet_mariana', nome: 'Luke', raca: 'Labrador', ativo: true, created_date: seedCreatedAt },
  ];

  const orcamentos = [
    { id: 'mock_orc_zaya', empresa_id: 'empresa_demo', dog_id: 'mock_dog_zaya', cliente_id: 'mock_wallet_juliana', status: 'aprovado', titulo: 'Day Care Zaya', created_date: seedCreatedAt },
    { id: 'mock_orc_theo', empresa_id: 'empresa_demo', dog_id: 'mock_dog_theo', cliente_id: 'mock_wallet_joao', status: 'aprovado', titulo: 'Transporte Theo', created_date: seedCreatedAt },
    { id: 'mock_orc_bolt', empresa_id: 'empresa_demo', dog_id: 'mock_dog_bolt', cliente_id: 'mock_wallet_felipe', status: 'aprovado', titulo: 'Day Care Bolt', created_date: seedCreatedAt },
    { id: 'mock_orc_nina', empresa_id: 'empresa_demo', dog_id: 'mock_dog_nina', cliente_id: 'mock_wallet_ana', status: 'aprovado', titulo: 'Hospedagem Nina', created_date: seedCreatedAt },
    { id: 'mock_orc_luke', empresa_id: 'empresa_demo', dog_id: 'mock_dog_luke', cliente_id: 'mock_wallet_mariana', status: 'aprovado', titulo: 'Transporte Luke', created_date: seedCreatedAt },
  ];

  const appointments = [
    {
      id: 'mock_ag_daycare_arrived_zaya',
      empresa_id: 'empresa_demo',
      dog_id: 'mock_dog_zaya',
      cliente_id: 'mock_wallet_juliana',
      orcamento_id: 'mock_orc_zaya',
      service_type: 'day_care',
      status: 'agendado',
      charge_type: 'avulso',
      source_type: 'orcamento_aprovado',
      data_referencia: todayKey,
      data_hora_entrada: buildMockIso(todayKey, '07:30'),
      data_hora_saida: buildMockIso(todayKey, '18:00'),
      hora_entrada: '07:30',
      hora_saida: '18:00',
      valor_previsto: 48,
      metadata: { owner_nome: 'Juliana Costa' },
      created_date: buildMockIso(todayKey, '07:00'),
    },
    {
      id: 'mock_ag_transport_arrived_theo',
      empresa_id: 'empresa_demo',
      dog_id: 'mock_dog_theo',
      cliente_id: 'mock_wallet_joao',
      orcamento_id: 'mock_orc_theo',
      service_type: 'transporte',
      status: 'agendado',
      charge_type: 'avulso',
      source_type: 'orcamento_aprovado',
      data_referencia: todayKey,
      data_hora_entrada: buildMockIso(todayKey, '08:00'),
      data_hora_saida: buildMockIso(todayKey, '08:40'),
      hora_entrada: '08:00',
      hora_saida: '08:40',
      valor_previsto: 18,
      metadata: { owner_nome: 'Joao Silva' },
      created_date: buildMockIso(todayKey, '07:15'),
    },
    {
      id: 'mock_ag_daycare_late_bolt',
      empresa_id: 'empresa_demo',
      dog_id: 'mock_dog_bolt',
      cliente_id: 'mock_wallet_felipe',
      orcamento_id: 'mock_orc_bolt',
      service_type: 'day_care',
      status: 'agendado',
      charge_type: 'avulso',
      source_type: 'orcamento_aprovado',
      data_referencia: todayKey,
      data_hora_entrada: buildMockIso(todayKey, '08:30'),
      data_hora_saida: buildMockIso(todayKey, '18:00'),
      hora_entrada: '08:30',
      hora_saida: '18:00',
      valor_previsto: 48,
      metadata: { owner_nome: 'Felipe Andrade' },
      created_date: buildMockIso(todayKey, '07:30'),
    },
    {
      id: 'mock_ag_hosp_late_nina',
      empresa_id: 'empresa_demo',
      dog_id: 'mock_dog_nina',
      cliente_id: 'mock_wallet_ana',
      orcamento_id: 'mock_orc_nina',
      service_type: 'hospedagem',
      status: 'agendado',
      charge_type: 'avulso',
      source_type: 'orcamento_aprovado',
      data_referencia: todayKey,
      data_hora_entrada: buildMockIso(todayKey, '09:00'),
      data_hora_saida: buildMockIso(todayKey, '17:30'),
      hora_entrada: '09:00',
      hora_saida: '17:30',
      valor_previsto: 120,
      metadata: { owner_nome: 'Ana Beatriz' },
      created_date: buildMockIso(todayKey, '07:45'),
    },
    {
      id: 'mock_ag_banho_pending_mel',
      empresa_id: 'empresa_demo',
      dog_id: 'mock_dog_mel',
      cliente_id: 'mock_wallet_roberto',
      service_type: 'banho',
      status: 'agendado',
      charge_type: 'pendente_comercial',
      source_type: 'manual_registrador',
      data_referencia: todayKey,
      data_hora_entrada: buildMockIso(todayKey, '09:30'),
      data_hora_saida: buildMockIso(todayKey, '10:30'),
      hora_entrada: '09:30',
      hora_saida: '10:30',
      valor_previsto: 65,
      metadata: {
        owner_nome: 'Roberto Alves',
        manual_monitor_nome: 'Equipe Comercial',
        commercial_review_pending: true,
      },
      created_date: buildMockIso(todayKey, '08:00'),
    },
    {
      id: 'mock_ag_transport_upcoming_luke',
      empresa_id: 'empresa_demo',
      dog_id: 'mock_dog_luke',
      cliente_id: 'mock_wallet_mariana',
      orcamento_id: 'mock_orc_luke',
      service_type: 'transporte',
      status: 'agendado',
      charge_type: 'avulso',
      source_type: 'orcamento_aprovado',
      data_referencia: todayKey,
      data_hora_entrada: buildMockIso(todayKey, '21:00'),
      data_hora_saida: buildMockIso(todayKey, '21:40'),
      hora_entrada: '21:00',
      hora_saida: '21:40',
      valor_previsto: 18,
      metadata: { owner_nome: 'Mariana Lima' },
      created_date: buildMockIso(todayKey, '08:15'),
    },
    {
      id: 'mock_ag_misc_visit_upcoming',
      empresa_id: 'empresa_demo',
      service_type: 'diversos',
      status: 'agendado',
      charge_type: 'avulso',
      source_type: 'manual_registrador',
      data_referencia: todayKey,
      data_hora_entrada: buildMockIso(todayKey, '21:30'),
      data_hora_saida: buildMockIso(todayKey, '22:00'),
      hora_entrada: '21:30',
      hora_saida: '22:00',
      valor_previsto: 0,
      metadata: {
        manual_monitor_nome: 'Recepcao',
        misc_title: 'Visita de cliente',
        misc_subtitle: 'Visita agendada',
        misc_owner_name: 'Cliente: PetCorretor',
        misc_detail_label: 'Contato: Juliana Costa',
        misc_service_label: 'Visita comercial',
      },
      created_date: buildMockIso(todayKey, '08:30'),
    },
    {
      id: 'mock_ag_misc_repair_upcoming',
      empresa_id: 'empresa_demo',
      service_type: 'diversos',
      status: 'agendado',
      charge_type: 'avulso',
      source_type: 'manual_registrador',
      data_referencia: todayKey,
      data_hora_entrada: buildMockIso(todayKey, '22:00'),
      data_hora_saida: buildMockIso(todayKey, '23:00'),
      hora_entrada: '22:00',
      hora_saida: '23:00',
      valor_previsto: 0,
      metadata: {
        manual_monitor_nome: 'Recepcao',
        misc_title: 'Reparo tecnico',
        misc_subtitle: 'Manutencao',
        misc_owner_name: 'Responsavel: TechFix',
        misc_detail_label: 'Prestador de servico',
        misc_service_label: 'Suporte tecnico',
      },
      created_date: buildMockIso(todayKey, '08:45'),
    },
    {
      id: 'mock_ag_misc_visit_noshow',
      empresa_id: 'empresa_demo',
      service_type: 'diversos',
      status: 'faltou',
      charge_type: 'avulso',
      source_type: 'manual_registrador',
      data_referencia: todayKey,
      data_hora_entrada: buildMockIso(todayKey, '11:00'),
      data_hora_saida: buildMockIso(todayKey, '11:30'),
      hora_entrada: '11:00',
      hora_saida: '11:30',
      valor_previsto: 0,
      metadata: {
        manual_monitor_nome: 'Equipe Comercial',
        absence_confirmed_at: buildMockIso(todayKey, '11:35'),
        misc_title: 'Visita de prospeccao',
        misc_subtitle: 'Não compareceu',
        misc_owner_name: 'Cliente: PetCorretor',
        misc_detail_label: 'Agendado pela equipe comercial',
        misc_service_label: 'Visita comercial',
      },
      created_date: buildMockIso(todayKey, '09:00'),
    },
  ];

  const checkins = [
    {
      id: 'mock_checkin_zaya',
      empresa_id: 'empresa_demo',
      appointment_id: 'mock_ag_daycare_arrived_zaya',
      dog_id: 'mock_dog_zaya',
      dog_nome: 'Zaya',
      service_type: 'day_care',
      tipo: 'pet',
      checkin_datetime: buildMockIso(todayKey, '07:22'),
      created_date: buildMockIso(todayKey, '07:22'),
      checkin_monitor_nome: 'Juliana Costa',
      entregador_nome: 'Juliana Costa',
      status: 'presente',
    },
    {
      id: 'mock_checkin_theo',
      empresa_id: 'empresa_demo',
      appointment_id: 'mock_ag_transport_arrived_theo',
      dog_id: 'mock_dog_theo',
      dog_nome: 'Theo',
      service_type: 'transporte',
      tipo: 'pet',
      checkin_datetime: buildMockIso(todayKey, '07:55'),
      created_date: buildMockIso(todayKey, '07:55'),
      checkin_monitor_nome: 'Equipe de Transporte',
      entregador_nome: 'Joao Silva',
      status: 'presente',
    },
  ];

  if (!getStoredActiveUnitId()) {
    setStoredUnitSelection({
      primaryUnitId: 'empresa_demo',
      selectedUnitIds: ['empresa_demo'],
    });
  }

  ensureMockRows('Empresa', companies);
  ensureMockRows('Carteira', carteiras);
  ensureMockRows('Dog', dogs);
  ensureMockRows('Orcamento', orcamentos);
  ensureMockRows('Appointment', appointments);
  ensureMockRows('Checkin', checkins);
}

ensureMockAgendamentosDesktopSeed();

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

function getMockObservabilityFlags(empresaId) {
  return {
    operational_observability_enabled: getMockFlagValue('finance.operational_observability_enabled', empresaId),
    write_governance_enabled: getMockFlagValue('finance.write_governance_enabled', empresaId),
    payment_v2_contract_enabled: getMockFlagValue('finance.payment_v2_contract_enabled', empresaId),
    ...getMockCockpitFlags(empresaId),
    ...getMockReportsFlags(empresaId),
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
  const bankTransactions = readStorage('ExtratoBancario')
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
    recebimentos_total: bankTransactions
      .filter((item) => item?.type === 'entrada' || item?.tipo === 'entrada')
      .filter((item) => !periodoInicio && !periodoFim ? true : isInPeriod(item?.data_movimento || item?.date || item?.data_transacao || item?.created_date))
      .reduce((sum, item) => sum + Number(item?.value ?? item?.valor ?? 0), 0),
    pendencias_total: contasReceber
      .filter((item) => (item?.status || 'pendente') !== 'pago' && !item?.data_recebimento)
      .reduce((sum, item) => sum + Number(item?.valor || 0), 0),
    faturamento_real_total: bankTransactions
      .filter((item) => item?.type === 'entrada' || item?.tipo === 'entrada')
      .filter((item) => !periodoInicio && !periodoFim ? true : isInPeriod(item?.data_movimento || item?.date || item?.data_transacao || item?.created_date))
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

function persistMockPaymentV2Execution(row = {}) {
  const execucoes = readStorage('PagamentoV2Execucao');
  const now = new Date().toISOString();
  const existingIndex = execucoes.findIndex(
    (item) => item?.empresa_id === row?.empresa_id && item?.operacao_idempotencia === row?.operacao_idempotencia,
  );
  const nextRow = {
    id: row?.id || makeId(),
    metadata: row?.metadata || {},
    created_date: row?.created_date || now,
    updated_date: now,
    ...row,
  };

  if (existingIndex >= 0) {
    execucoes[existingIndex] = {
      ...execucoes[existingIndex],
      ...nextRow,
      id: execucoes[existingIndex]?.id || nextRow.id,
      created_date: execucoes[existingIndex]?.created_date || nextRow.created_date,
      updated_date: now,
    };
    writeStorage('PagamentoV2Execucao', execucoes);
    return execucoes[existingIndex];
  }

  execucoes.push(nextRow);
  writeStorage('PagamentoV2Execucao', execucoes);
  return nextRow;
}

function buildMockPaymentV2Response(execucao = {}, forcedClass = null) {
  const movimento = execucao?.carteira_movimento_id
    ? readStorage('CarteiraMovimento').find((item) => item?.id === execucao.carteira_movimento_id)
    : null;

  return {
    execucao_id: execucao?.id || null,
    classe_resultado: forcedClass || execucao?.classe_resultado || 'falha_controlada',
    carteira_movimento_id: execucao?.carteira_movimento_id || null,
    carteira_alocacao_id: execucao?.carteira_alocacao_id || null,
    carteira_conta_id: execucao?.carteira_conta_id || null,
    obrigacao_id: execucao?.obrigacao_id || null,
    cobranca_financeira_id: execucao?.cobranca_financeira_id || null,
    operacao_idempotencia: execucao?.operacao_idempotencia || null,
    source_key: execucao?.source_key || null,
    saldo_anterior: movimento ? Number(movimento?.saldo_anterior || 0) : null,
    saldo_final: movimento ? Number(movimento?.saldo_final || 0) : null,
    reason_code: execucao?.reason_code || null,
    reason_message: execucao?.reason_message || null,
    reused: Boolean(execucao?.reused),
  };
}

function buildMockPaymentV2AuditRows(empresaId, limit = 100) {
  const obrigacoes = readStorage('ObrigacaoFinanceira');
  const cobrancas = readStorage('CobrancaFinanceira');
  const movimentos = readStorage('CarteiraMovimento');

  return readStorage('PagamentoV2Execucao')
    .filter((item) => item?.empresa_id === empresaId)
    .sort((left, right) => new Date(right?.created_date || 0).getTime() - new Date(left?.created_date || 0).getTime())
    .slice(0, Math.max(1, Math.min(Number(limit) || 100, 500)))
    .map((item) => {
      const obrigacao = obrigacoes.find((entry) => entry?.id === item?.obrigacao_id);
      const cobranca = cobrancas.find((entry) => entry?.id === item?.cobranca_financeira_id);
      const movimento = movimentos.find((entry) => entry?.id === item?.carteira_movimento_id);

      return {
        execucao_id: item?.id || null,
        empresa_id: item?.empresa_id || null,
        carteira_conta_id: item?.carteira_conta_id || null,
        obrigacao_id: item?.obrigacao_id || null,
        obrigacao_status: obrigacao?.status || null,
        cobranca_financeira_id: item?.cobranca_financeira_id || null,
        cobranca_status: cobranca?.status || null,
        carteira_movimento_id: item?.carteira_movimento_id || null,
        movimento_tipo: movimento?.tipo || null,
        operacao_idempotencia: item?.operacao_idempotencia || null,
        source_key: item?.source_key || null,
        forma_pagamento: item?.forma_pagamento || null,
        origem_operacional: item?.origem_operacional || null,
        valor_solicitado: Number(item?.valor_solicitado || 0),
        classe_resultado: item?.classe_resultado || null,
        reason_code: item?.reason_code || null,
        reason_message: item?.reason_message || null,
        created_date: item?.created_date || null,
        metadata: item?.metadata || {},
      };
    });
}

function appendMockNote(existingValue, nextLine) {
  const current = String(existingValue || '').trim();
  const extra = String(nextLine || '').trim();
  if (!current) return extra;
  if (!extra) return current;
  return `${current}\n${extra}`;
}

function persistMockPaymentV2Reversal(row = {}) {
  const reversoes = readStorage('PagamentoV2Reversao');
  const now = new Date().toISOString();
  const existingIndex = reversoes.findIndex(
    (item) => item?.empresa_id === row?.empresa_id && item?.operacao_idempotencia === row?.operacao_idempotencia,
  );
  const nextRow = {
    id: row?.id || makeId(),
    metadata: row?.metadata || {},
    created_date: row?.created_date || now,
    updated_date: now,
    ...row,
  };

  if (existingIndex >= 0) {
    reversoes[existingIndex] = {
      ...reversoes[existingIndex],
      ...nextRow,
      id: reversoes[existingIndex]?.id || nextRow.id,
      created_date: reversoes[existingIndex]?.created_date || nextRow.created_date,
      updated_date: now,
    };
    writeStorage('PagamentoV2Reversao', reversoes);
    return reversoes[existingIndex];
  }

  reversoes.push(nextRow);
  writeStorage('PagamentoV2Reversao', reversoes);
  return nextRow;
}

function buildMockPaymentV2ReversalResponse(reversao = {}, forcedClass = null) {
  const movimento = reversao?.carteira_movimento_id
    ? readStorage('CarteiraMovimento').find((item) => item?.id === reversao.carteira_movimento_id)
    : null;

  return {
    reversao_id: reversao?.id || null,
    classe_resultado: forcedClass || reversao?.classe_resultado || 'falha_controlada',
    reversao_tipo: reversao?.reversao_tipo || null,
    carteira_movimento_id: reversao?.carteira_movimento_id || null,
    carteira_conta_id: reversao?.carteira_conta_id || null,
    appointment_id: reversao?.appointment_id || null,
    serviceprovided_id: reversao?.serviceprovided_id || null,
    obrigacao_id: reversao?.obrigacao_id || null,
    cobranca_financeira_id: reversao?.cobranca_financeira_id || null,
    conta_receber_id: reversao?.conta_receber_id || null,
    operacao_idempotencia: reversao?.operacao_idempotencia || null,
    source_key: reversao?.source_key || null,
    valor_estornado: Number(reversao?.valor_estornado || 0),
    saldo_anterior: movimento ? Number(movimento?.saldo_anterior || 0) : null,
    saldo_final: movimento ? Number(movimento?.saldo_final || 0) : null,
    servico_realizado: reversao?.servico_realizado ?? null,
    reason_code: reversao?.reason_code || null,
    reason_message: reversao?.reason_message || null,
    reused: Boolean(reversao?.reused),
  };
}

function buildMockPaymentV2ReversalAuditRows(empresaId, limit = 100) {
  const appointments = readStorage('Appointment');
  const services = readStorage('ServiceProvided');
  const obrigacoes = readStorage('ObrigacaoFinanceira');
  const cobrancas = readStorage('CobrancaFinanceira');
  const contasReceber = readStorage('ContaReceber');
  const movimentos = readStorage('CarteiraMovimento');

  return readStorage('PagamentoV2Reversao')
    .filter((item) => item?.empresa_id === empresaId)
    .sort((left, right) => new Date(right?.created_date || 0).getTime() - new Date(left?.created_date || 0).getTime())
    .slice(0, Math.max(1, Math.min(Number(limit) || 100, 500)))
    .map((item) => {
      const appointment = appointments.find((entry) => entry?.id === item?.appointment_id);
      const service = services.find((entry) => entry?.id === item?.serviceprovided_id);
      const obrigacao = obrigacoes.find((entry) => entry?.id === item?.obrigacao_id);
      const cobranca = cobrancas.find((entry) => entry?.id === item?.cobranca_financeira_id);
      const contaReceber = contasReceber.find((entry) => entry?.id === item?.conta_receber_id);
      const movimento = movimentos.find((entry) => entry?.id === item?.carteira_movimento_id);

      return {
        reversao_id: item?.id || null,
        empresa_id: item?.empresa_id || null,
        reversao_tipo: item?.reversao_tipo || null,
        carteira_conta_id: item?.carteira_conta_id || null,
        carteira_movimento_id: item?.carteira_movimento_id || null,
        movimento_tipo: movimento?.tipo || null,
        pagamento_v2_execucao_id: item?.pagamento_v2_execucao_id || null,
        appointment_id: item?.appointment_id || null,
        appointment_status: appointment?.status || null,
        serviceprovided_id: item?.serviceprovided_id || null,
        serviceprovided_status: service?.status || null,
        serviceprovided_status_pagamento: service?.status_pagamento || null,
        obrigacao_id: item?.obrigacao_id || null,
        obrigacao_status: obrigacao?.status || null,
        cobranca_financeira_id: item?.cobranca_financeira_id || null,
        cobranca_status: cobranca?.status || null,
        conta_receber_id: item?.conta_receber_id || null,
        conta_receber_status: contaReceber?.status || null,
        operacao_idempotencia: item?.operacao_idempotencia || null,
        source_key: item?.source_key || null,
        valor_estornado: Number(item?.valor_estornado || 0),
        servico_realizado: item?.servico_realizado ?? null,
        attachment_name: item?.attachment_name || null,
        attachment_path: item?.attachment_path || null,
        attachment_extension: item?.attachment_extension || null,
        motivo: item?.motivo || null,
        classe_resultado: item?.classe_resultado || null,
        reason_code: item?.reason_code || null,
        reason_message: item?.reason_message || null,
        created_date: item?.created_date || null,
        metadata: item?.metadata || {},
      };
    });
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

const MOCK_INTER_CHARGE_PDF_BASE64 = "JVBERi0xLjQKMSAwIG9iago8PC9UeXBlIC9DYXRhbG9nIC9QYWdlcyAyIDAgUj4+CmVuZG9iagoyIDAgb2JqCjw8L1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlIC9QYWdlIC9QYXJlbnQgMiAwIFIgL01lZGlhQm94IFswIDAgMzAwIDE0NF0gL0NvbnRlbnRzIDQgMCBSIC9SZXNvdXJjZXMgPDwvRm9udCA8PC9GMSA1IDAgUj4+Pj4+PgplbmRvYmoKNCAwIG9iago8PC9MZW5ndGggNzI+PgpzdHJlYW0KQlQgL0YxIDE0IFRmIDM2IDEwNCBUZCAoRG9nIENpdHkgLSBCb2xldG8gZGUgVGVzdGUpIFRqIFQqIChVc2UgZXN0ZSBQREYgYXBlbmFzIHBhcmEgUUEuKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2E+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNjAgMDAwMDAgbiAKMDAwMDAwMDExNyAwMDAwMCBuIAowMDAwMDAwMjQzIDAwMDAwIG4gCjAwMDAwMDAzNjYgMDAwMDAgbiAKdHJhaWxlcgo8PC9Sb290IDEgMCBSIC9TaXplIDY+PgpzdGFydHhyZWYKNDU0CiUlRU9G";

function generateMockChargeCode(length = 44) {
  const digits = Array.from({ length }, () => Math.floor(Math.random() * 10));
  return digits.join('');
}

function formatMockChargeLine(barcode) {
  const source = String(barcode || '').replace(/\D/g, '').padEnd(47, '0').slice(0, 47);
  return `${source.slice(0, 5)}.${source.slice(5, 10)} ${source.slice(10, 15)}.${source.slice(15, 21)} ${source.slice(21, 26)}.${source.slice(26, 32)} ${source.slice(32, 33)} ${source.slice(33)}`.trim();
}

function buildMockBudgetChargePix(codigoSolicitacao) {
  return `00020101021226760014BR.GOV.BCB.PIX2554mock.pix.dogcity/${codigoSolicitacao}5204000053039865802BR5920DOG CITY BRASIL6009SAO PAULO62070503***6304ABCD`;
}

function getMockBudgetPaymentRows(orcamentoId) {
  return readStorage('OrcamentoPagamento')
    .filter((item) => !orcamentoId || item?.orcamento_id === orcamentoId)
    .sort((left, right) => new Date(right?.created_date || 0).getTime() - new Date(left?.created_date || 0).getTime());
}

function buildMockBudgetPaymentResponse(row = {}) {
  return {
    ok: true,
    payment: row,
    cobranca: {
      codigoSolicitacao: row?.codigo_solicitacao || null,
      seuNumero: row?.seu_numero || null,
      situacao: row?.status_inter || row?.status || null,
      valorNominal: Number(row?.valor || 0),
    },
    boleto: {
      nossoNumero: row?.nosso_numero || null,
      codigoBarras: row?.codigo_barras || null,
      linhaDigitavel: row?.linha_digitavel || null,
    },
    pix: {
      txid: row?.txid || null,
      pixCopiaECola: row?.pix_copia_cola || null,
    },
  };
}

function resolveMockWalletAccountForCarteira(carteiraId, empresaId = null) {
  return readStorage('CarteiraConta').find((item) =>
    item?.carteira_id === carteiraId && (!empresaId || item?.empresa_id === empresaId)
  ) || null;
}

function applyMockBudgetPaymentToWallet(row = {}) {
  if (row?.credited_wallet_movement_id || !row?.carteira_conta_id) return row;

  const normalizeSearchText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const extratoMatch = readStorage('ExtratoBancario')
    .filter((item) => Number(item?.valor || 0) === Number(row?.valor_recebido || row?.valor || 0))
    .map((item) => {
      const expectedName = normalizeSearchText(row?.metadata?.responsavel_nome || '');
      const candidateName = normalizeSearchText(item?.nome_contraparte || item?.descricao || '');
      const expectedDate = String(row?.pago_em || row?.updated_date || row?.created_date || '').slice(0, 10);
      const candidateDate = String(item?.data_hora_transacao || item?.created_date || item?.data_movimento || '').slice(0, 10);
      let score = 0;
      if (expectedName && candidateName.includes(expectedName)) score += 3;
      if (expectedName && expectedName.split(' ').every((token) => token && candidateName.includes(token))) score += 2;
      if (expectedDate && candidateDate === expectedDate) score += 2;
      return { item, score };
    })
    .sort((left, right) => right.score - left.score)[0];

  const walletResult = applyMockWalletOperationCore({
    carteira_conta_id: row.carteira_conta_id,
    operacao_idempotencia: `orcamento_pagamento|${row.id}|recebido`,
    tipo: 'entrada_direcionada',
    natureza: 'entrada',
    origem: 'orcamento_pagamento_boleto',
    valor: Number(row?.valor_recebido || row?.valor || 0),
    referencia_amigavel: `Recarga do orçamento ${row?.orcamento_id || ''}`.trim(),
    descricao: `Cobrança do orçamento ${row?.orcamento_id || ''}`.trim(),
    transacao_id: extratoMatch?.score >= 2 ? (extratoMatch.item?.id || null) : null,
    usuario_id: row?.created_by_user_id || null,
    metadata: {
      orcamento_pagamento_id: row.id,
      orcamento_id: row.orcamento_id || null,
      source: 'orcamento_pagamento_recebido',
    },
    permitir_saldo_negativo: true,
  });

  return {
    ...row,
    credited_wallet_movement_id: walletResult?.movimento_id || null,
    creditado_em: new Date().toISOString(),
  };
}

const mockFunctions = {
  notificacoesOrcamento: async (payload) => {
    console.info('[mock] notificacoesOrcamento called with', payload);
    return { ok: true };
  },
  bancoInter: async (payload = {}) => {
    console.info('[mock] bancoInter called with', payload);
    if (payload?.action === 'issueBudgetCharge') {
      const orcamentoId = String(payload?.orcamento_id || '').trim();
      const carteiraId = String(payload?.carteira_id || '').trim();
      const empresaId = String(payload?.empresa_id || '').trim() || getMockScopedUnitId();
      const responsavelId = String(payload?.responsavel_id || '').trim() || null;
      const valor = Number(payload?.valor || 0);
      const metodo = String(payload?.metodo || 'boleto_bancario').trim() || 'boleto_bancario';

      if (!orcamentoId) throw new Error('orcamento_id é obrigatório para emitir a cobrança do orçamento.');
      if (!carteiraId) throw new Error('carteira_id é obrigatório para emitir a cobrança do orçamento.');
      if (!Number.isFinite(valor) || valor <= 0) throw new Error('valor precisa ser maior que zero para emitir a cobrança do orçamento.');

      const rows = readStorage('OrcamentoPagamento');
      const existing = rows.find((item) =>
        item?.orcamento_id === orcamentoId
        && item?.empresa_id === empresaId
        && item?.metodo === metodo
        && !['cancelado', 'expirado'].includes(String(item?.status || '').toLowerCase())
      );
      if (existing) {
        return buildMockBudgetPaymentResponse(existing);
      }

      const walletAccount = resolveMockWalletAccountForCarteira(carteiraId, empresaId);
      const codigoSolicitacao = crypto.randomUUID();
      const codigoBarras = generateMockChargeCode(44);
      const now = new Date().toISOString();
      const row = {
        id: makeId(),
        empresa_id: empresaId,
        orcamento_id: orcamentoId,
        carteira_id: carteiraId,
        carteira_conta_id: walletAccount?.id || null,
        responsavel_id: responsavelId,
        provider: 'banco_inter',
        metodo,
        status: 'emitido',
        status_inter: 'A_RECEBER',
        valor,
        seu_numero: `orc${String(orcamentoId).replace(/[^a-zA-Z0-9]/g, '').slice(-11) || makeId().slice(-11)}`,
        codigo_solicitacao: codigoSolicitacao,
        nosso_numero: generateMockChargeCode(12),
        txid: crypto.randomUUID().replace(/-/g, '').slice(0, 32),
        linha_digitavel: formatMockChargeLine(codigoBarras),
        codigo_barras: codigoBarras,
        pix_copia_cola: buildMockBudgetChargePix(codigoSolicitacao),
        pdf_disponivel: true,
        pago_em: null,
        valor_recebido: 0,
        credited_wallet_movement_id: null,
        creditado_em: null,
        created_by_user_id: payload?.usuario_id || null,
        metadata: {
          responsavel_nome: payload?.responsavel_nome || '',
          responsavel_cpf_cnpj: payload?.responsavel_cpf_cnpj || '',
          responsavel_email: payload?.responsavel_email || '',
          responsavel_telefone: payload?.responsavel_telefone || '',
          vencimento: payload?.data_vencimento || null,
          mock_pdf_base64: MOCK_INTER_CHARGE_PDF_BASE64,
        },
        created_date: now,
        updated_date: now,
      };
      rows.push(row);
      writeStorage('OrcamentoPagamento', rows);
      return buildMockBudgetPaymentResponse(row);
    }

    if (payload?.action === 'refreshBudgetChargeStatus') {
      const paymentId = String(payload?.orcamento_pagamento_id || '').trim();
      const rows = readStorage('OrcamentoPagamento');
      const index = rows.findIndex((item) => item?.id === paymentId || item?.codigo_solicitacao === paymentId);
      if (index < 0) throw new Error('Cobrança do orçamento não localizada.');

      let row = rows[index];
      if ((payload?.simulate_payment || row?.metadata?.mock_auto_paid) && !row?.pago_em) {
        row = {
          ...row,
          status: 'recebido',
          status_inter: 'RECEBIDO',
          pago_em: new Date().toISOString(),
          valor_recebido: Number(row?.valor || 0),
          updated_date: new Date().toISOString(),
        };
        row = applyMockBudgetPaymentToWallet(row);
        rows[index] = row;
        writeStorage('OrcamentoPagamento', rows);
      }

      return buildMockBudgetPaymentResponse(rows[index]);
    }

    if (payload?.action === 'downloadBudgetChargePdf') {
      const paymentId = String(payload?.orcamento_pagamento_id || '').trim();
      const row = readStorage('OrcamentoPagamento').find((item) => item?.id === paymentId || item?.codigo_solicitacao === paymentId);
      if (!row) throw new Error('Cobrança do orçamento não localizada.');
      return {
        ok: true,
        file_name: `boleto-orcamento-${row.orcamento_id || row.id}.pdf`,
        pdf: row?.metadata?.mock_pdf_base64 || MOCK_INTER_CHARGE_PDF_BASE64,
      };
    }

    if (payload?.action === 'transactionReceipt') {
      return {
        success: true,
        action: 'transactionReceipt',
        movement_id: payload?.movement_id || 'mock-transaction',
        receipt_available: true,
        receipt_format: 'bank_details',
        official_pdf: false,
        source: 'mock_banco_inter_transaction_api',
        message: 'Dados da transação consultados em tempo real no Banco Inter.',
        details: {
          description: 'Pix recebido',
          direction: 'Entrada',
          amount: 150,
          transaction_date: new Date().toISOString(),
          transaction_type: 'Pix',
          counterparty_name: 'Cliente de teste',
          counterparty_document: '***.***.***-00',
          status: 'Processado',
          provider_reference: crypto.randomUUID(),
          end_to_end_id: 'E0041696820260717000000000000000',
        },
      };
    }

    if (payload?.action === 'diagnoseCapabilities') {
      const capabilities = [
        ['banking_read', 'Extrato e saldo', 'extrato.read saldo.read'],
        ['pix_received_read', 'Pix recebidos', 'pix.read'],
        ['pix_payment_read', 'Pagamentos Pix', 'pagamento-pix.read'],
        ['boleto_payment_read', 'Pagamentos de boletos', 'pagamento-boleto.read'],
        ['charge_read', 'Consulta de cobrancas', 'boleto-cobranca.read'],
        ['charge_write', 'Emissao de cobrancas', 'boleto-cobranca.write'],
        ['official_receipt_pdf', 'Comprovante individual oficial', 'extrato.read'],
      ].map(([key, label, scope]) => ({
        key,
        label,
        scope,
        status: 'available',
        message: 'Scope aceito pelo mock do Banco Inter.',
      }));
      return {
        success: true,
        action: 'diagnoseCapabilities',
        message: 'Todas as capacidades configuradas foram aceitas pelo mock do Banco Inter.',
        capabilities,
      };
    }

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
      const normalizedCpf = String(payload?.cpf || '').replace(/\D/g, '');
      return {
        ok: true,
        configured: false,
        valid_format: isValidCpfChecksum(normalizedCpf),
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
        orcamento_id: item.orcamento_id || null,
        recurring_package_id: item.recurring_package_id || null,
        appointment_id: item.appointment_id || null,
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

mockFunctions.financeWriteFlowMap = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  return buildFinanceWriteFlowMap({
    empresaId,
    flags: getMockObservabilityFlags(empresaId),
  });
};

mockFunctions.financeWriteGovernanceMatrix = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  return buildFinanceWriteGovernanceMatrix({
    empresaId,
    flags: getMockObservabilityFlags(empresaId),
  });
};

mockFunctions.financeHybridWriteAudit = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  const periodStart = payload?.periodo_inicio || null;
  const periodEnd = payload?.periodo_fim || null;
  const limit = Math.max(1, Math.min(Number(payload?.limit || 200), 1000));
  const coverageRows = buildLegacyReceivablesCoverage({
    empresaId,
    contasReceber: readStorage('ContaReceber'),
    clients: readStorage('Client'),
    walletAccounts: readStorage('CarteiraConta'),
    recurringPackages: readStorage('RecurringPackage'),
    obligations: readStorage('ObrigacaoFinanceira'),
    charges: readStorage('CobrancaFinanceira'),
    periodStart,
    periodEnd,
  });
  const contaReceberById = Object.fromEntries(readStorage('ContaReceber').map((item) => [item?.id, item]));
  const obligations = readStorage('ObrigacaoFinanceira').filter((item) => item?.empresa_id === empresaId);
  const charges = readStorage('CobrancaFinanceira').filter((item) => item?.empresa_id === empresaId);
  const movements = readStorage('CarteiraMovimento').filter((item) => item?.empresa_id === empresaId);
  const commissions = readStorage('ComissaoEvento').filter((item) => item?.empresa_id === empresaId);
  const cancellations = readStorage('CancelamentoFinanceiro').filter((item) => item?.empresa_id === empresaId);
  const walletAccounts = readStorage('CarteiraConta').filter((item) => item?.empresa_id === empresaId);

  const rows = [
    ...coverageRows.map((row) => {
      const conta = contaReceberById[row.conta_receber_id] || {};
      return {
        event_date: conta?.created_date || (row?.data_recebimento ? `${row.data_recebimento}T12:00:00` : row?.vencimento ? `${row.vencimento}T12:00:00` : null),
        write_domain: 'pagamento',
        entity_type: 'conta_receber',
        entity_id: row.conta_receber_id,
        write_layer: 'legacy',
        source_role: 'official_current',
        empresa_id: row.conta_receber_empresa_id,
        carteira_id: row.cliente_id,
        carteira_conta_id: row.carteira_conta_id,
        counterparty_entity_type: row.cobranca_id ? 'cobranca_financeira' : row.obrigacao_id ? 'obrigacao_financeira' : null,
        counterparty_entity_id: row.cobranca_id || row.obrigacao_id || null,
        status: row.status_legado,
        amount: Number(row.valor || 0),
        source_key: conta?.source_key || `legacy_conta_receber|${row.conta_receber_id}`,
        origin_label: 'conta_receber',
        hybrid_classification: row.classificacao,
        operational_risk: row.classificacao === 'B' && row.considera_no_comparativo ? 'alta' : row.classificacao === 'C' ? 'media' : 'baixa',
        payload: {
          motivo_cobertura: row.motivo_cobertura,
          considera_no_comparativo: row.considera_no_comparativo,
          financial_behavior: row.financial_behavior || null,
        },
      };
    }),
    ...obligations.filter((item) => isInPeriod(item?.due_date || item?.created_date, periodStart, periodEnd)).map((item) => ({
      event_date: item?.created_date || null,
      write_domain: 'obrigacao',
      entity_type: 'obrigacao_financeira',
      entity_id: item?.id || null,
      write_layer: 'v2',
      source_role: item?.source_key?.startsWith('legacy_conta_receber|') ? 'compatibility_shadow' : 'official_v2',
      empresa_id: item?.empresa_id || null,
      carteira_id: item?.carteira_id || null,
      carteira_conta_id: item?.carteira_conta_id || null,
      counterparty_entity_type: 'cobranca_financeira',
      counterparty_entity_id: null,
      status: item?.status || null,
      amount: Number(item?.valor_final ?? item?.valor_em_aberto ?? 0),
      source_key: item?.source_key || null,
      origin_label: item?.tipo_item || 'obrigacao_financeira',
      hybrid_classification: item?.source_key?.startsWith('legacy_conta_receber|') ? 'shadow_legado_para_v2' : 'v2_oficial',
      operational_risk: item?.source_key?.startsWith('legacy_conta_receber|') ? 'media' : 'baixa',
      payload: {
        due_date: item?.due_date || null,
        valor_em_aberto: item?.valor_em_aberto || 0,
      },
    })),
    ...charges.filter((item) => isInPeriod(item?.due_date || item?.created_date, periodStart, periodEnd)).map((item) => ({
      event_date: item?.created_date || null,
      write_domain: 'cobranca',
      entity_type: 'cobranca_financeira',
      entity_id: item?.id || null,
      write_layer: 'v2',
      source_role: item?.source_key?.startsWith('legacy_conta_receber|') ? 'compatibility_shadow' : 'official_v2',
      empresa_id: item?.empresa_id || null,
      carteira_id: null,
      carteira_conta_id: item?.carteira_conta_id || null,
      counterparty_entity_type: null,
      counterparty_entity_id: null,
      status: item?.status || null,
      amount: Number(item?.valor_total ?? item?.valor_em_aberto ?? 0),
      source_key: item?.source_key || null,
      origin_label: 'cobranca_financeira',
      hybrid_classification: item?.source_key?.startsWith('legacy_conta_receber|') ? 'shadow_legado_para_v2' : 'v2_oficial',
      operational_risk: item?.source_key?.startsWith('legacy_conta_receber|') ? 'media' : 'baixa',
      payload: {
        due_date: item?.due_date || null,
        valor_em_aberto: item?.valor_em_aberto || 0,
      },
    })),
    ...movements.filter((item) => isInPeriod(item?.created_date, periodStart, periodEnd)).map((item) => ({
      event_date: item?.created_date || null,
      write_domain: 'carteira',
      entity_type: 'carteira_movimento',
      entity_id: item?.id || null,
      write_layer: 'v2',
      source_role: 'official_v2',
      empresa_id: item?.empresa_id || null,
      carteira_id: walletAccounts.find((account) => account?.id === item?.carteira_conta_id)?.carteira_id || null,
      carteira_conta_id: item?.carteira_conta_id || null,
      counterparty_entity_type: item?.obrigacao_id ? 'obrigacao_financeira' : null,
      counterparty_entity_id: item?.obrigacao_id || null,
      status: item?.tipo || null,
      amount: Number(item?.valor || 0),
      source_key: item?.operacao_idempotencia || item?.id || null,
      origin_label: item?.origem || null,
      hybrid_classification: 'v2_oficial',
      operational_risk: item?.natureza === 'entrada' && !item?.obrigacao_id ? 'media' : 'baixa',
      payload: {
        natureza: item?.natureza || null,
        transacao_id: item?.transacao_id || null,
      },
    })),
    ...commissions.filter((item) => isInPeriod(item?.created_date, periodStart, periodEnd)).map((item) => ({
      event_date: item?.created_date || null,
      write_domain: 'comissao',
      entity_type: 'comissao_evento',
      entity_id: item?.id || null,
      write_layer: 'v2',
      source_role: 'official_v2',
      empresa_id: item?.empresa_id || null,
      carteira_id: null,
      carteira_conta_id: null,
      counterparty_entity_type: item?.obrigacao_id ? 'obrigacao_financeira' : null,
      counterparty_entity_id: item?.obrigacao_id || null,
      status: item?.status || null,
      amount: Number(item?.valor_comissao || 0),
      source_key: item?.source_key || item?.id || null,
      origin_label: item?.origem || null,
      hybrid_classification: 'v2_oficial',
      operational_risk: ['estornada', 'parcialmente_estornada'].includes(item?.status) ? 'media' : 'baixa',
      payload: {
        vendedor_user_id: item?.vendedor_user_id || null,
      },
    })),
    ...cancellations.filter((item) => isInPeriod(item?.created_date, periodStart, periodEnd)).map((item) => ({
      event_date: item?.created_date || null,
      write_domain: 'cancelamento',
      entity_type: 'cancelamento_financeiro',
      entity_id: item?.id || null,
      write_layer: 'v2',
      source_role: 'official_v2',
      empresa_id: item?.empresa_id || null,
      carteira_id: null,
      carteira_conta_id: item?.carteira_conta_id || null,
      counterparty_entity_type: item?.obrigacao_id ? 'obrigacao_financeira' : null,
      counterparty_entity_id: item?.obrigacao_id || null,
      status: item?.status || null,
      amount: Number(item?.valor_multa || 0),
      source_key: item?.source_key || item?.id || null,
      origin_label: item?.origem_cancelamento || null,
      hybrid_classification: 'v2_oficial',
      operational_risk: item?.gerar_credito_compensatorio ? 'media' : 'baixa',
      payload: {
        gerar_credito_compensatorio: Boolean(item?.gerar_credito_compensatorio),
      },
    })),
  ];

  return rows
    .sort((left, right) => new Date(right?.event_date || 0).getTime() - new Date(left?.event_date || 0).getTime())
    .slice(0, limit);
};

mockFunctions.financeOperationalReconciliationMatrix = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  const periodStart = payload?.periodo_inicio || null;
  const periodEnd = payload?.periodo_fim || null;
  const coverageRows = buildLegacyReceivablesCoverage({
    empresaId,
    contasReceber: readStorage('ContaReceber'),
    clients: readStorage('Client'),
    walletAccounts: readStorage('CarteiraConta'),
    recurringPackages: readStorage('RecurringPackage'),
    obligations: readStorage('ObrigacaoFinanceira'),
    charges: readStorage('CobrancaFinanceira'),
    periodStart,
    periodEnd,
  });
  let summary = null;
  try {
    summary = await mockFunctions.financeCockpitV2Summary({
      empresa_id: empresaId,
      periodo_inicio: periodStart,
      periodo_fim: periodEnd,
    });
    summary = {
      ...summary,
      cobrancas_vencidas_count: readStorage('CobrancaFinanceira')
        .filter((item) => item?.empresa_id === empresaId)
        .filter((item) => ['aberta', 'parcial', 'vencida'].includes(item?.status))
        .filter((item) => item?.due_date && new Date(`${item.due_date}T12:00:00`) < new Date())
        .length,
    };
  } catch {
    summary = null;
  }
  const latestReconciliations = readStorage('CarteiraReconciliacao')
    .filter((item) => item?.empresa_id === empresaId)
    .reduce((acc, item) => {
      const current = acc[item?.carteira_conta_id];
      if (!current || new Date(item?.created_date || 0).getTime() > new Date(current?.created_date || 0).getTime()) {
        acc[item?.carteira_conta_id] = item;
      }
      return acc;
    }, {});

  return buildOperationalReconciliationRows({
    coverageRows,
    cockpitSummary: summary,
    walletDivergentCount: Object.values(latestReconciliations).filter((item) => item?.status === 'divergente').length,
  });
};

mockFunctions.financeOperationalObservabilityContext = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  const periodStart = payload?.periodo_inicio || null;
  const periodEnd = payload?.periodo_fim || null;
  const flags = getMockObservabilityFlags(empresaId);
  const coverageRows = buildLegacyReceivablesCoverage({
    empresaId,
    contasReceber: readStorage('ContaReceber'),
    clients: readStorage('Client'),
    walletAccounts: readStorage('CarteiraConta'),
    recurringPackages: readStorage('RecurringPackage'),
    obligations: readStorage('ObrigacaoFinanceira'),
    charges: readStorage('CobrancaFinanceira'),
    periodStart,
    periodEnd,
  });
  let compareRows = [];
  try {
    compareRows = await mockFunctions.financeCockpitV2Compare({
      empresa_id: empresaId,
      periodo_inicio: periodStart,
      periodo_fim: periodEnd,
    });
  } catch {
    compareRows = [];
  }
  let alertRows = [];
  try {
    alertRows = await mockFunctions.financeFinancialAlertsV2({
      empresa_id: empresaId,
      periodo_inicio: periodStart,
      periodo_fim: periodEnd,
      limit: 100,
    });
  } catch {
    alertRows = [];
  }
  let summary = null;
  try {
    summary = await mockFunctions.financeCockpitV2Summary({
      empresa_id: empresaId,
      periodo_inicio: periodStart,
      periodo_fim: periodEnd,
    });
  } catch {
    summary = null;
  }

  return buildOperationalObservabilityContext({
    empresaId,
    flags,
    coverageRows,
    compareRows,
    alertRows,
    cockpitSummary: summary,
    walletAccounts: readStorage('CarteiraConta').filter((item) => item?.empresa_id === empresaId),
    obligations: readStorage('ObrigacaoFinanceira').filter((item) => item?.empresa_id === empresaId),
    charges: readStorage('CobrancaFinanceira').filter((item) => item?.empresa_id === empresaId),
    movements: readStorage('CarteiraMovimento').filter((item) => item?.empresa_id === empresaId),
    reconciliations: readStorage('CarteiraReconciliacao').filter((item) => item?.empresa_id === empresaId),
    commissions: readStorage('ComissaoEvento').filter((item) => item?.empresa_id === empresaId),
    cancellations: readStorage('CancelamentoFinanceiro').filter((item) => item?.empresa_id === empresaId),
  });
};

mockFunctions.financePaymentV2Contract = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  return buildPaymentV2Contract({
    empresaId,
    flags: getMockObservabilityFlags(empresaId),
  });
};

mockFunctions.financePaymentV2Execute = async (payload = {}) => {
  if (!String(payload?.empresa_id || '').trim()) {
    throw new Error('p_empresa_id e obrigatorio.');
  }
  if (!String(payload?.operacao_idempotencia || '').trim()) {
    throw new Error('p_operacao_idempotencia e obrigatorio.');
  }

  const empresaId = String(payload.empresa_id).trim();
  const operacaoIdempotencia = String(payload.operacao_idempotencia).trim();
  const existingExecution = readStorage('PagamentoV2Execucao').find(
    (item) => item?.empresa_id === empresaId && item?.operacao_idempotencia === operacaoIdempotencia,
  );

  if (existingExecution) {
    return buildMockPaymentV2Response(
      { ...existingExecution, reused: true },
      existingExecution?.classe_resultado === 'executado' ? 'idempotente_reutilizado' : existingExecution?.classe_resultado,
    );
  }

  const persistRejectedExecution = ({
    reasonCode,
    reasonMessage,
    carteiraContaId = null,
    obrigacaoId = null,
    cobrancaFinanceiraId = null,
    rejectedAfterLock = false,
  } = {}) => {
    if (!carteiraContaId || !obrigacaoId) return null;
    return persistMockPaymentV2Execution({
      empresa_id: empresaId,
      carteira_conta_id: carteiraContaId,
      obrigacao_id: obrigacaoId,
      cobranca_financeira_id: cobrancaFinanceiraId,
      operacao_idempotencia: operacaoIdempotencia,
      source_key: String(payload?.source_key || '').trim() || '__invalid__',
      forma_pagamento: String(payload?.forma_pagamento || '').trim() || '__invalid__',
      origem_operacional: String(payload?.origem_operacional || '').trim() || 'manual_operacional',
      valor_solicitado: roundMockCurrency(payload?.valor),
      data_pagamento: payload?.data_pagamento || new Date().toISOString().slice(0, 10),
      classe_resultado: 'rejeitado_negocio',
      reason_code: reasonCode,
      reason_message: reasonMessage,
      usuario_id: payload?.usuario_id || null,
      metadata: {
        ...(payload?.metadata || {}),
        source: 'payment_v2_execute',
        contract_scope: 'sprint9b1_cut1',
        rejected_after_lock: Boolean(rejectedAfterLock),
        rejected_before_lock: !rejectedAfterLock,
      },
    });
  };

  const buildRejectedResult = ({
    reasonCode,
    reasonMessage,
    carteiraContaId = null,
    obrigacaoId = null,
    cobrancaFinanceiraId = null,
    rejectedAfterLock = false,
  } = {}) => {
    const persisted = persistRejectedExecution({
      reasonCode,
      reasonMessage,
      carteiraContaId,
      obrigacaoId,
      cobrancaFinanceiraId,
      rejectedAfterLock,
    });

    return buildMockPaymentV2Response({
      id: persisted?.id || null,
      carteira_movimento_id: persisted?.carteira_movimento_id || null,
      carteira_alocacao_id: persisted?.carteira_alocacao_id || null,
      carteira_conta_id: persisted?.carteira_conta_id || payload?.carteira_conta_id || null,
      obrigacao_id: persisted?.obrigacao_id || payload?.obrigacao_id || null,
      cobranca_financeira_id: persisted?.cobranca_financeira_id || payload?.cobranca_financeira_id || null,
      operacao_idempotencia: operacaoIdempotencia,
      source_key: persisted?.source_key || String(payload?.source_key || '').trim() || null,
      classe_resultado: 'rejeitado_negocio',
      reason_code: reasonCode,
      reason_message: reasonMessage,
      reused: false,
    }, 'rejeitado_negocio');
  };

  if (!getMockFlagValue('finance.payment_v2_write_enabled', empresaId)) {
    return buildRejectedResult({
      reasonCode: 'payment_v2_write_disabled',
      reasonMessage: `Feature flag finance.payment_v2_write_enabled esta desligada para a empresa ${empresaId}.`,
    });
  }
  if (!String(payload?.carteira_conta_id || '').trim()) {
    return buildRejectedResult({
      reasonCode: 'carteira_conta_required',
      reasonMessage: 'p_carteira_conta_id e obrigatorio.',
    });
  }
  if (!String(payload?.obrigacao_id || '').trim()) {
    return buildRejectedResult({
      reasonCode: 'obrigacao_required',
      reasonMessage: 'p_obrigacao_id e obrigatorio.',
    });
  }
  if (!String(payload?.source_key || '').trim()) {
    return buildRejectedResult({
      reasonCode: 'source_key_required',
      reasonMessage: 'p_source_key e obrigatorio.',
    });
  }
  if (roundMockCurrency(payload?.valor) <= 0) {
    return buildRejectedResult({
      reasonCode: 'valor_invalido',
      reasonMessage: 'p_valor deve ser maior que zero.',
    });
  }
  if (!payload?.data_pagamento) {
    return buildRejectedResult({
      reasonCode: 'data_pagamento_required',
      reasonMessage: 'p_data_pagamento e obrigatorio.',
    });
  }
  if (!String(payload?.forma_pagamento || '').trim()) {
    return buildRejectedResult({
      reasonCode: 'forma_pagamento_required',
      reasonMessage: 'p_forma_pagamento e obrigatorio.',
    });
  }

  const contas = readStorage('CarteiraConta');
  const obrigacoes = readStorage('ObrigacaoFinanceira');
  const cobrancas = readStorage('CobrancaFinanceira');
  const cobrancaItens = readStorage('CobrancaItem');
  const alocacoes = readStorage('CarteiraAlocacao');

  const conta = contas.find(
    (item) => item?.id === payload?.carteira_conta_id && item?.empresa_id === empresaId,
  );
  if (!conta) {
    throw new Error(`carteira_conta ${payload?.carteira_conta_id} nao encontrada para a empresa ${empresaId}.`);
  }

  const obrigacaoIndex = obrigacoes.findIndex(
    (item) => item?.id === payload?.obrigacao_id
      && item?.empresa_id === empresaId
      && item?.carteira_conta_id === payload?.carteira_conta_id,
  );
  if (obrigacaoIndex < 0) {
    throw new Error(`obrigacao_financeira ${payload?.obrigacao_id} nao encontrada para a carteira ${payload?.carteira_conta_id}.`);
  }

  const obrigacao = obrigacoes[obrigacaoIndex];
  const valorSolicitado = roundMockCurrency(payload?.valor);
  const valorEmAbertoObrigacao = roundMockCurrency(obrigacao?.valor_em_aberto);

  if (!['aberta', 'parcial', 'vencida'].includes(obrigacao?.status) || valorEmAbertoObrigacao <= 0) {
    return buildRejectedResult({
      reasonCode: 'obrigacao_not_payable',
      reasonMessage: `Obrigacao ${obrigacao?.id} esta com status ${obrigacao?.status} e valor_em_aberto ${valorEmAbertoObrigacao}.`,
      carteiraContaId: conta.id,
      obrigacaoId: obrigacao.id,
      rejectedAfterLock: true,
    });
  }

  if (valorSolicitado !== valorEmAbertoObrigacao) {
    return buildRejectedResult({
      reasonCode: 'partial_payment_out_of_scope',
      reasonMessage: `Primeiro corte exige quitacao integral da obrigacao. Valor solicitado ${valorSolicitado} difere do valor_em_aberto ${valorEmAbertoObrigacao}.`,
      carteiraContaId: conta.id,
      obrigacaoId: obrigacao.id,
      rejectedAfterLock: true,
    });
  }

  let cobranca = null;
  if (String(payload?.cobranca_financeira_id || '').trim()) {
    cobranca = cobrancas.find(
      (item) => item?.id === payload?.cobranca_financeira_id
        && item?.empresa_id === empresaId
        && item?.carteira_conta_id === payload?.carteira_conta_id,
    );

    if (!cobranca) {
      return buildRejectedResult({
        reasonCode: 'charge_not_found',
        reasonMessage: `cobranca_financeira ${payload?.cobranca_financeira_id} nao encontrada para a carteira ${payload?.carteira_conta_id}.`,
        carteiraContaId: conta.id,
        obrigacaoId: obrigacao.id,
        rejectedAfterLock: true,
      });
    }

    const itensDaCobranca = cobrancaItens.filter((item) => item?.cobranca_financeira_id === cobranca.id);
    const itensDaObrigacao = itensDaCobranca.filter((item) => item?.obrigacao_id === obrigacao.id);
    const valorEmAbertoCobranca = roundMockCurrency(cobranca?.valor_em_aberto);

    if (itensDaObrigacao.length === 0) {
      return buildRejectedResult({
        reasonCode: 'charge_not_linked_to_obligation',
        reasonMessage: `cobranca_financeira ${cobranca.id} nao esta vinculada a obrigacao ${obrigacao.id}.`,
        carteiraContaId: conta.id,
        obrigacaoId: obrigacao.id,
        cobrancaFinanceiraId: cobranca.id,
        rejectedAfterLock: true,
      });
    }

    if (itensDaCobranca.length > 1) {
      return buildRejectedResult({
        reasonCode: 'multi_item_charge_out_of_scope',
        reasonMessage: `Primeiro corte nao suporta cobranca com multiplas obrigacoes. cobranca_financeira ${cobranca.id} possui ${itensDaCobranca.length} itens.`,
        carteiraContaId: conta.id,
        obrigacaoId: obrigacao.id,
        cobrancaFinanceiraId: cobranca.id,
        rejectedAfterLock: true,
      });
    }

    if (!['aberta', 'parcial', 'vencida'].includes(cobranca?.status) || valorEmAbertoCobranca <= 0) {
      return buildRejectedResult({
        reasonCode: 'charge_not_payable',
        reasonMessage: `cobranca_financeira ${cobranca.id} esta com status ${cobranca?.status} e valor_em_aberto ${valorEmAbertoCobranca}.`,
        carteiraContaId: conta.id,
        obrigacaoId: obrigacao.id,
        cobrancaFinanceiraId: cobranca.id,
        rejectedAfterLock: true,
      });
    }

    if (valorEmAbertoCobranca !== valorSolicitado) {
      return buildRejectedResult({
        reasonCode: 'charge_amount_mismatch',
        reasonMessage: `Primeiro corte exige quitacao integral da cobranca. Valor solicitado ${valorSolicitado} difere do valor_em_aberto ${valorEmAbertoCobranca}.`,
        carteiraContaId: conta.id,
        obrigacaoId: obrigacao.id,
        cobrancaFinanceiraId: cobranca.id,
        rejectedAfterLock: true,
      });
    }
  }

  const walletResult = applyMockWalletOperationCore({
    carteira_conta_id: conta.id,
    operacao_idempotencia: operacaoIdempotencia,
    tipo: 'credito',
    natureza: 'entrada',
    origem: 'payment_v2',
    valor: valorSolicitado,
    referencia_amigavel: `Pagamento V2 - ${obrigacao?.descricao || obrigacao?.id}`,
    descricao: String(payload?.forma_pagamento || '').trim() || 'Pagamento V2',
    orcamento_id: obrigacao?.orcamento_id || null,
    appointment_id: obrigacao?.appointment_id || null,
    obrigacao_id: obrigacao.id,
    usuario_id: payload?.usuario_id || null,
    metadata: {
      ...(payload?.metadata || {}),
      source: 'payment_v2_execute',
      contract_scope: 'sprint9b1_cut1',
      source_key: String(payload?.source_key || '').trim(),
      forma_pagamento: String(payload?.forma_pagamento || '').trim(),
      origem_operacional: String(payload?.origem_operacional || '').trim() || 'manual_operacional',
      data_pagamento: payload?.data_pagamento,
      cobranca_financeira_id: cobranca?.id || null,
      authority_scope: 'payment_v2',
    },
    permitir_saldo_negativo: true,
  });

  const now = new Date().toISOString();
  const alocacaoExistenteIndex = alocacoes.findIndex(
    (item) => item?.carteira_movimento_id === walletResult?.movimento_id
      && item?.obrigacao_id === obrigacao.id
      && Number(item?.ordem_aplicada || 0) === 1,
  );
  const alocacaoPayload = {
    id: alocacaoExistenteIndex >= 0 ? alocacoes[alocacaoExistenteIndex]?.id : makeId(),
    empresa_id: empresaId,
    carteira_conta_id: conta.id,
    carteira_movimento_id: walletResult.movimento_id,
    obrigacao_id: obrigacao.id,
    valor_alocado: valorSolicitado,
    ordem_aplicada: 1,
    metadata: {
      ...(payload?.metadata || {}),
      source: 'payment_v2_execute',
      contract_scope: 'sprint9b1_cut1',
      operacao_idempotencia: operacaoIdempotencia,
    },
    created_date: alocacaoExistenteIndex >= 0 ? alocacoes[alocacaoExistenteIndex]?.created_date : now,
    updated_date: now,
  };

  if (alocacaoExistenteIndex >= 0) {
    alocacoes[alocacaoExistenteIndex] = alocacaoPayload;
  } else {
    alocacoes.push(alocacaoPayload);
  }
  writeStorage('CarteiraAlocacao', alocacoes);

  obrigacoes[obrigacaoIndex] = {
    ...obrigacao,
    valor_em_aberto: 0,
    status: 'quitada',
    metadata: {
      ...(obrigacao?.metadata || {}),
      payment_v2: true,
      payment_v2_last_execution_at: now,
      payment_v2_operacao_idempotencia: operacaoIdempotencia,
      payment_v2_source_key: String(payload?.source_key || '').trim(),
      payment_v2_forma_pagamento: String(payload?.forma_pagamento || '').trim(),
    },
    updated_date: now,
  };
  writeStorage('ObrigacaoFinanceira', obrigacoes);

  if (cobranca) {
    const cobrancaIndex = cobrancas.findIndex((item) => item?.id === cobranca.id);
    if (cobrancaIndex >= 0) {
      cobrancas[cobrancaIndex] = {
        ...cobranca,
        valor_em_aberto: 0,
        status: 'quitada',
        metadata: {
          ...(cobranca?.metadata || {}),
          payment_v2: true,
          payment_v2_last_execution_at: now,
          payment_v2_operacao_idempotencia: operacaoIdempotencia,
          payment_v2_source_key: String(payload?.source_key || '').trim(),
        },
        updated_date: now,
      };
      writeStorage('CobrancaFinanceira', cobrancas);
    }
  }

  const execucao = persistMockPaymentV2Execution({
    empresa_id: empresaId,
    carteira_conta_id: conta.id,
    obrigacao_id: obrigacao.id,
    cobranca_financeira_id: cobranca?.id || null,
    carteira_movimento_id: walletResult.movimento_id,
    carteira_alocacao_id: alocacaoPayload.id,
    operacao_idempotencia: operacaoIdempotencia,
    source_key: String(payload?.source_key || '').trim(),
    forma_pagamento: String(payload?.forma_pagamento || '').trim(),
    origem_operacional: String(payload?.origem_operacional || '').trim() || 'manual_operacional',
    valor_solicitado: valorSolicitado,
    data_pagamento: payload?.data_pagamento,
    classe_resultado: 'executado',
    reason_code: null,
    reason_message: null,
    usuario_id: payload?.usuario_id || null,
    metadata: {
      ...(payload?.metadata || {}),
      source: 'payment_v2_execute',
      contract_scope: 'sprint9b1_cut1',
      authority_scope: 'payment_v2',
    },
    reused: false,
  });

  return buildMockPaymentV2Response(execucao, 'executado');
};

mockFunctions.financePaymentV2ExecutionAudit = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  return buildMockPaymentV2AuditRows(empresaId, payload?.limit || 100);
};

mockFunctions.financePaymentV2Reverse = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  const operacaoIdempotencia = String(payload?.operacao_idempotencia || '').trim();
  const reversaoTipo = String(payload?.reversao_tipo || '').trim().toLowerCase();
  const sourceKey = String(payload?.source_key || '').trim();
  const motivo = String(payload?.motivo || '').trim();
  const attachmentName = String(payload?.attachment_name || '').trim();
  const attachmentPath = String(payload?.attachment_path || '').trim();
  const attachmentExtension = (attachmentName || attachmentPath).includes('.')
    ? `.${(attachmentName || attachmentPath).split('.').pop().toLowerCase()}`
    : '';
  const allowedExtensions = new Set(['.pdf', '.doc', '.txt', '.img', '.jpg', '.png']);
  const existingReversal = readStorage('PagamentoV2Reversao').find(
    (item) => item?.empresa_id === empresaId && item?.operacao_idempotencia === operacaoIdempotencia,
  );

  if (!operacaoIdempotencia) {
    throw new Error('p_operacao_idempotencia e obrigatorio.');
  }

  if (existingReversal) {
    return buildMockPaymentV2ReversalResponse({
      ...existingReversal,
      reused: true,
    }, existingReversal?.classe_resultado === 'executado' ? 'idempotente_reutilizado' : existingReversal?.classe_resultado);
  }

  const persistRejectedReversal = ({
    reasonCode,
    reasonMessage,
    carteiraContaId = null,
    appointmentId = null,
    serviceProvidedId = null,
    obrigacaoId = null,
    cobrancaId = null,
    contaReceberId = null,
    valorEstornado = 0,
    servicoRealizado = null,
  } = {}) => persistMockPaymentV2Reversal({
    empresa_id: empresaId,
    carteira_conta_id: carteiraContaId || payload?.carteira_conta_id || null,
    appointment_id: appointmentId,
    serviceprovided_id: serviceProvidedId,
    obrigacao_id: obrigacaoId,
    cobranca_financeira_id: cobrancaId,
    conta_receber_id: contaReceberId,
    reversao_tipo: reversaoTipo || 'saldo',
    operacao_idempotencia: operacaoIdempotencia || makeId(),
    source_key: sourceKey || '__invalid__',
    motivo: motivo || '__invalid__',
    attachment_name: attachmentName || '__invalid__',
    attachment_path: attachmentPath || '__invalid__',
    attachment_extension: attachmentExtension || '__invalid__',
    valor_estornado: roundMockCurrency(valorEstornado),
    servico_realizado: servicoRealizado,
    classe_resultado: 'rejeitado_negocio',
    reason_code: reasonCode,
    reason_message: reasonMessage,
    usuario_id: payload?.usuario_id || null,
    metadata: {
      ...(payload?.metadata || {}),
      source: 'payment_v2_reverse',
      contract_scope: 'sprint9b1_cut2',
      authority_scope: 'payment_v2_reversal',
      reversal_scope: reversaoTipo || 'saldo',
    },
    reused: false,
  });

  const buildRejectedReversal = (options = {}) => buildMockPaymentV2ReversalResponse(
    persistRejectedReversal(options),
    'rejeitado_negocio',
  );

  if (!String(payload?.carteira_conta_id || '').trim()) {
    return buildRejectedReversal({
      reasonCode: 'carteira_conta_required',
      reasonMessage: 'p_carteira_conta_id e obrigatorio.',
    });
  }

  const contas = readStorage('CarteiraConta');
  const contaIndex = contas.findIndex(
    (item) => item?.id === payload?.carteira_conta_id && item?.empresa_id === empresaId,
  );
  if (contaIndex < 0) {
    throw new Error(`carteira_conta ${payload?.carteira_conta_id} nao encontrada para a empresa ${empresaId}.`);
  }

  const conta = contas[contaIndex];

  if (!getMockFlagValue('finance.payment_v2_reversal_enabled', empresaId)) {
    return buildRejectedReversal({
      reasonCode: 'payment_v2_reversal_disabled',
      reasonMessage: `Feature flag finance.payment_v2_reversal_enabled esta desligada para a empresa ${empresaId}.`,
      carteiraContaId: conta.id,
    });
  }
  if (!['saldo', 'servico'].includes(reversaoTipo)) {
    return buildRejectedReversal({
      reasonCode: 'reversao_tipo_invalido',
      reasonMessage: 'p_reversao_tipo deve ser saldo ou servico.',
      carteiraContaId: conta.id,
    });
  }
  if (!sourceKey) {
    return buildRejectedReversal({
      reasonCode: 'source_key_required',
      reasonMessage: 'p_source_key e obrigatorio.',
      carteiraContaId: conta.id,
    });
  }
  if (!motivo) {
    return buildRejectedReversal({
      reasonCode: 'motivo_required',
      reasonMessage: 'p_motivo e obrigatorio.',
      carteiraContaId: conta.id,
    });
  }
  if (!attachmentName) {
    return buildRejectedReversal({
      reasonCode: 'attachment_name_required',
      reasonMessage: 'p_attachment_name e obrigatorio.',
      carteiraContaId: conta.id,
    });
  }
  if (!attachmentPath) {
    return buildRejectedReversal({
      reasonCode: 'attachment_path_required',
      reasonMessage: 'p_attachment_path e obrigatorio.',
      carteiraContaId: conta.id,
    });
  }
  if (!allowedExtensions.has(attachmentExtension)) {
    return buildRejectedReversal({
      reasonCode: 'attachment_extension_invalid',
      reasonMessage: `Extensao de anexo invalida: ${attachmentExtension || '<vazia>'}. Tipos aceitos: .pdf, .doc, .txt, .img, .jpg, .png.`,
      carteiraContaId: conta.id,
    });
  }

  if (reversaoTipo === 'saldo') {
    const valor = roundMockCurrency(payload?.valor);
    const saldoAtual = roundMockCurrency(conta?.saldo_atual);

    if (valor <= 0) {
      return buildRejectedReversal({
        reasonCode: 'saldo_reversal_value_required',
        reasonMessage: 'p_valor deve ser maior que zero para estorno de saldo.',
        carteiraContaId: conta.id,
      });
    }
    if (saldoAtual <= 0) {
      return buildRejectedReversal({
        reasonCode: 'saldo_positivo_indisponivel',
        reasonMessage: 'Nao ha saldo positivo disponivel para estorno.',
        carteiraContaId: conta.id,
      });
    }
    if (valor > saldoAtual) {
      return buildRejectedReversal({
        reasonCode: 'saldo_reversal_exceeds_balance',
        reasonMessage: `Valor solicitado para estorno (${valor}) excede o saldo positivo atual (${saldoAtual}).`,
        carteiraContaId: conta.id,
        valorEstornado: valor,
      });
    }

    const walletResult = applyMockWalletOperationCore({
      carteira_conta_id: conta.id,
      operacao_idempotencia: operacaoIdempotencia,
      tipo: 'estorno',
      natureza: 'saida',
      origem: 'payment_v2_reversal_saldo',
      valor,
      referencia_amigavel: 'Estorno de saldo - Payment V2',
      descricao: motivo,
      usuario_id: payload?.usuario_id || null,
      metadata: {
        ...(payload?.metadata || {}),
        source: 'payment_v2_reverse',
        contract_scope: 'sprint9b1_cut2',
        authority_scope: 'payment_v2_reversal',
        reversal_scope: 'saldo',
        attachment_name: attachmentName,
        attachment_path: attachmentPath,
        attachment_extension: attachmentExtension,
      },
      permitir_saldo_negativo: false,
    });

    const reversao = persistMockPaymentV2Reversal({
      empresa_id: empresaId,
      carteira_conta_id: conta.id,
      carteira_movimento_id: walletResult.movimento_id,
      reversao_tipo: 'saldo',
      operacao_idempotencia: operacaoIdempotencia,
      source_key: sourceKey,
      motivo,
      attachment_name: attachmentName,
      attachment_path: attachmentPath,
      attachment_extension: attachmentExtension,
      valor_estornado: valor,
      classe_resultado: 'executado',
      usuario_id: payload?.usuario_id || null,
      metadata: {
        ...(payload?.metadata || {}),
        source: 'payment_v2_reverse',
        contract_scope: 'sprint9b1_cut2',
        authority_scope: 'payment_v2_reversal',
        reversal_scope: 'saldo',
      },
      reused: false,
    });

    return buildMockPaymentV2ReversalResponse(reversao, 'executado');
  }

  const appointments = readStorage('Appointment');
  const services = readStorage('ServiceProvided');
  const obrigacoes = readStorage('ObrigacaoFinanceira');
  const cobrancas = readStorage('CobrancaFinanceira');
  const cobrancaItens = readStorage('CobrancaItem');
  const contasReceber = readStorage('ContaReceber');
  const checkins = readStorage('Checkin');
  const execucoes = readStorage('PagamentoV2Execucao');

  let serviceIndex = -1;
  if (String(payload?.serviceprovided_id || '').trim()) {
    serviceIndex = services.findIndex(
      (item) => item?.id === payload?.serviceprovided_id && item?.empresa_id === empresaId,
    );
    if (serviceIndex < 0) {
      return buildRejectedReversal({
        reasonCode: 'serviceprovided_not_found',
        reasonMessage: `serviceprovided ${payload?.serviceprovided_id} nao encontrado para a empresa ${empresaId}.`,
        carteiraContaId: conta.id,
      });
    }
  } else if (String(payload?.appointment_id || '').trim()) {
    const matches = services.filter(
      (item) => item?.empresa_id === empresaId && item?.appointment_id === payload?.appointment_id,
    );
    if (matches.length > 1) {
      return buildRejectedReversal({
        reasonCode: 'multiple_serviceprovided_for_appointment',
        reasonMessage: `appointment ${payload?.appointment_id} possui multiplos servicesprovided. Informe p_serviceprovided_id explicitamente.`,
        carteiraContaId: conta.id,
      });
    }
    if (matches.length === 1) {
      serviceIndex = services.findIndex((item) => item?.id === matches[0]?.id);
    }
  }

  const service = serviceIndex >= 0 ? services[serviceIndex] : null;

  let appointmentIndex = -1;
  const appointmentId = String(payload?.appointment_id || service?.appointment_id || '').trim();
  if (appointmentId) {
    appointmentIndex = appointments.findIndex(
      (item) => item?.id === appointmentId && item?.empresa_id === empresaId,
    );
    if (appointmentIndex < 0) {
      return buildRejectedReversal({
        reasonCode: 'appointment_not_found',
        reasonMessage: `appointment ${appointmentId} nao encontrado para a empresa ${empresaId}.`,
        carteiraContaId: conta.id,
        serviceProvidedId: service?.id || null,
      });
    }
  }

  const appointment = appointmentIndex >= 0 ? appointments[appointmentIndex] : null;

  let obrigacaoIndex = -1;
  if (String(payload?.obrigacao_id || '').trim()) {
    obrigacaoIndex = obrigacoes.findIndex(
      (item) => item?.id === payload?.obrigacao_id
        && item?.empresa_id === empresaId
        && item?.carteira_conta_id === conta.id,
    );
    if (obrigacaoIndex < 0) {
      return buildRejectedReversal({
        reasonCode: 'obrigacao_not_found',
        reasonMessage: `obrigacao_financeira ${payload?.obrigacao_id} nao encontrada para a empresa ${empresaId}.`,
        carteiraContaId: conta.id,
        appointmentId: appointment?.id || null,
        serviceProvidedId: service?.id || null,
      });
    }
  } else if (appointment?.id) {
    obrigacaoIndex = obrigacoes.findIndex(
      (item) => item?.empresa_id === empresaId
        && item?.carteira_conta_id === conta.id
        && item?.appointment_id === appointment.id,
    );
  }

  const obrigacao = obrigacaoIndex >= 0 ? obrigacoes[obrigacaoIndex] : null;

  let contaReceberIndex = -1;
  if (String(payload?.conta_receber_id || '').trim()) {
    contaReceberIndex = contasReceber.findIndex(
      (item) => item?.id === payload?.conta_receber_id && item?.empresa_id === empresaId,
    );
    if (contaReceberIndex < 0) {
      return buildRejectedReversal({
        reasonCode: 'conta_receber_not_found',
        reasonMessage: `conta_receber ${payload?.conta_receber_id} nao encontrada para a empresa ${empresaId}.`,
        carteiraContaId: conta.id,
        appointmentId: appointment?.id || null,
        serviceProvidedId: service?.id || null,
        obrigacaoId: obrigacao?.id || null,
      });
    }
  } else if (appointment?.id) {
    contaReceberIndex = contasReceber.findIndex(
      (item) => item?.empresa_id === empresaId && item?.appointment_id === appointment.id,
    );
  }

  const contaReceber = contaReceberIndex >= 0 ? contasReceber[contaReceberIndex] : null;

  let cobrancaIndex = -1;
  if (String(payload?.cobranca_financeira_id || '').trim()) {
    cobrancaIndex = cobrancas.findIndex(
      (item) => item?.id === payload?.cobranca_financeira_id
        && item?.empresa_id === empresaId
        && item?.carteira_conta_id === conta.id,
    );
    if (cobrancaIndex < 0) {
      return buildRejectedReversal({
        reasonCode: 'charge_not_found',
        reasonMessage: `cobranca_financeira ${payload?.cobranca_financeira_id} nao encontrada para a empresa ${empresaId}.`,
        carteiraContaId: conta.id,
        appointmentId: appointment?.id || null,
        serviceProvidedId: service?.id || null,
        obrigacaoId: obrigacao?.id || null,
        contaReceberId: contaReceber?.id || null,
      });
    }
  } else if (obrigacao?.id) {
    const linkedCharge = cobrancaItens.find((item) => item?.obrigacao_id === obrigacao.id);
    if (linkedCharge) {
      cobrancaIndex = cobrancas.findIndex((item) => item?.id === linkedCharge?.cobranca_financeira_id);
    }
  }

  const cobranca = cobrancaIndex >= 0 ? cobrancas[cobrancaIndex] : null;

  if (!service && !appointment && !obrigacao && !contaReceber) {
    return buildRejectedReversal({
      reasonCode: 'service_reversal_target_not_found',
      reasonMessage: 'Nao foi possivel localizar servico, agendamento ou obrigacao para o estorno de servico.',
      carteiraContaId: conta.id,
    });
  }

  if (obrigacao?.status === 'cancelada' || obrigacao?.status === 'estornada') {
    return buildRejectedReversal({
      reasonCode: 'service_already_reversed',
      reasonMessage: `Obrigacao ${obrigacao?.id} ja esta com status ${obrigacao?.status}.`,
      carteiraContaId: conta.id,
      appointmentId: appointment?.id || null,
      serviceProvidedId: service?.id || null,
      obrigacaoId: obrigacao?.id || null,
      cobrancaId: cobranca?.id || null,
      contaReceberId: contaReceber?.id || null,
    });
  }

  const chargeItemsForCharge = cobranca
    ? cobrancaItens.filter((item) => item?.cobranca_financeira_id === cobranca.id)
    : [];
  if (chargeItemsForCharge.length > 1) {
    return buildRejectedReversal({
      reasonCode: 'multi_charge_reversal_out_of_scope',
      reasonMessage: `Cobranca ${cobranca?.id} possui ${chargeItemsForCharge.length} itens e o estorno de servico no corte atual exige cobranca de item unico.`,
      carteiraContaId: conta.id,
      appointmentId: appointment?.id || null,
      serviceProvidedId: service?.id || null,
      obrigacaoId: obrigacao?.id || null,
      cobrancaId: cobranca?.id || null,
      contaReceberId: contaReceber?.id || null,
    });
  }

  const serviceValue = roundMockCurrency(
    service?.valor_cobrado ?? service?.preco ?? contaReceber?.valor ?? obrigacao?.valor_final ?? obrigacao?.valor_original ?? appointment?.valor_previsto ?? 0,
  );
  if (serviceValue <= 0) {
    return buildRejectedReversal({
      reasonCode: 'service_value_not_found',
      reasonMessage: 'Nao foi possivel determinar um valor positivo para o servico a ser estornado.',
      carteiraContaId: conta.id,
      appointmentId: appointment?.id || null,
      serviceProvidedId: service?.id || null,
      obrigacaoId: obrigacao?.id || null,
      cobrancaId: cobranca?.id || null,
      contaReceberId: contaReceber?.id || null,
    });
  }

  const valorPago = obrigacao
    ? roundMockCurrency(Math.max(roundMockCurrency(obrigacao?.valor_final) - roundMockCurrency(obrigacao?.valor_em_aberto), 0))
    : 0;
  const valorFinalObrigacao = roundMockCurrency(obrigacao?.valor_final ?? serviceValue);
  if (valorPago > 0 && valorPago !== valorFinalObrigacao) {
    return buildRejectedReversal({
      reasonCode: 'partial_paid_service_reversal_out_of_scope',
      reasonMessage: `Pagamento parcial nao esta no escopo do corte atual. Valor pago ${valorPago} difere do valor final ${valorFinalObrigacao}.`,
      carteiraContaId: conta.id,
      appointmentId: appointment?.id || null,
      serviceProvidedId: service?.id || null,
      obrigacaoId: obrigacao?.id || null,
      cobrancaId: cobranca?.id || null,
      contaReceberId: contaReceber?.id || null,
      valorEstornado: valorPago,
    });
  }

  const servicoRealizado = Boolean(
    service?.checkin_id
    || appointment?.linked_checkin_id
    || checkins.some((item) =>
      (item?.appointment_id === appointment?.id)
      || (service?.checkin_id && item?.id === service.checkin_id)
      || (appointment?.linked_checkin_id && item?.id === appointment.linked_checkin_id),
    ),
  );

  if (valorPago > 0 && roundMockCurrency(conta?.saldo_atual) < valorPago) {
    return buildRejectedReversal({
      reasonCode: 'insufficient_positive_balance_for_service_reversal',
      reasonMessage: `Saldo atual ${roundMockCurrency(conta?.saldo_atual)} insuficiente para estornar o servico no valor de ${valorPago}.`,
      carteiraContaId: conta.id,
      appointmentId: appointment?.id || null,
      serviceProvidedId: service?.id || null,
      obrigacaoId: obrigacao?.id || null,
      cobrancaId: cobranca?.id || null,
      contaReceberId: contaReceber?.id || null,
      valorEstornado: valorPago,
      servicoRealizado,
    });
  }

  const paymentExecution = obrigacao?.id
    ? execucoes
      .filter((item) => item?.empresa_id === empresaId && item?.obrigacao_id === obrigacao.id && item?.classe_resultado === 'executado')
      .sort((left, right) => new Date(right?.created_date || 0).getTime() - new Date(left?.created_date || 0).getTime())[0] || null
    : null;

  let walletResult = null;
  if (valorPago > 0) {
    walletResult = applyMockWalletOperationCore({
      carteira_conta_id: conta.id,
      operacao_idempotencia: operacaoIdempotencia,
      tipo: 'estorno',
      natureza: 'saida',
      origem: 'payment_v2_reversal_servico',
      valor: valorPago,
      referencia_amigavel: 'Estorno de servico - Payment V2',
      descricao: motivo,
      appointment_id: appointment?.id || null,
      obrigacao_id: obrigacao?.id || null,
      usuario_id: payload?.usuario_id || null,
      metadata: {
        ...(payload?.metadata || {}),
        source: 'payment_v2_reverse',
        contract_scope: 'sprint9b1_cut2',
        authority_scope: 'payment_v2_reversal',
        reversal_scope: 'servico',
        attachment_name: attachmentName,
        attachment_path: attachmentPath,
        attachment_extension: attachmentExtension,
      },
      permitir_saldo_negativo: false,
    });
  }

  const now = new Date().toISOString();
  const reversalNote = `[Payment V2 Reversal] ${motivo}`;

  if (serviceIndex >= 0) {
    if (servicoRealizado) {
      services[serviceIndex] = {
        ...service,
        preco: 0,
        valor_cobrado: 0,
        status: 'estornado',
        status_pagamento: 'pago',
        estornado_em: now,
        estornado_motivo: motivo,
        observacoes: appendMockNote(service?.observacoes, reversalNote),
        metadata: {
          ...(service?.metadata || {}),
          payment_v2_reversal: true,
          payment_v2_reversal_at: now,
          payment_v2_reversal_operacao_idempotencia: operacaoIdempotencia,
          payment_v2_reversal_attachment_path: attachmentPath,
          payment_v2_reversal_original_preco: roundMockCurrency(service?.preco),
          payment_v2_reversal_original_valor_cobrado: roundMockCurrency(service?.valor_cobrado),
        },
        updated_date: now,
      };
      writeStorage('ServiceProvided', services);
    } else {
      services.splice(serviceIndex, 1);
      writeStorage('ServiceProvided', services);
    }
  }

  if (appointmentIndex >= 0) {
    if (servicoRealizado) {
      appointments[appointmentIndex] = {
        ...appointment,
        status: 'estornado',
        observacoes: appendMockNote(appointment?.observacoes, reversalNote),
        metadata: {
          ...(appointment?.metadata || {}),
          payment_v2_reversal: true,
          payment_v2_reversal_at: now,
          payment_v2_reversal_operacao_idempotencia: operacaoIdempotencia,
          payment_v2_reversal_attachment_path: attachmentPath,
        },
        updated_date: now,
      };
      writeStorage('Appointment', appointments);
    } else {
      appointments.splice(appointmentIndex, 1);
      writeStorage('Appointment', appointments);
    }
  }

  if (obrigacaoIndex >= 0) {
    obrigacoes[obrigacaoIndex] = {
      ...obrigacao,
      valor_original: 0,
      valor_desconto: 0,
      valor_multa: 0,
      valor_final: 0,
      valor_em_aberto: 0,
      status: servicoRealizado || valorPago > 0 ? 'estornada' : 'cancelada',
      metadata: {
        ...(obrigacao?.metadata || {}),
        payment_v2_reversal: true,
        payment_v2_reversal_at: now,
        payment_v2_reversal_operacao_idempotencia: operacaoIdempotencia,
        payment_v2_reversal_original_valor_original: roundMockCurrency(obrigacao?.valor_original),
        payment_v2_reversal_original_valor_final: roundMockCurrency(obrigacao?.valor_final),
        payment_v2_reversal_original_valor_em_aberto: roundMockCurrency(obrigacao?.valor_em_aberto),
        payment_v2_reversal_attachment_path: attachmentPath,
        payment_v2_reversal_servico_realizado: servicoRealizado,
      },
      updated_date: now,
      lock_version: Number(obrigacao?.lock_version || 0) + 1,
    };
    writeStorage('ObrigacaoFinanceira', obrigacoes);
  }

  if (cobrancaIndex >= 0) {
    const cobranca = cobrancas[cobrancaIndex];
    cobrancas[cobrancaIndex] = {
      ...cobranca,
      valor_total: 0,
      valor_em_aberto: 0,
      status: 'cancelada',
      metadata: {
        ...(cobranca?.metadata || {}),
        payment_v2_reversal: true,
        payment_v2_reversal_at: now,
        payment_v2_reversal_operacao_idempotencia: operacaoIdempotencia,
        payment_v2_reversal_original_valor_total: roundMockCurrency(cobranca?.valor_total),
        payment_v2_reversal_original_valor_em_aberto: roundMockCurrency(cobranca?.valor_em_aberto),
        payment_v2_reversal_attachment_path: attachmentPath,
      },
      updated_date: now,
      lock_version: Number(cobranca?.lock_version || 0) + 1,
    };
    writeStorage('CobrancaFinanceira', cobrancas);
  }

  if (contaReceberIndex >= 0) {
    const contaItem = contasReceber[contaReceberIndex];
    contasReceber[contaReceberIndex] = {
      ...contaItem,
      valor: 0,
      status: 'pago',
      observacoes: appendMockNote(contaItem?.observacoes, reversalNote),
      metadata: {
        ...(contaItem?.metadata || {}),
        payment_v2_reversal: true,
        payment_v2_reversal_at: now,
        payment_v2_reversal_operacao_idempotencia: operacaoIdempotencia,
        payment_v2_reversal_original_valor: roundMockCurrency(contaItem?.valor),
        payment_v2_reversal_attachment_path: attachmentPath,
        payment_v2_reversal_servico_realizado: servicoRealizado,
      },
      updated_date: now,
    };
    writeStorage('ContaReceber', contasReceber);
  }

  const reversao = persistMockPaymentV2Reversal({
    empresa_id: empresaId,
    carteira_conta_id: conta.id,
    pagamento_v2_execucao_id: paymentExecution?.id || null,
    appointment_id: servicoRealizado ? (appointment?.id || null) : null,
    serviceprovided_id: servicoRealizado ? (service?.id || null) : null,
    obrigacao_id: obrigacao?.id || null,
    cobranca_financeira_id: cobranca?.id || null,
    conta_receber_id: contaReceber?.id || null,
    carteira_movimento_id: walletResult?.movimento_id || null,
    reversao_tipo: 'servico',
    operacao_idempotencia: operacaoIdempotencia,
    source_key: sourceKey,
    motivo,
    attachment_name: attachmentName,
    attachment_path: attachmentPath,
    attachment_extension: attachmentExtension,
    valor_estornado: valorPago,
    servico_realizado: servicoRealizado,
    classe_resultado: 'executado',
    usuario_id: payload?.usuario_id || null,
    metadata: {
      ...(payload?.metadata || {}),
      source: 'payment_v2_reverse',
      contract_scope: 'sprint9b1_cut2',
      authority_scope: 'payment_v2_reversal',
      reversal_scope: 'servico',
      service_value_final: serviceValue,
      original_appointment_id: appointment?.id || null,
      original_serviceprovided_id: service?.id || null,
    },
    reused: false,
  });

  return buildMockPaymentV2ReversalResponse(reversao, 'executado');
};

mockFunctions.financePaymentV2ReversalAudit = async (payload = {}) => {
  const empresaId = payload?.empresa_id || getMockScopedUnitId();
  return buildMockPaymentV2ReversalAuditRows(empresaId, payload?.limit || 100);
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
    company_role: null,
    is_platform_admin: false,
    access_profile_permissions: [],
    pin_required_reset: false,
  };

  return {
    currentUser,
    isEnabled: () => false,
    requiresLogin: () => false,
    getSession: async () => ({ user: applyMockQaRole(currentUser) }),
    me: async () => {
      const hydratedUser = applyMockQaRole(currentUser);
      const activeUnitId = getStoredActiveUnitId() || hydratedUser.empresa_id;
      const selectedUnitIds = getSelectedScopedUnitIds();
      return {
        ...hydratedUser,
        assigned_empresa_id: hydratedUser.empresa_id,
        allowed_unit_ids: [hydratedUser.empresa_id],
        active_unit_id: activeUnitId,
        selected_unit_ids: selectedUnitIds,
        unit_selection_mode: selectedUnitIds.length > 1 ? 'merged' : 'single',
        empresa_id: activeUnitId,
      };
    },
    list: async () => [applyMockQaRole(currentUser)],
    signInWithGoogle: async () => ({ provider: 'google', user: applyMockQaRole(currentUser) }),
    exchangeCodeForSession: async () => ({ session: { user: applyMockQaRole(currentUser) }, user: applyMockQaRole(currentUser) }),
    signInWithPin: async () => {
      markDeviceTrustedForUser(currentUser);
      const hydratedUser = applyMockQaRole(currentUser);
      return { ok: true, session: { user: hydratedUser }, user: hydratedUser };
    },
    signInWithPinPairs: async () => {
      markDeviceTrustedForUser(currentUser);
      const hydratedUser = applyMockQaRole(currentUser);
      return { ok: true, session: { user: hydratedUser }, user: hydratedUser };
    },
    verifyCurrentDevicePin: async () => {
      markDeviceTrustedForUser(currentUser);
      return { ok: true, user: applyMockQaRole(currentUser) };
    },
    isCurrentDeviceTrusted: (user) => isDeviceTrustedForUser(user || applyMockQaRole(currentUser)),
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
      includeDeleted = false,
      onlyDeleted = false,
    } = options || {};

    if (entityOptions.unitScoped && !Object.prototype.hasOwnProperty.call(eq || {}, 'empresa_id') && !Object.prototype.hasOwnProperty.call(inFilters || {}, 'empresa_id')) {
      const unitIds = getSelectedScopedUnitIds();
      const unitId = unitIds[0] || await resolveScopedUnitId();
      if (unitIds.length > 1) query = query.in('empresa_id', unitIds);
      else if (unitId) query = query.eq('empresa_id', unitId);
    }

    if (entityOptions.softDelete) {
      if (onlyDeleted) {
        query = query.not('deleted_at', 'is', null).gt('deletion_expires_at', new Date().toISOString());
      } else if (!includeDeleted) {
        query = query.is('deleted_at', null);
      }
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
      if (options.softDelete) query = query.is('deleted_at', null);
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
        if (options.softDelete) query = query.is('deleted_at', null);
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
    listDeleted: async (sort = '-deleted_at', limit = 1000) => {
      if (!options.softDelete) return [];
      let query = supabase
        .from(table)
        .select('*')
        .not('deleted_at', 'is', null)
        .gt('deletion_expires_at', new Date().toISOString());
      if (options.unitScoped) {
        const unitIds = getSelectedScopedUnitIds();
        const unitId = unitIds[0] || await resolveScopedUnitId();
        if (unitIds.length > 1) query = query.in('empresa_id', unitIds);
        else if (unitId) query = query.eq('empresa_id', unitId);
      }
      if (sort && typeof sort === 'string') {
        const field = sort.replace(/^-/, '');
        query = query.order(field, { ascending: !sort.startsWith('-') });
      }
      if (typeof limit === 'number') query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw toAppError(error, `Erro ao listar perfis excluídos em ${table}.`);
      return data || [];
    },
    filter: async (queryObj = {}, sort, limit) => {
      let query = supabase.from(table).select('*');
      if (options.softDelete && !Object.prototype.hasOwnProperty.call(queryObj || {}, 'deleted_at')) {
        query = query.is('deleted_at', null);
      }
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
      if (options.softDelete) {
        const deletedAt = new Date();
        const { data: authData } = await supabase.auth.getUser();
        const deletionPayload = {
          ativo: false,
          deleted_at: deletedAt.toISOString(),
          deletion_expires_at: new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          deleted_by: authData?.user?.id || null,
          updated_date: deletedAt.toISOString(),
        };
        let query = supabase.from(table).update(deletionPayload).eq('id', id).is('deleted_at', null);
        if (options.unitScoped) {
          const unitId = await resolveScopedUnitId();
          if (unitId) query = query.eq('empresa_id', unitId);
        }
        const { data, error } = await query.select();
        if (error) throw toAppError(error, `Erro ao excluir perfil em ${table}.`);
        const deletedRows = Array.isArray(data) ? data.filter(Boolean) : (data ? [data] : []);
        if (!deletedRows.length) throw new Error('O perfil não foi excluído porque já estava removido ou está fora da unidade ativa.');
        return deletedRows[0];
      }

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
    restore: async (id) => {
      if (!options.softDelete) throw new Error('Esta entidade não permite restauração.');
      if (options.unitScoped) ensureSingleUnitWrite(table);
      const restorePayload = {
        ativo: true,
        deleted_at: null,
        deletion_expires_at: null,
        deleted_by: null,
        updated_date: new Date().toISOString(),
      };
      let query = supabase
        .from(table)
        .update(restorePayload)
        .eq('id', id)
        .not('deleted_at', 'is', null)
        .gt('deletion_expires_at', new Date().toISOString());
      if (options.unitScoped) {
        const unitId = await resolveScopedUnitId();
        if (unitId) query = query.eq('empresa_id', unitId);
      }
      const { data, error } = await query.select();
      if (error) throw toAppError(error, `Erro ao restaurar perfil em ${table}.`);
      const restoredRows = Array.isArray(data) ? data.filter(Boolean) : (data ? [data] : []);
      if (!restoredRows.length) throw new Error('O prazo de 30 dias para desfazer esta exclusão terminou.');
      return restoredRows[0];
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
    PagamentoV2Execucao: 'pagamento_v2_execucao',
    PagamentoV2Reversao: 'pagamento_v2_reversao',
    CarteiraReconciliacao: 'carteira_reconciliacao',
    AutorizacaoFinanceira: 'autorizacao_financeira',
    CancelamentoFinanceiro: 'cancelamento_financeiro',
    OrcamentoPagamento: 'orcamento_pagamento',
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
    UserUnitAccess: 'user_unit_access',
    UserProfile: 'users',
    CentroCusto: 'centro_custo',
  };

  const toSnake = (name) => name.replace(/([A-Z])/g, '_$1').replace(/^_/, '').toLowerCase();

  const supabaseEntities = {};
  Object.keys(entityToTable).forEach((entityName) => {
    const table = entityToTable[entityName] || toSnake(entityName);
    const profileOptions = entityName === 'Responsavel'
      ? { softDelete: true, documentField: 'cpf', entityLabel: 'Responsável' }
      : entityName === 'Carteira' || entityName === 'Client'
        ? { softDelete: true, documentField: 'cpf_cnpj', entityLabel: 'Responsável Financeiro' }
        : {};
    supabaseEntities[entityName] = createSupabaseEntity(table, {
      unitScoped: UNIT_SCOPED_ENTITIES.has(entityName),
      ...profileOptions,
    });
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
          const functionError = new Error(await parseFunctionError(error));
          functionError.functionResponseReceived = Boolean(error?.context);
          functionError.cause = error;
          throw functionError;
        }
        return data;
      } catch (invokeError) {
        // An HTTP error means the function already ran; retry only genuine transport failures.
        if (invokeError?.functionResponseReceived || invokeError?.context || !functionUrl || !SUPABASE_ANON) {
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
        const shouldHintDeploy = /failed to send a request|edge function.*not found|function.*not found|status.?404/i.test(baseMessage);
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
    financeWriteFlowMap: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_write_flow_map', {
        p_empresa_id: payload?.empresa_id || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar o mapa de fluxos de escrita financeira.');
      }
      return Array.isArray(data) ? data : [];
    },
    financeWriteGovernanceMatrix: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_write_governance_matrix', {
        p_empresa_id: payload?.empresa_id || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar a matriz de governança da escrita financeira.');
      }
      return Array.isArray(data) ? data : [];
    },
    financeOperationalObservabilityContext: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_operational_observability_context', {
        p_empresa_id: payload?.empresa_id || null,
        p_periodo_inicio: payload?.periodo_inicio || null,
        p_periodo_fim: payload?.periodo_fim || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar o contexto de observabilidade financeira.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financeHybridWriteAudit: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_hybrid_write_audit', {
        p_empresa_id: payload?.empresa_id || null,
        p_periodo_inicio: payload?.periodo_inicio || null,
        p_periodo_fim: payload?.periodo_fim || null,
        p_limit: payload?.limit || 200,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar a trilha híbrida de escrita financeira.');
      }
      return Array.isArray(data) ? data : [];
    },
    financeOperationalReconciliationMatrix: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_operational_reconciliation_matrix', {
        p_empresa_id: payload?.empresa_id || null,
        p_periodo_inicio: payload?.periodo_inicio || null,
        p_periodo_fim: payload?.periodo_fim || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar a matriz de reconciliação operacional.');
      }
      return Array.isArray(data) ? data : [];
    },
    financePaymentV2Contract: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_payment_v2_contract', {
        p_empresa_id: payload?.empresa_id || null,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar o contrato formal do Pagamento V2.');
      }
      return Array.isArray(data) ? data : [];
    },
    financePaymentV2Execute: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_payment_v2_execute', {
        p_empresa_id: payload?.empresa_id || null,
        p_carteira_conta_id: payload?.carteira_conta_id || null,
        p_obrigacao_id: payload?.obrigacao_id || null,
        p_cobranca_financeira_id: payload?.cobranca_financeira_id || null,
        p_operacao_idempotencia: payload?.operacao_idempotencia || null,
        p_source_key: payload?.source_key || null,
        p_valor: payload?.valor ?? null,
        p_data_pagamento: payload?.data_pagamento || null,
        p_forma_pagamento: payload?.forma_pagamento || null,
        p_origem_operacional: payload?.origem_operacional || 'manual_operacional',
        p_usuario_id: payload?.usuario_id || null,
        p_metadata: payload?.metadata || {},
      });
      if (error) {
        throw toAppError(error, 'Erro ao executar a liquidacao controlada do Payment V2.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financePaymentV2ExecutionAudit: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_payment_v2_execution_audit', {
        p_empresa_id: payload?.empresa_id || null,
        p_limit: payload?.limit || 100,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar a auditoria de execucao do Payment V2.');
      }
      return Array.isArray(data) ? data : [];
    },
    financePaymentV2Reverse: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_payment_v2_reverse', {
        p_empresa_id: payload?.empresa_id || null,
        p_carteira_conta_id: payload?.carteira_conta_id || null,
        p_reversao_tipo: payload?.reversao_tipo || null,
        p_operacao_idempotencia: payload?.operacao_idempotencia || null,
        p_source_key: payload?.source_key || null,
        p_motivo: payload?.motivo || null,
        p_attachment_name: payload?.attachment_name || null,
        p_attachment_path: payload?.attachment_path || null,
        p_valor: payload?.valor ?? null,
        p_appointment_id: payload?.appointment_id || null,
        p_serviceprovided_id: payload?.serviceprovided_id || null,
        p_obrigacao_id: payload?.obrigacao_id || null,
        p_cobranca_financeira_id: payload?.cobranca_financeira_id || null,
        p_conta_receber_id: payload?.conta_receber_id || null,
        p_usuario_id: payload?.usuario_id || null,
        p_metadata: payload?.metadata || {},
      });
      if (error) {
        throw toAppError(error, 'Erro ao executar o estorno controlado do Payment V2.');
      }
      return Array.isArray(data) ? (data[0] || null) : data;
    },
    financePaymentV2ReversalAudit: async (payload = {}) => {
      const { data, error } = await supabase.rpc('finance_payment_v2_reversal_audit', {
        p_empresa_id: payload?.empresa_id || null,
        p_limit: payload?.limit || 100,
      });
      if (error) {
        throw toAppError(error, 'Erro ao carregar a auditoria de estorno do Payment V2.');
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
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const { data: userInvite, error: userInviteError } = await supabase
        .from('users')
        .select('*')
        .eq('email', normalizedEmail)
        .eq('invite_sent', true)
        .in('invite_status', ['pendente', 'aceito'])
        .order('created_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!userInviteError && userInvite) {
        return {
          ...userInvite,
          token: userInvite.invite_token,
          status: userInvite.invite_status,
          accepted_at: userInvite.invite_accepted_at,
          expires_at: userInvite.invite_expires_at,
          metadata: userInvite.invite_metadata,
        };
      }

      const { data, error } = await supabase
        .from('user_invite')
        .select('*')
        .eq('email', normalizedEmail)
        .in('status', ['pendente', 'aceito'])
        .order('created_date', { ascending: false })
        .limit(1);

      if (error) {
        console.warn('findPendingInviteByEmail error', error);
        if (error?.code === 'PGRST205' || /user_invite|schema cache|does not exist|relation/i.test(error?.message || '')) {
          return null;
        }
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
        invite_sent: existingProfile?.invite_sent ?? Boolean(invite),
        invite_accepted: existingProfile?.invite_accepted ?? ['aceito', 'concluido'].includes(invite?.status || ''),
        invite_status: existingProfile?.invite_status || invite?.status || null,
        invite_token: existingProfile?.invite_token || invite?.token || null,
        invited_by_user_id: existingProfile?.invited_by_user_id || invite?.invited_by_user_id || null,
        invited_at: existingProfile?.invited_at || invite?.invited_at || null,
        invite_accepted_at: existingProfile?.invite_accepted_at || invite?.accepted_at || null,
        invite_expires_at: existingProfile?.invite_expires_at || invite?.expires_at || null,
        invite_metadata: existingProfile?.invite_metadata || invite?.metadata || {},
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
          invite_sent: Boolean(invite),
          invite_accepted: ['aceito', 'concluido'].includes(invite?.status || ''),
          invite_status: invite?.status || null,
          invite_token: invite?.token || null,
          invited_by_user_id: invite?.invited_by_user_id || null,
          invited_at: invite?.invited_at || null,
          invite_accepted_at: invite?.accepted_at || null,
          invite_expires_at: invite?.expires_at || null,
          invite_metadata: invite?.metadata || {},
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
