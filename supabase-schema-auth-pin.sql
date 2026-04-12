-- PIN obrigatorio para acesso e atualizacao forcada de usuarios existentes
-- Execute apos:
-- 1. supabase-schema.sql
-- 2. supabase-schema-admin-multiempresa.sql
-- 3. supabase-schema-user-invite-onboarding.sql
-- 4. supabase-schema-unit-isolation.sql

alter table if exists public.users
  add column if not exists pin_required_reset boolean default true,
  add column if not exists pin_bootstrap_status text default 'pendente',
  add column if not exists pin_updated_at timestamp,
  add column if not exists pin_last_verified_at timestamp;

create index if not exists idx_users_pin_required_reset on public.users(pin_required_reset);
create index if not exists idx_users_pin_bootstrap_status on public.users(pin_bootstrap_status);

update public.users
set
  pin_required_reset = coalesce(pin_required_reset, true),
  pin_bootstrap_status = case
    when coalesce(email, '') = '' then coalesce(nullif(pin_bootstrap_status, ''), 'indisponivel')
    else coalesce(nullif(pin_bootstrap_status, ''), 'pendente')
  end
where true;

create or replace function public.app_user_has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.app_is_platform_admin()
    or exists (
      select 1
      from public.users u
      join public.perfil_acesso p on p.id = u.access_profile_id
      join lateral jsonb_array_elements_text(coalesce(p.permissoes, '[]'::jsonb)) perm(value) on true
      where u.id = public.app_current_user_id()
        and coalesce(u.active, true) = true
        and perm.value in (
          required_permission,
          split_part(required_permission, ':', 1) || ':*',
          'platform:*'
        )
    );
$$;

create or replace function public.app_can_manage_users_in_unit(target_empresa_id text)
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
      or (
        public.app_user_has_permission('usuarios:update')
        and public.app_user_has_unit_access(target_empresa_id)
      )
    );
$$;

drop policy if exists user_unit_access_select on public.user_unit_access;
create policy user_unit_access_select on public.user_unit_access
for select
to authenticated
using (
  user_id = public.app_current_user_id()
  or public.app_is_platform_admin()
  or public.app_can_manage_users_in_unit(empresa_id)
);

drop policy if exists user_unit_access_write on public.user_unit_access;
create policy user_unit_access_write on public.user_unit_access
for all
to authenticated
using (
  public.app_is_platform_admin()
  or public.app_can_manage_users_in_unit(empresa_id)
)
with check (
  public.app_is_platform_admin()
  or public.app_can_manage_users_in_unit(empresa_id)
);

drop policy if exists users_select on public.users;
create policy users_select on public.users
for select
to authenticated
using (
  id = public.app_current_user_id()
  or (empresa_id is not null and public.app_user_has_unit_access(empresa_id))
  or (empresa_id is null and public.app_is_platform_admin())
);

drop policy if exists users_update on public.users;
create policy users_update on public.users
for update
to authenticated
using (
  id = public.app_current_user_id()
  or (empresa_id is not null and public.app_can_manage_users_in_unit(empresa_id))
  or (empresa_id is null and public.app_is_platform_admin())
)
with check (
  id = public.app_current_user_id()
  or (empresa_id is not null and public.app_can_manage_users_in_unit(empresa_id))
  or (empresa_id is null and public.app_is_platform_admin())
);

drop policy if exists user_invite_select on public.user_invite;
create policy user_invite_select on public.user_invite
for select
to authenticated
using (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.app_is_platform_admin()
  or (empresa_id is not null and public.app_user_has_unit_access(empresa_id))
);

drop policy if exists user_invite_write on public.user_invite;
create policy user_invite_write on public.user_invite
for all
to authenticated
using (
  public.app_is_platform_admin()
  or (empresa_id is not null and public.app_can_manage_users_in_unit(empresa_id))
)
with check (
  public.app_is_platform_admin()
  or (empresa_id is not null and public.app_can_manage_users_in_unit(empresa_id))
);
