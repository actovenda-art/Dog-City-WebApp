begin;

select public.finance_ensure_wallet_feature_flags();
select public.finance_ensure_payment_v2_feature_flags();

update public.app_config
set value = jsonb_build_object('enabled', true),
    updated_date = now()
where key in (
    'finance.wallet_account_enabled',
    'finance.wallet_ledger_enabled',
    'finance.payment_v2_write_enabled'
  )
  and empresa_id = 'empresa_demo';

with carteira as (
  select cc.id as carteira_conta_id
  from public.carteira_conta cc
  where cc.empresa_id = 'empresa_demo'
  order by cc.created_date asc, cc.id asc
  limit 1
)
insert into public.appointment (
  id, empresa_id, service_type, status, observacoes, data_referencia, source_type, charge_type, valor_previsto, source_key, metadata
)
select
  'debug-cut3-appointment', 'empresa_demo', 'banho', 'agendado', 'debug', current_date, 'teste_sql', 'avulso', 90.00, 'debug-cut3-appointment', jsonb_build_object('test_scope', 'debug_cut3')
where not exists (select 1 from public.appointment where id = 'debug-cut3-appointment');

with carteira as (
  select cc.id as carteira_conta_id
  from public.carteira_conta cc
  where cc.empresa_id = 'empresa_demo'
  order by cc.created_date asc, cc.id asc
  limit 1
)
insert into public.obrigacao_financeira (
  id, empresa_id, carteira_conta_id, appointment_id, tipo_origem, tipo_item, source_key, descricao, service_date, due_date, valor_original, valor_final, valor_em_aberto, status, metadata
)
select
  'debug-cut3-obrigacao', 'empresa_demo', carteira.carteira_conta_id, 'debug-cut3-appointment', 'agendamento', 'servico_avulso', 'debug-cut3-obrigacao', 'debug', current_date, current_date, 90.00, 90.00, 90.00, 'aberta', jsonb_build_object('test_scope', 'debug_cut3')
from carteira;

with carteira as (
  select cc.id as carteira_conta_id
  from public.carteira_conta cc
  where cc.empresa_id = 'empresa_demo'
  order by cc.created_date asc, cc.id asc
  limit 1
)
insert into public.cobranca_financeira (
  id, empresa_id, carteira_conta_id, source_key, tipo, descricao, due_date, valor_total, valor_em_aberto, status, metadata
)
select
  'debug-cut3-cobranca', 'empresa_demo', carteira.carteira_conta_id, 'debug-cut3-cobranca', 'agendamento_confirmado', 'debug', current_date, 90.00, 90.00, 'aberta', jsonb_build_object('test_scope', 'debug_cut3')
from carteira;

insert into public.cobranca_item (
  id, empresa_id, cobranca_financeira_id, obrigacao_id, valor, ordem, metadata
)
values (
  'debug-cut3-item', 'empresa_demo', 'debug-cut3-cobranca', 'debug-cut3-obrigacao', 90.00, 1, jsonb_build_object('test_scope', 'debug_cut3')
);

select * from public.finance_payment_v2_execute(
  p_empresa_id := 'empresa_demo',
  p_carteira_conta_id := (select carteira_conta_id from (select cc.id as carteira_conta_id from public.carteira_conta cc where cc.empresa_id = 'empresa_demo' order by cc.created_date asc, cc.id asc limit 1) t),
  p_obrigacao_id := 'debug-cut3-obrigacao',
  p_cobranca_financeira_id := 'debug-cut3-cobranca',
  p_operacao_idempotencia := 'debug-cut3-success',
  p_source_key := 'debug-cut3-source',
  p_valor := 90.00,
  p_data_pagamento := current_date,
  p_forma_pagamento := 'pix',
  p_origem_operacional := 'teste_sql',
  p_metadata := jsonb_build_object('test_scope', 'debug_cut3_success')
);

select * from public.finance_payment_v2_execute(
  p_empresa_id := 'empresa_demo',
  p_carteira_conta_id := (select carteira_conta_id from (select cc.id as carteira_conta_id from public.carteira_conta cc where cc.empresa_id = 'empresa_demo' order by cc.created_date asc, cc.id asc limit 1) t),
  p_obrigacao_id := 'debug-cut3-obrigacao',
  p_cobranca_financeira_id := 'debug-cut3-cobranca',
  p_operacao_idempotencia := 'debug-cut3-second',
  p_source_key := 'debug-cut3-source',
  p_valor := 90.00,
  p_data_pagamento := current_date,
  p_forma_pagamento := 'pix',
  p_origem_operacional := 'teste_sql',
  p_metadata := jsonb_build_object('test_scope', 'debug_cut3_second')
);

rollback;
