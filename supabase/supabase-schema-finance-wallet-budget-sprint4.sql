-- Sprint 4 - Orcamento + consumo cronologico + autorizacao controlada
-- Objetivo:
-- 1. Expor saldo da carteira no orcamento sob feature flags
-- 2. Implementar simulacao auditavel de consumo cronologico, sem quitacao automatica
-- 3. Registrar autorizacao sem pagamento / negativacao de forma explicita e auditavel
-- 4. Preservar o legado como fluxo principal

create extension if not exists pgcrypto;

alter table if exists public.autorizacao_financeira
  add column if not exists source_key text null;

alter table if exists public.autorizacao_financeira
  add column if not exists lock_version integer not null default 0;

create unique index if not exists uq_autorizacao_financeira_source_key
  on public.autorizacao_financeira(empresa_id, source_key)
  where source_key is not null;

drop trigger if exists trg_autorizacao_financeira_before_update on public.autorizacao_financeira;
create trigger trg_autorizacao_financeira_before_update
before update on public.autorizacao_financeira
for each row
execute function public.finance_before_update_versioned_row();

drop function if exists public.finance_ensure_wallet_budget_feature_flags();

create or replace function public.finance_ensure_wallet_budget_feature_flags()
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
    where cfg.key = 'finance.wallet_budget_balance_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.wallet_budget_balance_enabled',
      'Finance - Wallet Budget Balance Enabled',
      'Habilita a leitura controlada do saldo da carteira no orçamento.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if not exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.chronological_consumption_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.chronological_consumption_enabled',
      'Finance - Chronological Consumption Enabled',
      'Habilita o motor cronológico de consumo da carteira em modo controlado.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if not exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.allow_negative_wallet_with_authorization'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.allow_negative_wallet_with_authorization',
      'Finance - Allow Negative Wallet With Authorization',
      'Permite orçamento aprovado com saldo negativo somente quando houver autorização registrada.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if not exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.budget_authorization_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.budget_authorization_enabled',
      'Finance - Budget Authorization Enabled',
      'Habilita o registro de autorização sem pagamento no fluxo do orçamento.',
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
    for v_empresa in
      select e.id from public.empresa e
    loop
      if not exists (
        select 1 from public.app_config cfg
        where cfg.key = 'finance.wallet_budget_balance_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.wallet_budget_balance_enabled',
          'Finance - Wallet Budget Balance Enabled',
          'Habilita a leitura controlada do saldo da carteira no orçamento.',
          jsonb_build_object('enabled', false),
          true,
          v_empresa.id
        );
      end if;

      if not exists (
        select 1 from public.app_config cfg
        where cfg.key = 'finance.chronological_consumption_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.chronological_consumption_enabled',
          'Finance - Chronological Consumption Enabled',
          'Habilita o motor cronológico de consumo da carteira em modo controlado.',
          jsonb_build_object('enabled', false),
          true,
          v_empresa.id
        );
      end if;

      if not exists (
        select 1 from public.app_config cfg
        where cfg.key = 'finance.allow_negative_wallet_with_authorization'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.allow_negative_wallet_with_authorization',
          'Finance - Allow Negative Wallet With Authorization',
          'Permite orçamento aprovado com saldo negativo somente quando houver autorização registrada.',
          jsonb_build_object('enabled', false),
          true,
          v_empresa.id
        );
      end if;

      if not exists (
        select 1 from public.app_config cfg
        where cfg.key = 'finance.budget_authorization_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.budget_authorization_enabled',
          'Finance - Budget Authorization Enabled',
          'Habilita o registro de autorização sem pagamento no fluxo do orçamento.',
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
    coalesce((cfg.value ->> 'enabled')::boolean, false) as enabled
  from public.app_config cfg
  where cfg.key in (
    'finance.wallet_budget_balance_enabled',
    'finance.chronological_consumption_enabled',
    'finance.allow_negative_wallet_with_authorization',
    'finance.budget_authorization_enabled'
  )
  order by cfg.key, cfg.empresa_id nulls first;
end;
$$;

drop function if exists public.finance_wallet_budget_read_context(text, text);

create or replace function public.finance_wallet_budget_read_context(
  p_empresa_id text,
  p_carteira_id text default null
)
returns table (
  carteira_conta_id text,
  carteira_id text,
  empresa_id text,
  saldo_atual numeric,
  saldo_positivo_disponivel numeric,
  latest_reconciliation_status text,
  latest_reconciliation_diff numeric,
  wallet_budget_balance_enabled boolean,
  chronological_consumption_enabled boolean,
  allow_negative_wallet_with_authorization boolean,
  budget_authorization_enabled boolean
)
language plpgsql
stable
as $$
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio para leitura da carteira no orçamento.';
  end if;

  return query
  with latest_reconciliation as (
    select distinct on (cr.carteira_conta_id)
      cr.carteira_conta_id,
      cr.status,
      cr.diferenca
    from public.carteira_reconciliacao cr
    order by cr.carteira_conta_id, cr.created_date desc, cr.id desc
  )
  select
    cc.id as carteira_conta_id,
    cc.carteira_id,
    cc.empresa_id,
    round(coalesce(cc.saldo_atual, 0), 2) as saldo_atual,
    round(greatest(coalesce(cc.saldo_atual, 0), 0), 2) as saldo_positivo_disponivel,
    lr.status as latest_reconciliation_status,
    lr.diferenca as latest_reconciliation_diff,
    public.finance_get_feature_flag('finance.wallet_budget_balance_enabled', p_empresa_id) as wallet_budget_balance_enabled,
    public.finance_get_feature_flag('finance.chronological_consumption_enabled', p_empresa_id) as chronological_consumption_enabled,
    public.finance_get_feature_flag('finance.allow_negative_wallet_with_authorization', p_empresa_id) as allow_negative_wallet_with_authorization,
    public.finance_get_feature_flag('finance.budget_authorization_enabled', p_empresa_id) as budget_authorization_enabled
  from public.carteira_conta cc
  left join latest_reconciliation lr on lr.carteira_conta_id = cc.id
  where cc.empresa_id = p_empresa_id
    and (p_carteira_id is null or cc.carteira_id = p_carteira_id)
  order by cc.created_date asc
  limit 1;
end;
$$;

drop function if exists public.finance_preview_budget_consumption(text, numeric, numeric, jsonb);

create or replace function public.finance_preview_budget_consumption(
  p_carteira_conta_id text,
  p_valor_orcamento_total numeric,
  p_valor_saldo_solicitado numeric default null,
  p_preview_items jsonb default '[]'::jsonb
)
returns table (
  carteira_conta_id text,
  saldo_atual numeric,
  saldo_positivo_disponivel numeric,
  valor_orcamento_total numeric,
  valor_saldo_solicitado numeric,
  valor_saldo_aplicado numeric,
  valor_orcamento_coberto numeric,
  valor_orcamento_em_aberto numeric,
  obrigacoes_abertas_count integer,
  preview_items_count integer,
  allocation_count integer,
  projected_balance_after_wallet_usage numeric,
  requires_authorization boolean,
  allocations jsonb
)
language plpgsql
as $$
declare
  v_carteira_conta public.carteira_conta%rowtype;
  v_today date := current_date;
  v_positive_balance numeric(14,2);
  v_requested_usage numeric(14,2);
  v_applicable_usage numeric(14,2);
  v_remaining_usage numeric(14,2);
  v_budget_covered numeric(14,2) := 0;
  v_budget_total numeric(14,2);
  v_allocations jsonb := '[]'::jsonb;
  v_allocation_count integer := 0;
  v_obrigacoes_count integer := 0;
  v_preview_count integer := 0;
  v_candidate record;
  v_allocated numeric(14,2);
begin
  if coalesce(trim(p_carteira_conta_id), '') = '' then
    raise exception 'p_carteira_conta_id e obrigatorio para a simulacao do orçamento.';
  end if;

  if p_valor_orcamento_total is null or p_valor_orcamento_total <= 0 then
    raise exception 'p_valor_orcamento_total deve ser maior que zero.';
  end if;

  select *
    into v_carteira_conta
  from public.carteira_conta
  where id = p_carteira_conta_id;

  if not found then
    raise exception 'carteira_conta % nao encontrada.', p_carteira_conta_id;
  end if;

  if not public.finance_get_feature_flag('finance.chronological_consumption_enabled', v_carteira_conta.empresa_id) then
    raise exception 'Feature flag finance.chronological_consumption_enabled esta desligada para a empresa %.', v_carteira_conta.empresa_id;
  end if;

  v_budget_total := round(p_valor_orcamento_total, 2);
  v_positive_balance := round(greatest(coalesce(v_carteira_conta.saldo_atual, 0), 0), 2);
  v_requested_usage := round(
    case
      when p_valor_saldo_solicitado is null then least(v_positive_balance, v_budget_total)
      else greatest(coalesce(p_valor_saldo_solicitado, 0), 0)
    end,
    2
  );
  v_applicable_usage := round(least(v_requested_usage, v_positive_balance, v_budget_total), 2);
  v_remaining_usage := v_applicable_usage;

  with candidate_rows as (
    select
      'existing'::text as item_kind,
      ofi.id as item_id,
      ofi.source_key,
      ofi.descricao,
      ofi.status,
      ofi.due_date,
      ofi.service_date,
      ofi.created_date,
      round(ofi.valor_em_aberto, 2) as valor_aberto,
      case
        when ofi.due_date < v_today then 1
        when ofi.due_date = v_today then 2
        else 3
      end as priority_rank,
      ofi.metadata
    from public.obrigacao_financeira ofi
    where ofi.carteira_conta_id = p_carteira_conta_id
      and ofi.status in ('aberta', 'parcial', 'vencida')
      and ofi.valor_em_aberto > 0

    union all

    select
      'preview'::text as item_kind,
      null::text as item_id,
      coalesce(nullif(trim(item.value ->> 'source_key'), ''), 'preview|' || row_number() over ()) as source_key,
      coalesce(item.value ->> 'descricao', 'Item do orçamento') as descricao,
      'preview'::text as status,
      coalesce((item.value ->> 'due_date')::date, (item.value ->> 'service_date')::date, v_today) as due_date,
      coalesce((item.value ->> 'service_date')::date, (item.value ->> 'due_date')::date, v_today) as service_date,
      now() as created_date,
      round(coalesce((item.value ->> 'valor_final')::numeric, (item.value ->> 'valor_original')::numeric, 0), 2) as valor_aberto,
      case
        when coalesce((item.value ->> 'due_date')::date, (item.value ->> 'service_date')::date, v_today) < v_today then 1
        when coalesce((item.value ->> 'due_date')::date, (item.value ->> 'service_date')::date, v_today) = v_today then 2
        else 3
      end as priority_rank,
      coalesce(item.value -> 'metadata', '{}'::jsonb) as metadata
    from jsonb_array_elements(coalesce(p_preview_items, '[]'::jsonb)) as item(value)
  )
  select
    count(*) filter (where item_kind = 'existing'),
    count(*) filter (where item_kind = 'preview')
    into v_obrigacoes_count, v_preview_count
  from candidate_rows;

  for v_candidate in
    with candidate_rows as (
      select
        'existing'::text as item_kind,
        ofi.id as item_id,
        ofi.source_key,
        ofi.descricao,
        ofi.status,
        ofi.due_date,
        ofi.service_date,
        ofi.created_date,
        round(ofi.valor_em_aberto, 2) as valor_aberto,
        case
          when ofi.due_date < v_today then 1
          when ofi.due_date = v_today then 2
          else 3
        end as priority_rank,
        ofi.metadata
      from public.obrigacao_financeira ofi
      where ofi.carteira_conta_id = p_carteira_conta_id
        and ofi.status in ('aberta', 'parcial', 'vencida')
        and ofi.valor_em_aberto > 0

      union all

      select
        'preview'::text as item_kind,
        null::text as item_id,
        coalesce(nullif(trim(item.value ->> 'source_key'), ''), 'preview|' || row_number() over ()) as source_key,
        coalesce(item.value ->> 'descricao', 'Item do orçamento') as descricao,
        'preview'::text as status,
        coalesce((item.value ->> 'due_date')::date, (item.value ->> 'service_date')::date, v_today) as due_date,
        coalesce((item.value ->> 'service_date')::date, (item.value ->> 'due_date')::date, v_today) as service_date,
        now() as created_date,
        round(coalesce((item.value ->> 'valor_final')::numeric, (item.value ->> 'valor_original')::numeric, 0), 2) as valor_aberto,
        case
          when coalesce((item.value ->> 'due_date')::date, (item.value ->> 'service_date')::date, v_today) < v_today then 1
          when coalesce((item.value ->> 'due_date')::date, (item.value ->> 'service_date')::date, v_today) = v_today then 2
          else 3
        end as priority_rank,
        coalesce(item.value -> 'metadata', '{}'::jsonb) as metadata
      from jsonb_array_elements(coalesce(p_preview_items, '[]'::jsonb)) as item(value)
    )
    select *
    from candidate_rows
    where valor_aberto > 0
    order by
      priority_rank asc,
      due_date asc,
      service_date asc,
      created_date asc,
      source_key asc
  loop
    v_allocated := round(least(v_candidate.valor_aberto, v_remaining_usage), 2);
    v_remaining_usage := round(greatest(v_remaining_usage - v_allocated, 0), 2);

    if v_candidate.item_kind = 'preview' then
      v_budget_covered := round(v_budget_covered + v_allocated, 2);
    end if;

    if v_allocated > 0 then
      v_allocation_count := v_allocation_count + 1;
    end if;

    v_allocations := v_allocations || jsonb_build_array(
      jsonb_build_object(
        'kind', v_candidate.item_kind,
        'item_id', v_candidate.item_id,
        'source_key', v_candidate.source_key,
        'descricao', v_candidate.descricao,
        'status', v_candidate.status,
        'due_date', v_candidate.due_date,
        'service_date', v_candidate.service_date,
        'priority_rank', v_candidate.priority_rank,
        'valor_aberto', round(v_candidate.valor_aberto, 2),
        'valor_alocado', v_allocated,
        'valor_restante_item', round(v_candidate.valor_aberto - v_allocated, 2),
        'metadata', coalesce(v_candidate.metadata, '{}'::jsonb)
      )
    );
  end loop;

  return query
  select
    v_carteira_conta.id,
    round(coalesce(v_carteira_conta.saldo_atual, 0), 2),
    v_positive_balance,
    v_budget_total,
    v_requested_usage,
    v_applicable_usage,
    round(least(v_budget_covered, v_budget_total), 2),
    round(greatest(v_budget_total - v_budget_covered, 0), 2),
    v_obrigacoes_count,
    v_preview_count,
    v_allocation_count,
    round(coalesce(v_carteira_conta.saldo_atual, 0) - v_applicable_usage, 2),
    round(greatest(v_budget_total - v_budget_covered, 0), 2) > 0,
    v_allocations;
end;
$$;

drop function if exists public.finance_register_budget_authorization(text, text, text, date, text, jsonb);

create or replace function public.finance_register_budget_authorization(
  p_carteira_conta_id text,
  p_orcamento_id text,
  p_motivo text,
  p_vencimento_novo date,
  p_usuario_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  autorizacao_financeira_id text,
  carteira_conta_id text,
  orcamento_id text,
  source_key text,
  reused boolean
)
language plpgsql
as $$
declare
  v_carteira_conta public.carteira_conta%rowtype;
  v_existing public.autorizacao_financeira%rowtype;
  v_source_key text;
  v_inserted_row public.autorizacao_financeira%rowtype;
begin
  if coalesce(trim(p_carteira_conta_id), '') = '' then
    raise exception 'p_carteira_conta_id e obrigatorio.';
  end if;

  if coalesce(trim(p_orcamento_id), '') = '' then
    raise exception 'p_orcamento_id e obrigatorio.';
  end if;

  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'p_motivo e obrigatorio.';
  end if;

  if p_vencimento_novo is null then
    raise exception 'p_vencimento_novo e obrigatorio.';
  end if;

  select *
    into v_carteira_conta
  from public.carteira_conta
  where id = p_carteira_conta_id
  for update;

  if not found then
    raise exception 'carteira_conta % nao encontrada.', p_carteira_conta_id;
  end if;

  if not public.finance_get_feature_flag('finance.budget_authorization_enabled', v_carteira_conta.empresa_id) then
    raise exception 'Feature flag finance.budget_authorization_enabled esta desligada para a empresa %.', v_carteira_conta.empresa_id;
  end if;

  if not public.finance_get_feature_flag('finance.allow_negative_wallet_with_authorization', v_carteira_conta.empresa_id) then
    raise exception 'Feature flag finance.allow_negative_wallet_with_authorization esta desligada para a empresa %.', v_carteira_conta.empresa_id;
  end if;

  v_source_key := 'budget_authorization|orcamento|' || p_orcamento_id || '|carteira_conta|' || p_carteira_conta_id;

  select *
    into v_existing
  from public.autorizacao_financeira af
  where af.empresa_id = v_carteira_conta.empresa_id
    and af.source_key = v_source_key
  limit 1;

  if found then
    return query
    select
      v_existing.id,
      v_existing.carteira_conta_id,
      v_existing.orcamento_id,
      v_source_key,
      true;
    return;
  end if;

  insert into public.autorizacao_financeira (
    empresa_id,
    carteira_conta_id,
    orcamento_id,
    tipo,
    motivo,
    vencimento_novo,
    status,
    usuario_id,
    source_key,
    metadata
  )
  values (
    v_carteira_conta.empresa_id,
    p_carteira_conta_id,
    p_orcamento_id,
    'liberacao_sem_pagamento',
    trim(p_motivo),
    p_vencimento_novo,
    'ativa',
    p_usuario_id,
    v_source_key,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'source', 'sprint4_budget_authorization',
      'created_by', coalesce(p_usuario_id, ''),
      'vencimento_novo', p_vencimento_novo
    )
  )
  returning *
    into v_inserted_row;

  autorizacao_financeira_id := v_inserted_row.id;
  carteira_conta_id := v_inserted_row.carteira_conta_id;
  orcamento_id := v_inserted_row.orcamento_id;
  source_key := v_source_key;
  reused := false;
  return next;
end;
$$;

drop function if exists public.finance_approve_budget_with_authorization(text, text, text, date, text, jsonb);

create or replace function public.finance_approve_budget_with_authorization(
  p_orcamento_id text,
  p_carteira_conta_id text,
  p_motivo text,
  p_vencimento_novo date,
  p_usuario_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  orcamento_id text,
  orcamento_status text,
  autorizacao_financeira_id text,
  authorization_source_key text,
  authorization_reused boolean
)
language plpgsql
as $$
declare
  v_orcamento public.orcamento%rowtype;
  v_carteira_conta public.carteira_conta%rowtype;
  v_authorization record;
begin
  if coalesce(trim(p_orcamento_id), '') = '' then
    raise exception 'p_orcamento_id e obrigatorio.';
  end if;

  if coalesce(trim(p_carteira_conta_id), '') = '' then
    raise exception 'p_carteira_conta_id e obrigatorio.';
  end if;

  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'p_motivo e obrigatorio.';
  end if;

  if p_vencimento_novo is null then
    raise exception 'p_vencimento_novo e obrigatorio.';
  end if;

  select *
    into v_orcamento
  from public.orcamento
  where id = p_orcamento_id
  for update;

  if not found then
    raise exception 'orcamento % nao encontrado.', p_orcamento_id;
  end if;

  select *
    into v_carteira_conta
  from public.carteira_conta
  where id = p_carteira_conta_id
  for update;

  if not found then
    raise exception 'carteira_conta % nao encontrada.', p_carteira_conta_id;
  end if;

  if v_orcamento.cliente_id is distinct from v_carteira_conta.carteira_id then
    raise exception 'A carteira_conta % nao corresponde ao cliente financeiro do orçamento %.', p_carteira_conta_id, p_orcamento_id;
  end if;

  if not public.finance_get_feature_flag('finance.budget_authorization_enabled', v_carteira_conta.empresa_id) then
    raise exception 'Feature flag finance.budget_authorization_enabled esta desligada para a empresa %.', v_carteira_conta.empresa_id;
  end if;

  if not public.finance_get_feature_flag('finance.allow_negative_wallet_with_authorization', v_carteira_conta.empresa_id) then
    raise exception 'Feature flag finance.allow_negative_wallet_with_authorization esta desligada para a empresa %.', v_carteira_conta.empresa_id;
  end if;

  select *
    into v_authorization
  from public.finance_register_budget_authorization(
    p_carteira_conta_id := p_carteira_conta_id,
    p_orcamento_id := p_orcamento_id,
    p_motivo := p_motivo,
    p_vencimento_novo := p_vencimento_novo,
    p_usuario_id := p_usuario_id,
    p_metadata := coalesce(p_metadata, '{}'::jsonb)
  );

  update public.orcamento
  set
    status = 'aprovado',
    updated_date = now()
  where id = p_orcamento_id;

  return query
  select
    p_orcamento_id,
    'aprovado'::text,
    v_authorization.autorizacao_financeira_id,
    v_authorization.source_key,
    v_authorization.reused;
end;
$$;

select public.finance_ensure_wallet_budget_feature_flags();
