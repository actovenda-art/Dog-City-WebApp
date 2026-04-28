-- Isolamento forte por unidade para Dog City Brasil
-- Execute apos:
-- 1. supabase-schema.sql
-- 2. supabase-schema-additional.sql
-- 3. supabase-schema-company-pricing.sql
-- 4. supabase-schema-admin-multiempresa.sql
-- 5. supabase-schema-user-invite-onboarding.sql
-- 6. supabase-schema-cloud-config.sql
-- 7. supabase-schema-notificacoes.sql
-- 8. supabase-schema-banco-inter.sql

create table if not exists public.user_unit_access (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  empresa_id text not null,
  access_profile_id text,
  papel text,
  ativo boolean default true,
  is_default boolean default false,
  created_date timestamp default now(),
  updated_date timestamp default now(),
  unique (user_id, empresa_id)
);

create index if not exists idx_user_unit_access_user_id on public.user_unit_access(user_id);
create index if not exists idx_user_unit_access_empresa_id on public.user_unit_access(empresa_id);
create index if not exists idx_user_unit_access_default on public.user_unit_access(user_id, is_default);

insert into public.user_unit_access (user_id, empresa_id, access_profile_id, papel, ativo, is_default)
select
  u.id,
  u.empresa_id,
  u.access_profile_id,
  coalesce(u.company_role, 'company_user'),
  coalesce(u.active, true),
  true
from public.users u
where u.empresa_id is not null
on conflict (user_id, empresa_id) do update
set
  access_profile_id = excluded.access_profile_id,
  papel = excluded.papel,
  ativo = excluded.ativo;

alter table if exists public.appointment add column if not exists empresa_id text;
alter table if exists public.conta_receber add column if not exists empresa_id text;
alter table if exists public.despesa add column if not exists empresa_id text;
alter table if exists public.extratobancario add column if not exists empresa_id text;
alter table if exists public.plan_config add column if not exists empresa_id text;
alter table if exists public.serviceprovided add column if not exists empresa_id text;
alter table if exists public.serviceproviders add column if not exists empresa_id text;
alter table if exists public.receita add column if not exists empresa_id text;
alter table if exists public.integracao_config add column if not exists empresa_id text;
alter table if exists public.notificacao add column if not exists empresa_id text;
alter table if exists public."transaction" add column if not exists empresa_id text;
alter table if exists public.scheduledtransaction add column if not exists empresa_id text;
alter table if exists public.replacement add column if not exists empresa_id text;

create index if not exists idx_appointment_empresa_id on public.appointment(empresa_id);
create index if not exists idx_conta_receber_empresa_id on public.conta_receber(empresa_id);
create index if not exists idx_despesa_empresa_id on public.despesa(empresa_id);
create index if not exists idx_extratobancario_empresa_id on public.extratobancario(empresa_id);
create index if not exists idx_plan_config_empresa_id on public.plan_config(empresa_id);
create index if not exists idx_serviceprovided_empresa_id on public.serviceprovided(empresa_id);
create index if not exists idx_serviceproviders_empresa_id on public.serviceproviders(empresa_id);
create index if not exists idx_receita_empresa_id on public.receita(empresa_id);
create index if not exists idx_integracao_config_empresa_id on public.integracao_config(empresa_id);
create index if not exists idx_notificacao_empresa_id on public.notificacao(empresa_id);
create index if not exists idx_transaction_empresa_id on public."transaction"(empresa_id);
create index if not exists idx_scheduledtransaction_empresa_id on public.scheduledtransaction(empresa_id);
create index if not exists idx_replacement_empresa_id on public.replacement(empresa_id);

create or replace function public.app_current_user_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(auth.uid()::text, '');
$$;

create or replace function public.app_request_active_unit_id()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  headers json;
begin
  headers := coalesce(current_setting('request.headers', true), '{}')::json;
  return nullif(coalesce(headers ->> 'x-active-unit-id', headers ->> 'X-Active-Unit-Id', ''), '');
exception
  when others then
    return null;
end;
$$;

create or replace function public.app_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = public.app_current_user_id()
      and coalesce(u.active, true) = true
      and coalesce(u.is_platform_admin, false) = true
  );
$$;

create or replace function public.app_is_dog_city_unit(target_empresa_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.empresa e
    where e.id = target_empresa_id
      and (
        lower(coalesce(e.slug, '')) = 'dog-city'
        or lower(coalesce(e.codigo, '')) = 'dogcity'
        or lower(coalesce(e.nome_fantasia, '')) like '%dog city%'
      )
  );
$$;

create or replace function public.app_user_has_unit_access(target_empresa_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(target_empresa_id, '') <> ''
    and (
      public.app_is_platform_admin()
      or exists (
        select 1
        from public.users u
        where u.id = public.app_current_user_id()
          and coalesce(u.active, true) = true
          and u.empresa_id = target_empresa_id
      )
      or exists (
        select 1
        from public.user_unit_access a
        join public.users u on u.id = a.user_id
        where a.user_id = public.app_current_user_id()
          and a.empresa_id = target_empresa_id
          and coalesce(a.ativo, true) = true
          and coalesce(u.active, true) = true
      )
    );
$$;

create or replace function public.app_active_unit_matches(target_empresa_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(target_empresa_id, '') <> ''
    and target_empresa_id = coalesce(public.app_request_active_unit_id(), '')
    and public.app_user_has_unit_access(target_empresa_id);
$$;

alter table if exists public.empresa enable row level security;
alter table if exists public.user_unit_access enable row level security;
alter table if exists public.users enable row level security;
alter table if exists public.user_invite enable row level security;
alter table if exists public.perfil_acesso enable row level security;
alter table if exists public.app_config enable row level security;
alter table if exists public.app_asset enable row level security;
alter table if exists public.tabelaprecos enable row level security;
alter table if exists public.notificacao enable row level security;

drop policy if exists empresa_select on public.empresa;
create policy empresa_select on public.empresa
for select
using (
  public.app_is_platform_admin()
  or public.app_user_has_unit_access(id)
  or public.app_is_dog_city_unit(id)
);

drop policy if exists empresa_write on public.empresa;
create policy empresa_write on public.empresa
for all
using (public.app_is_platform_admin())
with check (public.app_is_platform_admin());

drop policy if exists perfil_acesso_select on public.perfil_acesso;
create policy perfil_acesso_select on public.perfil_acesso
for select
to authenticated
using (true);

drop policy if exists perfil_acesso_write on public.perfil_acesso;
create policy perfil_acesso_write on public.perfil_acesso
for all
to authenticated
using (public.app_is_platform_admin())
with check (public.app_is_platform_admin());

drop policy if exists user_unit_access_select on public.user_unit_access;
create policy user_unit_access_select on public.user_unit_access
for select
to authenticated
using (
  user_id = public.app_current_user_id()
  or public.app_is_platform_admin()
  or public.app_active_unit_matches(empresa_id)
);

drop policy if exists user_unit_access_write on public.user_unit_access;
create policy user_unit_access_write on public.user_unit_access
for all
to authenticated
using (public.app_is_platform_admin())
with check (public.app_is_platform_admin());

drop policy if exists users_select on public.users;
create policy users_select on public.users
for select
to authenticated
using (
  id = public.app_current_user_id()
  or (empresa_id is not null and public.app_active_unit_matches(empresa_id))
  or (empresa_id is null and public.app_is_platform_admin())
);

drop policy if exists users_update on public.users;
create policy users_update on public.users
for update
to authenticated
using (
  id = public.app_current_user_id()
  or (empresa_id is not null and public.app_active_unit_matches(empresa_id))
  or (empresa_id is null and public.app_is_platform_admin())
)
with check (
  id = public.app_current_user_id()
  or (empresa_id is not null and public.app_active_unit_matches(empresa_id))
  or (empresa_id is null and public.app_is_platform_admin())
);

drop policy if exists user_invite_select on public.user_invite;
create policy user_invite_select on public.user_invite
for select
to authenticated
using (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.app_is_platform_admin()
  or (empresa_id is not null and public.app_active_unit_matches(empresa_id))
);

drop policy if exists user_invite_write on public.user_invite;
create policy user_invite_write on public.user_invite
for all
to authenticated
using (
  public.app_is_platform_admin()
  or (empresa_id is not null and public.app_active_unit_matches(empresa_id))
)
with check (
  public.app_is_platform_admin()
  or (empresa_id is not null and public.app_active_unit_matches(empresa_id))
);

drop policy if exists app_config_select on public.app_config;
create policy app_config_select on public.app_config
for select
to authenticated
using (
  empresa_id is null
  or public.app_active_unit_matches(empresa_id)
  or public.app_is_dog_city_unit(empresa_id)
);

drop policy if exists app_config_public_branding on public.app_config;
create policy app_config_public_branding on public.app_config
for select
to anon
using (
  key = 'branding.company_name'
  and (
    empresa_id is null
    or public.app_is_dog_city_unit(empresa_id)
  )
);

drop policy if exists app_config_write on public.app_config;
create policy app_config_write on public.app_config
for all
to authenticated
using (
  (empresa_id is null and public.app_is_platform_admin())
  or public.app_active_unit_matches(empresa_id)
)
with check (
  (empresa_id is null and public.app_is_platform_admin())
  or public.app_active_unit_matches(empresa_id)
);

drop policy if exists app_asset_select on public.app_asset;
create policy app_asset_select on public.app_asset
for select
to authenticated
using (
  empresa_id is null
  or public.app_active_unit_matches(empresa_id)
  or public.app_is_dog_city_unit(empresa_id)
);

drop policy if exists app_asset_public_branding on public.app_asset;
create policy app_asset_public_branding on public.app_asset
for select
to anon
using (
  key in ('branding.logo.primary', 'branding.franchise.logo')
  and (
    empresa_id is null
    or public.app_is_dog_city_unit(empresa_id)
  )
);

drop policy if exists app_asset_write on public.app_asset;
create policy app_asset_write on public.app_asset
for all
to authenticated
using (
  (empresa_id is null and public.app_is_platform_admin())
  or public.app_active_unit_matches(empresa_id)
)
with check (
  (empresa_id is null and public.app_is_platform_admin())
  or public.app_active_unit_matches(empresa_id)
);

drop policy if exists tabelaprecos_select on public.tabelaprecos;
create policy tabelaprecos_select on public.tabelaprecos
for select
to authenticated
using (
  empresa_id is null
  or public.app_active_unit_matches(empresa_id)
);

drop policy if exists tabelaprecos_write on public.tabelaprecos;
create policy tabelaprecos_write on public.tabelaprecos
for all
to authenticated
using (
  (empresa_id is null and public.app_is_platform_admin())
  or public.app_active_unit_matches(empresa_id)
)
with check (
  (empresa_id is null and public.app_is_platform_admin())
  or public.app_active_unit_matches(empresa_id)
);

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'dogs','carteira','responsavel','orcamento','appointment','conta_receber','despesa',
    'lancamento','extratobancario','plan_config','checkins','serviceprovided',
    'serviceproviders','serviceprovider_schedule','receita','pedidointerno','integracao_config',
    'integracao_sync_log','extrato_duplicidade',
    'transaction','scheduledtransaction','replacement',
    'recurring_packages','package_sessions','package_credits','package_billings','audit_logs'
  ]
  loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = tbl
    ) then
      execute format('alter table public.%I enable row level security', tbl);
      execute format('drop policy if exists %I on public.%I', tbl || '_unit_policy', tbl);
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.app_active_unit_matches(empresa_id)) with check (public.app_active_unit_matches(empresa_id))',
        tbl || '_unit_policy',
        tbl
      );
    end if;
  end loop;
end $$;

drop policy if exists notificacao_select on public.notificacao;
create policy notificacao_select on public.notificacao
for select
to authenticated
using (
  user_id = public.app_current_user_id()
  or public.app_active_unit_matches(empresa_id)
);

drop policy if exists notificacao_write on public.notificacao;
create policy notificacao_write on public.notificacao
for all
to authenticated
using (
  user_id = public.app_current_user_id()
  or public.app_active_unit_matches(empresa_id)
)
with check (
  user_id = public.app_current_user_id()
  or public.app_active_unit_matches(empresa_id)
);
