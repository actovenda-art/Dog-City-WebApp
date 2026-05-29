-- Sprint 5 - Cancelamento V2, multas, credito manual e credito compensatorio
-- Objetivo:
-- 1. Registrar cancelamentos financeiros auditaveis
-- 2. Permitir credito manual e credito compensatorio controlados por flag
-- 3. Aplicar multas como novos movimentos, sem editar historico
-- 4. Manter o legado como fluxo principal com flags desligadas

create extension if not exists pgcrypto;

alter table if exists public.obrigacao_financeira
  add column if not exists cancelado_motivo text null;

create table if not exists public.cancelamento_financeiro (
  id text primary key default gen_random_uuid()::text,
  empresa_id text not null,
  carteira_conta_id text not null references public.carteira_conta(id),
  obrigacao_id text null references public.obrigacao_financeira(id),
  orcamento_id text null references public.orcamento(id),
  appointment_id text null references public.appointment(id),
  origem_cancelamento text not null,
  aplicar_multa boolean not null default false,
  percentual_multa numeric(7,4) not null default 0,
  valor_multa numeric(14,2) not null default 0,
  gerar_credito_compensatorio boolean not null default false,
  valor_credito_compensatorio numeric(14,2) not null default 0,
  multa_movimento_id text null references public.carteira_movimento(id),
  credito_movimento_id text null references public.carteira_movimento(id),
  source_key text null,
  status text not null default 'registrado',
  motivo text not null,
  usuario_id text null,
  lock_version integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  constraint chk_cancelamento_financeiro_origem
    check (origem_cancelamento in ('dogcity', 'cliente', 'natural')),
  constraint chk_cancelamento_financeiro_status
    check (status in ('registrado', 'processado', 'reutilizado', 'rejeitado')),
  constraint chk_cancelamento_financeiro_valores
    check (
      percentual_multa >= 0
      and valor_multa >= 0
      and valor_credito_compensatorio >= 0
    )
);

create unique index if not exists uq_cancelamento_financeiro_source_key
  on public.cancelamento_financeiro(empresa_id, source_key)
  where source_key is not null;

create index if not exists idx_cancelamento_financeiro_obrigacao
  on public.cancelamento_financeiro(obrigacao_id, created_date desc);

create index if not exists idx_cancelamento_financeiro_orcamento
  on public.cancelamento_financeiro(orcamento_id, created_date desc);

create index if not exists idx_cancelamento_financeiro_carteira
  on public.cancelamento_financeiro(carteira_conta_id, created_date desc);

drop trigger if exists trg_cancelamento_financeiro_before_update on public.cancelamento_financeiro;
create trigger trg_cancelamento_financeiro_before_update
before update on public.cancelamento_financeiro
for each row
execute function public.finance_before_update_versioned_row();

drop function if exists public.finance_ensure_wallet_cancellation_feature_flags();

create or replace function public.finance_ensure_wallet_cancellation_feature_flags()
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
    where cfg.key = 'finance.cancellation_v2_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.cancellation_v2_enabled',
      'Finance - Cancellation V2 Enabled',
      'Habilita o fluxo financeiro novo de cancelamento controlado.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if not exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.compensatory_credit_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.compensatory_credit_enabled',
      'Finance - Compensatory Credit Enabled',
      'Habilita credito compensatorio controlado e auditavel.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if not exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.manual_credit_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.manual_credit_enabled',
      'Finance - Manual Credit Enabled',
      'Habilita credito manual controlado na carteira.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if not exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.cancellation_penalty_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.cancellation_penalty_enabled',
      'Finance - Cancellation Penalty Enabled',
      'Habilita multa de cancelamento controlada e auditavel.',
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
        where cfg.key = 'finance.cancellation_v2_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.cancellation_v2_enabled',
          'Finance - Cancellation V2 Enabled',
          'Habilita o fluxo financeiro novo de cancelamento controlado.',
          jsonb_build_object('enabled', false),
          true,
          v_empresa.id
        );
      end if;

      if not exists (
        select 1 from public.app_config cfg
        where cfg.key = 'finance.compensatory_credit_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.compensatory_credit_enabled',
          'Finance - Compensatory Credit Enabled',
          'Habilita credito compensatorio controlado e auditavel.',
          jsonb_build_object('enabled', false),
          true,
          v_empresa.id
        );
      end if;

      if not exists (
        select 1 from public.app_config cfg
        where cfg.key = 'finance.manual_credit_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.manual_credit_enabled',
          'Finance - Manual Credit Enabled',
          'Habilita credito manual controlado na carteira.',
          jsonb_build_object('enabled', false),
          true,
          v_empresa.id
        );
      end if;

      if not exists (
        select 1 from public.app_config cfg
        where cfg.key = 'finance.cancellation_penalty_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.cancellation_penalty_enabled',
          'Finance - Cancellation Penalty Enabled',
          'Habilita multa de cancelamento controlada e auditavel.',
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
    'finance.cancellation_v2_enabled',
    'finance.compensatory_credit_enabled',
    'finance.manual_credit_enabled',
    'finance.cancellation_penalty_enabled'
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
  budget_authorization_enabled boolean,
  cancellation_v2_enabled boolean,
  compensatory_credit_enabled boolean,
  manual_credit_enabled boolean,
  cancellation_penalty_enabled boolean
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
    public.finance_get_feature_flag('finance.budget_authorization_enabled', p_empresa_id) as budget_authorization_enabled,
    public.finance_get_feature_flag('finance.cancellation_v2_enabled', p_empresa_id) as cancellation_v2_enabled,
    public.finance_get_feature_flag('finance.compensatory_credit_enabled', p_empresa_id) as compensatory_credit_enabled,
    public.finance_get_feature_flag('finance.manual_credit_enabled', p_empresa_id) as manual_credit_enabled,
    public.finance_get_feature_flag('finance.cancellation_penalty_enabled', p_empresa_id) as cancellation_penalty_enabled
  from public.carteira_conta cc
  left join latest_reconciliation lr on lr.carteira_conta_id = cc.id
  where cc.empresa_id = p_empresa_id
    and (p_carteira_id is null or cc.carteira_id = p_carteira_id)
  order by cc.created_date asc
  limit 1;
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
    raise exception 'tipo administrativo nao suportado: %', p_tipo;
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
  elsif p_tipo = 'credito_manual' then
    if p_natureza <> 'entrada' then
      raise exception 'credito_manual deve usar natureza entrada.';
    end if;

    if not public.finance_get_feature_flag('finance.wallet_manual_adjustments_enabled', v_carteira_conta.empresa_id) then
      raise exception 'Feature flag finance.wallet_manual_adjustments_enabled esta desligada para a empresa %.', v_carteira_conta.empresa_id;
    end if;

    if not public.finance_get_feature_flag('finance.manual_credit_enabled', v_carteira_conta.empresa_id) then
      raise exception 'Feature flag finance.manual_credit_enabled esta desligada para a empresa %.', v_carteira_conta.empresa_id;
    end if;
  else
    if not public.finance_get_feature_flag('finance.wallet_manual_adjustments_enabled', v_carteira_conta.empresa_id) then
      raise exception 'Feature flag finance.wallet_manual_adjustments_enabled esta desligada para a empresa %.', v_carteira_conta.empresa_id;
    end if;

    if p_natureza not in ('entrada', 'saida') then
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

drop function if exists public.finance_apply_compensatory_credit(
  text, text, numeric, text, text, text, text, text, text, jsonb
);

create or replace function public.finance_apply_compensatory_credit(
  p_carteira_conta_id text,
  p_operacao_idempotencia text,
  p_valor numeric,
  p_referencia_amigavel text,
  p_motivo text,
  p_orcamento_id text default null,
  p_appointment_id text default null,
  p_obrigacao_id text default null,
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
begin
  if coalesce(trim(p_carteira_conta_id), '') = '' then
    raise exception 'p_carteira_conta_id e obrigatorio.';
  end if;

  if p_valor is null or p_valor <= 0 then
    raise exception 'p_valor deve ser maior que zero.';
  end if;

  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'p_motivo e obrigatorio.';
  end if;

  select *
    into v_carteira_conta
  from public.carteira_conta
  where id = p_carteira_conta_id;

  if not found then
    raise exception 'carteira_conta % nao encontrada.', p_carteira_conta_id;
  end if;

  if not public.finance_get_feature_flag('finance.compensatory_credit_enabled', v_carteira_conta.empresa_id) then
    raise exception 'Feature flag finance.compensatory_credit_enabled esta desligada para a empresa %.', v_carteira_conta.empresa_id;
  end if;

  return query
  select *
  from public.finance_apply_wallet_operation(
    p_carteira_conta_id := p_carteira_conta_id,
    p_operacao_idempotencia := p_operacao_idempotencia,
    p_tipo := 'credito_compensatorio',
    p_natureza := 'entrada',
    p_origem := 'cancellation_compensation',
    p_valor := round(p_valor, 2),
    p_referencia_amigavel := p_referencia_amigavel,
    p_descricao := trim(p_motivo),
    p_orcamento_id := p_orcamento_id,
    p_appointment_id := p_appointment_id,
    p_obrigacao_id := p_obrigacao_id,
    p_transacao_id := null,
    p_autorizacao_financeira_id := null,
    p_usuario_id := p_usuario_id,
    p_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'motivo', trim(p_motivo),
      'source', 'sprint5_compensatory_credit'
    ),
    p_permitir_saldo_negativo := true
  );
end;
$$;

drop function if exists public.finance_process_cancellation_v2(
  text, text, text, text, text, boolean, numeric, boolean, numeric, boolean, text, text, jsonb
);

create or replace function public.finance_process_cancellation_v2(
  p_carteira_conta_id text,
  p_obrigacao_id text,
  p_orcamento_id text default null,
  p_appointment_id text default null,
  p_origem_cancelamento text default 'cliente',
  p_aplicar_multa boolean default false,
  p_percentual_multa numeric default 0,
  p_gerar_credito_compensatorio boolean default false,
  p_valor_credito_compensatorio numeric default null,
  p_permitir_saldo_negativo_multa boolean default false,
  p_motivo text default null,
  p_usuario_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  cancelamento_financeiro_id text,
  obrigacao_id text,
  obrigacao_status text,
  valor_pago_ate_agora numeric,
  valor_credito_gerado numeric,
  valor_multa_gerado numeric,
  multa_movimento_id text,
  credito_movimento_id text,
  reused boolean
)
language plpgsql
as $$
declare
  v_carteira_conta public.carteira_conta%rowtype;
  v_obrigacao public.obrigacao_financeira%rowtype;
  v_existing public.cancelamento_financeiro%rowtype;
  v_source_key text;
  v_paid_amount numeric(14,2);
  v_penalty_value numeric(14,2) := 0;
  v_credit_value numeric(14,2) := 0;
  v_credit_result record;
  v_penalty_result record;
  v_credito_movimento_id text := null;
  v_multa_movimento_id text := null;
  v_next_status text;
  v_allow_negative_penalty boolean := false;
  v_inserted public.cancelamento_financeiro%rowtype;
begin
  if coalesce(trim(p_carteira_conta_id), '') = '' then
    raise exception 'p_carteira_conta_id e obrigatorio.';
  end if;

  if coalesce(trim(p_obrigacao_id), '') = '' then
    raise exception 'p_obrigacao_id e obrigatorio.';
  end if;

  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'p_motivo e obrigatorio.';
  end if;

  if p_origem_cancelamento not in ('dogcity', 'cliente', 'natural') then
    raise exception 'origem de cancelamento invalida: %', p_origem_cancelamento;
  end if;

  select *
    into v_carteira_conta
  from public.carteira_conta
  where id = p_carteira_conta_id
  for update;

  if not found then
    raise exception 'carteira_conta % nao encontrada.', p_carteira_conta_id;
  end if;

  if not public.finance_get_feature_flag('finance.cancellation_v2_enabled', v_carteira_conta.empresa_id) then
    raise exception 'Feature flag finance.cancellation_v2_enabled esta desligada para a empresa %.', v_carteira_conta.empresa_id;
  end if;

  select *
    into v_obrigacao
  from public.obrigacao_financeira ofn
  where ofn.id = p_obrigacao_id
    and ofn.carteira_conta_id = p_carteira_conta_id
  for update;

  if not found then
    raise exception 'obrigacao_financeira % nao encontrada para a carteira %.', p_obrigacao_id, p_carteira_conta_id;
  end if;

  v_source_key := 'cancellation_v2|obrigacao|' || p_obrigacao_id || '|origem|' || p_origem_cancelamento;

  select *
    into v_existing
  from public.cancelamento_financeiro cf
  where cf.empresa_id = v_carteira_conta.empresa_id
    and cf.source_key = v_source_key
  limit 1;

  if found then
    return query
    select
      v_existing.id,
      v_existing.obrigacao_id,
      coalesce(v_obrigacao.status, 'cancelada'),
      round(greatest(coalesce(v_obrigacao.valor_final, 0) - coalesce(v_obrigacao.valor_em_aberto, 0), 0), 2),
      round(coalesce(v_existing.valor_credito_compensatorio, 0), 2),
      round(coalesce(v_existing.valor_multa, 0), 2),
      v_existing.multa_movimento_id,
      v_existing.credito_movimento_id,
      true;
    return;
  end if;

  v_paid_amount := round(greatest(coalesce(v_obrigacao.valor_final, 0) - coalesce(v_obrigacao.valor_em_aberto, 0), 0), 2);

  if p_origem_cancelamento = 'natural' then
    p_aplicar_multa := false;
    p_gerar_credito_compensatorio := false;
  end if;

  if p_origem_cancelamento = 'dogcity' and p_aplicar_multa then
    raise exception 'Cancelamento DogCity nao permite multa nesta fase controlada.';
  end if;

  if p_origem_cancelamento <> 'cliente' and p_aplicar_multa then
    raise exception 'Multa de cancelamento so pode ser aplicada em cancelamento pelo cliente.';
  end if;

  if p_aplicar_multa then
    if not public.finance_get_feature_flag('finance.cancellation_penalty_enabled', v_carteira_conta.empresa_id) then
      raise exception 'Feature flag finance.cancellation_penalty_enabled esta desligada para a empresa %.', v_carteira_conta.empresa_id;
    end if;
    if coalesce(p_percentual_multa, 0) <= 0 then
      raise exception 'Informe percentual de multa maior que zero.';
    end if;
    v_penalty_value := round(coalesce(v_obrigacao.valor_final, 0) * (p_percentual_multa / 100.0), 2);
  end if;

  if p_origem_cancelamento = 'cliente' and v_paid_amount > 0 then
    if not public.finance_get_feature_flag('finance.compensatory_credit_enabled', v_carteira_conta.empresa_id) then
      raise exception 'Feature flag finance.compensatory_credit_enabled esta desligada para a empresa %.', v_carteira_conta.empresa_id;
    end if;
    v_credit_value := round(v_paid_amount, 2);
  elsif p_origem_cancelamento = 'dogcity' and p_gerar_credito_compensatorio then
    if not public.finance_get_feature_flag('finance.compensatory_credit_enabled', v_carteira_conta.empresa_id) then
      raise exception 'Feature flag finance.compensatory_credit_enabled esta desligada para a empresa %.', v_carteira_conta.empresa_id;
    end if;
    if coalesce(p_valor_credito_compensatorio, 0) <= 0 then
      raise exception 'Informe valor de credito compensatorio maior que zero.';
    end if;
    v_credit_value := round(p_valor_credito_compensatorio, 2);
  end if;

  if v_penalty_value > 0 then
    if p_permitir_saldo_negativo_multa then
      if not public.finance_get_feature_flag('finance.allow_negative_wallet_with_authorization', v_carteira_conta.empresa_id) then
        raise exception 'Saldo negativo para multa exige a flag finance.allow_negative_wallet_with_authorization.';
      end if;
      v_allow_negative_penalty := true;
    end if;

    select *
      into v_penalty_result
    from public.finance_apply_wallet_operation(
      p_carteira_conta_id := p_carteira_conta_id,
      p_operacao_idempotencia := v_source_key || '|multa',
      p_tipo := 'multa',
      p_natureza := 'saida',
      p_origem := 'cancellation_penalty',
      p_valor := v_penalty_value,
      p_referencia_amigavel := 'Multa de cancelamento - ' || coalesce(v_obrigacao.descricao, v_obrigacao.id),
      p_descricao := trim(p_motivo),
      p_orcamento_id := coalesce(p_orcamento_id, v_obrigacao.orcamento_id),
      p_appointment_id := coalesce(p_appointment_id, v_obrigacao.appointment_id),
      p_obrigacao_id := v_obrigacao.id,
      p_transacao_id := null,
      p_autorizacao_financeira_id := null,
      p_usuario_id := p_usuario_id,
      p_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'sprint5_cancellation_penalty',
        'origem_cancelamento', p_origem_cancelamento,
        'percentual_multa', p_percentual_multa
      ),
      p_permitir_saldo_negativo := v_allow_negative_penalty
    );

    v_multa_movimento_id := v_penalty_result.movimento_id;
  end if;

  if v_credit_value > 0 then
    select *
      into v_credit_result
    from public.finance_apply_compensatory_credit(
      p_carteira_conta_id := p_carteira_conta_id,
      p_operacao_idempotencia := v_source_key || '|credito',
      p_valor := v_credit_value,
      p_referencia_amigavel := 'Credito compensatorio - ' || coalesce(v_obrigacao.descricao, v_obrigacao.id),
      p_motivo := trim(p_motivo),
      p_orcamento_id := coalesce(p_orcamento_id, v_obrigacao.orcamento_id),
      p_appointment_id := coalesce(p_appointment_id, v_obrigacao.appointment_id),
      p_obrigacao_id := v_obrigacao.id,
      p_usuario_id := p_usuario_id,
      p_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'sprint5_cancellation_compensation',
        'origem_cancelamento', p_origem_cancelamento
      )
    );

    v_credito_movimento_id := v_credit_result.movimento_id;
  end if;

  v_next_status := case
    when v_credit_value > 0 then 'estornada'
    else 'cancelada'
  end;

  insert into public.cancelamento_financeiro (
    empresa_id,
    carteira_conta_id,
    obrigacao_id,
    orcamento_id,
    appointment_id,
    origem_cancelamento,
    aplicar_multa,
    percentual_multa,
    valor_multa,
    gerar_credito_compensatorio,
    valor_credito_compensatorio,
    multa_movimento_id,
    credito_movimento_id,
    source_key,
    status,
    motivo,
    usuario_id,
    metadata
  )
  values (
    v_carteira_conta.empresa_id,
    p_carteira_conta_id,
    v_obrigacao.id,
    coalesce(p_orcamento_id, v_obrigacao.orcamento_id),
    coalesce(p_appointment_id, v_obrigacao.appointment_id),
    p_origem_cancelamento,
    p_aplicar_multa,
    round(coalesce(p_percentual_multa, 0), 4),
    v_penalty_value,
    v_credit_value > 0,
    v_credit_value,
    v_multa_movimento_id,
    v_credito_movimento_id,
    v_source_key,
    'processado',
    trim(p_motivo),
    p_usuario_id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'source', 'sprint5_cancellation_v2',
      'valor_pago_ate_agora', v_paid_amount,
      'obrigacao_status_anterior', v_obrigacao.status
    )
  )
  returning * into v_inserted;

  update public.obrigacao_financeira
  set
    status = v_next_status,
    valor_em_aberto = 0,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'cancellation_v2', true,
      'cancellation_id', v_inserted.id,
      'cancelled_by', coalesce(p_usuario_id, ''),
      'cancelled_origin', p_origem_cancelamento,
      'cancelled_at', now()
    ),
    updated_date = now()
  where id = v_obrigacao.id;

  return query
  select
    v_inserted.id,
    v_obrigacao.id,
    v_next_status,
    v_paid_amount,
    v_credit_value,
    v_penalty_value,
    v_multa_movimento_id,
    v_credito_movimento_id,
    false;
end;
$$;

drop function if exists public.finance_process_budget_cancellation_v2(
  text, text, text, boolean, numeric, boolean, numeric, boolean, text, text, jsonb
);

create or replace function public.finance_process_budget_cancellation_v2(
  p_orcamento_id text,
  p_carteira_conta_id text,
  p_origem_cancelamento text default 'cliente',
  p_aplicar_multa boolean default false,
  p_percentual_multa numeric default 0,
  p_gerar_credito_compensatorio boolean default false,
  p_valor_credito_compensatorio numeric default null,
  p_permitir_saldo_negativo_multa boolean default false,
  p_motivo text default null,
  p_usuario_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  orcamento_id text,
  orcamento_status text,
  cancelamentos_processados integer,
  cancelamentos_reutilizados integer,
  total_credito_gerado numeric,
  total_multa_gerada numeric
)
language plpgsql
as $$
declare
  v_orcamento public.orcamento%rowtype;
  v_carteira_conta public.carteira_conta%rowtype;
  v_result record;
  v_obrigacao record;
  v_processed integer := 0;
  v_reused integer := 0;
  v_total_credit numeric(14,2) := 0;
  v_total_penalty numeric(14,2) := 0;
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
    raise exception 'A carteira_conta % nao corresponde ao cliente financeiro do orcamento %.', p_carteira_conta_id, p_orcamento_id;
  end if;

  if not public.finance_get_feature_flag('finance.cancellation_v2_enabled', v_carteira_conta.empresa_id) then
    raise exception 'Feature flag finance.cancellation_v2_enabled esta desligada para a empresa %.', v_carteira_conta.empresa_id;
  end if;

  for v_obrigacao in
    select ofn.id, ofn.orcamento_id, ofn.appointment_id
    from public.obrigacao_financeira ofn
    where ofn.orcamento_id = p_orcamento_id
      and ofn.carteira_conta_id = p_carteira_conta_id
      and ofn.status in ('aberta', 'parcial', 'vencida', 'quitada')
    order by ofn.due_date asc, ofn.service_date asc, ofn.created_date asc, ofn.id asc
  loop
    select *
      into v_result
    from public.finance_process_cancellation_v2(
      p_carteira_conta_id := p_carteira_conta_id,
      p_obrigacao_id := v_obrigacao.id,
      p_orcamento_id := p_orcamento_id,
      p_appointment_id := v_obrigacao.appointment_id,
      p_origem_cancelamento := p_origem_cancelamento,
      p_aplicar_multa := p_aplicar_multa,
      p_percentual_multa := p_percentual_multa,
      p_gerar_credito_compensatorio := p_gerar_credito_compensatorio,
      p_valor_credito_compensatorio := p_valor_credito_compensatorio,
      p_permitir_saldo_negativo_multa := p_permitir_saldo_negativo_multa,
      p_motivo := p_motivo,
      p_usuario_id := p_usuario_id,
      p_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'budget_scope', 'sprint5',
        'orcamento_id', p_orcamento_id
      )
    );

    if coalesce(v_result.reused, false) then
      v_reused := v_reused + 1;
    else
      v_processed := v_processed + 1;
    end if;

    v_total_credit := round(v_total_credit + coalesce(v_result.valor_credito_gerado, 0), 2);
    v_total_penalty := round(v_total_penalty + coalesce(v_result.valor_multa_gerado, 0), 2);
  end loop;

  update public.orcamento
  set
    status = 'cancelado',
    updated_date = now()
  where id = p_orcamento_id;

  return query
  select
    p_orcamento_id,
    'cancelado'::text,
    v_processed,
    v_reused,
    v_total_credit,
    v_total_penalty;
end;
$$;

select * from public.finance_ensure_wallet_cancellation_feature_flags();
