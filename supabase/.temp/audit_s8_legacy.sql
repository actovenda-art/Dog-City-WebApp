select
  to_regclass('public."transaction"') as transaction_table,
  to_regclass('public.scheduledtransaction') as scheduledtransaction_table,
  to_regclass('public.conta_receber') as conta_receber_table,
  (select count(*) from public."transaction") as legacy_transactions_total,
  (select count(*) from public.scheduledtransaction) as legacy_scheduled_total,
  (select count(*) from public.conta_receber) as legacy_conta_receber_total,
  (select count(*) from public.app_config where key = 'finance.legacy_cockpit_finance_disabled' and coalesce((value->>'enabled')::boolean, false) = true) as legacy_disabled_true_count;
