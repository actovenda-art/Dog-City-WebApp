begin;

update public.app_config
set value = jsonb_build_object('enabled', true),
    updated_date = now()
where key in (
  'finance.wallet_account_enabled',
  'finance.wallet_ledger_enabled'
)
and (
  empresa_id is null
  or empresa_id in ('empresa_demo', '992c8aa3-8c11-44a6-87fc-0346725f4980')
);

select public.finance_ensure_wallet_feature_flags();
select public.finance_ensure_payment_v2_feature_flags();

do $$
declare
  v_empresa_id text := 'empresa_demo';
  v_seed_carteira_conta_id text := null;
  v_appointment_id text := 'final-rollout-payment-wallet-appointment';
  v_obrigacao_id text := 'final-rollout-payment-wallet-obrigacao';
  v_cobranca_id text := 'final-rollout-payment-wallet-cobranca';
  v_cobranca_item_id text := 'final-rollout-payment-wallet-cobranca-item';
  v_result record;
  v_retry record;
begin
  select cc.id
    into v_seed_carteira_conta_id
  from public.carteira_conta cc
  where cc.empresa_id = v_empresa_id
  order by cc.created_date asc, cc.id asc
  limit 1;

  if v_seed_carteira_conta_id is null then
    raise exception 'Nenhuma carteira_conta encontrada para diagnostico final do rollout em empresa_id=%.', v_empresa_id;
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
    'Diagnostico wallet flags + Payment V2',
    current_date,
    'teste_sql',
    'avulso',
    125.00,
    'final-rollout-payment-wallet-appointment',
    jsonb_build_object('test_scope', 'final_rollout_payment_wallet')
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
    'final-rollout-payment-wallet-obrigacao',
    'Diagnostico wallet flags + Payment V2',
    current_date,
    current_date,
    125.00,
    125.00,
    125.00,
    'aberta',
    jsonb_build_object('test_scope', 'final_rollout_payment_wallet')
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
    'final-rollout-payment-wallet-cobranca',
    'agendamento_confirmado',
    'Diagnostico wallet flags + Payment V2',
    current_date,
    125.00,
    125.00,
    'aberta',
    jsonb_build_object('test_scope', 'final_rollout_payment_wallet')
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
    jsonb_build_object('test_scope', 'final_rollout_payment_wallet')
  );

  select *
    into v_result
  from public.finance_payment_v2_execute(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_seed_carteira_conta_id,
    p_obrigacao_id := v_obrigacao_id,
    p_cobranca_financeira_id := v_cobranca_id,
    p_operacao_idempotencia := 'final-rollout-payment-wallet-execute',
    p_source_key := 'sql-test|final-rollout|payment|wallet',
    p_valor := 125.00,
    p_data_pagamento := current_date,
    p_forma_pagamento := 'dinheiro',
    p_origem_operacional := 'teste_sql',
    p_metadata := jsonb_build_object('test_scope', 'final_rollout_payment_wallet')
  );

  if v_result.classe_resultado <> 'executado' then
    raise exception 'Com wallet flags ligadas, Payment V2 deveria executar. classe=% reason=% / %.',
      v_result.classe_resultado,
      v_result.reason_code,
      v_result.reason_message;
  end if;

  select *
    into v_retry
  from public.finance_payment_v2_execute(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_seed_carteira_conta_id,
    p_obrigacao_id := v_obrigacao_id,
    p_cobranca_financeira_id := v_cobranca_id,
    p_operacao_idempotencia := 'final-rollout-payment-wallet-execute',
    p_source_key := 'sql-test|final-rollout|payment|wallet',
    p_valor := 125.00,
    p_data_pagamento := current_date,
    p_forma_pagamento := 'dinheiro',
    p_origem_operacional := 'teste_sql',
    p_metadata := jsonb_build_object('test_scope', 'final_rollout_payment_wallet_retry')
  );

  if v_retry.classe_resultado <> 'idempotente_reutilizado' then
    raise exception 'Com wallet flags ligadas, retry deveria reutilizar resultado. classe=% reason=% / %.',
      v_retry.classe_resultado,
      v_retry.reason_code,
      v_retry.reason_message;
  end if;
end;
$$;

rollback;
