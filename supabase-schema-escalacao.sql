-- Escalacao de funcionarios por unidade
-- Execute este arquivo no SQL Editor do Supabase.

alter table if exists public.serviceproviders
  add column if not exists cpf text;

create unique index if not exists idx_serviceproviders_empresa_cpf_unique
  on public.serviceproviders (
    empresa_id,
    regexp_replace(coalesce(cpf, ''), '\D', '', 'g')
  )
  where cpf is not null and trim(cpf) <> '';

create table if not exists public.serviceprovider_schedule (
  id text primary key default gen_random_uuid()::text,
  empresa_id text not null,
  serviceprovider_id text not null references public.serviceproviders(id) on delete cascade,
  funcao text not null,
  horario_entrada text,
  horario_saida text,
  almoco_saida text,
  almoco_volta text,
  automatico boolean not null default false,
  ativo boolean not null default true,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create index if not exists idx_serviceprovider_schedule_empresa_id
  on public.serviceprovider_schedule (empresa_id);

create index if not exists idx_serviceprovider_schedule_provider_id
  on public.serviceprovider_schedule (serviceprovider_id);

alter table if exists public.serviceprovider_schedule enable row level security;

drop policy if exists serviceprovider_schedule_unit_policy on public.serviceprovider_schedule;
create policy serviceprovider_schedule_unit_policy on public.serviceprovider_schedule
for all
to authenticated
using (public.app_active_unit_matches(empresa_id))
with check (public.app_active_unit_matches(empresa_id));
