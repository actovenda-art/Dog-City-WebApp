// This file provides a dual-mode client:
// - If VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are defined, use Supabase as backend.
// - Otherwise fall back to a lightweight local mock (localStorage) so the app remains functional.

import { createClient } from '@supabase/supabase-js';
import { getStoredActiveUnitId, resolveDogCityUnit, setStoredActiveUnitId } from '@/lib/unit-context';

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
  } catch (e) {
    return [];
  }
}

function writeStorage(key, value) {
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
}

function toAppError(error, fallback = 'Erro no Supabase.') {
  if (!error) return new Error(fallback);
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
  const missingExtratoColumn = isMissingColumnFor('extratobancario');
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
    : missingExtratoColumn
      ? `${rawMessage}. Execute os arquivos supabase-schema-finance-ledger.sql e supabase-schema-controle-gerencial.sql no Supabase.`
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

function createMockEntity(name, options = {}) {
  const { unitScoped = false } = options;

  return {
    list: (sort, limit) => Promise.resolve(
      readStorage(name)
        .filter((item) => !unitScoped || !item.empresa_id || item.empresa_id === getMockScopedUnitId())
        .slice(0, limit || undefined)
    ),
    listAll: (sort, limit) => Promise.resolve(
      readStorage(name)
        .filter((item) => !unitScoped || !item.empresa_id || item.empresa_id === getMockScopedUnitId())
        .slice(0, limit || undefined)
    ),
    filter: (query = {}, sort, limit) => {
      const scopedQuery = { ...(query || {}) };
      if (unitScoped && !Object.prototype.hasOwnProperty.call(scopedQuery, 'empresa_id')) {
        scopedQuery.empresa_id = getMockScopedUnitId();
      }
      return Promise.resolve(
        readStorage(name)
        .filter((item) => Object.keys(scopedQuery || {}).every((key) => {
          return scopedQuery[key] === null || scopedQuery[key] === undefined || item[key] === scopedQuery[key];
        }))
        .slice(0, limit || undefined)
      );
    },
    create: (data) => {
      const items = readStorage(name);
      const item = { ...data };
      if (unitScoped && !item.empresa_id) item.empresa_id = getMockScopedUnitId();
      if (!item.id) item.id = makeId();
      if (!item.created_date) item.created_date = new Date().toISOString();
      items.push(item);
      writeStorage(name, items);
      return Promise.resolve(item);
    },
    update: (id, data) => {
      const items = readStorage(name);
      const idx = items.findIndex((item) => item.id === id);
      if (idx === -1) return Promise.reject(new Error('Not found'));
      items[idx] = { ...items[idx], ...data, updated_date: new Date().toISOString() };
      writeStorage(name, items);
      return Promise.resolve(items[idx]);
    },
    delete: (id) => {
      const items = readStorage(name);
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
  'Dog', 'Checkin', 'Schedule', 'ServiceProvider', 'Lancamento', 'ExtratoBancario', 'Despesa',
  'Responsavel', 'Carteira', 'Notificacao', 'Orcamento', 'TabelaPrecos', 'Appointment',
  'ServiceProvided', 'Transaction', 'ScheduledTransaction', 'Replacement', 'PlanConfig',
  'IntegracaoConfig', 'Receita', 'AppConfig', 'AppAsset', 'Empresa', 'PerfilAcesso',
  'UserInvite', 'UserUnitAccess',
  'UserProfile', 'ContaReceber', 'Client', 'PedidoInterno',
  'CentroCusto',
].forEach((name) => {
  defaultEntities[name] = createMockEntity(name, { unitScoped: UNIT_SCOPED_ENTITIES.has(name) });
});

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
            } catch (e) {
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
      } catch (e) {
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
  };

  return {
    currentUser,
    isEnabled: () => false,
    requiresLogin: () => false,
    getSession: async () => ({ user: currentUser }),
    me: async () => {
      const activeUnitId = getStoredActiveUnitId() || currentUser.empresa_id;
      return {
        ...currentUser,
        assigned_empresa_id: currentUser.empresa_id,
        allowed_unit_ids: [currentUser.empresa_id],
        active_unit_id: activeUnitId,
        empresa_id: activeUnitId,
      };
    },
    list: async () => [currentUser],
    signInWithGoogle: async () => ({ provider: 'google', user: currentUser }),
    exchangeCodeForSession: async () => ({ session: { user: currentUser }, user: currentUser }),
    onAuthStateChange: () => ({ unsubscribe() {} }),
    logout: async () => {
      setStoredActiveUnitId('');
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
      } catch (error) {
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

    const storedUnitId = getStoredActiveUnitId();
    if (storedUnitId && allowedUnitIds.includes(storedUnitId)) {
      return storedUnitId;
    }

    if (preferredUnitId && allowedUnitIds.includes(preferredUnitId)) {
      setStoredActiveUnitId(preferredUnitId);
      return preferredUnitId;
    }

    if (cachedDefaultUnitId && allowedUnitIds.includes(cachedDefaultUnitId)) {
      setStoredActiveUnitId(cachedDefaultUnitId);
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
        setStoredActiveUnitId(resolvedUnitId);
      }
      return resolvedUnitId;
    } catch (error) {
      return allowedUnitIds[0] || profile?.empresa_id || '';
    }
  }

  const createSupabaseEntity = (table, options = {}) => ({
    unitScoped: options.unitScoped || false,
    list: async (sort, limit) => {
      let query = supabase.from(table).select('*');
      if (options.unitScoped) {
        const unitId = await resolveScopedUnitId();
        if (unitId) query = query.eq('empresa_id', unitId);
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
          const unitId = await resolveScopedUnitId();
          if (unitId) query = query.eq('empresa_id', unitId);
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
        const unitId = await resolveScopedUnitId();
        if (unitId) query = query.eq('empresa_id', unitId);
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
    create: async (payload) => {
      const insertPayload = { ...(payload || {}) };
      if (options.unitScoped && !insertPayload.empresa_id) {
        insertPayload.empresa_id = await resolveScopedUnitId();
      }
      const { data, error } = await supabase.from(table).insert([insertPayload]).select().single();
      if (error) throw toAppError(error, `Erro ao criar registro em ${table}.`);
      return data;
    },
    update: async (id, payload) => {
      let query = supabase.from(table).update(payload).eq('id', id);
      if (options.unitScoped) {
        const unitId = payload?.empresa_id || await resolveScopedUnitId();
        if (unitId) query = query.eq('empresa_id', unitId);
      }
      const { data, error } = await query.select().single();
      if (error) throw toAppError(error, `Erro ao atualizar registro em ${table}.`);
      return data;
    },
    delete: async (id) => {
      let query = supabase.from(table).delete().eq('id', id);
      if (options.unitScoped) {
        const unitId = await resolveScopedUnitId();
        if (unitId) query = query.eq('empresa_id', unitId);
      }
      const { data, error } = await query.select().single();
      if (error) throw toAppError(error, `Erro ao excluir registro em ${table}.`);
      return data;
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
    TabelaPrecos: 'tabelaprecos',
    ServiceProvided: 'serviceprovided',
    ServiceProvider: 'serviceproviders',
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
      } catch (e) {
        // ignore notification write failures
      }
      return { ok: true };
    },
    bancoInter: async (payload = {}) => {
      const { data, error } = await supabase.functions.invoke('banco-inter-sync', {
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
        } catch (parseError) {
          details = '';
        }
        throw new Error(details || error.message || 'Falha na integração com Banco Inter.');
      }
      return data;
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
            } catch (error) {
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
        } catch (e) {
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
    } catch (error) {
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
      const allowedUnitIds = await resolveAllowedUnitIds(authUser, mergedUser);
      const activeUnitId = await resolveScopedUnitId(getStoredActiveUnitId() || mergedUser?.empresa_id || '');
      const sessionUser = {
        ...mergedUser,
        assigned_empresa_id: mergedUser?.empresa_id || null,
        allowed_unit_ids: allowedUnitIds,
        active_unit_id: activeUnitId || mergedUser?.empresa_id || null,
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
      setStoredActiveUnitId('');
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
