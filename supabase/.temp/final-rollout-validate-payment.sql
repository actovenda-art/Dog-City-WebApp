begin;

select public.finance_ensure_wallet_feature_flags();
select public.finance_ensure_payment_v2_feature_flags();

do $$
declare
  v_empresa_id text := 'empresa_demo';
  v_seed_carteira_conta_id text := null;
  v_appointment_id text := 'final-rollout-payment-appointment';
  v_obrigacao_id text := 'final-rollout-payment-obrigacao';
  v_cobranca_id text := 'final-rollout-payment-cobranca';
  v_cobranca_item_id text := 'final-rollout-payment-cobranca-item';
  v_result record;
  v_retry record;
  v_audit_count integer := 0;
begin
  select cc.id
    into v_seed_carteira_conta_id
  from public.carteira_conta cc
  where cc.empresa_id = v_empresa_id
  order by cc.created_date asc, cc.id asc
  limit 1;

  if v_seed_carteira_conta_id is null then
    raise exception 'Nenhuma carteira_conta encontrada para validacao final do rollout em empresa_id=%.', v_empresa_id;
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
    v_appointment_id,
    v_empresa_id,
    'banho',
    'agendado',
    'Seed controlada para validacao final de rollout Payment V2',
    current_date,
    'teste_sql',
    'avulso',
    125.00,
    'final-rollout-payment-appointment',
    jsonb_build_object('test_scope', 'final_rollout_payment')
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
    v_obrigacao_id,
    v_empresa_id,
    v_seed_carteira_conta_id,
    v_appointment_id,
    'agendamento',
    'servico_avulso',
    'final-rollout-payment-obrigacao',
    'Seed controlada Payment V2 rollout final',
    current_date,
    current_date,
    125.00,
    125.00,
    125.00,
    'aberta',
    jsonb_build_object('test_scope', 'final_rollout_payment')
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
    v_cobranca_id,
    v_empresa_id,
    v_seed_carteira_conta_id,
    'final-rollout-payment-cobranca',
    'agendamento_confirmado',
    'Seed controlada Payment V2 rollout final',
    current_date,
    125.00,
    125.00,
    'aberta',
    jsonb_build_object('test_scope', 'final_rollout_payment')
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
    v_cobranca_item_id,
    v_empresa_id,
    v_cobranca_id,
    v_obrigacao_id,
    125.00,
    1,
    jsonb_build_object('test_scope', 'final_rollout_payment')
  );

  select *
    into v_result
  from public.finance_payment_v2_execute(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_seed_carteira_conta_id,
    p_obrigacao_id := v_obrigacao_id,
    p_cobranca_financeira_id := v_cobranca_id,
    p_operacao_idempotencia := 'final-rollout-payment-execute',
    p_source_key := 'sql-test|final-rollout|payment',
    p_valor := 125.00,
    p_data_pagamento := current_date,
    p_forma_pagamento := 'dinheiro',
    p_origem_operacional := 'teste_sql',
    p_metadata := jsonb_build_object('test_scope', 'final_rollout_payment')
  );

  if v_result.classe_resultado <> 'executado' then
    raise exception 'Payment V2 deveria executar apos ativacao, obtido %.', v_result.classe_resultado;
  end if;

  if v_result.carteira_movimento_id is null then
    raise exception 'Payment V2 ativado deveria gerar carteira_movimento.';
  end if;

  select *
    into v_retry
  from public.finance_payment_v2_execute(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_seed_carteira_conta_id,
    p_obrigacao_id := v_obrigacao_id,
    p_cobranca_financeira_id := v_cobranca_id,
    p_operacao_idempotencia := 'final-rollout-payment-execute',
    p_source_key := 'sql-test|final-rollout|payment',
    p_valor := 125.00,
    p_data_pagamento := current_date,
    p_forma_pagamento := 'dinheiro',
    p_origem_operacional := 'teste_sql',
    p_metadata := jsonb_build_object('test_scope', 'final_rollout_payment_retry')
  );

  if v_retry.classe_resultado <> 'idempotente_reutilizado' then
    raise exception 'Retry do Payment V2 deveria reutilizar resultado, obtido %.', v_retry.classe_resultado;
  end if;

  if v_retry.carteira_movimento_id is distinct from v_result.carteira_movimento_id then
    raise exception 'Retry idempotente nao deveria gerar novo carteira_movimento.';
  end if;

  if not exists (
    select 1
    from public.obrigacao_financeira ofn
    where ofn.id = v_obrigacao_id
      and ofn.status = 'quitada'
      and round(coalesce(ofn.valor_em_aberto, 0), 2) = 0
  ) then
    raise exception 'Obrigacao deveria ficar quitada apos o pagamento.';
  end if;

  select count(*)::integer
    into v_audit_count
  from public.finance_payment_v2_execution_audit(v_empresa_id, 200) audit
  where audit.operacao_idempotencia = 'final-rollout-payment-execute';

  if v_audit_count < 1 then
    raise exception 'Auditoria do Payment V2 deveria retornar ao menos uma linha apos a ativacao.';
  end if;
end;
$$;

rollback;
