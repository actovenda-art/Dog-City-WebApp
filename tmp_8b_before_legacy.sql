select
  to_regclass('public.transaction') as transaction_table,
  to_regclass('public.scheduledtransaction') as scheduledtransaction_table,
  to_regclass('public.conta_receber') as conta_receber_table;
