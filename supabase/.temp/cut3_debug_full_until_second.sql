begin;

select public.finance_ensure_wallet_feature_flags();
select public.finance_ensure_payment_v2_feature_flags();
select public.finance_ensure_payment_v2_reversal_feature_flags();

update public.app_config
set value = jsonb_build_object('enabled', true), updated_date = now()
where key in ('finance.wallet_account_enabled','finance.wallet_ledger_enabled','finance.payment_v2_write_enabled','finance.payment_v2_reversal_enabled')
  and empresa_id = 'empresa_demo';

with carteira as (
  select cc.id as carteira_conta_id
  from public.carteira_conta cc
  where cc.empresa_id = 'empresa_demo'
  order by cc.created_date asc, cc.id asc
  limit 1
)
insert into public.appointment (id,empresa_id,service_type,status,observacoes,data_hora_entrada,data_referencia,source_type,charge_type,valor_previsto,linked_checkin_id,source_key,metadata)
select 'debug-full-cut3-appointment','empresa_demo','banho','concluido','debug',now(),current_date,'teste_sql','avulso',90.00,'debug-full-cut3-checkin','debug-full-cut3-appointment',jsonb_build_object('test_scope','debug_full_cut3')
where not exists (select 1 from public.appointment where id='debug-full-cut3-appointment');

insert into public.checkins (id,empresa_id,appointment_id,service_type,status,checkin_datetime,metadata)
values ('debug-full-cut3-checkin','empresa_demo','debug-full-cut3-appointment','banho','presente',now(),jsonb_build_object('test_scope','debug_full_cut3'));

insert into public.serviceprovided (id,empresa_id,appointment_id,checkin_id,service_type,preco,quantidade,valor_cobrado,status,status_pagamento,observacoes,data_utilizacao,source_type,charge_type,source_key,metadata)
values ('debug-full-cut3-service','empresa_demo','debug-full-cut3-appointment','debug-full-cut3-checkin','banho',90.00,1,90.00,'registrado','pendente','debug',current_date,'teste_sql','avulso','debug-full-cut3-service',jsonb_build_object('test_scope','debug_full_cut3'));

with carteira as (
  select cc.id as carteira_conta_id
  from public.carteira_conta cc
  where cc.empresa_id = 'empresa_demo'
  order by cc.created_date asc, cc.id asc
  limit 1
)
insert into public.obrigacao_financeira (id,empresa_id,carteira_conta_id,appointment_id,tipo_origem,tipo_item,source_key,descricao,service_date,due_date,valor_original,valor_final,valor_em_aberto,status,metadata)
select 'debug-full-cut3-obrigacao','empresa_demo',carteira.carteira_conta_id,'debug-full-cut3-appointment','agendamento','servico_avulso','debug-full-cut3-obrigacao','debug',current_date,current_date,90.00,90.00,90.00,'aberta',jsonb_build_object('test_scope','debug_full_cut3')
from carteira;

with carteira as (
  select cc.id as carteira_conta_id
  from public.carteira_conta cc
  where cc.empresa_id = 'empresa_demo'
  order by cc.created_date asc, cc.id asc
  limit 1
)
insert into public.cobranca_financeira (id,empresa_id,carteira_conta_id,source_key,tipo,descricao,due_date,valor_total,valor_em_aberto,status,metadata)
select 'debug-full-cut3-cobranca','empresa_demo',carteira.carteira_conta_id,'debug-full-cut3-cobranca','agendamento_confirmado','debug',current_date,90.00,90.00,'aberta',jsonb_build_object('test_scope','debug_full_cut3')
from carteira;

insert into public.cobranca_item (id,empresa_id,cobranca_financeira_id,obrigacao_id,valor,ordem,metadata)
values ('debug-full-cut3-item','empresa_demo','debug-full-cut3-cobranca','debug-full-cut3-obrigacao',90.00,1,jsonb_build_object('test_scope','debug_full_cut3'));

insert into public.conta_receber (id,empresa_id,appointment_id,descricao,servico,valor,vencimento,status,observacoes,origem,tipo_agendamento,tipo_cobranca,data_prestacao,source_key,metadata)
values ('debug-full-cut3-conta','empresa_demo','debug-full-cut3-appointment','debug','banho',90.00,current_date,'pendente','debug','payment_v2_seed','agendamento_solto','avulso',current_date,'debug-full-cut3-conta',jsonb_build_object('test_scope','debug_full_cut3'));

select 'partial' as step, * from public.finance_payment_v2_execute(
  p_empresa_id := 'empresa_demo',
  p_carteira_conta_id := (select cc.id from public.carteira_conta cc where cc.empresa_id = 'empresa_demo' order by cc.created_date asc, cc.id asc limit 1),
  p_obrigacao_id := 'debug-full-cut3-obrigacao',
  p_cobranca_financeira_id := 'debug-full-cut3-cobranca',
  p_operacao_idempotencia := 'debug-full-cut3-partial',
  p_source_key := 'debug-full-cut3-source-partial',
  p_valor := 45.00,
  p_data_pagamento := current_date,
  p_forma_pagamento := 'pix',
  p_origem_operacional := 'teste_sql',
  p_metadata := jsonb_build_object('test_scope','debug_full_cut3_partial')
);

select 'success' as step, * from public.finance_payment_v2_execute(
  p_empresa_id := 'empresa_demo',
  p_carteira_conta_id := (select cc.id from public.carteira_conta cc where cc.empresa_id = 'empresa_demo' order by cc.created_date asc, cc.id asc limit 1),
  p_obrigacao_id := 'debug-full-cut3-obrigacao',
  p_cobranca_financeira_id := 'debug-full-cut3-cobranca',
  p_operacao_idempotencia := 'debug-full-cut3-success',
  p_source_key := 'debug-full-cut3-source-success',
  p_valor := 90.00,
  p_data_pagamento := current_date,
  p_forma_pagamento := 'pix',
  p_origem_operacional := 'teste_sql',
  p_metadata := jsonb_build_object('test_scope','debug_full_cut3_success')
);

select 'retry' as step, * from public.finance_payment_v2_execute(
  p_empresa_id := 'empresa_demo',
  p_carteira_conta_id := (select cc.id from public.carteira_conta cc where cc.empresa_id = 'empresa_demo' order by cc.created_date asc, cc.id asc limit 1),
  p_obrigacao_id := 'debug-full-cut3-obrigacao',
  p_cobranca_financeira_id := 'debug-full-cut3-cobranca',
  p_operacao_idempotencia := 'debug-full-cut3-success',
  p_source_key := 'debug-full-cut3-source-success',
  p_valor := 90.00,
  p_data_pagamento := current_date,
  p_forma_pagamento := 'pix',
  p_origem_operacional := 'teste_sql',
  p_metadata := jsonb_build_object('test_scope','debug_full_cut3_retry')
);

select 'second' as step, * from public.finance_payment_v2_execute(
  p_empresa_id := 'empresa_demo',
  p_carteira_conta_id := (select cc.id from public.carteira_conta cc where cc.empresa_id = 'empresa_demo' order by cc.created_date asc, cc.id asc limit 1),
  p_obrigacao_id := 'debug-full-cut3-obrigacao',
  p_cobranca_financeira_id := 'debug-full-cut3-cobranca',
  p_operacao_idempotencia := 'debug-full-cut3-second',
  p_source_key := 'debug-full-cut3-source-success',
  p_valor := 90.00,
  p_data_pagamento := current_date,
  p_forma_pagamento := 'pix',
  p_origem_operacional := 'teste_sql',
  p_metadata := jsonb_build_object('test_scope','debug_full_cut3_second')
);

rollback;
