select key, empresa_id, value->>'enabled' as enabled
from public.app_config
where key in (
  'finance.cockpit_v2_enabled',
  'finance.cockpit_v2_compare_enabled',
  'finance.financial_alerts_v2_enabled',
  'finance.legacy_cockpit_finance_disabled'
)
and empresa_id = 'empresa_demo'
order by key;
