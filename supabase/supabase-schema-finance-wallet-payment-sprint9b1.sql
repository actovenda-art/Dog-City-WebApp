-- Sprint 9B.1 - Payment V2 (Corte 1)
-- Objetivo:
-- 1. Materializar o nucleo minimo do Payment V2 sem abrir rollout
-- 2. Introduzir a fronteira oficial de liquidacao por obrigacao
-- 3. Garantir idempotencia governada, evidência em carteira_movimento e observabilidade minima
--
-- Importante:
-- - Nao inicia rollout
-- - Nao remove legado
-- - Nao implementa compensacao parcial
-- - Nao implementa Cobranca V2

create extension if not exists pgcrypto;

create table if not exists public.pagamento_v2_execucao (
  id text primary key default gen_random_uuid()::text,
  empresa_id text not null,
  carteira_conta_id text not null references public.carteira_conta(id) on delete cascade,
  obrigacao_id text not null references public.obrigacao_financeira(id) on delete cascade,
  cobranca_financeira_id text null references public.cobranca_financeira(id) on delete set null,
  carteira_movimento_id text null references public.carteira_movimento(id) on delete set null,
  carteira_alocacao_id text null references public.carteira_alocacao(id) on delete set null,
  operacao_idempotencia text not null,
  source_key text not null,
  forma_pagamento text not null,
  origem_operacional text not null,
  valor_solicitado numeric(14,2) not null,
  data_pagamento date not null,
  classe_resultado text not null,
  reason_code text null,
  reason_message text null,
  usuario_id text null references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  constraint uq_pagamento_v2_execucao_empresa_operacao unique (empresa_id, operacao_idempotencia),
  constraint chk_pagamento_v2_execucao_classe
    check (classe_resultado in ('executado','idempotente_reutilizado','rejeitado_negocio','falha_controlada')),
  constraint chk_pagamento_v2_execucao_valor
    check (valor_solicitado > 0 and valor_solicitado = round(valor_solicitado, 2))
);

create index if not exists idx_pagamento_v2_execucao_empresa_data
  on public.pagamento_v2_execucao(empresa_id, created_date desc, id desc);

create index if not exists idx_pagamento_v2_execucao_obrigacao
  on public.pagamento_v2_execucao(obrigacao_id, created_date desc);

drop trigger if exists trg_pagamento_v2_execucao_updated_date on public.pagamento_v2_execucao;
create trigger trg_pagamento_v2_execucao_updated_date
before update on public.pagamento_v2_execucao
for each row
execute function public.finance_set_updated_date();

drop function if exists public.finance_ensure_payment_v2_feature_flags();

create or replace function public.finance_ensure_payment_v2_feature_flags()
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
    where cfg.key = 'finance.payment_v2_write_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.payment_v2_write_enabled',
      'Finance - Payment V2 Write Enabled',
      'Habilita a fronteira controlada de liquidacao do Payment V2.',
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
        where cfg.key = 'finance.payment_v2_write_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.payment_v2_write_enabled',
          'Finance - Payment V2 Write Enabled',
          'Habilita a fronteira controlada de liquidacao do Payment V2.',
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
  where cfg.key = 'finance.payment_v2_write_enabled'
  order by cfg.key, cfg.empresa_id nulls first;
end;
$$;

drop function if exists public.finance_payment_v2_execute(
  text, text, text, text, text, text, numeric, date, text, text, text, jsonb
);

create or replace function public.finance_payment_v2_execute(
  p_empresa_id text,
  p_carteira_conta_id text,
  p_obrigacao_id text,
  p_cobranca_financeira_id text default null,
  p_operacao_idempotencia text default null,
  p_source_key text default null,
  p_valor numeric default null,
  p_data_pagamento date default null,
  p_forma_pagamento text default null,
  p_origem_operacional text default 'manual_operacional',
  p_usuario_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  execucao_id text,
  classe_resultado text,
  carteira_movimento_id text,
  carteira_alocacao_id text,
  carteira_conta_id text,
  obrigacao_id text,
  cobranca_financeira_id text,
  operacao_idempotencia text,
  source_key text,
  saldo_anterior numeric,
  saldo_final numeric,
  reason_code text,
  reason_message text,
  reused boolean
)
language plpgsql
as $$
declare
  v_existing_exec public.pagamento_v2_execucao%rowtype;
  v_carteira_conta public.carteira_conta%rowtype;
  v_obrigacao public.obrigacao_financeira%rowtype;
  v_cobranca public.cobranca_financeira%rowtype;
  v_now timestamptz := now();
  v_reason_code text := null;
  v_reason_message text := null;
  v_wallet_result record;
  v_execucao public.pagamento_v2_execucao%rowtype;
  v_charge_item_count integer := 0;
  v_charge_link_count integer := 0;
  v_alocacao_id text := null;
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio.';
  end if;

  if coalesce(trim(p_operacao_idempotencia), '') = '' then
    raise exception 'p_operacao_idempotencia e obrigatorio.';
  end if;

  select *
    into v_existing_exec
  from public.pagamento_v2_execucao pve
  where pve.empresa_id = p_empresa_id
    and pve.operacao_idempotencia = p_operacao_idempotencia
  limit 1;

  if found then
    execucao_id := v_existing_exec.id;
    classe_resultado := case
      when v_existing_exec.classe_resultado = 'executado' then 'idempotente_reutilizado'
      else v_existing_exec.classe_resultado
    end;
    carteira_movimento_id := v_existing_exec.carteira_movimento_id;
    carteira_alocacao_id := v_existing_exec.carteira_alocacao_id;
    carteira_conta_id := v_existing_exec.carteira_conta_id;
    obrigacao_id := v_existing_exec.obrigacao_id;
    cobranca_financeira_id := v_existing_exec.cobranca_financeira_id;
    operacao_idempotencia := v_existing_exec.operacao_idempotencia;
    source_key := v_existing_exec.source_key;
    reason_code := v_existing_exec.reason_code;
    reason_message := v_existing_exec.reason_message;
    reused := true;

    if v_existing_exec.carteira_movimento_id is not null then
      select cm.saldo_anterior, cm.saldo_final
        into saldo_anterior, saldo_final
      from public.carteira_movimento cm
      where cm.id = v_existing_exec.carteira_movimento_id;
    else
      saldo_anterior := null;
      saldo_final := null;
    end if;

    return next;
    return;
  end if;

  if not public.finance_get_feature_flag('finance.payment_v2_write_enabled', p_empresa_id) then
    v_reason_code := 'payment_v2_write_disabled';
    v_reason_message := format('Feature flag finance.payment_v2_write_enabled esta desligada para a empresa %s.', p_empresa_id);
  elsif coalesce(trim(p_carteira_conta_id), '') = '' then
    v_reason_code := 'carteira_conta_required';
    v_reason_message := 'p_carteira_conta_id e obrigatorio.';
  elsif coalesce(trim(p_obrigacao_id), '') = '' then
    v_reason_code := 'obrigacao_required';
    v_reason_message := 'p_obrigacao_id e obrigatorio.';
  elsif coalesce(trim(p_source_key), '') = '' then
    v_reason_code := 'source_key_required';
    v_reason_message := 'p_source_key e obrigatorio.';
  elsif p_valor is null or round(p_valor, 2) <= 0 then
    v_reason_code := 'valor_invalido';
    v_reason_message := 'p_valor deve ser maior que zero.';
  elsif p_data_pagamento is null then
    v_reason_code := 'data_pagamento_required';
    v_reason_message := 'p_data_pagamento e obrigatorio.';
  elsif coalesce(trim(p_forma_pagamento), '') = '' then
    v_reason_code := 'forma_pagamento_required';
    v_reason_message := 'p_forma_pagamento e obrigatorio.';
  end if;

  if v_reason_code is not null then
    if coalesce(trim(p_carteira_conta_id), '') <> ''
       and coalesce(trim(p_obrigacao_id), '') <> '' then
      insert into public.pagamento_v2_execucao (
        empresa_id,
        carteira_conta_id,
        obrigacao_id,
        cobranca_financeira_id,
        operacao_idempotencia,
        source_key,
        forma_pagamento,
        origem_operacional,
        valor_solicitado,
        data_pagamento,
        classe_resultado,
        reason_code,
        reason_message,
        usuario_id,
        metadata
      )
      values (
        p_empresa_id,
        p_carteira_conta_id,
        p_obrigacao_id,
        null,
        p_operacao_idempotencia,
        coalesce(nullif(trim(coalesce(p_source_key, '')), ''), '__invalid__'),
        coalesce(nullif(trim(coalesce(p_forma_pagamento, '')), ''), '__invalid__'),
        coalesce(nullif(trim(coalesce(p_origem_operacional, '')), ''), 'manual_operacional'),
        round(coalesce(p_valor, 0), 2),
        coalesce(p_data_pagamento, current_date),
        'rejeitado_negocio',
        v_reason_code,
        v_reason_message,
        p_usuario_id,
        coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
          'source', 'payment_v2_execute',
          'contract_scope', 'sprint9b1_cut1',
          'rejected_before_lock', true
        )
      )
      on conflict on constraint uq_pagamento_v2_execucao_empresa_operacao do nothing
      returning * into v_execucao;

      if not found then
        select * into v_execucao
        from public.pagamento_v2_execucao pve
        where pve.empresa_id = p_empresa_id
          and pve.operacao_idempotencia = p_operacao_idempotencia
        limit 1;
      end if;
    end if;

    execucao_id := v_execucao.id;
    classe_resultado := 'rejeitado_negocio';
    carteira_movimento_id := v_execucao.carteira_movimento_id;
    carteira_alocacao_id := v_execucao.carteira_alocacao_id;
    carteira_conta_id := coalesce(v_execucao.carteira_conta_id, nullif(trim(p_carteira_conta_id), ''));
    obrigacao_id := coalesce(v_execucao.obrigacao_id, nullif(trim(p_obrigacao_id), ''));
    cobranca_financeira_id := coalesce(v_execucao.cobranca_financeira_id, nullif(trim(coalesce(p_cobranca_financeira_id, '')), ''));
    operacao_idempotencia := coalesce(v_execucao.operacao_idempotencia, p_operacao_idempotencia);
    source_key := coalesce(v_execucao.source_key, nullif(trim(coalesce(p_source_key, '')), ''));
    saldo_anterior := null;
    saldo_final := null;
    reason_code := v_execucao.reason_code;
    reason_message := v_execucao.reason_message;
    reused := false;
    return next;
    return;
  end if;

  begin
    select *
      into v_carteira_conta
    from public.carteira_conta cc
    where cc.id = p_carteira_conta_id
      and cc.empresa_id = p_empresa_id
    for update;

    if not found then
      raise exception 'carteira_conta % nao encontrada para a empresa %.', p_carteira_conta_id, p_empresa_id;
    end if;

    select *
      into v_obrigacao
    from public.obrigacao_financeira ofn
    where ofn.id = p_obrigacao_id
      and ofn.empresa_id = p_empresa_id
      and ofn.carteira_conta_id = p_carteira_conta_id
    for update;

    if not found then
      raise exception 'obrigacao_financeira % nao encontrada para a carteira %.', p_obrigacao_id, p_carteira_conta_id;
    end if;

    if v_obrigacao.status not in ('aberta','parcial','vencida') or round(coalesce(v_obrigacao.valor_em_aberto, 0), 2) <= 0 then
      v_reason_code := 'obrigacao_not_payable';
      v_reason_message := format('Obrigacao %s esta com status %s e valor_em_aberto %s.', v_obrigacao.id, v_obrigacao.status, coalesce(v_obrigacao.valor_em_aberto, 0));
    elsif round(p_valor, 2) <> round(coalesce(v_obrigacao.valor_em_aberto, 0), 2) then
      v_reason_code := 'partial_payment_out_of_scope';
      v_reason_message := format('Primeiro corte exige quitacao integral da obrigacao. Valor solicitado %s difere do valor_em_aberto %s.', round(p_valor, 2), round(coalesce(v_obrigacao.valor_em_aberto, 0), 2));
    end if;

    if v_reason_code is null and coalesce(trim(coalesce(p_cobranca_financeira_id, '')), '') <> '' then
      select *
        into v_cobranca
      from public.cobranca_financeira cf
      where cf.id = p_cobranca_financeira_id
        and cf.empresa_id = p_empresa_id
        and cf.carteira_conta_id = p_carteira_conta_id
      for update;

      if not found then
        v_reason_code := 'charge_not_found';
        v_reason_message := format('cobranca_financeira %s nao encontrada para a carteira %s.', p_cobranca_financeira_id, p_carteira_conta_id);
      else
        select count(*)::integer
          into v_charge_item_count
        from public.cobranca_item ci
        where ci.cobranca_financeira_id = v_cobranca.id;

        select count(*)::integer
          into v_charge_link_count
        from public.cobranca_item ci
        where ci.cobranca_financeira_id = v_cobranca.id
          and ci.obrigacao_id = v_obrigacao.id;

        if v_charge_link_count = 0 then
          v_reason_code := 'charge_not_linked_to_obligation';
          v_reason_message := format('cobranca_financeira %s nao esta vinculada a obrigacao %s.', v_cobranca.id, v_obrigacao.id);
        elsif v_charge_item_count > 1 then
          v_reason_code := 'multi_item_charge_out_of_scope';
          v_reason_message := format('Primeiro corte nao suporta cobranca com multiplas obrigacoes. cobranca_financeira %s possui %s itens.', v_cobranca.id, v_charge_item_count);
        elsif v_cobranca.status not in ('aberta','parcial','vencida') or round(coalesce(v_cobranca.valor_em_aberto, 0), 2) <= 0 then
          v_reason_code := 'charge_not_payable';
          v_reason_message := format('cobranca_financeira %s esta com status %s e valor_em_aberto %s.', v_cobranca.id, v_cobranca.status, coalesce(v_cobranca.valor_em_aberto, 0));
        elsif round(coalesce(v_cobranca.valor_em_aberto, 0), 2) <> round(p_valor, 2) then
          v_reason_code := 'charge_amount_mismatch';
          v_reason_message := format('Primeiro corte exige quitacao integral da cobranca. Valor solicitado %s difere do valor_em_aberto %s.', round(p_valor, 2), round(coalesce(v_cobranca.valor_em_aberto, 0), 2));
        end if;
      end if;
    end if;

    if v_reason_code is not null then
      insert into public.pagamento_v2_execucao (
        empresa_id,
        carteira_conta_id,
        obrigacao_id,
        cobranca_financeira_id,
        operacao_idempotencia,
        source_key,
        forma_pagamento,
        origem_operacional,
        valor_solicitado,
        data_pagamento,
        classe_resultado,
        reason_code,
        reason_message,
        usuario_id,
        metadata
      )
      values (
        p_empresa_id,
        p_carteira_conta_id,
        p_obrigacao_id,
        v_cobranca.id,
        p_operacao_idempotencia,
        p_source_key,
        trim(p_forma_pagamento),
        coalesce(nullif(trim(coalesce(p_origem_operacional, '')), ''), 'manual_operacional'),
        round(p_valor, 2),
        p_data_pagamento,
        'rejeitado_negocio',
        v_reason_code,
        v_reason_message,
        p_usuario_id,
        coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
          'source', 'payment_v2_execute',
          'contract_scope', 'sprint9b1_cut1',
          'rejected_after_lock', true
        )
      )
      returning * into v_execucao;

      execucao_id := v_execucao.id;
      classe_resultado := 'rejeitado_negocio';
      carteira_movimento_id := null;
      carteira_alocacao_id := null;
      carteira_conta_id := v_execucao.carteira_conta_id;
      obrigacao_id := v_execucao.obrigacao_id;
      cobranca_financeira_id := v_execucao.cobranca_financeira_id;
      operacao_idempotencia := v_execucao.operacao_idempotencia;
      source_key := v_execucao.source_key;
      saldo_anterior := null;
      saldo_final := null;
      reason_code := v_execucao.reason_code;
      reason_message := v_execucao.reason_message;
      reused := false;
      return next;
      return;
    end if;

    select *
      into v_wallet_result
    from public.finance_apply_wallet_operation(
      p_carteira_conta_id := p_carteira_conta_id,
      p_operacao_idempotencia := p_operacao_idempotencia,
      p_tipo := 'credito',
      p_natureza := 'entrada',
      p_origem := 'payment_v2',
      p_valor := round(p_valor, 2),
      p_referencia_amigavel := 'Pagamento V2 - ' || coalesce(v_obrigacao.descricao, v_obrigacao.id),
      p_descricao := coalesce(nullif(trim(coalesce(p_forma_pagamento, '')), ''), 'Pagamento V2'),
      p_orcamento_id := v_obrigacao.orcamento_id,
      p_appointment_id := v_obrigacao.appointment_id,
      p_obrigacao_id := v_obrigacao.id,
      p_transacao_id := null,
      p_autorizacao_financeira_id := null,
      p_usuario_id := p_usuario_id,
      p_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'payment_v2_execute',
        'contract_scope', 'sprint9b1_cut1',
        'source_key', p_source_key,
        'forma_pagamento', trim(p_forma_pagamento),
        'origem_operacional', coalesce(nullif(trim(coalesce(p_origem_operacional, '')), ''), 'manual_operacional'),
        'data_pagamento', p_data_pagamento,
        'cobranca_financeira_id', nullif(trim(coalesce(p_cobranca_financeira_id, '')), ''),
        'authority_scope', 'payment_v2'
      ),
      p_permitir_saldo_negativo := true
    );

    insert into public.carteira_alocacao (
      empresa_id,
      carteira_conta_id,
      carteira_movimento_id,
      obrigacao_id,
      valor_alocado,
      ordem_aplicada,
      metadata
    )
    values (
      p_empresa_id,
      p_carteira_conta_id,
      v_wallet_result.movimento_id,
      v_obrigacao.id,
      round(p_valor, 2),
      1,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'payment_v2_execute',
        'contract_scope', 'sprint9b1_cut1',
        'operacao_idempotencia', p_operacao_idempotencia
      )
    )
    on conflict on constraint uq_carteira_alocacao do update
      set valor_alocado = excluded.valor_alocado,
          metadata = excluded.metadata
    returning id into v_alocacao_id;

    update public.obrigacao_financeira
    set
      valor_em_aberto = 0,
      status = 'quitada',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'payment_v2', true,
        'payment_v2_last_execution_at', v_now,
        'payment_v2_operacao_idempotencia', p_operacao_idempotencia,
        'payment_v2_source_key', p_source_key,
        'payment_v2_forma_pagamento', trim(p_forma_pagamento)
      ),
      updated_date = v_now
    where id = v_obrigacao.id;

    if coalesce(trim(coalesce(p_cobranca_financeira_id, '')), '') <> '' then
      update public.cobranca_financeira
      set
        valor_em_aberto = 0,
        status = 'quitada',
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'payment_v2', true,
          'payment_v2_last_execution_at', v_now,
          'payment_v2_operacao_idempotencia', p_operacao_idempotencia,
          'payment_v2_source_key', p_source_key
        ),
        updated_date = v_now
      where id = v_cobranca.id;
    end if;

    insert into public.pagamento_v2_execucao (
      empresa_id,
      carteira_conta_id,
      obrigacao_id,
      cobranca_financeira_id,
      carteira_movimento_id,
      carteira_alocacao_id,
      operacao_idempotencia,
      source_key,
      forma_pagamento,
      origem_operacional,
      valor_solicitado,
      data_pagamento,
      classe_resultado,
      reason_code,
      reason_message,
      usuario_id,
      metadata
    )
    values (
      p_empresa_id,
      p_carteira_conta_id,
      v_obrigacao.id,
      nullif(trim(coalesce(p_cobranca_financeira_id, '')), ''),
      v_wallet_result.movimento_id,
      v_alocacao_id,
      p_operacao_idempotencia,
      p_source_key,
      trim(p_forma_pagamento),
      coalesce(nullif(trim(coalesce(p_origem_operacional, '')), ''), 'manual_operacional'),
      round(p_valor, 2),
      p_data_pagamento,
      'executado',
      null,
      null,
      p_usuario_id,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'payment_v2_execute',
        'contract_scope', 'sprint9b1_cut1',
        'authority_scope', 'payment_v2'
      )
    )
    returning * into v_execucao;

    execucao_id := v_execucao.id;
    classe_resultado := 'executado';
    carteira_movimento_id := v_execucao.carteira_movimento_id;
    carteira_alocacao_id := v_execucao.carteira_alocacao_id;
    carteira_conta_id := v_execucao.carteira_conta_id;
    obrigacao_id := v_execucao.obrigacao_id;
    cobranca_financeira_id := v_execucao.cobranca_financeira_id;
    operacao_idempotencia := v_execucao.operacao_idempotencia;
    source_key := v_execucao.source_key;
    saldo_anterior := v_wallet_result.saldo_anterior;
    saldo_final := v_wallet_result.saldo_final;
    reason_code := null;
    reason_message := null;
    reused := false;
    return next;
    return;
  exception
    when others then
      v_reason_code := 'falha_controlada';
      v_reason_message := sqlerrm;

      begin
        if v_carteira_conta.id is not null and v_obrigacao.id is not null then
          insert into public.pagamento_v2_execucao (
            empresa_id,
            carteira_conta_id,
            obrigacao_id,
            cobranca_financeira_id,
            operacao_idempotencia,
            source_key,
            forma_pagamento,
            origem_operacional,
            valor_solicitado,
            data_pagamento,
            classe_resultado,
            reason_code,
            reason_message,
            usuario_id,
            metadata
          )
          values (
            p_empresa_id,
            v_carteira_conta.id,
            v_obrigacao.id,
            v_cobranca.id,
            p_operacao_idempotencia,
            coalesce(nullif(trim(coalesce(p_source_key, '')), ''), '__invalid__'),
            trim(coalesce(p_forma_pagamento, 'indefinida')),
            coalesce(nullif(trim(coalesce(p_origem_operacional, '')), ''), 'manual_operacional'),
            round(coalesce(p_valor, 0), 2),
            coalesce(p_data_pagamento, current_date),
            'falha_controlada',
            v_reason_code,
            v_reason_message,
            p_usuario_id,
            coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
              'source', 'payment_v2_execute',
              'contract_scope', 'sprint9b1_cut1',
              'failure_captured', true
            )
          )
          on conflict on constraint uq_pagamento_v2_execucao_empresa_operacao do nothing
          returning * into v_execucao;

          if not found then
            select * into v_execucao
            from public.pagamento_v2_execucao pve
            where pve.empresa_id = p_empresa_id
              and pve.operacao_idempotencia = p_operacao_idempotencia
            limit 1;
          end if;
        end if;
      exception
        when others then
          v_execucao := null;
      end;

      execucao_id := v_execucao.id;
      classe_resultado := 'falha_controlada';
      carteira_movimento_id := v_execucao.carteira_movimento_id;
      carteira_alocacao_id := v_execucao.carteira_alocacao_id;
      carteira_conta_id := coalesce(v_execucao.carteira_conta_id, v_carteira_conta.id, nullif(trim(p_carteira_conta_id), ''));
      obrigacao_id := coalesce(v_execucao.obrigacao_id, v_obrigacao.id, nullif(trim(p_obrigacao_id), ''));
      cobranca_financeira_id := coalesce(v_execucao.cobranca_financeira_id, v_cobranca.id, nullif(trim(coalesce(p_cobranca_financeira_id, '')), ''));
      operacao_idempotencia := coalesce(v_execucao.operacao_idempotencia, p_operacao_idempotencia);
      source_key := coalesce(v_execucao.source_key, nullif(trim(coalesce(p_source_key, '')), ''));
      saldo_anterior := null;
      saldo_final := null;
      reason_code := v_execucao.reason_code;
      reason_message := v_execucao.reason_message;
      reused := false;
      return next;
      return;
  end;
end;
$$;

drop function if exists public.finance_payment_v2_execution_audit(text, integer);

create or replace function public.finance_payment_v2_execution_audit(
  p_empresa_id text,
  p_limit integer default 100
)
returns table (
  execucao_id text,
  empresa_id text,
  carteira_conta_id text,
  obrigacao_id text,
  obrigacao_status text,
  cobranca_financeira_id text,
  cobranca_status text,
  carteira_movimento_id text,
  movimento_tipo text,
  operacao_idempotencia text,
  source_key text,
  forma_pagamento text,
  origem_operacional text,
  valor_solicitado numeric,
  classe_resultado text,
  reason_code text,
  reason_message text,
  created_date timestamptz,
  metadata jsonb
)
language sql
stable
as $$
  select
    pve.id,
    pve.empresa_id,
    pve.carteira_conta_id,
    pve.obrigacao_id,
    ofn.status,
    pve.cobranca_financeira_id,
    cf.status,
    pve.carteira_movimento_id,
    cm.tipo,
    pve.operacao_idempotencia,
    pve.source_key,
    pve.forma_pagamento,
    pve.origem_operacional,
    pve.valor_solicitado,
    pve.classe_resultado,
    pve.reason_code,
    pve.reason_message,
    pve.created_date,
    pve.metadata
  from public.pagamento_v2_execucao pve
  left join public.obrigacao_financeira ofn on ofn.id = pve.obrigacao_id
  left join public.cobranca_financeira cf on cf.id = pve.cobranca_financeira_id
  left join public.carteira_movimento cm on cm.id = pve.carteira_movimento_id
  where pve.empresa_id = p_empresa_id
  order by pve.created_date desc, pve.id desc
  limit greatest(coalesce(p_limit, 100), 1);
$$;
