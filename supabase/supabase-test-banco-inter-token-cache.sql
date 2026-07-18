begin;

do $$
declare
  v_integration_id text;
  v_claimed boolean;
begin
  if not exists (
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'banco_inter_token_cache'
      and relation.relrowsecurity is true
  ) then
    raise exception 'banco_inter_token_cache precisa existir com RLS habilitada';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'banco_inter_token_cache'
      and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'anon/authenticated nao podem acessar banco_inter_token_cache';
  end if;

  select id
  into v_integration_id
  from public.integracao_config
  where provider = 'banco_inter'
  order by id
  limit 1;

  if v_integration_id is null then
    raise exception 'integracao Banco Inter necessaria para o smoke do cache';
  end if;

  v_claimed := public.finance_claim_banco_inter_token_refresh(
    v_integration_id,
    '__cache_contract_test__',
    repeat('a', 64),
    'sql-test-owner',
    10
  );

  if v_claimed is not true then
    raise exception 'primeira instancia deveria adquirir o lease de renovacao';
  end if;

  if public.finance_claim_banco_inter_token_refresh(
    v_integration_id,
    '__cache_contract_test__',
    repeat('a', 64),
    'sql-test-competitor',
    10
  ) is true then
    raise exception 'segunda instancia nao pode adquirir lease concorrente';
  end if;
end;
$$;

rollback;
