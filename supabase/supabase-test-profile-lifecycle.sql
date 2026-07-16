begin;

insert into public.responsavel (
  id,
  empresa_id,
  nome_completo,
  cpf,
  celular,
  ativo,
  created_date,
  updated_date
) values (
  'qa_profile_responsavel_1',
  'empresa_demo',
  'QA Perfil Responsavel',
  '529.982.247-25',
  '(11) 90000-0001',
  true,
  now(),
  now()
);

do $$
declare
  duplicate_blocked boolean := false;
begin
  begin
    insert into public.responsavel (
      id, empresa_id, nome_completo, cpf, celular, ativo, created_date, updated_date
    ) values (
      'qa_profile_responsavel_2', 'empresa_demo', 'QA Perfil Duplicado',
      '52998224725', '(11) 90000-0002', true, now(), now()
    );
  exception when sqlstate 'P0001' then
    duplicate_blocked := true;
  end;

  if not duplicate_blocked then
    raise exception 'CPF duplicado de Responsavel nao foi bloqueado.' using errcode = 'P0002';
  end if;
end;
$$;

-- O mesmo CPF pode existir uma vez em cada categoria.
insert into public.carteira (
  id,
  empresa_id,
  nome_razao_social,
  cpf_cnpj,
  celular,
  ativo,
  created_date,
  updated_date
) values (
  'qa_profile_carteira_1',
  'empresa_demo',
  'QA Perfil Financeiro',
  '52998224725',
  '(11) 90000-0003',
  true,
  now(),
  now()
);

do $$
declare
  duplicate_blocked boolean := false;
begin
  begin
    insert into public.carteira (
      id, empresa_id, nome_razao_social, cpf_cnpj, celular, ativo, created_date, updated_date
    ) values (
      'qa_profile_carteira_2', 'empresa_demo', 'QA Financeiro Duplicado',
      '529.982.247-25', '(11) 90000-0004', true, now(), now()
    );
  exception when sqlstate 'P0001' then
    duplicate_blocked := true;
  end;

  if not duplicate_blocked then
    raise exception 'CPF duplicado de Responsavel Financeiro nao foi bloqueado.' using errcode = 'P0002';
  end if;
end;
$$;

update public.responsavel
set
  ativo = false,
  deleted_at = now(),
  deletion_expires_at = now() + interval '30 days',
  updated_date = now()
where id = 'qa_profile_responsavel_1';

do $$
declare
  duplicate_blocked boolean := false;
begin
  begin
    insert into public.responsavel (
      id, empresa_id, nome_completo, cpf, celular, ativo, created_date, updated_date
    ) values (
      'qa_profile_responsavel_3', 'empresa_demo', 'QA Durante Recuperacao',
      '52998224725', '(11) 90000-0005', true, now(), now()
    );
  exception when sqlstate 'P0001' then
    duplicate_blocked := true;
  end;

  if not duplicate_blocked then
    raise exception 'CPF de perfil ainda restauravel nao foi reservado.' using errcode = 'P0002';
  end if;
end;
$$;

update public.responsavel
set
  ativo = true,
  deleted_at = null,
  deletion_expires_at = null,
  deleted_by = null,
  updated_date = now()
where id = 'qa_profile_responsavel_1';

do $$
begin
  if not exists (
    select 1
    from public.responsavel
    where id = 'qa_profile_responsavel_1'
      and deleted_at is null
      and deletion_expires_at is null
      and ativo is true
  ) then
    raise exception 'Restauracao do perfil nao preservou o contrato esperado.' using errcode = 'P0002';
  end if;
end;
$$;

update public.responsavel
set
  ativo = false,
  deleted_at = now() - interval '31 days',
  deletion_expires_at = now() - interval '1 day',
  updated_date = now()
where id = 'qa_profile_responsavel_1';

do $$
declare
  restore_blocked boolean := false;
begin
  begin
    update public.responsavel
    set
      ativo = true,
      deleted_at = null,
      deletion_expires_at = null,
      deleted_by = null,
      updated_date = now()
    where id = 'qa_profile_responsavel_1';
  exception when sqlstate 'P0001' then
    restore_blocked := true;
  end;

  if not restore_blocked then
    raise exception 'Restauracao depois de 30 dias nao foi bloqueada.' using errcode = 'P0002';
  end if;
end;
$$;

rollback;
