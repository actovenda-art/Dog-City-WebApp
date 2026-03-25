-- LEGADO: revisao de duplicidades do extrato importado.
-- Nao utilizar mais.
-- O fluxo atual usa `external_id` como deduplicacao oficial e recarrega o dia atual.
-- Para remover esta estrutura do banco, execute `supabase-drop-extrato-duplicidade.sql`.
--
-- Revisao de duplicidades do extrato importado.
-- Execute apos:
-- 1. supabase-schema-banco-inter.sql
-- 2. supabase-schema-finance-ledger.sql

create table if not exists public.extrato_duplicidade (
  id text primary key default gen_random_uuid()::text,
  empresa_id text not null,
  sync_run_id text,
  source_provider text not null default 'banco_inter',
  duplicate_reason text not null,
  status text not null default 'pendente',
  external_id text,
  duplicate_count integer not null default 1,
  imported_tipo text,
  imported_valor decimal(12,2),
  imported_descricao text,
  imported_data_movimento date,
  imported_data_hora timestamptz,
  imported_payload jsonb default '{}'::jsonb,
  existing_record_id text,
  existing_snapshot jsonb default '{}'::jsonb,
  review_notes text,
  resolved_at timestamptz,
  created_date timestamp default now(),
  updated_date timestamp default now()
);

create unique index if not exists idx_extrato_duplicidade_unique_review
  on public.extrato_duplicidade(empresa_id, sync_run_id, external_id, duplicate_reason);

create index if not exists idx_extrato_duplicidade_status
  on public.extrato_duplicidade(empresa_id, status, created_date desc);

create index if not exists idx_extrato_duplicidade_external_id
  on public.extrato_duplicidade(external_id);
