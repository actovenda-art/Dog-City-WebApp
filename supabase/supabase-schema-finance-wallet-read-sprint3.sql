-- Sprint 3 - Carteira e movimentacoes com leitura controlada
-- Objetivo:
-- 1. Liberar leitura administrativa controlada da carteira
-- 2. Liberar movimentos manuais controlados via RPC
-- 3. Manter fluxo principal legado intacto

create extension if not exists pgcrypto;

alter table if exists public.carteira_movimento
  drop constraint if exists chk_carteira_movimento_tipo;

alter table if exists public.carteira_movimento
  add constraint chk_carteira_movimento_tipo
  check (
    tipo in (
      'credito','debito','estorno','ajuste','compensacao',
      'multa','consumo','credito_manual','credito_compensatorio',
      'ajuste_manual','estorno_manual','entrada_direcionada'
    )
  );

create index if not exists idx_carteira_movimento_tipo_origem
  on public.carteira_movimento(carteira_conta_id, tipo, origem, created_date desc);

drop function if exists public.finance_ensure_wallet_read_feature_flags();

create or replace function public.finance_ensure_wallet_read_feature_flags()
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
    where cfg.key = 'finance.wallet_balance_read_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.wallet_balance_read_enabled',
      'Finance - Wallet Balance Read Enabled',
      'Habilita a leitura administrativa controlada de saldo da carteira.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if not exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.wallet_movements_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.wallet_movements_enabled',
      'Finance - Wallet Movements Enabled',
      'Habilita movimentos controlados e leitura administrativa do razao da carteira.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if not exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.wallet_manual_adjustments_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.wallet_manual_adjustments_enabled',
      'Finance - Wallet Manual Adjustments Enabled',
      'Habilita creditos, ajustes e estornos manuais controlados na carteira.',
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
        where cfg.key = 'finance.wallet_balance_read_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.wallet_balance_read_enabled',
          'Finance - Wallet Balance Read Enabled',
          'Habilita a leitura administrativa controlada de saldo da carteira.',
          jsonb_build_object('enabled', false),
          true,
          v_empresa.id
        );
      end if;

      if not exists (
        select 1 from public.app_config cfg
        where cfg.key = 'finance.wallet_movements_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.wallet_movements_enabled',
          'Finance - Wallet Movements Enabled',
          'Habilita movimentos controlados e leitura administrativa do razao da carteira.',
          jsonb_build_object('enabled', false),
          true,
          v_empresa.id
        );
      end if;

      if not exists (
        select 1 from public.app_config cfg
        where cfg.key = 'finance.wallet_manual_adjustments_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.wallet_manual_adjustments_enabled',
          'Finance - Wallet Manual Adjustments Enabled',
          'Habilita creditos, ajustes e estornos manuais controlados na carteira.',
          jsonb_build_object('enabled', false),
          true,
          v_empresa.id
        );
      end if;
    end loop;
  end if;

  return query
  select cfg.key, cfg.empresa_id, coalesce((cfg.value ->> 'enabled')::boolean, false) as enabled
  from public.app_config cfg
  where cfg.key in (
    'finance.wallet_balance_read_enabled',
    'finance.wallet_movements_enabled',
    'finance.wallet_manual_adjustments_enabled'
  )
  order by cfg.key, cfg.empresa_id nulls first;
end;
$$;

drop function if exists public.finance_wallet_admin_apply_operation(
  text, text, text, text, numeric, text, text, text, text, text, text, jsonb
);

create or replace function public.finance_wallet_admin_apply_operation(
  p_carteira_conta_id text,
  p_operacao_idempotencia text,
  p_tipo text,
  p_natureza text,
  p_valor numeric,
  p_referencia_amigavel text,
  p_motivo text,
  p_observacao text default null,
  p_origem text default 'admin_manual',
  p_transacao_id text default null,
  p_usuario_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  movimento_id text,
  carteira_conta_id text,
  saldo_anterior numeric,
  saldo_final numeric,
  reused boolean
)
language plpgsql
as $$
declare
  v_carteira_conta public.carteira_conta%rowtype;
  v_effective_metadata jsonb;
begin
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'motivo e obrigatorio.';
  end if;

  if p_tipo not in ('credito_manual', 'ajuste_manual', 'estorno_manual', 'entrada_direcionada') then
    raise exception 'tipo administrativo nao suportado na Sprint 3: %', p_tipo;
  end if;

  select *
    into v_carteira_conta
  from public.carteira_conta
  where id = p_carteira_conta_id;

  if not found then
    raise exception 'carteira_conta % nao encontrada.', p_carteira_conta_id;
  end if;

  if p_tipo = 'entrada_direcionada' then
    if p_natureza <> 'entrada' then
      raise exception 'entrada_direcionada deve usar natureza entrada.';
    end if;

    if not public.finance_get_feature_flag('finance.wallet_movements_enabled', v_carteira_conta.empresa_id) then
      raise exception 'Feature flag finance.wallet_movements_enabled esta desligada para a empresa %.', v_carteira_conta.empresa_id;
    end if;
  else
    if not public.finance_get_feature_flag('finance.wallet_manual_adjustments_enabled', v_carteira_conta.empresa_id) then
      raise exception 'Feature flag finance.wallet_manual_adjustments_enabled esta desligada para a empresa %.', v_carteira_conta.empresa_id;
    end if;

    if p_tipo = 'credito_manual' and p_natureza <> 'entrada' then
      raise exception 'credito_manual deve usar natureza entrada.';
    end if;

    if p_tipo in ('ajuste_manual', 'estorno_manual') and p_natureza not in ('entrada', 'saida') then
      raise exception 'natureza invalida para %: %', p_tipo, p_natureza;
    end if;
  end if;

  v_effective_metadata := coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'motivo', trim(p_motivo),
      'observacao', nullif(trim(coalesce(p_observacao, '')), ''),
      'admin_scope', 'sprint3_controlled_read'
    );

  return query
  select *
  from public.finance_apply_wallet_operation(
    p_carteira_conta_id := p_carteira_conta_id,
    p_operacao_idempotencia := p_operacao_idempotencia,
    p_tipo := p_tipo,
    p_natureza := p_natureza,
    p_origem := coalesce(nullif(trim(p_origem), ''), 'admin_manual'),
    p_valor := p_valor,
    p_referencia_amigavel := p_referencia_amigavel,
    p_descricao := coalesce(nullif(trim(coalesce(p_observacao, '')), ''), trim(p_motivo)),
    p_orcamento_id := null,
    p_appointment_id := null,
    p_obrigacao_id := null,
    p_transacao_id := p_transacao_id,
    p_autorizacao_financeira_id := null,
    p_usuario_id := p_usuario_id,
    p_metadata := v_effective_metadata,
    p_permitir_saldo_negativo := true
  );
end;
$$;

drop function if exists public.finance_wallet_admin_read_accounts(text);

create or replace function public.finance_wallet_admin_read_accounts(
  p_empresa_id text
)
returns table (
  carteira_conta_id text,
  carteira_id text,
  empresa_id text,
  carteira_codigo text,
  carteira_nome text,
  saldo_atual numeric,
  movimento_count bigint,
  ultimo_movimento_em timestamptz,
  ultima_reconciliacao_em timestamptz,
  latest_reconciliation_status text,
  latest_reconciliation_diff numeric,
  latest_reconciliation_id text
)
language plpgsql
stable
as $$
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio para leitura administrativa da carteira.';
  end if;

  if not (
    public.finance_get_feature_flag('finance.wallet_balance_read_enabled', p_empresa_id)
    or public.finance_get_feature_flag('finance.wallet_movements_enabled', p_empresa_id)
  ) then
    raise exception 'Leitura administrativa da carteira desligada para a empresa %.', p_empresa_id;
  end if;

  return query
  with movement_counts as (
    select
      cm.carteira_conta_id,
      count(*) as movement_count
    from public.carteira_movimento cm
    group by cm.carteira_conta_id
  ),
  latest_reconciliation as (
    select distinct on (cr.carteira_conta_id)
      cr.carteira_conta_id,
      cr.id,
      cr.status,
      cr.diferenca
    from public.carteira_reconciliacao cr
    order by cr.carteira_conta_id, cr.created_date desc, cr.id desc
  )
  select
    cc.id as carteira_conta_id,
    c.id as carteira_id,
    cc.empresa_id,
    c.codigo as carteira_codigo,
    coalesce(nullif(c.nome_razao_social, ''), c.id) as carteira_nome,
    cc.saldo_atual,
    coalesce(mc.movement_count, 0) as movimento_count,
    cc.ultimo_movimento_em,
    cc.ultima_reconciliacao_em,
    lr.status as latest_reconciliation_status,
    lr.diferenca as latest_reconciliation_diff,
    lr.id as latest_reconciliation_id
  from public.carteira_conta cc
  inner join public.carteira c on c.id = cc.carteira_id
  left join movement_counts mc on mc.carteira_conta_id = cc.id
  left join latest_reconciliation lr on lr.carteira_conta_id = cc.id
  where cc.empresa_id = p_empresa_id
  order by
    coalesce(cc.ultimo_movimento_em, cc.updated_date, cc.created_date) desc,
    coalesce(nullif(c.nome_razao_social, ''), c.id) asc;
end;
$$;

drop function if exists public.finance_wallet_admin_read_movements(text, text, integer);

create or replace function public.finance_wallet_admin_read_movements(
  p_empresa_id text,
  p_carteira_conta_id text default null,
  p_limit integer default 20
)
returns table (
  movimento_id text,
  carteira_conta_id text,
  carteira_id text,
  empresa_id text,
  carteira_nome text,
  tipo text,
  natureza text,
  origem text,
  valor numeric,
  referencia_amigavel text,
  descricao text,
  saldo_anterior numeric,
  saldo_final numeric,
  transacao_id text,
  usuario_id text,
  created_date timestamptz
)
language plpgsql
stable
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio para leitura administrativa dos movimentos da carteira.';
  end if;

  if not public.finance_get_feature_flag('finance.wallet_movements_enabled', p_empresa_id) then
    raise exception 'Feature flag finance.wallet_movements_enabled esta desligada para a empresa %.', p_empresa_id;
  end if;

  return query
  select
    cm.id as movimento_id,
    cm.carteira_conta_id,
    cc.carteira_id,
    cm.empresa_id,
    coalesce(nullif(c.nome_razao_social, ''), c.id) as carteira_nome,
    cm.tipo,
    cm.natureza,
    cm.origem,
    cm.valor,
    cm.referencia_amigavel,
    cm.descricao,
    cm.saldo_anterior,
    cm.saldo_final,
    cm.transacao_id,
    cm.usuario_id,
    cm.created_date
  from public.carteira_movimento cm
  inner join public.carteira_conta cc on cc.id = cm.carteira_conta_id
  inner join public.carteira c on c.id = cc.carteira_id
  where cm.empresa_id = p_empresa_id
    and (p_carteira_conta_id is null or cm.carteira_conta_id = p_carteira_conta_id)
  order by cm.created_date desc, cm.id desc
  limit v_limit;
end;
$$;

drop function if exists public.finance_wallet_admin_audit_accounts(text);

create or replace function public.finance_wallet_admin_audit_accounts(
  p_empresa_id text
)
returns table (
  carteira_conta_id text,
  carteira_id text,
  carteira_nome text,
  saldo_persistido numeric,
  saldo_por_ultimo_movimento numeric,
  saldo_por_soma numeric,
  diferenca_ultimo numeric,
  diferenca_soma numeric,
  status text
)
language plpgsql
stable
as $$
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio para auditoria administrativa da carteira.';
  end if;

  if not public.finance_get_feature_flag('finance.wallet_balance_read_enabled', p_empresa_id) then
    raise exception 'Feature flag finance.wallet_balance_read_enabled esta desligada para a empresa %.', p_empresa_id;
  end if;

  return query
  with latest_balance as (
    select distinct on (cm.carteira_conta_id)
      cm.carteira_conta_id,
      cm.saldo_final
    from public.carteira_movimento cm
    order by cm.carteira_conta_id, cm.created_date desc, cm.id desc
  ),
  summed_balance as (
    select
      cm.carteira_conta_id,
      round(coalesce(sum(
        case
          when cm.natureza = 'entrada' then cm.valor
          else -cm.valor
        end
      ), 0), 2) as saldo_por_soma
    from public.carteira_movimento cm
    group by cm.carteira_conta_id
  )
  select
    cc.id as carteira_conta_id,
    c.id as carteira_id,
    coalesce(nullif(c.nome_razao_social, ''), c.id) as carteira_nome,
    round(cc.saldo_atual, 2) as saldo_persistido,
    round(coalesce(lb.saldo_final, 0), 2) as saldo_por_ultimo_movimento,
    round(coalesce(sb.saldo_por_soma, 0), 2) as saldo_por_soma,
    round(cc.saldo_atual - coalesce(lb.saldo_final, 0), 2) as diferenca_ultimo,
    round(cc.saldo_atual - coalesce(sb.saldo_por_soma, 0), 2) as diferenca_soma,
    case
      when round(cc.saldo_atual, 2) = round(coalesce(sb.saldo_por_soma, 0), 2)
        then 'ok'
      else 'divergente'
    end as status
  from public.carteira_conta cc
  inner join public.carteira c on c.id = cc.carteira_id
  left join latest_balance lb on lb.carteira_conta_id = cc.id
  left join summed_balance sb on sb.carteira_conta_id = cc.id
  where cc.empresa_id = p_empresa_id
  order by
    case
      when round(cc.saldo_atual, 2) = round(coalesce(sb.saldo_por_soma, 0), 2)
        then 1
      else 0
    end asc,
    coalesce(nullif(c.nome_razao_social, ''), c.id) asc;
end;
$$;

drop function if exists public.finance_reconcile_wallet_account(text, text);

create or replace function public.finance_reconcile_wallet_account(
  p_carteira_conta_id text,
  p_usuario_id text default null
)
returns table (
  out_carteira_conta_id text,
  out_saldo_persistido numeric,
  out_saldo_recalculado numeric,
  out_diferenca numeric,
  out_status text,
  out_reconciliacao_id text
)
language plpgsql
as $$
declare
  v_carteira_conta public.carteira_conta%rowtype;
  v_last_balance numeric(14,2);
  v_sum_balance numeric(14,2);
  v_reconciliacao_id text;
  v_status text;
begin
  select *
    into v_carteira_conta
  from public.carteira_conta
  where id = p_carteira_conta_id
  for update;

  if not found then
    raise exception 'carteira_conta % nao encontrada.', p_carteira_conta_id;
  end if;

  select saldo_final
    into v_last_balance
  from public.carteira_movimento cm
  where cm.carteira_conta_id = v_carteira_conta.id
  order by cm.created_date desc, cm.id desc
  limit 1;

  select coalesce(sum(
    case
      when natureza = 'entrada' then valor
      else -valor
    end
  ), 0)
    into v_sum_balance
  from public.carteira_movimento cm
  where cm.carteira_conta_id = v_carteira_conta.id;

  v_last_balance := coalesce(v_last_balance, 0);
  v_status := case
    when round(v_carteira_conta.saldo_atual, 2) = round(v_sum_balance, 2)
      then 'ok'
    else 'divergente'
  end;

  insert into public.carteira_reconciliacao (
    empresa_id,
    carteira_conta_id,
    saldo_persistido,
    saldo_recalculado,
    diferenca,
    status,
    acao_tomada,
    usuario_id,
    metadata
  )
  values (
    v_carteira_conta.empresa_id,
    v_carteira_conta.id,
    round(v_carteira_conta.saldo_atual, 2),
    round(v_sum_balance, 2),
    round(v_carteira_conta.saldo_atual - v_sum_balance, 2),
    v_status,
    null,
    p_usuario_id,
    jsonb_build_object(
      'saldo_por_soma', round(v_sum_balance, 2),
      'saldo_por_ultimo_movimento', round(v_last_balance, 2)
    )
  )
  returning id into v_reconciliacao_id;

  update public.carteira_conta
  set ultima_reconciliacao_em = now()
  where id = v_carteira_conta.id;

  out_carteira_conta_id := v_carteira_conta.id;
  out_saldo_persistido := round(v_carteira_conta.saldo_atual, 2);
  out_saldo_recalculado := round(v_sum_balance, 2);
  out_diferenca := round(v_carteira_conta.saldo_atual - v_sum_balance, 2);
  out_status := v_status;
  out_reconciliacao_id := v_reconciliacao_id;
  return next;
end;
$$;

select public.finance_ensure_wallet_read_feature_flags();
