// This file provides a dual-mode client:
// - If VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are defined, use Supabase as backend.
// - Otherwise fall back to a lightweight local mock (localStorage) so the app remains functional.

import { createClient } from '@supabase/supabase-js';

const STORAGE_PREFIX = 'local_app_client_';
const makeId = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_PUBLIC_BUCKET = import.meta.env.VITE_SUPABASE_PUBLIC_BUCKET || 'public-assets';
const SUPABASE_PRIVATE_BUCKET = import.meta.env.VITE_SUPABASE_PRIVATE_BUCKET || 'private-files';

function readStorage(key) {
  try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + key) || '[]'); }
  catch (e) { return []; }
}

function writeStorage(key, value) {
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
}

function createMockEntity(name) {
  return {
    list: (sort, limit) => Promise.resolve(readStorage(name).slice(0, limit || undefined)),
    filter: (query = {}, sort, limit) => Promise.resolve(readStorage(name).filter(item => {
      return Object.keys(query || {}).every(k => (query[k] === null || query[k] === undefined) || item[k] === query[k]);
    }).slice(0, limit || undefined)),
    create: (data) => {
      const items = readStorage(name);
      const item = { ...data };
      if (!item.id) item.id = makeId();
      if (!item.created_date) item.created_date = new Date().toISOString();
      items.push(item);
      writeStorage(name, items);
      return Promise.resolve(item);
    },
    update: (id, data) => {
      const items = readStorage(name);
      const idx = items.findIndex(i => i.id === id);
      if (idx === -1) return Promise.reject(new Error('Not found'));
      items[idx] = { ...items[idx], ...data, updated_date: new Date().toISOString() };
      writeStorage(name, items);
      return Promise.resolve(items[idx]);
    },
    delete: (id) => {
      let items = readStorage(name);
      const idx = items.findIndex(i => i.id === id);
      if (idx === -1) return Promise.reject(new Error('Not found'));
      const removed = items.splice(idx,1)[0];
      writeStorage(name, items);
      return Promise.resolve(removed);
    }
  };
}

// Build default mock entities
const defaultEntities = {};
[
  'Dog','Checkin','Schedule','ServiceProvider','Lancamento','ExtratoBancario','ContaReceber','Client',
  'PedidoInterno','Despesa','Responsavel','Carteira','Notificacao','Orcamento','TabelaPrecos',
  'Appointment','ServiceProvided','Transaction','ScheduledTransaction','Replacement','PlanConfig',
  'IntegracaoConfig','Receita','AppConfig','AppAsset','Empresa','PerfilAcesso','UserProfile'
].forEach(n => { defaultEntities[n] = createMockEntity(n); });

const mockFunctions = {
  notificacoesOrcamento: async (payload) => {
    console.info('[mock] notificacoesOrcamento called with', payload);
    return { ok: true };
  },
  bancoInter: async (payload) => {
    console.info('[mock] bancoInter called with', payload);
    return { ok: true };
  }
};

const mockIntegrations = {
  Core: {
    UploadFile: async ({ file }) => {
      if (!file) throw new Error('No file provided');
      if (typeof File !== 'undefined' && file instanceof File) {
        const reader = new FileReader();
        return await new Promise((resolve, reject) => {
          reader.onload = () => {
            const dataUrl = reader.result;
            const key = 'uploaded_' + makeId();
            try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ name: file.name, dataUrl })); }
            catch (e) { /* ignore */ }
            resolve({ file_url: dataUrl, file_key: key });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      if (typeof file === 'string') return { file_url: file, file_key: makeId() };
      return { file_url: null, file_key: makeId() };
    },
    CreateFileSignedUrl: async ({ filename, path }) => ({ url: `data:application/octet-stream,${encodeURIComponent(path || filename || 'file')}` }),
    UploadPrivateFile: async ({ file }) => mockIntegrations.Core.UploadFile({ file }),
    GenerateImage: async ({ prompt }) => {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='100%' height='100%' fill='%23eee'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23666' font-size='20'>${prompt ? prompt.toString().slice(0,40) : 'Generated Image'}</text></svg>`;
      const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      return { image_url: dataUrl };
    },
    ExtractDataFromUploadedFile: async ({ file_key }) => {
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + file_key);
        if (!raw) return { data: null };
        const obj = JSON.parse(raw);
        return { data: { name: obj.name, size: (obj.dataUrl || '').length } };
      } catch (e) { return { data: null }; }
    }
  }
};

// If Supabase is configured, create supabase-backed entities and integrations
// Mock auth implementation (used when Supabase not configured)
const createMockAuth = () => {
  const currentUser = { id: 'local_user', email: 'dev@example.com', name: 'Dev User', empresa_id: 'empresa_demo' };
  return {
    currentUser,
    me: async () => currentUser,
    list: async () => [currentUser]
  };
};

let appClient = { entities: defaultEntities, functions: mockFunctions, integrations: mockIntegrations, auth: createMockAuth() };

if (SUPABASE_URL && SUPABASE_ANON) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

  const createSupabaseEntity = (table) => ({
    list: async (sort, limit) => {
      let query = supabase.from(table).select('*');
      if (sort && typeof sort === 'string') {
        const field = sort.replace(/^-/, '');
        const desc = sort.startsWith('-');
        query = query.order(field, { ascending: !desc });
      }
      if (typeof limit === 'number') query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    filter: async (q = {}, sort, limit) => {
      let query = supabase.from(table).select('*');
      if (q && Object.keys(q).length) query = query.match(q);
      if (sort && typeof sort === 'string') {
        const field = sort.replace(/^-/, '');
        const desc = sort.startsWith('-');
        query = query.order(field, { ascending: !desc });
      }
      if (typeof limit === 'number') query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    create: async (payload) => {
      const { data, error } = await supabase.from(table).insert([payload]).select().single();
      if (error) throw error;
      return data;
    },
    update: async (id, payload) => {
      const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id) => {
      const { data, error } = await supabase.from(table).delete().eq('id', id).select().single();
      if (error) throw error;
      return data;
    }
  });

  // Map entity names used in the code to Supabase table names.
  // Adjust these values to match the actual table names in your Supabase project.
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
    // Common/expected: match name used in `supabase-schema.sql`
    TabelaPrecos: 'tabelaprecos',
    ServiceProvided: 'serviceprovided',
    ServiceProvider: 'serviceproviders',
    Transaction: 'transaction',
    ScheduledTransaction: 'scheduledtransaction',
    Replacement: 'replacement',
    Lancamento: 'lancamento',
    ExtratoBancario: 'extratobancario',
    ContaReceber: 'conta_receber',
    Receita: 'receita',
    PedidoInterno: 'pedidointerno',
    Notificacao: 'notificacao',
    Checkin: 'checkins',
    IntegracaoConfig: 'integracao_config',
    AppConfig: 'app_config',
    AppAsset: 'app_asset',
    Empresa: 'empresa',
    PerfilAcesso: 'perfil_acesso',
    UserProfile: 'users'
  };

  const toSnake = (name) => name.replace(/([A-Z])/g, '_$1').replace(/^_/, '').toLowerCase();

  const supabaseEntities = {};
  // Create an entry for each entity name used by the app. If no explicit mapping exists,
  // fallback to a snake_case table name derived from the entity name.
  Object.keys(entityToTable).forEach(entityName => {
    const table = entityToTable[entityName] || toSnake(entityName);
    supabaseEntities[entityName] = createSupabaseEntity(table);
  });

  const supabaseFunctions = {
    notificacoesOrcamento: async (payload) => {
      // try to write to notificacao table when present
      try {
        if (payload) {
          await supabase.from('notificacao').insert([{ tipo: payload.action, data: JSON.stringify(payload.data), created_date: new Date().toISOString() }]);
        }
      } catch (e) { /* ignore */ }
      return { ok: true };
    },
    bancoInter: async (payload) => ({ ok: true })
  };

  const supabaseIntegrations = {
    Core: {
      UploadFile: async ({ file, path }) => {
        const bucket = SUPABASE_PUBLIC_BUCKET;
        const filename = path || `${Date.now()}_${file.name || 'file'}`;
        const { data, error: uploadError } = await supabase.storage.from(bucket).upload(filename, file, { upsert: true });
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
        // placeholder: return an SVG data URL
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='100%' height='100%' fill='%23eee'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23666' font-size='20'>${prompt ? prompt.toString().slice(0,40) : 'Generated Image'}</text></svg>`;
        const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        return { image_url: dataUrl };
      },
      ExtractDataFromUploadedFile: async ({ path }) => {
        // Not trivial to extract; return metadata if file exists
        try {
          const bucket = SUPABASE_PRIVATE_BUCKET;
          const { data, error } = await supabase.storage.from(bucket).list(path ? path.split('/').slice(0, -1).join('/') : '');
          if (error) return { data: null };
          return { data };
        } catch (e) { return { data: null }; }
      }
    }
  };

  // Build a small auth wrapper that exposes `me()` and `list()` to match the app's expectations.
  const supabaseAuth = {
    // current authenticated user
    currentUser: null,
    me: async () => {
      try {
        let authUser = null;
        if (typeof supabase.auth.getUser === 'function') {
          const res = await supabase.auth.getUser();
          // v2 returns { data: { user } }
          if (res && res.data && res.data.user) authUser = res.data.user;
        }
        // fallbacks for different versions
        if (!authUser && typeof supabase.auth.user === 'function') authUser = supabase.auth.user();
        if (!authUser && supabase.auth && supabase.auth.session && supabase.auth.session.user) authUser = supabase.auth.session.user;
        if (!authUser) return null;

        try {
          let query = supabase.from('users').select('*');
          if (authUser.id) {
            query = query.eq('id', authUser.id);
          } else if (authUser.email) {
            query = query.eq('email', authUser.email);
          }
          const { data: profileData } = await query.limit(1);
          const profile = profileData?.[0];
          if (profile) return { ...authUser, ...profile };
        } catch (profileError) {
          console.warn('supabaseAuth.me profile lookup error', profileError);
        }
        return authUser;
      } catch (e) {
        console.warn('supabaseAuth.me error', e);
      }
      return null;
    },
    list: async (sort, limit) => {
      // Try to read from a `users` table if it exists. If not, return empty array.
      try {
        let q = supabase.from('users').select('*');
        if (sort && typeof sort === 'string') {
          const field = sort.replace(/^-/, '');
          const desc = sort.startsWith('-');
          q = q.order(field, { ascending: !desc });
        }
        if (typeof limit === 'number') q = q.limit(limit);
        const { data, error } = await q;
        if (error) {
          // Table may not exist — harmless fallback
          console.warn('supabaseAuth.list: users table read error', error.message || error);
          return [];
        }
        return data || [];
      } catch (e) {
        console.warn('supabaseAuth.list error', e);
        return [];
      }
    }
  };

  appClient = { entities: supabaseEntities, functions: supabaseFunctions, integrations: supabaseIntegrations, auth: supabaseAuth };
}

export { appClient };
