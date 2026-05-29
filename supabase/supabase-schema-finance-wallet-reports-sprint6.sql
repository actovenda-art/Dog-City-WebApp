-- Sprint 6 - Relatorios V2, snapshots e competencia financeira
-- Objetivo:
-- 1. Introduzir consultas gerenciais V2 sem substituir os dashboards legados
-- 2. Preservar snapshots fechados por competencia e tipo
-- 3. Registrar deltas auditaveis sem reescrever historico

create extension if not exists pgcrypto;

create table if not exists public.finance_snapshot (
  id text primary key default gen_random_uuid()::text,
  empresa_id text not null,
  competencia text not null,
  periodo_inicio date not null,
  periodo_fim date not null,
  tipo text not null,
  status text not null default 'fechado',
  source_key text null,
  hash_checksum text not null,
  payload jsonb not null default '{}'::jsonb,
  usuario_id text null,
  metadata jsonb not null default '{}'::jsonb,
  lock_version integer not null default 0,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  constraint chk_finance_snapshot_tipo
    check (tipo in ('faturamento_real', 'geracao_recursos', 'carteira', 'servicos_prestados')),
  constraint chk_finance_snapshot_status
    check (status in ('fechado', 'reutilizado'))
);

create unique index if not exists uq_finance_snapshot_competencia_tipo
  on public.finance_snapshot(empresa_id, competencia, tipo);

create unique index if not exists uq_finance_snapshot_source_key
  on public.finance_snapshot(empresa_id, source_key)
  where source_key is not null;

create index if not exists idx_finance_snapshot_empresa_tipo
  on public.finance_snapshot(empresa_id, tipo, created_date desc);

drop trigger if exists trg_finance_snapshot_before_update on public.finance_snapshot;
drop trigger if exists trg_finance_snapshot_before_delete on public.finance_snapshot;
drop function if exists public.finance_prevent_finance_snapshot_mutation();

create or replace function public.finance_prevent_finance_snapshot_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'finance_snapshot e imutavel. Use comparison/delta para registrar mudancas posteriores.';
end;
$$;

create trigger trg_finance_snapshot_before_update
before update on public.finance_snapshot
for each row
execute function public.finance_prevent_finance_snapshot_mutation();

create trigger trg_finance_snapshot_before_delete
before delete on public.finance_snapshot
for each row
execute function public.finance_prevent_finance_snapshot_mutation();

create table if not exists public.finance_snapshot_delta (
  id text primary key default gen_random_uuid()::text,
  snapshot_id text not null references public.finance_snapshot(id) on delete cascade,
  comparison_run_id text not null,
  empresa_id text not null,
  competencia text not null,
  tipo text not null,
  delta_kind text not null,
  entity_key text not null,
  entity_label text null,
  valor_anterior numeric(14,2) not null default 0,
  valor_atual numeric(14,2) not null default 0,
  impacto_financeiro numeric(14,2) not null default 0,
  payload_before jsonb null,
  payload_after jsonb null,
  usuario_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  constraint chk_finance_snapshot_delta_kind
    check (delta_kind in ('incluido', 'removido', 'alterado'))
);

create index if not exists idx_finance_snapshot_delta_snapshot
  on public.finance_snapshot_delta(snapshot_id, created_date desc);

create index if not exists idx_finance_snapshot_delta_run
  on public.finance_snapshot_delta(comparison_run_id, created_date desc);

drop function if exists public.finance_ensure_reports_feature_flags();

create or replace function public.finance_ensure_reports_feature_flags()
returns table (
  flag_key text,
  scoped_empresa_id text,
  enabled boolean
)
language plpgsql
as $$
declare
  v_empresa record;
begin
  if not exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.reports_v2_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.reports_v2_enabled',
      'Finance - Reports V2 Enabled',
      'Habilita leitura controlada dos relatorios financeiros V2.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if not exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.snapshots_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.snapshots_enabled',
      'Finance - Snapshots Enabled',
      'Habilita fechamento e comparacao de snapshots financeiros.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if not exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.financial_competence_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.financial_competence_enabled',
      'Finance - Financial Competence Enabled',
      'Habilita separacao entre geracao de recursos e faturamento real.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'empresa'
  ) then
    for v_empresa in select e.id from public.empresa e
    loop
      if not exists (
        select 1 from public.app_config cfg
        where cfg.key = 'finance.reports_v2_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.reports_v2_enabled',
          'Finance - Reports V2 Enabled',
          'Habilita leitura controlada dos relatorios financeiros V2.',
          jsonb_build_object('enabled', false),
          true,
          v_empresa.id
        );
      end if;

      if not exists (
        select 1 from public.app_config cfg
        where cfg.key = 'finance.snapshots_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.snapshots_enabled',
          'Finance - Snapshots Enabled',
          'Habilita fechamento e comparacao de snapshots financeiros.',
          jsonb_build_object('enabled', false),
          true,
          v_empresa.id
        );
      end if;

      if not exists (
        select 1 from public.app_config cfg
        where cfg.key = 'finance.financial_competence_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.financial_competence_enabled',
          'Finance - Financial Competence Enabled',
          'Habilita separacao entre geracao de recursos e faturamento real.',
          jsonb_build_object('enabled', false),
          true,
          v_empresa.id
        );
      end if;
    end loop;
  end if;

  return query
  select
    cfg.key,
    cfg.empresa_id,
    coalesce((cfg.value ->> 'enabled')::boolean, false)
  from public.app_config cfg
  where cfg.key in (
    'finance.reports_v2_enabled',
    'finance.snapshots_enabled',
    'finance.financial_competence_enabled'
  )
  order by cfg.key, cfg.empresa_id nulls first;
end;
$$;

drop function if exists public.finance_reports_v2_context(text);

create or replace function public.finance_reports_v2_context(
  p_empresa_id text
)
returns table (
  empresa_id text,
  reports_v2_enabled boolean,
  snapshots_enabled boolean,
  financial_competence_enabled boolean,
  snapshots_count integer,
  latest_snapshot_created_at timestamptz
)
language plpgsql
stable
as $$
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio.';
  end if;

  return query
  select
    p_empresa_id,
    public.finance_get_feature_flag('finance.reports_v2_enabled', p_empresa_id),
    public.finance_get_feature_flag('finance.snapshots_enabled', p_empresa_id),
    public.finance_get_feature_flag('finance.financial_competence_enabled', p_empresa_id),
    count(fs.id)::integer,
    max(fs.created_date)
  from public.finance_snapshot fs
  where fs.empresa_id = p_empresa_id;
end;
$$;

drop function if exists public.finance_reports_v2_summary(text, date, date);

create or replace function public.finance_reports_v2_summary(
  p_empresa_id text,
  p_periodo_inicio date,
  p_periodo_fim date
)
returns table (
  empresa_id text,
  periodo_inicio date,
  periodo_fim date,
  wallet_count integer,
  wallet_total numeric,
  generation_count integer,
  generation_total numeric,
  billing_count integer,
  billing_total numeric,
  services_count integer,
  services_total numeric
)
language plpgsql
stable
as $$
declare
  v_reports_enabled boolean;
  v_financial_competence_enabled boolean;
  v_wallet_count integer := 0;
  v_wallet_total numeric(14,2) := 0;
  v_generation_count integer := 0;
  v_generation_total numeric(14,2) := 0;
  v_billing_count integer := 0;
  v_billing_total numeric(14,2) := 0;
  v_services_count integer := 0;
  v_services_total numeric(14,2) := 0;
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio.';
  end if;

  v_reports_enabled := public.finance_get_feature_flag('finance.reports_v2_enabled', p_empresa_id);
  if not v_reports_enabled then
    raise exception 'Feature flag finance.reports_v2_enabled esta desligada para a empresa %.', p_empresa_id;
  end if;

  v_financial_competence_enabled := public.finance_get_feature_flag('finance.financial_competence_enabled', p_empresa_id);

  select
    count(*)::integer,
    round(coalesce(sum(r.saldo_atual), 0), 2)
    into v_wallet_count, v_wallet_total
  from public.finance_report_wallet(p_empresa_id) r;

  if v_financial_competence_enabled then
    select
      count(*)::integer,
      round(coalesce(sum(r.valor), 0), 2)
      into v_generation_count, v_generation_total
    from public.finance_report_generation_resources(p_empresa_id, p_periodo_inicio, p_periodo_fim) r;

    select
      count(*)::integer,
      round(coalesce(sum(r.valor), 0), 2)
      into v_billing_count, v_billing_total
    from public.finance_report_real_billing(p_empresa_id, p_periodo_inicio, p_periodo_fim) r;

    select
      count(*)::integer,
      round(coalesce(sum(r.valor), 0), 2)
      into v_services_count, v_services_total
    from public.finance_report_services_provided(p_empresa_id, p_periodo_inicio, p_periodo_fim) r;
  end if;

  return query
  select
    p_empresa_id,
    p_periodo_inicio,
    p_periodo_fim,
    coalesce(v_wallet_count, 0),
    coalesce(v_wallet_total, 0),
    coalesce(v_generation_count, 0),
    coalesce(v_generation_total, 0),
    coalesce(v_billing_count, 0),
    coalesce(v_billing_total, 0),
    coalesce(v_services_count, 0),
    coalesce(v_services_total, 0);
end;
$$;

drop function if exists public.finance_report_generation_resources(text, date, date);

create or replace function public.finance_report_generation_resources(
  p_empresa_id text,
  p_periodo_inicio date,
  p_periodo_fim date
)
returns table (
  entity_key text,
  entity_label text,
  competencia_date date,
  cliente_id text,
  dog_id text,
  service_type text,
  quantidade integer,
  valor numeric,
  referencia text,
  origem text,
  payload jsonb
)
language plpgsql
stable
as $$
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio.';
  end if;

  if not public.finance_get_feature_flag('finance.reports_v2_enabled', p_empresa_id) then
    raise exception 'Feature flag finance.reports_v2_enabled esta desligada para a empresa %.', p_empresa_id;
  end if;

  if not public.finance_get_feature_flag('finance.financial_competence_enabled', p_empresa_id) then
    raise exception 'Feature flag finance.financial_competence_enabled esta desligada para a empresa %.', p_empresa_id;
  end if;

  return query
  select
    'serviceprovided|' || sp.id as entity_key,
    coalesce(sp.service_type, sp.id) as entity_label,
    coalesce(sp.data_utilizacao, sp.created_date::date) as competencia_date,
    sp.cliente_id,
    sp.dog_id,
    sp.service_type,
    greatest(coalesce(sp.quantidade, 1), 1)::integer as quantidade,
    round(coalesce(sp.valor_cobrado, sp.preco, 0) * greatest(coalesce(sp.quantidade, 1), 1), 2) as valor,
    coalesce(sp.source_key, sp.appointment_id, sp.id) as referencia,
    coalesce(sp.source_type, 'serviceprovided') as origem,
    jsonb_build_object(
      'appointment_id', sp.appointment_id,
      'checkin_id', sp.checkin_id,
      'metadata', coalesce(sp.metadata, '{}'::jsonb)
    ) as payload
  from public.serviceprovided sp
  where sp.empresa_id = p_empresa_id
    and coalesce(sp.data_utilizacao, sp.created_date::date) between p_periodo_inicio and p_periodo_fim
  order by coalesce(sp.data_utilizacao, sp.created_date::date), sp.created_date, sp.id;
end;
$$;

drop function if exists public.finance_report_services_provided(text, date, date);

create or replace function public.finance_report_services_provided(
  p_empresa_id text,
  p_periodo_inicio date,
  p_periodo_fim date
)
returns table (
  entity_key text,
  entity_label text,
  competencia_date date,
  cliente_id text,
  dog_id text,
  service_type text,
  valor numeric,
  referencia text,
  origem text,
  payload jsonb
)
language plpgsql
stable
as $$
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio.';
  end if;

  if not public.finance_get_feature_flag('finance.reports_v2_enabled', p_empresa_id) then
    raise exception 'Feature flag finance.reports_v2_enabled esta desligada para a empresa %.', p_empresa_id;
  end if;

  if not public.finance_get_feature_flag('finance.financial_competence_enabled', p_empresa_id) then
    raise exception 'Feature flag finance.financial_competence_enabled esta desligada para a empresa %.', p_empresa_id;
  end if;

  return query
  select
    'serviceprovided|' || sp.id as entity_key,
    coalesce(sp.service_type, sp.id) as entity_label,
    coalesce(sp.data_utilizacao, sp.created_date::date) as competencia_date,
    sp.cliente_id,
    sp.dog_id,
    sp.service_type,
    round(coalesce(sp.valor_cobrado, sp.preco, 0) * greatest(coalesce(sp.quantidade, 1), 1), 2) as valor,
    coalesce(sp.source_key, sp.appointment_id, sp.id) as referencia,
    coalesce(sp.source_type, 'serviceprovided') as origem,
    jsonb_build_object(
      'appointment_id', sp.appointment_id,
      'checkin_id', sp.checkin_id,
      'metadata', coalesce(sp.metadata, '{}'::jsonb)
    ) as payload
  from public.serviceprovided sp
  where sp.empresa_id = p_empresa_id
    and coalesce(sp.data_utilizacao, sp.created_date::date) between p_periodo_inicio and p_periodo_fim
  order by coalesce(sp.data_utilizacao, sp.created_date::date), sp.created_date, sp.id;
end;
$$;

drop function if exists public.finance_report_real_billing(text, date, date);

create or replace function public.finance_report_real_billing(
  p_empresa_id text,
  p_periodo_inicio date,
  p_periodo_fim date
)
returns table (
  entity_key text,
  entity_label text,
  competencia_date date,
  carteira_conta_id text,
  movimento_id text,
  tipo text,
  origem text,
  valor numeric,
  referencia text,
  payload jsonb
)
language plpgsql
stable
as $$
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio.';
  end if;

  if not public.finance_get_feature_flag('finance.reports_v2_enabled', p_empresa_id) then
    raise exception 'Feature flag finance.reports_v2_enabled esta desligada para a empresa %.', p_empresa_id;
  end if;

  if not public.finance_get_feature_flag('finance.financial_competence_enabled', p_empresa_id) then
    raise exception 'Feature flag finance.financial_competence_enabled esta desligada para a empresa %.', p_empresa_id;
  end if;

  return query
  select
    'carteira_movimento|' || cm.id as entity_key,
    coalesce(cm.referencia_amigavel, cm.id) as entity_label,
    cm.created_date::date as competencia_date,
    cm.carteira_conta_id,
    cm.id as movimento_id,
    cm.tipo,
    cm.origem,
    round(coalesce(cm.valor, 0), 2) as valor,
    coalesce(cm.operacao_idempotencia, cm.referencia_amigavel, cm.id) as referencia,
    jsonb_build_object(
      'orcamento_id', cm.orcamento_id,
      'obrigacao_id', cm.obrigacao_id,
      'transacao_id', cm.transacao_id,
      'metadata', coalesce(cm.metadata, '{}'::jsonb)
    ) as payload
  from public.carteira_movimento cm
  where cm.empresa_id = p_empresa_id
    and cm.natureza = 'entrada'
    and cm.tipo in ('credito', 'entrada_direcionada')
    and cm.created_date::date between p_periodo_inicio and p_periodo_fim
  order by cm.created_date, cm.id;
end;
$$;

drop function if exists public.finance_report_wallet(text);

create or replace function public.finance_report_wallet(
  p_empresa_id text
)
returns table (
  entity_key text,
  entity_label text,
  competencia_date date,
  carteira_conta_id text,
  carteira_id text,
  saldo_atual numeric,
  movement_count integer,
  last_movement_at timestamptz,
  latest_reconciliation_status text,
  latest_reconciliation_diff numeric,
  payload jsonb
)
language plpgsql
stable
as $$
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio.';
  end if;

  if not public.finance_get_feature_flag('finance.reports_v2_enabled', p_empresa_id) then
    raise exception 'Feature flag finance.reports_v2_enabled esta desligada para a empresa %.', p_empresa_id;
  end if;

  return query
  select
    'carteira_conta|' || cc.id as entity_key,
    coalesce(cc.carteira_id, cc.id) as entity_label,
    coalesce(cr.created_date::date, cc.updated_date::date, cc.created_date::date) as competencia_date,
    cc.id as carteira_conta_id,
    cc.carteira_id,
    round(coalesce(cc.saldo_atual, 0), 2) as saldo_atual,
    coalesce(mv.movement_count, 0)::integer as movement_count,
    mv.last_movement_at,
    cr.status as latest_reconciliation_status,
    round(coalesce(cr.diferenca, 0), 2) as latest_reconciliation_diff,
    jsonb_build_object(
      'ultimo_movimento_em', cc.ultimo_movimento_em,
      'ultima_reconciliacao_em', cc.ultima_reconciliacao_em,
      'ativo', cc.ativo
    ) as payload
  from public.carteira_conta cc
  left join lateral (
    select
      count(*) as movement_count,
      max(cm.created_date) as last_movement_at
    from public.carteira_movimento cm
    where cm.carteira_conta_id = cc.id
  ) mv on true
  left join lateral (
    select
      r.status,
      r.diferenca,
      r.created_date
    from public.carteira_reconciliacao r
    where r.carteira_conta_id = cc.id
    order by r.created_date desc, r.id desc
    limit 1
  ) cr on true
  where cc.empresa_id = p_empresa_id
  order by cc.created_date, cc.id;
end;
$$;

drop function if exists public.finance_snapshot_create(text, text, text, date, date, text, jsonb);

drop function if exists public.finance_build_snapshot_payload(text, text, text, date, date, jsonb);

create or replace function public.finance_build_snapshot_payload(
  p_empresa_id text,
  p_tipo text,
  p_competencia text,
  p_periodo_inicio date,
  p_periodo_fim date,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_payload jsonb;
begin
  if p_tipo = 'geracao_recursos' then
    select jsonb_build_object(
      'tipo', p_tipo,
      'competencia', p_competencia,
      'periodo_inicio', p_periodo_inicio,
      'periodo_fim', p_periodo_fim,
      'summary', jsonb_build_object(
        'count', count(*)::integer,
        'total_valor', round(coalesce(sum(r.valor), 0), 2)
      ),
      'items', coalesce(jsonb_agg(to_jsonb(r) order by r.competencia_date, r.entity_key), '[]'::jsonb),
      'metadata', coalesce(p_metadata, '{}'::jsonb)
    )
      into v_payload
    from public.finance_report_generation_resources(p_empresa_id, p_periodo_inicio, p_periodo_fim) r;
  elsif p_tipo = 'faturamento_real' then
    select jsonb_build_object(
      'tipo', p_tipo,
      'competencia', p_competencia,
      'periodo_inicio', p_periodo_inicio,
      'periodo_fim', p_periodo_fim,
      'summary', jsonb_build_object(
        'count', count(*)::integer,
        'total_valor', round(coalesce(sum(r.valor), 0), 2)
      ),
      'items', coalesce(jsonb_agg(to_jsonb(r) order by r.competencia_date, r.entity_key), '[]'::jsonb),
      'metadata', coalesce(p_metadata, '{}'::jsonb)
    )
      into v_payload
    from public.finance_report_real_billing(p_empresa_id, p_periodo_inicio, p_periodo_fim) r;
  elsif p_tipo = 'carteira' then
    select jsonb_build_object(
      'tipo', p_tipo,
      'competencia', p_competencia,
      'periodo_inicio', p_periodo_inicio,
      'periodo_fim', p_periodo_fim,
      'summary', jsonb_build_object(
        'count', count(*)::integer,
        'total_valor', round(coalesce(sum(r.saldo_atual), 0), 2)
      ),
      'items', coalesce(jsonb_agg(to_jsonb(r) order by r.entity_key), '[]'::jsonb),
      'metadata', coalesce(p_metadata, '{}'::jsonb)
    )
      into v_payload
    from public.finance_report_wallet(p_empresa_id) r;
  elsif p_tipo = 'servicos_prestados' then
    select jsonb_build_object(
      'tipo', p_tipo,
      'competencia', p_competencia,
      'periodo_inicio', p_periodo_inicio,
      'periodo_fim', p_periodo_fim,
      'summary', jsonb_build_object(
        'count', count(*)::integer,
        'total_valor', round(coalesce(sum(r.valor), 0), 2)
      ),
      'items', coalesce(jsonb_agg(to_jsonb(r) order by r.competencia_date, r.entity_key), '[]'::jsonb),
      'metadata', coalesce(p_metadata, '{}'::jsonb)
    )
      into v_payload
    from public.finance_report_services_provided(p_empresa_id, p_periodo_inicio, p_periodo_fim) r;
  else
    raise exception 'Tipo de snapshot invalido: %', p_tipo;
  end if;

  return coalesce(v_payload, '{}'::jsonb);
end;
$$;

create or replace function public.finance_snapshot_create(
  p_empresa_id text,
  p_tipo text,
  p_competencia text,
  p_periodo_inicio date,
  p_periodo_fim date,
  p_usuario_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  snapshot_id text,
  empresa_id text,
  competencia text,
  tipo text,
  status text,
  hash_checksum text,
  item_count integer,
  total_valor numeric,
  created_date timestamptz,
  reused boolean
)
language plpgsql
as $$
declare
  v_existing public.finance_snapshot%rowtype;
  v_payload jsonb;
  v_summary jsonb;
  v_item_count integer := 0;
  v_total_valor numeric(14,2) := 0;
  v_hash text;
  v_source_key text;
  v_inserted public.finance_snapshot%rowtype;
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio.';
  end if;

  if coalesce(trim(p_tipo), '') = '' then
    raise exception 'p_tipo e obrigatorio.';
  end if;

  if coalesce(trim(p_competencia), '') = '' then
    raise exception 'p_competencia e obrigatorio.';
  end if;

  if not public.finance_get_feature_flag('finance.snapshots_enabled', p_empresa_id) then
    raise exception 'Feature flag finance.snapshots_enabled esta desligada para a empresa %.', p_empresa_id;
  end if;

  if not public.finance_get_feature_flag('finance.reports_v2_enabled', p_empresa_id) then
    raise exception 'Feature flag finance.reports_v2_enabled esta desligada para a empresa %.', p_empresa_id;
  end if;

  v_source_key := 'finance_snapshot|' || p_empresa_id || '|' || p_competencia || '|' || p_tipo;

  select *
    into v_existing
  from public.finance_snapshot fs
  where fs.empresa_id = p_empresa_id
    and fs.competencia = p_competencia
    and fs.tipo = p_tipo
  for update;

  if found then
    return query
    select
      v_existing.id,
      v_existing.empresa_id,
      v_existing.competencia,
      v_existing.tipo,
      'reutilizado'::text,
      v_existing.hash_checksum,
      coalesce((v_existing.payload -> 'summary' ->> 'count')::integer, 0),
      coalesce((v_existing.payload -> 'summary' ->> 'total_valor')::numeric, 0),
      v_existing.created_date,
      true;
    return;
  end if;

  if p_tipo = 'geracao_recursos' then
    select jsonb_build_object(
      'tipo', p_tipo,
      'competencia', p_competencia,
      'periodo_inicio', p_periodo_inicio,
      'periodo_fim', p_periodo_fim,
      'summary', jsonb_build_object(
        'count', count(*)::integer,
        'total_valor', round(coalesce(sum(r.valor), 0), 2)
      ),
      'items', coalesce(jsonb_agg(to_jsonb(r) order by r.competencia_date, r.entity_key), '[]'::jsonb),
      'metadata', coalesce(p_metadata, '{}'::jsonb)
    )
      into v_payload
    from public.finance_report_generation_resources(p_empresa_id, p_periodo_inicio, p_periodo_fim) r;
  elsif p_tipo = 'faturamento_real' then
    select jsonb_build_object(
      'tipo', p_tipo,
      'competencia', p_competencia,
      'periodo_inicio', p_periodo_inicio,
      'periodo_fim', p_periodo_fim,
      'summary', jsonb_build_object(
        'count', count(*)::integer,
        'total_valor', round(coalesce(sum(r.valor), 0), 2)
      ),
      'items', coalesce(jsonb_agg(to_jsonb(r) order by r.competencia_date, r.entity_key), '[]'::jsonb),
      'metadata', coalesce(p_metadata, '{}'::jsonb)
    )
      into v_payload
    from public.finance_report_real_billing(p_empresa_id, p_periodo_inicio, p_periodo_fim) r;
  elsif p_tipo = 'carteira' then
    select jsonb_build_object(
      'tipo', p_tipo,
      'competencia', p_competencia,
      'periodo_inicio', p_periodo_inicio,
      'periodo_fim', p_periodo_fim,
      'summary', jsonb_build_object(
        'count', count(*)::integer,
        'total_valor', round(coalesce(sum(r.saldo_atual), 0), 2)
      ),
      'items', coalesce(jsonb_agg(to_jsonb(r) order by r.entity_key), '[]'::jsonb),
      'metadata', coalesce(p_metadata, '{}'::jsonb)
    )
      into v_payload
    from public.finance_report_wallet(p_empresa_id) r;
  elsif p_tipo = 'servicos_prestados' then
    select jsonb_build_object(
      'tipo', p_tipo,
      'competencia', p_competencia,
      'periodo_inicio', p_periodo_inicio,
      'periodo_fim', p_periodo_fim,
      'summary', jsonb_build_object(
        'count', count(*)::integer,
        'total_valor', round(coalesce(sum(r.valor), 0), 2)
      ),
      'items', coalesce(jsonb_agg(to_jsonb(r) order by r.competencia_date, r.entity_key), '[]'::jsonb),
      'metadata', coalesce(p_metadata, '{}'::jsonb)
    )
      into v_payload
    from public.finance_report_services_provided(p_empresa_id, p_periodo_inicio, p_periodo_fim) r;
  else
    raise exception 'Tipo de snapshot invalido: %', p_tipo;
  end if;

  v_summary := coalesce(v_payload -> 'summary', '{}'::jsonb);
  v_item_count := coalesce((v_summary ->> 'count')::integer, 0);
  v_total_valor := round(coalesce((v_summary ->> 'total_valor')::numeric, 0), 2);
  v_hash := md5(coalesce(v_payload::text, '{}'));

  insert into public.finance_snapshot (
    empresa_id,
    competencia,
    periodo_inicio,
    periodo_fim,
    tipo,
    status,
    source_key,
    hash_checksum,
    payload,
    usuario_id,
    metadata
  )
  values (
    p_empresa_id,
    p_competencia,
    p_periodo_inicio,
    p_periodo_fim,
    p_tipo,
    'fechado',
    v_source_key,
    v_hash,
    v_payload,
    p_usuario_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_inserted;

  return query
  select
    v_inserted.id,
    v_inserted.empresa_id,
    v_inserted.competencia,
    v_inserted.tipo,
    v_inserted.status,
    v_inserted.hash_checksum,
    v_item_count,
    v_total_valor,
    v_inserted.created_date,
    false;
end;
$$;

drop function if exists public.finance_snapshot_compare(text, text, jsonb);

create or replace function public.finance_snapshot_compare(
  p_snapshot_id text,
  p_usuario_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  comparison_run_id text,
  snapshot_id text,
  tipo text,
  competencia text,
  delta_kind text,
  entity_key text,
  entity_label text,
  valor_anterior numeric,
  valor_atual numeric,
  impacto_financeiro numeric
)
language plpgsql
as $$
declare
  v_snapshot public.finance_snapshot%rowtype;
  v_current_payload jsonb;
  v_run_id text := gen_random_uuid()::text;
begin
  if coalesce(trim(p_snapshot_id), '') = '' then
    raise exception 'p_snapshot_id e obrigatorio.';
  end if;

  select *
    into v_snapshot
  from public.finance_snapshot fs
  where fs.id = p_snapshot_id;

  if not found then
    raise exception 'finance_snapshot % nao encontrado.', p_snapshot_id;
  end if;

  if not public.finance_get_feature_flag('finance.snapshots_enabled', v_snapshot.empresa_id) then
    raise exception 'Feature flag finance.snapshots_enabled esta desligada para a empresa %.', v_snapshot.empresa_id;
  end if;

  v_current_payload := public.finance_build_snapshot_payload(
    p_empresa_id := v_snapshot.empresa_id,
    p_tipo := v_snapshot.tipo,
    p_competencia := v_snapshot.competencia,
    p_periodo_inicio := v_snapshot.periodo_inicio,
    p_periodo_fim := v_snapshot.periodo_fim,
    p_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('comparison_mode', true)
  );

  insert into public.finance_snapshot_delta (
    snapshot_id,
    comparison_run_id,
    empresa_id,
    competencia,
    tipo,
    delta_kind,
    entity_key,
    entity_label,
    valor_anterior,
    valor_atual,
    impacto_financeiro,
    payload_before,
    payload_after,
    usuario_id,
    metadata
  )
  select
    v_snapshot.id,
    v_run_id,
    v_snapshot.empresa_id,
    v_snapshot.competencia,
    v_snapshot.tipo,
    case
      when old_item is null and new_item is not null then 'incluido'
      when old_item is not null and new_item is null then 'removido'
      else 'alterado'
    end as delta_kind,
    coalesce(old_item ->> 'entity_key', new_item ->> 'entity_key') as entity_key,
    coalesce(new_item ->> 'entity_label', old_item ->> 'entity_label', coalesce(old_item ->> 'entity_key', new_item ->> 'entity_key')) as entity_label,
    round(coalesce((old_item ->> 'valor')::numeric, coalesce((old_item ->> 'saldo_atual')::numeric, 0)), 2) as valor_anterior,
    round(coalesce((new_item ->> 'valor')::numeric, coalesce((new_item ->> 'saldo_atual')::numeric, 0)), 2) as valor_atual,
    round(
      coalesce((new_item ->> 'valor')::numeric, coalesce((new_item ->> 'saldo_atual')::numeric, 0))
      - coalesce((old_item ->> 'valor')::numeric, coalesce((old_item ->> 'saldo_atual')::numeric, 0)),
      2
    ) as impacto_financeiro,
    old_item,
    new_item,
    p_usuario_id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('source', 'sprint6_snapshot_compare')
  from (
    with old_items as (
      select item ->> 'entity_key' as entity_key, item as old_item
      from jsonb_array_elements(coalesce(v_snapshot.payload -> 'items', '[]'::jsonb)) item
    ),
    new_items as (
      select item ->> 'entity_key' as entity_key, item as new_item
      from jsonb_array_elements(coalesce(v_current_payload -> 'items', '[]'::jsonb)) item
    )
    select
      coalesce(old_items.entity_key, new_items.entity_key) as entity_key,
      old_items.old_item,
      new_items.new_item
    from old_items
    full outer join new_items
      on new_items.entity_key = old_items.entity_key
    where
      old_items.old_item is null
      or new_items.new_item is null
      or old_items.old_item::text <> new_items.new_item::text
  ) diff;

  return query
  select
    v_run_id,
    d.snapshot_id,
    d.tipo,
    d.competencia,
    d.delta_kind,
    d.entity_key,
    d.entity_label,
    d.valor_anterior,
    d.valor_atual,
    d.impacto_financeiro
  from public.finance_snapshot_delta d
  where d.comparison_run_id = v_run_id
  order by d.delta_kind, d.entity_key;
end;
$$;

drop function if exists public.finance_snapshot_list(text, text, integer);

create or replace function public.finance_snapshot_list(
  p_empresa_id text,
  p_tipo text default null,
  p_limit integer default 20
)
returns table (
  id text,
  empresa_id text,
  competencia text,
  periodo_inicio date,
  periodo_fim date,
  tipo text,
  status text,
  hash_checksum text,
  item_count integer,
  total_valor numeric,
  usuario_id text,
  created_date timestamptz
)
language plpgsql
stable
as $$
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio.';
  end if;

  if not public.finance_get_feature_flag('finance.reports_v2_enabled', p_empresa_id) then
    raise exception 'Feature flag finance.reports_v2_enabled esta desligada para a empresa %.', p_empresa_id;
  end if;

  return query
  select
    fs.id,
    fs.empresa_id,
    fs.competencia,
    fs.periodo_inicio,
    fs.periodo_fim,
    fs.tipo,
    fs.status,
    fs.hash_checksum,
    coalesce((fs.payload -> 'summary' ->> 'count')::integer, 0) as item_count,
    coalesce((fs.payload -> 'summary' ->> 'total_valor')::numeric, 0) as total_valor,
    fs.usuario_id,
    fs.created_date
  from public.finance_snapshot fs
  where fs.empresa_id = p_empresa_id
    and (p_tipo is null or fs.tipo = p_tipo)
  order by fs.created_date desc, fs.id desc
  limit greatest(coalesce(p_limit, 20), 1);
end;
$$;

drop function if exists public.finance_snapshot_delta_list(text, integer);

create or replace function public.finance_snapshot_delta_list(
  p_snapshot_id text,
  p_limit integer default 200
)
returns table (
  comparison_run_id text,
  delta_kind text,
  entity_key text,
  entity_label text,
  valor_anterior numeric,
  valor_atual numeric,
  impacto_financeiro numeric,
  created_date timestamptz
)
language plpgsql
stable
as $$
begin
  if coalesce(trim(p_snapshot_id), '') = '' then
    raise exception 'p_snapshot_id e obrigatorio.';
  end if;

  return query
  select
    d.comparison_run_id,
    d.delta_kind,
    d.entity_key,
    d.entity_label,
    d.valor_anterior,
    d.valor_atual,
    d.impacto_financeiro,
    d.created_date
  from public.finance_snapshot_delta d
  where d.snapshot_id = p_snapshot_id
  order by d.created_date desc, d.entity_key asc
  limit greatest(coalesce(p_limit, 200), 1);
end;
$$;

select * from public.finance_ensure_reports_feature_flags();
