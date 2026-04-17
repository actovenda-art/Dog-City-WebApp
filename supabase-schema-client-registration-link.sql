-- Link público para cadastro de clientes
-- Execute após:
-- 1. supabase-schema.sql
-- 2. supabase-schema-cadastros-orcamento.sql
-- 3. supabase-schema-dogs-extended-profile.sql

alter table if exists public.dogs
  add column if not exists sexo text,
  add column if not exists porte text,
  add column if not exists castrado boolean default false,
  add column if not exists alergias text,
  add column if not exists restricoes_cuidados text,
  add column if not exists observacoes_gerais text,
  add column if not exists nome_vacina_revacinacao_1 text,
  add column if not exists nome_vacina_revacinacao_2 text,
  add column if not exists nome_vacina_revacinacao_3 text,
  add column if not exists medicamentos_continuos jsonb default '[]'::jsonb;

alter table if exists public.carteira
  add column if not exists street text,
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists contato_orcamentos jsonb default '{}'::jsonb,
  add column if not exists contato_alinhamentos jsonb default '{}'::jsonb;

create table if not exists public.client_registration_link (
  id text primary key default gen_random_uuid()::text,
  token text not null unique default gen_random_uuid()::text,
  empresa_id text not null,
  responsavel_nome text,
  responsavel_email text,
  status text not null default 'pendente',
  metadata jsonb not null default '{}'::jsonb,
  submitted_payload jsonb not null default '{}'::jsonb,
  created_by_user_id text,
  responsavel_id text,
  carteira_id text,
  dog_ids jsonb not null default '[]'::jsonb,
  opened_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  expires_at timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create index if not exists idx_client_registration_link_empresa_id
  on public.client_registration_link(empresa_id);

create index if not exists idx_client_registration_link_status
  on public.client_registration_link(status);

create index if not exists idx_client_registration_link_email
  on public.client_registration_link(responsavel_email);

create index if not exists idx_client_registration_link_created_date
  on public.client_registration_link(created_date desc);

alter table if exists public.client_registration_link enable row level security;
