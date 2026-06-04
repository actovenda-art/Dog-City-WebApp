begin;

select public.finance_ensure_wallet_feature_flags();
select public.finance_ensure_payment_v2_feature_flags();

do $$
declare
  v_empresa_id text := 'empresa_demo';
  v_obrigacao record;
  v_result record;
  v_retry record;
  v_disabled record;
  v_audit_count integer := 0;
  v_operacao_id text := 'test-payment-v2-sprint9b1-cut1';
  v_seed_carteira_conta_id text := null;
  v_seed_appointment_id text := 'test-payment-v2-cut1-appointment';
  v_seed_obrigacao_id text := 'test-payment-v2-cut1-obrigacao';
  v_seed_cobranca_id text := 'test-payment-v2-cut1-cobranca';
  v_seed_item_id text := 'test-payment-v2-cut1-cobranca-item';
begin
  if exists (
    select 1
    from public.app_config cfg
    where cfg.key = 'finance.payment_v2_write_enabled'
      and cfg.empresa_id = v_empresa_id
      and coalesce((cfg.value ->> 'enabled')::boolean, false) = true
  ) then
    raise exception 'finance.payment_v2_write_enabled deveria nascer desligada por empresa.';
  end if;

  select
    ofn.id as obrigacao_id,
    ofn.carteira_conta_id,
    round(ofn.valor_em_aberto, 2) as valor,
    charge.cobranca_financeira_id
  into v_obrigacao
  from public.obrigacao_financeira ofn
  left join lateral (
    select cf.id as cobranca_financeira_id
    from public.cobranca_financeira cf
    join public.cobranca_item ci
      on ci.cobranca_financeira_id = cf.id
     and ci.obrigacao_id = ofn.id
    where cf.empresa_id = ofn.empresa_id
      and cf.carteira_conta_id = ofn.carteira_conta_id
      and cf.status in ('aberta','parcial','vencida')
      and round(coalesce(cf.valor_em_aberto, 0), 2) = round(coalesce(ofn.valor_em_aberto, 0), 2)
    group by cf.id, cf.valor_em_aberto, cf.status, cf.created_date
    having count(*) = 1
    order by cf.created_date asc, cf.id asc
    limit 1
  ) charge on true
  where ofn.empresa_id = v_empresa_id
    and ofn.status in ('aberta','parcial','vencida')
    and round(coalesce(ofn.valor_em_aberto, 0), 2) > 0
  order by
    case when charge.cobranca_financeira_id is not null then 0 else 1 end,
    ofn.created_date asc nulls last,
    ofn.id asc
  limit 1;

  if not found then
    select cc.id
      into v_seed_carteira_conta_id
    from public.carteira_conta cc
    where cc.empresa_id = v_empresa_id
    order by cc.created_date asc, cc.id asc
    limit 1;

    if v_seed_carteira_conta_id is null then
      raise exception 'Nenhuma carteira_conta encontrada para seed controlada em empresa_id=%.', v_empresa_id;
    end if;

    insert into public.appointment (
      id,
      empresa_id,
      service_type,
      status,
      observacoes,
      data_referencia,
      source_type,
      charge_type,
      valor_previsto,
      source_key,
      metadata
    )
    values (
      v_seed_appointment_id,
      v_empresa_id,
      'banho',
      'agendado',
      'Seed controlada para teste Payment V2 Corte 1',
      current_date,
      'teste_sql',
      'avulso',
      125.00,
      'test-payment-v2-cut1-appointment',
      jsonb_build_object('test_scope', 'sprint9b1_cut1_seed')
    );

    insert into public.obrigacao_financeira (
      id,
      empresa_id,
      carteira_conta_id,
      appointment_id,
      tipo_origem,
      tipo_item,
      source_key,
      descricao,
      service_date,
      due_date,
      valor_original,
      valor_final,
      valor_em_aberto,
      status,
      metadata
    )
    values (
      v_seed_obrigacao_id,
      v_empresa_id,
      v_seed_carteira_conta_id,
      v_seed_appointment_id,
      'agendamento',
      'servico_avulso',
      'test-payment-v2-cut1-obrigacao',
      'Seed controlada Payment V2 Corte 1',
      current_date,
      current_date,
      125.00,
      125.00,
      125.00,
      'aberta',
      jsonb_build_object('test_scope', 'sprint9b1_cut1_seed')
    );

    insert into public.cobranca_financeira (
      id,
      empresa_id,
      carteira_conta_id,
      source_key,
      tipo,
      descricao,
      due_date,
      valor_total,
      valor_em_aberto,
      status,
      metadata
    )
    values (
      v_seed_cobranca_id,
      v_empresa_id,
      v_seed_carteira_conta_id,
      'test-payment-v2-cut1-cobranca',
      'agendamento_confirmado',
      'Seed controlada Payment V2 Corte 1',
      current_date,
      125.00,
      125.00,
      'aberta',
      jsonb_build_object('test_scope', 'sprint9b1_cut1_seed')
    );

    insert into public.cobranca_item (
      id,
      empresa_id,
      cobranca_financeira_id,
      obrigacao_id,
      valor,
      ordem,
      metadata
    )
    values (
      v_seed_item_id,
      v_empresa_id,
      v_seed_cobranca_id,
      v_seed_obrigacao_id,
      125.00,
      1,
      jsonb_build_object('test_scope', 'sprint9b1_cut1_seed')
    );

    select
      v_seed_obrigacao_id as obrigacao_id,
      v_seed_carteira_conta_id as carteira_conta_id,
      125.00::numeric as valor,
      v_seed_cobranca_id as cobranca_financeira_id
    into v_obrigacao;
  end if;

  select *
    into v_disabled
  from public.finance_payment_v2_execute(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_obrigacao.carteira_conta_id,
    p_obrigacao_id := v_obrigacao.obrigacao_id,
    p_cobranca_financeira_id := v_obrigacao.cobranca_financeira_id,
    p_operacao_idempotencia := v_operacao_id || '-disabled',
    p_source_key := 'sql-test|payment-v2|disabled',
    p_valor := v_obrigacao.valor,
    p_data_pagamento := current_date,
    p_forma_pagamento := 'dinheiro',
    p_origem_operacional := 'teste_sql',
    p_metadata := jsonb_build_object('test_scope', 'sprint9b1_cut1_disabled')
  );

  if v_disabled.classe_resultado <> 'rejeitado_negocio'
     or v_disabled.reason_code <> 'payment_v2_write_disabled' then
    raise exception 'Execucao com flag desligada deveria rejeitar com payment_v2_write_disabled, obtido classe=% reason=%.',
      v_disabled.classe_resultado,
      v_disabled.reason_code;
  end if;

  update public.app_config
  set value = jsonb_build_object('enabled', true),
      updated_date = now()
  where key in (
      'finance.wallet_account_enabled',
      'finance.wallet_ledger_enabled',
      'finance.payment_v2_write_enabled'
    )
    and empresa_id = v_empresa_id;

  select *
    into v_result
  from public.finance_payment_v2_execute(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_obrigacao.carteira_conta_id,
    p_obrigacao_id := v_obrigacao.obrigacao_id,
    p_cobranca_financeira_id := v_obrigacao.cobranca_financeira_id,
    p_operacao_idempotencia := v_operacao_id,
    p_source_key := 'sql-test|payment-v2|success',
    p_valor := v_obrigacao.valor,
    p_data_pagamento := current_date,
    p_forma_pagamento := 'dinheiro',
    p_origem_operacional := 'teste_sql',
    p_metadata := jsonb_build_object('test_scope', 'sprint9b1_cut1_success')
  );

  if v_result.classe_resultado <> 'executado' then
    raise exception 'Primeira execucao deveria retornar executado, obtido %.', v_result.classe_resultado;
  end if;

  if v_result.carteira_movimento_id is null then
    raise exception 'Execucao bem-sucedida deveria gerar carteira_movimento.';
  end if;

  if not exists (
    select 1
    from public.carteira_movimento cm
    where cm.id = v_result.carteira_movimento_id
      and cm.origem = 'payment_v2'
      and cm.operacao_idempotencia = v_operacao_id
  ) then
    raise exception 'carteira_movimento do Payment V2 nao encontrado ou inconsistente.';
  end if;

  if not exists (
    select 1
    from public.obrigacao_financeira ofn
    where ofn.id = v_obrigacao.obrigacao_id
      and ofn.status = 'quitada'
      and round(coalesce(ofn.valor_em_aberto, 0), 2) = 0
  ) then
    raise exception 'Obrigacao deveria estar quitada apos a execucao do Payment V2.';
  end if;

  select *
    into v_retry
  from public.finance_payment_v2_execute(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_obrigacao.carteira_conta_id,
    p_obrigacao_id := v_obrigacao.obrigacao_id,
    p_cobranca_financeira_id := v_obrigacao.cobranca_financeira_id,
    p_operacao_idempotencia := v_operacao_id,
    p_source_key := 'sql-test|payment-v2|success',
    p_valor := v_obrigacao.valor,
    p_data_pagamento := current_date,
    p_forma_pagamento := 'dinheiro',
    p_origem_operacional := 'teste_sql',
    p_metadata := jsonb_build_object('test_scope', 'sprint9b1_cut1_retry')
  );

  if v_retry.classe_resultado <> 'idempotente_reutilizado'
     or coalesce(v_retry.reused, false) is not true then
    raise exception 'Retry deveria retornar idempotente_reutilizado com reused=true, obtido classe=% reused=%.',
      v_retry.classe_resultado,
      v_retry.reused;
  end if;

  select count(*)::integer
    into v_audit_count
  from public.finance_payment_v2_execution_audit(v_empresa_id, 100) audit
  where audit.operacao_idempotencia = v_operacao_id;

  if v_audit_count < 1 then
    raise exception 'Auditoria do Payment V2 deveria retornar ao menos uma linha para a operacao %. ', v_operacao_id;
  end if;
end;
$$;

rollback;
