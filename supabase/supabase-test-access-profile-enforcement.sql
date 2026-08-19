begin;

do $$
declare
  v_operational_user_id text := 'c533a2bb-bed2-4fe1-8e46-54bafd76e98e';
  v_platform_user_id text := '5f15078e-9220-417c-9232-dd0fec5a4b7a';
  v_platform_profile_id text := 'c3fee01c-b044-4389-a4b9-eae1ee49eab6';
  v_rejected boolean := false;
  v_role text;
begin
  begin
    update public.users
    set is_platform_admin = true
    where id = v_operational_user_id;
  exception
    when check_violation then
      v_rejected := true;
  end;

  if not v_rejected then
    raise exception 'Perfil de empresa aceitou elevacao administrativa indevida.';
  end if;

  update public.users
  set company_role = 'platform_admin'
  where id = v_operational_user_id;

  select company_role into v_role
  from public.users
  where id = v_operational_user_id;

  if v_role <> 'company_user' then
    raise exception 'Marcador textual legado concedeu papel administrativo.';
  end if;

  v_rejected := false;
  begin
    update public.user_unit_access
    set access_profile_id = v_platform_profile_id
    where user_id = v_operational_user_id
      and empresa_id = 'empresa_demo';
  exception
    when check_violation then
      v_rejected := true;
  end;

  if not v_rejected then
    raise exception 'Vinculo de unidade aceitou perfil de escopo central.';
  end if;

  perform set_config('request.jwt.claim.sub', v_operational_user_id, true);
  perform set_config('request.headers', '{"x-active-unit-id":"empresa_demo"}', true);

  if not public.app_user_has_permission('agenda:read') then
    raise exception 'Perfil Operacional perdeu permissao de agenda.';
  end if;

  if public.app_user_has_permission('financeiro:read') then
    raise exception 'Perfil Operacional recebeu permissao financeira indevida.';
  end if;

  perform set_config('request.jwt.claim.sub', v_platform_user_id, true);
  perform set_config('request.headers', '{}', true);

  if not public.app_user_has_permission('financeiro:update') then
    raise exception 'Administrador central perdeu acesso transversal.';
  end if;
end;
$$;

rollback;

select 'Access profile enforcement: ok' as resultado;
