// This file provides a dual-mode client:
// - If VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are defined, use Supabase as backend.
// - Otherwise fall back to a lightweight local mock (localStorage) so the app remains functional.

import { createClient } from '@supabase/supabase-js';

const STORAGE_PREFIX = 'local_app_client_';
const makeId = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_PUBLIC_BUCKET = import.meta.env.VITE_SUPABASE_PUBLIC_BUCKET || 'public-assets';
const SUPABASE_PRIVATE_BUCKET = import.meta.env.VITE_SUPABASE_PRIVATE_BUCKET || 'private-files';
const DEFAULT_EMAIL_WEBHOOK_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/send-email` : '';

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

function createMockEntity(name) {
  return {
    list: (sort, limit) => Promise.resolve(readStorage(name).slice(0, limit || undefined)),
    filter: (query = {}, sort, limit) => Promise.resolve(
      readStorage(name)
        .filter((item) => Object.keys(query || {}).every((key) => {
          return query[key] === null || query[key] === undefined || item[key] === query[key];
        }))
        .slice(0, limit || undefined)
    ),
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
  'UserInvite',
  'UserProfile', 'ContaReceber', 'Client', 'PedidoInterno',
].forEach((name) => {
  defaultEntities[name] = createMockEntity(name);
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
    me: async () => currentUser,
    list: async () => [currentUser],
    signInWithGoogle: async () => ({ provider: 'google', user: currentUser }),
    exchangeCodeForSession: async () => ({ session: { user: currentUser }, user: currentUser }),
    onAuthStateChange: () => ({ unsubscribe() {} }),
    logout: async () => ({ ok: true }),
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
  });

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
    filter: async (queryObj = {}, sort, limit) => {
      let query = supabase.from(table).select('*');
      if (queryObj && Object.keys(queryObj).length) query = query.match(queryObj);
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
    UserProfile: 'users',
  };

  const toSnake = (name) => name.replace(/([A-Z])/g, '_$1').replace(/^_/, '').toLowerCase();

  const supabaseEntities = {};
  Object.keys(entityToTable).forEach((entityName) => {
    const table = entityToTable[entityName] || toSnake(entityName);
    supabaseEntities[entityName] = createSupabaseEntity(table);
  });

  const supabaseFunctions = {
    notificacoesOrcamento: async (payload) => {
      try {
        if (payload) {
          const notificationPayload = payload.data || {};
          const action = payload.action || 'notificacao';
          const titleByAction = {
            status_alterado: 'Status de orcamento atualizado',
            orcamento_criado: 'Novo orcamento criado',
            orcamento_enviado: 'Orcamento enviado',
          };
          const defaultMessage = action === 'status_alterado'
            ? `Novo status: ${notificationPayload?.novo_status || 'atualizado'}`
            : 'Voce recebeu uma nova notificacao.';
          await supabase.from('notificacao').insert([{
            user_id: payload.user_id || notificationPayload.user_id || null,
            empresa_id: payload.empresa_id || notificationPayload.empresa_id || null,
            tipo: action,
            titulo: payload.titulo || titleByAction[action] || 'Notificacao',
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

      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data?.user || null;
    } catch (error) {
      console.warn('getAuthenticatedUser error', error);
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
      supabaseAuth.currentUser = mergedUser;
      return mergedUser;
    },
    signInWithGoogle: async ({ redirectTo, nextPath } = {}) => {
      const origin = typeof window !== 'undefined' ? window.location.origin : SUPABASE_URL;
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
      const origin = typeof window !== 'undefined' ? window.location.origin : SUPABASE_URL;
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
