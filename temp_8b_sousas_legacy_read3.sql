select
  to_regclass('public.transaction') as transaction_table,
  to_regclass('public.scheduledtransaction') as scheduledtransaction_table,
  to_regclass('public.conta_receber') as conta_receber_table,
  (select count(*) from public."transaction" t where coalesce(t.empresa_id, t.meta->>'empresa_id') = '992c8aa3-8c11-44a6-87fc-0346725f4980') as legacy_transactions_total,
  (select count(*) from public.scheduledtransaction st where st.empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980') as legacy_scheduled_total,
  (select count(*) from public.conta_receber cr where cr.empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980') as legacy_conta_receber_total;
