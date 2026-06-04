begin;
select public.finance_ensure_wallet_feature_flags();
select public.finance_ensure_payment_v2_feature_flags();
update public.app_config
set value = jsonb_build_object('enabled', true), updated_date = now()
where key in ('finance.wallet_account_enabled','finance.wallet_ledger_enabled','finance.payment_v2_write_enabled')
  and empresa_id = 'empresa_demo';

insert into public.appointment (
  id, empresa_id, service_type, status, observacoes, data_referencia, source_type, charge_type, valor_previsto, source_key, metadata
) values (
  'debug-payment-v2-appointment', 'empresa_demo', 'banho', 'agendado', 'debug', current_date, 'teste_sql', 'avulso', 125.00, 'debug-payment-v2-appointment', '{}'::jsonb
);

insert into public.obrigacao_financeira (
  id, empresa_id, carteira_conta_id, appointment_id, tipo_origem, tipo_item, source_key, descricao, service_date, due_date, valor_original, valor_final, valor_em_aberto, status, metadata
) values (
  'debug-payment-v2-obrigacao', 'empresa_demo', '319b6a79-fbc8-4513-8f80-6f5db457ae50', 'debug-payment-v2-appointment', 'agendamento', 'servico_avulso', 'debug-payment-v2-obrigacao', 'debug', current_date, current_date, 125.00, 125.00, 125.00, 'aberta', '{}'::jsonb
);

insert into public.cobranca_financeira (
  id, empresa_id, carteira_conta_id, source_key, tipo, descricao, due_date, valor_total, valor_em_aberto, status, metadata
) values (
  'debug-payment-v2-cobranca', 'empresa_demo', '319b6a79-fbc8-4513-8f80-6f5db457ae50', 'debug-payment-v2-cobranca', 'agendamento_confirmado', 'debug', current_date, 125.00, 125.00, 'aberta', '{}'::jsonb
);

insert into public.cobranca_item (
  id, empresa_id, cobranca_financeira_id, obrigacao_id, valor, ordem, metadata
) values (
  'debug-payment-v2-cobranca-item', 'empresa_demo', 'debug-payment-v2-cobranca', 'debug-payment-v2-obrigacao', 125.00, 1, '{}'::jsonb
);

select * from public.finance_payment_v2_execute(
  p_empresa_id := 'empresa_demo',
  p_carteira_conta_id := '319b6a79-fbc8-4513-8f80-6f5db457ae50',
  p_obrigacao_id := 'debug-payment-v2-obrigacao',
  p_cobranca_financeira_id := 'debug-payment-v2-cobranca',
  p_operacao_idempotencia := 'debug-payment-v2-execute',
  p_source_key := 'debug-payment-v2-source',
  p_valor := 125.00,
  p_data_pagamento := current_date,
  p_forma_pagamento := 'dinheiro',
  p_origem_operacional := 'teste_sql',
  p_metadata := jsonb_build_object('debug', true)
);
rollback;
