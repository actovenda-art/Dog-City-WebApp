select key, (value->>'enabled')::boolean as enabled
from public.app_config
where empresa_id = 'empresa_demo'
  and key in (
    'finance.cockpit_v2_enabled',
    'finance.cockpit_v2_compare_enabled',
    'finance.financial_alerts_v2_enabled',
    'finance.legacy_cockpit_finance_disabled'
  )
order by key;
