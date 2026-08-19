-- Impede autoalteracao de perfil, privilegios e vinculos de acesso.
-- Dados pessoais do proprio usuario continuam editaveis conforme as policies existentes.

create or replace function public.guard_users_self_access_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id text := auth.uid()::text;
  v_request_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if v_actor_id is null or v_request_role = 'service_role' then
    return new;
  end if;

  if old.id = v_actor_id and (
    new.id is distinct from old.id
    or new.profile is distinct from old.profile
    or new.empresa_id is distinct from old.empresa_id
    or new.access_profile_id is distinct from old.access_profile_id
    or new.company_role is distinct from old.company_role
    or new.is_platform_admin is distinct from old.is_platform_admin
    or new.active is distinct from old.active
    or new.pin_required_reset is distinct from old.pin_required_reset
    or new.pin_bootstrap_status is distinct from old.pin_bootstrap_status
    or new.pin_updated_at is distinct from old.pin_updated_at
    or new.pin_last_verified_at is distinct from old.pin_last_verified_at
  ) then
    raise exception 'Nao e permitido alterar o proprio perfil de acesso.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists users_guard_self_access_change on public.users;
create trigger users_guard_self_access_change
before update on public.users
for each row
execute function public.guard_users_self_access_change();

create or replace function public.guard_user_unit_access_self_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id text := auth.uid()::text;
  v_request_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_target_user_id text := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  if v_actor_id is null or v_request_role = 'service_role' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if v_target_user_id = v_actor_id
    or (tg_op = 'UPDATE' and old.user_id = v_actor_id) then
    raise exception 'Nao e permitido alterar os proprios vinculos de acesso.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists user_unit_access_guard_self_change on public.user_unit_access;
create trigger user_unit_access_guard_self_change
before insert or update or delete on public.user_unit_access
for each row
execute function public.guard_user_unit_access_self_change();

comment on function public.guard_users_self_access_change() is
  'Bloqueia alteracao direta dos proprios campos de perfil e privilegio.';

comment on function public.guard_user_unit_access_self_change() is
  'Bloqueia alteracao direta dos proprios vinculos de acesso por unidade.';
