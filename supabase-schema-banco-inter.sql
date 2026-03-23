-- Banco Inter: schema, status de sincronizacao e rotina automatica
-- Execute apos:
-- 1. supabase-schema.sql
-- 2. supabase-schema-additional.sql
-- 3. supabase-schema-company-pricing.sql
-- 4. supabase-schema-admin-multiempresa.sql

create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table if exists public.integracao_config
  add column if not exists nome text,
  add column if not exists empresa_id text,
  add column if not exists credenciais jsonb default '{}'::jsonb,
  add column if not exists certificate_crt text,
  add column if not exists certificate_key text,
  add column if not exists scope text,
  add column if not exists token_url text,
  add column if not exists api_base_url text,
  add column if not exists balance_path text,
  add column if not exists extra_headers jsonb default '{}'::jsonb,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists auto_sync_enabled boolean default true,
  add column if not exists auto_sync_interval_minutes integer default 60,
  add column if not exists sync_backfill_days integer default 3,
  add column if not exists next_sync_at timestamptz,
  add column if not exists sync_status text default 'idle',
  add column if not exists last_sync_started_at timestamptz,
  add column if not exists last_sync_finished_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_error_at timestamptz,
  add column if not exists last_error_message text,
  add column if not exists last_http_status integer,
  add column if not exists current_balance decimal(12,2),
  add column if not exists current_balance_at timestamptz;

update public.integracao_config
set
  nome = coalesce(nome, provider),
  provider = coalesce(provider, nome),
  credenciais = coalesce(credenciais, config, '{}'::jsonb),
  balance_path = coalesce(balance_path, '/banking/v2/saldo'),
  next_sync_at = coalesce(next_sync_at, now()),
  sync_status = coalesce(sync_status, 'idle')
where true;

drop index if exists idx_integracao_config_empresa_provider_unique;
create index if not exists idx_integracao_config_empresa_provider
  on public.integracao_config(empresa_id, provider);

create unique index if not exists idx_integracao_config_provider_global_unique
  on public.integracao_config(provider)
  where empresa_id is null;

create unique index if not exists idx_integracao_config_empresa_provider_unique
  on public.integracao_config(empresa_id, provider)
  where empresa_id is not null;

create index if not exists idx_integracao_config_sync_due
  on public.integracao_config(provider, next_sync_at)
  where ativo = true and auto_sync_enabled = true;

alter table if exists public.extratobancario
  add column if not exists empresa_id text,
  add column if not exists data date,
  add column if not exists banco text,
  add column if not exists forma_pagamento text,
  add column if not exists categoria text,
  add column if not exists conciliado boolean default false,
  add column if not exists status text default 'importado',
  add column if not exists source_provider text default 'manual',
  add column if not exists external_id text,
  add column if not exists saldo decimal(12,2),
  add column if not exists raw_data jsonb default '{}'::jsonb,
  add column if not exists imported_at timestamptz default now(),
  add column if not exists sync_run_id text;

update public.extratobancario
set
  data = coalesce(data, data_movimento),
  data_movimento = coalesce(data_movimento, data),
  source_provider = coalesce(source_provider, 'manual'),
  external_id = coalesce(external_id, lancamento_id),
  status = coalesce(status, 'importado')
where true;

create index if not exists idx_extratobancario_empresa_data
  on public.extratobancario(empresa_id, data desc);

create index if not exists idx_extratobancario_provider
  on public.extratobancario(source_provider, data desc);

drop index if exists idx_extratobancario_unique_external;
create unique index if not exists idx_extratobancario_unique_external
  on public.extratobancario(empresa_id, source_provider, external_id);

create table if not exists public.integracao_sync_log (
  id text primary key default gen_random_uuid()::text,
  empresa_id text,
  integracao_id text,
  provider text not null,
  status text not null default 'running',
  trigger_source text default 'manual',
  requested_from date,
  requested_to date,
  imported_count integer default 0,
  deduplicated_count integer default 0,
  http_status integer,
  error_message text,
  response_summary jsonb default '{}'::jsonb,
  started_at timestamptz default now(),
  finished_at timestamptz,
  created_date timestamp default now(),
  updated_date timestamp default now()
);

create index if not exists idx_integracao_sync_log_empresa_started
  on public.integracao_sync_log(empresa_id, started_at desc);

create index if not exists idx_integracao_sync_log_provider_started
  on public.integracao_sync_log(provider, started_at desc);

insert into public.integracao_config (
  provider,
  nome,
  ativo,
  scope,
  token_url,
  api_base_url,
  balance_path,
  auto_sync_enabled,
  auto_sync_interval_minutes,
  sync_backfill_days,
  next_sync_at
)
select
  'banco_inter',
  'banco_inter',
  false,
  'extrato.read saldo.read',
  'https://cdpj.partners.bancointer.com.br/oauth/v2/token',
  'https://cdpj.partners.bancointer.com.br',
  '/banking/v2/saldo',
  true,
  60,
  3,
  now()
where not exists (
  select 1
  from public.integracao_config
  where provider = 'banco_inter'
    and empresa_id is null
);

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'banco-inter-sync-every-15m'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'banco-inter-sync-every-15m',
    '*/15 * * * *',
    $job$
      select net.http_post(
        url := 'https://trgpprhtqkldjdrhwlxa.supabase.co/functions/v1/banco-inter-sync',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{"action":"syncDue","trigger":"cron"}'::jsonb
      );
    $job$
  );
end $$;
