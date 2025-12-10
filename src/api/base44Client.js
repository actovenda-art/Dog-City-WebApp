// Lightweight local mock of the Base44 client so the app can run without the SDK.
// It provides `entities` with simple `list`, `filter`, `create`, `update`, `delete` methods
// backed by `localStorage`, and a `functions` object with stubbed fns.

const STORAGE_PREFIX = 'local_base44_';

const makeId = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;

function readStorage(key) {
  try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + key) || '[]'); }
  catch (e) { return []; }
}

function writeStorage(key, value) {
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
}

function createEntity(name) {
  return {
    list: (sort, limit) => {
      const items = readStorage(name).slice();
      // simple sort: if sort starts with '-', remove and sort by that field desc
      if (sort && typeof sort === 'string') {
        const field = sort.replace(/^-/, '');
        const desc = sort.startsWith('-');
        items.sort((a,b) => {
          const va = a[field] || '';
          const vb = b[field] || '';
          if (va < vb) return desc ? 1 : -1;
          if (va > vb) return desc ? -1 : 1;
          return 0;
        });
      }
      return Promise.resolve(typeof limit === 'number' ? items.slice(0, limit) : items);
    },
    filter: (query = {}, sort, limit) => {
      const items = readStorage(name).filter(item => {
        return Object.keys(query || {}).every(k => {
          if (query[k] === null || query[k] === undefined) return true;
          // simple contains for strings, strict equals otherwise
          if (typeof query[k] === 'string' && typeof item[k] === 'string') {
            return item[k].toLowerCase().includes(query[k].toLowerCase());
          }
          return item[k] === query[k];
        });
      });
      if (sort && typeof sort === 'string') {
        const field = sort.replace(/^-/, '');
        const desc = sort.startsWith('-');
        items.sort((a,b) => {
          const va = a[field] || '';
          const vb = b[field] || '';
          if (va < vb) return desc ? 1 : -1;
          if (va > vb) return desc ? -1 : 1;
          return 0;
        });
      }
      return Promise.resolve(typeof limit === 'number' ? items.slice(0, limit) : items);
    },
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

const entitiesList = [
  'Dog','Checkin','ServiceProvider','Lancamento','ExtratoBancario','ContaReceber','Client',
  'PedidoInterno','Despesa','Responsavel','Carteira','Notificacao','Orcamento','TabelaPrecos',
  'Appointment','ServiceProvided','Transaction','ScheduledTransaction','Replacement','PlanConfig',
  'IntegracaoConfig','Receita'
];

const entities = {};
entitiesList.forEach(n => { entities[n] = createEntity(n); });

const functions = {
  notificacoesOrcamento: async (payload) => {
    console.info('[mock] notificacoesOrcamento called with', payload);
    return Promise.resolve({ ok: true });
  },
  bancoInter: async (payload) => {
    console.info('[mock] bancoInter called with', payload);
    return Promise.resolve({ ok: true });
  }
};

// Integrations mock: Core provider with file upload and simple helpers.
const integrations = {
  Core: {
    UploadFile: ({ file }) => new Promise((resolve, reject) => {
      if (!file) return reject(new Error('No file provided'));
      // If passed a File object in browser, read as data URL
      if (typeof File !== 'undefined' && file instanceof File) {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          const key = 'uploaded_' + makeId();
          // store file dataUrl in localStorage for retrieval
          try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ name: file.name, dataUrl })); }
          catch (e) { /* ignore */ }
          resolve({ file_url: dataUrl, file_key: key });
        };
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
      } else if (typeof file === 'string') {
        // already a URL or data URL
        resolve({ file_url: file, file_key: makeId() });
      } else {
        // unsupported type
        resolve({ file_url: null, file_key: makeId() });
      }
    }),
    CreateFileSignedUrl: async ({ filename }) => {
      // return a fake signed URL (not secure) that points to a data endpoint
      const url = `data:application/octet-stream,${encodeURIComponent(filename || 'file')}`;
      return Promise.resolve({ url });
    },
    UploadPrivateFile: async ({ file }) => {
      // reuse UploadFile behaviour
      return integrations.Core.UploadFile({ file });
    },
    GenerateImage: async ({ prompt }) => {
      // return a simple SVG data URL as placeholder
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='100%' height='100%' fill='%23eee'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23666' font-size='20'>${prompt ? prompt.toString().slice(0,40) : 'Generated Image'}</text></svg>`;
      const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      return Promise.resolve({ image_url: dataUrl });
    },
    ExtractDataFromUploadedFile: async ({ file_key }) => {
      // try to read stored file data
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + file_key);
        if (!raw) return Promise.resolve({ data: null });
        const obj = JSON.parse(raw);
        return Promise.resolve({ data: { name: obj.name, size: (obj.dataUrl || '').length } });
      } catch (e) { return Promise.resolve({ data: null }); }
    }
  }
};

const auth = {
  currentUser: null,
  login: async (u) => { auth.currentUser = u; return Promise.resolve(u); },
  logout: async () => { auth.currentUser = null; return Promise.resolve(); }
};

export const base44 = { entities, functions, integrations, auth };
