select
  key,
  empresa_id,
  value ->> 'enabled' as enabled
from public.app_config
where key = 'finance.payment_v2_write_enabled'
  and (empresa_id = 'empresa_demo' or empresa_id is null)
order by key, empresa_id nulls first;

select *
from public.finance_payment_v2_execution_audit('empresa_demo', 200)
order by created_date desc, execucao_id desc;
