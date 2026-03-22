# Guia de Setup Supabase

## Ordem recomendada

1. `supabase-schema.sql`
2. `supabase-schema-additional.sql`
3. `supabase-schema-cloud-config.sql`
4. `supabase-storage-setup.sql`
5. `supabase-schema-company-pricing.sql`
6. `supabase-schema-admin-multiempresa.sql`
7. `supabase-seed.sql`
8. `supabase-seed-admin-config.sql`

## Variaveis de ambiente

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anonima
VITE_SUPABASE_PUBLIC_BUCKET=public-assets
VITE_SUPABASE_PRIVATE_BUCKET=private-files
```

## Cliente local

- `src/api/appClient.js`: cliente da aplicacao
- `src/api/entities.js`: entidades do frontend
- `src/api/integrations.js`: uploads e URLs assinadas

## Teste local

```bash
npm run dev
```

## Build

```bash
npm run build
```
