-- Torna perfil, nivel administrativo e acesso por unidade coerentes entre si.
-- A flag booleana is_platform_admin e a unica fonte de privilegio central.

begin;

-- Administradores centrais nao precisam de vinculos ativos por unidade.
update public.user_unit_access access_row
set
  ativo = false,
  is_default = false,
  papel = 'platform_admin',
  updated_date = now()
where exists (
  select 1
  from public.users app_user
  join public.perfil_acesso access_profile on access_profile.id = app_user.access_profile_id
  where app_user.id = access_row.user_id
    and coalesce(app_user.is_platform_admin, false) = true
    and coalesce(access_profile.escopo, 'empresa') = 'plataforma'
);

update public.users app_user
set
  empresa_id = null,
  company_role = 'platform_admin',
  updated_date = now()
from public.perfil_acesso access_profile
where access_profile.id = app_user.access_profile_id
  and coalesce(app_user.is_platform_admin, false) = true
  and coalesce(access_profile.escopo, 'empresa') = 'plataforma';

-- Reverte elevacoes acidentais quando o perfil escolhido e de unidade.
with invalid_platform_users as (
  select app_user.id, app_user.access_profile_id
  from public.users app_user
  join public.perfil_acesso access_profile on access_profile.id = app_user.access_profile_id
  where coalesce(app_user.is_platform_admin, false) = true
    and coalesce(access_profile.escopo, 'empresa') <> 'plataforma'
)
update public.user_unit_access access_row
set
  ativo = true,
  papel = 'company_user',
  is_default = access_row.id = (
    select preferred_access.id
    from public.user_unit_access preferred_access
    where preferred_access.user_id = access_row.user_id
    order by
      (preferred_access.empresa_id = 'empresa_demo') desc,
      preferred_access.created_date asc nulls last,
      preferred_access.id
    limit 1
  ),
  updated_date = now()
from invalid_platform_users invalid_user
where invalid_user.id = access_row.user_id
  and access_row.access_profile_id = invalid_user.access_profile_id;

update public.users app_user
set
  empresa_id = coalesce(
    (
      select access_row.empresa_id
      from public.user_unit_access access_row
      where access_row.user_id = app_user.id
        and coalesce(access_row.ativo, true) = true
      order by access_row.is_default desc, access_row.created_date asc nulls last, access_row.id
      limit 1
    ),
    app_user.empresa_id
  ),
  company_role = 'company_user',
  is_platform_admin = false,
  updated_date = now()
from public.perfil_acesso access_profile
where access_profile.id = app_user.access_profile_id
  and coalesce(app_user.is_platform_admin, false) = true
  and coalesce(access_profile.escopo, 'empresa') <> 'plataforma';

-- Remove qualquer marcador textual central que nao tenha a flag administrativa.
update public.users
set
  company_role = 'company_user',
  updated_date = now()
where coalesce(is_platform_admin, false) = false
  and company_role = 'platform_admin';

create or replace function public.guard_users_access_profile_consistency()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_scope text;
  v_profile_active boolean;
begin
  if new.access_profile_id is not null then
    select coalesce(access_profile.escopo, 'empresa'), coalesce(access_profile.ativo, true)
      into v_profile_scope, v_profile_active
    from public.perfil_acesso access_profile
    where access_profile.id = new.access_profile_id;

    if not found then
      raise exception 'Perfil de acesso nao encontrado.' using errcode = '23503';
    end if;

    if not v_profile_active then
      raise exception 'O perfil de acesso selecionado esta inativo.' using errcode = '23514';
    end if;
  else
    v_profile_scope := null;
  end if;

  if coalesce(new.is_platform_admin, false) then
    if new.access_profile_id is null or v_profile_scope <> 'plataforma' then
      raise exception 'Administradores do sistema exigem perfil de escopo central.' using errcode = '23514';
    end if;

    new.company_role := 'platform_admin';
    new.empresa_id := null;
  else
    if v_profile_scope = 'plataforma' then
      raise exception 'Perfis de escopo central exigem nivel administrativo central.' using errcode = '23514';
    end if;

    if new.company_role = 'platform_admin' or (coalesce(new.active, true) and new.company_role is null) then
      new.company_role := 'company_user';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists users_guard_access_profile_consistency on public.users;
create trigger users_guard_access_profile_consistency
before insert or update on public.users
for each row
execute function public.guard_users_access_profile_consistency();

create or replace function public.guard_user_unit_access_profile_consistency()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_is_platform_admin boolean;
  v_profile_scope text;
  v_profile_active boolean;
begin
  if coalesce(new.ativo, true) = false then
    return new;
  end if;

  select coalesce(app_user.is_platform_admin, false)
    into v_user_is_platform_admin
  from public.users app_user
  where app_user.id = new.user_id;

  if not found then
    raise exception 'Usuario do vinculo de acesso nao encontrado.' using errcode = '23503';
  end if;

  if v_user_is_platform_admin then
    raise exception 'Administradores centrais nao usam vinculos ativos por unidade.' using errcode = '23514';
  end if;

  if new.access_profile_id is null then
    raise exception 'Vinculos ativos por unidade exigem perfil de acesso.' using errcode = '23514';
  end if;

  select coalesce(access_profile.escopo, 'empresa'), coalesce(access_profile.ativo, true)
    into v_profile_scope, v_profile_active
  from public.perfil_acesso access_profile
  where access_profile.id = new.access_profile_id;

  if not found then
    raise exception 'Perfil do vinculo de acesso nao encontrado.' using errcode = '23503';
  end if;

  if not v_profile_active or v_profile_scope <> 'empresa' then
    raise exception 'Vinculos ativos por unidade exigem perfil ativo de escopo empresa.' using errcode = '23514';
  end if;

  new.papel := 'company_user';
  return new;
end;
$$;

drop trigger if exists user_unit_access_guard_profile_consistency on public.user_unit_access;
create trigger user_unit_access_guard_profile_consistency
before insert or update on public.user_unit_access
for each row
execute function public.guard_user_unit_access_profile_consistency();

create or replace function public.guard_access_profile_scope_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.escopo is not distinct from old.escopo then
    return new;
  end if;

  if exists (
    select 1
    from public.users app_user
    where app_user.access_profile_id = old.id
      and (
        (coalesce(app_user.is_platform_admin, false) and new.escopo <> 'plataforma')
        or (not coalesce(app_user.is_platform_admin, false) and new.escopo = 'plataforma')
      )
  ) then
    raise exception 'O escopo nao pode ser alterado enquanto houver usuarios vinculados.' using errcode = '23514';
  end if;

  if new.escopo <> 'empresa' and exists (
    select 1
    from public.user_unit_access access_row
    where access_row.access_profile_id = old.id
      and coalesce(access_row.ativo, true) = true
  ) then
    raise exception 'O escopo nao pode ser alterado enquanto houver unidades vinculadas.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists perfil_acesso_guard_scope_change on public.perfil_acesso;
create trigger perfil_acesso_guard_scope_change
before update of escopo on public.perfil_acesso
for each row
execute function public.guard_access_profile_scope_change();

-- A permissao efetiva passa a considerar primeiro o perfil da unidade ativa.
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
      from public.users app_user
      left join lateral (
        select access_row.access_profile_id
        from public.user_unit_access access_row
        where access_row.user_id = app_user.id
          and access_row.empresa_id = public.app_request_active_unit_id()
          and coalesce(access_row.ativo, true) = true
        order by access_row.is_default desc, access_row.created_date asc nulls last, access_row.id
        limit 1
      ) unit_access on true
      join public.perfil_acesso access_profile
        on access_profile.id = coalesce(unit_access.access_profile_id, app_user.access_profile_id)
      join lateral jsonb_array_elements_text(coalesce(access_profile.permissoes, '[]'::jsonb)) permission(value) on true
      where app_user.id = public.app_current_user_id()
        and coalesce(app_user.active, true) = true
        and coalesce(access_profile.ativo, true) = true
        and coalesce(access_profile.escopo, 'empresa') = 'empresa'
        and (
          public.app_request_active_unit_id() is null
          or public.app_user_has_unit_access(public.app_request_active_unit_id())
        )
        and permission.value in (
          required_permission,
          split_part(required_permission, ':', 1) || ':*',
          'platform:*'
        )
    );
$$;

do $$
begin
  if exists (
    select 1
    from public.users app_user
    left join public.perfil_acesso access_profile on access_profile.id = app_user.access_profile_id
    where
      (coalesce(app_user.is_platform_admin, false) and (
        access_profile.id is null
        or coalesce(access_profile.escopo, 'empresa') <> 'plataforma'
        or app_user.company_role <> 'platform_admin'
        or app_user.empresa_id is not null
      ))
      or (not coalesce(app_user.is_platform_admin, false) and (
        coalesce(access_profile.escopo, 'empresa') = 'plataforma'
        or app_user.company_role = 'platform_admin'
      ))
  ) then
    raise exception 'Ainda existem usuarios com combinacao de acesso inconsistente.';
  end if;

  if exists (
    select 1
    from public.user_unit_access access_row
    join public.users app_user on app_user.id = access_row.user_id
    left join public.perfil_acesso access_profile on access_profile.id = access_row.access_profile_id
    where coalesce(access_row.ativo, true) = true
      and (
        coalesce(app_user.is_platform_admin, false)
        or access_profile.id is null
        or coalesce(access_profile.ativo, true) = false
        or coalesce(access_profile.escopo, 'empresa') <> 'empresa'
      )
  ) then
    raise exception 'Ainda existem vinculos ativos por unidade inconsistentes.';
  end if;
end;
$$;

comment on function public.guard_users_access_profile_consistency() is
  'Impede combinacoes incompativeis entre perfil, unidade e privilegio central.';

comment on function public.guard_user_unit_access_profile_consistency() is
  'Exige perfil ativo de empresa nos vinculos ativos por unidade.';

commit;
