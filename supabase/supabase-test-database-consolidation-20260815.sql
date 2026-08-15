begin;

do $$
declare
  missing_indexes integer;
  wallet_count bigint;
  compatibility_count bigint;
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'carteira'
      and table_type = 'BASE TABLE'
  ) then
    raise exception 'public.carteira deve ser a tabela canonica.';
  end if;

  if not exists (
    select 1
    from information_schema.views
    where table_schema = 'public'
      and table_name = 'carteira_conta'
  ) then
    raise exception 'A view de compatibilidade carteira_conta nao existe.';
  end if;

  select count(*) into wallet_count from public.carteira;
  select count(*) into compatibility_count from public.carteira_conta;
  if wallet_count <> compatibility_count then
    raise exception 'Divergencia entre carteira (%) e compatibilidade (%).', wallet_count, compatibility_count;
  end if;

  if exists (
    select 1
    from public.carteira_conta cc
    where cc.id <> cc.carteira_id
  ) then
    raise exception 'A chave da conta deve ser a propria chave da carteira.';
  end if;

  if exists (
    select 1
    from (values
      ('extrato_bancario', 'extratobancario'),
      ('tabela_preco', 'tabelaprecos'),
      ('pedido_interno', 'pedidointerno'),
      ('servico_prestado', 'serviceprovided'),
      ('prestador_servico', 'serviceproviders'),
      ('prestador_servico_agenda', 'serviceprovider_schedule')
    ) expected(canonical_name, compatibility_name)
    where not exists (
      select 1
      from information_schema.tables t
      where t.table_schema = 'public'
        and t.table_name = expected.canonical_name
        and t.table_type = 'BASE TABLE'
    )
    or not exists (
      select 1
      from information_schema.views v
      where v.table_schema = 'public'
        and v.table_name = expected.compatibility_name
    )
  ) then
    raise exception 'Renomes canonicos ou views de compatibilidade incompletos.';
  end if;

  select count(*)
    into missing_indexes
  from pg_constraint con
  join pg_class source_table on source_table.oid = con.conrelid
  join pg_namespace source_schema on source_schema.oid = source_table.relnamespace
  where con.contype = 'f'
    and source_schema.nspname = 'public'
    and not exists (
      select 1
      from pg_index existing_index
      where existing_index.indrelid = con.conrelid
        and existing_index.indisvalid
        and existing_index.indisready
        and (existing_index.indkey::smallint[])[0:cardinality(con.conkey)-1] = con.conkey
    );

  if missing_indexes <> 0 then
    raise exception 'Ainda existem % FKs sem indice.', missing_indexes;
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'app_purge_integration_sync_logs'
  ) then
    raise exception 'Rotina de retencao de logs nao instalada.';
  end if;

  if exists (
    select 1
    from public.recurring_packages rp
    where nullif(rp.metadata ->> 'plan_config_id', '') is not null
      and rp.plan_config_id is distinct from nullif(rp.metadata ->> 'plan_config_id', '')
  ) then
    raise exception 'Pacote recorrente ainda depende de vinculo divergente em metadata.';
  end if;

  if exists (
    select 1
    from public.recurring_packages rp
    left join public.plan_config pc on pc.id = rp.plan_config_id
    where rp.plan_config_id is not null
      and pc.id is null
  ) then
    raise exception 'Pacote recorrente com plan_config_id orfao.';
  end if;
end;
$$;

select *
from public.finance_backfill_carteira_conta();

select
  count(*) as carteiras,
  sum(saldo_atual) as saldo_total
from public.carteira_conta;

rollback;
