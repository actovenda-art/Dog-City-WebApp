-- Sprint 7 - Comissao por venda quitada
-- Objetivo:
-- 1. Registrar eventos auditaveis de comissao apenas quando a obrigacao ficar quitada
-- 2. Persistir vendedor e percentual de comissao em orcamento/plano/pacote
-- 3. Manter idempotencia explicita por source_key, sem duplicidade

create extension if not exists pgcrypto;

alter table if exists public.orcamento
  add column if not exists commission_percentual numeric(7,4) not null default 0;

alter table if exists public.plan_config
  add column if not exists vendedor_user_id text null,
  add column if not exists commission_percentual numeric(7,4) not null default 0;

alter table if exists public.recurring_packages
  add column if not exists vendedor_user_id text null,
  add column if not exists commission_percentual numeric(7,4) not null default 0;

create index if not exists idx_plan_config_vendedor_user_id
  on public.plan_config(vendedor_user_id);

create index if not exists idx_recurring_packages_vendedor_user_id
  on public.recurring_packages(vendedor_user_id);

create table if not exists public.comissao_evento (
  id text primary key default gen_random_uuid()::text,
  empresa_id text not null,
  vendedor_user_id text not null,
  orcamento_id text null references public.orcamento(id) on delete set null,
  plan_config_id text null references public.plan_config(id) on delete set null,
  recurring_package_id text null references public.recurring_packages(id) on delete set null,
  obrigacao_id text null references public.obrigacao_financeira(id) on delete set null,
  cobranca_financeira_id text null references public.cobranca_financeira(id) on delete set null,
  carteira_movimento_id text null references public.carteira_movimento(id) on delete set null,
  produto_servico text null,
  origem text not null,
  percentual numeric(7,4) not null default 0,
  valor_base numeric(14,2) not null default 0,
  valor_comissao numeric(14,2) not null default 0,
  valor_estornado numeric(14,2) not null default 0,
  status text not null default 'concedida',
  source_key text not null,
  lock_version integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  data_venda timestamptz null,
  data_pagamento timestamptz null,
  data_comissao timestamptz not null default now(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  constraint uq_comissao_evento_source_key unique (empresa_id, source_key),
  constraint chk_comissao_evento_status
    check (status in ('pendente','concedida','cancelada','estornada','parcialmente_estornada')),
  constraint chk_comissao_evento_percentual
    check (percentual >= 0 and percentual <= 100),
  constraint chk_comissao_evento_valores
    check (
      valor_base >= 0
      and valor_comissao >= 0
      and valor_estornado >= 0
    )
);

create index if not exists idx_comissao_evento_empresa_vendedor
  on public.comissao_evento(empresa_id, vendedor_user_id, data_pagamento desc, created_date desc);

create index if not exists idx_comissao_evento_obrigacao
  on public.comissao_evento(obrigacao_id);

drop trigger if exists trg_comissao_evento_before_update on public.comissao_evento;
create trigger trg_comissao_evento_before_update
before update on public.comissao_evento
for each row
execute function public.finance_before_update_versioned_row();

drop function if exists public.finance_ensure_commission_feature_flags();

create or replace function public.finance_ensure_commission_feature_flags()
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
    where cfg.key = 'finance.commission_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.commission_enabled',
      'Finance - Commission Enabled',
      'Habilita o motor de comissão por venda quitada.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if not exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.commission_visualization_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.commission_visualization_enabled',
      'Finance - Commission Visualization Enabled',
      'Habilita a leitura administrativa dos eventos de comissão.',
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
        where cfg.key = 'finance.commission_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.commission_enabled',
          'Finance - Commission Enabled',
          'Habilita o motor de comissão por venda quitada.',
          jsonb_build_object('enabled', false),
          true,
          v_empresa.id
        );
      end if;

      if not exists (
        select 1 from public.app_config cfg
        where cfg.key = 'finance.commission_visualization_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.commission_visualization_enabled',
          'Finance - Commission Visualization Enabled',
          'Habilita a leitura administrativa dos eventos de comissão.',
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
    'finance.commission_enabled',
    'finance.commission_visualization_enabled'
  )
  order by cfg.key, cfg.empresa_id nulls first;
end;
$$;

drop function if exists public.finance_process_commission_for_obrigacao(text, timestamptz, text, jsonb);

create or replace function public.finance_process_commission_for_obrigacao(
  p_obrigacao_id text,
  p_data_pagamento timestamptz default now(),
  p_usuario_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  comissao_evento_id text,
  obrigacao_id text,
  source_key text,
  reused boolean,
  skipped boolean,
  skip_reason text,
  vendedor_user_id text,
  valor_base numeric,
  valor_comissao numeric,
  status text
)
language plpgsql
as $$
declare
  v_obrigacao public.obrigacao_financeira%rowtype;
  v_orcamento public.orcamento%rowtype;
  v_recurring_package public.recurring_packages%rowtype;
  v_plan public.plan_config%rowtype;
  v_existing public.comissao_evento%rowtype;
  v_vendedor_user_id text;
  v_percentual numeric(7,4);
  v_source_key text;
  v_valor_base numeric(14,2);
  v_valor_comissao numeric(14,2);
  v_origem text;
  v_produto_servico text;
  v_plan_id text;
begin
  if coalesce(trim(p_obrigacao_id), '') = '' then
    raise exception 'p_obrigacao_id e obrigatorio.';
  end if;

  select *
  into v_obrigacao
  from public.obrigacao_financeira ofn
  where ofn.id = p_obrigacao_id
  for update;

  if not found then
    raise exception 'obrigacao_financeira % nao encontrada.', p_obrigacao_id;
  end if;

  if not public.finance_get_feature_flag('finance.commission_enabled', v_obrigacao.empresa_id) then
    raise exception 'Feature flag finance.commission_enabled esta desligada para a empresa %.', v_obrigacao.empresa_id;
  end if;

  select * into v_orcamento
  from public.orcamento o
  where o.id = v_obrigacao.orcamento_id;

  select * into v_recurring_package
  from public.recurring_packages rp
  where rp.id = v_obrigacao.recurring_package_id;

  v_plan_id := v_recurring_package.metadata ->> 'plan_config_id';

  if coalesce(trim(v_plan_id), '') <> '' then
    select * into v_plan
    from public.plan_config pc
    where pc.id = v_plan_id;
  end if;

  v_vendedor_user_id := coalesce(
    nullif(trim(v_orcamento.vendedor_user_id), ''),
    nullif(trim(v_recurring_package.vendedor_user_id), ''),
    nullif(trim(v_plan.vendedor_user_id), '')
  );

  v_percentual := coalesce(
    v_orcamento.commission_percentual,
    v_recurring_package.commission_percentual,
    v_plan.commission_percentual,
    0
  );

  v_source_key := 'commission|obrigacao|' || v_obrigacao.id || '|seller|' || coalesce(v_vendedor_user_id, 'missing') || '|grant';
  v_valor_base := round(coalesce(v_obrigacao.valor_final, 0)::numeric, 2);

  if v_obrigacao.status <> 'quitada' then
    return query
    select null::text, v_obrigacao.id, v_source_key, false, true, 'obligation_not_paid', v_vendedor_user_id, v_valor_base, 0::numeric, null::text;
    return;
  end if;

  if coalesce(trim(v_vendedor_user_id), '') = '' then
    return query
    select null::text, v_obrigacao.id, v_source_key, false, true, 'seller_missing', null::text, v_valor_base, 0::numeric, null::text;
    return;
  end if;

  if coalesce(v_percentual, 0) <= 0 then
    return query
    select null::text, v_obrigacao.id, v_source_key, false, true, 'commission_percent_missing', v_vendedor_user_id, v_valor_base, 0::numeric, null::text;
    return;
  end if;

  select *
  into v_existing
  from public.comissao_evento ce
  where ce.empresa_id = v_obrigacao.empresa_id
    and ce.source_key = v_source_key
  for update;

  if found then
    return query
    select v_existing.id, v_obrigacao.id, v_source_key, true, false, null::text, v_existing.vendedor_user_id, v_existing.valor_base, v_existing.valor_comissao, v_existing.status;
    return;
  end if;

  v_valor_comissao := round((v_valor_base * round(v_percentual, 4)) / 100.0, 2);
  v_origem := case
    when v_obrigacao.orcamento_id is not null then 'orcamento'
    when v_obrigacao.recurring_package_id is not null then 'recurring_package'
    else 'obrigacao'
  end;
  v_produto_servico := coalesce(v_obrigacao.descricao, v_obrigacao.tipo_item, v_recurring_package.service_id, v_plan.service, 'servico');

  insert into public.comissao_evento (
    empresa_id,
    vendedor_user_id,
    orcamento_id,
    plan_config_id,
    recurring_package_id,
    obrigacao_id,
    cobranca_financeira_id,
    carteira_movimento_id,
    produto_servico,
    origem,
    percentual,
    valor_base,
    valor_comissao,
    valor_estornado,
    status,
    source_key,
    metadata,
    data_venda,
    data_pagamento,
    data_comissao
  )
  values (
    v_obrigacao.empresa_id,
    v_vendedor_user_id,
    v_obrigacao.orcamento_id,
    v_plan.id,
    v_obrigacao.recurring_package_id,
    v_obrigacao.id,
    null,
    null,
    v_produto_servico,
    v_origem,
    round(v_percentual, 4),
    v_valor_base,
    v_valor_comissao,
    0,
    'concedida',
    v_source_key,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'finance_scope', 'sprint7_commission',
      'obrigacao_source_key', v_obrigacao.source_key
    ),
    coalesce(v_orcamento.created_date, v_recurring_package.created_at, v_plan.created_date, v_obrigacao.created_date, now()),
    coalesce(p_data_pagamento, now()),
    now()
  )
  returning
    public.comissao_evento.id,
    public.comissao_evento.obrigacao_id,
    public.comissao_evento.source_key,
    public.comissao_evento.vendedor_user_id,
    public.comissao_evento.valor_base,
    public.comissao_evento.valor_comissao,
    public.comissao_evento.status
  into
    comissao_evento_id,
    obrigacao_id,
    source_key,
    vendedor_user_id,
    valor_base,
    valor_comissao,
    status;

  reused := false;
  skipped := false;
  skip_reason := null;
  return next;
end;
$$;

drop function if exists public.finance_process_commission_for_orcamento(text, timestamptz, text, jsonb);

create or replace function public.finance_process_commission_for_orcamento(
  p_orcamento_id text,
  p_data_pagamento timestamptz default now(),
  p_usuario_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  comissao_evento_id text,
  obrigacao_id text,
  source_key text,
  reused boolean,
  skipped boolean,
  skip_reason text,
  vendedor_user_id text,
  valor_base numeric,
  valor_comissao numeric,
  status text
)
language plpgsql
as $$
declare
  v_row record;
begin
  if coalesce(trim(p_orcamento_id), '') = '' then
    raise exception 'p_orcamento_id e obrigatorio.';
  end if;

  for v_row in
    select *
    from public.obrigacao_financeira ofn
    where ofn.orcamento_id = p_orcamento_id
    order by ofn.created_date asc, ofn.id asc
  loop
    return query
    select *
    from public.finance_process_commission_for_obrigacao(
      v_row.id,
      p_data_pagamento,
      p_usuario_id,
      p_metadata
    );
  end loop;
end;
$$;

drop function if exists public.finance_commission_read_context(text);

create or replace function public.finance_commission_read_context(
  p_empresa_id text
)
returns table (
  empresa_id text,
  commission_enabled boolean,
  commission_visualization_enabled boolean,
  events_count bigint,
  granted_count bigint,
  latest_event_created_at timestamptz
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
    public.finance_get_feature_flag('finance.commission_enabled', p_empresa_id),
    public.finance_get_feature_flag('finance.commission_visualization_enabled', p_empresa_id),
    count(*)::bigint,
    count(*) filter (where ce.status = 'concedida')::bigint,
    max(ce.created_date)
  from public.comissao_evento ce
  where ce.empresa_id = p_empresa_id;
end;
$$;

drop function if exists public.finance_commission_list(text, text, integer);

create or replace function public.finance_commission_list(
  p_empresa_id text,
  p_status text default null,
  p_limit integer default 100
)
returns table (
  id text,
  empresa_id text,
  vendedor_user_id text,
  vendedor_nome text,
  orcamento_id text,
  plan_config_id text,
  recurring_package_id text,
  obrigacao_id text,
  produto_servico text,
  origem text,
  percentual numeric,
  valor_base numeric,
  valor_comissao numeric,
  status text,
  source_key text,
  data_venda timestamptz,
  data_pagamento timestamptz,
  data_comissao timestamptz,
  created_date timestamptz
)
language plpgsql
stable
as $$
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio.';
  end if;

  if not public.finance_get_feature_flag('finance.commission_visualization_enabled', p_empresa_id) then
    raise exception 'Feature flag finance.commission_visualization_enabled esta desligada para a empresa %.', p_empresa_id;
  end if;

  return query
  select
    ce.id,
    ce.empresa_id,
    ce.vendedor_user_id,
    coalesce(sp.nome, ce.vendedor_user_id) as vendedor_nome,
    ce.orcamento_id,
    ce.plan_config_id,
    ce.recurring_package_id,
    ce.obrigacao_id,
    ce.produto_servico,
    ce.origem,
    ce.percentual,
    ce.valor_base,
    ce.valor_comissao,
    ce.status,
    ce.source_key,
    ce.data_venda,
    ce.data_pagamento,
    ce.data_comissao,
    ce.created_date
  from public.comissao_evento ce
  left join public.serviceproviders sp on sp.id = ce.vendedor_user_id
  where ce.empresa_id = p_empresa_id
    and (p_status is null or ce.status = p_status)
  order by ce.data_comissao desc, ce.created_date desc
  limit greatest(coalesce(p_limit, 100), 1);
end;
$$;

drop trigger if exists trg_obrigacao_financeira_after_commission on public.obrigacao_financeira;
drop function if exists public.finance_trigger_process_commission_for_obrigacao();

create or replace function public.finance_trigger_process_commission_for_obrigacao()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.status = 'quitada'
     and coalesce(old.status, '') <> 'quitada'
     and public.finance_get_feature_flag('finance.commission_enabled', new.empresa_id) then
    perform public.finance_process_commission_for_obrigacao(
      new.id,
      now(),
      null,
      jsonb_build_object('source', 'trigger_obrigacao_quitada')
    );
  end if;
  return new;
end;
$$;

create trigger trg_obrigacao_financeira_after_commission
after update of status on public.obrigacao_financeira
for each row
execute function public.finance_trigger_process_commission_for_obrigacao();

select * from public.finance_ensure_commission_feature_flags();
