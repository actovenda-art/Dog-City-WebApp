# Dog City Brasil WebApp

Aplicacao Vite + React da Dog City Brasil, conectada ao Supabase para dados, autenticacao e storage.

## Rodando localmente

```bash
npm install
npm run dev
```

## Ambiente oficial do frontend

- O arquivo oficial versionado do frontend e `.env.local`.
- Esse arquivo deve conter apenas variaveis publicas do cliente, sempre com prefixo `VITE_`.
- Segredos reais devem ficar fora do frontend, em variaveis do provedor de deploy, Supabase secrets ou servicos de backend.

## Build

```bash
npm run build
```

## Estrutura relevante

- `src/api/appClient.js`: cliente da aplicacao com Supabase + fallback local
- `src/api/entities.js`: entidades usadas pelas paginas
- `src/api/integrations.js`: uploads e signed URLs
- `supabase-*.sql`: schemas, migracoes e seeds do projeto
