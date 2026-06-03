select key, empresa_id, value->>'enabled' as enabled
from public.app_config
where key in ('finance.payment_v2_write_enabled','finance.payment_v2_reversal_enabled')
  and (empresa_id = 'empresa_demo' or empresa_id is null)
order by key, empresa_id nulls first;
