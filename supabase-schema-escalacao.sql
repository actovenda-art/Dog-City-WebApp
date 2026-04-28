-- Escalacao de funcionarios por unidade
-- Execute este arquivo no SQL Editor do Supabase.

alter table if exists public.serviceproviders
  add column if not exists cpf text;

alter table if exists public.serviceproviders
  add column if not exists selfie_url text;

alter table if exists public.serviceproviders
  add column if not exists nome_pai text,
  add column if not exists nome_mae text,
  add column if not exists data_nascimento date,
  add column if not exists cep text,
  add column if not exists rua text,
  add column if not exists numero text,
  add column if not exists bairro text,
  add column if not exists cidade text,
  add column if not exists estado text,
  add column if not exists pix_key_type text,
  add column if not exists pix_key text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact text,
  add column if not exists cpf_anexo_url text,
  add column if not exists rg_anexo_url text,
  add column if not exists profile_photo_url text,
  add column if not exists health_issue boolean not null default false,
  add column if not exists health_issue_description text,
  add column if not exists controlled_medication boolean not null default false,
  add column if not exists registration_token text,
  add column if not exists registration_status text not null default 'pendente',
  add column if not exists completed_at timestamptz;

create unique index if not exists idx_serviceproviders_empresa_cpf_unique
  on public.serviceproviders (
    empresa_id,
    regexp_replace(coalesce(cpf, ''), '\D', '', 'g')
  )
  where cpf is not null and trim(cpf) <> '';

create unique index if not exists idx_serviceproviders_registration_token_unique
  on public.serviceproviders (registration_token)
  where registration_token is not null and trim(registration_token) <> '';

create table if not exists public.serviceprovider_schedule (
  id text primary key default gen_random_uuid()::text,
  empresa_id text not null,
  serviceprovider_id text not null references public.serviceproviders(id) on delete cascade,
  funcao text not null,
  weekdays jsonb not null default '[1,2,3,4,5]'::jsonb,
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

alter table if exists public.serviceprovider_schedule
  add column if not exists weekdays jsonb not null default '[1,2,3,4,5]'::jsonb;

update public.serviceprovider_schedule
set weekdays = '[1,2,3,4,5]'::jsonb
where weekdays is null;

alter table if exists public.serviceprovider_schedule enable row level security;

drop policy if exists serviceprovider_schedule_unit_policy on public.serviceprovider_schedule;
create policy serviceprovider_schedule_unit_policy on public.serviceprovider_schedule
for all
to authenticated
using (public.app_active_unit_matches(empresa_id))
with check (public.app_active_unit_matches(empresa_id));
