# Dog City Brasil WebApp

Aplicacao Vite + React da Dog City Brasil, conectada ao Supabase para dados, autenticacao e storage.

## Rodando localmente

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Estrutura relevante

- `src/api/appClient.js`: cliente da aplicacao com Supabase + fallback local
- `src/api/entities.js`: entidades usadas pelas paginas
- `src/api/integrations.js`: uploads e signed URLs
- `supabase-*.sql`: schemas, migracoes e seeds do projeto
