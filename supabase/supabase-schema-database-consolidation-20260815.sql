-- Consolidacao estrutural e manutencao do schema publico.
-- Mantem contratos legados por views enquanto elimina duplicacao fisica.

begin;

lock table public.carteira in share row exclusive mode;
lock table public.carteira_conta in share row exclusive mode;

do $$
declare
  v_profiles bigint;
  v_accounts bigint;
  v_orphans bigint;
  v_duplicates bigint;
begin
  select count(*) into v_profiles from public.carteira;
  select count(*) into v_accounts from public.carteira_conta;

  select count(*)
    into v_orphans
  from public.carteira_conta cc
  left join public.carteira c on c.id = cc.carteira_id
  where c.id is null;

  select count(*)
    into v_duplicates
  from (
    select cc.carteira_id
    from public.carteira_conta cc
    group by cc.carteira_id
    having count(*) <> 1
  ) duplicated;

  if v_orphans > 0 or v_duplicates > 0 or v_profiles <> v_accounts then
    raise exception
      'Consolidacao de carteira bloqueada: profiles=%, accounts=%, orphans=%, duplicates=%.',
      v_profiles,
      v_accounts,
      v_orphans,
      v_duplicates;
  end if;
end;
$$;

create temporary table app_wallet_account_map on commit drop as
select
  cc.id as old_account_id,
  cc.carteira_id as wallet_id
from public.carteira_conta cc;

create unique index on app_wallet_account_map(old_account_id);
create unique index on app_wallet_account_map(wallet_id);

create temporary table app_wallet_fk_contract on commit drop as
select
  source_table.relname as source_table,
  con.conname as constraint_name,
  pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class source_table on source_table.oid = con.conrelid
join pg_namespace source_schema on source_schema.oid = source_table.relnamespace
where con.contype = 'f'
  and source_schema.nspname = 'public'
  and con.confrelid = 'public.carteira_conta'::regclass;

alter table public.carteira
  add column if not exists saldo_atual numeric(14,2) not null default 0,
  add column if not exists saldo_negativo_autorizado boolean not null default false,
  add column if not exists lock_version integer not null default 0,
  add column if not exists ultima_reconciliacao_em timestamptz,
  add column if not exists ultimo_movimento_em timestamptz,
  add column if not exists observacoes_financeiras text;

update public.carteira c
set
  empresa_id = coalesce(c.empresa_id, cc.empresa_id),
  ativo = coalesce(cc.ativo, c.ativo, true),
  saldo_atual = cc.saldo_atual,
  saldo_negativo_autorizado = cc.saldo_negativo_autorizado,
  lock_version = cc.lock_version,
  ultima_reconciliacao_em = cc.ultima_reconciliacao_em,
  ultimo_movimento_em = cc.ultimo_movimento_em,
  observacoes_financeiras = cc.observacoes_financeiras,
  updated_date = now()
from public.carteira_conta cc
where cc.carteira_id = c.id;

drop trigger if exists trg_carteira_sync_wallet_account on public.carteira;
drop trigger if exists trg_carteira_conta_before_update on public.carteira_conta;

do $$
declare
  fk record;
begin
  for fk in
    select source_table, constraint_name
    from app_wallet_fk_contract
  loop
    execute format(
      'alter table public.%I drop constraint %I',
      fk.source_table,
      fk.constraint_name
    );
  end loop;
end;
$$;

do $$
declare
  target record;
begin
  for target in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'carteira_conta_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name <> 'carteira_conta'
    order by c.table_name
  loop
    execute format(
      'lock table public.%I in access exclusive mode',
      target.table_name
    );
    execute format(
      'alter table public.%I disable trigger user',
      target.table_name
    );
    execute format(
      'update public.%I source
          set carteira_conta_id = mapping.wallet_id
         from app_wallet_account_map mapping
        where source.carteira_conta_id = mapping.old_account_id',
      target.table_name
    );
    execute format(
      'alter table public.%I enable trigger user',
      target.table_name
    );
  end loop;
end;
$$;

alter table public.carteira_conta
  drop constraint if exists carteira_conta_carteira_id_fkey;

drop table public.carteira_conta;

do $$
declare
  fk record;
  canonical_definition text;
begin
  for fk in
    select source_table, constraint_name, definition
    from app_wallet_fk_contract
    order by source_table, constraint_name
  loop
    canonical_definition := regexp_replace(
      fk.definition,
      'REFERENCES (public\.)?carteira_conta\s*\(id\)',
      'REFERENCES public.carteira(id)',
      'i'
    );

    execute format(
      'alter table public.%I add constraint %I %s',
      fk.source_table,
      fk.constraint_name,
      canonical_definition
    );
  end loop;
end;
$$;

create or replace view public.carteira_conta
with (security_invoker = true)
as
select
  c.id,
  c.empresa_id,
  c.id as carteira_id,
  c.saldo_atual,
  c.saldo_negativo_autorizado,
  c.ativo,
  c.lock_version,
  c.ultima_reconciliacao_em,
  c.ultimo_movimento_em,
  c.observacoes_financeiras,
  c.created_date,
  c.updated_date
from public.carteira c;

grant select, insert, update, delete on public.carteira_conta to anon, authenticated, service_role;

drop function if exists public.finance_sync_wallet_account_for_profile();

create or replace function public.finance_backfill_carteira_conta()
returns table(
  out_carteira_id text,
  out_carteira_conta_id text,
  out_empresa_id text,
  created_account boolean
)
language sql
stable
set search_path = public
as $$
  select
    c.id,
    c.id,
    c.empresa_id,
    false
  from public.carteira c
  order by c.created_date asc nulls last, c.id asc;
$$;

drop trigger if exists trg_carteira_financial_before_update on public.carteira;
create trigger trg_carteira_financial_before_update
before update of
  saldo_atual,
  saldo_negativo_autorizado,
  ativo,
  ultima_reconciliacao_em,
  ultimo_movimento_em,
  observacoes_financeiras
on public.carteira
for each row
execute function public.finance_before_update_carteira_conta();

comment on table public.carteira is
  'Responsavel financeiro e sua conta operacional em uma unica entidade. O id e a chave oficial do extrato.';
comment on view public.carteira_conta is
  'Compatibilidade temporaria para consumidores legados. A fonte oficial e public.carteira.';
comment on function public.finance_backfill_carteira_conta() is
  'Contrato legado idempotente. Carteiras ja incluem sua conta operacional e nao exigem backfill.';

-- Padroniza nomes fisicos malformados ou sem separacao snake_case.
do $$
begin
  if to_regclass('public.extrato_bancario') is null then
    alter table public.extratobancario rename to extrato_bancario;
  end if;
  if to_regclass('public.tabela_preco') is null then
    alter table public.tabelaprecos rename to tabela_preco;
  end if;
  if to_regclass('public.pedido_interno') is null then
    alter table public.pedidointerno rename to pedido_interno;
  end if;
  if to_regclass('public.servico_prestado') is null then
    alter table public.serviceprovided rename to servico_prestado;
  end if;
  if to_regclass('public.prestador_servico') is null then
    alter table public.serviceproviders rename to prestador_servico;
  end if;
  if to_regclass('public.prestador_servico_agenda') is null then
    alter table public.serviceprovider_schedule rename to prestador_servico_agenda;
  end if;
end;
$$;

create or replace view public.extratobancario
with (security_invoker = true)
as select * from public.extrato_bancario;

create or replace view public.tabelaprecos
with (security_invoker = true)
as select * from public.tabela_preco;

create or replace view public.pedidointerno
with (security_invoker = true)
as select * from public.pedido_interno;

create or replace view public.serviceprovided
with (security_invoker = true)
as select * from public.servico_prestado;

create or replace view public.serviceproviders
with (security_invoker = true)
as select * from public.prestador_servico;

create or replace view public.serviceprovider_schedule
with (security_invoker = true)
as select * from public.prestador_servico_agenda;

grant select, insert, update, delete on
  public.extratobancario,
  public.tabelaprecos,
  public.pedidointerno,
  public.serviceprovided,
  public.serviceproviders,
  public.serviceprovider_schedule
to anon, authenticated, service_role;

comment on table public.extrato_bancario is 'Transacoes reais importadas das instituicoes bancarias.';
comment on table public.tabela_preco is 'Tabela de precos e descontos dos servicos.';
comment on table public.pedido_interno is 'Pedidos operacionais internos da empresa.';
comment on table public.servico_prestado is 'Historico de servicos efetivamente prestados.';
comment on table public.prestador_servico is 'Cadastro de prestadores e monitores.';
comment on table public.prestador_servico_agenda is 'Disponibilidade e escala dos prestadores.';

-- Remove indices equivalentes criados em fases distintas.
drop index if exists public.idx_centro_custo_empresa_nome;
drop index if exists public.idx_empresa_codigo;
drop index if exists public.idx_orcamento_status_v2;
drop index if exists public.idx_perfil_acesso_codigo;

-- Toda FK recebe indice pelo mesmo prefixo de colunas, evitando scans em cascata.
do $$
declare
  fk record;
  index_name text;
begin
  for fk in
    select
      con.oid,
      source_table.relname as table_name,
      con.conname,
      string_agg(quote_ident(attribute.attname), ', ' order by key_position.ordinality) as column_list,
      string_agg(attribute.attname, '_' order by key_position.ordinality) as column_slug
    from pg_constraint con
    join pg_class source_table on source_table.oid = con.conrelid
    join pg_namespace source_schema on source_schema.oid = source_table.relnamespace
    cross join lateral unnest(con.conkey) with ordinality as key_position(attnum, ordinality)
    join pg_attribute attribute
      on attribute.attrelid = con.conrelid
     and attribute.attnum = key_position.attnum
    where con.contype = 'f'
      and source_schema.nspname = 'public'
      and not exists (
        select 1
        from pg_index existing_index
        where existing_index.indrelid = con.conrelid
          and existing_index.indisvalid
          and existing_index.indisready
          and (existing_index.indkey::smallint[])[0:cardinality(con.conkey)-1] = con.conkey
      )
    group by con.oid, source_table.relname, con.conname
    order by source_table.relname, con.conname
  loop
    index_name := left(
      'idx_fk_' || fk.table_name || '_' || fk.column_slug,
      54
    ) || '_' || substr(md5(fk.conname), 1, 8);

    execute format(
      'create index if not exists %I on public.%I (%s)',
      index_name,
      fk.table_name,
      fk.column_list
    );
  end loop;
end;
$$;

create index if not exists idx_integracao_sync_log_status_created
  on public.integracao_sync_log(status, created_date);

create or replace function public.app_purge_integration_sync_logs(
  p_success_retention_days integer default 90,
  p_error_retention_days integer default 365
)
returns table(success_deleted bigint, error_deleted bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_success_deleted bigint := 0;
  v_error_deleted bigint := 0;
begin
  if p_success_retention_days < 30 or p_error_retention_days < 90 then
    raise exception 'Retencao minima: 30 dias para sucesso e 90 dias para erros.';
  end if;

  delete from public.integracao_sync_log
  where status = 'success'
    and created_date < now() - make_interval(days => p_success_retention_days);
  get diagnostics v_success_deleted = row_count;

  delete from public.integracao_sync_log
  where status <> 'success'
    and created_date < now() - make_interval(days => p_error_retention_days);
  get diagnostics v_error_deleted = row_count;

  success_deleted := v_success_deleted;
  error_deleted := v_error_deleted;
  return next;
end;
$$;

revoke all on function public.app_purge_integration_sync_logs(integer, integer) from public, anon, authenticated;
grant execute on function public.app_purge_integration_sync_logs(integer, integer) to service_role;

select * from public.app_purge_integration_sync_logs(90, 365);

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(job.jobid)
    from cron.job job
    where job.jobname = 'app-integration-sync-log-retention';

    perform cron.schedule(
      'app-integration-sync-log-retention',
      '17 3 * * 0',
      'select public.app_purge_integration_sync_logs(90, 365);'
    );
  end if;
end;
$$;

analyze public.carteira;
analyze public.extrato_bancario;
analyze public.integracao_sync_log;

notify pgrst, 'reload schema';

commit;
