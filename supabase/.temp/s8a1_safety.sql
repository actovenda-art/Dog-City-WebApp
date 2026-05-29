select count(*) as legacy_disabled_true_count
from public.app_config
where key = 'finance.legacy_cockpit_finance_disabled'
  and empresa_id = 'empresa_demo'
  and coalesce((value->>'enabled')::boolean, false) = true;

select to_regclass('public."transaction"') as transaction_table,
       to_regclass('public.scheduledtransaction') as scheduledtransaction_table,
       to_regclass('public.conta_receber') as conta_receber_table;
